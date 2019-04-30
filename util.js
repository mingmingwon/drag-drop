const util = {
    uniStr() {
        return Date.now().toString(32);
    },
    assign(target, ...from) {
        return Object.assign(target, ...from);
    },
    createObject() {
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
    isHtmlElement(node) {
        return node instanceof HTMLElement;
    },
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    },
    createEvent(name) {
        let evt;
        if (window.CustomEvent) {
            evt = new CustomEvent(name, {
                bubbles: true,
                cancelable: true
            });
        } else {
            evt = document.createEvent('Event');
            evt.initEvent(name, true, true);
        }
        return evt;
    }
};

export default util;
