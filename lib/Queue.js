'use strict';

module.exports = Queue;

var util = require('util');
var events = require('events');
var utils = require('./utils');
var Job = require('./Job');

var SECONDS = 1000;
var MINUTES = 60 * 1000;
var HOURS = 3600 * 1000;
var DAYS = 24 * 3600 * 1000;

function Queue( sysid, journal, scheduler, jobStore, runner, log ) {
    this.sysid = sysid || '(none)';
    this.journal = journal;
    this.scheduler = scheduler;
    this.store = jobStore;
    this.runner = runner;
    this.log = log;
    // TODO: pass in options
    this.stats = new events.EventEmitter();

    this.config = {
        ingest: {
            timeLimitMs: 100,
            readBatchSize: 20,
            ingestTimeoutMs: 2000,
        },
    }

    this._lockExpireMs = 300000;
    this._expireLocksInterval = 17000;
    this._expireJobsInterval = 23000;
    this._expireLocksAt = Date.now() + this._expireLocksInterval;
    this._expireJobsAt = Date.now() + this._expireJobsInterval;
    this._retryDelayMs = 5000;
    this._retryDurationMs = 2 * HOURS;

    var self = this;
    this.cron = new utils.Cron();
    // this._cron.schedule('29s', function() { self._renewLocks });
    // this._cron.schedule('11s', function() { self._expireLocks });
    // this._cron.schedule('67s', function() { self._expireJobs });

// FIXME: start fast loop to ingest journal into store
}

Queue.prototype.run = function run( options, callback ) {
    var stopTime = Date.now() + (options.timeLimitMs || Infinity);
    var stopCount = options.countLimit || Infinity;

    var self = this;
    utils.repeatUntil(function(done, count) {
        // log each error, but do not stop the flow
        function nextStep(type, err, next) {
            if (err) self._logError(type, err);
            next();
        }
        utils.iterateSteps([
            function(next) { self.handleDoneJobs(function(err) { nextStep('handleDoneJobs', err, next) }) },
            function(next) { self.runNewJobs(function(err) { nextStep('runNewJobs', err, next) }) },
            function(next) { self.ingestJournal(function(err) { nextStep('ingestJournal', err, next) }) },
            function(next) { self.cron.run(Date.now(), function(err) { nextStep('cron.run', err, next) }) },
// FIXME: move housekeeping into cron
            function(next) { self.housekeeping(Date.now(), function(err) { nextStep('housekeeping', err, next) }) },
            // pause a moment to not chew up 100% cpu
            function(next) { setTimeout(1, next) },
        ],
        function(err) {
            done(null, (count + 1 >= stopCount || Date.now() >= stopTime));
        });
    }, callback);
}

Queue.prototype._logError = function _logError( type, err ) {
    this.log.error(type + ' error: ' + err);
}

Queue.prototype.handleDoneJobs = function handleDoneJobs( callback ) {
// FIXME:
return callback();

    var batchSize = 200;
    var self = this;
    utils.repeatUntil(function(done) {
        var stoppedJobs, groupedJobs, now = new Date();

        utils.iterateSteps([
            function(next) {
                self.getStoppedJobs(batchSize, next);
            },
            function(next, _stoppedJobs) {
                stoppedJobs = _stoppedJobs;
                groupedJobs = utils.groupBy(stoppedJobs, groupDoneJobs);
            },
            function(next) {
                var types = utils.countByField(stoppedJobs, 'type');
                for (var type in types) self.scheduler.jobsStopped(type, types[type]);
            },
            function(next) {
                if (!groupedJobs.retry.length) return next();
                var jobIds = utils.selectField(groupedJobs.retry, 'id');
                self.stats.emit('retryJobs', jobIds);
                self.store.releaseJobs(jobIds, self.sysid, 'retry', next);
            },
            function(next) {
                if (!groupedJobs.archive.length) return next();
                var jobIds = utils.selectField(groupedJobs.archive, 'id');
                self.stats.emit('archiveJobs', jobIds);
                self.store.releaseJobs(jobIds, self.sysid, 'archive', next);
            },
        ],
        function(err) {
            done(err, stoppedJobs.length < batchSize);
        })
    }, callback);

    function groupDoneJobs(job) { return job.exitcode >= 200 && job.exitcode < 500 ? 'archive' : 'retry' }
}

