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
    this._jobTimeoutMs = 120000;        // 2 min job timeout
    this._jobCpuLimitMs = 2000;         // 2 sec job cpu usage limit
    this._jobCountLimit = 100;
}

Runner.prototype.runJobs = utils.abstract('runJobs', 'jobtype: string[]', 'jobs: Job[]', 'lock: string', 'jobHandler: object');
Runner.prototype.getRunningJobs = utils.abstract('getRunningJobs', 'callback');
Runner.prototype.getStoppedJobs = utils.abstract('getStoppedJobs', 'limit', 'callback');
Runner.prototype.getBatchSize = utils.abstract('getBatchSize', 'jobtype: string');
Runner.prototype.getRunningJobtypes = utils.abstract('getRunningJobtypes', 'callback');
