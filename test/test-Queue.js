'use strict';

var util = require('util');
var utils = require('../lib/utils');
var Queue = require('../lib/Queue');
var JournalArray = require('../lib/JournalArray');
var SchedulerRandom = require('../lib/SchedulerRandom');
var MockStore = require('../lib/MockStore');
var MockRunner = require('../lib/MockRunner');

function makeQueue( ) {
    var sysid = 'q' + Math.floor(Math.random() * 0x10000).toString(16);
    return new Queue(
        sysid,
        new JournalArray(),
        new SchedulerRandom(),
        new MockStore(),
        new MockRunner(),
        utils.makeLogger(sysid)
    );
}

module.exports = {
    beforeEach: function(done) {
        this.uut = makeQueue();
        this.uut.configure({
            statsEmitter: {
                emit: utils.varargs(function(argv) {
                    argv.unshift('stats:'); utils.invoke(console.log, argv);
                }),
            }
        })
        done();
    },

    'constructor': {
        'has expected methods': function(t) {
            var methods = ['run', 'addJobs'];
            for (var i = 0; i < methods.length; i++) t.equal(typeof this.uut[methods[i]], 'function');
            t.done();
        },

        'sets a default sysid': function(t) {
            var uut = new Queue(null, new JournalArray(), new SchedulerRandom(), new MockStore(), new MockRunner(), utils.makeLogger(''));
            t.equal(typeof uut.sysid, 'string');
            t.ok(uut.sysid.length > 0);
            t.done();
        },
    },

    'ingestJournal': {
        'consumes lines from journal and adds jobs to store': function(t) {
            var lines = ['id1|type1|data1', 'id2|type1|data2', 'id3|type2|data3'];
            this.uut.journal.write(lines);
            var spy = t.spy(this.uut.store, 'addJobs');
            this.uut.ingestJournal(function(err) {
                t.ifError(err);
                t.equal(spy.args[0][0].length, 3);
                t.contains(spy.args[0][0][0], { id: 'id1', type: 'type1', data: 'data1' });
                t.contains(spy.args[0][0][1], { id: 'id2', type: 'type1', data: 'data2' });
                t.contains(spy.args[0][0][2], { id: 'id3', type: 'type2', data: 'data3' });
                t.done();
            })
        },

        'times out ingest processing': function(t) {
            var lines = ['id1|type1|data1', 'id2|type1|data2', 'id3|type2|data3'];
            this.uut.journal.write(lines);
            var spy = t.spy(this.uut.store, 'addJobs');
            this.uut.config.ingest.timeLimitMs = -10;
            this.uut.ingestJournal(function(err) {
                t.ifError(err);
                t.ok(!spy.called);
                t.done();
            })
        },

        'decodes job creation time from the id': function(t) {
            var id = utils.pad(utils.encode64(1234567891234), 7) + '-test-01234';
            this.uut.journal.write([id + '|type1|data1']);
            var spy = t.spy(this.uut.store, 'addJobs');
            this.uut.ingestJournal(function(err) {
                t.ifError(err);
                t.ok(spy.called);
                t.contains(spy.args[0][0][0], { dt: new Date(1234567891234) });
                t.done();
            })
        },

        'flags invalid lines': function(t) {
            this.uut.journal.write(['invalid line 1', 'id1|type1|data1', 'invalid 2']);
            var spy = t.spy(this.uut.store, 'addJobs');
            var spyLog = t.spy(process.stdout, 'write');
            this.uut.ingestJournal(function(err) {
                spyLog.restore();
                t.ifError(err);
                t.equal(spy.args[0][0].length, 1);
                t.contains(spy.args[0][0][0], { id: 'id1', type: 'type1', data: 'data1' });
                t.contains(spyLog.args[0][0], /not a job.*invalid line 1/);
                t.contains(spyLog.args[1][0], /not a job.*invalid 2/);
                t.done();
            })
        },

        'cancels read token on store insert error': function(t) {
            this.uut.journal.write(['id1|type1|data1']);
            t.stub(this.uut.store, 'addJobs').yields(new Error('mock error'));
            var spy = t.spy(this.uut.journal, 'readCancel');
            this.uut.ingestJournal(function(err) {
                t.ok(spy.called);
                t.equal(err.message, 'mock error');
                t.done();
            })
        },
    },

    'addJobs': {
        'appends to journal': function(t) {
            var spy = t.spyOnce(this.uut.journal, 'write');
            this.uut.addJobs('type1', 'line1\n\nline2\n#\n', function(err, count) {
                t.ifError(err);
                t.equal(count, 2);
                t.ok(spy.called);
                t.contains(spy.args[0][0][0], '|line1');
                t.contains(spy.args[0][0][1], '|line2');
                t.done();
            })
        },
    },

    'run': {
        'calls handleDoneJobs, runNewJobs, ingestJournal': function(t) {
            var spy1 = t.stub(this.uut, 'handleDoneJobs').yields(new Error('mock done jobs error'));
            var spy2 = t.stub(this.uut, 'runNewJobs').yields(new Error('mock new jobs error'));
            var spy3 = t.stub(this.uut, 'ingestJournal').yields(new Error('mock ingest error'));
            this.uut.run({ countLimit: 1 }, function(err) {
                t.ok(spy1.called);
                t.ok(spy2.called);
                t.ok(spy3.called);
                t.done();
            })
        },

        'runs cron': function(t) {
            var spy1 = t.stub(this.uut.cron, 'run').yields(new Error('mock cron error'));
            this.uut.run({ countLimit: 1 }, function(err) {
                t.ok(spy1.called);
                t.done();
            })
        },

        'runs cron steps and emits stats': function(t) {
            this.uut.configure({
                cron: {
                    renewLocksInterval: 1,
                    expireLocksInterval: 1,
                    expireJobsInterval: 1,
                },
            })
            var spyRenewLocks = t.spy(this.uut, '_renewLocks');
            var spyExpireLocks = t.spy(this.uut, '_expireLocks');
            var spyExpireJobs = t.spy(this.uut, '_expireJobs');
            var spyStats = t.spy(this.uut.stats, 'emit');
            this.uut.run({ timeLimitMs: 5 }, function(err) {
                t.ifError(err);
                t.ok(spyRenewLocks.called);
                t.ok(spyExpireLocks.called);
                t.ok(spyExpireJobs.called);
                t.ok(spyStats.callCount >= 3);
                t.done();
            })
        },

        'stops by count': function(t) {
            var count = 0;
            t.stub(this.uut, 'ingestJournal', function(cb) { count += 1; cb() });
            this.uut.run({ countLimit: 7 }, function(err) {
                t.equal(count, 7);
                t.done();
            })
        },

        'stops by time': function(t) {
            var now = Date.now();
            this.uut.run({ timeLimitMs: 7 }, function(err) {
                t.ok(Date.now() >= now + 7);
                t.done();
            })
        },
    },
}
