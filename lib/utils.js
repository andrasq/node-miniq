'use strict';

var nodeMajor = parseInt(process.versions.node);
var _charset64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~'.split('');
var _codeset64 = {}; for (var i = 0; i < _charset64.length; i++) _codeset64[_charset64[i]] = i;

module.exports = {
    countStat: countStat,
    makeLog: makeLog,
    selectField: selectField,
    groupByField: groupByField,
    pad: pad,
    encode64: encode64,
    decode64: decode64,
    charset64: _charset64,
    //makeGetNewerTimestamp: makeGetNewerTimestamp,
    getNewerTimestamp: getNewerTimestamp,
    getTimestampString: getTimestampString,
    getId: getId,
    getIds: getIds,
    repeatUntil: repeatUntil,
    iterateSteps: iterateSteps,
    Cron: Cron,
    invoke: eval('nodeMajor < 6 ? _invoke : function(fn, av) { return fn(...av) }'),
    varargs: eval('(nodeMajor < 6) ? _varargs : function(fn, self) { return function(...av) { return fn(av, self) } }'),
    makeError: makeError,
    abstract: abstract,
    toStruct: toStruct,

    _invoke: _invoke,
    _varargs: _varargs,
    _configure: _configure,
}

function countStat( stats, name, value ) {
    (stats[name] === undefined) ? (stats[name] = value) : (stats[name] += value);
}

function makeLog( name, con ) {
    con = con || console;
    // TODO: also log level?
    function logit(m) { con.log({time: new Date(getNewerTimestamp()), type: name, message: m}) }
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
    // while (v > 64) { s = _charset64[(v & 0xfc0) >>> 6] + _charset64[v & 0x3f] + s; v /= (64 * 64) }
    do { s = _charset64[v & 0x3f] + s; v /= 64 } while (v >= 1);
    return s;
}

function decode64( str ) {
    var v = 0, ch;
    for (var i = 0; i < str.length && (ch = _codeset64[str[i]]) !== undefined; i++) v = v * 64 + ch;
    return v;
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

var _prefixZero = _charset64[0] + _charset64[0];
var _idSequenceLimit = 64 * 64 * 64;
var _idSequence = 0;
var _sequencePrefix = _prefixZero;
var _idTimestamp = getNewerTimestamp(0);
function getId( sysid ) {
    var ts = getNewerTimestamp(0);
    if (ts > _idTimestamp) { if (_idSequence > _idSequenceLimit * .5) { _idSequence = 0; _sequencePrefix = _prefixZero } }
    if (!_idSequence) ts = getNewerTimestamp(_idTimestamp); // if just zeroed _idSequence then ts > _idTimestamp, so refetching is fast
    _idTimestamp = ts;

    var id = getTimestampString() + sysid + _sequencePrefix + _charset64[_idSequence++ & 0x3f];
    if ((_idSequence & 0x3f) === 0) {
        _sequencePrefix = pad(encode64(_idSequence >>> 6), 2);
        if (_idSequence >= _idSequenceLimit) { _idSequence = 0; _sequencePrefix = _prefixZero }
    }
    return id;
}

function getIds( sysid, count ) {
    var ids = new Array();
    for (var i = 0; i < count; i++) ids.push(getId(sysid));
    return ids;
}

function _tryCall(fn, cb) { try { fn(cb) } catch (e) { cb(e) } }
function repeatUntil( fn, callback ) {
    var ncalls = 0;
    function relaunch(err, isDone) {
        if (err || isDone) return setImmediate(callback, err);
        if (ncalls++ < 10) return _tryCall(fn, relaunch);
        ncalls = 0; setImmediate(relaunch);
    }
    relaunch();
}

function iterateSteps( steps, callback ) {
    var i = 0, arg1, arg2, doneCb;
    function stepCb(err, a, b) { arg1 = a; arg2 = b; doneCb(err) }
    function loop(done) {
        if (i >= steps.length) return done(null, true);
        doneCb = done;
        steps[i++](stepCb, arg1, arg2);
    }
    repeatUntil(loop, function(err) { callback(err, arg1, arg2) });
}

function Cron( ) {
    this.jobs = [];

    this.schedule = function schedule(interval, fn, errorCallback) {
        if (typeof interval !== 'number') interval = parseTime(interval);
        if (!interval) throw new Error('invalid interval, expected [0-9]+[hms]');
        this.jobs.push({ interval: interval, last: 0, next: findNextTime(Date.now(), interval), fn: fn, ecb: errorCallback });
        return this;
    }
    this.run = function run(now, callback) {
        var i = 0, jobs = this.jobs, cbs = this.callbacks;
        if (!jobs.length) return callback();
        repeatUntil(function(done) {
            if (jobs[i].next > now) { return done(null, ++i >= jobs.length); }
            jobs[i].next = findNextTime(now, jobs[i].interval);
            jobs[i].fn(function(err) { if (err && jobs[i].ecb) jobs[i].ecb(err); done(null, ++i >= jobs.length) });
        }, callback);
    }
    function parseTime( interval ) {
        var units = { d: 24*3600*1000, h: 3600*1000, m: 60*1000, s: 1000, '': 1 };
        var parts = String(interval).match(/^(\d+)([dhms]?)$/) || [];
        return Number(parts[1]) * units[parts[2]]; // number or NaN
    }
    function findNextTime( now, interval ) {
        // next even multiple of interval anchored to midnight last night
        var msToday = (now % 24*3600*1000);
        return now + (interval - msToday % interval)
    }
}

function _invoke( func, argv ) {
    return func.apply(null, argv);
}

// see also qibl, but qibl infers self from the current object
function _varargs( callback, self ) {
    return function() {
        var argv = new Array();
        for (var i = 0; i < arguments.length; i++) argv.push(arguments[i]);
        return callback(argv, self);
    }
}

function makeError( props ) {
    props = props || {};
    var message = props.message || props.err && props.err.message;
    var err = props.err || new Error(props.message || props.code);
    for (var k in props) if (k !== 'err') err[k] = props[k];
    return err;
}

var _argNames = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9'];
function abstract( name ) {
    if (arguments.length > 1 + 9) throw new Error('abstract method: too many arguments');
    var src = 'function ' + name + '(' + _argNames.slice(0, arguments.length - 1).join(', ') + ') {\n' +
              '  throw new Error("abstract function ' + name + ': not implemented");\n' +
              '}';
    return eval('1 && ' + src);
}

function _configure( func ) {
    // re-parse the function in this file context, and run it to modify file local state
    // This is a hook for unit tests to be able to configure otherwise unreachable id states.
    func = eval('true && ' + func);
    func();
}

function toStruct( hash ) { return toStruct.prototype = hash }
