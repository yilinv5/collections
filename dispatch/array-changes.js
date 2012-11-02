/*
    Based in part on observable arrays from Motorola Mobility’s Montage
    Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
    3-Clause BSD License
    https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
*/

/*
    This module is responsible for observing changes to owned properties of
    objects and changes to the content of arrays caused by method calls.
    The interface for observing array content changes establishes the methods
    necessary for any collection with observable content.
*/

require("../shim");
var List = require("../list");
var WeakMap = require("../weak-map");
var PropertyChanges = require("./property-changes");
var ContentChanges = require("./content-changes");
var MapChanges = require("./map-changes");

var array_splice = Array.prototype.splice;
var array_slice = Array.prototype.slice;
var array_reverse = Array.prototype.reverse;
var array_sort = Array.prototype.sort;

var anyPropertyChangeListeners = new WeakMap(); // {willChange, change}

// use different strategies for making arrays observable between Internet
// Explorer and other browsers.
var protoIsSupported = {}.__proto__ === Object.prototype;
var array_makeObservable;
if (protoIsSupported) {
    array_makeObservable = function () {
        this.__proto__ = ChangeDispatchArray;
    };
} else {
    array_makeObservable = function () {
        Object.defineProperties(this, observableArrayProperties);
    };
}
Array.prototype.makeObservable = array_makeObservable;

Object.addEach(Array.prototype, ContentChanges);
Object.addEach(Array.prototype, MapChanges);

Array.prototype.addEachContentChangeListener = function (listener, before) {
    var self = this;

    // initialize
    for (var i = 0; i < this.length; i++) {
        PropertyChanges.addPropertyChangeListener(this, i, listener, before);
    }

    // before content changes, add listeners for the new properties
    var beforeContentChangeListener = function (plus, minus, index) {
        var diff = plus.length - minus.length;
        if (diff > 0) {
            for (var i = self.length; i < self.length + diff; i++) {
                PropertyChanges.addPropertyChangeListener(self, i, listener, before);
            }
        }
    };
    self.addBeforeContentChangeListener(beforeContentChangeListener);

    // after content changes, remove listeners for those properties
    var contentChangeListener = function (plus, minus, index) {
        var diff = plus.length - minus.length;
        if (diff < 0) {
            for (var i = self.length; i < self.length - diff; i++) {
                PropertyChanges.removePropertyChangeListener(self, i, listener, before);
            }
        }
    };
    self.addContentChangeListener(contentChangeListener);

    // associate the given listener function with the produced
    // listener functions for change and willChange events so
    // they can be removed later
    anyPropertyChangeListeners.set(listener, {
        willChange: beforeContentChangeListener,
        change: contentChangeListener
    });

};

Array.prototype.removeEachContentChangeListener = function (listener, before) {

    // remove the listeners for each property change
    for (var i = 0; i < this.length; i++) {
        PropertyChanges.removePropertyChangeListener(this, i, listener, before);
    }

    // remove the manufactured listeners for content changes
    var listeners = anyPropertyChangeListeners.get(listener);
    this.removeBeforeContentChangeListener(listeners.willChange);
    this.removeContentChangeListener(listeners.change);

};

Array.prototype.addBeforeEachContentChangeListener = function (listener) {
    return this.addEachContentChangeListener(listener, true);
};

Array.prototype.removeBeforeEachContentChangeListener = function (listener) {
    return this.removeEachContentChangeListener(listener, true);
};

