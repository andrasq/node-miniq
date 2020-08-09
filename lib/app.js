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
    var sysid, queue, log, httpServer;

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
            // create a local queueing service (TODO: or join the existing if already running)
            findService(config, next);
        },
        function(next, service) {
            app.service = service;
            app.sysidStore = app.service.sysidStore;
            app.sysidStore.getSysid(next);
        },
        function(next, id) {
            app.sysid = id;
            app.idSysid = '-' + id + '-';
            app.log = utils.makeLogger(app.sysid);
            app.log.debug(util.format("app pid=%d obtained sysid '%s'", process.pid, app.sysid));
console.log("AR: id format", utils.getId(app.idSysid));
// FIXME: 30s
            app.cron.schedule('2s', function() {
                app.sysidStore.renewSysid(app.sysid, function(err) {
                    if (err) app.log.error('unable to refresh sysid: ' + err.message);
                })
            })
            next();
        },
        function(next) {
            app.queue = new Queue(
                app.sysid,
                new JournalArray(),
                new SchedulerRandom(),
                app.service.jobStore,
                app.service.handlerStore,
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

// create a queue service (TODO: or contact the existing service, if already running)
// returns the service sysidStore, handlerStore and jobStore
function findService( config, callback ) {
    var log = utils.makeLogger('Service');
    var store = new MockStore();
    return callback(null, {
        sysidStore: new SysidStore(log, store),
        handlerStore: new HandlerStore(store),
        jobStore: store,
    })
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
