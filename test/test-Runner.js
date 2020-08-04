'use strict';

var utils = require('../lib/utils');
var Runner = require('../lib/Runner');

module.exports = {
    'Runner': {
        'getBatchSize returns a number': function(t) {
            var uut = new Runner();
            t.equal(typeof uut.getBatchSize(), 'number');
            t.done()
        },

        'getRunningJobIds returns all ids': function(t) {
            var uut = new Runner();
            uut.waitingJobs = [{ id: 'c' }, { id: 'd' }];
            uut.runningJobs = { a: { id: 'a' }, b: { id: 'b' } };
            uut.stoppedJobs = [{ id: 'e' }, { id: 'f' }];
            uut.getRunningJobIds(function(err, ids) {
                t.deepEqual(ids, ['a', 'b', 'c', 'd', 'e', 'f']);
                t.done();
            })
        },

        'getStoppedJobs returns some stopped jobs': function(t) {
            var uut = new Runner();
            uut.stoppedJobs = [{ id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }];
            uut.getStoppedJobs(3, function(err, jobs) {
                t.deepEqual(jobs.map(function(job) { return job.id }), ['c', 'd', 'e']);
                t.done();
            })
        },

        'options': {
            'sets log': function(t) {
                var log = {};
                var uut = new Runner({ log: log });
                t.equal(uut.log, log);
                t.done();
            },

            'uses a default log': function(t) {
                var uut = new Runner();
                t.equal(typeof uut.log, 'object');
                t.equal(typeof uut.log.info, 'function');
                t.done();
            },

            'sets jobTimeoutMs': function(t) {
                var uut = new Runner({ jobTimeoutMs: 1234 });
                t.equal(uut._jobTimeoutMs, 1234);
                t.done();
            },
        },
    }
}
