/*
 * Copyright (C) 2020 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var util = require('util');
var nodeMajor = parseInt(process.versions.node);
var _charset64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~'.split('');
var _codeset64 = {}; for (var i = 0; i < _charset64.length; i++) _codeset64[_charset64[i]] = i;

// node-v0.8 lacks setImmediate; node-v0.10 has setImmediate, but a module var hides it; newer node all have it
var setImmediate = eval('global.setImmediate || function(fn, a, b, c) { process.nextTick(function() { fn(a, b, c) }) }');

var utils = module.exports = {
    countStat: countStat,
    reparent: reparent,
    makeLogger: makeLogger,
    QLog: function QLog() {},
    makeNoopLogger: makeNoopLogger,
    selectField: selectField,
    uniq: uniq,
    groupByField: groupByField,
    countByField: countByField,
    pad: pad,
    encode64: encode64,
    decode64: decode64,
    charset64: _charset64,
    //makeGetNewerTimestamp: makeGetNewerTimestamp,
    getNewerTimestamp: getNewerTimestamp,
    getTimestampString: getTimestampString,
    getDate: getDate,
    getId: getId,
    getIds: getIds,
    repeatUntil: repeatUntil,
    iterateSteps: iterateSteps,
    Cron: Cron,
    parseInterval: parseInterval,
    invoke: eval('nodeMajor < 6 ? _invoke : eval("true && function(fn, av) { return fn(...av) }")'),
    varargs: eval('(nodeMajor < 6) ? _varargs : eval("true && function(fn, self) { return function(...av) { return fn(av, self) } }")'),
    makeError: makeError,
    abstract: abstract,
    filterUpdate: filterUpdate,
    setImmediate: setImmediate,
    merge2: merge2,
    deassign: deassign,
    assignTo: assignTo,
    keysOf: keysOf,
    valuesOf: valuesOf,
    getConfig: getConfig,
    require: require,
    setInterval: setInterval,
    // definedKeysOf: definedKeysOf,
    // definedValuesOf: definedValuesOf,
    // gcTo: gcTo,
    // KeyValueStore: KeyValueStore,
    allocBuf: eval('nodeMajor > 8 ? Buffer.allocUnsafe : Buffer'),
    fromBuf: eval('nodeMajor > 8 ? Buffer.from : Buffer'),
    offsetOf: offsetOf,
    waitWhile: waitWhile,
    Mutex: Mutex,
    versionCompar: versionCompar,
    microtime: microtime,
    // interpolate: interpolate,
    toStruct: toStruct,

    _invoke: _invoke,
    _varargs: _varargs,
    _configure: _configure,
}

function countStat( stats, name, value ) {
    (stats[name] === undefined) ? (stats[name] = value) : (stats[name] += value);
}

// reparent obj to have the same parent class as and be instanceof sibling.constructor
// NB: __proto__ is shared, changing it modifies constructor.prototype and the __proto__ of all sibling instances.
function reparent( obj, sibling ) {
    return (obj.constructor = sibling.constructor), (obj.__proto__ = sibling.__proto__), obj;
}

// fully functional json logger
function makeLogger( logName, stream ) {
    var syslogLevels = { EMERG: 0, CRIT: 1, ALERT: 2, ERROR: 3, WARN: 4, INFO: 6, DEBUG: 7, TRACE: 8,
                         emerg: 0, crit: 1, alert: 2, error: 3, warn: 4, info: 6, debug: 7, trace: 8, };
    var staticInfo = ',"id":' + JSON.stringify(logName);
    function vlogit(argv, level) {
        var typeInfo = ',"type":"' + level + '","level":' + (syslogLevels[level] || 99);
        if (syslogLevels[level] > (syslogLevels[process.env.LOG_LEVEL || 'info'] || 6)) return;
        var info = (argv[0] && argv[0].constructor === Object) ? argv.shift() : undefined;
        var msg = utils.invoke(util.format, argv);
        var logline = '{"time":"' + getNewerTimestring(0) + '"' + typeInfo + staticInfo + ',"message":' + JSON.stringify(msg) + '}\n';
        if (info !== undefined) logline = logline.replace('}\n', ',"info":' + _tryJsonEncode(info) + '}\n');
        (stream || process.stdout).write(logline);
    }
    return reparent({ trace: utils.varargs(vlogit, 'TRACE'), debug: utils.varargs(vlogit, 'DEBUG'),
              info: utils.varargs(vlogit, 'INFO'),   warn: utils.varargs(vlogit, 'WARN'),  error: utils.varargs(vlogit, 'ERROR') }, new utils.QLog());
}

function makeNoopLogger( logName, stream ) {
    var noop = function(){};
    return { trace: noop, debug: noop, info: noop, warn: noop, error: noop, log: noop };
}

function _tryJsonEncode(obj) { try { return JSON.stringify(obj) } catch (err) { return '"[Circular]"' } }

function selectField( items, field ) {
    var fields = new Array();
    if (Array.isArray(items)) {
        for (var i = 0; i < items.length; i++) fields.push(items[i][field]);
    } else {
        var keys = Object.keys(items);
        for (var i = 0; i < keys.length; i++) fields.push(items[keys[i]][field]);
    }
    return fields;
}

function uniq( items ) {
    var distinct = {};
    for (var i = 0; i < items.length; i++) distinct[items[i]] = 1;
    return Object.keys(distinct);
}

function groupByField( items, id ) {
    var isByFunc = typeof id === 'function';
    var groups = {};
    for (var i = 0; i < items.length; i++) {
        var val = isByFunc ? id(items[i]) : items[i][id];
        if (!groups[val]) groups[val] = new Array();
        groups[val].push(items[i]);
    }
    return groups;
}

function countByField( items, id ) {
    var isByFunc = typeof id === 'function';
    var counts = {};
    for (var i = 0; i < items.length; i++) {
        var val = isByFunc ? id(items[i]) : items[i][id];
        counts[val] = counts[val] ? counts[val] + 1 : 1;
    }
    return counts;
}

var _pad0 = ['', '0', '00', '000', '0000'];
function pad( str, minlen ) {
    var n = minlen - str.length;
    return n <= 0 ? str
        : n <= 4 ? _pad0[n] + str
        : pad('0000' + str, minlen);
}

// TODO: try timing String.fromCharCode(...array.slice(0, i)) instead of char-at-a-time
// (array.slice timed at 30m/sec)
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
var _lastTimestring = '';
var _timestampString = '';
var _ncalls = 0;
var _timeout;
function _expireCachedTime() { _lastTimestamp = -1; _timestampString = ''; _lastTimestring = ''; _timeout = null }
function getNewerTimestamp( ts ) {
    if (ts < _lastTimestamp && _ncalls++ < 50) {
        // ok to reuse the previous timestamp
        // the timestamp is not millisecond accurate, but it is monotonically increasing
        return _lastTimestamp;
    }
    else {
        _ncalls = 0;
        while ((_lastTimestamp = Date.now()) <= ts) ;
        if (!_timeout) { _timeout = setTimeout(_expireCachedTime, 5) }
        _lastTimestring = _timestampString = '';
        return _lastTimestamp;
    }
}
function getNewerTimestring( ts ) {
    var ms = getNewerTimestamp(ts);
    return _lastTimestring || (_lastTimestring = new Date(ms).toISOString());
}
function getTimestampString( ) {
    return _timestampString || (_timestampString = pad(encode64(_lastTimestamp), 7));
}
function getDate( now ) {
    now = now === undefined && utils.getNewerTimestamp(0) || now;
    return new Date(now);
}

/** blocked event loop detector:
var lastMark = new Date().getTime();
setTimeout(function heartbeat() {
    var now = new Date().getTime();
    if (now - lastMark > 1.5 * 20) console.log("AR: heartbeat delayed by %d ms", now - lastMark - 20);
    lastMark = now;
    setTimeout(heartbeat, 20);
}, 20);
/**/

