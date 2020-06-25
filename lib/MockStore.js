/*
 * Store api compatible in-memory miniq job store
 *
 * 2020-06-24 - AR.
 */

'use strict';

module.exports = MockStore;

var utils = require('./utils');

function MockStore( db ) {
    this.db = db;
    this.jobs = [];
}

var LOCK_NONE = MockStore.LOCK_NONE = '';
var LOCK_DONE = MockStore.LOCK_DONE = '__done';

MockStore.prototype.addJobs = function addJobs( jobs, callback ) {
    var rejects = [], dt = new Date();
    for (var i = 0; i < jobs.length; i++) {
        var job = jobs[i];
        if (!job || !job.id) { rejects.push(job); continue }
        if (!job.dt) job.dt = dt;
        this.jobs.push(job);
    }
    callback(null, rejects);
}

MockStore.prototype.getWaitingJobtypes = function getWaitingJobtypes( callback ) {
    var dt = new Date();
    var types = {};
    this.jobs.forEach(function(job) {
        if (job.dt <= dt && job.lock === '') types[job.type] = true;
    })
    callback(null, Object.keys(types));
}

MockStore.prototype.getRunningJobtypes = function getWaitingJobtypes( callback ) {
    var dt = new Date();
    var types = {};
    this.jobs.forEach(function(job) {
        if (job.lock !== '' && job.lock !== '__done') types[job.type] = true;
    })
    callback(null, Object.keys(types));
}

MockStore.prototype.getWaitingJobcounts = function getWaitingJobcounts( callback ) {
    var dt = new Date();
    var types = {};
    this.jobs.forEach(function(job) {
        if (job.dt <= dt && job.lock === '') types[job.type] = types[job.type] + 1 || 1;
    })
    callback(null, types);
}

MockStore.prototype.getJobs = function getJobs( jobtype, limit, lock, expireMs, callback ) {
    var nowDt = new Date();
    var found = [];

    this.jobs.find(function(job, i) {
        if (job.type === jobtype && job.lock === '' && job.dt <= nowDt) found.push(job);
        return found.length >= limit;
    })
    found.forEach(function(job) {
        job.dt = new Date(+nowDt + expireMs);
        job.lock = lock;
    })
    callback(null, found);
}

MockStore.prototype.getLockedJobs = function getRunningJobs( lock, limit, callback ) {
    var found = [];
    this.jobs.find(function(job) {
        if (job.lock === lock) found.push(job);
        return found.length >= limit;
    })
    callback(null, found.slice(0, limit));
}

MockStore.prototype.renewLocks = function renewLocks( ids, lock, expireMs, callback ) {
    var expireDt = new Date(Date.now() + expireMs);
    this.jobs.forEach(function(job) {
        if (job.lock === lock && ids.indexOf(job.id) >= 0) job.dt = expireDt;
    })
    return callback();
}

MockStore.prototype.releaseJobs = function releaseJobs( ids, lock, how, callback ) {
    var newLock = how === 'archive' ? '__done' : '';
    var newDt = new Date(Date.now());
    if (how === 'archive') newDt.setFullYear(newDt.getFullYear() + 1000);

    this.jobs.forEach(function(job) {
        if (job.lock === lock && ids.indexOf(job.id) >= 0) {
            job.dt = newDt;
            job.lock = newLock;
        }
    })
    callback();
}

// break expired locks whose dt has expired
MockStore.prototype.expireLocks = function expireLocks( callback ) {
    var nowDt = new Date();
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
