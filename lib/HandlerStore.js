'use strict';

var utils = require('./utils');

module.exports = HandlerStore;
module.exports.JobHandler = JobHandler;

function JobHandler( config ) {
    utils.deassign(this, {
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
    this.store.getNewestJob(jobtype, '__handler', function(err, job) {
        callback(err, err ? null : new JobHandler(job.data));
    })
}

HandlerStore.prototype.setHandler = function setHandler( sysid, jobtype, handler ) {
// TODO: rename body -> source or something
    if (!handler.lang || !handler.body) return callback(new Error('lang and body required'));
    this.store.insertJob({
        id: utils.getId(sysid), type: jobtype, dt: new Date('3000-01-01'), lock: '__handler', data: new JobHandler(handler),
    }, callback);
}
