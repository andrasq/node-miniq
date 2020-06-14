'use strict';

var aflow = require('aflow');
var getIds = require('../lib/getIds');
var getIds = require('../lib/utils').getIds;

module.exports = {
    'returns monotonically increasing ids': function(t) {
        var ids = getIds('-mque-', 3);
console.log("AR: got ids", ids);
        t.ok(ids[0] < ids[1]);
        t.ok(ids[1] < ids[2]);
        t.done();
    },

    'can generate many ids in one call without duplicates': function(t) {
        var t1 = Date.now();
        var ids = getIds('-mque-', 300000);
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
            ids.push(getIds('-mque-', 1)[0]);
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
}
