'use strict';

var aflow = require('aflow');

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
            var payload = [{}, {}, {}, {}, {}];
            var t1 = Date.now();
            aflow.repeatUntil(function(done) {
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
            aflow.flow([
                function(next) {
                    cut.getJobtypes(next);
                },
                function(next, types) {
                    t.deepEqual(Object.keys(types), []);
                    cut.addJobs('type-1', [{}, {}], function(err, ids) {
                        t.ifError(err);
                        cut.getJobtypes(next);
                    })
                },
                function(next, types) {
                    t.deepEqual(Object.keys(types), ['type-1']);
                    cut.addJobs('type-0', [{}], function(err, ids) {
                        t.ifError(err);
                        cut.getJobtypes(next);
                    })
                },
                function(next, types) {
                    t.deepEqual(Object.keys(types).sort(), ['type-0', 'type-1']);
                    cut.addJobs('type-2', [{}, {}, {}], function(err, ids) {
                        t.ifError(err);
                        cut.getJobtypes(next);
                    })
                },
                function(next, types) {
                    t.deepEqual(Object.keys(types).sort(), ['type-0', 'type-1', 'type-2']);
                    cut.addJobs('type-3', [{}], { delayMs: 100 }, function(err, ids) {
                        t.ifError(err);
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
}
