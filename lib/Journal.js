/*
 * Jobs are journaled as newline-terminated lines of text.  The job data payload must be serialized into this format.
 * Each line is id|type|payload, where the globally unique id embeds a timestamp.  The id must not start with a space.
 * If journal line starts with a space, it has been deleted and is to be skipped.
 */

'use strict';

var utils = require('./utils');

module.exports = Journal;

function Journal( ) {
}

/*
 * Append lines to the journal, optionally wait for them to be recorded.
 * The lines are newline terminated strings, and the first character is not a space.
 * The optional callback is called once newLines have been recorded in the journal (persisted).
 */
Journal.prototype.write = utils.abstract('write', 'newLines: string[]', 'callback?');

/*
 * Commit the write, wait for lines written thus far to be recorded.
 */
Journal.prototype.wsync = utils.abstract('wsync', 'callback');

/*
 * Arrange to consume the next lineCount lines from the journal.
 * Reserved lines are available for reading only with the returned token.
 */
Journal.prototype.readReserve = utils.abstract('readReserve', 'lineCount: number', 'readTimeoutMs: number');

/*
 * Cancal a read reservation, return the lines back to the journal.
 */
Journal.prototype.readCancel = utils.abstract('readCancel', 'token');

/*
 * Retrieve the lines reserved under the token.
 */
Journal.prototype.read = utils.abstract('read', 'token', 'callback');

/*
 * Commit the read, wait for read point to be advanced past the consumed lines.
 * Lines not committed before readTimeoutMs will return to the journal to be read again.
 */
Journal.prototype.rsync = utils.abstract('rsync', 'token');
