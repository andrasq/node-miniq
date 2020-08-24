'use strict';

var fs = require('fs');
var utils = require('../lib/utils');
var fileUtils = require('../lib/fileUtils');

module.exports = {
    'pathJoin builds paths': function(t) {
        t.equal(fileUtils.pathJoin('foo', 'bar'), 'foo/bar');
        t.equal(fileUtils.pathJoin('foo', 'bar/baz.js'), 'foo/bar/baz.js');
        t.done();
    },

    'fileExists checks file existence': function(t) {
        t.ok(fileUtils.fileExists(__filename));
        t.ok(fileUtils.fileExists(__dirname));
        t.ok(!fileUtils.fileExists('/nonesuch'));
        t.done();
    },

    'waitWhile': {
    },

    'makeLineReader': {
        'returns a lineReader': function(t) {
            var lineReader = fileUtils.makeLineReader(__filename);
            t.equal(typeof lineReader.gets, 'function');
            t.equal(typeof lineReader.flush, 'function');
            t.done();
        },

        'reads lines': function(t) {
            var sourceFile = __filename;
            var expect = fs.readFileSync(sourceFile);
            var lines = [];
            var lineReader = fileUtils.makeLineReader(sourceFile);

            var startMs = Date.now();
            utils.repeatUntil(function(done) {
                var line = lineReader.gets();
                if (line !== undefined) lines.push(line);
                done(lineReader.error, lineReader.isEof());
            },
            function(err) {
                var doneMs = Date.now();
                t.ifError(err);
                var contents = lines.join('\n') + '\n';
                t.equal(contents, expect);
                console.log("AR: read file %s in %d ms", sourceFile, doneMs - startMs);
                t.ok(doneMs - startMs < 100);
                t.done();
            })
        },
    },

    'grabFile': {
        beforeEach: function(done) {
            this.temp1 = '/tmp/test.' + process.pid + '.tmp1';
            this.temp2 = '/tmp/test.' + process.pid + '.tmp2';
            try { fs.unlinkSync(this.temp1) } catch (e) {}
            try { fs.unlinkSync(this.temp2) } catch (e) {}
            done();
        },

        afterEach: function(done) {
            try { fs.unlinkSync(this.temp1) } catch (e) {}
            try { fs.unlinkSync(this.temp2) } catch (e) {}
            done();
        },

        'renames file': function(t) {
            var self = this;
            fs.writeFileSync(self.temp1, 'test ' + process.pid);
            fileUtils.grabFile(self.temp1, self.temp2, function(err) {
                t.ifError(err);
                t.equal(fs.readFileSync(self.temp2), 'test ' + process.pid);
                t.done();
            })
        },

        'ensure that grabbed file exists': function(t) {
            var self = this;
            fileUtils.grabFile(self.temp1, self.temp2, function(err) {
                t.ifError(err);
                t.ok(!fileUtils.fileExists(self.temp1));
                t.ok(fileUtils.fileExists(self.temp2));
                t.equal(fs.readFileSync(self.temp2), '');
                t.done();
            })
        },
    },

    'concatFiles concatenates and removes files': function(t) {
        var self = this;
        var pid = process.pid;
        var names = ['t1.' + pid, 't2.' + pid, 't3.' + pid];
        var targetpath = '/tmp/tt.' + pid;
        fs.writeFileSync('/tmp/t1.' + pid, 'line1\n');
        fs.writeFileSync('/tmp/t2.' + pid, 'line2\n');
        fs.writeFileSync('/tmp/t3.' + pid, 'line3\n');
        fileUtils.concatFiles(targetpath, '/tmp', names, function(err) {
            t.ifError(err);
            t.equal(fs.readFileSync(targetpath), 'line1\nline2\nline3\n');
            t.ok(!fileUtils.fileExists('/tmp/t1.' + pid));
            t.ok(!fileUtils.fileExists('/tmp/t2.' + pid));
            t.ok(!fileUtils.fileExists('/tmp/t3.' + pid));
            fs.unlinkSync(targetpath);
            t.done();
        })
    },
}
