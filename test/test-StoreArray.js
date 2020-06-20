'use strict';

var utils = require('../lib/utils');

var StoreArray = require('../lib/StoreArray');

module.exports = {
    'constructor': {
        'returns instance': function(t) {
            t.ok(new StoreArray() instanceof StoreArray);
            t.ok(StoreArray() instanceof StoreArray);
            t.done();
        },
    },

    'addJobs': {
        'returns ids': function(t) {
            var cut = new StoreArray();
            cut.addJobs('type-1', [{}, {}, {}], function(err, ids) {
                t.ifError(err);
                t.equal(ids.length, 3);
                t.ok(ids[0] < ids[1]);
                t.ok(ids[1] < ids[2]);
                t.done();
            })
        },

        'adds many jobs quickly': function(t) {
            var uut = new StoreArray();
            var count = 0;
            var payload = ["data1", "data2", "data3", "data4", "data5"];
            var t1 = Date.now();
            utils.repeatUntil(function(done) {
                uut.addJobs('type1', payload, function(err) {
                    // 90 ms for 300k in batches of 10
                    done(err, (count += payload.length) >= 300000);
                })
            }, function(err) {
                var t2 = Date.now();
console.log("AR: added 300k jobs in batches of %d in %d ms", payload.length, t2 - t1);
                t.done(err);
            })
        },
    },

    'getJobtypes': {
        'returns the ready jobtypes': function(t) {
            var cut = new StoreArray();
            utils.iterateSteps([
                function(next) {
                    cut.getJobtypes(next);
                },
                function(next, types) {
                    t.deepEqual(Object.keys(types), []);
                    cut.addJobs('type-1', [{}, {}], function(err, ids) {
                        if (err) return next(err);
                        cut.getJobtypes(next);
                    })
                },
                function(next, types) {
                    t.deepEqual(Object.keys(types), ['type-1']);
                    cut.addJobs('type-0', [{}], function(err, ids) {
                        if (err) return next(err);
                        cut.getJobtypes(next);
                    })
                },
                function(next, types) {
                    t.deepEqual(Object.keys(types).sort(), ['type-0', 'type-1']);
                    cut.addJobs('type-2', [{}, {}, {}], function(err, ids) {
                        if (err) return next(err);
                        cut.addJobs('type-3', [{}, {}], function(err, ids) {
                            if (err) return next(err)
                            // make type-3 jobs not elighible to be picked, should then be omitted from list
                            var jobs = cut._filterJobs(function(job) { return job.type === 'type-3' }, { fetch: true });
                            t.equal(jobs.length, 2);
                            jobs[0].lock = 'someLock';
                            jobs[1].dt = new Date(Date.now() + 1000);
                            cut.getJobtypes(next);
                        })
                    })
                },
                function(next, types) {
                    t.deepEqual(Object.keys(types).sort(), ['type-0', 'type-1', 'type-2']);
                    cut.addJobs('type-3', [{}], { delayMs: 100 }, function(err, ids) {
                        if (err) return next(err);
                        cut.getJobtypes(next);
                    })
                },
                function(next, types) {
                    t.deepEqual(Object.keys(types).sort(), ['type-0', 'type-1', 'type-2']);
                    next();
                },
            ], function(err) {
                t.done(err);
            });
        },
    },

    'getAllJobtypes': {
        'returns all jobtypes': function(t) {
            var uut = new StoreArray();
            utils.iterateSteps([
                function(next) {
                    uut.addJobs('type-1', [{}, {}], next);
                },
                function(next) {
                    uut.addJobs('type-2', [{}, {}], next);
                },
                function(next) {
                    uut._filterJobs(function(job) { job.lock = 'someLock' });
                    uut.getAllJobtypes(next);
                },
                function(next, types) {
                    t.deepEqual(Object.keys(types).sort(), ['type-1', 'type-2']);
                    next();
                }
            ], function(err) {
                t.done(err);
            })
        },
    },
}
