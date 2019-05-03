/**
 * @version 0.0.5
 * @update 2019/05/03
 * @author Jordan Wang
 * @repository https://github.com/mingmingwon/drag-drop
 * @license MIT
 */

import $ from 'sprint-js';
import util from './util';

let fromEl, $fromEl, toEl, $toEl, dragEl, $dragEl, cloneEl, $cloneEl, nextEl, $nextEl, targetEl, $targetEl, oldIndex, newIndex, dragIns, dropIns, moved, dragRect, targetRect;
let docDragOverInit = false;
let docDragOverEvent = function (evt) {
        if (!dragEl) return;
        let dragdrop = DragDrop.detectEmptyInstance(evt);
        dragdrop && dragdrop.onDragging(evt);
    };
const win = window;
const doc = win.document;
const $doc = $(doc);

class DragDrop {
    constructor(...args) {
        this.checkDraggable();

        let opts = this.normalizeArgs(args);
        this.options = this.mergeOptions(opts);

        this.initDom();
        this.initGroup();
        this.initEvents();

        this.index = DragDrop.instances.push(this) - 1;
    }

    checkDraggable() {
        let supportDraggable = 'draggable' in doc.createElement('div');

        if (!supportDraggable) {
            util.throwError('browser doesn\'t support HTML5 Drag and Drop!');
        }
    }

    normalizeArgs(args) {
        let len = args.length;
        let opts = util.createObject();

        if (len === 0) {
            util.throwError('requires at least one parameter');
        } else if (len === 1) {
            if (util.isPlainObject(args[0])) {
                util.assign(opts, args[0]);
            } else {
                opts.el = args[0];
            }
        } else {
            if (util.isPlainObject(args[1])) {
                util.assign(opts, args[1], {
                    el: args[0]
                });
            } else {
                util.throwError('`options` parameter invalid');
            }
        }

        let el = opts.el;
        if (!util.isString(el) && !util.isHtmlElement(el)) {
            util.throwError('`el` parameter invalid');
        }

        el = $(el).get(0);
        if (!el || el.nodeType !== 1) {
            util.throwError('`el` matches no HTML Element');
        }

        opts.el = el;
        return opts;
    }

    mergeOptions(opts) {
        let iden = 'dd-';
        let defaults = {
            iden,
            group: null,
            clone: false,
            affixed: null,
            disabled: null,
            sortable: true,
            handle: null,
            exceptEl: 'a, img', // should be changed to undraggable
            affixedClass: iden + 'affixed',
            disabledClass: iden + 'disabled',
            hoverClass: iden + 'hover',
            chosenClass: iden + 'chosen',
            ghostClass: iden + 'ghost',
            dragClass: iden + 'drag',
            fromClass: iden + 'from',
            toClass: iden + 'to',
            direction: 'vertical',
            setData(dataTransfer) {
                dataTransfer.setData('Text', $dragEl.textContent);
            },
            duration: 100, // ms
            easing: 'cubic-bezier(1, 0, 0, 1)',
            emptyInstanceThreshold: 10 // px
        };

        for (let key in defaults) {
            !(key in opts) && (opts[key] = defaults[key]);
        }

        return opts;
    }

    initDom() {
        let options = this.options;
        let { el, iden, affixed, affixedClass, disabled, disabledClass } = options;

        this.el = el;
        this.$el = $(el);
        this.iden = iden + util.uniStr();
        this.$el.addClass(this.iden);

        let selector = `.${this.iden}>*`;

        if (util.isString(affixed)) {
            let matched = $(selector + affixed);
            let firstChild = $(selector).first().get(0);
            let lastChild = $(selector).last().get(0);
            if (matched.length === 1 && (matched.get(0) === firstChild || matched.get(0) === lastChild)) {
                matched.addClass(affixedClass);
            } else {
                util.throwError('only first or last child can be affixed');
            }
        }

        if (util.isString(disabled)) {
            disabled.split(/,\s*/).map(sel => {
                let item = $(sel).closest(selector, el);
                item.get(0) && item.addClass(disabledClass);
            });
        } else if (disabled === true) {
            $(selector).addClass(disabledClass);
        }

        options.selector = selector;
        options.draggable = `${selector}:not(.${affixedClass}):not(.${disabledClass})`;
        options.replaceable = `${selector}:not(.${affixedClass})`;
    }

