/*
 * Main entry point.
 *
 * This file creates the queue app that listens for and processes requests.
 */

'use strict';

var util = require('util');
var cluster = require('cluster');
var events = require('events');
var utils = require('./utils');

var config = utils.getConfig({ env: process.env.NODE_ENV || 'development', dir: process.cwd() + '/config' });

if (cluster.isMaster) {
// console.log("AR: using config", config);

    if (!config.server) throw new Error('server not configured');
    if (!config.server.port) throw new Error('server.port not configured');

    var workerCount = config.server.workerCount || 1;
    for (var i = 0; i < workerCount; i++) cluster.fork();

    return;
}

var microRest = require('microrest');
var microMw = require('microrest/mw');
var MicroRouter = require('microrest/router');

var Queue = require('./Queue');
var JournalArray = require('./JournalArray');
var Store = require('./Store');
var MockStore = require('./MockStore');
var SysidStore = require('./SysidStore');
var HandlerStore = require('./HandlerStore');
var SchedulerRandom = require('./SchedulerRandom');
var Runner = require('./Runner');

var app = module.exports = makeApp(config, function(err, info) {
    if (err) throw err;
    app.log.info(util.format("Daemon '%s' started, pid %d, listening on port %d", app.sysid, process.pid, info.port));
})

/*
 * Create a queue daemon, attach to the queue service to obtain an id, connect to the store,
 * and run jobs.
 */
function makeApp( config, callback) {
    var service, sysid, queue, log, httpServer;

    // create the app.  The callback is run once the app is listening.
    var router = new MicroRouter();
    var emitter = new events.EventEmitter();
    var app = microRest({ router: router, emitter: emitter });

    app.cron = new utils.Cron();
    app.cronTimer = utils.setInterval(function cronTimer() {
        app.cron.run(Date.now(), function() {});
    }, 500).unref();

    utils.iterateSteps([
        function(next) {
            findService(config, next);
        },
        function(next, svc) {
            app.service = service = svc;
            service.getSysid(next);
        },
        function(next, id) {
            app.sysid = id;
            app.idSysid = '-' + id + '-';
            app.log = utils.makeLogger(app.sysid);
            app.log.debug(util.format("app pid=%d obtained sysid '%s'", process.pid, app.sysid));
            app.service.setLog(app.log);
console.log("AR: id format", utils.getId(app.idSysid));
// FIXME: 30s
            app.cron.schedule('2s', function() {
                service.renewSysid(app.sysid, function(err) {
                    if (err) app.log.error('unable to refresh sysid: ' + err.message);
                })
            })
            next();
        },
        function(next) {
// FIXME: obtain store from service
            var jobStore = new MockStore();
            var handlerStore = new HandlerStore(new MockStore());
            next(null, jobStore, handlerStore);
        },
        function(next, jobStore, handlerStore) {
            app.queue = new Queue(
                app.sysid,
                new JournalArray(),
                new SchedulerRandom(),
                jobStore,
                handlerStore,
                service,
                new Runner(),
                app.log
            );
            next();
        },
        function(next) {
            mountRoutes(router, app);
            next();
        },
    ], function(err) {
        if (err && callback) callback(err);
        // create the http server, start listening to requests
        emitter.on('error', function(err) {
            app.log.info({ code: 'EHTTP', error: err });
        })
        app.httpServer = app.listen(config.server.port, function(err, info) {
            if (err) return callback(err);
            app.httpServer.on('close', function() { app.log.info('Daemon \'' + app.sysid + '\' done.') });
            callback(err, info);
        })
    });

    // return app now, callback is invoked once app is listening
    return app;
}

// contact the existing service, or create
function findService( config, callback ) {
// FIXME: contact the service at the configured port, or create one
    var log = utils.makeLogger('Service');
    var store = new MockStore();
    var service = new Service(log, store, new SysidStore(log, store), new HandlerStore(store));
    return callback(null, service);
}

// mount the REST routes
function mountRoutes( router, app ) {
    router.setRoute('pre', function(req, res, next) {
        req._q = { startTime: Date.now() };
        next();
    })
    router.setRoute('pre', function auth(req, res, next) {
        // validate req.params.client
        // validate req.params.auth
        next();
    })
    router.setRoute('post', function(req, res, next) {
// FIXME: errors from here are not output (should go to emitter or write to console)
        var duration = Date.now() - req._q.startTime;
        app.log.info({ code: res.statusCode, url: req.url, ms: duration });
        next();
    })

    router.setRoute('/', 'GET', function(req, res, next) {
        res.end('OK\n');
        // 34 us per call
        next();
    })
    router.setRoute('/quit', 'GET', function(req, res, next) {
        app.log.info('told to quit');
        res.end('Quit.\n');
        app.httpServer.close();
        process.send('disconnect');
        setTimeout(process.exit, 20);
        next();
    })

    router.setRoute('/add', 'POST', function(req, res, next) {
        // validate req.params.jobtype
        var jobtype = req.params.client + '-' + req.params.jobtype;
        app.queue.addJobs(jobtype, req.body, function(err, count) {
            res.end(microMw.sendResponse(req, res, next, err, 200, { ok: !err, count: count }));
        })
        next();
    })

    return router;
}

function Service( log, store, sysidStore, handlerStore ) {
    this.log = log;
    this.store = store;
    this.sysidStore = sysidStore;
    this.handlerStore = handlerStore
    this.log = null;
    this.sysidExpireMs = 10 * 60000;    // 10 minutes

    this.setLog = function(log) {
        this.log = log;
    }
    this.getSysid = function(callback) {
        return this.sysidStore.getSysid(callback);
    }
    this.renewSysid = function(sysid, callback) {
        return this.sysidStore.renewSysid(sysid, callback);
    }
    this.releaseSysid = function(sysid, callback) {
        return this.sysidStore.releaseSysid(sysid, callback);
    }

    this.setHandler = function setHandler( id, type, body, callback ) {
// FIXME: the type must have had the client-id prepended already for multi-tenant support
// TODO: pre-vet the max body length in the http call
        var expireDt = new Date(Date.now());
        expireDt.setFullYear(expireDt.getFullYear() + 1000);
        this.store.addJobs(
            [{ id: id, type: type, dt: expireDt, lock: Store.LOCK_HANDLER, data: body }], callback);
    }
    this.getHandler = function getHandler( type, callback ) {
// FIXME: only fetch the most recent version, can be inefficient to retrieve all
// FIXME: periodically purge the old versions to leave only the most recent ?10 ?20 ?100
        this.store.getLockedJobs(type, Store.LOCK_HANDLER, 999999, function(err, jobs) {
            if (err || !jobs.length) return callback(err || new Error('not found'));
            callback(null, jobs[jobs.length - 1].data);
        })
    }
    this.deleteHandler = function deleteHandler( type, callback ) {
        var expireBefore = new Date(Date.now() + 2 * 1100 * 365 * 24 * 3600000);
        this.store.expireJobs(type, Store.LOCK_HANDLER, expireBefore, 999999, callback);
    }
}
