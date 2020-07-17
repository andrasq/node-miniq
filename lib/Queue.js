'use strict';

module.exports = Queue;

var util = require('util');
var utils = require('./utils');
var Job = require('./Job');

var SECONDS = 1000;
var MINUTES = 60 * 1000;
var HOURS = 3600 * 1000;
var DAYS = 24 * 3600 * 1000;

function Queue( sysid, journal, scheduler, jobStore, systemStore, runner, log ) {
    this.sysid || '(none)';
    this.journal = journal;
    this.scheduler = scheduler;
    this.store = jobStore;
    this.systemStore = systemStore;
    this.runner = runner;
    this.log = log;

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
    options = options || {};
    var stopTime = Date.now() + (options.timeLimitMs || Infinity);
    var stopCount = options.countLimit || Infinity;

    utils.repeatUntil(function(done, count) {
        var self = this;
        utils.iterateSteps([
            function(next) { self.handleDoneJobs(next) },
            function(next) { self.runNewJobs(next) },
            function(next) { self._cron.run(Date.now(), next) },
// FIXME: move housekeeping into cron
            // function(next) { self.housekeeping(Date.now(), next) },
        ],
        function(err) {
            self.handleErrors(err, function() {
                done(null, (count >= stopCount || Date.now() >= stopTime));
            })
        });
    }, callback);
}

Queue.prototype._logError = function _logError( type, err ) {
    this.log.error(type + ' error: ' + err);
}

Queue.prototype.handleDoneJobs = function handleDoneJobs( callback ) {
    var self = this;

    // TODO: handle done jobs in limited size batches, loop just a few times
    // TODO: have a separate stats log or emit a stats event
    self.runner.getStoppedJobs(function(err, stoppedJobs) {
        if (err) return self._logError('getStoppedJobs', err);

        var now = new Date();
        var retryJobs = [], archiveJobs = [];
        for (var i = 0; i < stoppedJobs.length; i++) {
            var job = stoppedJobs[i];
            if (job.exitcode >= 200 && job.exitcode < 500) {
                // TODO: track durations, or ?have the stats module do it, by job id?
                // self.stats.emit('doneJob', job.id);
                self.log.info({event: 'archiveJob', job: job});
                archiveJobs.push(job);
            } else {
                if (now < job.createdAt + self._retryDurationMs) {
                    self.log.info({event: 'retryJob', job: job});
                    retryJobs.push(job);
                }
                else {
                    self.log.info({event: 'expiredRetry', job: job});
                }
            }
        }

        utils.iterateSteps([
            function(next) { retryJobs.length && self.store.releaseJobs(utils.selectField(retryJobs, 'id'), self.sysid, 'retry', next) || next() },
            function(next) { archiveJobs.length && self.store.releaseJobs(utils.selectField(archiveJobs, 'id'), self.sysid, 'archive', next) || next() },
        ],
        function(err) {
            if (err) this._logError('releaseJobs', err);
            var types = utils.groupByField(stoppedJobs, 'type');
            for (var type in types) self.scheduler.jobsStopped(type, types[type].length);
            callback();
        })
    })
}

Queue.prototype.runNewJobs = function runNewJobs( callback ) {
    var self = this;
    utils.iterateSteps([
        function(next) { self.store.getWaitingJobcounts(next) },
        function(next, typeCounts) { next(null, self.scheduler.selectJobtypeToRun(typeCounts)) },
        function(next, jobtype) { self.store.getJobs(jobtype, self.runner.getBatchSize(jobtype), self.sysid, next) },
        function(next, jobs) {
            self.scheduler.jobsStarted(jobtype, jobs.length);
            self.runner.runJobs(jobs, next)
        },
    ], next);
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
    ], function(err) {
        if (err) self._logError('nenewLocks', err);
        callback();
    })
}

Queue.prototype.housekeeping = function housekeeping( now, callback ) {
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
    ],
    function(err) {
        if (err) self.log.error('housekeeping error: ' + err.message);
        callback();
    });

    // FIXME: log errors, but execute each housekeeping action independently each time
    // FIXME: use cron to run the repetitive steps
}

Queue.prototype.addJobs = function addJobs( jobtype, body, callback ) {
    var _lines = body.split('\n');
    var lines = [];
    for (var i = 0; i < _lines.length; i++) {
        if (_lines[i] && _lines[i][0] !== '#') {
            lines.push(utils.getId(this.sysid) + '|' + jobtype + '|' +  _lines[i]);
        }
    }
    this.journal.write(lines, function(err) { callback(err, lines.length) });

    // NOTE: try not to double-convert request buffer -> chars -> buffer 
    // NOTE: maybe write in batches, eg:
    // this.journal.write('#:Batch date=' + new Date().toISOString() + ',bytes=' + Buffer.byteLength(lines) + ',jobtype=' + jobtype + '\n');
    // this.journal.write(lines);
    // if (lines.length && lines[lines.length - 1] !== '\n') this.journal.write('\n');
    // this.journal.write('#:EndBatch\n');
}

Queue.prototype.handleErrors = function handleErrors( err, callback ) {
    this.log.error(String(err));
    callback();
}

/*
 * Read jobs from the journal and add them to the store.
 */
Queue.prototype.ingestJournal = function ingestJournal( callback ) {
    var config = this.config.ingest;
    var readCount = 0;
    var timeLimit = Date.now() + this.config.ingest.timeLimitMs;

    var self = this;
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
        callback(err)
    })
}

Queue.prototype = utils.toStruct(Queue.prototype);
