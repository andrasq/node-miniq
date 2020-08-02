/**

Each runner keeps track of the locks it holds, and refreshes them every 2 minutes (times out in 5 minutes).
Each server refreshes its system id every minute, sysid times out after 5 minutes.
  (if > 1 min stale, flagged as "degraded")

getStoppedJobs(limit, cb)
  Stopped jobs are returned with fields .id, .type and .exitcode, but no payload.

**/

'use strict';

var utils = require('./utils');

module.exports = Runner;

function Runner( options ) {
    options = options || {};
    this.runningJobs = {};
    this.stoppedJobs = [];

    this._jobTimeoutMs = options.jobTimeoutMs || 120000;        // 2 min job timeout
    this._jobCpuLimitMs = 2000;                                 // 2 sec job cpu usage limit
    this._jobCountLimit = 100;                                  // max jobs to run before recycling context
    this._batchSize = 40;
}

Runner.prototype.getBatchSize = function getBatchSize( jobtype, handler ) {
    // return an optimal batch size for jobs of type jobtype.  We return a conservative 5.
    return 5;
}

Runner.prototype.getRunningJobIds = function getRunningJobIds( callback ) {
    // return the ids of all jobs that are still under our control, ie those that must not be rerun yet
    var ids = Object.keys(this.runningJobs);
    for (var i = 0; i < this.stoppedJobs.length; i++) ids.push(this.stoppedJobs[i].id);
    callback(null, ids);
}

Runner.prototype.getStoppedJobs = function getStoppedJobs( limit, callback ) {
    callback(null, this.stoppedJobs.splice(0, limit));
}

/*
 * runJobs must be implemented by each runner.
 * Each job run must be set on this.runningJobs keyed by job.id, and when stopped
 * have its .exitcode set and be appended to this.stoppedJobs.
 */
Runner.prototype.runJobs = utils.abstract('runJobs', 'jobtype: string[]', 'jobs: Job[]', 'jobHandler: JobHandler');
