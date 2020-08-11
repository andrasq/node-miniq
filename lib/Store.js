/*
 * A Store holds Jobs and items compatible with Jobs, ie those having properties
 *    { id: string,
 *      type: string,
 *      dt: Date,
 *      lock: string,
 *      data: string|binary|null,
 *    }.
 * Indexes are expected to exist on (lock, dt) and (type, lock, dt),
 * and a unique index on (id) to prevent duplicate entries.
 *
 * A Store is a special key-value store where `type` is the key and `data` is the value,
 * `id` is a store-unique timestamped identifier, and `dt` and `lock` are a row timestamp
 * and the current row owner, respectively.  The meaning of `dt` and `lock` change during
 * the lifetime of a Job:
 *      dt      lock
 *      >now    ''      job not yet ready to be run
 *      <now    ''      job waiting to be run
 *      >now    sysid   job is being run by daemon `sysid`
 *      <now    sysid   stalled or crashed daemon `sysid`
 *      >3000   __done  job completed at dt-1000yrs, waiting to be purged
 */

'use strict';

var utils = require('./utils');

module.exports = Store;

function Store( ) {
}
Store.LOCK_NONE    = '';                        // unlocked job
Store.LOCK_DONE    = '__done';                  // owner of completed jobs
Store.LOCK_HANDLER = '__handler';               // owner of job handlers
Store.TYPE_SYSID   = 'queue.sysid';             // sysid pseudo-jobtype

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
