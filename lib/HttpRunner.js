'use strict';

module.exports = HttpRunner;

var http = require('http');
var util = require('util');
var microreq = require('microreq');
var Runner = require('./Runner');
var utils = require('./utils');

function HttpRunner( options ) {
    Runner.call(this, options || {});
    this.httpAgent = options && options.httpAgent || new http.Agent({ keepAlive: true, maxSockets: 10 });
    this._batchSize = options && options.batchSize || 10;
}
util.inherits(HttpRunner, Runner);

HttpRunner.prototype.getBatchSize = function getBatchSize( jobtype, handler ) {
    return handler.options && handler.options.batchSize || this._batchSize;
}

HttpRunner.prototype.runJobs = function runJobs( jobtype, jobs, handler, callback ) {
    // WRITEME:
    // if (handler.options && handler.options.batch) return this.runBatch(jobtype, jobs, handler);
// TODO: act on handler.before

    var self = this;
    var uri = this._makeUri(handler.body);

    var dt = new Date();
    utils.repeatUntil(function(done, ix) {
        if (ix >= jobs.length) return done(null, true);
        jobs[ix].startDt = dt;
        self._launchJob(jobs[ix], uri);
        done();
    }, function(err) {
        callback();
    })
}

HttpRunner.prototype._launchJob = function _launchJob( job, uri ) {
    var self = this;
// TODO: act on beforeEach

    this._emitStats('HttpRunner.runJobs start', { id: job.id, type: job.type });
    var req = microreq(uri, function(err, res, output) {
        self._landJob(job, err, res, output);
    })
    if (Array.isArray(job.data)) {
        for (var i = 0; i < job.data.length; i++) { req.write(job.data[i]); req.write('\n') }
        req.end();
    } else {
        req.end(job.data);
    }
    this.runningJobs[job.id] = job;
    job.data = null;
}

HttpRunner.prototype._landJob = function _landJob(job, err, res, output) {
    delete this.runningJobs[job.id];
    this.stoppedJobs.push(job);
    this._emitStats('HttpRunner.runJobs stop', { id: job.id, type: job.type, exitcode: job.exitcode, code: job.code, duration: job.duration });

    if (err) {
        job.exitcode = 500;
        job.code = err.code;
        job.error = err;
    } else {
        job.exitcode = res.statusCode;
        job.code = 'OK';
        job.error = null;
    }
    job.output = output;
    job.joblines = this._findJobsInOutput(output);

    job.doneDt = new Date();
    var durationMs = +job.doneDt - +job.startDt;
    job.duration = durationMs;
// TODO: act on afterEach

    if (Array.isArray(job.output)) {
        // TODO: do what with the output?  A: ignore it?
    }
}

HttpRunner.prototype._makeUri = function _makeUri( url ) {
    return {
        url: url,
        method: 'POST',
        // encoding: 'json',
        timeout: this._jobTimeoutMs,
        noReqEnd: true,
        agent: this.httpAgent,
    }
}

/**
HttpRunner.prototype.runBatch = function runBatch( jobtype, jobs, handler ) {
    var self = this;

// TODO: before/beforeEach/etc
// FIXME: stats

// TODO: refactor job running into lauchJob and landJob;
// TODO: wrap batch into a pseudo-job, launch that, land it, unwrap results and stop each job

    var uri = this._makeUri(handler.body);
    uri.noReqEnd = true;
    var req = microreq(uri, function(err, res, output) {
        if (err || !output) return this._errorOutJobs(err);
        lines = String(output).split('\n');
        if (lines.length < jobs.length) return this._errorOutJobs('SHORT_READ');
        this._stopJobs(jobs);
    })
}
/**/

// extract from the job output any new jobs that were injected back into the system
// FIXME: how to queue them?
HttpRunner.prototype._findJobsInOutput = function _findJobsInOutput( str ) {
    // FIXME: TODO
    // extract and return any lines starting with /^#J: / in output, and return them concated
    // TODO: optimize
    return String(str).split('\n').filter(function(line) { return /^#J: /.test(line) });
}

HttpRunner.prototype._emitStats = function _emitStats( type, arg ) {
// console.log("AR: stat", type, arg);
    // TODO: WRITEME
}
