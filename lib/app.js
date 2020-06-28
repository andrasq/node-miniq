/*
 * Main entry point.
 *
 * This file creates the queue app that listens for and processes requests.
 */

'use strict';

var utils = require('./utils');
var rest = require('microrest');
var RestRouter = require('microrest/router');
var restMw = require('microrest/mw');

var Queue = require('./Queue');
var JournalArray = require('./JournalArray');
var MockStore = require('./MockStore');
var SchedulerRandom = require('./SchedulerRandom');
var Runner = require('./Runner');

module.exports = makeApp({}, function(err, info) {
    if (err) throw err;
    console.log("listening on", err, info);
})

/*
 * Create a queue daemon, attach to the queue service to obtain an id, connect to the store,
 * and run jobs.
 */
function makeApp( config, callback) {
    var service, sysid, queue, log, httpServer;

    // create the app.  The callback is run once the app is listening.
    var router = new RestRouter();
    var app = rest.createHandler({ router: router });

    app.cron = new utils.Cron();
    app.cronTimer = setInterval(function cronTimer() {
        app.cron.run(utils.getNewerTimestamp(0), function() {});
    }, 500, 500);
    app.cronTimer.unref && app.cronTimer.unref();

    utils.iterateSteps([
        function(next) {
            findService(config, next);
        },
        function(next, svc) {
            service = svc;
            service.getSysid(next);
        },
        function(next, id) {
            app.sysid = id;
            app.log = utils.makeLog(app.sysid);
// FIXME: 30s
            app.cron.schedule('5s', function() {
                service.renewSysid(app.sysid, function(err) {
                    if (err) app.log.error('unable to refresh sysid: ' + err.message);
                })
            })
            next();
        },
// FIXME: obtain store from service
        function(next) {
            app.queue = new Queue(
                app.sysid,
                new JournalArray(),
                new SchedulerRandom(),
                new MockStore(),
                new Runner(),
                app.log
            );
            next();
        },
        function(next) {
            makeRoutes(router, app);
            next();
        },
    ], function(err) {
        if (err && callback) callback(err);
        // create the http server, start listening to requests
// FIXME: pick a different port for each daemon, or run in a cluster
        app.httpServer = app.listen(config.port || 3001, function(err, info) {
            if (err) return callback(err);
            app.log.info('Daemon ' + app.sysid + ' started, listening on ' + info.port);
            callback(err, info);
        })
    });

    // return app now, callback is invoked once app is listening
    return app;
}

// contact the existing service, or create
function findService( config, callback ) {
// FIXME: contact the service at the configured port, or create one
    return callback(null, new Service(new MockStore()));
}

// mount the REST routes
function makeRoutes( router, app ) {
    router.setRoute('/', 'GET', function(req, res, next) {
        restMw.sendResponse(req, res, next, null, 200, 'OK\n');
    })
    router.setRoute('/quit', 'GET', function(req, res, next) {
        app.log.info('Daemon ' + app.sysid + ' quit.');
        res.end('Done.\n');
        app.httpServer.close();
    })

    router.setRoute('/add', 'POST', function(req, res, next) {
        app.queue.addJobs(req.body, function(err, count) {
            res.end(restMw.sendResponse(req, res, next, err, 200, { ok: true, count: count }));
        })
    })

    return router;
}

function Service( store ) {
    this.store = store;
    this.sysidExpireMs = 20 * 60000;

    this.getSysid = function(callback) {
        // insert pre-locked job of type 'queue.sysid', trust addJobs to error out if id already present
        // CAUTION: this works only if the job store enforces unique ids.  See also ./SysidStore.js
        var sysid, self = this;
        utils.repeatUntil(function(done, tryCount) {
            if (tryCount > 20) return done(new Error('getSysid: too many tries'));
            sysid = utils.pad(utils.encode64(String(Math.random() * 0x1000000 >>> 0)), 4);
            var expireDt = new Date(utils.getNewerTimestamp(0) + self.sysidExpireMs);
            store.addJobs(
                [{ id: sysid, type: 'queue.sysid', dt: new Date(utils.getNewerTimestamp(600000)), lock: sysid }], done);
        }, function(err) { callback(err, sysid) });
    }
    this.renewSysid = function(sysid, callback) {
        this.store.renewLocks([sysid], sysid, this.sysidExpireMs, callback);
    }
    this.releaseSysid = function(sysid, callback) {
        this.store.releaseJobs([sysid], sysid, 'unget', callback);
    }
}
