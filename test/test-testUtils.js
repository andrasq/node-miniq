'use strict';

var util = require('util');
var utils = require('../lib/testUtils');

module.exports = {
    setUp: function(done) {
        this.Foo = function Foo() {};
        this.Foo.prototype.m1 = function() {};
        this.Foo.prototype.p1 = 1;
        this.Foo.prototype.p2 = 'two';

        this.Bar = function Bar() {};
        util.inherits(this.Bar, this.Foo);
        done();
    },

    'implements': {
        'catches non-derived class': function(t) {
            var Foo = this.Foo, Bar = this.Bar;
            t.throws(function(){ utils.implements(new Foo(), Bar) }, /not instanceof/);
            t.done();
        },

        'catches unimplemented abstract method': function(t) {
            var Foo = this.Foo, bar = new this.Bar();
            t.throws(function(){ utils.implements(bar, Foo) }, /method same/);
            t.done();
        },

        'catches different property types': function(t) {
            var Foo = this.Foo, bar = new this.Bar();
            bar.m1 = 'not function';
            t.throws(function(){ utils.implements(bar, Foo) }, /types differ/);
            var foo = new Foo();
            foo.m1 = function() {};
            foo.p2 = {x: 'not string'};
            t.throws(function(){ utils.implements(foo, Foo) }, /types differ/);
            t.done();
        },

        'catches different function signatures': function(t) {
            var Foo = this.Foo, bar = new this.Bar();
            bar.m1 = function(a, b) {};
            t.throws(function(){ utils.implements(bar, Foo) }, /different arguments/);
            t.done();
        },
    },
}
