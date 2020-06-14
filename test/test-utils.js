'use strict';

var aflow = require('aflow');
var utils = require('../lib/utils');

module.exports = {
    'countStat': {
        'counts stats on the stats object': function(t) {
            var stats = {};
            utils.countStat(stats, 'one', 2);
            utils.countStat(stats, 'one', 3);
            utils.countStat(stats, 'two', 1);
            t.deepEqual(stats, {one: 5, two: 1});
            t.done();
        },
    },

    'makeLog': {
        'returns logger': function(t) {
            var uut = utils.makeLog('test-log');
            t.equal(typeof uut.trace, 'function');
            t.equal(typeof uut.debug, 'function');
            t.equal(typeof uut.info, 'function');
            t.equal(typeof uut.warn, 'function');
            t.equal(typeof uut.error, 'function');
            t.done();
        },

        'logs objects to provided console': function(t) {
            var output = [];
            var con = { log: function(line) { output.push(line) } };
            var uut = utils.makeLog('test-log', con);
            uut.info('test1');
            uut.error('test2');
            t.equal(output.length, 2);
            t.equal(typeof output[0], 'object');
            t.ok(output[0].time);
            t.equal(output[0].type, 'test-log');
            t.equal(output[0].message, 'test1');
            t.equal(output[1].message, 'test2');
            t.done();
        },
    },

    'selectField': {
        'returns array with selected field': function(t) {
            t.deepEqual(utils.selectField([], 'a'), []);
            t.deepEqual(utils.selectField([{a:1}, {b:2}, {a:3}], 'a'), [1, undefined, 3]);
            t.done();
        },
    },

    'groupByField': {
        'return hash of arrays': function(t) {
            var items = [{id:1, a:1}, {id:2, a:1}, {id:3, a:3}, {id:3, a:1}];
            var hash = utils.groupByField(items, 'a');
            t.deepEqual(utils.groupByField(items, 'a'), {'1': [{id:1, a:1}, {id:2, a:1}, {id:3, a:1}], '3': [{id:3, a:3}]});
            t.deepEqual(utils.groupByField(items, 'id'), {'1': [{id:1, a:1}], '2': [{id:2, a:1}], '3': [{id:3, a:3}, {id:3, a:1}]});
            t.done();
        },
    },

    'pad': {
        'left-pads to width with zeros': function(t) {
            t.equal(utils.pad('1', 0), '1');
            t.equal(utils.pad('1', 1), '1');
            t.equal(utils.pad('1', 2), '01');
            t.equal(utils.pad('1', 3), '001');
            t.equal(utils.pad('1', 4), '0001');
            t.equal(utils.pad('1', 5), '00001');
            t.equal(utils.pad('1', 6), '000001');
            t.equal(utils.pad('1234', 20), '00000000000000001234');
            t.done();
        },
    },

    'getNewerTimestamp': {
        'returns a current-ish timestamp': function(t) {
            // prime this function, is off by 100ms on first call
            utils.getNewerTimestamp();
            for (var now, i = 0; i < 1000000; i++) {
                if (i % 100 === 0) now = Date.now();
                t.within(utils.getNewerTimestamp(0), now, 10, 'i = ' + i);
            }
            t.done();
        },

        'is non-decreasing': function(t) {
            var last = 0;
            for (var i = 0; i < 1000000; i++) {
                var ts = utils.getNewerTimestamp(0);
                t.ok(ts >= last, 'i = ' + i);
                last = ts;
            }
            t.done();
        },

        'is newer than provided timestamp': function(t) {
            var now = Date.now();
            t.ok(utils.getNewerTimestamp(now + 2) >= now + 2);
            t.done();
        },

        'also provides non-decreasing encoded timestamp string': function(t) {
            var last = '';
            for (var i = 0; i < 1000000; i++) {
                var ts = utils.getNewerTimestamp(0);
                var str = utils.getTimestampString();
                t.ok(str >= last, 'i = ' + i);
                last = str;
            }
            t.done();
        },
    },

    'getIds': {
        'returns monotonically increasing ids': function(t) {
            var ids = utils.getIds('-mque-', 3);
console.log("AR: got ids", ids);
            t.ok(ids[0] < ids[1]);
            t.ok(ids[1] < ids[2]);
            t.done();
        },

        'can generate many ids in one call without duplicates': function(t) {
            var t1 = Date.now();
            var ids = utils.getIds('-mque-', 300000);
            var t2 = Date.now();
console.log("AR: got %d ids in %d ms, %d/ms", ids.length, t2 - t1, (ids.length / (t2 - t1)) >>> 0);

            t.equal(ids.length, 300000);
            for (var i = 1; i < ids.length; i++) t.ok(ids[i - 1] < ids[i]);
            t.done();
        },

        'can generate many ids singly without duplicates': function(t) {
            var ids = new Array();
            var t1 = Date.now();
            aflow.repeatUntil(function(next) {
                ids.push(utils.getIds('-mque-', 1)[0]);
                next(null, ids.length >= 300000);
            },
            function(err) {
                var t2 = Date.now();
console.log("AR: got %d ids in %d ms, %d/ms", ids.length, t2 - t1, (ids.length / (t2 - t1)) >>> 0);

                t.equal(ids.length, 300000);
                for (var i = 1; i < ids.length; i++) t.ok(ids[i - 1] < ids[i]);
                t.done();
            })
        }
    },
}
