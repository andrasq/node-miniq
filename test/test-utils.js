'use strict';

var util = require('util');
var fs = require('fs');
var utils = require('../lib/utils');

module.exports = {
    'countStat': {
        'counts stats on the stats object': function(t) {
            var stats = {};
            utils.countStat(stats, 'one', 2);
            utils.countStat(stats, 'one', 3);
            utils.countStat(stats, 'two', 1);
            t.deepEqual(stats, {one: 5, two: 1});
            t.done();
        },
    },

    'makeLogger': {
        'returns logger': function(t) {
            var uut = utils.makeLogger('test-log');
            t.equal(typeof uut.trace, 'function');
            t.equal(typeof uut.debug, 'function');
            t.equal(typeof uut.info, 'function');
            t.equal(typeof uut.warn, 'function');
            t.equal(typeof uut.error, 'function');
            t.done();
        },

        'writes to stdout': function(t) {
            var now = utils.getNewerTimestamp(0);
            var log = utils.makeLogger('test-log');
            var spy = t.stubOnce(process.stdout, 'write');
            var good = {a:123}, bad = {}; bad.a = bad;
            log.error('mock error', good, bad);

            t.ok(spy.called);
            t.equal(spy.args[0].length, 1);
            var json = JSON.parse(spy.args[0][0]);
            t.contains(json, {id: 'test-log', message: ['mock error', {a: 123}, '[Circular]']});
            t.ok(new Date(json.time) >= new Date(now));
            t.contains(spy.args[0][0], '{"a":123}');
            t.contains(spy.args[0][0], '"[Circular]"');
            t.done();
        },

        'writes to provided stream': function(t) {
            var output = [];
            var stream = { write: function(line) { output.push(line) } };
            var log = utils.makeLogger('test-log', stream);
            log.info('test1');
            log.error('test2');
            log.info('test3a', 'test3b');
            t.equal(output.length, 3);
            t.equal(typeof output[0], 'string');
            t.contains(output[0], '"time":"');
            t.contains(output[0], '"type":"INFO"');
            t.contains(output[0], '"id":"test-log"');
            t.contains(output[0], '"message":["test1"]');
            t.contains(output[1], '"type":"ERROR"');
            t.contains(output[1], '"test2"');
            t.contains(output[2], '"test3a","test3b"');
            t.done();
        },

        'does not log if beneath loglevel': function(t) {
            // loglevel defaults to 'info'
            var log = utils.makeLogger('debugLog');
            var spy = t.stub(process.stdout, 'write');
            log.debug('will not show');
            t.equal(spy.callCount, 0);
            log.warn('will show');
            log.log('will also show');
            spy.restore();
            t.equal(spy.callCount, 2);
            t.done();
        },

        'is fast': function(t) {
            var tempfile = '/tmp/test' + process.pid + '.tmp';
            var stream = fs.createWriteStream(tempfile, {flags: 'w+', highWaterMark: 400000});
            var log = utils.makeLogger('testlog', stream);
            var t1 = Date.now();
            var arg1 = { a: 'xxxxxxxxxxxxxxxxxxxxxxxxx', b: 'xxxxxxxxxxxxxxxxxxxxxxxxx', c: 'xxxxxxxxxxxxxxxxxxxxxxxxx', d: 'xxxxxxxxxxxxxxxxxxxxxxxxx' };
            // var arg2 = { c: 'xxxxxxxxxxxxxxxxxxxxxxxxx', d: 'xxxxxxxxxxxxxxxxxxxxxxxxx' };
            for (var i = 0; i < 10000; i++) { log.info(arg1); }
            stream.write('\n', function(err) {
                var t2 = Date.now();
                fs.unlinkSync(tempfile);
                console.log("AR: wrote 10k log lines in %d ms", t2 - t1);
                // ~275k / sec: 100k 200B 1x4-item json objects in .36 sec, 10k in .046 (2x2-item in .42/.057 sec)
                t.done();
            })
        },
    },

    'makeNoopLogger': {
        'returns a logger': function(t) {
            var uut = utils.makeNoopLogger();
            var log = utils.makeLogger('id');
            for (var method in log) {
                if (typeof log[method] === 'function') t.equal(typeof uut[method], 'function');
            }
            t.done();
        },

        'logger does not log': function(t) {
            var log = utils.makeNoopLogger();
            var spy = t.spy(process.stdout, 'write');
            log.error('should not show');
            t.ok(!spy.called);
            spy.restore();
            t.done();
        },
    },

    'selectField': {
        'returns array with selected field': function(t) {
            t.deepEqual(utils.selectField([], 'a'), []);
            t.deepEqual(utils.selectField([{a:1}, {b:2}, {a:3}], 'a'), [1, undefined, 3]);
            t.done();
        },

        'returns selected field from properties of an object': function(t) {
            var obj = { a: {type:1}, b: {type:2}, c: {type:3} };
            t.deepStrictEqual(utils.selectField(obj, 'type'), [1, 2, 3]);
            t.done();
        },
    },

    'uniq': {
        'returns distinct strings': function(t) {
            t.deepStrictEqual(utils.uniq([1, 2, 1, 3]), ['1', '2', '3']);
            t.deepStrictEqual(utils.uniq(['a', 'a', 'b', 'a']), ['a', 'b']);
            t.done();
        },
    },

    'groupByField': {
        'returns hash of arrays': function(t) {
            var items = [{id:1, a:1}, {id:2, a:1}, {id:3, a:3}, {id:3, a:1}];
            t.deepEqual(utils.groupByField(items, 'a'), {'1': [{id:1, a:1}, {id:2, a:1}, {id:3, a:1}], '3': [{id:3, a:3}]});
            t.deepEqual(utils.groupByField(items, 'id'), {'1': [{id:1, a:1}], '2': [{id:2, a:1}], '3': [{id:3, a:3}, {id:3, a:1}]});
            t.done();
        },

        'groups by function': function(t) {
            var items = [{a:1}, {a:2}, {a:3}];
            var groups = utils.groupByField(items, function(x) { return x.a % 2 });
            t.deepEqual(groups, { 0: [{a:2}], 1: [{a:1}, {a:3}] });
            t.done();
        },
    },

    'countByField': {
        'returns hash of counts': function(t) {
            var items = [{id:1, a:1}, {id:2, a:1}, {id:3, a:3}, {id:3, a:1}];
            t.deepEqual(utils.countByField(items, 'a'), {'1': 3, 3: 1});
            t.deepEqual(utils.countByField(items, 'id'), {'1': 1, '2': 1, '3': 2});
            t.done();
        },

        'counts by function': function(t) {
            var items = [{a:1}, {a:2}, {a:3}];
            var counts = utils.countByField(items, function(x) { return x.a % 2 });
            t.deepEqual(counts, { 0: 1, 1: 2 });
            t.done();
        },
    },

    'pad': {
        'left-pads to width with zeros': function(t) {
            t.equal(utils.pad('1', 0), '1');
            t.equal(utils.pad('1', 1), '1');
            t.equal(utils.pad('1', 2), '01');
            t.equal(utils.pad('1', 3), '001');
            t.equal(utils.pad('1', 4), '0001');
            t.equal(utils.pad('1', 5), '00001');
            t.equal(utils.pad('1', 6), '000001');
            t.equal(utils.pad('1234', 20), '00000000000000001234');
            t.done();
        },
    },

    'encode64': {
        'converts number to radix 64': function(t) {
            t.equal(utils.encode64(0), '0');
            t.equal(utils.encode64(1), '1');
            for (var i = 0; i < 300000; i++) {
                t.equal(utils.encode64(i), utils.encode64(i));
                t.ok(utils.pad(utils.encode64(i), 6) < utils.pad(utils.encode64(i + 1), 6), i);
            }
            t.done();
        },
    },

    'decode64': {
        'decodes a radix 64 string into a number': function(t) {
            for (var i = 0; i < 1000000; i++) {
                t.equal(utils.decode64(utils.encode64(i)), i);
                // 1e6 in 80ms, 12.5m/s for the pair
            }
            t.done();
        },

        'stops parsing on the first non-numeric char': function(t) {
            t.equal(utils.decode64('012-3a'), 64 + 2);
            t.done();
        },
    },

    'getNewerTimestamp': {
        'returns a current-ish timestamp': function(t) {
            // prime this function, is off by 100ms on first call
            utils.getNewerTimestamp();
            for (var ts, now, i = 0; i < 1000000; i++) {
                if (i % 100 === 0) now = Date.now();
                // slower PCs might see lantencies > 10ms, so test for 20
                t.within((ts = utils.getNewerTimestamp(0)), now, 20, util.format("i = %d, now-ts = %d", i, now - ts));
            }
            t.done();
        },

        'is non-decreasing': function(t) {
            var last = 0;
            for (var i = 0; i < 1000000; i++) {
                var ts = utils.getNewerTimestamp(0);
                t.ok(ts >= last, 'i = ' + i);
                last = ts;
            }
            t.done();
        },

        'is newer than provided timestamp': function(t) {
            var now = Date.now();
            t.ok(utils.getNewerTimestamp(now + 2) >= now + 2);
            t.done();
        },

        'also provides non-decreasing encoded timestamp string': function(t) {
            var last = '';
            for (var i = 0; i < 1000000; i++) {
                var ts = utils.getNewerTimestamp(0);
                var str = utils.getTimestampString();
                t.ok(str >= last, 'i = ' + i);
                last = str;
            }
            t.done();
        },

        'can return date': function(t) {
            var spy = t.spyOnce(utils, 'getNewerTimestamp');
            var dt = utils.getDate();
            t.ok(dt instanceof Date);
            t.ok(spy.called);

            var now = new Date();
            var dt = utils.getDate(now.getTime());
            t.notEqual(dt, now);
            t.equal(dt.getTime(), now.getTime());

            var dt = utils.getDate(now);
            t.notEqual(dt, now);
            t.equal(dt.getTime(), now.getTime());

            t.done();
        },
    },

    'getIds': {
        'returns monotonically increasing ids': function(t) {
            var ids = utils.getIds('-mque-', 3);
console.log("AR: got ids", ids);
            t.ok(ids[0] < ids[1]);
            t.ok(ids[1] < ids[2]);
            t.done();
        },

        'can generate many ids in one call without duplicates': function(t) {
            var t1 = Date.now();
            var ids = utils.getIds('-mque-', 300000);
            var t2 = Date.now();
console.log("AR: got %d ids in %d ms, %d/ms", ids.length, t2 - t1, (ids.length / (t2 - t1)) >>> 0);

            t.equal(ids.length, 300000);
            for (var i = 1; i < ids.length; i++) t.ok(ids[i - 1] < ids[i]);
            t.done();
        },

        'can generate many ids singly without duplicates': function(t) {
            var ids = new Array();
            var t1 = Date.now();
            utils.repeatUntil(function(next) {
                ids.push(utils.getIds('-mque-', 1)[0]);
                next(null, ids.length >= 300000);
            },
            function(err) {
                var t2 = Date.now();
console.log("AR: got %d ids in %d ms, %d/ms", ids.length, t2 - t1, (ids.length / (t2 - t1)) >>> 0);

                t.equal(ids.length, 300000);
                for (var i = 1; i < ids.length; i++) t.ok(ids[i - 1] < ids[i]);
                t.done();
            })
        },

        'correctly rolls sequence just before timetamp change': function(t) {
            utils._configure(function() {
                // configure the ids to the end of the sequence
                _idSequence = _idSequenceLimit - 2;
                _sequencePrefix = encode64(_idSequence >>> 6);
                _idTimestamp = Date.now() + 20;
            });
            // align to the start of a new millisecond
            utils.getNewerTimestamp(Date.now());

            // overflow the sequence all during the same millisecond
            var ids = new Array();
            for (var i = 0; i < 5; i++) ids.push(utils.getId('-sys-'));

            for (var i = 1; i < 5; i++) t.ok(ids[i - 1] < ids[i]);
            t.done();
        },
    },

    'repeatUntil': {
        'repeats 0 times': function(t) {
            utils.repeatUntil(function(done) { done(null, true) }, t.done);
        },

        'repeat 2 times': function(t) {
            var ncalls = 0;
            utils.repeatUntil(function(done) { done(null, ++ncalls === 2) }, t.done);
        },

        'splits a deep call stack': function(t) {
            var ncalls = 0;
            utils.repeatUntil(function(done) { done(null, ++ncalls === 100000) }, t.done);
        },

        'passes the loop count index': function(t) {
            var args = [];
            utils.repeatUntil(function(done, i) { args.push(i); done(null, args.length >= 3) }, function(err) {
                t.ifError(err);
                t.deepEqual(args, [0, 1, 2]);
                t.done();
            })
        },

        'returns errors': function(t) {
            var ncalls = 0, err = 'mock error';
            utils.repeatUntil(function(done) { ++ncalls === 3 ? done(err) : done() }, function(err2) {
                t.equal(err2, err);
                t.done();
            });
        },

        'catches errors': function(t) {
            var ncalls = 0;
            utils.repeatUntil(function(done) { if (++ncalls === 3) throw 'mock-error'; done() }, function(err) {
                t.ok(err);
                t.equal(err, 'mock-error')
                t.done();
            })
        },
    },

    'iterateSteps': {
        'runs 0 steps': function(t) {
            utils.iterateSteps([], t.done);
        },

        'returns callback args': function(t) {
            utils.iterateSteps([function(next) { next('mock err', 1, 2, 3) }], function(err, a, b, c) {
                t.strictEqual(err, 'mock err');
                t.equal(a, 1);
                t.equal(b, 2);
                t.done();
            })
        },

        'runs 1 steps': function(t) {
            utils.iterateSteps([function(next) { next() }], t.done);
        },

        'runs 4 steps propagating arg': function(t) {
            utils.iterateSteps([
                function(next) { next(null, 123, 1) },
                function(next, x, a) { next(null, x, a + 2) },
                function(next, x, a) { next(null, x, a + 3) },
                function(next, x, a) { next(null, x, a + 4) },
            ], function(err, x, a) {
                t.equal(x, 123);
                t.equal(a, 10);
                t.done();
            })
        },
    },

    'Cron': {
        setUp: function(done) {
            this.uut = new utils.Cron();
            done();
        },

        'schedules jobs': function(t) {
            function noop() {}
            this.uut.schedule(10, noop);
            this.uut.schedule('200', noop);
            this.uut.schedule('3s', noop);
            t.equal(this.uut.jobs.length, 3);
            t.ok(this.uut.jobs[0].next > Date.now() + 10-2 && this.uut.jobs[0].next < Date.now() + 10+2);
            t.ok(this.uut.jobs[1].next > Date.now() + 200-2 && this.uut.jobs[1].next < Date.now() + 200+2);
            t.ok(this.uut.jobs[2].next > Date.now() + 3000-2 && this.uut.jobs[2].next < Date.now() + 3000+2);
            t.done();
        },

        'throws on invalid interval': function(t) {
            t.throws(function(){ new utils.Cron().schedule('one', function(){}) }, /invalid .* expected/);
            t.done();
        },

        'runs 0 jobs': function(t) {
            this.uut.run(Date.now(), function() {
                t.done();
            })
        },

        'runs 1 jobs at scheduled time': function(t) {
            var ncalls = 0;
            this.uut.schedule(10, function(cb) {
                ncalls++;
                cb();
            })
            var uut = this.uut;
            var now = Date.now();
            uut.run(now + 5, function(err) {
                t.ifError(err);
                t.equal(ncalls, 0);
                uut.run(now + 15, function(err) {
                    t.ifError(err);
                    t.equal(ncalls, 1);
                    uut.run(now + 15, function(err) {
                        t.ifError(err);
                        t.equal(ncalls, 1);
                        uut.run(now + 25, function(err) {
                            t.ifError(err);
                            t.equal(ncalls, 2);
                            t.done();
                        })
                    })
                })
            })
        },

        'reports errors to the callback': function(t) {
            var error;
            this.uut.schedule(10, function(cb) { cb() });
            this.uut.schedule(10, function(cb) { cb('mock error') }, function(err) { error = err });
            this.uut.schedule(10, function(cb) { cb('another error') });
            this.uut.run(Date.now() + 11, function(err) {
                t.ifError(err);
                t.equal(error, 'mock error');
                t.done();
            })
        },
    },

    'invoke': {
        'calls the handler': function(t) {
            t.deepEqual(utils.invoke(function() { return [].slice.apply(arguments) }, [1, 2, 3]), [1, 2, 3]);
            t.done();
        },

        'polyfill calls the handler': function(t) {
            t.deepEqual(utils._invoke(function() { return [].slice.apply(arguments) }, [1, 2, 3]), [1, 2, 3]);
            t.done();
        },
    },

    'varargs': {
        'creates a function': function(t) {
            function noop() {}
            var f1 = utils.varargs(noop);
            var f2 = utils.varargs(noop);
            t.equal(typeof f1, 'function');
            t.equal(typeof f2, 'function');
            t.notEqual(f1, f2);
            t.done();
        },

        'passes its argumentsto handler and returns handler result': function(t) {
            var fn = utils.varargs(function handler(argv){ return argv });
            t.deepEqual(fn(1, 2, 3), [1, 2, 3]);
            t.done();
        },

        'passes self to handler': function(t) {
            var self = { a: 123 };
            var a = undefined;
            var fn = utils.varargs(function handler(argv, obj) { t.equal(obj, self); t.done() }, self);
            fn();
        },

        'polyfill passes its argumentsto handler and returns handler result': function(t) {
            var self = {};
            var fn = utils._varargs(function handler(argv, obj) { t.equal(obj, self); return argv }, self);
            t.deepEqual(fn(1, 2, 3), [1, 2, 3]);
            t.done();
        },
    },

    'makeError': {
        'returns a new Error': function(t) {
            t.ok(utils.makeError() instanceof Error);

            var fields = { code: 'MOCK_ERROR', a: 123, b: "two" };
            var err = utils.makeError(fields);
            t.ok(err instanceof Error);
            t.equal(typeof err.stack, 'string');
            t.contains(err.message, 'MOCK_ERROR');
            t.contains(err, fields);
            t.done();
        },

        'annotates an existing error': function(t) {
            var err = new Error('test-error2');
            var fields = { code: 'CODE_TWO', a: 123.5 }
            var err2 = utils.makeError(_assign({ error: err }, fields));
            t.equal(err2, err);
            t.contains(err2, fields);
            t.done();
        },

        'accepts an error code': function(t) {
            var err = utils.makeError('ETESTCODE');
            t.strictEqual(err.message, 'ETESTCODE');
            t.strictEqual(err.code, 'ETESTCODE');
            var err = utils.makeError(1234);
            t.strictEqual(err.message, '1234');
            t.strictEqual(err.code, 1234);
            t.done();
        },
    },

    'abstract': {
        'returns a method that expects the right arguments but throws': function(t) {
            var method = utils.abstract('methodName', 'x: int', 'y: string[]');
            t.equal(typeof method, 'function');
            t.equal(method.length, 2);
            t.equal(method.name, 'methodName');
            t.throws(function() { method() }, /not implemented/);
            t.done();
        },

        'accepts no more than 9 args': function(t) {
            t.throws(
                function() { utils.abstract('invalid', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10') },
                /too many arguments/);
            t.done();
        },
    },

    'filterUpdate': {
        'returns selected items': function(t) {
            var items = [1, 2, 3, 4, 5];
            var found0 = utils.filterUpdate(items, function(x) { return x % 2 }, null, null, function(err, found) {
                t.equal(found, found0);
                t.deepEqual(found, [1, 3, 5]);
                t.done();
            })
        },

        'updates item properties': function(t) {
            var items = [{a:1}, {a:2}, {a:3}];
            utils.filterUpdate(items,
                function(x) { return x.a % 2 },
                { b: 1, c: function(obj) { return obj.a + 10} },
                null,
                function(err, found) {
                    t.deepEqual(found, [{a:1, b:1, c:11}, {a:3, b:1, c:13}]);
                    t.deepEqual(items, [{a:1, b:1, c:11}, {a:2}, {a:3, b:1, c:13}]);
                    t.done();
                }
            )
        },

        'appends to provided array and removes from items': function(t) {
            var found = [];
            var items = [1, 2, 3, 4, 5];
            var ret = utils.filterUpdate(items, function(x) { return x % 2 }, null, {found: found, remove: true}, function(err, res) {
                t.equal(res, found);
                t.equal(ret, found);
                t.deepEqual(res, [1, 3, 5]);
                t.deepEqual(items, [2, 4]);
                t.done();
            });
        },
    },

    'merge2': {
        'merges objects': function(t) {
            var a = {a: 1, c: {a: 11}};
            var b = {b: 2, c: {b: 22}};
            var mm = {};
            utils.merge2(mm, a);
            utils.merge2(mm, b);
            t.deepEqual(mm, {a: 1, b: 2, c: {a: 11, b: 22}});
            t.done();
        },

        'does not merge in non-objects': function(t) {
            var a = {a: 1};
            var expect = {a: 1};
            t.deepEqual(utils.merge2(a, null), expect);
            t.deepEqual(utils.merge2(a, false), expect);
            t.deepEqual(utils.merge2(a, 123), expect);
            t.done();
        },

        'does not alter properties of merged-in objects': function(t) {
            var a = {a: 1, b: 1};
            var b = {b: {b: 2}};
            var c = {b: {c: 3}};
            var m = utils.merge2(utils.merge2(utils.merge2({}, a), b), c);
            t.deepEqual(m, {a: 1, b: {b: 2, c: 3}});
            t.deepEqual(a, {a: 1, b: 1});
            t.deepEqual(b, {b: {b: 2}});
            t.deepEqual(c, {b: {c: 3}});
            t.done();
        },
    },

    'deassign': {
        'copies out properties': function(t) {
            t.deepEqual(utils.deassign({}, {a:1, b:2}, {a:true}), {a:1});
            t.deepEqual(utils.deassign({}, {a:1, b:2}, {a:false}), {});
            t.deepEqual(utils.deassign({c:3}, {a:1, b:2}, {a:true, b:0}), {c:3, a:1});
            t.deepEqual(utils.deassign({}, null, {a:true}), {});
            t.done();
        },
    },

    'assignTo': {
        'transfers own properties onto target': function(t) {
            var a = {a:1};
            t.deepEqual(utils.assignTo(a, {b:2}), {a:1, b:2});
            t.deepEqual(a, {a:1, b:2});
            t.done();
        },
    },

    'keysOf': {
        'returns the own property names of the object': function(t) {
            t.deepEqual(utils.keysOf({a:1, b:2}), ['a', 'b']);
            t.deepEqual(utils.keysOf({}), []);
            t.deepEqual(utils.keysOf(new Date()), []);
            var x = new Date();
            x.a = 1;
            x.b = [];
            t.deepEqual(utils.keysOf(x), ['a', 'b']);
            t.done();
        },
    },

    'valuesOf': {
        'returns own properties in an array': function(t) {
            function Foo() { this.a = 1; this.b = 2 }
            Foo.prototype.c = 3;
            t.deepEqual(utils.valuesOf(new Foo()), [1, 2]);
            t.done();
        },
    },

    'getConfig': {
        'returns null if not configured': function(t) {
            t.strictEqual(utils.getConfig('../nonesuch'), null);
            t.done();
        },

        'reads ../config and layers in default, development and local': function(t) {
            var spy = t.stub(utils, 'require', function require(path) { return /development.json$/.test(path) && {} }).configure('saveLimit', 20);
            utils.getConfig();
            spy.restore();
            t.equal(spy.callCount, 6);
            t.contains(spy.args[0][0], '/config/default');
            t.contains(spy.args[1][0], '/config/default.json');
            t.contains(spy.args[2][0], '/config/development');
            t.contains(spy.args[3][0], '/config/development.json');
            t.contains(spy.args[4][0], '/config/local');
            t.contains(spy.args[5][0], '/config/local.json');
            t.done();
        },

        'reads from the specified config directory': function(t) {
            var spy = t.spy(utils, 'require');
            utils.getConfig('../foo/bar/myConfig');
            spy.restore();
            t.contains(spy.args[3][0], '../foo/bar/myConfig/development');
            t.done();
        },

        'looks by default in $PWD/config': function(t) {
            var localConfig = process.cwd() + '/config/';
            var spy = t.stub(utils, 'require').configure('saveLimit', 10);
            utils.getConfig();
            spy.restore();
            t.contains(spy.args[0][0], localConfig);
            t.done();
        },

        'loads the config for NODE_ENV': function(t) {
            var env = process.env.NODE_ENV;
            process.env.NODE_ENV = 'mytest';
            var spy = t.spy(utils, 'require');
            utils.getConfig();
            spy.restore();
            // process.env is magic, it stores the stringified value so must delete to restore undefined
            env === undefined ? delete process.env.NODE_ENV : process.env.NODE_ENV = env;
            t.contains(spy.args[2][0], '/config/mytest');
            t.done();
        },

        'uses provided loaders': function(t) {
            var stub = t.stub().throws(new Error('not found'));
            utils.getConfig({ dir: '/nonesuch/config', loaders: { yml: stub } });
            t.equal(stub.callCount, 6);
            t.contains(stub.args[0][0], '/config/default');
            t.contains(stub.args[1][0], '/config/default.yml');
            t.done();
        },
    },

    'setInterval': {
        'returns timer that can be stopped': function(t) {
            var ncalls = 0;
            var timer = utils.setInterval(function(){ ncalls += 1; if (ncalls == 2) timer.unref() }, 4);
            setTimeout(function() {
                t.equal(ncalls, 5);
                timer.stop();
                setTimeout(function() {
                    t.equal(ncalls, 5);
                    t.done();
                }, 17);
            }, 22);
        },

        'can ref and unref': function(t) {
            var timer = utils.setInterval(function(){}, 100);
            timer.unref();
            timer.unref();
            timer.ref();
            timer.ref();
            t.done();
        },

        'ref and unref operate on the node timer': function(t) {
            var timer = utils.setInterval(function(){}, 100);
            var spyUnref = t.spyOnce(timer.timer, 'unref');
            var spyRef = t.spyOnce(timer.timer, 'ref');
            timer.unref();
            timer.ref();
            t.ok(spyUnref.called);
            t.ok(spyRef.called);
            t.done();
        },

        'a _stopped timer does not run': function(t) {
            // check that _stopped also disables the timer callback (for node-v0.10 that doesnt cancel the timeout in time)
            var called = false;
            var timer = utils.setInterval(function() { called = true }, 1);
            timer._stopped = true;
            setTimeout(function() {
                t.ok(!called);
                t.done();
            }, 10);
        },

        'reschedules a premature timeout': function(t) {
            var startTime = Date.now();
            var stopTime = 0;
            var timer = utils.setInterval(function() { stopTime = Date.now(); timer.stop() }, 5);

            // fudge the nextRun time to make it appear that the timeout triggered too early
            timer._nextRun += 5;

            setTimeout(function() {
                t.ok(stopTime > 0);
                t.ok(stopTime - startTime >= 10);
                t.done();
            }, 15);
        },
    },

/**
    'KeyedSet': {
        'fast as a Map': function(t) {
            var x;

            console.time('KeyedSet');
            var ks = new utils.KeyedSet();
            for (var i=0; i<200000; i++) ks.set(rand(i), i);
            for (var i=0; i<200000; i++) ks.has(rand(i));
            for (var i=0; i<200000; i++) ks.get(rand(i));
            for (var i=0; i<200000; i++) ks.delete(rand(i));
            console.timeEnd('KeyedSet');

            if (typeof Map === undefined) return t.done();

            console.time('Map');
            var m = new Map();
            for (var i=0; i<200000; i++) m.set(rand(i), i);
            for (var i=0; i<200000; i++) m.has(rand(i));
            for (var i=0; i<200000; i++) m.get(rand(i));
            for (var i=0; i<200000; i++) m.delete(rand(i));
            console.timeEnd('Map');

            t.done();

            function rand(i) { return i * 1001 & 0xFFFFFF }
        },
    },
**/

    'toStruct': {
        'returns the struct': function(t) {
            var x = {};
            t.equal(utils.toStruct(x), x);
            t.done();
        },
    },
}

function _assign(target, src) { for (var k in src) target[k] = src[k]; return target }
