'use strict';

var util = require('util');
var utils = require('../lib/utils');
var Store = require('../lib/Store');
var Queue = require('../lib/Queue');
var JournalArray = require('../lib/JournalArray');
var SchedulerRandom = require('../lib/SchedulerRandom');
var MockStore = require('../lib/MockStore');
var HandlerStore = require('../lib/HandlerStore');
var MockRunner = require('../lib/MockRunner');

function makeQueue( ) {
    var sysid = 'q' + Math.floor(Math.random() * 0x10000).toString(16);
    return new Queue(
        sysid,
        new JournalArray(),
        new SchedulerRandom(),
        new MockStore(),
        new HandlerStore(new MockStore()),
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
            var uut = new Queue(null,
                new JournalArray(), new SchedulerRandom(), new MockStore(), new HandlerStore(new MockStore()),
                new MockRunner(), utils.makeLogger(''));
            t.equal(typeof uut.sysid, 'string');
            t.ok(uut.sysid.length > 0);
            t.done();
        },

        'requires the right types': function(t) {
            var journal = new JournalArray();
            var scheduler = new SchedulerRandom();
            var store = new MockStore();
            var handlerStore = new HandlerStore(store);
            var runner = new MockRunner();
            var log = utils.makeLogger('module-name');

            new Queue('sysid', journal, scheduler, store, handlerStore, runner, log);
            t.throws(function() { new Queue('sysid', {}, scheduler, store, handlerStore, runner, log) }, /not a Journal/);
            t.throws(function() { new Queue('sysid', journal, {}, store, handlerStore, runner, log) }, /not a Scheduler/);
            t.throws(function() { new Queue('sysid', journal, scheduler, {}, handlerStore, runner, log) }, /not a job Store/);
            t.throws(function() { new Queue('sysid', journal, scheduler, store, {}, runner, log) }, /not a HandlerStore/);
            t.throws(function() { new Queue('sysid', journal, scheduler, store, handlerStore, {}, log) }, /not a Runner/);
            t.throws(function() { new Queue('sysid', journal, scheduler, store, handlerStore, runner, {}) }, /not a log/);

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

        'returns and logs journal write errors': function(t) {
            t.stub(this.uut.journal, 'write').yields('mock journal error');
            var spy = t.spy(this.uut.log, 'error');
            this.uut.addJobs('type1', 'line1\nline2\n', function(err, ret) {
                t.equal(err, 'mock journal error');
                t.ok(spy.called);
                t.contains(spy.args[0][0], 'addJobs error:');
                t.contains(spy.args[0][0], 'mock journal error');
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
            this.uut.run({ timeLimitMs: 15 }, function(err) {
                t.ifError(err);
                t.ok(spyRenewLocks.called);
                t.ok(spyExpireLocks.called);
                t.ok(spyExpireJobs.called);
                // NOTE: this assertion can fail on slower computers:
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

    'cron steps': {
        '_renewLocks': {
            'renews all running jobs': function(t) {
                var uut = this.uut;
                uut.configure({ locks: { lockExpireMs: 123456 } });
                var spyStats = t.spy(uut, 'emitStats');
                var spyRenew = t.spy(uut.store, 'renewLocks');
                t.stub(uut.runner, 'getRunningJobIds').yields(null, ['1', '3', '2']);
                uut._renewLocks(function(err) {
                    t.ifError(err);
                    t.ok(spyStats.called);
                    t.equal(spyStats.args[0][0], 'renewLocks');
                    t.deepEqual(spyStats.args[0][1], ['1', '3', '2']);
                    t.ok(spyRenew.called);
                    t.deepEqual(spyRenew.args[0].slice(0, -1), [['1', '3', '2'], uut.sysid, 123456]);
                    t.done();
                })
            },

            'returns runner errors': function(t) {
                t.stub(this.uut.runner, 'getRunningJobIds').yields('mock runner error');
                this.uut._renewLocks(function(err) {
                    t.equal(err, 'mock runner error');
                    t.done();
                })
            },

            'returns store errors': function(t) {
                t.stub(this.uut.runner, 'getRunningJobIds').yields(null, ['1']);
                t.stub(this.uut.store, 'renewLocks').yields('mock store error');
                this.uut._renewLocks(function(err) {
                    t.equal(err, 'mock store error');
                    t.done();
                })
            },
        },

        '_expireLocks': {
            'calls into store': function(t) {
                var spy = t.spy(this.uut.store, 'expireLocks');
                this.uut._expireLocks(function(err) {
                    t.ifError(err);
                    t.ok(spy.called);
                    t.done();
                })
            },

            'returns store errors': function(t) {
                t.stub(this.uut.store, 'expireLocks').yields('mock store error');
                this.uut._expireLocks(function(err) {
                    t.equal(err, 'mock store error');
                    t.done();
                })
            },
        },

        '_expireJobs': {
            'expires done jobs and unrun jobs': function(t) {
                this.uut.configure({ locks: { doneJobExpireMs: 12345, unrunJobExpireMs: 23456 } });
                var spy = t.spy(this.uut.store, 'expireJobs');
                this.uut._expireJobs(function(err) {
                    t.ifError(err);
                    t.equal(spy.callCount, 2);
                    t.deepEqual(spy.args[0].slice(0, -2), [null, Store.LOCK_DONE, 12345]);
                    t.ok(spy.args[0][3] > 100);
                    t.deepEqual(spy.args[1].slice(0, -2), [null, Store.LOCK_NONE, 23456]);
                    t.ok(spy.args[0][3] > 100);
                    t.done();
                })
            },

            'returns store errors': function(t) {
                var uut = this.uut;
                utils.iterateSteps([
                    function(next) {
                        var stub = t.stub(uut.store, 'expireJobs')
                          .yields('mock store error');
                        uut._expireJobs(function(err) {
                            t.equal(err, 'mock store error');
                            stub.restore();
                            next();
                        })
                    },
                    function(next) {
                        var stub = t.stub(uut.store, 'expireJobs')
                          .onCall(0).yields()
                          .onCall(1).yields('mock store error');
                        uut._expireJobs(function(err) {
                            t.equal(err, 'mock store error');
                            stub.restore();
                            next();
                        })
                    },
                ], t.done);
            },
        },
    },

    'handleDoneJobs': {
        beforeEach: function(done) {
            function makeId(i) { return utils.encode64(Date.now()) + '-mock-' + i }
            this.makeId = makeId;
            this.uut.runner.stoppedJobs = [
                { id: makeId('10'), type: 'type1', exitcode: 100, code: 'retry' },
                { id: makeId('11'), type: 'type1', exitcode: 200, code: 'ok' },
                { id: makeId('20'), type: 'type2', exitcode: 200, code: 'ok' },
                { id: makeId('21'), type: 'type2', exitcode: 200, code: 'ok' },
                { id: makeId('40'), type: 'type4', exitcode: 400, code: 'failed' },
                { id: makeId('50'), type: 'type5', exitcode: 500, code: 'error' },
                { id: makeId('51'), type: 'type5', exitcode: 501, code: 'error' },
            ];
            done();
        },

        'notifies scheduler of stopped jobs': function(t) {
            var spy = t.spy(this.uut.scheduler, 'jobsStopped');
            this.uut.handleDoneJobs(function(err) {
                t.equal(spy.callCount, 4);
                t.deepEqual(spy.args[0], ['type1', 2]);
                t.deepEqual(spy.args[1], ['type2', 2]);
                t.deepEqual(spy.args[2], ['type4', 1]);
                t.deepEqual(spy.args[3], ['type5', 2]);
                t.done();
            });
        },

        'retries errors and retry requests, and archives finished jobs': function(t) {
            this.uut.runner.stoppedJobs = [
                { id: this.makeId('10'), type: 'type1', exitcode: 100, code: 'retry' },
                { id: this.makeId('11'), type: 'type1', exitcode: 200, code: 'ok' },
                { id: this.makeId('12'), type: 'type1', exitcode: 400, code: 'failed' },
                { id: this.makeId('13'), type: 'type1', exitcode: 500, code: 'error' },
            ];
            var jobIds = this.uut.runner.stoppedJobs.map(function(job) { return job.id });
            var spy = t.spy(this.uut.store, 'releaseJobs');
            var spyStats = t.spy(this.uut, 'emitStats');
            this.uut.handleDoneJobs(function(err) {
                t.equal(spy.callCount, 2);
                t.deepEqual(spy.args[0][0], [jobIds[0], jobIds[3]]); // retry
                t.deepEqual(spy.args[1][0], [jobIds[1], jobIds[2]]); // archive
                t.deepEqual(spyStats.args[0], ['retryJobs', [jobIds[0], jobIds[3]]]);
                t.deepEqual(spyStats.args[1], ['archiveJobs', [jobIds[1], jobIds[2]]]);
                t.done();
            })
        },

        'abandons jobs that timed out': function(t) {
            t.stubOnce(Date, 'now').returns(1);
            var expiredId = this.makeId('1');
            this.uut.runner.stoppedJobs = [
               { id: expiredId + '0', type: 'type1', exitcode: 100, code: 'retry' },
               { id: expiredId + '1', type: 'type1', exitcode: 100, code: 'retry' },
            ];
            var spy = t.spy(this.uut, 'emitStats'); 
            this.uut.handleDoneJobs(function(err) {
                t.equal(spy.callCount, 1);
                t.equal(spy.args[0][0], 'abandonJobs');
                t.deepEqual(spy.args[0][1], [expiredId + '0', expiredId + '1']);
                t.done();
            })
        },

        'errors': {
            'returns retry store errors': function(t) {
// FIXME:
t.skip();
            },
            'returns archive store errors': function(t) {
// FIXME:
t.skip();
            },
        },
    },

    'runNewJobs': {
        'does nothing if no waiting jobs': function(t) {
            var spy = t.spy(this.uut.store, 'getJobs');
            t.stub(this.uut.store, 'getWaitingJobcounts').yields(null, {});
            this.uut.runNewJobs(function(err) {
                t.ifError(err);
                t.ok(!spy.called);
                t.done();
            })
        },

        'selects a waiting jobtype to run and runs the jobs': function(t) {
            var spySelect = t.spy(this.uut.scheduler, 'selectJobtypeToRun');
            t.stub(this.uut.store, 'getWaitingJobcounts').yields(null, { type1: 1, type2: 1 });
            var jobs = [];
            t.stub(this.uut.store, 'getJobs').yields(null, jobs);
            t.stub(this.uut.handlerStore, 'getHandler').yields(null, {});
            var spyRun = t.stub(this.uut.runner, 'runJobs');
            this.uut.runNewJobs(function(err) {
                t.ifError(err);
                t.ok(spySelect.called);
                t.done();
            })
        },

        'looks up the jobtype handler': function(t) {
// FIXME:
t.skip();
        },

        'runs the new jobs': function(t) {
            var jobs = [{}];
            t.stub(this.uut.store, 'getWaitingJobcounts').yields(null, { type1: 1, type2: 1 });
            t.stub(this.uut.store, 'getJobs').yields(null, jobs);
            t.stub(this.uut.handlerStore, 'getHandler').yields(null, {});
            var spyRun = t.stub(this.uut.runner, 'runJobs');
            this.uut.runNewJobs(function(err) {
                t.ifError(err);
                t.ok(spyRun.called);
                t.contains(['type1', 'type2'], spyRun.args[0][0]);
                t.equal(spyRun.args[0][1], jobs);
                t.deepEqual(spyRun.args[0][1], jobs);
                t.done();
            })
        },
    },
}
