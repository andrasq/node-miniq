'use strict';

var util = require('util');
var nodeMajor = parseInt(process.versions.node);
var _charset64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~'.split('');
var _codeset64 = {}; for (var i = 0; i < _charset64.length; i++) _codeset64[_charset64[i]] = i;

// node-v0.8 lacks setImmediate; node-v0.10 has setImmediate, but a module var hides it; newer node all have it
var setImmediate = eval('global.setImmediate || function(fn, a, b, c) { process.nextTick(function() { fn(a, b, c) }) }');

var utils = module.exports = {
    countStat: countStat,
    makeLogger: makeLogger,
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
    valuesOf: valuesOf,
    getConfig: getConfig,
    require: require,
    setInterval: setInterval,
    toStruct: toStruct,

    _invoke: _invoke,
    _varargs: _varargs,
    _configure: _configure,
}

function countStat( stats, name, value ) {
    (stats[name] === undefined) ? (stats[name] = value) : (stats[name] += value);
}

// fully functional json logger
function makeLogger( id, stream ) {
    var levelNos = { LOG: 6, ERROR: 3, WARN: 4, INFO: 6, DEBUG: 7, TRACE: 8,
                     log: 6, error: 3, warn: 4, info: 6, debug: 7, trace: 8, };
    var loglineTemplate = '{"time":"%s","id":"%s","type":"%s","message":%s}\n';
    function vlogit(argv, level) {
        if (levelNos[level] > (levelNos[process.env.LOG_LEVEL] || 6)) return;
        var logline = util.format(loglineTemplate, new Date(getNewerTimestamp(0)).toISOString(), id, level,
            Array.isArray(argv) ? '[' + argv.map(function(x){ return _tryJsonEncode(x) }).join(',') + ']' : _tryJsonEncode(argv));
        (stream || process.stdout).write(logline);
    }
    function vlogitf(argv, level) {
        vlogit(utils.invoke(util.format, argv), level);
    }
    return { trace: utils.varargs(vlogit, 'TRACE'), debug: utils.varargs(vlogit, 'DEBUG'),
              info: utils.varargs(vlogit, 'INFO'),   warn: utils.varargs(vlogit, 'WARN'),  error: utils.varargs(vlogit, 'ERROR'),
               log: utils.varargs(vlogitf, 'LOG') };
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
        if (!_timeout) { _timeout = setTimeout(_clearLastTime, 5); _timeout.unref && _timeout.unref() }
    } else {
        _ncalls = 0;
        while ((_lastTimestamp = Date.now()) <= ts) ;
        _timestampString = pad(encode64(_lastTimestamp), 7);
    }
    return _lastTimestamp;
    function _clearLastTime() { _lastTimestamp = 0; _timeout = null }
}
function getTimestampString( ts ) {
    return _timestampString;
}
function getDate( now ) {
    now = now === undefined && utils.getNewerTimestamp(0) || now;
    return new Date(now);
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

function _tryCall(fn, cb, i) { try { fn(cb, i) } catch (e) { cb(e) } }
function repeatUntil( fn, callback ) {
    var ncalls = 0, i = 0;
    function relaunch(err, isDone) {
        if (err || isDone) return setImmediate(callback, err, isDone);
        if (ncalls++ < 10) return _tryCall(fn, relaunch, i++);
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
        } else if (options.remove === true && i !== j) jobs[j++] = jobs[i];
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

// setInterval() with much less drift than the nodejs builtin
// This version maintains the launch time to within 1ms (66000 calls, 1:50 hrs, 10 per sec).
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

function toStruct( hash ) { return toStruct.prototype = hash }
