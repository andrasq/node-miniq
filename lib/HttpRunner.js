'use strict';

module.exports = HttpRunner;

var util = require('util');
var Runner = require('./Runner');
var utils = require('./utils');

function HttpRunner( options ) {
    Runner.call(this, options || {});
}
util.inherits(HttpRunner, Runner);

HttpRunner.prototype.runJobs = function runJobs( jobtype, jobs, callback ) {
}

HttpRunner.prototype.getRunningJobIds = function getRunningJobIds( callback ) {
}

HttpRunner.prototype.getStoppedJobs = function getStoppedJobs( limit, callback ) {
}

HttpRunner.prototype.getBatchSize = function getBatchSize( jobtype ) {
    return this._batchSize;
}
