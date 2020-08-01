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
        this.makeUri = function makeUri( path, options ) { return utils.assignTo({
            url: path[0] !== '/' ? path : 'http://0.0.0.0:1337' + path,
            encoding: 'utf8',
            method: 'POST',
        }, options || {}) };

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
                    self.httpCalls.body.push(String(requestBody));
                    switch (req.url) {
                    case '/echo':
                        res.end(JSON.stringify(params));
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
            t.ok(this.uut.getBatchSize() > 0);
            t.done();
        },

        'returns the configured size': function(t) {
            var uut = new HttpRunner({ batchSize: 123 });
            t.equal(uut.getBatchSize(), 123);
            t.done();
        },
    },

    'getRunningJobIds': {
        'returns ids of running jobs': function(t) {
t.skip();
        },

        'returns ids of stopped but uncollected jobs': function(t) {
t.skip();
        },
    },

    'runJobs': {
        'makes an http call': function(t) {
            var self = this;
            this.uut.runJobs('type1', [{ id: 1, data: 'test1' }], { body: this.makeUrl('/echo') });
            setTimeout(function() {
                t.equal(self.httpCalls.body[0], 'test1');
                t.done();
            }, 20);
        },

        'returns stopped jobs': function(t) {
            var self = this;
            this.uut.runJobs('type2', [{ id: 1, data: 'test21' }], { body: this.makeUrl('/sleep?sleepMs=5') });
            this.uut.runJobs('type2', [{ id: 2, data: 'test22' }], { body: this.makeUrl('/sleep?sleepMs=15') });
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
            }, 17);
        },

        'runs many jobs': function(t) {
            var ncalls = 1000;
            var self = this;
            var jobs = [];
            for (var i = 0; i < ncalls; i++) jobs.push({ id: i, data: 'test-' + utils.pad(String(i), 6) });
            this.uut.runJobs('type-k', jobs, { body: this.makeUrl('/echo') });
            utils.repeatUntil(function(done) {
                if (self.httpCalls.count < ncalls) return setTimeout(done, 2);
                setTimeout(done, 10, true);
            }, function() {
                t.equal(self.httpCalls.count, ncalls);
                t.deepEqual(self.httpCalls.body.slice(0, 3), ['test-000000', 'test-000001', 'test-000002']);
                self.uut.getStoppedJobs(10, function(err, jobs) {
                    // node-v10: 13k /echo jobs/sec 10k (6k/s 1k)
                    t.ifError(err);
                    t.equal(jobs.length, 10);
                    var ms = jobs.reduce(function(ms, job) { return job._ms < ms ? job._ms : ms }, Infinity);
// console.log("AR: fastest call: %d ms", ms);
                    t.equal(jobs[0].id, 0);
                    self.uut.getStoppedJobs(1e6, function(err, jobs) {
                        t.ifError(err);
                        t.equal(jobs.length, ncalls - 10);
                        t.done();
                    })
                })
            })
        },
    },
}