'use strict';

var util = require('util');
var utils = require('../lib/utils');
var Store = require('../lib/Store');
var MockStore = require('../lib/MockStore');
var SysidStore = require('../lib/SysidStore');

var SECONDS = 1000;

function DistinctStore( db ) {
    MockStore.call(this, db);
    this.ids = {};
}
util.inherits(DistinctStore, MockStore);
DistinctStore.prototype.addJobs = function addJobs( jobs, callback ) {
    for (var i = 0; i < jobs.length; i++) {
        var job = jobs[i];
        if (job && this.ids[job.id]) return callback(new Error('duplicate key ' + job.id));
        this.ids[job.id] = 1;
    }
    MockStore.prototype.addJobs.call(this, jobs, callback);
}

module.exports = {
    before: function(done) {
        this.uut = new SysidStore(utils.makeNoopLogger(), new DistinctStore(null));
        done();
    },

    'constructor': {
        'saves log, store and sets sysidExpreMs': function(t) {
            t.equal(typeof this.uut.log.info, 'function');
            t.equal(typeof this.uut.store.getJobs, 'function');
            t.ok(this.uut.sysidExpireMs > 20 * SECONDS);
            t.done();
        },

        'can configure': function(t) {
            this.uut.configure();
            t.done();
        },
    },

    'getSysid': {
        'returns unique sysids': function(t) {
            var uut = this.uut;
            var ids = {};
            var ncalls = 50000;
            utils.repeatUntil(function(done, n) {
                if (n >= ncalls) {
                    var keys = Object.keys(ids);
                    t.equal(keys.length, ncalls);
                    console.log("AR: got %dk sysids: %s ...", ncalls/1000, keys.slice(0, 5).join(', '));
                    return done(null, true);
                }
                uut.getSysid(function(err, sysid) {
                    t.ifError(err);
                    t.ok(sysid > '');
                    t.strictEqual(ids[sysid], undefined);
                    ids[sysid] = sysid;
                    done();
                })
            }, t.done);
        },

        'retries on store error': function(t) {
            var spy = t.stub(this.uut.store, 'addJobs')
              .onCall(0).yields('store error 1')
              .onCall(1).yields('store error 2')
              .onCall(2).yields();
            this.uut.getSysid(function(err, sysid) {
                t.ifError(err);
                t.ok(sysid > '');
                t.equal(spy.callCount, 3);
                t.done();
            })
        },

        'times out if too many retries': function(t) {
            var spy = t.stub(this.uut.store, 'addJobs').yields('store error');
            this.uut.getSysid(function(err, sysid) {
                t.ok(err);
                t.contains(err.message, /too many tries/);
                t.done();
            })
        }
    },

    'renewSysid': {
        'renews locks': function(t) {
            var uut = this.uut;
            var spy = t.spy(uut.store, 'renewLocks');
            uut.renewSysid('mock-id', function(err) {
                t.ifError(err);
                t.ok(spy.called);
                t.deepEqual(spy.args[0].slice(0, 3), [['mock-id'], 'mock-id', uut.sysidExpireMs]);
                t.done();
            })
        },

        'returns store errors': function(t) {
            var uut = this.uut;
            t.stub(uut.store, 'renewLocks').yields('mock-store-error');
            uut.renewSysid('mock-id', function(err) {
                t.equal(err, 'mock-store-error');
                t.done();
            })
        },
    },

    'releaseSysid': {
        'releases locks': function(t) {
            var uut = this.uut;
            var spy = t.spy(uut.store, 'releaseJobs');
            uut.releaseSysid('mock-id', function(err) {
                t.ifError(err);
                t.ok(spy.called);
                t.deepEqual(spy.args[0].slice(0, 3), [['mock-id'], 'mock-id', 'unget']);
                t.done();
            })
        },

        'returns store errors': function(t) {
            var uut = this.uut;
            t.stub(uut.store, 'releaseJobs').yields('mock-store-error');
            uut.releaseSysid('mock-id', function(err) {
                t.equal(err, 'mock-store-error');
                t.done();
            })
        },
    },

    'expireSysids': {
        'calls expireJobs': function(t) {
            var uut = this.uut;
            var spy = t.spy(uut.store, 'expireJobs');
            uut.expireSysids(function(err) {
                t.ifError(err);
                t.equal(spy.callCount, 1);
                t.deepEqual(spy.args[0].slice(0, 3), [Store.TYPE_SYSID, Store.LOCK_NONE, 0]);
                t.ok(spy.args[0][3] > 0);
                t.done();
            })
        },

        'returns store errors': function(t) {
            var uut = this.uut;
            t.stub(uut.store, 'expireJobs').yields('mock-store-error');
            uut.expireSysids(function(err) {
                t.equal(err, 'mock-store-error');
                t.done();
            })
        },
    },
}
