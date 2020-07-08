/**

Each runner keeps track of the locks it holds, and refreshes them every 2 minutes (times out in 5 minutes).
Each server refreshes its system id every minute, sysid times out after 5 minutes.
  (if > 1 min stale, flagged as "degraded")

**/

'use strict';

var utils = require('./utils');

module.exports = Runner;

function Runner( options ) {
    options = options || {};
    this._jobTimeoutMs = 120000;        // job timeout
    this._jobCpuLimitMs = 2000;         // job cpu usage limit
    this._jobCountLimit = 100;
}
Runner.prototype.getRunningJobs = utils.abstract('getRunningJobs', 'callback');
Runner.prototype.getStoppedJobs = utils.abstract('getStoppedJobs', 'callback');
Runner.prototype.runJobs = utils.abstract('runJobs', 'jobtype: string[]', 'lock: string', 'jobHandler: object');
