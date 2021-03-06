/**
 * @version 0.0.16
 * @author Jordan Wang
 * @repository https://github.com/mingmingwon/drag-drop
 * @license MIT
 */

import $ from 'sprint-js';
import util from './util';

let win = window;
let doc = win.document;
let $doc = $(doc);
let fromEl, $fromEl, fromIns, fromIndex, 
    toEl, $toEl, toIns, toIndex, 
    dragEl, $dragEl, dragRect, 
    targetEl, $targetEl, targetRect,
    $cloneEl, $nextEl;
let docDragOverInit = false;
let docDragOverEvent = evt => {
    if (!dragEl) return;
    let dragdrop = DragDrop.detectEmptyInstance(evt);
    dragdrop && dragdrop.onDragging(evt);
};

class DragDrop {
    constructor(...args) {
        this.checkDraggable();

        let opts = this.normalizeArgs(args);
        this.options = this.mergeOptions(opts);

        this.initDOM();
        this.initGroup();
        this.initEvents();

        this.index = DragDrop.instances.push(this) - 1;
    }

    checkDraggable() {
        let supportDraggable = 'draggable' in doc.createElement('div');

        if (!supportDraggable) {
            util.throwError('doesn\'t support HTML5 Drag and Drop');
        }
    }

    normalizeArgs(args) {
        let len = args.length;
        if (len === 0) {
            util.throwError('requires at least one parameter');
        }

        let opts = util.createObject();
        if (len === 1) {
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
                util.throwError('`options` parameter format invalid');
            }
        }

        let el = opts.el;
        if (!util.isString(el) && !util.isHtmlElement(el)) {
            util.throwError('`el` parameter format invalid');
        }

        el = $(el).get(0);
        if (!el || el.nodeType !== 1) {
            util.throwError('`el` parameter matches no HTML');
        }

