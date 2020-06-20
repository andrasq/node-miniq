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
var StoreArray = require('./StoreArray');
var SchedulerRandom = require('./SchedulerRandom');
var Runner = require('./Runner');

module.exports = makeApp({}, function(err, info) {
    if (err) throw err;
    console.log("listening on", err, info);
})

function makeApp( config, callback) {
    var service, sysid, queue, log, httpServer;

    // create the app.  The callback is run once the app is listening.
    var router = new RestRouter();
    var app = rest.createHandler({ router: router });

    app.cron = new utils.Cron();
    setTimeout(function() {
        app.cron.run(utils.getNewerTimestamp(0), function(err) {});
    }, 1000).unref();

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
            app.log = utils.makeLog('q-' + app.sysid);
            app.cron.schedule('30s', function() {
                service.renewSysid(app.sysid, function(err) {
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
                new StoreArray(),
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
    return callback(null, new Service());
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

    this.getSysid = function(callback) {
return callback(null, utils.pad(String(Math.random() * 0x1000 >>> 0), 4));

// FIXME: ensure that the chosen id is unique, at least per store
// maybe: store as special 'queue.sysid' in mysql jobs store, insert new id in pre-locked state until no duplicate key error
        var sysid, tryCount = 0;
        utils.repeatUntil(function(done) {
            sysid = utils.pad(String(Math.random() * 0x1000 >>> 0), 4);
            store.saveJobs([{ id: sysid, type: 'queue.sysid', dt: new Date(utils.getNewerTimestamp(600000)), lock: sysid }], function(err) {
                ++tryCount >= 10 ? done(err, true) : done(null, !err);
            })
        }, function(err) { callback(err, sysid) });
    }
    this.renewSysid = function(sysid, callback) {
        // this.store.renewJobs([sysid], sysid, callback);
    }
}