/*
 * guaranteed unique ids similar to mongoid's and uuid's, composed out of a timestamp,
 * unique system identifier, and sequence number.  Timestamps have millisecond resolution
 */
var _idSequenceLimit = 64 * 64 * 64;
var _idSequence = 0;
var _idTimestamp = getNewerTimestamp(0);
var _idPrefix = '';
function getId( sysid ) {
    var ts = getNewerTimestamp(0);
    if (ts > _idTimestamp) {                    // new timestamp needs a reformat (and maybe restart seq)
        _idPrefix = ''; _idTimestamp = ts; if (_idSequence > _idSequenceLimit * .5) { _idSequence = 0 } }
    else if (_idSequence >= _idSequenceLimit) { // when sequence overflows need new timestamp
        _idPrefix = ''; _idSequence = 0; ts = _idTimestamp = getNewerTimestamp(_idTimestamp) }

    if (!_idPrefix) _idPrefix = getTimestampString() + sysid + pad(encode64((_idSequence >>> 6) & 0xfff), 2);
    var ch = _idSequence++ & 0x3f, id = _idPrefix + _charset64[ch];

    if (ch === 63) _idPrefix = ''               // when last digit overflows need to reformat
    return id;
}

function getIds( sysid, count ) {
    var ids = new Array(count);
    for (var i = 0; i < count; i++) ids[i] = getId(sysid);
    return ids;
}

