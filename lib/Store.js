'use strict';

var utils = require('./utils');

module.exports = Store;

function Store( ) {
}
// Job: { id: string, type: string, dt?: Date, data:? any }
Store.prototype.addJobs = utils.abstract('addJobs', 'jobs: Job[]', 'callback');
Store.prototype.getWaitingJobtypes = utils.abstract('getWaitingJobtypes', 'callback');
// Store.prototype.getRunningJobtypes = utils.abstract('getRunningJobtypes', 'callback');
// Store.prototype.getWaitingJobcounts = utils.abstract('getWaitingJobcounts', 'callback');
Store.prototype.getJobs = utils.abstract('getJobs', 'jobtype: string', 'limit: number', 'lock: string', 'expireMs: number', 'callback');
// Store.prototype.getLockedJobs = utils.abstract('getLockedJobs', 'jobtype: string|null', 'lock: string|null', 'limit: number', 'callback');
Store.prototype.renewLocks = utils.abstract('renewLocks', 'ids: string[]', 'lock: string', 'expireMs: number', 'callback');
Store.prototype.releaseJobs = utils.abstract('releaseJobs', 'ids: string[]', 'lock: string', 'how: string', 'callback');
Store.prototype.expireLocks = utils.abstract('expireLocks', 'callback');
Store.prototype.expireJobs = utils.abstract('expireJobs', 'jobtype: string', 'lock: string', 'cutoffMs: number', 'limit: number', 'callback');