'use strict';

var fs = require('fs');
var readline = require('readline');

var utils = require('./utils');

var nodeMajor = parseInt(process.versions.node.match(/^(\d+)\.(\d+)/)[1]);
var nodeMinor = parseInt(process.versions.node.match(/^(\d+)\.(\d+)/)[2]);
var echoLine = function echoLine(x) { return x };
var trimEol = eval('true && function(line) { return line[line.length - 1] == "\\n" ? line.slice(0, -1) : line }');
var trimTrailingNewline = eval('true && ((nodeMajor === 0 && nodeMinor < 9) ? function(line) { return trimEol(line) } : echoLine)');

module.exports = {
    pathJoin: pathJoin,
    fileExists: fileExists,
    makeLineReader: makeLineReader,
    grabFile: grabFile,
    concatFiles: concatFiles,
}

// path.join is slow, 5m/s vs 77m/s this
function pathJoin( dirname, filename ) { return dirname + '/' + filename }
function fileExists( path ) { try { return fs.existsSync(path) } catch (err) {} }

// readline notes:
// - old readline.createInterface took (input, output, completer, terminal), new takes (options)
// - old readline requires a non-empty output stream, v0.8 and v0.10 test output.isTTY
// - note: sometimes the 'close' event only arrives on the next event loop cycle
// - note: node-v10 and older does not return the last line if no terminating newline
// - nb: node-v0.10 does not pause() mid-buffer, only after all read lines have been emitted
// - nb: node-v0.8 does not trim the newline from the emitted lines, newer versions do
// - nb: node-v0.6 does not have appendFileSync
// - TODO: read in binary mode (buffer), grab length, decode with string_decoder
function makeLineReader( filepath, options ) {
    options = options || {};
    var readBufferSize = 128000;
    var lineBufLength = options.lineBufLength || 5;
    var bytesRead = options.start || 0;

    var stream, rl;
    var reader = { lines: [], eof: true, error: undefined };

    // pre-create the file to avoid the createReadStream exception
    if (!fileExists(filepath)) fs.appendFileSync(filepath, "");

    function reopenStream(filepath) {
        try {
            stream = null;
            stream = fs.createReadStream(filepath, { highWaterMark: readBufferSize, start: bytesRead, encoding: null });
            stream.on('error', function(err) { reader.error || (reader.error = err); reader.eof = true });
        } catch (err) { reader.eof = true; if (err.code !== 'ENOENT') reader.error = err }
    }

    function reopenReader(stream) {
        if (!stream) return null;
        rl = readline.createInterface(stream, { console: false, isTTY: false });
        rl.on('close', function() { reader.eof = true; if (rl._line_buffer > '') rl.emit('line', rl._line_buffer) });
        rl.on('line', function(line) {
            bytesRead += Buffer.byteLength(line);
            if (reader.lines.push(trimTrailingNewline(line)) >= lineBufLength) { reader.pause() } });
        rl.pause();
        reader.rl = rl;
    }

    function reopen() {
        reader.lines = reader.lines.slice(0);
        reader.eof = false;
        reopenStream(filepath);
        if (!reader.error) reopenReader(stream);
    }

    reader = {
        eof: false,
        paused: true,
        lines: new Array(),
        error: reader.error,
        rl: rl,
        gets: function gets() { return reader.lines.length ? reader.lines.shift()
            // an undefined line can mean eof, error, or read pending
            : ((reader.error || reader.eof || reader.resume()), undefined) },
        flush: function flush() {
            return reader.lines.splice(0) },
        reopen: function _reopen() {
            reader.lines = reader.lines.slice(); reader.eof = false; reopen() },
        pause: function pause() { if (!reader.paused) reader.rl.pause(); reader.paused = true },
        resume: function resume() { if (reader.paused) reader.rl.resume(); reader.paused = false },
    };

    reader.reopen();
    return reader;
}

function grabFile( oldpath, newpath, callback ) {
    if (!fileExists(oldpath)) fs.appendFileSync(oldpath, "");
    fs.rename(oldpath, newpath, callback);
}

function concatFiles( targetpath, dirname, filenames, callback ) {
    utils.repeatUntil(function(done) {
        if (filenames.length <= 0) return done(null, true);
        var filepath;
        utils.iterateSteps([
            function(next) {
                filepath = pathJoin(dirname, filenames.shift());
                next();
            },
            function(next) {
                fs.readFile(filepath, next);
            },
            function(next, data) {
                fs.appendFile(targetpath, data, next);
            },
            function(next) {
                // node before v0.10 only accepted fd in truncate, not path
                (nodeMajor === 0 && nodeMinor < 10) ? next() : fs.truncate(filepath, 0, next);
            },
            function(next) {
                // NOTE: if a file cannot be read or removed, the error will recur and stall the ingest loop
                // until the problem file is moved out of the way.
                // unlinkSync is much faster once the metadata is memory resident
                fs.unlinkSync(filepath);
                next();
            },
        ], done);
    }, callback);
}
