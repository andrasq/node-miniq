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
    this.fd = undefined;
    this.fifopath = path;
    this.hdrpath = path + '.hdr';
    this.writing = false;
    this.chunks = new Array();
    this.error = null;
    this.busyWaitTimeout = 200;
    this.mutex = new utils.Mutex();
    this.header = utils.assignTo({}, tryCall(function() { JSON.parse(fs.readyFileSync(this.hdrpath)) }) || {});
    this.header.offset = 0 + (this.header.offset || 0);
    this.lineReader = this.reopen();
}
function tryCall(fn, _default) { try { return fn() } catch (err) { return _default } }

QFifo.prototype.reopen = function reopen( ) {
    return this.lineReader = fileUtils.makeLineReader(this.fifopath, { start: this.header.offset || 0 });
}

function noop() {}
QFifo.prototype.push = function push( line, callback ) {
    if (line && line[line.length - 1] !== '\n') line += '\n';
    this.chunks.push({ data: line, cb: callback || noop });
    if (!this.writing) this.writeLoop();
}

QFifo.prototype.shift = function shift( callback ) {
    var line = this.lineReader.gets();
    if (line) this.header.offset += Buffer.byteLength(line) + 1;
    return line || '';
}

QFifo.prototype.isEof = function isEof( ) {
    return this.lineReader.isEof();
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

QFifo.prototype.write = function write( data, callback ) {
//
// FIXME: concat up to 200k of output, the write in one go.  Try not to allocate buffers too often.
//
    var self = this;
    utils.iterateSteps([
        function(next) { (self.fd !== undefined) ? next(null, self.fd) : fs.open(self.fifopath, 'a', next) },
        // maybe use a preallocated write buffer, concat chunks into buffer, write one buffer at a time
        function(next, fd) { self.fd = fd; fileUtils.writeFd(fd, data, next) },
    ],
    callback);
}

// keep writing chunks until caught up
QFifo.prototype.writeLoop = function writeLoop( ) {
    var self = this;

    self.writing = true;
    utils.repeatUntil(function(done) {
        var chunk;
        self.mutex.acquire(function(release) {
            var chunksToWrite = 5; // write 5 chunks before releasing the write mutex
            utils.repeatUntil(function(done) {
                chunk = self.chunks.shift();
                if (!chunk) return done(null, true);
                if (chunk.data === null) { chunk.cb((chunk = null)); done(null, !--chunksToWrite) }
                else self.write(chunk.data, function(err) { chunk.cb(err); done(err, !--chunksToWrite) });
            },
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
