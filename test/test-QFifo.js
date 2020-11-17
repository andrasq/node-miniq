'use strict';

var fs = require('fs');
var utils = require('../lib/utils');
var fileUtils = require('../lib/fileUtils');
var QFifo = require('../lib/QFifo');

var fifopath = '/tmp/test-fifo.' + process.pid;
module.exports = {
    beforeEach: function(done) {
        try { fs.unlinkSync(fifopath) } catch (e) {}
        try { fs.unlinkSync(fifopath + '.hdr') } catch (e) {}
        done();
    },

    after: function(done) {
        try { fs.unlinkSync(fifopath) } catch (e) {}
        try { fs.unlinkSync(fifopath + '.hdr') } catch (e) {}
        done();
    },

    'QFifo': {
        'constructor': {
            'returns object with expected methods': function(t) {
                var fifo = new QFifo('/dev/null');
                t.equal(typeof fifo.push, 'function');
                t.equal(typeof fifo.shift, 'function');
                t.done();
            },

            'does not pre-create the file': function(t) {
                var fifo = new QFifo(fifopath);
                t.ok(!fileUtils.fileExists(fifopath));
                t.done();
            },
        },

        'push adds lines': function(t) {
            var fifo = new QFifo(fifopath);
            utils.iterateSteps([
                function(next) {
                    fifo.push('line1');
                    fifo.wsync(next);
                },
                function(next) {
                    t.equal(fs.readFileSync(fifopath).toString(), 'line1\n');
                    fifo.push('line2');
                    fifo.wsync(next);
                },
                function(next) {
                    t.equal(fs.readFileSync(fifopath), 'line1\nline2\n');
                    next();
                },
            ], t.done);
        },

        'shift fetches lines': function(t) {
            var fifo = new QFifo(fifopath);
            fifo.push('line1');
            fifo.push('line2');
            fifo.push('line3');
            fifo.push('line4');
            fifo.wsync(function(err) {
                t.ifError(err);
                // reopen the fifo to see the newly written lines (needed for streams, probably not for fd-s)
                fifo.reopen();
                var count = 0;
                var lines = [];
                utils.repeatUntil(function(done) {
                    var line = fifo.shift();
                    if (line) lines[count++] = line;
                    done(null, fifo.isEof());
                },
                function(err) {
                    t.ifError(err);
                    t.equal(count, 4);
                    t.deepEqual(lines, ['line1', 'line2', 'line3', 'line4']);
                    t.done();
                })
            })
        },

        'rsync saves header': function(t) {
            var fifo = new QFifo(fifopath);
            fifo.push('line1\nline22\nline3\nline4\n');
            fifo.wsync(function(err) {
                t.ifError(err);
                fifo.reopen();
                var count = 0;
                utils.repeatUntil(function(done) {
                    var line = fifo.shift();
                    if (line) count += 1;
                    done(null, count >= 2);
                },
                function(err) {
                    fifo.rsync(function(err) {
                        t.ifError(err);
                        t.contains(fifo.header, { offset: 13 });
                        var header = JSON.parse(fs.readFileSync(fifopath + '.hdr'));
                        t.contains(header, { offset: 13 });
                        fifo.reopen();
                        t.contains(fifo.header, { offset: 13 });
                        t.done();
                    })
                })
            })
        },

        'edge cases': {
            'wsync return an existing error': function(t) {
                var fifo = new QFifo(fifopath);
                fifo.error = 'mock error';
                fifo.wsync(function(err) {
                    t.equal(err, 'mock error');
                    t.equal(fifo.error, null);
                    t.done();
                })
            },

            'writeLoop sets writing flag while writing': function(t) {
                var fifo = new QFifo(fifopath);
                var writing = [];
                writing.push(fifo.writing);
                fifo.push('line1', function() { writing.push(fifo.writing) });
                fifo.push('line2', function() { writing.push(fifo.writing) });
                fifo.wsync(function(err) {
                    t.ifError(err);
                    // the writ loop ends only after this callback returns
                    // The flag is cleared several more setImmediates later, so use a timeout
                    writing.push(fifo.writing);
                    setTimeout(function() {
                        writing.push(fifo.writing);
                        t.deepEqual(writing, [false, true, true, true, false]);
                        t.done();
                    }, 2)
                })
            },

            'writeLoop returns errors': function(t) {
                var fifo = new QFifo(fifopath);
                fifo.push('line1');
                fifo.push('line2');
                t.stub(fifo.chunks, 'shift').throws(new Error('mock write error'));
                fifo.wsync(function(err) {
                    // NOTE: wsync suppresses errors thrown in this callback
                    t.ok(err);
                    t.equal(err.message, 'mock write error');
                    t.ok(fifo.error);
                    t.equal(fifo.error.message, 'mock write error');
                    t.done();
                })
            },

            'is fast': function(t) {
                var nlines = 10000;
                var logline = new Array(200).join('x') + '\n';
                var fifo = new QFifo(fifopath);

                utils.iterateSteps([
                    function(next) {
                        console.time('qfifo write ' + nlines);
                        for (var i = 0; i < nlines; i++) fifo.push(logline);
                        fifo.wsync(next);
                    },
                    function(next) {
                        console.timeEnd('qfifo write ' + nlines);
                        next();
                    },
                    function(next) {
                        fifo.reopen();
                        var nread = 0;
                        console.time('qfifo read ' + nlines);
                        utils.repeatUntil(function(done) {
                            for (var j = 0; j < 10; j++) {
                                var line = fifo.shift();
                                if (line) nread += 1;
                            }
                            done(null, fifo.isEof());
                        }, function(err) {
                            console.timeEnd('qfifo read ' + nlines);
                            next();
                        })
                    },
                ], t.done);
            },
        },
    },
}
