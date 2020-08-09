'use strict';

var os = require('os');
var util = require('util');

var utils = require('./utils');
var Store = require('./Store');

module.exports = SysidStore;

var MINUTES = 60 * 1000;

function SysidStore( log, store ) {
    this.log = log;
    this.store = store;
    this.sysidExpireMs = 30 * MINUTES;
    this.hostname = os.hostname().split('.')[0];
    this.sysprefix = this.hostname[0] + this.hostname[this.hostname.length - 1] + '-';
}

SysidStore.prototype.configure = function configure( options ) {
    // ??
    // this.hostname = options.hostname;
}

SysidStore.prototype.getSysid = function getSysid( callback ) {
    // insert pre-locked job of type Store.TYPE_SYSID, trust addJobs to error out if id already present
    // CAUTION: this works only if the job store enforces unique ids.
    var sysid, self = this;
    utils.repeatUntil(function(done, tryCount) {
        // 20 collisions suggests that over 95% of the sysid namespace is used
        if (tryCount > 20) return done(new Error('getSysid: too many tries'));

        sysid = self.sysprefix + utils.pad(utils.encode64(String(Math.random() * 0x1000000 >>> 0)), 4);
        var expireDt = new Date(utils.getNewerTimestamp(0) + self.sysidExpireMs);
        var sysidJob = { id: sysid, type: Store.TYPE_SYSID, dt: expireDt, lock: sysid };
        self._emitStats('getSysid.try', { pid: process.pid, sysid: sysid });
        self.store.addJobs([sysidJob], function(err) {
            return done(null, !err);
        })
    },
    function(err) {
        self._emitStats('getSysid.got', { pid: process.pid, sysid: sysid });
        callback(err, sysid);
    })}

SysidStore.prototype.renewSysid = function renewSysid( sysid, callback ) {
    this._emitStats('renewSysid', sysid);
    this.store.renewLocks([sysid], sysid, this.sysidExpireMs, callback);
}

SysidStore.prototype.releaseSysid = function releaseSysid( sysid, callback ) {
    this._emitStats('releaseSysid', sysid);
    this.store.releaseJobs([sysid], sysid, 'unget', callback);
}

SysidStore.prototype.expireSysids = function expireSysids( callback ) {
    // Sysids are stored as locked jobs.  A live server always keeps
    // its lock on the sysid fresh.  If the server stops, the sysid lock expires,
    // the lock is broken and reset to unclaimed.
    //
    this.store.expireJobs(Store.TYPE_SYSID, Store.LOCK_NONE, 0, 100, callback);
}

SysidStore.prototype._emitStats = function _emitStats( name, value ) {
    this.log.debug('stat:SysidStore.' + name, value);
}
