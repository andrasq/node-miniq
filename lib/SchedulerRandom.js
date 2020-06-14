'use strict';

module.exports = SchedulerRandom;

var utils = require('./utils');

function SchedulerRandom( ) {
    this.totalJobsRun = 0;
    this.typeCount = 0;
    this.runningTypes = {};
}

SchedulerRandom.prototype.selectJobtypeToRun = function selectJobtypeToRun( typeCounts ) {
    // pick one of the types at random
    // todo: track cached runners, recently run jobs
    var keys = Object.keys(typeCounts);
    var i = (Math.random() * keys.length) >>> 0;
    return keys[i];
}

SchedulerRandom.prototype.startedJobs = function startedJobs( type, count ) {
    this.totalJobsRun += count;
    if (this.runningTypes[type]) this.runningTypes[type] += count;
    else {
        this.runningTypes[type] = count;
        this.typeCount += 1;
    }
}

SchedulerRandom.prototype.doneJobs = function doneJobs( type, count ) {
    this.runningCount -= count;
    if (this.runningTypes[type] > count) this.runningTypes[type] -= count;
    else {
        delete this.runningTypes[type];
        this.typeCount -= 1;
    }
}

SchedulerRandom.prototype.getRunningCounts = function getRunningCount( type ) {
    return type ? this.runningTypes[type] : this.runningTypes;
}

SchedulerRandom.prototype = utils.toStruct(SchedulerRandom.prototype);
