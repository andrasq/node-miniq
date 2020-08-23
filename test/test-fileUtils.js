'use strict';

var fs = require('fs');
var utils = require('../lib/utils');
var fileUtils = require('../lib/fileUtils');

module.exports = {
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
}
