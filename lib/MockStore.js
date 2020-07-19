/*
 * Store api compatible in-memory miniq job store
 *
 * 2020-06-24 - AR.
 */

'use strict';

module.exports = MockStore;

var util = require('util');
var utils = require('./utils');
var Store = require('./Store');

var SECONDS = 1000;
var MINUTES = 60 * SECONDS;

function MockStore( db ) {
    this.retryIntervalMs = 5 * MINUTES;
    this.db = db;
    this.jobs = [];
}
util.inherits(MockStore, Store);
utils.assignTo(MockStore, Store);

// TODO: implement a getUnique() method that returns a guaranteed unique string.
// Can be eg a monotonically increasing number, to use as a lock for a new tempid.
// Of course, that's circular... if could get a guaranteed unique number, that would work as the id.

MockStore.prototype.addJobs = function addJobs( jobs, callback ) {
    var rejects = [], dt = new Date(Date.now());
    for (var i = 0; i < jobs.length; i++) {
        var job = jobs[i];
        (job && job.id && job.type) ? this.jobs.push((job.dt = job.dt || dt) && job) : rejects.push(job);
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
    // if (typeof expireMs !== 'number') throw new Error('expireMs not a number, check call arguments');

    utils.filterUpdate(this.jobs,
        function select(job) { return job.type === jobtype && job.lock === '' && job.dt <= nowDt },
        { dt: new Date(+nowDt + expireMs), lock: lock }, { found: found, limit: limit }, callback);
}

// lookup to retrieve sysids or handlers, or for the unit tests to verify internals
MockStore.prototype.getLockedJobs = function getLockedJobs( jobtype, lock, limit, callback ) {
    // utils.filterUpdate(this.jobs, function(job) { return job.lock === lock }, null, { limit: limit }, callback);
    var found = [];
    for (var i = 0; i < this.jobs.length && found.length < limit; i++) {
        var job = this.jobs[i];
        if ((job.type === jobtype || jobtype == null) && job.lock === lock) found.push(job);
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
    var newDt = new Date(Date.now() + (how === 'unget' ? 0 : this.retryIntervalMs));
    if (how === 'archive') newDt.setFullYear(newDt.getFullYear() + 1000);

    utils.filterUpdate(this.jobs,
        function select(job) { return job.lock === lock && ids.indexOf(job.id) >= 0 },
        { dt: newDt, lock: newLock }, { /*remove: (how === 'delete')*/ }, callback);
}

// break locks whose dt has expired
MockStore.prototype.expireLocks = function expireLocks( callback ) {
    var nowDt = new Date(Date.now());
    utils.filterUpdate(this.jobs,
        function(job) { return job.lock !== '' && job.dt < nowDt }, { dt: nowDt, lock: '' }, null, callback);
}

// clean up expired or archived jobs
MockStore.prototype.expireJobs = function expireJobs( jobtype, lock, cutoffMs, limit, callback ) {
    var cutoffDt = cutoffMs instanceof Date ? cutoffMs : new Date(+utils.getNewerTimestamp(0) - cutoffMs);
    if (!jobtype && !lock) throw new Error('jobtype or lock required');
    utils.filterUpdate(this.jobs,
        function(job) { return ((job.lock === lock) || lock == null) && ((job.type === jobtype) || jobtype == null) && job.dt < cutoffDt },
        { data: null }, { remove: true }, function(err, found) { callback(err, found) });
}

utils.toStruct(MockStore.prototype);
