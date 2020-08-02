'use strict';

var util = require('util');
var utils = require('./utils');
var Runner = require('./Runner');

module.exports = MockRunner;

function MockRunner( config ) {
    Runner.call(this, config);
    this.runningJobs = {};
    this.stoppedJobs = [];
}
util.inherits(MockRunner, Runner);

MockRunner.prototype.getBatchSize = function getBatchSize( jobtype, handler ) {
    // return an optimal batch size for jobs of type jobtype
    return 40;
}

MockRunner.prototype.runJobs = function runJobs( jobtype, jobs, handler ) {
    for (var i = 0; i < jobs.length; i++) {
        var job = utils.deassign({}, jobs[i], { id: 1, type: 1, code: 'ok', exitcode: 200 });
        this._mockRunJob(job, handler);
    }
}

var _mockExitcodes = [100, 200, 300, 400, 500];
var _mockCodes = ['RETRY', 'OK', 'RETRY', 'FAILED', 'ERROR'];
MockRunner.prototype._mockRunJob = function _mockRunJob( job, handler ) {
    // do not start jobs that cannot be handled
    if (!handler || !handler.lang || !handler.body) {
        this.stoppedJobs.push({
            id: job.id,
            type: job.type,
            dt: job.dt,
            exitcode: 500,
            code: 'BAD_HANDLER',
        })
        return;
    }

    // enter the job into the "running" state
    this.runningJobs[job.id] = job;

    // after a short pause transition it to "stopped"
    var self = this;
    setTimeout(function() {
        // completed with exitcodes 1xx, 2xx, 3xx, 4xx, 5xx
        // and assign it a completion exitcode
        var codeIndex = Math.random() * _mockExitcodes.length >>> 0;

        // mock job completion
        delete self.runningJobs[job.id];
        self.stoppedJobs.push({
            id: job.id,
            type: job.type,
            dt: job.dt,
            // omit lock, no longer meaningful
            // omit data, free memory no longer needed
            exitcode: _mockExitcodes[codeIndex] + (Math.random() * 20 >>> 0),
            code: _mockCodes[codeIndex],
        })
    }, Math.random() * 20);
}

MockRunner.prototype = utils.toStruct(MockRunner.prototype);