var observableArrayProperties = {

    isObservable: {
        value: true,
        writable: true,
        configurable: true
    },

    makeObservable: {
        value: Function.noop, // idempotent
        writable: true,
        configurable: true
    },

    reverse: {
        value: function reverse() {

            // dispatch before change events
            this.dispatchBeforeContentChange(this, this, 0);
            for (var i = 0; i < this.length; i++) {
                PropertyChanges.dispatchBeforePropertyChange(this, i, this[i]);
                this.dispatchBeforeMapChange(i, this[i]);
            }

            // actual work
            array_reverse.call(this);

            // dispatch after change events
            for (var i = 0; i < this.length; i++) {
                PropertyChanges.dispatchPropertyChange(this, i, this[i]);
                this.dispatchMapChange(i, this[i]);
            }
            this.dispatchContentChange(this, this, 0);

            return this;
        },
        writable: true,
        configurable: true
    },

    sort: {
        value: function sort() {

            // dispatch before change events
            this.dispatchBeforeContentChange(this, this, 0);
            for (var i = 0; i < this.length; i++) {
                PropertyChanges.dispatchBeforePropertyChange(this, i, this[i]);
                this.dispatchBeforeMapChange(i, this[i]);
            }

            // actual work
            array_sort.apply(this, arguments);

            // dispatch after change events
            for (var i = 0; i < this.length; i++) {
                PropertyChanges.dispatchPropertyChange(this, i, this[i]);
                this.dispatchMapChange(i, this[i]);
            }
            this.dispatchContentChange(this, this, 0);

            return this;
        },
        writable: true,
        configurable: true
    },

    splice: {
        value: function splice(start, length) {
            var minus = array_slice.call(this, start, start + length);
            var plus = array_slice.call(arguments, 2);
            var diff = plus.length - minus.length;
            var oldLength = this.length;
            var newLength = this.length + diff;
            var longest = Math.max(oldLength, newLength);

            // dispatch before change events
            if (diff) {
                PropertyChanges.dispatchBeforePropertyChange(this, "length", this.length);
            }
            this.dispatchBeforeContentChange(plus, minus, start);
            if (diff === 0) { // substring replacement
                for (var i = start; i < start + plus.length; i++) {
                    PropertyChanges.dispatchBeforePropertyChange(this, i, this[i]);
                    this.dispatchBeforeMapChange(i, this[i]);
                }
            } else if (PropertyChanges.hasPropertyChangeDescriptor(this)) {
                // all subsequent values changed or shifted.
                // avoid (longest - start) long walks if there are no
                // registered descriptors.
                for (var i = start; i < longest; i++) {
                    PropertyChanges.dispatchBeforePropertyChange(this, i, this[i]);
                    this.dispatchBeforeMapChange(i, this[i]);
                }
            }

            // actual work
            var result = array_splice.apply(this, arguments);

            // dispatch after change events
            if (diff === 0) { // substring replacement
                for (var i = start; i < start + plus.length; i++) {
                    PropertyChanges.dispatchPropertyChange(this, i, this[i]);
                    this.dispatchMapChange(i, this[i]);
                }
            } else if (PropertyChanges.hasPropertyChangeDescriptor(this)) {
                // all subsequent values changed or shifted.
                // avoid (longest - start) long walks if there are no
                // registered descriptors.
                for (var i = start; i < longest; i++) {
                    PropertyChanges.dispatchPropertyChange(this, i, this[i]);
                    this.dispatchMapChange(i, this[i]);
                }
            }
            // in addEachContentChange, the content change event may remove
            // some of the above dispatched listeners, so contentChange must
            // occur after ownPropertyChanges
            this.dispatchContentChange(plus, minus, start);
            if (diff) {
                PropertyChanges.dispatchPropertyChange(this, "length", this.length);
            }

            return result;
        },
        writable: true,
        configurable: true
    },

    // splice is the array content change utility belt.  forward all other
    // content changes to splice so we only have to write observer code in one
    // place

    set: {
        value: function set(index, value) {
            this.splice(index, 1, value);
            return this;
        },
        writable: true,
        configurable: true
    },

    "delete": {
        value: function delete_(index) {
            if (index in this) {
                this.splice(index, 1);
                return true;
            } else {
                return false;
            }
        }
    },

    shift: {
        value: function shift() {
            return this.splice(0, 1)[0];
        },
        writable: true,
        configurable: true
    },

    pop: {
        value: function pop() {
            if (this.length) {
                return this.splice(this.length - 1, 1)[0];
            }
        },
        writable: true,
        configurable: true
    },

    push: {
        value: function push(arg) {
            if (arguments.length === 1) {
                return this.splice(this.length, 0, arg);
            } else {
                var args = array_slice.call(arguments);
                return this.swap(this.length, 0, args);
            }
        },
        writable: true,
        configurable: true
    },

    unshift: {
        value: function unshift(arg) {
            if (arguments.length === 1) {
                return this.splice(0, 0, arg);
            } else {
                var args = array_slice.call(arguments);
                return this.swap(0, 0, args);
            }
        },
        writable: true,
        configurable: true
    },

    wipe: {
        value: function wipe() {
            return this.splice(0, this.length);
        },
        writable: true,
        configurable: true
    }

};

var ChangeDispatchArray = Object.create(Array.prototype, observableArrayProperties);

