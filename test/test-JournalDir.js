'use strict';

var fs = require('fs');
var utils = require('../lib/utils');
var JournalDir = require('../lib/JournalDir');

module.exports = {
// FIXME: move into test-fileUtils.js
    'makeLineReader': {
        'returns a lineReader': function(t) {
            var lineReader = JournalDir.makeLineReader(__filename);
            t.equal(typeof lineReader.gets, 'function');
            t.equal(typeof lineReader.flush, 'function');
            t.done();
        },

        'reads lines': function(t) {
            var sourceFile = __filename;
            var expect = fs.readFileSync(sourceFile);
            var lines = [];
            var lineReader = JournalDir.makeLineReader(sourceFile);
            var startMs = Date.now();
            utils.repeatUntil(function(done) {
                var line = lineReader.gets();
                if (line !== undefined) lines.push(line);
                done(lineReader.error, lineReader.eof);
            }, function(err) {
                var doneMs = Date.now();
                t.ifError(err);
                t.equal(lines.join('\n') + '\n', expect);
                console.log("AR: read file %s in %d ms", sourceFile, doneMs - startMs);
                t.ok(doneMs - startMs < 100);
                t.done();
            })
        },
    },
}
