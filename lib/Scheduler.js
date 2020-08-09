'use strict';

module.exports = Scheduler;

var utils = require('./utils');

function Scheduler( options ) {
    options = options || {};

    this.totalJobsRun = 0;
    this.typeCount = 0;
    this.runningCount = 0;
    this.runningTypes = {};

    var self = this;
    utils.setInterval(function() {
        var runningTypes = self.runningTypes, running = {};
        for (var type in runningTypes) if (runningTypes[type] > 0) running[type] = runningTypes[type];
        self.runningTypes = running;
    }, options.gcIntervalMs || 2000);
}

// pick one of the waiting jobtypes to run next
Scheduler.prototype.selectJobtypeToRun = function selectJobtypeToRun( typeCounts ) {
    for (var type in typeCounts) return type;
}

Scheduler.prototype.jobsStarted = function jobsStarted( jobtype, count ) {
    this.runningCount += count;
    this.totalJobsRun += count;
    if (this.runningTypes[jobtype] >= 0) this.runningTypes[jobtype] += count;
    else {
        this.runningTypes[jobtype] = count;
        this.typeCount += 1;
    }
}

Scheduler.prototype.jobsStopped = function jobsStopped( jobtype, count ) {
    this.runningCount -= count;
    if (this.runningTypes[jobtype] > count) this.runningTypes[jobtype] -= count;
    else {
        this.runningTypes[jobtype] = 0;
        this.typeCount -= 1;
    }
}

Scheduler.prototype.getRunningCounts = function getRunningCount( jobtype ) {
    return jobtype ? (this.runningTypes[jobtype] || 0) : this.runningTypes;
}

Scheduler.prototype = utils.toStruct(Scheduler.prototype);
