'use strict';

var utils = require('./utils');
var Store = require('./Store');

module.exports = HandlerStore;
module.exports.JobHandler = JobHandler;

function JobHandler( config ) {
    utils.deassign(this, config, {
        eid: 1,
        lang: 1,
// TODO: rename to source or something (both here and in QUEUE)
        body: 1,
        before: 1,
        beforeEach: 1,
        afterEach: 1,
        options: 1,
    });
}

function HandlerStore( store ) {
    this.handlerExpireDate = new Date('3000-01-01');    // handler expiration timestamp
    this.handlerDeleteDate = new Date('3000-01-02');    // handler delete-if-expires-before timestamp
    this.store = store;
}

// handlers are stored as jobs pre-locked by __handler
HandlerStore.prototype.getHandler = function getHandler( jobtype, callback ) {
    if (typeof callback !== 'function') throw new Error('callback required');
    this.store.getLockedJobs(jobtype, Store.LOCK_HANDLER, 1000, function(err, jobs) {
        // return the handler with the newest id, since we set all expiration dates to Jan 1 3000
        // NOTE: only 1000 handlers are examined, old handlers should be purged manually.
        if (jobs && jobs.length > 1) jobs.sort(function(a, b) { return a.id >= b.id ? -1 : 1 });
        callback(err, err || !jobs.length ? null : new JobHandler(jobs[0].data));
    })
}

HandlerStore.prototype.setHandler = function setHandler( sysid, jobtype, handler, callback ) {
// TODO: rename body -> source or something
    if (typeof callback !== 'function') throw new Error('callback required');
    if (!handler.lang || !handler.body) throw new Error('lang and body required');
    this.store.addJobs([{
        id: utils.getId(sysid),
        type: jobtype,
        dt: this.handlerExpireDate,
        lock: Store.LOCK_HANDLER,
        data: new JobHandler(handler),
    }], callback);
}

HandlerStore.prototype.deleteHandler = function deleteHandler( jobtype, callback ) {
    this.store.expireJobs(jobtype, Store.LOCK_HANDLER, this.handlerDeleteDate, 999999, callback);
}
