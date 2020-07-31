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
    });
}

function HandlerStore( store ) {
    this.store = store;
}

// handlers are stored as jobs pre-locked by __handler
HandlerStore.prototype.getHandler = function getHandler( jobtype, callback ) {
    if (typeof callback !== 'function') throw new Error('callback required');
    this.store.getNewestByType(jobtype, Store.LOCK_HANDLER, function(err, job) {
        callback(err, err ? null : new JobHandler(job.data));
    })
}

HandlerStore.prototype.setHandler = function setHandler( sysid, jobtype, handler, callback ) {
// TODO: rename body -> source or something
    if (typeof callback !== 'function') throw new Error('callback required');
    if (!handler.lang || !handler.body) throw new Error('lang and body required');
    this.store.addJobs([{
        id: utils.getId(sysid),
        type: jobtype,
        dt: new Date('3000-01-01'),
        lock: '__handler',
        data: new JobHandler(handler),
    }], callback);
}
