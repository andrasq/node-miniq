'use strict';

module.exports = HttpRunner;

var util = require('util');
var Runner = require('./Runner');
var utils = require('./utils');

function HttpRunner( options ) {
    Runner.call(this, options);
}
util.inherits(HttpRunner, Runner);