Queue.prototype.runNewJobs = function runNewJobs( callback ) {
    var self = this;
// FIXME:
return callback();

    utils.iterateSteps([
        function(next) { self.store.getWaitingJobcounts(next) },
        function(next, typeCounts) { next(null, self.scheduler.selectJobtypeToRun(typeCounts)) },
        function(next, jobtype) { self.store.getJobs(jobtype, self.runner.getBatchSize(jobtype), self.sysid, next) },
        function(next, jobs) {
            self.scheduler.jobsStarted(jobtype, jobs.length);
            self.runner.runJobs(jobs, next)
        },
    ], callback);
}

Queue.prototype._renewLocks = function _renewLocks( callback ) {
    var self = this;
    utils.iterateSteps([
        function(next) {
            self.runner.getRunningJobs(next) },
        function(next, runningJobs) {
            if (!runningJobs.length) return next();
            var runningIds = utils.selectField(runningJobs, 'id');
            self.store.renewLocks(runningIds, self.sysid, self._lockExpireMs, next); }
    ], callback)
}

Queue.prototype.housekeeping = function housekeeping( now, callback ) {
// FIXME:
return callback();

    var self = this;
    utils.iterateSteps([
        // renew held locks on running jobs
        function(next) {
            // NOTE: would be inefficient to look up the ids in the store each time
            self.runner.getRunningJobs(next); },
        function(next, runningJobs) { 
            var runningIds = utils.selectField(runningJobs, 'id');
            this.store.renewLocks(runningIds, self.sysid, self._lockExpireMs, next); },

        // archive or requeue jobs that stopped running
        // overdue jobs are timed out and/or killed by the runner
        function(next) {
            this.runner.getStoppedJobs(next); },
        function(next, stoppedJobs) {
            },

        // break expired locks
        function(next) {
            this.store.expireLocks(next); },
        // expire archived jobs
        function(next) {
            this.store.expireJobs(null, '__done', 30 * DAYS, 10000, next); },
    ], callback);

    // FIXME: log errors, but execute each housekeeping action independently each time
    // FIXME: use cron to run the repetitive steps
}

Queue.prototype.addJobs = function addJobs( jobtype, body, callback ) {
    var lines = Job.dataToLines(this.sysid, jobtype, body.split('\n').filter(function(line) { return line && line[0] !== '#' }));
    var self = this;
    this.journal.write(lines, function(err) {
        self.log.log("journaled %d jobs of type '%s'", lines.length, jobtype);
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
    var readCount = 0;
    var timeLimit = Date.now() + this.config.ingest.timeLimitMs;

    var self = this, counts = {};
    utils.repeatUntil(function(done) {
        if (Date.now() > timeLimit) return done(null, true);

        var token, jobs;
        utils.iterateSteps([
            function(next) {
                token = self.journal.readReserve(config.readBatchSize, config.ingestTimeoutMs);
                self.journal.read(token, next);
            },
            function(next, linesArray) {
                if (!linesArray.length) return done(null, 'done');
                readCount += linesArray.length;
                jobs = Job.linesToJobs(linesArray, { log: self.log });
                counts = utils.countByField(jobs, 'type');
                self.store.addJobs(jobs, next);
            },
            function(next) {
                self.journal.rsync(token, next);
            },
        ],
        function(err) {
            if (err && token) self.journal.readCancel(token);
            done(err);
        })
    },
    function(err) {
        if (readCount) self.log.log("ingested %d journal lines of type(s)", readCount, counts);
        callback(err);
    })
}

Queue.prototype = utils.toStruct(Queue.prototype);
