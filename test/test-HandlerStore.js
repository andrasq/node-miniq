'use strict';

var utils = require('../lib/utils');
var Store = require('../lib/Store');
var HandlerStore = require('../lib/HandlerStore');
var MockStore = require('../lib/MockStore');

module.exports = {
    beforeEach: function(done) {
        this.uut = new HandlerStore(new MockStore({}));
        done();
    },

    'HandlerStore': {
        'getHandler': {
            'requires jobtype and callback': function(t) {
                var uut = this.uut;
                t.throws(function(){ uut.getHandler() }, /callback required/);
                t.throws(function(){ uut.getHandler('foo') }, /callback required/);
                t.throws(function(){ uut.getHandler('foo', 'bar') }, /callback required/);
                t.done();
            },

            'should retrieve handler': function(t) {
                this.uut.store.jobs = [
                    { type: 'some-jobtype', lock: Store.LOCK_HANDLER, data: { lang: 'mock', body: 'x', foo: 'bar' } }
                ]
                this.uut.getHandler('some-jobtype', function(err, handler) {
                    t.ifError(err);
                    t.deepStrictEqual(utils.assignTo({}, handler), {
                        lang: 'mock',
                        body: 'x',
                        eid: undefined,
                        before: undefined,
                        beforeEach: undefined,
                        afterEach: undefined,
                        options: undefined,
                    })
                    t.done();
                })
            },

            'should return db errors': function(t) {
                t.stubOnce(this.uut.store, 'getLockedJobs').yields('mock error');
                this.uut.getHandler('some-jobtype', function(err, handler) {
                    t.equal(err, 'mock error');
                    t.done();
                })
            },
        },

        'setHandler': {
            'requires callback': function(t) {
                var uut = this.uut;
                t.throws(function(){ uut.setHandler('sysid', 'jobtype', {}) }, /callback required/);
                t.throws(function(){ uut.setHandler('sysid', 'jobtype', {}, 333) }, /callback required/);
                t.done();
            },

            'requires lang and body': function(t) {
                var uut = this.uut;
                t.throws(function(){ uut.setHandler('sysid', 'jobtype', {}, t.done) }, /body required/);
                t.throws(function(){ uut.setHandler('sysid', 'jobtype', {lang: 'mock'}, t.done) }, /required/);
                t.throws(function(){ uut.setHandler('sysid', 'jobtype', {body: 'x'}, t.done) }, /required/);
                t.stub(uut.store, 'addJobs').yields();
                uut.setHandler('sysid', 'jobtype', {lang: 'mock', body: 'x'}, function(err) {
                    t.ifError(err);
                    t.done();
                })
            },

            'should save handler fields': function(t) {
t.skip();
            },
        },
    },
}
