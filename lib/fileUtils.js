'use strict';

var fs = require('fs');
var readline = require('readline');

var utils = require('./utils');

var nodeMajor = parseInt(process.versions.node.match(/^(\d+)\.(\d+)/)[1]);
var nodeMinor = parseInt(process.versions.node.match(/^(\d+)\.(\d+)/)[2]);
var trimTrailingNewline = eval('true && ((nodeMajor === 0 && nodeMinor < 10) ? function(line) { return line.slice(0, -1) } : function(line) { return line })');

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

function makeLineReader( filepath ) {
    // TODO: options
// FIXME: need to pass in and use options.start (byte offset in file to start reading)
// FIXME: need to track and know the current byte read offset
    var readBufferSize = 128000;
    var lineBufLength = 5;

    // pre-create the file to avoid the createReadStream exception
    if (!fileExists(filepath)) fs.appendFileSync(filepath, "");
    var stream = fs.createReadStream(filepath, { highWaterMark: readBufferSize });

    // create a readline to fetch lines from the file stream
    // old readline took (input, output, completer, terminal), new takes (options)
    // old readline requires a non-empty output stream, v0.8 and v0.10 test output.isTTY
    var rl = readline.createInterface(stream, { isTTY: false });

    var reader = {
        eof: false,
        paused: true,
        lines: new Array(),
        error: null,
        rl: rl,
        gets: function gets() {
            if (reader.lines.length) return reader.lines.shift();
            if (reader.error || reader.eof) return undefined;
            if (reader.paused) { reader.rl.resume(); reader.paused = false }

            // an undefined line can mean eof, error, or read pending
            return undefined;
        },
        flush: function flush() {
            return reader.lines.splice(0);
        },
    };
    stream.on('error', function(err) { reader.error = reader.error || err; reader.eof = true });
    reader.rl.on('close', function() { reader.eof = true });
    // nb: node-v0.10 does not pause mid-buffer, only after all read lines have been emitted
    // nb: node-v0.8 does not trim the newline from the emitted lines, newer versions do
    // TODO: check which version introduced the change, whether 0.9 is also affected
    reader.rl.on('line', function(line) { if (reader.lines.push(trimTrailingNewline(line)) >= lineBufLength) { reader.rl.pause(); reader.paused = true } });

    reader.rl.pause();
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
