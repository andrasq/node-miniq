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
        this.httpCalls = { body: [] };

        this.makeUri = function(path, options) { return utils.assignTo({
            url: 'http://0.0.0.0:1337' + path,
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
                    case '/ok':
                        res.statusCode = 201;
                        res.end('OK');
                        break;
                    case '/slow':
                        setTimeout(function() {
                            res.statusCode = 200;
                            res.end();
                        }, 50);
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

    },
}
