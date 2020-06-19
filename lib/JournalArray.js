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
}
util.inherits(JournalArray, Journal);

/*
 * Append lines to the durable journal.
 * The lines should be an array of strings not containing newlines.
 */
JournalArray.prototype.write = function write( lines, callback ) {
    if (!Array.isArray(lines)) throw new Error('not an array');
    concat2(this.lines, lines);
    if (callback) this.syncWrite(callback);
}

/*
 * Wait for all already pending writes to be persisted.
 * Writes that arrive after this call will not be waited for.
 */
JournalArray.prototype.syncWrite = function syncWrite( callback ) {
    if (typeof callback !== 'function') throw new Error('not a function');
    callback();
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
    return token;
}

JournalArray.prototype.readCancel = function readCancel( token ) {
    var self = this;
    var lines = this.reservations[token];
    if (lines) {
        if (!lines.read) prepend2(self.lines, lines.lines);
        self.syncRead(token);
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
JournalArray.prototype.syncRead = function syncRead( token ) {
    var lines = this.reservations[token];
    if (lines) {
        clearTimeout(lines.timer);
        delete this.reservations[token];
    }
}

function prepend2( target, list ) {
    for (var i = list.length - 1; i >= 0; i--) target.unshift(list[i]);
}

function concat2( target, list ) {
    for (var i = 0; i < list.length; i++) target.push(list[i]);
    return target;
}

JournalArray.prototype = toStruct(JournalArray.prototype);
function toStruct(hash) { return toStruct.prototype = hash };