// non-yielding looper
// avoiding setImmediate doubles the speed
function _tryCall(fn, cb, i) { try { fn(cb, i) } catch (e) { cb(e) } }
function repeatUntil( fn, callback ) {
    var ncalls = 0, nticks = 0, i = 0;
    function relaunch(err, isDone) {
        // note: does not detect multiple callbacks
        if (err || isDone) callback(err /* AR: NOT: , isDone*/);
        else if (ncalls++ < 10) _tryCall(fn, relaunch, i++);
        else if (nticks++ < 10) { ncalls = 0; process.nextTick(relaunch) }
        else { ncalls = nticks = 0; utils.setImmediate(relaunch) }
    }
    relaunch();
}

function iterateSteps( steps, callback ) {
    var arg1, arg2, doneCb;
    function stepCb(err, a, b) { arg1 = a; arg2 = b; doneCb(err) }
    function loop(done, i) {
        if (i >= steps.length) return done(null, true);
        // note: doneCb is only valid until the first callback, multiple callbacks are not detected
        doneCb = done;
        steps[i](stepCb, arg1, arg2);
    }
    repeatUntil(loop, function(err) { callback(err, arg1, arg2) });
}

// interval jobs (each job is run on an interval timer, not on an absolute schedule)
function Cron( ) {
    this.jobs = [];

    this.schedule = function schedule(interval, fn, errorCallback) {
        interval = utils.parseInterval(interval);
// FIXME: throw only on NaN (accept numeric 0 as being a valid interval)
        if (!interval) throw new Error('invalid interval, expected [0-9]+[hms]');
        var now = Date.now();
        this.jobs.push({ interval: interval, start: now, next: this._findNextTime(now, now, interval), fn: fn, ecb: errorCallback });
        return this;
    }
    this.run = function run(now, callback) {
        var i = 0, jobs = this.jobs, cbs = this.callbacks, self = this;
        if (!jobs.length) return callback();
        utils.repeatUntil(function(done) {
            if (jobs[i].next > now) { return done(null, ++i >= jobs.length); }
            jobs[i].next = self._findNextTime(now, jobs[i].start, jobs[i].interval);
            jobs[i].fn(function(err) { if (err && jobs[i].ecb) jobs[i].ecb(err); done(null, ++i >= jobs.length) });
        }, function(err, isDone) { callback(err) });
    }
    this._findNextTime = function _findNextTime( nowMs, startMs, interval ) {
        // run at next even multiple of interval relative to when job was started
        var msRunning = nowMs - startMs;
        return nowMs + (interval - (msRunning % interval));
    }
}
function parseInterval( interval ) {
    if (typeof interval === 'number') return interval;
    var units = { d: 24*3600*1000, h: 3600*1000, m: 60*1000, s: 1000, '': 1 };
    var parts = String(interval).match(/^(\d+)([dhms]?)$/) || [];
    return Number(parts[1]) * units[parts[2]]; // number or NaN
}

function _invoke( func, argv, self ) {
    return func.apply(self, argv);
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
    if (typeof props !== 'object') props = { message: String(props), code: props };
    var message = props.message || props.error && props.error.message;
    var error = props.error || new Error(props.message || props.code);
    for (var k in props) if (k !== 'error') error[k] = props[k];
    return error;
}

var _argNames = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9'];
function abstract( name ) {
    if (arguments.length > 1 + 9) throw new Error('abstract method: too many arguments');
    var src = 'function ' + name + '(' + _argNames.slice(0, arguments.length - 1).join(', ') + ') {\n' +
              '  throw new Error("abstract function ' + name + ': not implemented");\n' +
              '}';
    var fn = eval('1 && ' + src);
    fn.__abstract__ = true;
    return fn;
}

