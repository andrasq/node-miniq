/*
 * qfifo - simple file-based first-in first-out line queue
 *
 * The file operations are not atomic, so only one process must access
 * the file at a time.
 *
 * 2020-08-26 - AR.
 */

'use strict';

var fs = require('fs');
var utils = require('./utils');
var fileUtils = require('./fileUtils');

module.exports = QFifo;

function QFifo( path ) {
    this.fifopath = path;
    this.hdrpath = path + '.hdr';
    this.writing = false;
    this.chunks = new Array();
    this.error = null;
    this.eof = false;
    this.busyWaitTimeout = 200;
    this.mutex = new utils.Mutex();
    this.header = utils.assignTo({}, tryCall(function() { JSON.parse(fs.readyFileSync(this.hdrpath)) }) || {});
    this.header.offset = 0 + (this.header.offset || 0);
    this.lineReader = this.reopen();
}
function tryCall(fn, _default) { try { return fn() } catch (err) { return _default } }

QFifo.prototype.reopen = function reopen( ) {
    return this.lineReader = fileUtils.makeLineReader(this.fifopath, { start: this.header.offset || 0});
}

function noop() {}
QFifo.prototype.push = function push( line, callback ) {
    if (line && line[line.length - 1] !== '\n') line += '\n';
    this.chunks.push({ data: line, cb: callback || noop });
    if (!this.writing) this.writeLoop();
}

QFifo.prototype.shift = function shift( callback ) {
    var line = this.lineReader.gets();
    this.eof = this.lineReader.eof;
    if (line) this.header.offset += Buffer.byteLength(line) + 1;
    return line || '';
}

QFifo.prototype.rsync = function rsync( callback ) {
    fs.writeFile(this.hdrpath, JSON.stringify(this.header), callback);
}

QFifo.prototype.wsync = function wsync( callback ) {
    var err = this.error;
    this.error = null;
    // null is a special data value that will just invoke the callback but not write
    err ? callback(err) : this.push(null, callback);
}

// keep writing chunks until caught up
QFifo.prototype.writeLoop = function writeLoop( ) {
    var self = this;

    self.writing = true;
    utils.repeatUntil(function(done) {
        var chunk;
        self.mutex.acquire(function(release) {
            utils.iterateSteps([
                // write 3 chunks before pausing the lock
                function(next) { chunk = self.chunks.shift(); next() },
                function(next) { chunk && chunk.data !== null ? fs.appendFile(self.fifopath, chunk.data, next) : next() },
                function(next) { chunk && chunk.cb((chunk = null)); next() },

                function(next) { chunk = self.chunks.shift(); next() },
                function(next) { chunk && chunk.data !== null ? fs.appendFile(self.fifopath, chunk.data, next) : next() },
                function(next) { chunk && chunk.cb((chunk = null)); next() },

                function(next) { chunk = self.chunks.shift(); next() },
                function(next) { chunk && chunk.data !== null ? fs.appendFile(self.fifopath, chunk.data, next) : next() },
                function(next) { chunk && chunk.cb((chunk = null)); next() },
            ],
            function(err) {
                // TODO: mutex timeout
                if (err /* && err.code !== 'ETIMEOUT' */) {
                    // on error fail all writes and the first wsync
                    self.error = err;
                    var chunks = self.chunks;
                    self.chunks = new Array();
                    chunks.unshift(chunk || {cb: noop});
                    for (var i = 0; i < chunks.length; i++) chunks[i].cb(err);
                }
                release();
                done(err, !self.chunks.length);
            })
        })
    },
    function(err) {
        self.writing = false;
        // TODO: if (err) self.error('qfifo write error:', err);
    })
}

QFifo.prototype = utils.toStruct(QFifo.prototype);
