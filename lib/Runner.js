/**

Each runner keeps track of the locks it holds, and refreshes them every 2 minutes (times out in 5 minutes).
Each server refreshes its system id every minute, sysid times out after 5 minutes.
  (if > 1 min stale, flagged as "degraded")

**/

'use strict';

var utils = require('./utils');

module.exports = Runner;

function Runner( ) {
}