function filterUpdate( jobs, selectFn, props, options, callback ) {
    options = options || {}; // options.found, options.limit, options.remove
    var job, found = options.found || [];
    for (var i = 0, j = 0; i < jobs.length && !(found.length >= options.limit); i++) {
        if (selectFn(jobs[i])) {
            var job = jobs[i];
            if (props) for (var k in props) job[k] = (typeof props[k] === 'function') ? props[k](job) : props[k];
            found.push(job);
        } else if (options.remove === true) (i !== j) ? jobs[j++] = jobs[i] : j++;
    }
    if (options.remove === true) jobs.length -= found.length;
    callback && setImmediate(callback, null, found);
    return found;
}

function _configure( func ) {
    // re-parse the function in this file context, and run it to modify file local state
    // This is a hook for unit tests to be able to configure otherwise unreachable id states.
    func = eval('true && ' + func);
    func();
}

// based on qibl.merge
function merge2( target, obj ) {
    if (!obj || typeof obj !== 'object') return target;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i], val = obj[key];
        // nb: every hash added to target must be distinct, not shared with obj
        target[key] = !isHash(val) ? val
            : isHash(target[key]) ? merge2(target[key], val) : merge2({}, val);
    }
    return target;
    function isHash(obj) { return obj && obj.constructor === Object }
}

// copy out onto target the properties of obj that are also set in mask
function deassign( target, obj, mask ) {
    if (obj) for (var key in mask) {
        if (mask[key]) target[key] = obj[key];
    }
    return target;
}

// Object.assign
function assignTo( target, obj ) {
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) target[keys[i]] = obj[keys[i]];
    return target;
}

// Object.keys, for symmetry with utils.valuesof()
function keysOf( obj ) {
    return Object.keys(obj);
}

// Object.values
function valuesOf( obj ) {
    var keys = Object.keys(obj);
    var values = new Array(keys.length);
    for (var i = 0; i < keys.length; i++) values[i] = obj[keys[i]];
    return values;
}

// like config and qconfig, but simpler
function _tryRequire(pathname) { try { return utils.require(pathname) } catch (err) {} }
function getConfig( configDir, options ) {
    function Config(obj) { utils.merge2(this, obj) }
    Config.prototype._merge = function(obj) { return utils.merge2(new Config(this), obj) };

    if (!options && configDir && typeof configDir === 'object') { options = configDir; configDir = null }
    options = options || {};

    configDir = configDir || options.dir || process.cwd() + '/config';
    var env = options.env || process.env.NODE_ENV || 'development';
    var envConf, conf = new Config()
        ._merge(_fetchConfig(configDir, 'default', options.loaders))
        ._merge((envConf = _fetchConfig(configDir, env, options.loaders)))
        ._merge(_fetchConfig(configDir, 'local', options.loaders));
    return envConf ? conf : null;

    function _tryLoad(loader, file) { try { return loader(file) } catch (err) {} }
    function _fetchConfig(dirname, filename, loaders) {
        var filepath = dirname + '/' + filename;
        var pkg = _tryRequire(filepath) || _tryRequire(filepath + '.json');
        for (var extn in loaders || {}) pkg = pkg || _tryLoad(loaders[extn], filepath) || _tryLoad(loaders[extn], filepath + '.' + extn);
        return pkg;
    }
}

// drift-free setInterval() periodic callback caller
// Unlike the nodejs built-in, this version always triggers at even multiples of the interval ms.
function setInterval( func, ms ) {
    var timer = {
        _nextRun: Date.now() + ms,
        _isRef: true,
        _stopped: false,
        timer: setTimeout(function recurring() {
            // node-v0.10 does not always cancel the pending timeout, ie always reschedules recurring().
            // Stop it explicitly by not not executing the callback and not scheduling a followup.
            if (timer._stopped) return;

            var now = Date.now();
            // guard against imprecise timeouts, rearm for same target time if too early
            // (not to name names, but this is for you, node-v0.10 -- 5 ms early, seariously?)
            if (now >= timer._nextRun) {
                func();
                var now = Date.now();
                do { timer._nextRun += ms } while (timer._nextRun <= now);
            }
            // nb: `this` inside the timeout callback refers to the setTimeout object, so use timer.timer
            timer.timer = setTimeout(recurring, timer._nextRun - now);
            if (!timer._isRef && timer.timer.unref) timer.timer.unref();
        }, ms),
        unref: function() { if (timer._isRef && timer.timer.unref) timer.timer.unref(); timer._isRef = false },
        ref: function() { if (!timer._isRef && timer.timer.ref) timer.timer.ref(); timer._isRef = true },
        stop: function() { timer._stopped = true; clearTimeout(timer.timer) },
    };
    return timer;
}

