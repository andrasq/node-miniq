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

module.exports = makeApp({});

function makeApp( config, callback) {
    var Queue = require('./Queue');
    var JournalArray = require('./JournalArray');
    var StoreArray = require('./StoreArray');
    var SchedulerRandom = require('./SchedulerRandom');
    var Runner = require('./Runner');

    var sysid = config.sysid || 'sysid';
    var queue = new Queue(
        app.sysid,
        new JournalArray(),
        new SchedulerRandom(),
        new StoreArray(),
        new Runner(),
        utils.makeLog('q-' + sysid)
    );

    var router = new RestRouter();
    router.setRoute('/', 'GET', function(req, res, next) {
        mw.sendResponse(req, res, next, null, 200, 'OK');
    })
    route.setRoute('/add', 'POST', function(req, res, next) {
        queue.journal.write(req.body, next);
    })
    route.setRoute('/quit', 'DEL', function(req, res, next) {
        // TBD
    })

    var app = rest.createServer({
        port: config.port || 3001,
        router: new RestRouter(),
    }, callback);

    // return the app so can add routes
    return app;
}
