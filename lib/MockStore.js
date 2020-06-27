/*
 * Store api compatible in-memory miniq job store
 *
 * 2020-06-24 - AR.
 */

'use strict';

module.exports = MockStore;

var utils = require('./utils');

var SECONDS = 1000;
var MINUTES = 60 * SECONDS;
var LOCK_NONE = MockStore.LOCK_NONE = '';
var LOCK_DONE = MockStore.LOCK_DONE = '__done';

function MockStore( db ) {
    this.retryIntervalMs = 5 * MINUTES;
    this.db = db;
    this.jobs = [];
}

MockStore.prototype.addJobs = function addJobs( jobs, callback ) {
    var rejects = [], dt = new Date(Date.now());
    for (var i = 0; i < jobs.length; i++) {
        var job = jobs[i];
        (job && job.id) ? this.jobs.push((job.dt = job.dt || dt) && job) : rejects.push(job);
    }
    callback(null, rejects);
}

MockStore.prototype.getWaitingJobtypes = function getWaitingJobtypes( callback ) {
    var dt = new Date(Date.now());
    var types = {};
    this.jobs.forEach(function(job) {
        if (job.dt <= dt && job.lock === '') types[job.type] = true;
    })
    callback(null, Object.keys(types));
}

MockStore.prototype.getRunningJobtypes = function getWaitingJobtypes( callback ) {
    var types = {};
    this.jobs.forEach(function(job) {
        if (job.lock !== '' && job.lock !== '__done') types[job.type] = true;
    })
    callback(null, Object.keys(types));
}

MockStore.prototype.getWaitingJobcounts = function getWaitingJobcounts( callback ) {
    var dt = new Date(Date.now());
    var types = {};
    this.jobs.forEach(function(job) {
        if (job.dt <= dt && job.lock === '') types[job.type] = types[job.type] + 1 || 1;
    })
    callback(null, types);
}

// TODO: rename getWaitingJobs ??
MockStore.prototype.getJobs = function getJobs( jobtype, limit, lock, expireMs, callback ) {
    var nowDt = new Date(Date.now());
    var found = [];

    utils.filterUpdate(this.jobs,
        function select(job) { return job.type === jobtype && job.lock === '' && job.dt <= nowDt },
        { dt: new Date(+nowDt + expireMs), lock: lock }, { found: found, limit: limit }, callback);
}

MockStore.prototype.getLockedJobs = function getRunningJobs( lock, limit, callback ) {
    // utils.filterUpdate(this.jobs, function(job) { return job.lock === lock }, null, { limit: limit }, callback);
    var found = [];
    for (var i = 0; i < this.jobs.length && found.length < limit; i++) {
        var job = this.jobs[i];
        if (job.lock === lock) found.push(job);
    }
    callback(null, found);
}

MockStore.prototype.renewLocks = function renewLocks( ids, lock, expireMs, callback ) {
    var expireDt = new Date(Date.now() + expireMs);
    this.jobs.forEach(function(job) {
        if (job.lock === lock && ids.indexOf(job.id) >= 0) job.dt = expireDt;
    })
    return callback();
}

// TODO: release the entire batch in one go, segregate by archive(ok,failed)/unget(unrun)/retry(retry,error)
MockStore.prototype.releaseJobs = function releaseJobs( ids, lock, how, callback ) {
    var newLock = how === 'archive' ? '__done' : '';
    var newDt = new Date(Date.now()), retryDt = new Date(newDt), doneDt = new Date(newDt);
    retryDt.setMilliseconds(newDt.getMilliseconds() + this.retryIntervalMs);
    doneDt.setFullYear(newDt.getFullYear() + 1000);

    this.jobs.forEach(function(job) {
        if (job.lock === lock && ids.indexOf(job.id) >= 0) {
            // TODO: retry runs after delay: job.dt = how === 'archive' ? doneDt : how === 'unget' ? newDt : retryDt;
            job.dt = how === 'archive' ? doneDt : newDt;
            job.lock = newLock;
        }
    })
    callback();
}

// break expired locks whose dt has expired
MockStore.prototype.expireLocks = function expireLocks( callback ) {
    var nowDt = new Date(Date.now());
    this.jobs.forEach(function(job) {
        if (job.lock !== '' && job.dt < nowDt) {
            job.dt = nowDt;
            job.lock = '';
        }
    })
    callback();
}

// clean up expired and archived jobs
MockStore.prototype.expireJobs = function expireJobs( lock, cutoffDt, limit, callback ) {
    var found = [];
    var jobs = this.jobs, j = 0;
    jobs.forEach(function(job) {
        if (job.lock === lock && job.dt < cutoffDt) found.push(job);
        else jobs[j++] = job;
    })
    jobs.length -= found.length;
    found.forEach(function(job) { job.data = null });
    callback(null, found);
}

utils.toStruct(MockStore.prototype);
