'use strict';

var utils = require('./utils');

module.exports = Store;

function Store( ) {
}
Store.LOCK_DONE    = '__done';
Store.LOCK_NONE    = '';
Store.LOCK_HANDLER = '__handler';

// Job: { id: string, type: string, dt?: Date, lock: '', data:? any }
Store.prototype.addJobs = utils.abstract('addJobs', 'jobs: Job[]', 'callback');
Store.prototype.getWaitingJobcounts = utils.abstract('getWaitingJobcounts', 'callback');
// TODO: rename getJobsToRun
Store.prototype.getJobs = utils.abstract('getJobs', 'jobtype: string', 'limit: number', 'lock: string', 'expireMs: number', 'callback');
Store.prototype.getLockedJobs = utils.abstract('getLockedJobs', 'jobtype: string|null', 'lock: string|null', 'limit: number', 'callback');
Store.prototype.renewLocks = utils.abstract('renewLocks', 'ids: string[]', 'lock: string', 'expireMs: number', 'callback');
Store.prototype.releaseJobs = utils.abstract('releaseJobs', 'ids: string[]', 'lock: string', 'how: string', 'callback');
Store.prototype.expireLocks = utils.abstract('expireLocks', 'callback');
Store.prototype.expireJobs = utils.abstract('expireJobs', 'jobtype: string', 'lock: string', 'cutoffMs: number', 'limit: number', 'callback');

// shared methods
Store.prototype.getWaitingJobtypes = function getWaitingJobtypes(callback) {
    this.getWaitingJobcounts(function(err, jobtypes) {
        callback(err, jobtypes && Object.keys(jobtypes));
    })
}
