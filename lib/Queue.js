'use strict';

module.exports = Queue;

var util = require('util');
var events = require('events');
var utils = require('./utils');
var Journal = require('./Journal');
var Scheduler = require('./Scheduler');
var HandlerStore = require('./HandlerStore');
var Runner = require('./Runner');
var Job = require('./Job');
var Store = require('./Store');

var SECONDS = 1000;
var MINUTES = 60 * 1000;
var HOURS = 3600 * 1000;
var DAYS = 24 * 3600 * 1000;

function Queue( sysid, journal, scheduler, jobStore, handlerStore, runner, log ) {
    this.sysid = sysid || '(none)';
    this.journal = journal;
    this.scheduler = scheduler;
    this.store = jobStore;
    this.handlerStore = handlerStore;
    this.runner = runner;
    this.log = log;
    // TODO: pass in options
    this.stats = new events.EventEmitter();
    this.config = {};

    if (!(journal instanceof Journal)) throw new Error('not a Journal');
    if (!(scheduler instanceof Scheduler)) throw new Error('not a Scheduler');
    if (!(jobStore instanceof Store)) throw new Error('not a job Store');
    if (!(handlerStore instanceof HandlerStore)) throw new Error('not a HandlerStore');
    if (!(runner instanceof Runner)) throw new Error('not a Runner');
    if (!(typeof log.error === 'function')) throw new Error('not a log');

    this.configure({
        locks: {
            // TODO: parseTimeInterval() configs
            lockExpireMs: 300000,
            doneJobExpireMs: 14 * DAYS,
            // CAUTION: expring unrun jobs might not always be desirable... make this timeout large
            unrunJobExpireMs: 30 * DAYS,
            retryDurationMs: 6 * HOURS,
        },
        cron: {
            renewLocksInterval: '29s',
            expireLocksInterval: '11s',
            expireJobsInterval: '61s',
        },
        ingest: {
            timeLimitMs: 100,
            readBatchSize: 20,
            ingestTimeoutMs: 2000,
        },
    })
}

Queue.prototype.configure = function configure( userConfig ) {
    var config = utils.merge2(this.config, userConfig);

    if (userConfig.statsEmitter) {
        this.stats = userConfig.statsEmitter;
    }

    // configure cron to run the periodic queue housekeeping tasks
    if (userConfig.cron) {
        var self = this;
        this.cron = new utils.Cron();
        this.cron.schedule(config.cron.renewLocksInterval, function(cb) { self._renewLocks(cb) });
        this.cron.schedule(config.cron.expireLocksInterval, function(cb) { self._expireLocks(cb) });
        this.cron.schedule(config.cron.expireJobsInterval, function(cb) { self._expireJobs(cb) });
    }

    this.emitStats = utils.varargs(function emitStats( argv, self ) {
        argv.unshift('stats');
        utils.invoke(self.stats.emit, argv, self);
    }, this)
}

Queue.prototype.run = function run( options, callback ) {
    var stopTime = Date.now() + (options.timeLimitMs || Infinity);
    var stopCount = options.countLimit || Infinity;

    var self = this;
    utils.repeatUntil(function(done, count) {
        // log each error, but do not stop the flow
        function nextStep(type, err, next) {
// TODO: include the stack trace in the error, to trace internal errors
// if (err) console.log("AR: run err", err);
            if (err) self._logError(type, err);
            next();
        }
        utils.iterateSteps([
// AR: tracer:
function(next) { process.stdout.write('.'); next() },
            function(next) { self.handleDoneJobs(function(err) { nextStep('handleDoneJobs', err, next) }) },
            function(next) { self.runNewJobs(function(err) { nextStep('runNewJobs', err, next) }) },
            function(next) { self.ingestJournal(function(err) { nextStep('ingestJournal', err, next) }) },
            function(next) { self.cron.run(Date.now(), function(err) { nextStep('cron.run', err, next) }) },
            // pause a moment to not chew up 100% cpu
            // TODO: maybe pause only if had no work (though if busy then a 1ms gap between passes is not noticeable)
            function(next) { setTimeout(next, 2) },
        ],
        function(err) {
            done(null, (Date.now() >= stopTime || count + 1 >= stopCount));
        });
    }, callback);
}

Queue.prototype._logError = function _logError( type, err ) {
    this.log.error(type + ' error: ' + err);
}

Queue.prototype.handleDoneJobs = function handleDoneJobs( callback ) {
    var batchSize = 200;
    var self = this;
    utils.repeatUntil(function(done) {
        var stoppedJobs = [], groupedJobs, now = new Date();

        utils.iterateSteps([
            function(next) {
                self.runner.getStoppedJobs(batchSize, next);
            },
            function(next, _stoppedJobs) {
                stoppedJobs = _stoppedJobs;
                groupedJobs = utils.groupByField(stoppedJobs, categorizeStoppedJobs);
                next();
            },
            function(next) {
                var typeCounts = utils.countByField(stoppedJobs, 'type');
                for (var type in typeCounts) self.scheduler.jobsStopped(type, typeCounts[type]);
                next();
            },
            function(next) {
                var now = new Date();
                if (!groupedJobs.retry) return next();
                // only retry jobs until they reach self.config.locks.retryDurationMs
                var retryJobIds = [], abandonJobIds = [];
                for (var i = 0; i < groupedJobs.retry.length; i++) {
                    var job = groupedJobs.retry[i];
                    var createDt = Job.getCreateDt(job);
                    (createDt >= now - self.config.locks.retryDurationMs)
                        ? retryJobIds.push(job.id) : abandonJobIds.push(job.id);
                }
                if (abandonJobIds.length) {
                    self.emitStats('abandonJobs', abandonJobIds);
                    self.log.warn('retry timed out, abandoning jobs', abandonJobIds);
                }
                if (retryJobIds.length) self.emitStats('retryJobs', retryJobIds);
                self.store.releaseJobs(retryJobIds, self.sysid, 'retry', next);
            },
            function(next) {
                if (!groupedJobs.archive) return next();
                var jobIds = utils.selectField(groupedJobs.archive, 'id');
                self.emitStats('archiveJobs', jobIds);
                self.store.releaseJobs(jobIds, self.sysid, 'archive', next);
            },
        ],
        function(err) {
            done(err, stoppedJobs.length < batchSize);
        })
    }, callback);

    function categorizeStoppedJobs(job) { var ix = job.exitcode;
        return (ix >= 200 && ix < 300 || ix >= 400 && ix < 500) ? 'archive' : 'retry'; }
}

