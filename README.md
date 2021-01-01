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