    initGroup() {
        let group = util.createObject();
        let options = this.options;
        let _group = options.group
        let toCheckDrag = drag => (from, to, dragEl, evt) => {
                let toName = to.options.group.name;

                if (drag == null) {
                    return true;  // default to true
                } else if (drag === false || drag === true) {
                    return drag;
                } else if (util.isString(drag)) {
                    return drag === toName;
                } else if (util.isArray(drag)) {
                    return drag.includes(toName);
                } else if (util.isFunction(drag)) {
                    return toCheckDrag(drag(from, to, dragEl, evt))(from, to, dragEl, evt);
                } else {
                    return false;
                }
            };
        let toCheckDrop = drop => (from, to, dragEl, evt) => {
                let fromName = from.options.group.name,
                    toName = to.options.group.name,
                    sameGroup = fromName && toName && fromName === toName;

                if (drop == null) {
                    return sameGroup; // depends whether are same group
                } else if (drop === false || drop === true) {
                    return drop;
                } else if (util.isString(drop)) {
                    return drop === fromName;
                } else if (util.isArray(drop)) {
                    return drop.includes(fromName);
                } else if (util.isFunction(drop)) {
                    return toCheckDrop(drop(from, to, dragEl, evt))(from, to, dragEl, evt);
                } else {
                    return false;
                }
            };

        if (util.isPlainObject(_group)) {
            // do nothing here
        } else if (util.isString(_group)) {
            _group = {
                name: _group
            };
        } else {
            _group = {};
        }

        group.name = _group.name;
        group.drag = _group.drag;
        group.drop = _group.drop;
        group.checkDrag = toCheckDrag(_group.drag);
        group.checkDrop = toCheckDrop(_group.drop);

        options.group = group;
    }

    initEvents() {
        let proto = Object.getPrototypeOf(this); // this.__proto__
        Object.getOwnPropertyNames(proto).map(prop => { // ES6 Class prototype not enumerable
            if (prop.startsWith('_') && util.isFunction(proto[prop])) {
                this[prop.slice(1)] = proto[prop].bind(this); // `this` => instance, and able to off event
            }
        });

        let $el = this.$el;
        $el.on('mouseover', this.onHover);
        $el.on('mouseout', this.onLeave);
        $el.on('mousedown', this.onSelect);
        $el.on('dragenter dragover', this.handleEvent);

        if (docDragOverInit) return; // enure just one event binded
        $doc.on('dragover', docDragOverEvent);
        docDragOverInit = true;
    }

    _onHover(evt) {
        let el = this.el;
        let $el = this.$el;
        let options =  this.options;
        let { disabled, handle, selector, affixedClass, disabledClass, hoverClass } = options;
        let { type, target: _target, button } = evt;

        if (disabled === true) {
            return;
        }

        if (_target.isContentEditable) {
            return;
        }

        if (handle && !$(_target).closest(handle, el).get(0)) {
            return;
        }

        let target = $(_target).closest(selector, el).get(0);
        if (!target) return;

        let $target = $(target);
        if (!$target.hasClass(affixedClass) && !$target.hasClass(disabledClass)) {
            $target.addClass(hoverClass);
        }

        this.$target = $target;
    }

    _onLeave(evt) {
        let $target = this.$target;
        if (!$target) return;

        $target.removeClass(this.options.hoverClass);
        this.$target = null;
    }

    _onSelect(evt) {
        // W3C Standard: left/middle/right 0/1/2
        // IE9Less: left/middle/right 1/4/2
        if (evt.button !== 0) return;

        let $target = this.$target;
        if (!$target) return;

        let target = $target.get(0);
        let { affixedClass, disabledClass, draggable } = this.options;

        if ($target.hasClass(affixedClass)) {
            this.dispatchEvent('affix', evt, target);
            return;
        }
        if ($target.hasClass(disabledClass)) {
            this.dispatchEvent('disable', evt, target);
            return;
        }

        oldIndex = $target.index(draggable); // unmatch: -1

        this.initDragStart(evt, target);
    }

