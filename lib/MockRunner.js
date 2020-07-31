'use strict';

var util = require('util');
var utils = require('./utils');
var Runner = require('./Runner');

module.exports = MockRunner;

function MockRunner( config ) {
    Runner.call(this, config);
    this.runningJobs = {};
    this.stoppedJobs = {};
}
util.inherits(MockRunner, Runner);

MockRunner.prototype.getRunningJobIds = function getRunningJobIds( callback ) {
    callback(null, Object.keys(this.runningJobs));
}
MockRunner.prototype.getStoppedJobs = function getStoppedJobs( limit, callback ) {
    // return the {id, type, exitcode} of jobs that are no longer running
    // the exitcode identifies the reason they stopped
    callback(null, utils.valuesOf(this.stoppedJobs));
}
MockRunner.prototype.getBatchSize = function getBatchSize( jobtype ) {
    // return an optimal batch size for jobs of type jobtype
    return 40;
}
MockRunner.prototype.getRunningJobtypes = function getRunningJobtypes( callback ) {
    callback(null, utils.uniq(utils.selectField(this.runningJobs, 'type')));
}

MockRunner.prototype.runJobs = function runJobs( jobtype, jobs, handler ) {
    for (var i = 0; i < jobs.length; i++) {
        var job = utils.deassign({}, jobs[i], { id: 1, type: 1, code: 'ok', exitcode: 200 });
        this._mockRunJob(job, handler);
    }
}

var _mockCodes = {  1: 'retry', 2: 'ok', 3: 'retry', 4: 'failed', 5: 'error' };
var _mockExitcodes = { 1: 100, 2: 200, 3: 300, 4: 400, 5: 500 };
MockRunner.prototype._mockRunJob = function _mockRunJob( job, handler ) {
    // do not start jobs that cannot be handled
    if (!handler || !handler.lang || !handler.body) {
        job.code = 'BAD_HANDLER';
        job.exitcode = 500;
        this.stoppedJobs[job.id] = job;
        return;
    }

    // enter the job into the "running" state
    this.runningJobs[job.id] = job;

    // after a short pause transition it to "stopped"
    var self = this;
    setTimeout(function() {
        // mock job completion
        delete self.runningJobs[job.id];
        self.stoppedJobs[job.id] = job;

        // completed with exitcodes 1xx, 2xx, 3xx, 4xx, 5xx
        // and assign it a completion exitcode
        var exitcode = 1 + Math.random(5);
        job.code = _mockCodes[exitcode];
        job.exitcode = _mockExitcodes[exitcode];
    }, Math.random() * 20);
}

MockRunner.prototype = utils.toStruct(MockRunner.prototype);
