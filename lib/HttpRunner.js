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
    // if (handler.options && handler.options.batch) return this.runBatch(jobtype, jobs, handler, callback);
// TODO: act on handler.before

    var self = this;
    var uri = this._makeUri(handler.body);

// TODO: http.Agent throttles num jobs in flight, but maybe limit here too?
// TODO: node-v0.8 and node-v0.10 http.Agent is flaky, cannot be relied on

    // repeatUntil periodically yields the event loop, allowing requests to be sent
    utils.repeatUntil(function(done, ix) {
        if (ix >= jobs.length) return done(null, true);
        jobs[ix].startDt = new Date();
        self._launchJob(jobs[ix], uri, function(job, err, res, output) {
            self._landJob(job, new Date(), err, res, output);
            var lines = output ? winnowOutput(output) : { joblines: [] };
            // TODO: if (lines.joblines.length) ...
        })
        done();
    }, function(err) {
        callback();
    })
}

HttpRunner.prototype.runBatchJob = function runBatchJob( jobtype, jobs, handler, callback ) {
    var self = this;

    var self = this;
    var uri = this._makeUri(handler.body);

    var startMs = Date.now();
    this._launchJob(jobs, uri, function(job, err, res, output) {
        var doneDt = new Date();
        var doneMs = doneDt.getTime();
        var lines = winnowOutput({}, output);
        var durationEach = (doneMs - startMs) / lines.responses.length;
        for (var i = 0; i < jobs.length; i++) {
            delete self.runningJobs[jobs[i].id];
            self.stoppedJobs.push(jobs[i]);
            jobs[i].duration = durationEach;
            if (err) {
                jobs[i].exitcode = 500;
                jobs[i].code = 'BATCH_ERROR';
                jobs[i].error = err;
            }
            else {
                jobs[i].exitcode = parseInt(lines.responses[i]);
                if (! jobs[i].exitcode >= 0) {
                    jobs[i].exitcode = 500;
                    jobs[i].code = lines.responses[i] === undefined ? 'NO_RESPONSE' : 'INVALID_RESPONSE';
                }
            }
        }
        // TODO: if (lines.joblines) ...
    })
}

HttpRunner.prototype._launchJob = function _launchJob( job, uri, callback ) {
    var self = this;
// TODO: act on beforeEach

    var req = microreq(uri, function(err, res, output) {
        callback(job, err, res, output);
    })
    if (Array.isArray(job)) {
        var jobs = job;
        for (var i = 0; i < jobs.length; i++) {
            req.write(jobs[i].data);
            req.write('\n');
        }
        req.end();
        for (var i = 0; i < jobs.length; i++) {
            this.runnigJobs[jobs[i].id] = jobs[i];
            jobs[i].data = null;
            // this._emitStats('HttpRunner.runJobs start', { id: jobs[i].id, type: jobs[i].type });
        }
    } else {
        req.end(job.data + '\n');
        this.runningJobs[job.id] = job;
        job.data = null;
        // this._emitStats('HttpRunner.runJobs start', { id: job.id, type: job.type });
    }
}

// TODO: pass in doneDt
HttpRunner.prototype._landJob = function _landJob( job, doneDt, err, res, output ) {
//console.log("AR: land job", job.id);
    job.doneDt = doneDt;
    var durationMs = +job.doneDt - +job.startDt;
    job.duration = durationMs;

    delete this.runningJobs[job.id];
    this.stoppedJobs.push(job);
    this._emitStats('HttpRunner.runJobs stop', { id: job.id, type: job.type, exitcode: job.exitcode, code: job.code, duration: job.duration });

    if (err) {
        job.exitcode = 500;
        job.code = err.code;
        job.error = err;
    } else {
        job.exitcode = res.statusCode;
    }

// TODO: act on afterEach
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

HttpRunner.prototype._emitStats = function _emitStats( type, arg ) {
// console.log("AR: stat", type, arg);
    // TODO: WRITEME
}

function winnowOutput( output ) {
    // TODO: optimize: do not convert buffer back to string
    var lines = String(output).trim().split('\n');
    var responses = [];
    var comments = [];
    for (var i = 0; i < lines.length; i++) {
        if (lines[i][0] === '#') comments.push(lines[i]);
        else if (lines[i]) responses.push(lines[i]);
    }
    var joblines = comments.length ? comments.filter(function(line) { return /^#J: /.test(line) }) : [];
    return { responses: responses, joblines: joblines };
}
