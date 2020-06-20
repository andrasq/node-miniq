'use strict';

var utils = require('./utils');

module.exports = Journal;

function Journal( ) {
}

// append lines to the journal, optionally wait for them to be recorded
Journal.prototype.write = utils.abstract('write', 'lines: string[]', 'callback?');

// commit the write, wait for lines written thus far to be recorded
Journal.prototype.wsync = utils.abstract('wsync', 'callback');

// arrange to consume the next lineCount lines from the journal
// Reserved lines are temporarily unavailable for reading without the returned token.
Journal.prototype.readReserve = utils.abstract('readReserve', 'lineCount: number', 'readTimeoutMs: number');

// cancal a read reservation, return the lines back to the journal
Journal.prototype.readCancel = utils.abstract('readCancel', 'token');

// retrieve the lines reserved under the token
Journal.prototype.read = utils.abstract('read', 'token', 'callback');

// commit the read, wait for read point to be advanced past the consumed lines
// Lines not committed before readTimeoutMs will return to the journal to be read again.
Journal.prototype.rsync = utils.abstract('rsync', 'token');
