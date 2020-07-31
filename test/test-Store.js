'use strict';

var Store = require('../lib/Store');

module.exports = {
    beforeEach: function(done) {
        this.uut = new Store();
        done();
    },

    'exports a constructor with expected methods': function(t) {
        t.equal(typeof Store, 'function');
        var uut = new Store();
        t.equal(typeof uut.addJobs, 'function');
        t.equal(typeof uut.getWaitingJobtypes, 'function');
        t.done();
    },

    'getWaitingJobtypes': {
        'returns the types': function(t) {
            t.stub(this.uut, 'getWaitingJobcounts').yields(null, { t1: 11, t2: 222 });
            this.uut.getWaitingJobtypes(function(err, types) {
                t.ifError(err);
                t.deepEqual(types, ['t1', 't2']);
                t.done();
            })
        },

        'returns errors': function(t) {
            t.stub(this.uut, 'getWaitingJobcounts').yields('mock store error', { t1: 11, t2: 222 });
            this.uut.getWaitingJobtypes(function(err, types) {
                t.equal(err, 'mock store error');
                t.done();
            })
        },
    },
}
