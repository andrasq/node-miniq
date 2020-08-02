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

HttpRunner.prototype.runJobs = function runJobs( jobtype, jobs, handler ) {
    // WRITEME:
    // if (handler.options && handler.options.batch) return this.runBatch(jobtype, jobs, handler);

    var self = this;
    jobs.forEach(function(job) {
// TODO: act on handler.before, beforeEach, afterEach

// FIXME: this.emitStats('HttpRunner.runJobs start', { id: job.id, type: job.type });
        // launchJob
        job.dt = Date.now();
        microreq(self._makeUri(handler.body), String(job.data), landJob);
        self.runningJobs[job.id] = job;
        job.data = null;

        function landJob(err, res, output) {
            var startMs = job.dt;
            var doneMs = Date.now();
            var durationMs = doneMs - startMs;
            job._ms = durationMs;
// TODO: maybe update the job with its duration ms, and/or emit stats about duration
// TODO: maybe emit stats specifically about job duration
// FIXME: self.emitStats('HttpRunner.runJobs stop', { id: job.id, type: job.type, ms: durationMs });
            if (err) {
                job.exitcode = 500;
                job.code = err.code;
            } else {
                job.exitcode = res.statusCode;
                job.code = 'OK';
                job.output = self._scanOutput(output);
            }
            delete self.runningJobs[job.id];
            self.stoppedJobs.push(job);
            if (typeof output === 'string') {
                self._scanOutput(output);
            }
        }
    })
}

HttpRunner.prototype._makeUri = function _makeUri( url ) {
    return {
        url: url,
        method: 'POST',
        // encoding: 'json',
        timeout: this._jobTimeoutMs,
        agent: this.httpAgent,
    }
}

// extract from the job output any new jobs that were injected back into the system
// FIXME: how to queue them?
HttpRunner.prototype._scanOutput = function _scanOutput( str ) {
    // FIXME: TODO
    // extract and return any lines starting with /^#J: / in output, and return them concated
    return '';
}
