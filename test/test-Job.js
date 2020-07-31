'use strict';

var utils = require('../lib/utils');
var Job = require('../lib/Job');

module.exports = {
    'constructor': {
        'initialized to passed params': function(t) {
            var job = new Job('id12', 'type34', new Date(56), 'data78');
            t.equal(+job.dt, 56);
            t.contains(job, {id: 'id12', type: 'type34', data: 'data78'});
            t.done();
        },

        'initializes to defaults': function(t) {
            var job = new Job();
            t.equal(+job.dt, 0);
            t.contains(job, {id: '', type: '', data: null});
            t.done();
        },
    },

    'linesToJobs': {
        'returns array of jobs': function(t) {
            var job1 = ['12-sysid-023', 'type1', 'data1'];
            var job2 = ['15-sysid-025', 'type2', 'data2'];
            var errs = [];
            var lines = [job1.join('|'), 'bad-format', job2.join('|'), ''];
            var jobs = Job.linesToJobs(lines, {log: {warn: function(x) { errs.push(x) } } });

            t.equal(jobs.length, 2);
            t.equal(errs.length, 2);
            t.equal(errs[0].line, 'bad-format');
            t.equal(errs[1].line, '');

            t.equal(jobs[0].id, '12-sysid-023');
            t.equal(jobs[0].dt.getTime(), 66);
            t.equal(jobs[0].type, 'type1');
            t.equal(jobs[0].data, 'data1');

            t.equal(jobs[1].id, '15-sysid-025');
            t.equal(jobs[1].dt.getTime(), 69);
            t.equal(jobs[1].type, 'type2');
            t.equal(jobs[1].data, 'data2');

            t.done();
        },

        'does not need options': function(t) {
            var jobs = Job.linesToJobs(['id|type|data', 'badline']);
            t.equal(jobs.length, 1);
            t.done();
        },
    },

    'getCreateDt': {
        'parses the id into a Date': function(t) {
            var job = { id: '123-sysid-001' };
            t.ok(Job.getCreateDt(job) instanceof Date);
            t.equal(+Job.getCreateDt(job), +new Date(4096 + 128 + 3));
            t.done();
        },
    },

    'speed': {
        'should create jobs fast': function(t) {
            var lines = [
                '0NBtO6ne-mque-8x0|client123-jobtype345|{"payload":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}',
                '0NBtO6ne-mque-8x1|client123-jobtype345|{"payload":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}',
                '0NBtO6ne-mque-8x2|client123-jobtype345|{"payload":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}',
                '0NBtO6ne-mque-8x3|client123-jobtype345|{"payload":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}',
                '0NBtO6ne-mque-8x4|client123-jobtype345|{"payload":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}',
            ];
            var t1 = Date.now();
            var jobs;
            for (var i = 0; i < 20000; i++) jobs = Job.linesToJobs(lines);
            var t2 = Date.now();
            console.log("AR: converted 100k lines to Jobs in %d ms", t2 - t1);  // 48 ms for 100k
            t.done();
        },
    },
}
