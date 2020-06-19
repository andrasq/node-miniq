'use strict';

var Journal = require('../lib/Journal');

module.exports = {
    'exports a constructor with expected methods': function(t) {
        t.equal(typeof Journal, 'function');
        var uut = new Journal();
        t.equal(typeof uut.write, 'function');
        t.equal(typeof uut.readReserve, 'function');
        t.equal(typeof uut.readCancel, 'function');
        t.equal(typeof uut.read, 'function');
        t.done();
    },
}
