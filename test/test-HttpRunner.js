'use strict';

var http = require('http');
var request = require('microreq');
var microMw = require('microrest/mw');
var utils = require('../lib/utils');
var testUtils = require('../lib/testUtils');

var Runner = require('../lib/Runner');
var HttpRunner = require('../lib/HttpRunner');

module.exports = {
    before: function(done) {
        this.getUri = function(path, options) { return utils.assignTo({
            url: 'http://0.0.0.0:1337' + path,
            encoding: 'utf8',
        }, options || {}) };
        this.httpServer = http.createServer(function(req, res) {
            var params = {};
            var qq = req.url.indexOf('?');
            if (qq >= 0) {
                params = microMw.parseQuery(req.url.slice(qq + 1));
                req.url = req.url.slice(0, qq);
            }
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
        })
        this.httpServer.listen(1337, done);
    },

    after: function(done) {
        this.httpServer.close();
        done();
    },

    'constructor': function(t) {
        t.ok(testUtils.implements(new HttpRunner(), Runner));
        t.done();
    },

    'getBatchSize': {
        'returns the builtin size': function(t) {
            var uut = new HttpRunner();
            t.ok(uut.getBatchSize() > 0);
            t.done();
        },

        'returns the configured size': function(t) {
            var uut = new HttpRunner({ batchSize: 123 });
            t.equal(uut.getBatchSize(), 123);
            t.done();
        },
    },

    'httpServer': {
        'returns a response': function(t) {
            request(this.getUri('/echo?a=1&b=2', { encoding: 'json' }), function(err, res, body) {
                t.deepEqual(body, { a: 1, b: 2 });
                t.done();
            })
        },
    },
}
