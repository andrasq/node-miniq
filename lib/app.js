/*
 * Main entry point.
 *
 * This file creates the queue app that listens for and processes requests.
 */

'use strict';

var utils = require('./utils');

module.exports = makeApp({});

function makeApp( config ) {
    var Queue = require('./Queue');
    var JournalArray = require('./JournalArray');
    var StoreArray = require('./StoreArray');
    var SchedulerRandom = require('./SchedulerRandom');
    var Runner = require('./Runner');

    var app = {};
    app.sysid = 'sysid';
    app.queue = new Queue(
        app.sysid,
        new JournalArray(),
        new SchedulerRandom(),
        new StoreArray(),
        new Runner(),
        utils.makeLog('q-' + app.sysid)
    );

    return app;
}
