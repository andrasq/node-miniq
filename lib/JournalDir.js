/*
 * Journal that queues jobs from a directory.
 * Many writers can add to the directory, but only one thread should append the journal.
 *
 * Each batch of jobs is inserted into a file named  under the
 *
 * 2020-08-22 - AR.
 */

'use strict';

module.exports = JournalDir;
module.exports.makeLineReader = makeLineReader;

var fs = require('fs');
var readline = require('readline');
var util = require('util');

var utils = require('./utils');
var Job = require('./Job');
var Journal = require('./Journal');

// path.join is slow, 5m/s vs 77m/s this
function pathJoin( dirname, filename ) { return dirname + '/' + filename }

function JournalDir( dirname ) {
    this.dirname = dirname.replace(/\/$/, '');
    this.journalname = '@journal';
    this.grabname = '@head';

    this._wrStartCount = 0;
    this._wrDoneCount = 0;

    this._readCount = 0;
    this._reservations = {};
    this._pendingReads = {};

    this.readJournal();

    var self = this;
    process.once('exit', function() {
        for (var token in self._reservations) self.readCancel(token);
        self.write(self.lineReader.flush(), function(err) {
            // TODO: use self.log for state messages
            console.log('JournalDir: flushed lineReader');
        })
    })
}
util.inherits(JournalDir, Journal);

JournalDir.prototype.write = function write( lines, callback ) {
    var self = this;
    lines = Array.isArray(lines) ? lines : [lines];
    var id = Job.getLineId(lines[0]);
    self._wrStartCount += 1;
    // TODO: self.emitStats('write', lines.length);
    fs.writeFile(this.dirname + '/j.' + id, lines.join('\n') + '\n', function(err, nbytes) {
        self._wrDoneCount += 1;
        if (callback) callback(err, nbytes);
    })
}

JournalDir.prototype.wsync = function wsync( callback ) {
    var self = this;
    var needDoneCount = this._wrStartCount;
    setTimeout(function checkCount() {
        (self._wrDoneCount < needDoneCount) ? setTimeout(checkCount, 2) : callback();
    }, 2);
}

JournalDir.prototype.readReserve = function readReserve( nlines, timeoutMs ) {
    var self = this;
    var token = (this._readCount += 1);
    var reservation = {
        token: token,
        nlines: nlines,
        lines: [],
        timeoutTimer: setTimeout(function() { self.readCancel(token) }, timeoutMs),
    };
    return token;
}

JournalDir.prototype.read = function read( token, callback ) {
    var reservation = this._reservations[token];
    if (!reservation) return callback(new Error(token + ': reservation not found'));
    this.readLines(this._reservations[token].nlines, function(err, lines) {
        reservation.lines = lines;
        callback(null, lines);
    })
}

JournalDir.prototype.readCancel = function readCancel( token, callback ) {
    var reservation = this._reservations[token];
    delete this._reservations[token];
    if (reservation) {
        clearTimeout(reservation.timeoutTimer);
        // each line embeds a unique id, and a line in journal is not also present in a batch insert file,
        // so safe to re-insert the timed-out lines via an insert file named by the first line id
        if (reservation.lines.length > 0) this.write(reservation.lines, function(err) {
            if (callback) return callback(err);       
            // TODO: self.log.error
            if (err) console.error('JournalDir: error returning lines to journal:', err);
        })
        else callback && calback();
    }
}

JournalDir.prototype.rsync = function rsync( token, callback ) {
    var reservation = this._reservations[token];
    reservation.lines = [];
    this.readCancel(token, callback);
}

JournalDir.prototype.readJournal = function readJournal( ) {
    this.lineReader = makeLineReader(pathJoin(this.dirname, this.grabname));
}

JournalDir.prototype.readLines = function readLines( nlines, callback ) {
    var self = this, lines = new Array();
    var line;
    utils.repeatUntil(function(done) {
        while (lines.length < nlines && (line = self.lineReadr.fgets()) !== undefined) {
            lines.push(line);
        }
        if (lines.length >= nlines) return callback(null, lines);

        // we reach here only when line is undefined, which can mean error, eof, or waiting for more data
        if (err) {
            // FIXME: re-queue the contents of the grabfile, or at least move it out of the way
            return done(err);
        }
        else if (self.reader.eof) {
            self.grabFile(self.dirname, self.journalname, self.grabname);
            self.readJournal();
            return done(err, true);
        }
        else {
            return done();
        }
    },
    function(err) {
        callback(err, lines);
    })
}

function makeLineReader( filepath ) {
    // TODO: options
    var readBufferSize = 128000;
    var lineBufLength = 5;

    // pre-create the file to avoid the createReadStream exception
    fs.appendFileSync(filepath, "");
    var stream = fs.createReadStream(filepath, { highWaterMark: readBufferSize });

    // create a readline to fetch lines from the file stream
    // old readline took (input, output, completer, terminal), new takes (options)
    var rl = readline.createInterface(stream);

    var reader = {
        rl: rl,
        eof: false,
        paused: true,
        lines: new Array(),
        error: null,
        getError: function getError() { var err = reader.error; reader.error = null; return err },
        fgets: function fgets() {
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
    reader.rl.on('line', function(line) { if (reader.lines.push(line) >= lineBufLength) { reader.rl.pause(); reader.paused = true } });

    reader.rl.pause();
    return reader;
}

JournalDir.prototype.grabFile = function grabFile( dirname, oldname, newname, callback ) {
    var oldpath = pathJoin(dirname, oldname), newpath = pathJoin(dirname, newname);
    fs.appendFileSync(oldpath, "");
    fs.rename(oldpath, newpath, callback);
}

JournalDir.prototype.appendFiles = function appendFiles( callback ) {
    var self = this;
    utils.iterateSeries([
        function(next) {
            fs.readdir(self.dirname, next);
        },
        function(next, filenames) {
            next(null, filenames
                .filter(function(name) { return name[0] === 'j' && name[1] === '.' })
                .sort());
        },
        function(next, filenames) {
            utils.repeatUntil(function(done) {
                if (filenames.length <= 0) return done(null, true);
                self.concatFiles(self.dirname, self.journalname, filenames.splice(0, 100), done);
            }, next);
        },
    ], callback);
}

JournalDir.prototype.concatFiles = function concatFiles( dirname, targetname, filenames, callback ) {
    var self = this;
    var targetpath = pathJoin(dirname, targetname);
    utils.repeatUntil(function(done) {
        if (filenames.length <= 0) return done(null, true);
        var filepath;
        utils.iterateSteps([
            function(next) {
                filepath = pathJoin(dirname, filenames.shift());
            },
            function(next) {
                fs.readFile(filepath, next);
            },
            function(next, data) {
                fs.appendFile(targetpath, data, next);
            },
            function(next) {
                fs.truncate(filepath, next);
            },
            function(next) {
                // NOTE: if a file cannot be read or removed, the entire ingest loop will stall
                // until the problem file is moved out of the way.
                // unlinkSync is much faster once the metadata is memory resident
                fs.unlinkSync(filepath); next()
            },
        ], done);
    }, callback);
}

JournalDir.prototype = utils.toStruct(JournalDir.prototype);
