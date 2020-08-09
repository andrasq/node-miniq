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
                    { id: 0, type: 'some-jobtype', lock: Store.LOCK_HANDLER, data: { lang: 'mock', body: 'x', foo: 'bar' } },
                    { id: 2, type: 'some-jobtype', lock: Store.LOCK_HANDLER, data: { lang: 'mock', body: 'z', foo: 'bar' } },
                    { id: 1, type: 'some-jobtype', lock: Store.LOCK_HANDLER, data: { lang: 'mock', body: 'y', foo: 'bar' } },
                ]
                this.uut.getHandler('some-jobtype', function(err, handler) {
                    t.ifError(err);
                    t.deepStrictEqual(utils.assignTo({}, handler), {
                        lang: 'mock',
                        body: 'z',
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
                t.spyOnce(uut.store, 'addJobs');
                uut.setHandler('sysid', 'jobtype', {lang: 'mock', body: 'x'}, function(err) {
                    t.ifError(err);
                    uut.getHandler('jobtype', function(err, handler) {
                        t.ifError(err);
                        t.contains(handler, {lang: 'mock', body: 'x'});
                        t.done();
                    })
                })
            },

            'saves handler fields': function(t) {
                var myHandler = { eid: 'eid', lang: 'cc', before: 'a', beforeEach: 'b', body: 'c', afterEach: 'd', options: {x: 123} };
                var uut = this.uut;
                uut.setHandler('sysid', 'my-jobtype', myHandler, function(err) {
                    t.ifError(err);
                    uut.getHandler('my-jobtype', function(err, handler) {
                        t.ifError(err);
                        t.contains(handler, myHandler);
                        t.done();
                    })
                })
            },

            'expires the handler in the far future': function(t) {
                var uut = this.uut;
                uut.setHandler('sysid', 'jobtype', { lang: 'js', body: '/* src */' }, function(err) {
                    t.ifError(err);
                    t.ok(uut.store.jobs[0].dt > new Date('2100-01-01'));
                    t.done();
                })
            },
        },

        'deleteHandler': {
            'removes the named handlers from the store': function(t) {
                var uut = this.uut;
                utils.iterateSteps([
                    function(next) {
                        uut.setHandler('sysid-1234', 'type-abc', { lang: 'lang12', body: 'body345' }, next);
                    },
                    function(next) {
                        uut.setHandler('sysid-1234', 'type-abc', { lang: 'lang12', body: 'body3456' }, next);
                    },
                    function(next) {
                        uut.setHandler('sysid-1234', 'type-abc', { lang: 'lang12', body: 'body34567' }, next);
                    },
                    function(next) {
                        t.equal(uut.store.jobs.length, 3);
                        next();
                    },
                    function(next) {
                        uut.deleteHandler('type-abc', next);
                    },
                    function(next) {
                        uut.getHandler('type-abc', next);
                    },
                    function(next, handler) {
                        t.strictEqual(handler, null);
                        t.equal(uut.store.jobs.length, 0);
                        next();
                    },
                ], t.done);
            },
        },
    },
}
