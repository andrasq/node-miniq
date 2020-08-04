/*
 * test utils
 */

'use strict';

module.exports = {
    implements: implements_,
}

// verify that the subclass instance implemented all of the methods of the base class
function implements_( instance, base, options ) {
    options = options || {};

    var constructor = base.constructor;
    if (constructor && !(instance instanceof base)) throw new Error('not instanceof ' + base.name);

    var methods = options.methods || base.prototype;
    for (var m in methods) {
        if (typeof methods[m] !== typeof instance[m]) throw new Error(m + ': types differ');
        if (typeof methods[m] === 'function') {
            // if (instance.constructor.length !== base.length) throw new Error(
            //     instance.constructor.name + ': constructor takes different arguments than ' + base.name);
            if (methods[m].length !== instance[m].length) throw new Error(m + ': take different arguments');
            if (instance[m].name !== m) throw new Error(m + ': different name ' + instance[m].name);
            // pure abstract methods must all be overridden
            if (methods[m].__abstract__ === true && methods[m] === instance[m]) {
                throw new Error(m + ': instance method same as Base.abstract');
            }
        }
    }

    return true;
}