        opts.el = el;
        return opts;
    }

    mergeOptions(opts) {
        let iden = 'dd-';
        let defaults = {
            iden,
            mode: 'simple', // or 'advance'
            group: null,
            clone: false,
            affixed: null,
            disabled: null,
            sortable: true,
            handle: null,
            affixedClass: iden + 'affixed',
            disabledClass: iden + 'disabled',
            hoverClass: iden + 'hover',
            activeClass: iden + 'active',
            dragClass: iden + 'drag',
            ghostClass: iden + 'ghost',
            fromClass: iden + 'from',
            toClass: iden + 'to',
            direction: null,
            setData(dataTransfer, dragEl) {
                dataTransfer.setData('Text', dragEl.textContent);
            },
            duration: 0, // ms
            timingFunction: 'ease', // namely css transition-timing-function
            emptyInstanceThreshold: 10 // px
        };

        for (let key in defaults) {
            if (!(key in opts)) {
                opts[key] = defaults[key];
            }
        }

        return opts;
    }

    initDOM() {
        let options = this.options;
        let { el, iden, affixed, affixedClass, disabled, disabledClass, direction } = options;

        this.el = el;
        this.$el = $(el);
        this.iden = iden + util.uniStr();
        this.$el.addClass(this.iden);

        let selector = `.${this.iden}>*`;

        if (util.isString(affixed)) {
            let $matched = $(selector + affixed);
            let matched = $matched.get(0);
            let first = $(selector).first().get(0);
            let last = $(selector).last().get(0);
            if ($matched.length === 1 && (matched === first || matched === last)) {
                $matched.addClass(affixedClass);
            } else {
                util.throwError('only the first or last item can be affixed');
            }
        }

        if (util.isString(disabled)) {
            disabled.split(/,\s*/).map(item => {
                let $item = $(selector + item).closest(selector, el);
                $item.get(0) && $item.addClass(disabledClass);
            });
        } else if (disabled === true) {
            $(selector).addClass(disabledClass);
        }

        options.selector = selector;
        options.draggable = `${selector}:not(.${affixedClass}):not(.${disabledClass})`;
        options.replaceable = `${selector}:not(.${affixedClass})`;

        if (!direction || !['vertical', 'horizontal'].includes(direction)) {
            options.direction = this.detectDirection(el);
        }
    }

    initGroup() {
        let group = util.createObject();
        let options = this.options;
        let _group = options.group;
        let toCheckDragFn = drag => (from, to, dragEl, evt) => {
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
                return toCheckDragFn(drag(from, to, dragEl, evt))(from, to, dragEl, evt);
            } else {
                return false;
            }
        };
        let toCheckDropFn = drop => (from, to, dragEl, evt) => {
            let fromName = from.options.group.name;
            let toName = to.options.group.name;
            let sameGroup = fromName && toName && fromName === toName;

            if (drop == null) {
                return sameGroup; // depends whether are same group
            } else if (drop === false || drop === true) {
                return drop;
            } else if (util.isString(drop)) {
                return drop === fromName;
            } else if (util.isArray(drop)) {
                return drop.includes(fromName);
            } else if (util.isFunction(drop)) {
                return toCheckDropFn(drop(from, to, dragEl, evt))(from, to, dragEl, evt);
            } else {
                return false;
            }
        };

        if (util.isString(_group)) {
            _group = {
                name: _group
            };
        } else if (!util.isPlainObject(_group)) {
            _group = {};
        }

        group.name = _group.name;
        group.drag = _group.drag;
        group.drop = _group.drop;
        group.checkDrag = toCheckDragFn(_group.drag);
        group.checkDrop = toCheckDropFn(_group.drop);

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
        $el.on('dragenter dragover', this.onDragging);

        if (docDragOverInit) return; // enure just one event binded
        $doc.on('dragover', docDragOverEvent);
        docDragOverInit = true;
    }

    _onHover(evt) {
        let el = this.el;
        let $el = this.$el;
        let options =  this.options;
        let { disabled, handle, selector, affixedClass, disabledClass, hoverClass } = options;
        let _target = evt.target;
        
        if (disabled === true) return;
        if (_target.isContentEditable) return;
        if (handle && !$(_target).closest(handle, el).get(0)) return;

        let target;
        if (!(target = $(_target).closest(selector, el).get(0))) return;

        let $target = $(target);
        if (!$target.hasClass(affixedClass) && !$target.hasClass(disabledClass) && !dragEl) {
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
        let options = this.options;
        let { hoverClass, affixedClass, disabledClass, activeClass, draggable } = options;

        $target.removeClass(hoverClass);
        this.$target = null;

        if ($target.hasClass(affixedClass)) {
            this.dispatchEvent('affix', evt, target);
            return;
        }
        if ($target.hasClass(disabledClass)) {
            this.dispatchEvent('disable', evt, target);
            return;
        }

        if (dragEl) return;

        this.dispatchEvent('active', evt, target);

        fromEl = this.el;
        $fromEl = this.$el;
        dragEl = target;
        $dragEl = $target;
        $nextEl = $dragEl.next();

        util.clearSelection();
        dragEl.draggable = true;
        $dragEl.addClass(activeClass);

        $dragEl.on('dragstart', this.onDragStart);
        $dragEl.on('dragend', this.onDrop);
        $fromEl.on('drop', this.onDrop);
        $fromEl.on('mouseup', this.onDrop);
    }

    _onDragStart(evt) {
        let { clone, activeClass, dragClass, fromClass } = this.options;

        if (clone) {
            $cloneEl = $dragEl.clone();
            $cloneEl.removeAttr('draggable').removeClass(activeClass);
            this.hideClone();
        }

        $dragEl.addClass(dragClass);
        $fromEl.addClass(fromClass);
        setTimeout(this.onDragStarted, 0, evt);
    }

    _onDragStarted(evt) {
        let { dragClass, ghostClass, setData, draggable } = this.options;
        let dataTransfer = evt.dataTransfer;

        $dragEl.removeClass(dragClass).addClass(ghostClass);

        dataTransfer.effectAllowed = 'move';
        setData.call(this, dataTransfer, dragEl);

        fromIns = this;
        fromIndex = $dragEl.index(draggable);
        this.dispatchEvent('start', evt);
    }

    dispatchEvent(name, evt, target) {
        let options = this.options;
        let evtName = `on${util.capitalize(name)}`;
        let evtHandler = options[evtName];
        let _evt = util.createEvent(name);

        _evt.evt = evt;
        _evt.from = fromEl;
        _evt.to = toEl;
        _evt.item = target || dragEl;
        _evt.fromIndex = fromIndex;
        _evt.toIndex = toIndex;

        evtHandler && evtHandler.call(this, _evt);
    }

    _onMove(evt) {
        let options = this.options;
        let evtHandler = options.onMove;
        let _evt = util.createEvent('move');

        _evt.evt = evt;
        _evt.from = fromEl;
        _evt.to = toEl;
        _evt.dragged = dragEl;
        _evt.draggedRect = dragRect;
        _evt.related = targetEl;
        _evt.relatedRect = targetRect;

        // false: cancel, -1: insert before, 1: insert after
        return evtHandler && evtHandler.call(this, _evt);
    }

    _onDragging(evt) {
        if (!dragEl) return;

        evt.dataTransfer.dropEffect = 'move';
        evt.preventDefault();

        let el = this.el;
        let $el = this.$el;
        let options = this.options;
        let { replaceable, group: toGroup, sortable, toClass, mode, draggable } = options;
        let { clone, group: fromGroup } = fromIns.options;
        let childLen = $el.children().length;
        let isEmpty = childLen === 0;
        let isOnly = childLen === 1;
        let isSelf = fromIns === this;
        let _target = evt.target;
        let target;

        if (isEmpty) {
            target = _target;
        } else {
            target = $(_target).closest(replaceable, el).get(0) || el;
        }

        if (target === dragEl || target.animating) {
            return;
        }

        let allowDrag = fromGroup.checkDrag(fromIns, this, dragEl, evt);
        let allowDrop = toGroup.checkDrop(fromIns, this, dragEl, evt);

        if (isSelf && !sortable) return;
        if (!isSelf && (!allowDrag || !allowDrop)) return;

        toIns = this;
        targetEl = isEmpty ? el : target;
        $targetEl = isEmpty ? $el : $(target);

        $el.addClass(toClass);
        if (isSelf) {
            $toEl && $toEl !== $fromEl && $toEl.removeClass(toClass);
        } else {
            $fromEl.removeClass(toClass);
        }

        toEl = el;
        $toEl = $el;
        dragRect = DragDrop.getRect(dragEl);
        targetRect = DragDrop.getRect(targetEl);

        let move = this.onMove(evt);
        if (move === false) return;

        if (isEmpty) {
            clone && (isSelf ? fromIns.hideClone() : fromIns.showClone());
            $dragEl.appendTo($toEl);
        } else if (targetEl === el) {
            if (mode === 'simple') {
                targetEl = toEl = el;
                $targetEl = $toEl = $el;
                $el.off('drop', this.onDrop).on('drop', this.onDrop);
                dragRect = DragDrop.getRect(dragEl);
                return;
            }

            if (dragEl.animating) return;

            let elRect = DragDrop.getRect(el);
            let inRect = DragDrop.getRect(el, false);
            let { pageX, pageY } = evt;

            if ((pageX >= elRect.left && pageX <= inRect.left) ||
                (pageX >= inRect.right && pageX <= elRect.right) || 
                (pageY >= elRect.top && pageY <= inRect.top) || 
                (pageY >= inRect.bottom && pageY <= elRect.bottom)) {
                return;
            }

            let subRects = [];
            let $children = $el.children();
            $children.each((index, child) => {
                let rect = DragDrop.getRect(child, true);
                rect.index = index;
                subRects.push(rect);
            });

            let breaks = [];
            for (let i = 0, subLen = subRects.length; i < subLen - 1; i++) {
                let rect1 = subRects[i];
                let rect2 = subRects[i + 1];
                if (rect2.top >= rect1.bottom) {
                    breaks.push({
                        left: rect1.right,
                        top: rect1.top,
                        bottom: rect1.bottom,
                        right: inRect.right,
                        index: i
                    });
                }
            }

            let inserted;
            for (let i = 0, gapLen = breaks.length; i < gapLen; i++) {
                let { left, top, bottom, right, index } = breaks[i];
                let $prev = $children.eq(index);
                let prev = $prev.get(0);
                let next = $children.eq(index + 1).get(0);
                let isDragEl = prev === dragEl || next === dragEl;

                if (!isDragEl && pageX > left && pageX < right && pageY > top && pageY < bottom) {
                    clone && (isSelf ? fromIns.hideClone() : fromIns.showClone());
                    $dragEl.insertAfter($prev);
                    inserted = true;
                    break;
                }
            }

            if (!inserted) {
                let last = subRects[subLen - 1];
                let { left, top, bottom, right, index } = last || {};
                if (!last || pageY > bottom || (pageX > right && pageY >= top && pageY <= bottom)) {
                    clone && (isSelf ? fromIns.hideClone() : fromIns.showClone());
                    $dragEl.appendTo($el);
                }
            }
        } else {
            let after = this.getPosition(evt, isSelf) === 1;
            after = move === 1 ? true : (move === -1 ? false : after);

            clone && (isSelf ? fromIns.hideClone() : fromIns.showClone());
            if (after) {
                $dragEl.insertAfter($targetEl);
            } else {
                $dragEl.insertBefore($targetEl);
            }
        }

        toIndex = $dragEl.index(draggable);
        this.dispatchEvent('change');

        this.animate(dragRect, dragEl);
        this.animate(targetRect, targetEl);
    }

    _onDrop(evt) {
        if (!dragEl) return;
        if (this.options.mode === 'simple' && fromIns && fromIns !== this && dragEl.parentNode !== toEl) {
            $dragEl.appendTo($toEl);

            toIndex = $dragEl.index(draggable);
            this.dispatchEvent('change');

            this.animate(dragRect, dragEl);

            $toEl.off('drop', this.onDrop);
        }

        $dragEl.off('dragstart', this.onDragStart);
        $dragEl.off('dragend', this.onDrop);
        $fromEl.off('drop', this.onDrop);
        $fromEl.off('mouseup', this.onDrop);

        let { ghostClass, activeClass, handle, draggable, hoverClass, fromClass, toClass } = this.options;
        $dragEl.removeAttr('draggable').removeClass(`${ghostClass} ${activeClass}`);
        $fromEl.removeClass(`${fromClass} ${toClass}`);

        toIns && $toEl.removeClass(toIns.options.toClass);

        let el =  this.el;
        let $target;
        if (handle) {
            $target = $(evt.target).closest(handle, el);
            if ($target.get(0)) {
                $target = $target.closest(draggable, el);
            }
        } else {
            $target = $(evt.target).closest(draggable, el);
        }
        let target = $target.get(0);
        if (!target) {
            target = dragEl;
            $target = $dragEl;
        }
        if (DragDrop.inTarget(evt, target)) {
             $target.addClass(hoverClass);
             this.$target = $target;
        }

        this.dispatchEvent('deactive');

        if (fromIns) {
            if (toIns && fromIns !== toIns) {
                fromIns.dispatchEvent('del');
                toIns.dispatchEvent('add');
            } else if (toIndex != null && toIndex !== fromIndex) {
                fromIns.dispatchEvent('sort');
            }
        }

        this.dispatchEvent('end');
        this.reset();
    }

    reset() {
        fromEl = $fromEl = fromIns = fromIndex = 
        toEl = $toEl = toIns = toIndex = 
        dragEl = $dragEl = dragRect = 
        targetEl = $targetEl = targetRect = 
        $cloneEl =  $nextEl = undefined;
    }

    destroy() {
        let el = this.el;
        let $el = this.$el;

        this.onDrop();

        $el.on('mouseover', this.onHover);
        $el.on('mouseout', this.onLeave);
        $el.off('mousedown', this.onSelect);
        $el.off('dragenter dragover', this.onDragging);

        DragDrop.instances.splice(this.index, 1);
        if (DragDrop.instances.length === 0) {
            $doc.off('dragover', docDragOverEvent);
            docDragOverInit = false;
        }
    }

    detectDirection(el) {
        let $el = $(el);
        let display = $el.css('display');
        if (display === 'flex') {
            let flexDirection = $el.css('flex-direction');
            return flexDirection.startsWith('column') ? 'vertical' : 'horizontal';
        }

        let $first = $el.children().eq(0);
        let first = $first.get(0);
        let $second = $el.children().eq(1);
        let second = $second.get(0);

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

    getPosition(evt, flag) {
        if (flag) {
            return $dragEl.index() < $targetEl.index() ? 1 : -1;
        }

        let direction = toIns.options.direction;
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
        let { duration, timingFunction } = this.options;

        if (!duration) return;

        let { top: pTop, left: pLeft, height: pHeight, width: pWidth } = prevRect;
        let $target = $(target);
        let currRect = DragDrop.getRect(target);
        let { top: cTop, left: cLeft, height: cHeight, width: cWidth } = currRect;

        // center point changed vertical or horizontal
        if ((pTop + pHeight / 2) !== (cTop + cHeight / 2) ||
            (pLeft + pWidth / 2) !== (cLeft + cWidth / 2)) {
            let matrix = DragDrop.matrix(this.el);
            let { a: scaleX = 1, d: scaleY = 1 } = matrix;
            let pTransform = `translate3d(${(pLeft - cLeft) / scaleX}px, ${(pTop - cTop) / scaleY}px, 0)`;
            let cTransform = 'translate3d(0, 0, 0)';
            let transition = `transform ${duration}ms ${timingFunction}`;

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

    static getRect(el, flag) {
        let top, left, bottom, right, height, width;

        // 'getBoundingClientRect' in window/document === false
        if (el === win || el === doc) {
            top = 0;
            left = 0;
            height = bottom = win.innerHeight;
            width = right = win.innerWidth;
        } else {
            let { scrollTop, scrollLeft } = doc.documentElement;
            ({ top, left, bottom, right, height, width } = el.getBoundingClientRect());

            top += scrollTop;
            left += scrollLeft;
            bottom += scrollTop;
            right += scrollLeft;

            if (flag === true) {
                let $el = $(el);
                top -= parseInt($el.css('margin-top'));
                left -= parseInt($el.css('margin-left'));
                bottom += parseInt($el.css('margin-bottom'));
                right += parseInt($el.css('margin-right'));
            } else if (flag === false) {
                let $el = $(el);
                top += parseInt($el.css('border-top')) + parseInt($el.css('padding-top'));
                left += parseInt($el.css('border-left')) + parseInt($el.css('padding-left'));
                bottom -= parseInt($el.css('border-bottom')) + parseInt($el.css('padding-bottom'));
                right -= parseInt($el.css('border-right')) + parseInt($el.css('padding-right'));
            }
        }

        return { top, left, bottom, right, height, width };
    }

    static inTarget(evt, el) {
        let { pageX, pageY } = evt;
        let { top, left, bottom, right } = this.getRect(el);
        return !!(top <= pageY && bottom >= pageY && left <= pageX && right >= pageX);
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
        let instances = this.instances;

        for (let i = 0, len = instances.length; i < len; i++) {
            let ins = instances[i];
            let el = ins.el;
            let $el = ins.$el;

            if ($el.children().length > 0) continue;

            let { top, left, bottom, right } = this.getRect(el, true);
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

    static version = '0.0.16'
}

export default DragDrop;
