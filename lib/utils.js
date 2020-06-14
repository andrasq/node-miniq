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
    getId: getId,
    getIds: getIds,
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

var _prefixZero = _charset[0] + _charset[0];
var _idSequenceLimit = 64 * 64 * 64;
var _idSequence = _idSequenceLimit - 2;
var _sequencePrefix = _prefixZero;
var _idTimestamp = Date.now() + 10;
function getId( sysid ) {
    var ts = getNewerTimestamp(0);
    if (ts > _idTimestamp) { if (_idSequence > _idSequenceLimit * .5) { _idSequence = 0; _sequencePrefix = _prefixZero } }
    if (!_idSequence) ts = getNewerTimestamp(_idTimestamp); // if just zeroed _idSequence then ts > _idTimestamp, so refetching is fast
    _idTimestamp = ts;

    var id = getTimestampString() + sysid + _sequencePrefix + _charset[_idSequence++ & 0x3f];
    if ((_idSequence & 0x3f) === 0) {
        _sequencePrefix = pad(encode64(_idSequence >>> 6), 2);
        // TODO: put next line under test. Note that the .5 guard above zeroes the sequence before it overflows.
        if (_idSequence >= _idSequenceLimit) { _idSequence = 0; _sequencePrefix = _prefixZero }
    }
    return id;
}

function getIds( sysid, count ) {
    var ids = new Array();
    for (var i = 0; i < count; i++) ids.push(getId(sysid));
    return ids;
}

function Cron( ) {
    this.jobs = [];

    this.schedule = function schedule(interval, fn) {
        if (typeof interval !== 'number') interval = parseTime(interval);
        if (!interval) throw new Error('invalid interval, expected [0-9]+[hms]');
        this.jobs.push({ interval: interval, last: 0, next: findNextTime(now, interval), fn: fn });
        return this;
    }
    this.run = function run(now, callback) {
        var i = 0, jobs = this.jobs;
        aflow.repeatUntil(
            function(next) {
                if (jobs[i].next > now) next(null, ++i >= jobs.length);
                jobs[i].next = findNextTime(now, jobs[i].interval);
                jobs[i].fn(function(err) { next(err, ++i >= jobs.length) });
            }, callback
        );
    }
    function parseTime( interval ) {
        var units = { d: 24*3600*1000, h: 3600*1000, m: 60*1000, s: 1000 };
        var parts = String(interval).match(/^(.+)([dhms]?)$/) || [];
        return Number(parts[1]) * units[parts[2]]; // number of NaN
    }
    function findNextTime( now, interval ) {
        // next even multiple of interval anchored to midnight last night
        var msToday = (now % 24*3600*1000);
        return now + (interval - msToday % interval)
    }
}

function toStruct( hash ) { return toStruct.prototype = hash }