    initDragStart(evt, target) {
        if (dragEl) return;

        let el = this.el;
        let $el = this.$el;
        let options = this.options;
        let { exceptEl, chosenClass } = options;

        fromEl = el;
        $fromEl = $el;
        dragEl = target;
        $dragEl = $(dragEl);
        $nextEl = $dragEl.next();
        nextEl = $nextEl.get(0);

        $dragEl.find(exceptEl).each((index, item) => {
            item.draggable = false;
        });

        $fromEl.on('mouseup', this.onDrop);

        dragEl.draggable = true;
        $dragEl.addClass(chosenClass);

        this.dispatchEvent('choose', evt, dragEl);

        $fromEl.on('dragstart', this.onDragStart); // drop event on fromEl
        $fromEl.on('drop', this.handleEvent);

        $dragEl.on('dragend', this.handleEvent); // dragend event on dragEl

        // clear selections before dragstart
        util.clearSelection();
    }

    _onDragStart(evt) {
        let { clone, chosenClass, dragClass, fromClass } = this.options;

        if (clone) {
            cloneEl = dragEl.cloneNode(true);
            $cloneEl = $(cloneEl).removeAttr('draggable').removeClass(chosenClass);
            this.hideClone();
        }

        $dragEl.addClass(dragClass);
        $fromEl.addClass(fromClass);
        setTimeout(this.onDragStarted, 0, evt);
    }

    _onDragStarted(evt) {
        let { dragClass, ghostClass, setData } = this.options;
        let dataTransfer = evt.dataTransfer;

        $dragEl.removeClass(dragClass).addClass(ghostClass);

        dataTransfer.effectAllowed = 'move';
        setData && setData.call(this, dataTransfer, dragEl);

        dragIns = this;

        this.dispatchEvent('start', dragEl, fromEl, fromEl, evt, oldIndex);
    }

    _handleEvent(evt) {
        switch (evt.type) {
            case 'drop':
            case 'dragend':
                this.onDrop(evt);
                break;
            case 'dragenter':
            case 'dragover':
                if (dragEl) {
                    this.onDragging(evt);
                    this.onGlobalDragging(evt);
                }
                break;
        }
    }

    dispatchEvent(name, evt, target) {
        let options = this.options;
        let evtName = `on${util.capitalize(name)}`;
        let evtHandler = options[evtName];
        let _evt = util.createEvent(name);

        _evt.evt = evt;
        _evt.from = fromEl;
        _evt.to = toEl;
        _evt.item = target;
        _evt.oldIndex = oldIndex;
        _evt.newIndex = newIndex;

        evtHandler && evtHandler.call(this, _evt);
    }

    _onMove(evt, target) {
        let options = this.options;
        let evtHandler = options.onMove;
        let _evt = util.createEvent('move');

        _evt.evt = evt;
        _evt.from = fromEl;
        _evt.to = toEl;
        _evt.dragged = target;
        _evt.draggedRect = dragRect;
        _evt.related = targetEl || toEl;
        _evt.relatedRect = targetRect || DragDrop.getRect(toEl);

        return evtHandler && evtHandler.call(this, _evt);
        // false: cancel
        // -1: insert before target
        // 1: insert after target
    }

