/*
 * Stored jobs:
 *    id        - unique id assigned when job line was received.  Not null.
 *                Job ids embed a timestamp; this timestamp is the job creation time (enqueue time).
 *    type      - job type, embeds client-id and identifies the procedure (proc) that runs the job.  Not null.
 *    dt        - datetime millisecond timestamp.  For unclaimed jobs, when they are eligible to run.  Not null.
 *                For claimed (locked) jobs, when the lock times out.  A stale lock (that has timed out)
 *                will be broken (lock set to '') to have the job run again.  Job execution is guaranteed at least once.
 *    lock      - name of lock (or entity that claimed this job), else '' empty string if unclaimed.  Not null.
 *                A claim is an advisory lock, it informs the other queue daemons that this job is being run.
 *                Locks last a limited duration, with stale locks broken by the other daemons reading this same store.
 *                The special lock __done owns all done jobs with a lock that expires 1000 years in the future.
 *                The dt of a done job less 1000 years is its completion time.
 *    data      - payload to process or null.  The jobtype proc will be called with this data when the job is run.
 *                If the payload is large (more than 255 bytes), it is stored in a job_data table.
 *                If null, the job_data table has a larger payload.  If '' there is no call data for the job.
 *    create_dt
 *    done_dt
 *
 * INDEX (id)               - needed to gc abandoned data in job_data (or discard jobs/data after 7 days, no questions)
 * INDEX (lock, dt)         - tracks locked jobs.  Expirations can be found by searching all locks held by all distinct locks
 * INDEX (type, lock, dt)   - needed for job selection
 */

'use strict';

module.exports = Job;

var utils = require('./utils');

var _zeroDate = new Date(0);
function Job( id, type, dt, data ) {
    this.id = id || '';
    this.type = type || '';
    this.dt = dt || _zeroDate;
    this.lock = '';
    this.data = data !== undefined ? data : null;
}

/*
 * Convert job payloads to journal lines.
 */
Job.dataToLines = function dataToLines( sysid, jobtype, payloads ) {
    var ids = utils.getIds(sysid, payloads.length);
    return payloads.map(function(data, i) {
        return ids[i] + '|' + jobtype + '|' + data;
    })
}

var _journalLinePattern = /^\s*([^|]+)\|([^|]+)\|(.*)$/;
Job.fromJournalLine = function fromJournalLine( line ) {
    var match = line.match(_journalLinePattern);
    if (!match) return null;
    var ms = utils.decode64(match[1]);
    return new Job(match[1], match[2], new Date(ms), match[3]);
}

/*
 * Convert journal lines to jobs.
 */
Job.linesToJobs = function linesToJobs( journalLines, options ) {
    options = options || {};
    var jobs = [], log = options.log || { warn: function() {} };

    for (var i = 0; i < journalLines.length; i++) {
        var job = Job.fromJournalLine(journalLines[i]);
        if (!job) log.warn({ error: 'linesToJobs: not a job', line: journalLines[i] });
        else jobs.push(job);
    }
    return jobs;
}
