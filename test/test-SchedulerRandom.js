'use strict';

var SchedulerRandom = require('../lib/SchedulerRandom');

module.exports = {
    beforeEach: function(done) {
        this.cut = new SchedulerRandom();
        done();
    },

    'selectJobtypeToRun': {
        'returns a type': function(t) {
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

    'getRunningCounts': {
        'returns the count': function(t) {
            this.cut.jobsStarted('type-a', 7);
            this.cut.jobsStarted('type-a', 5);
            this.cut.jobsStarted('type-b', 3);
            this.cut.jobsStopped('type-a', 2);

            t.equal(this.cut.getRunningCounts('type-a'), 10);
            t.equal(this.cut.getRunningCounts('type-b'), 3);
            t.deepEqual(this.cut.getRunningCounts(), {'type-a': 10, 'type-b': 3});

            this.cut.jobsStopped('type-a', 9);
            this.cut.jobsStopped('type-b', 4);
            t.deepEqual(this.cut.getRunningCounts(), {'type-a': 1});

            t.done();
        },
    },
}
