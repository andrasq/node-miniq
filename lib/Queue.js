'use strict';

module.exports = Queue;

var utils = require('./utils');

var SECONDS = 1000;
var MINUTES = 60 * 1000;
var HOURS = 3600 * 1000;
var DAYS = 24 * 3600 * 1000;

function Queue( sysid, journal, scheduler, store, runner, log ) {
    this.sysid = sysid || 'mque' + Math.floor(Math.random() * 0x1000000).toString(16);
    this.journal = journal;
    this.scheduler = scheduler;
    this.store = store;
    this.runner = runner;
    this.log = log;

    this._expireLocksInterval = 17000;
    this._expireJobsInterval = 23000;
    this._expireLocksAt = Date.now() + this._expireLocksInterval;
    this._expireJobsAt = Date.now() + this._expireJobsInterval;
    this._retryDelayMs = 5000;
    this._retryDurationMs = 2 * HOURS;

    this._lastHousekeepingAt = 0;
    this.cron = new utils.Cron();
    // this._cron.schedule('17s', function() { self._expireLocks });
    // this._cron.schedule('23s', function() { self._expireJobs });
    // this._cron.schedule('29s', function() { self._renewLocks });
}

Queue.prototype.run = function run( options, callback ) {
    options = options || {};
    var stopTime = Date.now() + (options.timeLimitMs || Infinity);
    var stopCount = options.countLimit || Infinity;

    var count = 0;
    utils.repeatUntil(function(done) {
        var self = this;
        utils.iterateSteps([
            function(next) { self.handleDoneJobs(next) },
            function(next) { self.runNewJobs(next) },
            function(next) { self.housekeeping(Date.now(), next) },
        ],
        function(err) {
            self.handleErrors(err, function() {
                done(null, (count >= stopCount || Date.now() >= stopTime));
            })
        });
    }, callback);
}

Queue.prototype.handleDoneJobs = function handleDoneJobs( callback ) {
    var self = this;
    self.runner.getDoneJobs(function(err, jobtype, doneJobs) {
        if (err) return callback(err);

        // TODO: handle done jobs in limited size batches, loop just a few times
        for (var i = 0; i < doneJobs; i++) self.log.info({event: 'doneJob', job: doneJobs[i]});

        var codes = utils.groupByField(doneJobs, 'code');
        if (codes['error']) {
            var now = new Date();
            var ids = new Array();
            for (var i = 0; i < codes['error'].length; i++) {
                var job = codes['error'][i];
                if (now < job.createdAt + self._retryDurationMs) ids.push(job.id);
                else self.log.info({event: 'expiredRetry', job: job});
            }
            self.store.retryJobs(ids, self.sysid, self._retryDelayMs, next);
        }

        self.scheduler.doneJobs(jobtype, jobIds.length);
        self.store.doneJobs(jobIds, self.sysid, callback);
    })
}

Queue.prototype.runNewJobs = function runNewJobs( callback ) {
    var self = this;
    utils.iterateSteps([
        function(next) { self.store.getJobtypes(next) },
        function(next, typesHash) { next(null, self.scheduler.selectJobtypeToRun(typesHash)) },
        function(next, jobtype) { self.store.getJobs(jobtype, self.runner.getBatchSize(jobtype), self.sysid, next) },
        function(next, jobs) {
            self.scheduler.startJobs(jobtype, jobs.length);
            self.runner.runJobs(jobs, next)
        },
    ], next);
}

Queue.prototype.housekeeping = function housekeeping( now, callback ) {
    var elapsedMs = now - this._lastHousekeepingAt;
    this._cron.run(now);
    // renew held locks on running jobs
    // ? time out overdue jobs
    // expire archived jobs
    // renew sysid lock
    // (note: use qcron, or equivalent facility)
    this._lastHousekeepingAt = now;
}

Queue.prototype.addJobs = function addJobs( lines ) {
    // checkpoint to journal
    // ingest journal into store
}

Queue.prototype.handleErrors = function handleErrors( err, callback ) {
    this.log.error(String(err));
    callback();
}

Queue.prototype = utils.toStruct(Queue.prototype);
