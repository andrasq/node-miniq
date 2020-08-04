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
    this.log = options.log || utils.makeNoopLogger();

    // provide a common place to track waiting, running and done jobs
    this.waitingJobs = [];
    this.runningJobs = {};
    this.stoppedJobs = [];

    this._jobTimeoutMs = options.jobTimeoutMs || 120000;        // 2 min job timeout
    this._jobCpuLimitMs = 2000;                                 // 2 sec job cpu usage limit
    this._jobCountLimit = 100;                                  // max jobs to run before recycling context
}

Runner.prototype.getBatchSize = function getBatchSize( jobtype, handler ) {
    // how many jobs of type jobtype to run. We suggest a conservative generic count.
    return 5
}

// return the ids of all jobs that are still under our control, ie those that must not be rerun yet
Runner.prototype.getRunningJobIds = function getRunningJobIds( callback ) {
// TODO: skip keys of undefined properties, in case derived class sets to undefined
    var ids = utils.keysOf(this.runningJobs);
    for (var i = 0; i < this.waitingJobs.length; i++) ids.push(this.waitingJobs[i].id);
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
Runner.prototype.runJobs = utils.abstract('runJobs', 'jobtype: string[]', 'jobs: Job[]', 'jobHandler: JobHandler', 'callback');
