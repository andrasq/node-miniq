'use strict';

var _charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~'.split('');

module.exports = {
    countStat: countStat,
    makeLog: makeLog,
    selectField: selectField,
    groupByField: groupByField,
    pad: pad,
    encode64: encode64,
    charset64: _charset,
    //makeGetNewerTimestamp: makeGetNewerTimestamp,
    getNewerTimestamp: getNewerTimestamp,
    getTimestampString: getTimestampString,
    toStruct: toStruct,
}

function countStat( stats, name, value ) {
    (stats[name] === undefined) ? (stats[name] = value) : (stats[name] += value);
}

function makeLog( name, con ) {
    con = con || console;
    function logit(m) { con.log({time: new Date(), type: name, message: m}) }
    return { trace: logit, debug: logit, info: logit, warn: logit, error: logit }
}

function selectField( items, field ) {
    var fields = new Array();
    for (var i = 0; i < items.length; i++) fields.push(items[i][field]);
    return fields;
}

function groupByField( items, id ) {
    var groups = {};
    for (var i = 0; i < items.length; i++) {
        var val = items[i][id];
        if (!groups[val]) groups[val] = new Array();
        groups[val].push(items[i]);
    }
    return groups;
}

function pad( str, minlen ) {
    while (str.length < minlen) {
        var n = minlen - str.length;
        if (n & 1) str = '0' + str;
        if (n & 2) str = '00' + str;
        if (n >= 4) str = '0000' + str;
    }
    return str;
}

function encode64( v ) {
    var s = '';
    // faster without...
    // while (v > 64) { s = _charset[(v & 0xfc0) >>> 6] + _charset[v & 0x3f] + s; v /= (64 * 64) }
    do { s = _charset[v & 0x3f] + s; v /= 64 } while (v >= 1);
    return s;
}

//function makeGetNewerTimestamp() {
    var _lastTimestamp = -1;
    var _timestampString = '';
    var _ncalls = 0;
    var _timeout;
    function getNewerTimestamp( ts ) {
        if (ts < _lastTimestamp && _ncalls++ < 100) {
            // the timestamp is not millisecond accurate, but it is monotonically increasing
            if (!_timeout) _timeout = setTimeout(_clearLastTime, 5);
        } else {
            _ncalls = 0;
            while ((_lastTimestamp = Date.now()) <= ts) ;
            _timestampString = pad(encode64(_lastTimestamp), 8);
        }
        return _lastTimestamp;
        function _clearLastTime() { _lastTimestamp = 0 }
    }
    function getTimestampString( ts ) {
        return _timestampString;
    }

//    return { getNewerTimestamp: getNewerTimestamp, getTimestampString: getTimestampString };
//}

function toStruct( hash ) { return toStruct.prototype = hash }
