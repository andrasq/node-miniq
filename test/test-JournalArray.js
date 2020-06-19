'use strict';

var Journal = require('../lib/Journal');
var JournalArray = require('../lib/JournalArray');
var implemented = require('./utils').implemented;

module.exports = {
    setUp: function(done) {
        this.uut = new JournalArray();
        done();
    },

    'constructor': {
        'implements Journal': function(t) {
            t.ok(implemented(new JournalArray(), Journal));
            t.done();
        },
    },

    'write': {
        'accepts an array of lines': function(t) {
            var uut = this.uut;
            uut.write(['foo', 'bar']);
            uut.write(['zed']);
            t.deepEqual(this.uut.lines, ['foo', 'bar', 'zed']);
            t.throws(function() { uut.write() }, /not an array/);
            t.throws(function() { uut.write(123) }, /not an array/);
            t.done();
        },

        'write should call callback': function(t) {
            t.throws(function() { new JournalArray().write([], 123) }, /not a function/);
            this.uut.write(['foo'], t.done);
        },

        'syncWrite should call callback': function(t) {
            t.throws(function() { new JournalArray().syncWrite() }, /not a function/);
            t.throws(function() { new JournalArray().syncWrite(123) }, /not a function/);
            this.uut.write(['foo']);
            this.uut.syncWrite(t.done);
        },
    },

    'read': {
        setUp: function(done) {
            this.uut.write(['foo', 'bar', 'zed'], done);
        },

        'readReserve returns a token': function(t) {
            t.throws(function() { new JournalArray().readReserve(2) }, /missing timeout/);
            var tok1 = this.uut.readReserve(1, 100);
            var tok2 = this.uut.readReserve(3, 100);
            t.ok(tok1 !== tok2);
            t.done();
        },

        'readCancel expires the token': function(t) {
            var uut = this.uut;
            var tok = uut.readReserve(1, 100);
            uut.readCancel(tok);
            uut.read(tok, function(err, lines) {
                t.contains(err.message, /expired/);

                // can be called multiple times
                uut.readCancel(tok);
                uut.readCancel(tok);

                t.done();
            })
        },

        'read returns lines specified by token': function(t) {
            var uut = this.uut;
            var tok1 = uut.readReserve(1, 100);
            var tok2 = uut.readReserve(3, 100);
            uut.read(tok1, function(err, lines) {
                t.equal(lines.length, 1);
                t.deepEqual(lines, ['foo']);
                uut.read(tok2, function(err, lines) {
                    t.equal(lines.length, 2);
                    t.deepEqual(lines, ['bar', 'zed']);
                    t.done();
                })
            })
        },

        'read returns error if token expired': function(t) {
            var uut = this.uut;
            var tok = uut.readReserve(2, 1);
            setTimeout(function() {
                uut.read(tok, function(err, lines) {
                    t.ok(err);
                    t.contains(err.message, /expired/);
                    t.done();
                })
            }, 3);
        },

        'read returns error on duplicate read': function(t) {
            var uut = this.uut;
            var tok = uut.readReserve(2, 100);
            uut.read(tok, function(err, lines) {
                t.ifError(err);
                t.equal(lines.length, 2);
                uut.read(tok, function(err, lines) {
                    t.ok(err);
                    t.contains(err.message, /already read/);
                    t.done();
                })
            })
        },

        'syncRead expires the token': function(t) {
            var uut = this.uut;
            var tok = uut.readReserve(1, 100);
            uut.syncRead(tok);
            uut.read(tok, function(err, lines) {
                t.ok(err);
                t.contains(err.message, /expired/);

                // can be called multiple times
                uut.syncRead(tok);
                uut.syncRead(tok);

                t.done();
            })
        },
    },
}
