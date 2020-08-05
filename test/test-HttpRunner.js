'use strict';

var http = require('http');
var microreq = require('microreq');
var microMw = require('microrest/mw');
var utils = require('../lib/utils');
var testUtils = require('../lib/testUtils');

var Runner = require('../lib/Runner');
var HttpRunner = require('../lib/HttpRunner');

module.exports = {
    before: function(done) {
        this.httpCalls = { count: 0, body: [] };

        this.makeUrl = function makeUrl( path ) { return 'http://0.0.0.0:1337' + path };

        var self = this;
        this.httpServer = http.createServer(function(req, res) {
            var params = {};
            var qq = req.url.indexOf('?');
            if (qq >= 0) {
                params = microMw.parseQuery(req.url.slice(qq + 1));
                req.url = req.url.slice(0, qq);
            }
            var body = microMw.mwReadBody(req, res, function(err, ctx, requestBody) {
                self.httpCalls.count += 1;
                if (err) {
                    res.statusCode(500);
                    res.end('ERROR: readBody');
                }
                else {
                    var batchResponse = function( lines, size, res ) {
                        // send back 200 status for the first size job lines
                        var responseLines = [];
                        for (var i = 0; i < size; i++) {
                            responseLines[i] = '200 ' + lines[i] + '\n' + '# ' + lines[i] + '\n';
                        }
                        res.end(responseLines.join(''));
                    }
                    var badResponse = function( lines, size, res ) {
                        // send back 200 status for each job until size, then an invalid line, then more valid responses
                        self.httpCalls.count += lines.length - 1;
                        var responseLines = [];
                        for (var i = 0; i < lines.length; i++) responseLines[i] = '200\n';
                        responseLines[size] = 'some invalid response that does not begin with a number\n';
                        res.end(responseLines.join(''));
                    }

                    self.httpCalls.body.push(String(requestBody));
                    switch (req.url) {
                    case '/echo':
                        res.end(JSON.stringify(params));
                        break;
                    case '/batchEcho':
                        var lines = String(req.body).split('\n').slice(0, -1);
                        self.httpCalls.count += lines.length - 1;
                        batchResponse(lines, lines.length, res);
                        break;
                    case '/halfBatch':
                        var lines = String(req.body).split('\n').slice(0, -1);
                        self.httpCalls.count += lines.length - 1;
                        batchResponse(lines, params.size, res);
                        break;
                    case '/badBatch':
                        var lines = String(req.body).split('\n').slice(0, -1);
                        badResponse(lines, params.size, res);
                        break;
                    case '/sleep':
                        setTimeout(function() { res.end() }, params.sleepMs);
                        break;
                    default:
                        res.end('?')
                        break;
                    }
                }
            })
        })
        this.httpServer.listen(1337, done);
    },

    beforeEach: function(done) {
        this.httpCalls.count = 0;
        this.httpCalls.body = [];
        this.uut = new HttpRunner();
        done();
    },

    after: function(done) {
        this.httpServer.close();
        done();
    },


    'httpServer': {
        before: function(done) {
            this.makeUri = function makeUri( path, options ) { return utils.assignTo({
                url: path[0] !== '/' ? path : 'http://0.0.0.0:1337' + path,
                encoding: 'utf8',
                method: 'POST',
            }, options || {}) };
            done();
        },

        'returns a response': function(t) {
            microreq(this.makeUri('/echo?a=1&b=2', { encoding: 'json' }), function(err, res, body) {
                t.ifError(err);
                t.deepEqual(body, { a: 1, b: 2 });
                t.done();
            })
        },

        'stores the request body': function(t) {
            var self = this;
            microreq(this.makeUri('/echo'), 'test body contents', function(err, res, body) {
                t.ifError(err);
                t.ok(res.statusCode < 500);
                t.equal(self.httpCalls.body[0], 'test body contents');
                t.done();
            })
        },
    },

    'constructor': function(t) {
        t.ok(testUtils.implements(new HttpRunner(), Runner));
        t.done();
    },

    'getBatchSize': {
        'returns the builtin size': function(t) {
            t.ok(this.uut.getBatchSize('type1', {}) > 0);
            t.done();
        },

        'returns the configured size': function(t) {
            var uut = new HttpRunner({ batchSize: 123 });
            t.equal(uut.getBatchSize('type2', {}), 123);
            t.done();
        },

        'returns the handler size': function(t) {
            var uut = new HttpRunner({ batchSize: 123 });
            t.equal(uut.getBatchSize('type2', { options: { batchSize: 23 } }), 23);
            t.done();
        },
    },

    'getRunningJobIds': {
        'returns ids of running jobs': function(t) {
            var uut = this.uut;
            uut.runJobs('type1', [{ id: 1, data: 'test1' }, { id: 2, data: 'test2' }], { body: this.makeUrl('/echo') }, t.ifError);
            setTimeout(function() {
                uut.getRunningJobIds(function(err, ids) {
                    t.deepEqual(ids, [1, 2]);
                    t.done();
                })
            }, 5)
        },

        'returns ids of stopped but uncollected jobs': function(t) {
            var uut = this.uut;
            uut.runJobs('type1', [{ id: 1, data: 'test1' }, { id: 2, data: 'test2' }], { body: this.makeUrl('/echo') }, function(err) {
                t.ifError(err);
                uut.getRunningJobIds(function(err, ids) {
                    t.deepEqual(ids, [1, 2]);
                    t.done();
                })
            })
        },
    },

    'runJobs': {
        'makes an http call': function(t) {
            var self = this;
            this.uut.runJobs('type1', [{ id: 1, data: 'test1' }], { body: this.makeUrl('/echo') }, t.ifError);
            setTimeout(function() {
                // allow responses to arrive out of order (eg node-v0.8)
                t.ok(/^test[12]\n$/.test(self.httpCalls.body[0]));
                t.ok(/^test[12]\n$/.test(self.httpCalls.body[1]));
                t.done();
            }, 20);
        },

        'returns stopped jobs': function(t) {
            var self = this;
            this.uut.runJobs('type2', [{ id: 1, data: 'test21' }], { body: this.makeUrl('/sleep?sleepMs=5') }, t.ifError);
            this.uut.runJobs('type2', [{ id: 2, data: 'test22' }], { body: this.makeUrl('/sleep?sleepMs=15') }, t.ifError);
            setTimeout(function() {
                self.uut.getStoppedJobs(10, function(err, jobs) {
                    t.ifError(err);
                    t.equal(jobs.length, 1);
                    t.equal(jobs[0].id, 1);
                })
            }, 12);
            setTimeout(function() {
                self.uut.getStoppedJobs(10, function(err, jobs) {
                    t.ifError(err);
                    t.equal(jobs.length, 1);
                    t.equal(jobs[0].id, 2);
                    t.done();
                })
            }, 22);
        },

        'runs many jobs': function(t) {
            var ncalls = 1000;
            var waitMs = 40;
            var self = this;
            var jobs = [];
            for (var i = 0; i < ncalls; i++) jobs.push({ id: i, data: 'test-' + utils.pad(String(i), 6) });
            var startMs = Date.now();
            this.uut.runJobs('type-k', jobs, { body: this.makeUrl('/echo') }, t.ifError);
            utils.repeatUntil(function(done) {
                if (self.httpCalls.count < ncalls) return setTimeout(done, 1);
                // wait 40 ms after the last response to be returned
                setTimeout(done, waitMs, true);
            }, function() {
                t.equal(self.httpCalls.count, ncalls);
                // cannot rely on call order, node-v0.8.28 runs them out of order
                // t.deepEqual(self.httpCalls.body.slice(0, 3), ['test-000000', 'test-000001', 'test-000002']);
                self.uut.getStoppedJobs(10, function(err, jobs1) {
                    t.ifError(err);
                    self.uut.getStoppedJobs(1e6, function(err, jobs2) {
                        var doneMs = Date.now() - waitMs;
                        t.ifError(err);
                        t.equal(jobs1.length, 10);
                        t.equal(jobs1[0].id, 0);
                        t.equal(jobs2.length, ncalls - 10);
                        var leastMs = Math.min.apply(Math, utils.selectField(jobs1, 'duration'));
                        var mostMs = Math.max.apply(Math, utils.selectField(jobs2, 'duration'));
                        console.log("AR: total for %d individual jobs: %d ms (jobs each took %d-%d ms)", ncalls, doneMs - startMs, leastMs, mostMs);
                        // node-v10: 12.6k /echo jobs/sec 10k (5.5k/s 1k)
                        t.done();
                    })
                })
            })
        },

        'runs batch of many jobs': function(t) {
            var ncalls = 1000;
            var waitMs = 20;
            var self = this;
            var jobs = [];
            for (var i = 0; i < ncalls; i++) jobs.push({ id: i, data: 'test-' + utils.pad(String(i), 6) });
            var startMs = Date.now();
            this.uut.runJobs('type-k', jobs, { body: this.makeUrl('/batchEcho'), options: { batch: true } }, function(err) {
                t.ifError(err);
                // jobs are off and running, wait for them to complete
                utils.repeatUntil(function(done) {
                    if (self.httpCalls.count < ncalls) return setTimeout(done, 1);
                    setTimeout(done, waitMs, true);
                }, function() {
                    t.equal(self.httpCalls.count, ncalls);
                    self.uut.getStoppedJobs(ncalls, function(err, jobs) {
                        var doneMs = Date.now() - waitMs;
                        t.ifError(err);
                        t.equal(jobs.length, ncalls);
                        t.equal(jobs[0].exitcode, 200);
                        console.log("AR: total for batch of %d jobs: %d ms (jobs took %d ms avg each)", ncalls, doneMs - startMs, jobs[0].duration);
                        // node-v10: 165k /batchEcho jobs/sec 10k (70-200k/s 1k)
                        t.done();
                    })
                })
            })
        },

        'errors': {
            'converts an http error to 500': function(t) {
                var uut = this.uut;
                uut.runJobs('type-E', [{ id: 99, data: 'test-E1' }], { body: 'http://localhost:1338/echo' }, t.ifError);
                setTimeout(function() {
                    uut.getStoppedJobs(10, function(err, jobs) {
                        t.ifError(err);
                        t.equal(jobs.length, 1);
                        t.equal(jobs[0].exitcode, 500);
                        t.equal(jobs[0].code, 'ECONNREFUSED');
                        t.done();
                    })
                }, 10)
            },

            'converts an http timeout to 500': function(t) {
                var uut = new HttpRunner({ jobTimeoutMs: 10 });
                uut.runJobs('type-E', [{ id: 99, data: 'test-E1' }], { body: this.makeUrl('/sleep?sleepMs=100') }, t.ifError);
                setTimeout(function() {
                    uut.getStoppedJobs(10, function(err, jobs) {
                        t.ifError(err);
                        t.equal(jobs.length, 1);
                        t.equal(jobs[0].exitcode, 500);
                        t.equal(jobs[0].code, 'ETIMEDOUT');
                        t.done();
                    })
                }, 10)
            },
        },

        'batch errors': {
            'errors out batch jobs without a response': function(t) {
                var uut = this.uut;
                var jobs = [];
                for (var i = 0; i < 6; i++) jobs.push({ id: String(i), data: String(i) });
                uut.runJobs('type-B', jobs, { body: this.makeUrl('/halfBatch?size=2'), options: { batch: true } }, function(err) {
                    t.ifError(err);
                    setTimeout(function() {
                        uut.getStoppedJobs(100, function(err, jobs) {
                            t.ifError(err);
                            t.equal(jobs.length, 6);
                            t.deepEqual(jobs.map(function(j) { return j.exitcode }), [200, 200, 500, 500, 500, 500]);
                            t.deepEqual(jobs.map(function(j) { return j.code }), [
                                undefined, undefined, 'NO_RESPONSE', 'NO_RESPONSE', 'NO_RESPONSE', 'NO_RESPONSE']);
                            t.done();
                        })
                    }, 10)
                })
            },

            'errors out batch jobs after an invalid response': function(t) {
                var uut = this.uut;
                var jobs = [];
                for (var i = 0; i < 4; i++) jobs.push({ id: String(i), data: String(i) });
                uut.runJobs('type-B', jobs, { body: this.makeUrl('/badBatch?size=2'), options: { batch: true } }, function(err) {
                    t.ifError(err);
                    setTimeout(function() {
                        uut.getStoppedJobs(100, function(err, jobs) {
                            t.ifError(err);
                            t.equal(jobs.length, 4);
                            t.deepEqual(jobs.map(function(j) { return j.exitcode }), [200, 200, 500, 500]);
                            t.deepEqual(jobs.map(function(j) { return j.code }), [undefined, undefined, 'INVALID_RESPONSE', 'INVALID_RESPONSE']);
                            t.done();
                        })
                    }, 10)
                })
            },

            'errors out all jobs in batch on a request error': function(t) {
                function noop(){};
                var uut = this.uut;
                var jobs = [];
                for (var i = 0; i < 4; i++) jobs.push({ id: String(i), data: String(i) });
                t.stub(uut, 'microreq').yields(new Error('mock request error')).returns({ write: noop, end: noop });
                uut.runJobs('type-B', jobs, { body: this.makeUrl('/batchEcho'), options: { batch: true } }, function(err) {
                    setTimeout(function() {
                        uut.getStoppedJobs(100, function(err, jobs) {
                            t.ifError(err);
                            t.equal(jobs.length, 4);
                            t.deepEqual(jobs.map(function(j) { return j.exitcode }), [500, 500, 500, 500]);
                            t.deepEqual(jobs.map(function(j) { return j.code }), ['BATCH_ERROR', 'BATCH_ERROR', 'BATCH_ERROR', 'BATCH_ERROR']);
                            t.done();
                        })
                    }, 10)
                })
            },
        },
    },
}
