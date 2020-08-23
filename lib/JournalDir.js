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
module.exports.makeLineReader = require('./fileUtils').makeLineReader;

var fs = require('fs');
var util = require('util');

var utils = require('./utils');
var fileUtils = require('./fileUtils');
var Job = require('./Job');
var Journal = require('./Journal');

function JournalDir( dirname ) {
    this.dirname = dirname.replace(/\/$/, '');
    this.journalname = '@journal';
    this.grabname = '@head';

    this._wrStartCount = 0;
    this._wrDoneCount = 0;

    this._readCount = 0;
    this._reservations = {};
    this._pendingReads = {};
    this._appendBusy = false;
    this._mutexTimeoutMs = 2000;

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
    this.lineReader = fileUtils.makeLineReader(fileUtils.pathJoin(this.dirname, this.grabname));
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
        if (self.lineReader.error) {
            // FIXME: clear the error, keep reading jobs from the rest of the file
            // FIXME: re-queue the contents of the grabfile, or at least move it out of the way
            return done(self.lineReader.getError());
        }
        else if (self.reader.eof) {
            fileUtils.waitWhile(function() { return self._appendBusy }, self._mutexTimeoutMs, function(err) {
                if (err) {
                    console.error('JournalDir: readLines mutex timeout, cannot grab');
                    done();
                }
                else {
                    self._appendBusy = true;
                    var oldpathname = fileUtils.pathJoin(self.dirname, self.journalname);
                    var newpathname = fileUtils.pathJoin(self.dirname, self.grabname);
                    fileUtils.grabFile(oldpathname, newpathname, function(err) {
                        self._appendBusy = false;
                        self.readJournal();
                        return done(err, true);
                    })
                }
            })
        }
        else {
            return done();
        }
    },
    function(err) {
        callback(err, lines);
    })
}

// append file loop that must be running in the background (single-threaded)
JournalDir.prototype.appendFiles = function appendFiles( callback ) {
    var self = this;
    utils.iterateSeries([
        function(next) {
            fs.readdir(self.dirname, next);
        },
        function(next, filenames) {
            next(null, filenames
                .filter(function(name) { return name[0] === 'j' && name[1] === '.' })   // only files named j.*
                .sort());                                                               // sorted oldest first
        },
        function(next, filenames) {
            utils.repeatUntil(function(done) {
                if (filenames.length <= 0) return done(null, true);
                fileUtils.waitWhile(function() { return self._appendBusy }, self._mutexTimeoutMs, function(err) {
                    if (err) {
                        console.error('JournalDir: appendFiles mutex timeout');
                        done();
                    }
                    else {
                        self._appendBusy = true;
                        var journalpath = fileUtils.pathJoin(self.dirname, self.journalname);
                        fileUtils.concatFiles(journalpath, self.dirname, filenames.splice(0, 20), function(err) {
                            self._appendBusy = false;
                            done(err);
                        })
                    }
                })
            }, next);
        },
    ], callback);
}

JournalDir.prototype = utils.toStruct(JournalDir.prototype);