    _onDragging(evt) {
        let el = this.el;
        let $el = this.$el;
        let options = this.options;
        let { replaceable, draggable, sortable, group: dropGroup, toClass } = options
        let { clone, group: dragGroup } = dragIns.options;
        let emptyEl = $el.children().length === 0;
        let inSelf = dragIns === this;
        let _target = evt.target;
        let target;

        moved = true;

        if (!emptyEl) {
            target = $(_target).closest(replaceable, el).get(0);
        } else {
            target = _target;
        }

        if (!target || target === dragEl || target.animating) {
            return false;
        }

        dropIns = this;
        targetEl = target;
        $targetEl = $(target);
        dragRect = DragDrop.getRect(dragEl);

        let allowDrag = dragGroup.checkDrag(dragIns, this, dragEl, evt);
        let allowDrop = dropGroup.checkDrop(dragIns, this, dragEl, evt);

        if (inSelf && sortable || (!inSelf && allowDrag && allowDrop)) {
            $el.addClass(toClass);
            if (inSelf) {
                $toEl && $toEl !== $fromEl && $toEl.removeClass(toClass);
            } else {
                $fromEl.removeClass(toClass);
            }

            toEl = el;
            $toEl = $el;
            if (emptyEl) { // empty case
                targetRect = DragDrop.getRect(targetEl);

                let move = this.onMove(fromEl, el, dragEl, dragRect, targetEl, targetRect, evt);
                if (move === false) return;

                clone && (inSelf ? dragIns.hideClone() : dragIns.showClone());

                $dragEl.appendTo($el);
                newIndex = $dragEl.index(draggable);
                this.dispatchEvent('change', dragEl, fromEl, toEl, evt, oldIndex, newIndex);
            } else {
                targetRect = DragDrop.getRect(targetEl);

                let direction = this.getDirection(evt),
                    after = direction === 1,
                    move = this.onMove(fromEl, toEl, dragEl, dragRect, targetEl, targetRect, evt);
                if (move === false) return;

                if (move === 1) {
                    after = true;
                } else if (move === -1) {
                    after = false;
                }

                clone && (inSelf ? dragIns.hideClone() : dragIns.showClone());

                if (after) {
                    if ($targetEl.next().length) {
                        $dragEl.insertAfter($targetEl);
                    } else {
                        $dragEl.appendTo($toEl);
                    }
                } else {
                    $dragEl.insertBefore($targetEl);
                }

                newIndex = $dragEl.index(draggable);

                this.dispatchEvent('change', dragEl, fromEl, toEl, evt, oldIndex, newIndex);
            }

            this.animate(dragRect, dragEl);
            this.animate(targetRect, targetEl);

            evt.stopPropagation();
        }
    }

    _onGlobalDragging(evt) {
        evt.dataTransfer.dropEffect = 'move';
        evt.preventDefault();
    }

    _onDrop(evt) {
        if (!dragEl) return;

        $dragEl.off('dragend', this.handleEvent);
        $fromEl.off('dragstart', this.onDragStart);
        $fromEl.off('drop', this.handleEvent);

        $fromEl.off('mouseup', this.onDrop);

        if (moved) {
            evt.preventDefault();
            evt.stopPropagation();
        }

        $dragEl.removeAttr('draggable').removeClass(this.options.chosenClass);
        if (dragIns) {
            let { ghostClass, fromClass, toClass } = dragIns.options;
            $dragEl.removeClass(ghostClass);
            $fromEl.removeClass(`${fromClass} ${toClass}`);
        }
        if (dropIns) {
            $toEl.removeClass(dropIns.options.toClass);
        }
        
        this.dispatchEvent('unchoose', dragEl, fromEl, toEl, evt, oldIndex, newIndex);

        if (fromEl !== toEl) {
            dropIns && dropIns.dispatchEvent('add', dragEl, fromEl, toEl, evt, oldIndex, newIndex);
            this.dispatchEvent('remove', dragEl, fromEl, toEl, evt, oldIndex, newIndex);
        } else if (newIndex !== oldIndex) {
            this.dispatchEvent('update', dragEl, fromEl, toEl, evt, oldIndex, newIndex);
            this.dispatchEvent('sort', dragEl, fromEl, toEl, evt, oldIndex, newIndex);
        }

        this.dispatchEvent('end', dragEl, fromEl, toEl, evt, oldIndex, newIndex || oldIndex);
        this.reset();
    }

    destroy() {
        let el = this.el;
        let $el = this.$el;

        this.onDrop();

        $el.off('mousedown', this.onSelect);
        $el.off('dragenter dragover', this.handleEvent);

        DragDrop.instances.splice(this.index, 1);
        if (!DragDrop.instances.length) {
            $doc.off('dragover', docDragOverEvent);
            docDragOverInit = false;
        }
    }

    reset() {
        fromEl = $fromEl = toEl = $toEl = dragEl = $dragEl = cloneEl = $cloneEl = nextEl = $nextEl = targetEl = $targetEl = oldIndex = newIndex = dragIns = dropIns = moved = dragRect = targetRect = undefined;
    }

    detectDirection(el) {
        let display = el.css('display');
        if (display === 'flex') {
            let flexDirection = el.css('flex-direction');
            return flexDirection.startsWith('column') ? 'vertical' : 'horizontal';
        }

        let first = el.children().get(0);
        let $first = $(first);
        let second = el.children().eq(1);
        let $second = $(second);

        if (first) {
            let firstFloat = $first.css('float');
            let firstDisplay = $first.css('display');
            if (firstFloat !== 'none') {
                if (second) {
                    let secondClear = $second.css('clear');
                    return secondClear === 'both' || secondClear === firstFloat ? 'vertical' : 'horizontal';
                } else {
                    return 'horizontal';
                }
            } else {
                if (firstDisplay === 'block' || firstDisplay === 'flex' || firstDisplay === 'table') {
                    return 'vertical';
                } else {
                    return 'horizontal';
                }
            }
        } else {
            return 'horizontal';
        }
    }

