'use strict';

module.exports = JournalArray;

var util = require('util');
var Journal = require('./Journal');

/*
 * Journal to checkpoint job data.
 * The data is stored as newline terminated strings saved in arrival order.
 */
function JournalArray( ) {
    this.lines = new Array();
    this.readCount = 0;
    this.reservations = {};
    this.syncIntervalMs = 10;
    this.wsyncCallbacks = new Array();
    this.wsyncTimer = null;
}
util.inherits(JournalArray, Journal);

/*
 * Append lines to the durable journal.
 * The lines should be an array of strings not containing newlines.
 */
JournalArray.prototype.write = function write( lines, callback ) {
    var count = concat2(this.lines, Array.isArray(lines) ? lines : lines.split('\n'));
    if (callback && typeof callback !== 'function') throw new Error('not a function');
    if (callback) this.wsync(function() { callback(null, count) });
}

/*
 * Wait for all already pending writes to be persisted.
 * Writes that arrive after this call will not be waited for.
 */
JournalArray.prototype.wsync = function wsync( callback) {
    if (typeof callback !== 'function') throw new Error('not a function');
    this.wsyncCallbacks.push(callback);

    // JournalArray writes are inherently synchronous, but still batch the callbacks,
    // it`s more efficient for journals that actually write to durable store.
    // Callbacks are invoked every 1/100 seconds.
    var self = this;
    if (!this.wsyncTimer) this.wsyncTimer = setTimeout(function() {
        self.wsyncTimer = null;
        var callbacks = self.wsyncCallbacks;
        self.wsyncCallbacks = new Array();
        // wait for in progress writes to finish
        runCallbacks(null, callbacks);
    }, this.syncIntervalMs);
}

/*
 * Reserve the next n lines exclusively for the caller.
 * The lines must be read within timeoutMs milliseconds, else the reservation is broken
 * and the lines will be handed to the next caller.
 */
JournalArray.prototype.readReserve = function readReserve( nlines, timeoutMs ) {
    if (!timeoutMs) throw new Error('missing timeout');
    var token = (this.readCount += 1);
    var lines = { token: token, lines: this.lines.splice(0, nlines), read: false, timer: null };
    this.reservations[token] = lines;
    var self = this;
    lines.timer = setTimeout(function() { self.readCancel(token) }, timeoutMs);
    lines.timer.unref();
    return token;
}

JournalArray.prototype.readCancel = function readCancel( token ) {
    var self = this;
    var lines = this.reservations[token];
    if (lines) {
        if (!lines.read) prepend2(self.lines, lines.lines);
        self.rsync(token);
    }
}

/*
 * Return the reserved lines associated with the token.
 */
JournalArray.prototype.read = function read( token, callback ) {
    var lines = this.reservations[token];
    if (!lines) return callback(new Error('token expired'));
    if (lines.read) return callback(new Error('already read'), lines.lines);
    lines.read = true;
    callback(null, lines.lines);
}

/*
 * Commit the read previous reads, and advance the read point past them.
 */
JournalArray.prototype.rsync = function rsync( token ) {
    var lines = this.reservations[token];
    if (lines) {
        clearTimeout(lines.timer);
        delete this.reservations[token];
    }
}

function runCallbacks( err, callbacks ) {
    for (var i = 0; i < callbacks.length; i++) callbacks[i](err);
}

function prepend2( target, list ) {
    for (var i = list.length - 1; i >= 0; i--) target.unshift(list[i]);
}

function concat2( target, list ) {
    var count = 0;
    for (var i = 0; i < list.length; i++) if (list[i]) { target.push(list[i]); count++ }
    return count;
}

JournalArray.prototype = toStruct(JournalArray.prototype);
function toStruct(hash) { return toStruct.prototype = hash };
