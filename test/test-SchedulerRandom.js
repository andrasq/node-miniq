'use strict';

var testUtils = require('../lib/testUtils');
var Scheduler = require('../lib/Scheduler');
var SchedulerRandom = require('../lib/SchedulerRandom');

module.exports = {
    beforeEach: function(done) {
        this.cut = new SchedulerRandom({ gcIntervalMs: 5 });
        done();
    },

    'constructor': {
        'implements Scheduler': function(t) {
            t.ok(testUtils.implements(new SchedulerRandom(), Scheduler));
            t.done();
        },
    },

    'selectJobtypeToRun': {
        'returns one of the waiting jobtypes': function(t) {
            var typeCounts = { 'a': 10, 'b': 100, 'c': 1000 };
            var keys = Object.keys(typeCounts);
            var type;

            var scheduled = {};
            for (var i = 0; i < 100; i++) {
                type = this.cut.selectJobtypeToRun(typeCounts);
                scheduled[type] = 1;
            }
            t.deepEqual(scheduled, {a: 1, b: 1, c: 1});
            t.done();
        },
    },
}