    getDirection(evt) {
        let direction = dropIns.options.direction;
        let { top, left, bottom, right } = DragDrop.getRect(targetEl);
        let { pageX, pageY } = evt;

        if (direction === 'vertical') {
            return bottom - pageY <= pageY - top ? 1 : -1;
        } else if (direction === 'horizontal') {
            return right - pageX <= pageX - left ? 1 : -1;
        } else {
            return -1;
        }
    }

    animate(prevRect, target) {
        let { duration, easing } = this.options;

        if (!duration) return;

        let { top: pTop, left: pLeft, height: pHeight, width: pWidth } = prevRect;
        let $target = $(target);
        let currRect = DragDrop.getRect(target);
        let { top: cTop, left: cLeft, height: cHeight, width: cWidth } = currRect;

        // center point changed vertical or horizontal
        if ((pTop + pHeight / 2) !== (cTop + cHeight / 2) ||
            (pLeft + pWidth / 2) !== (cLeft + cWidth / 2)) {
            let matrix = DragDrop.matrix(this.el);
            let {a: scaleX = 1, d: scaleY = 1} = matrix;
            let pTransform = `translate3d(${(pLeft - cLeft) / scaleX}px, ${(pTop - cTop) / scaleY}px, 0)`;
            let cTransform = 'translate3d(0, 0, 0)';
            let transition = `transform ${duration}ms ${easing}`;

            $target.css('transition', 'none') // reset transition
            .css('transform', pTransform); // set to prev position

            target.offsetWidth; // trigger repaint

            $target.css('transition', transition) // set transition
            .css('transform', cTransform); // set to current position
        }

        target.animating && clearTimeout(target.animating);
        target.animating = setTimeout(() => {
            $target.css({
                transition: '',
                transform: ''
            });
            target.animating = null;
        }, duration);
    }

    hideClone() {
        $cloneEl.css('display', 'none');
    }

    showClone() {
        if ($nextEl.length) {
            $cloneEl.insertBefore($nextEl);
        } else {
            $cloneEl.appendTo($fromEl);
        }

        $cloneEl.css('display', '');
    }

    static getRect(el) {
        let top, left, bottom, right, height, width;

        // 'getBoundingClientRect' in window/document === false
        if (el === win || el === doc) {
            top = 0;
            left = 0;
            height = bottom = win.innerHeight;
            width = right = win.innerWidth;
            return { top, left, bottom, right, height, width };
        }

        return el.getBoundingClientRect();
    }

    static matrix(el) {
        let appliedTransforms = '';

        do {
            let transform = $(el).css('transform');
            if (transform && transform !== 'none') {
                appliedTransforms = transform + ' ' + appliedTransforms;
            }
        } while (el = el.parentNode);

        if (win.DOMMatrix) {
            return new DOMMatrix(appliedTransforms);
        } else if (win.WebKitCSSMatrix) {
            return new WebKitCSSMatrix(appliedTransforms);
        } else if (win.CSSMatrix) {
            return new CSSMatrix(appliedTransforms);
        }
    }

    static instances = [] // store all DragDrop instances

    static detectEmptyInstance(evt) { // detect neareast empty instance
        let { clientX, clientY } = evt;
        let inss = this.instances;
        let len = inss.length;

        for (let i = 0; i < len; i++) {
            let ins = inss[i];
            let el = ins.el;
            let $el = ins.$el;

            if ($el.children().length > 0) continue;

            let { top, left, bottom, right } = this.getRect(el);
            let threshold = ins.options.emptyInstanceThreshold;

            let verInside = clientY >= (top - threshold) && clientY <= (bottom + threshold);
            let horInside = clientX >= (left - threshold) && clientX <= (right + threshold);

            if (verInside && horInside) {
                return ins;
            }
        }
    }

    static create(...args) {
        return new this(...args);
    }

    static version = '0.0.5'
}

export default DragDrop;
