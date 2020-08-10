Slim Serverless Computing Job Queue
===================================
[![Build Status](https://travis-ci.org/andrasq/node-miniq.svg?branch=master)](https://travis-ci.org/andrasq/node-miniq)
[![Coverage Status](https://coveralls.io/repos/github/andrasq/node-miniq/badge.svg?branch=master)](https://coveralls.io/github/andrasq/node-miniq?branch=master)

_WORK IN PROGRESS_

See also Quick_Queue in github.com://andrasq/quicklib/


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