// like indexOf, but works with arrays and buffers
function offsetOf( buf, ch, base, bound ) {
    for (var i = base; i < bound; i++) if (buf[i] === ch) return i;
    return -1;
}

/**
function definedKeysOf( obj ) {
    var keys = new Array();
    for (var key in obj) (obj[key] !== undefined) && keys.push(key);
    return keys;
}
function definedValuesOf( obj ) {
    var values = new Array();
    for (var key in obj) (obj[key] !== undefined) && values.push(obj[key]);
    return values;
}
function gcTo( target, obj ) {
    for (var key in obj) if (obj[key] !== undefined) target[key] = obj[key];
    return target;
}
function KeyValueStore( ) {
    if (0 && typeof Map !== 'undefined') {
        var m = new Map();
        m.keys = function() { return Array.from(Map.prototype.keys.call(m)) };
        m.values = function() { return Array.from(Map.prototype.values.call(m)) };
        return m;
    }
    else if (1) {
        this._dirty = 0;
        this.items = {};
    }
}
KeyValueStore.prototype.set = function set(k, v) { this.items[k] = v };
KeyValueStore.prototype.has = function has(k) { return this.items[k] !== undefined };
KeyValueStore.prototype.get = function get(k) { return this.items[k] };
KeyValueStore.prototype.delete = function get(k) { this._dirty += 1; delete this.items[k] };
// NOTE: on some versions, delete can be slow
// KeyValueStore.prototype.delete = function get(k) { this._dirty += 1; this.items[k] = undefined };
KeyValueStore.prototype.keys = function keys() { this.gc(); return definedKeysOf(this.items) };
KeyValueStore.prototype.values = function keys() { this.gc(); return definedValuesOf(this.items) };
KeyValueStore.prototype.gc = function gc() { (this._dirty > 200) && (this.items = gcTo({}, this.items)) && (this._dirty = 0) };
KeyValueStore.prototype = toStruct(KeyValueStore.prototype);
/**/

function waitWhile( test, timeoutMs, callback ) {
    if (!test()) return process.nextTick(callback);
    var timer = timeoutMs > 0 && setTimeout(function() { timer = 'TIMEOUT' }, timeoutMs);
    setTimeout(function retry() {
        timer === 'TIMEOUT' ? callback(new utils.makeError({ code: 'ETIMEOUT', message: 'wait timeout: ' + test }))
            : !test() ? callback(null, clearTimeout(timer))
            : setTimeout(retry, 1);
    })
}

// call serializer, each next call is launched by the previous call`s release() callback
// usage: mutex.acquire(function(release) { ... release() });
function Mutex( limit ) {
    this.busy = 0;
    this.limit = limit || 1;
    this.queue = new Array();

    var self = this;
    this.acquire = function acquire(user) {
        if (self.busy < self.limit) { self.busy += 1; user(self.release) }
        else self.queue.push(user);
    }
    this.release = function release() {
        var next = self.queue.shift();
        (next) ? utils.setImmediate(next, self.release) : self.busy -= 1;
    }
}

// compare semantic version numbers, return -1, 0, +1 if v1 is <, == or > v2, respectively
function versionCompar( v1, v2 ) {
    v1 = v1.split('.'), v2 = v2.split('.');
    for (var i = 0; i < 4; i++) {
        if (v1[i] === v2[i]) continue;
        return v1[i] === undefined ? -1 : v2[i] === undefined ? +1 : parseInt(v1[i]) < parseInt(v2[i]) ? -1 : +1;
    }
    return 0;
}

// high-res timer -- for a carefully calibrated version like php see microtime(true) in qibl
function microtime( ) {
    var t = process.hrtime();
    return t[0] + t[1] * 1e-9;
}

/**
function interpolate( template, patt, argv ) {
    var s = '', pos, lastPos = 0, argix = 0;
    while ((pos = template.indexOf(patt, lastPos)) >= 0 && argix < argv.length) {
        s += template.slice(lastPos, pos) + argv[argix++];
        lastPos = pos + patt.length;
    }
    s += template.slice(lastPos);
    return s;
}
**/

function toStruct( hash ) { return toStruct.prototype = hash }
