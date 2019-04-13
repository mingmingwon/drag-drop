const util = {
    rndStr() {
        return Date.now().toString(32);
    },
    assign(target, ...from) {
        return Object.assign(target, ...from);
    },
    createObj() {
        return Object.create(null);
    },
    throwError(msg) {
        throw `DragDrop Error: ${msg}`;
    },
    isString(str) {
        return typeof str === 'string';
    },
    isFunction(fn) {
        return typeof fn === 'function';
    },
    isArray(arr) {
        return Array.isArray(arr);
    },
    isPlainObject(obj) {
        const toString = Object.prototype.toString;
        return toString.call(obj) === '[object Object]';
    },
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
};

export default util;
