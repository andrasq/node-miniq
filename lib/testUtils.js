/*
 * test utils
 */

'use strict';

module.exports = {
    implemented: implemented,
}

// verify that the subclass instance implemented all of the methods of the base class
function implemented( instance, base, options ) {
    options = options || {};

    var constructor = options.constructor || base.constructor;
    if (constructor && !(instance instanceof base)) throw new Error('not instanceof ' + base.name);

    var methods = options.methods || base.prototype;
    for (var m in methods) {
        if (typeof methods[m] !== typeof instance[m]) throw new Error(m + ': types differ');
        if (typeof methods[m] === 'function') {
            if (methods[m].length !== instance[m].length) throw new Error(m + ': take different arguments');
            // pure abstract methods must all be overridden
            if (methods[m] === instance[m]) throw new Error('instance method same as Base.abstract');
        }
    }

    return true;
}
