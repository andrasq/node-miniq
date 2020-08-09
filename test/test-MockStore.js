'use strict';

var utils = require('../lib/utils');
var testUtils = require('../lib/testUtils');
var Store = require('../lib/Store');
var MockStore = require('../lib/MockStore');

module.exports = {
    setUp: function(done) {
        this.sysid = (Math.random() * 0x1000 >>> 0).toString(16);
        this.uut = new MockStore();
        done();
    },

    'constructor': {
        'returns a store': function(t) {
            var store = new MockStore();
            t.equal(typeof store.addJobs, 'function');
            t.equal(typeof store.getWaitingJobtypes, 'function');
            t.equal(typeof store.getJobs, 'function');
            t.equal(typeof store.releaseJobs, 'function');
            t.equal(typeof store.renewLocks, 'function');
            t.equal(typeof store.expireLocks, 'function');
            t.equal(typeof store.expireJobs, 'function');
            t.equal(typeof store.getLockedJobs, 'function');
            t.done();
        },

        'implements Store': function(t) {
            t.ok(testUtils.implements(new MockStore(), Store));
            t.done();
        },
    },

    'addJobs': {
        'inserts jobs visible to getWaitingJobtypes': function(t) {
            var store = this.uut;
            store.addJobs([
                { id: 'j1', type: 't1', dt: null, lock: '', data: null },
                { id: 'j2', type: 't1', dt: null, lock: '', data: null },
                { id: 'j3', type: 't1', dt: new Date(Date.now() + 1000), lock: '', data: null },
                { id: 'j4', type: 't2', dt: null, lock: '', data: null },
            ], function(err, rejects) {
                t.ifError(err);
                store.getWaitingJobtypes(function(err, types) {
                    t.ifError(err);
                    t.deepEqual(types, ['t1', 't2']);
                    store.getWaitingJobcounts(function(err, counts) {
                        t.ifError(err);
                        t.deepEqual(counts, { t1: 2, t2: 1 });
                        t.done();
                    })
                })
            })
        },

        'returns the rejects': function(t) {
            var store = this.uut;
            store.addJobs([
                {},
                undefined,
                { id: 'j1', type: 't1', dt: null, lock: '', data: null },
                null,
                false,
                0,
                { id: 'j2', type: 't2', dt: null, lock: '', data: null },
                'bogus',
            ], function(err, rejects) {
                t.ifError(err);
                t.deepStrictEqual(rejects, [{}, undefined, null, false, 0, 'bogus']);
                t.done();
            })
        },
    },

    'getWaitingJobtypes': {
        'returns an array': function(t) {
            var store = this.uut;
            store.addJobs([
            ], function(err) {
                t.ifError(err);
                store.getWaitingJobtypes(function(err, types) {
                    t.ifError(err);
                    t.ok(Array.isArray(types));
                    t.deepEqual(types, []);
                    t.done();
                })
            })
        },

        'returns array of types ready to run': function(t) {
            var store = this.uut;
            store.addJobs([
                { id: 'j1', type: 't1', dt: null, lock: '', data: null },
                { id: 'j2', type: 't2', dt: new Date(Date.now() + 1000), lock: '', data: null },
                { id: 'j3', type: 't1', dt: null, lock: '', data: null },
            ], function(err) {
                t.ifError(err);
                store.getWaitingJobtypes(function(err, types) {
                    t.ifError(err);
                    t.deepEqual(types, ['t1']);
                    t.done();
                })
            })
        },
    },

    'getJobs': {
        beforeEach: function(done) {
            this.uut.addJobs([
                { id: 'j0', type: 't0', dt: null, lock: '', data: null },
                { id: 'j1', type: 't1', dt: null, lock: '', data: null },
                { id: 'j2', type: 't2', dt: null, lock: '', data: null },
                { id: 'j3', type: 't1', dt: null, lock: '', data: null },
                { id: 'j4', type: 't1', dt: new Date(Date.now() + 1000), lock: '', data: null },
            ], done);
        },

        'returns limit jobs': function(t) {
            this.uut.getJobs('t1', 2, this.sysid, 1000, function(err, jobs) {
                t.ifError(err);
                t.equal(jobs.length, 2);
                t.equal(jobs[0].type, 't1');
                t.equal(jobs[1].type, 't1');
                t.done();
            })
        },

        'returns only eligible jobs': function(t) {
            this.uut.getJobs('t1', 4, this.sysid, 1000, function(err, jobs) {
                t.ifError(err);
                t.equal(jobs.length, 2);
                t.equal(jobs[0].id, 'j1');
                t.equal(jobs[1].id, 'j3');
                t.done();
            })
        },

        'skips ineligible jobs': function(t) {
            this.uut.getJobs('t9', 10, this.sysid, 1000, function(err, jobs) {
                t.ifError(err);
                t.equal(jobs.length, 0);
                t.done();
            })
        },
    },

    'renewLocks': {
        'updates timestamps': function(t) {
            var sysid = this.sysid;
            var store = this.uut;
            var nowDt = new Date();
            var runningJobs;
            utils.iterateSteps([
                function(next) { store.addJobs([{ id: 'j1', type: 't1', dt: null, lock: '', data: null }], next); },
                function(next) { store.addJobs([{ id: 'j2', type: 't1', dt: null, lock: '', data: null }], next); },
                function(next) { store.addJobs([{ id: 'j3', type: 't1', dt: null, lock: '', data: null }], next); },
                function(next) { store.getJobs('t1', 1, sysid + '-other', 1000, next); },
                function(next) { store.getJobs('t1', 1, sysid, 1000, next); },
                function(next, jobs) {
                    t.equal(jobs.length, 1);
                    runningJobs = jobs;
                    next();
                },
                function(next) { store.renewLocks([runningJobs[0].id], sysid, 7200000, next) },
                function(next) { store.getLockedJobs(null, sysid, 100, next) },
                function(next, jobs) {
                    t.equal(jobs.length, 1);
                    t.ok(+jobs[0].dt >= +nowDt + 7200000);
                    next();
                }
            ],
            t.done);
        },
    },

    'releaseJobs': {
        'requeues jobs with dt depending on how released': function(t) {
            var sysid = this.sysid;
            var store = this.uut;
            var runningJobs;
            utils.iterateSteps([
                function(next) {
                    store.addJobs([
                        { id: 'j1', type: 't1', dt: null, lock: '', data: null },
                        { id: 'j2', type: 't1', dt: null, lock: '', data: null },
                        { id: 'j3', type: 't1', dt: null, lock: '', data: null },
                    ], next);
                },
                function(next) {
                    store.getJobs('t1', 10, sysid, 1000, next);
                },
                function(next, jobs) {
                    runningJobs = jobs;
                    t.equal(jobs.length, 3);
                    store.getWaitingJobtypes(function(err, types) {
                        t.deepEqual(types, []);
                        next();
                    })
                },
                function(next) {
                    store.releaseJobs(['j1'], sysid, 'archive', function(err) {
                        store.getWaitingJobtypes(function(err, types) {
                            t.deepEqual(types, []);
                            next();
                        })
                    })
                },
                function(next) {
                    store.releaseJobs([runningJobs[1].id], sysid, 'retry', next);
                },
                function(next) {
                    store.releaseJobs([runningJobs[2].id], sysid, 'unget', next);
                },
                function(next) {
                    store.getWaitingJobcounts(function(err, counts) {
                        t.equal(counts.t1, 1);
                        next(err);
                    })
                },
                function(next) {
                    var now = Date.now();
                    t.stubOnce(Date, 'now', function() { return now + 600000 });
                    store.getWaitingJobcounts(function(err, counts) {
                        t.equal(counts.t1, 2);
                        next()
                    })
                },
            ],
            t.done);
        },
    },

    'expireLocks': {
        'breaks stale locks': function(t) {
            var sysid = this.sysid;
            var store = this.uut;
            var now = Date.now();
            utils.iterateSteps([
                function(next) { store.addJobs([{ id: 'j1', type: 't1', dt: new Date(now - 1000), lock: sysid }], next) }, // stale, crashed?
                function(next) { store.addJobs([{ id: 'j2', type: 't2', dt: new Date(now + 1000), lock: sysid }], next) }, // valid lock, running
                function(next) { store.addJobs([{ id: 'j3', type: 't3', dt: new Date(now - 1000), lock: sysid }], next) }, // stale, crashed?
                function(next) { store.addJobs([{ id: 'j4', type: 't4', dt: new Date(now), lock: '' }], next) },           // not locked, waiting
                function(next) { store.getWaitingJobtypes(next) },
                function(next, types) {
                    t.equal(types.length, 1);
                    t.deepEqual(types, ['t4']);
                    next();
                },
                function(next) { store.getRunningJobtypes(next) },
                function(next, types) {
                    t.equal(types.length, 3);
                    t.deepEqual(types, ['t1', 't2', 't3']);
                    next();
                },
                function(next) { store.expireLocks(next) },
                function(next) { store.getWaitingJobtypes(next) },
                function(next, types) {
                    t.equal(types.length, 3);
                    t.deepEqual(types, ['t1', 't3', 't4']);
                    next();
                },
            ],
            t.done);
        },
    },

    'expireJobs': {
        'requires lock or jobtype': function(t) {
            var store = this.uut;
            t.throws(function() { store.expireJobs() }, /jobtype or lock required/);
            t.done();
        },

        'accepts either absolute or relative cutoff date': function(t) {
            var sysid = this.sysid;
            var store = this.uut;
            var insertDt = new Date(Date.now() - 100);
            var doneDt = new Date(Date.now() + 1000 * 365.25 * 24 * 3600000);
            utils.iterateSteps([
                function(next) { store.addJobs([{ id: 'j1', type: 't1', dt: insertDt, lock: sysid, data: {} }], next) },
                function(next) { store.addJobs([{ id: 'j2', type: 't2', dt: insertDt, lock: sysid, data: {} }], next) },
                function(next) { store.addJobs([{ id: 'j3', type: 't1', dt: doneDt, lock: '__done', data: {} }], next) },

                function(next) { store.getLockedJobs('t1', sysid, 100, next) },
                function(next, jobs) { t.equal(jobs.length, 1); t.equal(jobs[0].id, 'j1'); next() },
                function(next) { store.expireJobs('t1', sysid, new Date(), 100, next) },
                function(next) { store.getLockedJobs('t1', sysid, 100, next) },
                function(next, jobs) { t.equal(jobs.length, 0); next() },

                function(next) { store.getLockedJobs('t1', '__done', 100, next) },
                function(next, jobs) { t.equal(jobs.length, 1); t.equal(jobs[0].id, 'j3'); next() },

                function(next) { store.getLockedJobs('t2', sysid, 100, next) },
                function(next, jobs) { t.equal(jobs.length, 1); t.equal(jobs[0].id, 'j2'); next() },
                function(next) { store.expireJobs('t2', sysid, 2000, 100, next) },
                function(next) { store.getLockedJobs('t2', sysid, 100, next) },
                function(next, jobs) { t.equal(jobs.length, 0); next() },
            ], t.done);
        },

        'removes and returns archived jobs': function(t) {
            var sysid = this.sysid;
            var store = this.uut;
            var doneDt = Date.now() - 7200000;
            utils.iterateSteps([
                function(next) { store.addJobs([{ id: 'j1', type: 't1', dt: new Date(), lock: sysid, data: {} }], next) },
                function(next) { store.addJobs([{ id: 'j2', type: 't2', dt: new Date(), lock: '', data: {} }], next) },
                function(next) { store.addJobs([{ id: 'j3', type: 't1', dt: new Date(), lock: sysid, data: {} }], next) },
                function(next) {
                    t.stubOnce(Date, 'now', function() { return doneDt });
                    store.releaseJobs(['j1', 'j3'], sysid, 'archive', next);
                },
                function(next) { store.getLockedJobs(null, '__done', 1, next) },
                function(next, jobs) {
                    t.equal(jobs.length, 1);
                    var cutoffDt = new Date(+Date.now() - 3600000);
                    cutoffDt.setFullYear(cutoffDt.getFullYear() + 1000);
                    store.expireJobs(null, '__done', cutoffDt, 100, next);
                },
                function(next, removed) {
                    t.equal(removed.length, 2);
                    t.equal(removed[0].id, 'j1');
                    t.equal(removed[1].id, 'j3');
                    next();
                },
                function(next) { store.getWaitingJobtypes(next) },
                function(next, types) {
                    t.deepEqual(types, ['t2']);
                    next();
                }
            ],
            t.done);
        },
    },

    'getLockedJobs': {
        'returns the matching jobs newest first': function(t) {
            this.uut.jobs = [
                { id: 1, type: 'typeA', dt: new Date(1000), lock: 'x' }, // wrong type
                { id: 2, type: 'typeB', dt: new Date(1000), lock: 'x' }, // yes
                { id: 6, type: 'typeB', dt: new Date(1000), lock: 'x' }, // yes
                { id: 3, type: 'typeB', dt: new Date(1002), lock: 'x' }, // <-- this one first
                { id: 7, type: 'typeB', dt: new Date(1001), lock: 'x' }, // yes
                { id: 4, type: 'typeA', dt: new Date(1001), lock: 'x' }, // wrong type
                { id: 5, type: 'typeB', dt: new Date(1003), lock: 'y' }, // wrong lock
            ];
            this.uut.getLockedJobs('typeB', 'x', 100, function(err, jobs) {
                t.ifError(err);
                t.equal(jobs.length, 4);
                t.contains(jobs[0], { id: 3, type: 'typeB', lock: 'x' });
                t.contains(jobs[1], { id: 7, type: 'typeB', lock: 'x' });
                t.contains(jobs[2], { type: 'typeB', lock: 'x' });
                t.contains(jobs[3], { type: 'typeB', lock: 'x' });
                t.contains([2, 6], jobs[2].id);
                t.contains([2, 6], jobs[3].id);
                t.done();
            })
        },
    },
}
