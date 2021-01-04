Slim Serverless Computing Job Queue
===================================
[![Build Status](https://travis-ci.org/andrasq/node-miniq.svg?branch=master)](https://travis-ci.org/andrasq/node-miniq)
[![Coverage Status](https://coveralls.io/repos/github/andrasq/node-miniq/badge.svg?branch=master)](https://coveralls.io/github/andrasq/node-miniq?branch=master)

_WORK IN PROGRESS_

See also Quick_Queue in github.com://andrasq/quicklib/


Structure
---------

### Job

    { id: string,
      type: string,
      dt: Date,
      lock: string,
      data: string|binary|null }

- `id`   globally unique job id, assigned when job is added.  Encodes the
         ingestion time and daemon that received the job.
- `type` job type identifies the procedure that will run the job
- `dt`   timestamp, used for scheduling
- `lock` owner, used for scheduling
- `data` job payload, a newline terminated byte string

### Date and Lock

The job timestamp `dt` and and owner `lock` encode the job disposition:  deferred, ready,
running, abandoned, completed.

| *dt*     | *lock*     | *state* |
| > now    | `''`       | deferred: job not yet eligible to be run |
| &lt; now | `''`       | ready: job waiting to be run |
| > now    | _sysid_    | running: job is being run by daemon _sysid_ |
| &lt; now | _sysid_    | abandoned: daemon _sysid_ has stalled or crashed |
| > 3000   | `'__done'` | done: job completed at `dt - 1000 * YEARS`, waiting to be purged |

### Journal

Jobs are added by `type` and `payload`, get tagged with a system-wide unique `id` and are
persisted to a fast local journal as `|` bar separated, newline terminated `id|type|payload\n`
strings.  The journal is consumed and saved to the job store asynchronously.  Each job is
guaranteed to be saved at least once (in case of error it's possible that a job may get
re-saved.  The store may, but is not required to, de-dup by id.)

### Store

The store holds jobs to be run.  Running jobs are claimed (locked) by a damon.  Locks are kept
refreshed until they complete.  An expired lock is a sign that the daemon stalled or crashed.
The store also provides information about the job types waiting to be run, to assist scheduling.
Jobs are added to and removed from the store as objects, no longer Journal strings.

### Runner

The runner instantiates the procedures to process the job types, and feeds the procedure the job
payloads.  Jobs that crash are retried, otherwise the exit status is just logged.  Each job is
guaranteed to be run at least once (possibly more than once if the job or the runner crashes).
Results are not propagated because jobs run asynchronously and there is no agent to deliver
results to.  Jobs can submit other jobs, though, and can thus deliver results themselves.


API
---

The app has just a few http endpoints:

* `GET /start` - start or resume the queue
* `GET /stop` - suspend the queue
* `GET /quit` - close and exit the queue
* `POST /add?jobtype=&client=` - add jobs to the queue.
  Each newline-terminated line in the post body will be a payload passed to a job of type `jobtype`.


Configuration
-------------

Edit `./config/defaults.js` to contain the shared defaults, with production
settings merged in from `./config/${NODE_ENV}.js`. A local development environment can
change select configs with `./config/local.js`.  The default NODE_ENV is `development`.


Related Work
------------
