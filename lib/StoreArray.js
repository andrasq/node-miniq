'use strict';

var utils = require('./utils');
var getIds = utils.getIds;

module.exports = StoreArray;

function assign( target, obj ) {
    var underscore = '_'.charCodeAt(0);
    for (var k in obj) if (k.charCodeAt(0) !== underscore) target[k] = obj[k];
    return target;
}

function timestamp( ms ) {
    var ts = new Date(utils.getNewerTimestamp(0));
    ts.setMilliseconds(ts.getMilliseconds() + ms);
    return ts;
}

function StoreArray( options ) {
    if (!(this instanceof StoreArray)) return new StoreArray(options);
    options = options || {};
    var sysid = this.sysid = options.sysid || '-mque-';
    this.getIds = options.getIds || function(count) { return getIds(sysid, count) };

    // waiting jobs are owned by no-one
    this.noOwner = '';
    this.lockDurationMs = 120000;
    // done jobs are owned by '__done' and are dated after year 5000
    this.doneOwner = '__done';
    this.doneDtOffsetMs = new Date('5000-01-01 00:00:00.000Z').getTime();

    this.jobs = [];
    this.handlers = {};
}

StoreArray.prototype.setHandler = function setHandler(jobtype, context, handler) {
    this.handlers[jobtype] = { context: context, handler: handler };
}
StoreArray.prototype.getHandler = function getHandler(jobtype) {
    return this.handlers[jobtype];
}
StoreArray.prototype.deleteHandler = function deleteHandler(jobtype) {
    this.handlers[jobtype] = undefined;
}

StoreArray.prototype.getJobtypes = function getJobtypes( callback ) {
    var now = timestamp(0);
    var types = {};
    for (var i = 0; i < this.jobs.length; i++) {
        var job = this.jobs[i];
        var type = this.jobs[i].type;
        if (job.owner === this.noOwner && job.dt <= now) {
            types[type] = types[type] ? types[type] + 1 : 1;
        }
    }
    callback(null, types);
}
StoreArray.prototype.getAllJobtypes = function getJobtypes( callback ) {
    var types = {};
    for (var i = 0; i < this.jobs.length; i++) {
        var type = this.jobs[i].type;
        types[type] = types[type] ? types[type] + 1 : 1;
    }
}
StoreArray.prototype.addJobs = function addJobs( type, payloads, options, callback ) {
    if (typeof options === 'function') { callback = options; options = {} }
    var ids = this.getIds(payloads.length);
    var runWhen = utils.getNewerTimestamp(0) + (options.delayMs || 0);
    for (var i = 0; i < payloads.length; i++) {
        this.jobs.push({
            type: type,
            dt: runWhen,
            owner: this.noOwner,
            id: ids[i],
            data: payloads[i],
        });
    }
    callback(null, ids);
}
StoreArray.prototype._filterJobs = function _filterJobs( filterFn, options ) {
    options = assign({ fetch: false, keep: true, limit: Infinity }, options);
    var selectedJobs = options.fetch ? [] : null;
    var recompact = !options.keep;

    for (var i = 0, j = 0, foundCount = 0; i < this.jobs.length; i++) {
        var job = this.jobs[i];
        var match = foundCount < options.limit && filterFn(job);
        if (match) {
            foundCount++;
            if (selectedJobs) selectedJobs.push(job);
        }
        else if (recompact && j !== i) {
            this.jobs[j++] = job;
        }
    }

    // trim array if we were compacting and some jobs were removed
    if (recompact && foundCount > 0) this.jobs.length -= foundCount;

    return selectedJobs || foundCount;
}
StoreArray.prototype._updateJobs = function _updateJobs( ids, owner, props, options ) {
    var select = typeof ids === 'function' ? ids : function(job) { return job.owner === owner && ids.indexOf(job.id) >= 0 };
    var filter = function(job) {
        if (select(job)) {
            assign(job, props);
            if (props._dtDelta) job.dt = new Date(job.dt + props._dtDelta);
            return true;
        }
    };
    return this._filterJobs(filter, options);
}
StoreArray.prototype.getJobs = function getJobs( type, limit, owner, callback ) {
    limit = typeof limit === undefined ? Infinity : limit;
    var now = timestamp(0);
    var noOwner = this.noOwner;
    var filter = function(job) { return job.type === type && job.owner === noOwner && job.dt >= now };
    var jobs = this._updateJobs(filter, null, { dt: timestamp(this.lockDurationMs), owner: owner }, { limit: limit });
    // the payload is already attached to the job
    callback(null, jobs);
}
// release, requeue, re-lock or archive jobs
//   release: deltaMs = -N, newOwner = ''
//   requeue: deltaMs = 0, newOwner = ''
//   re-lock: deltaMs = N, newOwner = owner
//   archive: deltaMs = +5000 years, newOwner = '__done'
//   to suspend, add +5000 years to job.dt but leave the owner empty
StoreArray.prototype.ungetJobs = function ungetJobs( ids, owner, callback ) {
    callback(null, this._updateJobs(ids, owner, { owner: this.noOwner, dt: timestamp(-this.lockDurationMs) }));
}
StoreArray.prototype.retryJobs = function retryJobs( ids, owner, delayMs, callback ) {
    callback(null, this._updateJobs(ids, owner, { dt: timestamp(delayMs), owner: this.noOwner }));
}
StoreArray.prototype.renewJobs = function renewJobs( ids, owner, callback ) {
    callback(null, this._updateJobs(ids, owner, { dt: timestamp(this.lockDurationMs) }));
}
StoreArray.prototype.doneJobs = function doneJobs( ids, owner, callback ) {
    callback(null, this._updateJobs(ids, owner, { owner: this.doneOwner, _dtDelta: this.doneDtOffsetMs }));
}
StoreArray.prototype.deleteJobs = function deleteJobs( ids, owner, callback ) {
    var removed = this._updateJobs(ids, owner, {}, { fetch: true, keep: false });
    callback(null, ids);
}
StoreArray.prototype.expireLocks = function expireLocks( now, callback ) {
    var noOwner = this.noOwner;
    this._filterJobs(function(job) {
        if (job.owner !== noOwner && job.dt < now) {
            job.owner = noOwner;
            job.dt = now;
        }
    })
    callback();
}
StoreArray.prototype = toStruct(StoreArray.prototype);
function toStruct(hash) { return toStruct.prototype = hash }