Queue.prototype.runNewJobs = function runNewJobs( callback ) {
    var self = this;
    var jobtype, handler;
    utils.iterateSteps([
        function(next) {
            self.store.getWaitingJobcounts(next);
        },
        function(next, typeCounts) {
            next(null, self.scheduler.selectJobtypeToRun(typeCounts));
        },
        function(next, _jobtype) {
            jobtype = _jobtype;
            if (jobtype === undefined) return utils.setImmediate(callback);
            self.handlerStore.getHandler(jobtype, next);
        },
        function(next, _handler) {
            handler = _handler;
            self.store.getJobs(jobtype, self.runner.getBatchSize(jobtype, handler), self.sysid, self.config.locks.lockExpireMs, next);
        },
        function(next, jobs) {
            self.emitStats('runNewJobs', jobtype, jobs.length);
            self.scheduler.jobsStarted(jobtype, jobs.length);
            self.runner.runJobs(jobtype, jobs, handler);
            next();
        },
    ], callback);
}

Queue.prototype._renewLocks = function _renewLocks( callback ) {
    var self = this;
    utils.iterateSteps([
        function(next) {
            self.runner.getRunningJobIds(next);
        },
        function(next, runningJobIds) {
            if (!runningJobIds.length) return next();
            self.emitStats('renewLocks', runningJobIds);
            self.store.renewLocks(runningJobIds, self.sysid, self.config.locks.lockExpireMs, next);
        }
    ], callback)
}

Queue.prototype._expireLocks = function _expireLocks( callback ) {
    this.emitStats('expireLocks');
    this.store.expireLocks(callback);
}

Queue.prototype._expireJobs = function _expireJobs( callback ) {
    var self = this;
    this.emitStats('expireJobs');
    utils.iterateSteps([
        function(next) {
            self.store.expireJobs(null, Store.LOCK_DONE, self.config.locks.doneJobExpireMs, 100000, next);
        },
        function(next) {
            self.store.expireJobs(null, Store.LOCK_NONE, self.config.locks.unrunJobExpireMs, 100000, next);
        },
    ], callback);
}

Queue.prototype.addJobs = function addJobs( jobtype, body, callback ) {
    var lines = Job.dataToLines(this.sysid, jobtype, body.split('\n').filter(function(line) { return line && line[0] !== '#' }));
    var self = this;
    this.journal.write(lines, function(err) {
        self.log.info("journaled %d jobs of type '%s'", lines.length, jobtype);
        if (err) self._logError('addJobs', err);
        callback(err, lines.length);
    });

    // NOTE: try not to double-convert request buffer -> chars -> buffer
    // NOTE: maybe write in batches, eg:
    // this.journal.write('#:Batch date=' + new Date().toISOString() + ',bytes=' + Buffer.byteLength(lines) + ',jobtype=' + jobtype + '\n');
    // this.journal.write(lines);
    // if (lines.length && lines[lines.length - 1] !== '\n') this.journal.write('\n');
    // this.journal.write('#:EndBatch\n');
}

/*
 * Read jobs from the journal and add them to the store.
 */
Queue.prototype.ingestJournal = function ingestJournal( callback ) {
    var config = this.config.ingest;
    var startTime = Date.now();
    var timeLimit = startTime + this.config.ingest.timeLimitMs;

    var self = this, readCount = 0, counts = {};
    utils.repeatUntil(function(done) {
        if (Date.now() > timeLimit) return done(null, true);

        var token, jobs;
        utils.iterateSteps([
            function(next) {
                token = self.journal.readReserve(config.readBatchSize, config.ingestTimeoutMs);
                self.journal.read(token, next);
            },
            function(next, linesArray) {
                if (!linesArray.length) return next('done');
                readCount += linesArray.length;
                jobs = Job.linesToJobs(linesArray, { log: self.log });
                counts = utils.countByField(jobs, 'type');
                self.store.addJobs(jobs, next);
            },
            function(next) {
                var tok = token;
                token = null;
                self.journal.rsync(tok, next);
            },
            function(next) {
// TODO: accumulate the counts, only emit stats at the end
                self.emitStats('ingestJournal', { readCount: readCount, counts: counts });
                next();
            },
        ],
        function(err) {
            if (err && token) self.journal.readCancel(token);
            done(err);
        })
    },
    function(err) {
        if (err === 'done') err = null;
        if (err) self._logError('ingestJournal', err);
        if (readCount) self.log.info("ingested %d journal lines of type(s)", readCount);
        callback(err);
    })
}

Queue.prototype = utils.toStruct(Queue.prototype);
