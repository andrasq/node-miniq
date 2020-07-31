'use strict';

var Job = require('../lib/Job');
var utils = require('../lib/utils');
var testUtils = require('../lib/testUtils');
var Runner = require('../lib/Runner');
var MockRunner = require('../lib/MockRunner');

module.exports = {
    'constructor': {
        'implements Runner': function(t) {
            t.ok(testUtils.implements(new MockRunner, Runner));
            t.done();
        },
    },

    beforeEach: function(done) {
        this.jobs = {
            job1: { id: 'job1', type: 'type1' },
            job2: { id: 'job2', type: 'type1' },
            job3: { id: 'job3', type: 'type3' },
        };
        this.mockHandlers = {
            'type1': { lang: 'mock', body: 'function() { return 1 }' },
            'type2': { lang: 'mock', body: 'function() { return 2 }' },
        };
        this.uut = new MockRunner();
        this.uut.uid = Math.random() * 100 >>> 0;
        done();
    },

    'getRunningJobIds': {
        'returns the jobs ids from the runningJobs table': function(t) {
            var uut = this.uut;
            var jobs = this.jobs;
            uut.runningJobs = jobs;
            uut.getRunningJobIds(function(err, runningJobIds) {
                t.ifError(err);
                t.deepEqual(runningJobIds, Object.keys(jobs));
                uut.getRunningJobIds(function(err, runningJobIds2) {
                    t.deepEqual(runningJobIds2, runningJobIds);
                    t.done();
                })
            })
        },
    },

    'getBatchSize': {
        'returns a positive number': function(t) {
            var val1 = this.uut.getBatchSize('type1');
            var val2 = this.uut.getBatchSize('type2');
            t.equal(typeof val1, 'number');
            t.ok(val1 > 0);
            t.equal(typeof val2, 'number');
            t.ok(val2 > 0);
            t.done();
        },
    },

    'getRunningJobtypes': {
        'returns the types of running jobs': function(t) {
            this.uut.runningJobs = this.jobs;
            this.uut.getRunningJobtypes(function(err, types) {
                t.ifError(err);
                t.deepEqual(types, ['type1', 'type3']);
                t.done();
            })
        },
    },

    'getStoppedJobs': {
        'removes and returns the jobs from the stoppedJobs table': function(t) {
            var uut = this.uut;
            var jobs = this.jobs;
            uut.stoppedJobs = jobs;
            uut.getStoppedJobs(function(err, stoppedJobs) {
                t.ifError();
                t.deepEqual(stoppedJobs, utils.valuesOf(jobs));
                uut.getStoppedJobs(function(err, stoppedJobs2) {
                    t.deepEqual(stoppedJobs2, []);
                    t.done();
                })
            })
        },
    },

    'runJobs': {
        'enters jobs into runningJobs table': function(t) {
            var uut = this.uut;
            var type1Jobs = utils.valuesOf(this.jobs).slice(0, 2);
            var ok = uut.runJobs('type1', type1Jobs, this.mockHandlers['type1']);
            uut.getRunningJobIds(function(err, runningJobIds) {
                t.ifError(err);
                t.equal(runningJobIds.length, 2);
                runningJobIds.forEach(function(id) { t.contains(uut.runningJobs[id], { id: id }) });
                t.done();
            })
        },

        'transitions jobs from running to stopped': function(t) {
            var uut = this.uut;
            uut.runJobs('mock-type', utils.valuesOf(this.jobs), this.mockHandlers['type1']);
            setTimeout(function() {
                uut.getStoppedJobs(10, function(err, stoppedJobs) {
                    t.ifError(err);
                    t.equal(stoppedJobs.length, 3);
                    t.deepEqual(uut.runningJobs, {});
                    t.done();
                })
            }, 25);
        },
    },

    'getStoppedJobs': {
    },
}