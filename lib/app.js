/*
 * Main entry point.
 *
 * This file creates the queue app that listens for and processes requests.
 */

'use strict';

var utils = require('./utils');

var Queue = require('./Queue');
var JournalArray = require('./JournalArray');
var StoreArray = require('./StoreArray');
var SchedulerRandom = require('./SchedulerRandom');
var Runner = require('./Runner');

var sysid = 'sysid';
var queue = new Queue(
    sysid,
    new JournalArray(),
    new SchedulerRandom(),
    new StoreArray(),
    new Runner(),
    utils.makeLog('q-' + sysid)
);
