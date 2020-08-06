'use strict';

var util = require('util');
var utils = require('./utils');

module.exports = SysidStore;

var MINUTES = 60 * 1000;

function SysidStore( log, store ) {
    this.log = log;
    this.store = store;
    this.sysidExpireMs = 10 * MINUTES;
}

SysidStore.prototype.configure = function configure( options ) {
    // ??
}

SysidStore.prototype.getSysid = function getSysid( callback ) {
    // insert pre-locked job of type 'queue.sysid', trust addJobs to error out if id already present
    // CAUTION: this works only if the job store enforces unique ids.
    var sysid, self = this;
    utils.repeatUntil(function(done, tryCount) {
        if (tryCount > 20) return done(new Error('getSysid: too many tries'));
        sysid = utils.pad(utils.encode64(String(Math.random() * 0x1000000 >>> 0)), 4);
        var expireDt = new Date(utils.getNewerTimestamp(0) + self.sysidExpireMs);
        var sysidJob = { id: sysid, type: 'queue.sysid', dt: expireDt, lock: sysid };
// FIXME: should log and emitStat that obtained a sysid
console.log("AR: generated sysid job", sysidJob);
        self.store.addJobs([sysidJob], done);
        self._emitStats('getSysid.try', { pid: process.pid, sysid: sysid });
    }, function(err) {
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

SysidStore.prototype._emitStats = function _emitStats( name, value ) {
    this.log.debug('stat:SysidStore.' + name, value);
}
