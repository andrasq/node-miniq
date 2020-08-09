'use strict';

module.exports = SchedulerRandom;

var util = require('util');
var utils = require('./utils');
var Scheduler = require('./Scheduler');

function SchedulerRandom( options ) {
    Scheduler.call(this, options);
}
util.inherits(SchedulerRandom, Scheduler);

SchedulerRandom.prototype.selectJobtypeToRun = function selectJobtypeToRun( typeCounts ) {
    // pick one of the types at random
    // todo: track cached runners, recently run jobs
    var keys = Object.keys(typeCounts);
    var i = (Math.random() * keys.length) >>> 0;
    return keys[i];
}

SchedulerRandom.prototype = utils.toStruct(SchedulerRandom.prototype);
