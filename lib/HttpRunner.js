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
    this.microreq = microreq;
    this._batchSize = options && options.batchSize || 10;
}
util.inherits(HttpRunner, Runner);

HttpRunner.prototype.getBatchSize = function getBatchSize( jobtype, handler ) {
    return handler.options && handler.options.batchSize || this._batchSize;
}

HttpRunner.prototype.runJobs = function runJobs( jobtype, jobs, handler, callback ) {
    var self = this;
    handler._uri = this._makeUri(handler.body);
    handler.options = handler.options || {};
    var isBatch = handler.options.batch;

//    if (handler.options.batch) return this.runBatchJob(jobtype, jobs, handler, callback);

// TODO: http.Agent throttles num jobs in flight, but maybe limit here too?
// TODO: node-v0.8 and node-v0.10 http.Agent is flaky, cannot be relied on

    // run groups of non-batch jobs as individual http calls
    if (jobs.length > 1 && !isBatch) {
        // repeatUntil periodically yields the event loop, allowing requests to be sent
        utils.repeatUntil(function(done, ix) {
            if (ix >= jobs.length) return done(null, true);
            self.runJobs(jobtype, [jobs[ix]], handler, done);
        }, function(err) {
//if (err) console.log("AR: err", err);
            callback(err);
        })
    }
    // else run batch jobs in a single call
    else {
        // TODO: handler.beforeEach

        var startMs = Date.now();
        this._launchJobs(jobs, handler._uri, function(job, err, res, output) {
            var doneDt = new Date();
            var doneMs = doneDt.getTime();
            var lines = winnowOutput(output);
            var durationEach = !isBatch ? (doneMs - startMs) : (doneMs - startMs) / lines.responses.length;
            for (var i = 0; i < jobs.length; i++) {
                delete self.runningJobs[jobs[i].id];
                self.stoppedJobs.push(jobs[i]);
                jobs[i].duration = durationEach;
                if (err) {
                    jobs[i].exitcode = 500;
                    jobs[i].code = err.code || 'BATCH_ERROR';
                    jobs[i].error = err;
                }
                else {
                    jobs[i].exitcode = isBatch ? parseInt(lines.responses[i]) : res.statusCode;
                    if (!(jobs[i].exitcode >= 0)) {
                        jobs[i].exitcode = 500;
                        jobs[i].code = lines.responses[i] === undefined ? 'NO_RESPONSE' : 'INVALID_RESPONSE';
                        // an invalid response invalidates all following responses, cannot be trusted to be good
                        for (var j = i; j < lines.responses.length; j++) lines.responses[j] = 'invalid';
                    }
                }
            }
            // TODO: handler.afterEach
            // TODO: if (lines.joblines.length) ...
        })
        // call back as soon as the job (the http call) is launched
        callback();
    }
}

HttpRunner.prototype._launchJobs = function _launchJobs( jobs, uri, callback ) {
    var self = this;

    var req = this.microreq(uri, function(err, res, output) {
        callback(jobs, err, res, output);
    })
    for (var i = 0; i < jobs.length; i++) {
        i < jobs.length - 1 ? req.write(jobs[i].data + '\n') : req.end(jobs[i].data + '\n');
    }
    for (var i = 0; i < jobs.length; i++) {
        self.runningJobs[jobs[i].id] = jobs[i];
        jobs[i].data = null;
        // this._emitStats('HttpRunner.runJobs start', { id: jobs[i].id, type: jobs[i].type });
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
HttpRunner.prototype._emitStats = function _emitStats( type, arg ) {
// console.log("AR: stat", type, arg);
    // TODO: WRITEME
}
**/

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
