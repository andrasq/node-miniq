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

SchedulerRandom.prototype.jobsStarted = function jobsStarted( jobtype, count ) {
    this.totalJobsRun += count;
    if (this.runningTypes[jobtype]) this.runningTypes[jobtype] += count;
    else {
        this.runningTypes[jobtype] = count;
        this.typeCount += 1;
    }
}

SchedulerRandom.prototype.jobsStopped = function jobsStopped( jobtype, count ) {
    this.runningCount -= count;
    if (this.runningTypes[jobtype] > count) this.runningTypes[jobtype] -= count;
    else {
        delete this.runningTypes[jobtype];
        this.typeCount -= 1;
    }
}

SchedulerRandom.prototype.getRunningCounts = function getRunningCount( jobtype ) {
    return jobtype ? this.runningTypes[jobtype] : this.runningTypes;
}

SchedulerRandom.prototype = utils.toStruct(SchedulerRandom.prototype);
