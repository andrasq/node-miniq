'use strict';

var utils = require('./utils');
var pad = utils.pad;
var encode = utils.encode64;

module.exports = makeGetIds();

function makeGetIds() {
    // base64-ish encoding: 8 + 5 + 3 chars for 48-bit ms timestamp + 5-char sysid + 18-bit sequence (262,144)
    var encode64 = utils.encode64;
    var _charset = utils.charset64;

    // nb: 50% faster (6m/s vs 4m/s) if getNewerTimestamp is cut-and-pasted moved in here
    var getNewerTimestamp = utils.getNewerTimestamp;
    var getTimestampString = utils.getTimestampString;

    // TODO: expose this function
    var _prefixZero = _charset[0] + _charset[0];
    var _idSequenceLimit = 64 * 64 * 64;
    var _idSequence = _idSequenceLimit - 2;
    var _sequencePrefix = _prefixZero;
    var _idTimestamp = Date.now();
    function getId( sysid ) {
        var ts = getNewerTimestamp(0);
        if (ts > _idTimestamp) { if (_idSequence > _idSequenceLimit * .5) { _idSequence = 0; _sequencePrefix = _prefixZero } }
        else if (!_idSequence) ts = getNewerTimestamp(_idTimestamp);
        _idTimestamp = ts;

        var id = getTimestampString() + sysid + _sequencePrefix + _charset[_idSequence++ & 0x3f];
        if ((_idSequence & 0x3f) === 0) {
            _sequencePrefix = pad(encode64(_idSequence >>> 6), 2);
            if (_idSequence >= _idSequenceLimit) { _idSequence = 0; _sequencePrefix = _prefixZero }
        }
        return id;
    }

    return function getIds( sysid, count ) {
        var ids = new Array();
        for (var i = 0; i < count; i++) ids.push(getId(sysid));
        return ids;
    }
}
