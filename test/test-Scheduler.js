'use strict';

var Scheduler = require('../lib/Scheduler');

module.exports = {
    beforeEach: function(done) {
        this.cut = new Scheduler();
        done();
    },

    'selectJobtypeToRun': {
        'returns a waiting jobtype': function(t) {
            var typeCounts = { 'a': 10, 'b': 100, 'c': 1000 };
            var type = this.cut.selectJobtypeToRun(typeCounts);
            t.contains(['a', 'b', 'c'], type);
            t.done();
        },
    },

    'getRunningCounts': {
        'returns the number of jobs running of the given type': function(t) {
            this.cut.jobsStarted('type-a', 5);
            this.cut.jobsStarted('type-b', 3);
            this.cut.jobsStarted('type-c', 0);
            t.equal(this.cut.getRunningCounts('type-a'), 5);
            t.equal(this.cut.getRunningCounts('type-b'), 3);
            t.equal(this.cut.getRunningCounts('type-c'), 0);
            t.equal(this.cut.getRunningCounts('type-d'), 0);
            t.done();
        },

        'returns the count of jobtypes not stopped': function(t) {
            this.cut.jobsStarted('type-a', 7);
            this.cut.jobsStarted('type-a', 5);
            this.cut.jobsStarted('type-b', 3);
            this.cut.jobsStopped('type-a', 2);

            t.equal(this.cut.getRunningCounts('type-a'), 10);
            t.equal(this.cut.getRunningCounts('type-b'), 3);
            t.deepEqual(this.cut.getRunningCounts(), {'type-a': 10, 'type-b': 3});

            this.cut.jobsStopped('type-a', 9);
            this.cut.jobsStopped('type-b', 4);
            t.deepEqual(this.cut.getRunningCounts(), {'type-a': 1, 'type-b': 0});

            t.done();
        },
    },

    'edge cases': {
        'compacts the runningTypes counts': function(t) {
            var cut = new Scheduler({ gcIntervalMs: 5 });
            cut.jobsStarted('type-a', 2);
            cut.jobsStarted('type-b', 1);
            cut.jobsStopped('type-a', 2);
            t.deepEqual(cut.getRunningCounts(), {'type-a': 0, 'type-b': 1});
            setTimeout(function() {
                t.deepEqual(cut.getRunningCounts(), {'type-b': 1});
                cut.jobsStopped('type-b', 2); // intentionally too many
                setTimeout(function() {
                    t.deepEqual(cut.getRunningCounts(), {});
                    t.done();
                }, 10);
            }, 10);
        },
    },
}
