import $ from 'sprint-js';
import util from './util';

let rootEl,
    $rootEl,
    parentEl,
    $parentEl,
    dragEl,
    $dragEl,
    cloneEl,
    $cloneEl,
    nextEl,
    $nextEl,
    oldIndex,
    newIndex,
    dragIns,
    dropIns,
    moved,
    dragRect,
    targetRect,
    lastMode,
    lastTarget;
let docDragOverInit = false,
    docDragOverEvent = function (evt) {
        if (!dragEl) return;
        let dragdrop = DragDrop.detectEmptyInstance(evt);
        dragdrop && dragdrop.onDragging(evt);
    };
const win = window,
    doc = win.document,
    $doc = $(doc);

class DragDrop {
    constructor(...args) {
        this.checkDraggable();

        let opts = this.normalizeArgs(args);
        this.options = this.mergeOptions(opts);

        this.initEl();
        this.initGroup();
        this.initEvents();

        DragDrop.instances.push(this);
    }

    checkDraggable() {
        let supportDraggable = 'draggable' in doc.createElement('div');

        if (!supportDraggable) {
            util.throwError('browser doesn\'t support HTML5 Drag and Drop!');
        }
    }

    normalizeArgs(args) {
        let len = args.length;
        let opts = util.createObj();

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
        if (!util.isString(el)) {
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
        let defaults = {
            iden: 'dd-id',
            group: null,
            sortable: true,
            disabled: false,
            draggable(iden) {
                return `[${this.iden}="${iden}"]>*`;
            },
            ignore: 'a, img',
            supportPointer: 'PointerEvent' in win,
            chosenClass: 'dd-chosen',
            ghostClass: 'dd-ghost',
            dragClass: 'dd-drag',
            setData(dataTransfer) {
                dataTransfer.setData('Text', $dragEl.textContent);
            },
            dragoverBubble: false,
            duration: 100, // ms
            easing: 'cubic-bezier(1, 0, 0, 1)',
            emptyInstanceThreshold: 10 // TODO
        };

        for (let key in defaults) {
            (!opts[key]) && (opts[key] = defaults[key]);
        }

        return opts;
    }

    initEl() {
        let options = this.options;
        let {el, iden, draggable } = options;

        this.el = el;
        this.$el = $(el);
        this.iden = util.rndStr();
        this.$el.attr(iden, this.iden);

        if (util.isFunction(draggable)) {
            options.draggable = options.draggable(this.iden); 
        }
    }

    initGroup() {
        let group = util.createObj(),
            options = this.options,
            _group = options.group;

        if (util.isPlainObject(_group)) {
            // do nothing here
        } else if (util.isString(_group)) {
            _group = {
                name: _group
            };
        } else {
            _group = {};
        }

        let toDragFn = function(drag) {
            return function(to, from, dragEl, evt) {
                let toName = to.options.group.name;

                if (drag == null) {
                    return true;  // default to true
                } else if (drag === false || drag === true || drag === 'clone') {
                    return drag;
                } else if (util.isString(drag)) {
                    return drag === toName;
                } else if (util.isArray(drag)) {
                    return drag.includes(toName);
                } else if (util.isFunction(drag)) {
                    return toDragFn(drag.call(from, ...arguments));
                } else {
                    return false;
                }
            }
        }

        let toDropFn = function(drop) {
            return function(to, from, dragEl, evt) {
                let toName = to.options.group.name,
                    fromName = from.options.group.name,
                    sameGroup = toName && fromName && toName === fromName;

                if (drop == null) {
                    return sameGroup; // depends whether are same group
                } else if (drop === false || drop === true) {
                    return drop;
                } else if (util.isString(drop)) {
                    return drop === fromName;
                } else if (util.isArray(drop)) {
                    return drop.includes(fromName);
                } else if (util.isFunction(drop)) {
                    return toDropFn(drop.call(to, ...arguments));
                } else {
                    return false;
                }
            }
        }

        group.name = _group.name;
        group.drag = _group.drag;
        group.drop = _group.drop;
        group.checkDrag = toDragFn(_group.drag);
        group.checkDrop = toDropFn(_group.drop);

        options.group = group;
    }

    initEvents() {
        let proto = Object.getPrototypeOf(this);
        Object.getOwnPropertyNames(proto).map(fn => { // ES6 Class prototype not enumerable
            if (fn.startsWith('_') && util.isFunction(proto[fn])) {
                this[fn.slice(1)] = proto[fn].bind(this); // `this` => instance, and able to off event
            }
        });

        let $el = this.$el;
        if (this.options.supportPointer) {
            $el.on('pointerdown', this.onSelect);
        } else {
            $el.on('mousedown', this.onSelect);
        }
        $el.on('dragenter dragover', this.handleEvent);

        if (docDragOverInit) return; // enure just one event binded
        $doc.on('dragover', docDragOverEvent);
        docDragOverInit = true;
    }

    _onSelect(evt) {
        let el = this.el;
        let $el = this.$el;
        let options =  this.options;
        let { disabled, draggable, filter } = options;
        let { type, target, button } = evt;

        // W3C Standard: left/middle/right 0/1/2
        // IE9Less: left/middle/right 1/4/2
        if (disabled || button !== 0) {
            return;
        }

        target = $(target).closest(draggable, el).get(0);
        if (!target) return;

        oldIndex = $(target).index();

        this.initDragStart(evt, target, oldIndex);
    }

    initDragStart(evt, target, oldIndex) {
        if (dragEl) return;

        const el = this.el;
        const options = this.options;
        const { ignore, chosenClass } = options;

        parentEl = rootEl = el;
        $parentEl = $rootEl = $(el);
        dragEl = target;
        $dragEl = $(dragEl);
        nextEl = target.nextElementSibling;
        $nextEl = $(nextEl);
        
        $dragEl.find(ignore).each((index, item) => {
            item.draggable = false;
        });

        this.$el.on('mouseup', this.onDrop);

        dragEl.draggable = true;
        $dragEl.addClass(chosenClass);

        this.dispatchEvent('choose', dragEl, rootEl, rootEl, evt, oldIndex);

        $dragEl.on('dragend', this.handleEvent);
        $rootEl.on('dragstart', this.onDragStart);
        $rootEl.on('drop', this.handleEvent);

        // clear selections
        if (win.getSelection) {
            win.getSelection().removeAllRanges();
        } else if (doc.selection) {
            doc.selection.empty();
        }
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

    dispatchEvent(name, dragEl, fromEl, toEl, evt, oldIndex, newIndex) {
        const options = this.options;
        const evtName = `on${util.capitalize(name)}`;
        const evtHandler = options[evtName];
        let event;

        if (win.CustomEvent) {
            event = new CustomEvent(name, {
                bubbles: true,
                cancelable: true
            });
        } else {
            event = doc.createEvent('Event');
            event.initEvent(name, true, true);
        }

        event.from = fromEl;
        event.to = toEl;
        event.item = dragEl;
        event.event = evt;
        event.oldIndex = oldIndex;
        event.newIndex = newIndex;

        evtHandler && evtHandler.call(this, event);
    }

    _onMove(fromEl, toEl, dragEl, dragRect, targetEl, targetRect, evt) {
        const name = 'move';
        const options = this.options;
        const evtName = `on${util.capitalize(name)}`;
        const evtHandler = options[evtName];

        if (win.CustomEvent) {
            event = new CustomEvent(name, {
                bubbles: true,
                cancelable: true
            });
        } else {
            event = doc.createEvent('Event');
            event.initEvent(name, true, true);
        }

        event.from = fromEl;
        event.to = toEl;
        event.dragged = dragEl;
        event.draggedRect = dragRect;
        event.related = targetEl || toEl;
        event.relatedRect = targetRect || DragDrop.getRect(toEl);
        event.event = evt;

        return evtHandler && evtHandler.call(this, event);
        // false: cancel
        // -1: insert before target
        // 1: insert after target
    }

    _onDragStart(evt) {
        const dataTransfer = evt.dataTransfer;
        const options = this.options;
        const { chosenClass, dragClass, ghostClass, setData } = options;

        $cloneEl = $dragEl.clone();
        $cloneEl.removeClass(chosenClass);
        cloneEl = $cloneEl.get(0);
        cloneEl.draggable = false;
        this.hideClone();

        $dragEl.addClass(dragClass).addClass(ghostClass);

        if (dataTransfer) {
            dataTransfer.effectAllowed = 'move';
            setData && setData.call(this, dataTransfer);
        }

        dragIns = this;

        this.dispatchEvent('start', dragEl, rootEl, rootEl, evt, oldIndex);
    }

    _onDragging(evt) {
        const el = this.el;
        const $el = this.$el;
        const options = this.options;
        const { sortable, group: dropGroup } = options;
        const { group: dragGroup } = dragIns.options;
        const emptyEl = $el.children().length === 0;
        const inSelf = dragIns === this;

        moved = true;

        let target = evt.target;

        if (!emptyEl) {
            target = $(target).closest(options.draggable, el).get(0);
        }

        const $target = $(target);
        if (!target || target === dragEl || target.animating) {
            return false;
        }

        dragRect = DragDrop.getRect(dragEl);

        function completed(insertion) {
            if (insertion) {
                if (this !== dropIns && this != dragIns) {
                    dropIns = this;
                } else if (this === dragIns) {
                    dropIns = null;
                }

                dragRect && this.animate(dragRect, dragEl);
                target && targetRect && this.animate(targetRect, target);
            }

            if ((target === dragEl && !dragEl.animating) || (target === el && !target.animating)) {
                lastTarget = null;
            }

            !options.dragoverBubble && evt.stopPropagation && evt.stopPropagation();
            return false;
        }

        const draggable = dragGroup.checkDrag(this, dragIns, dragEl, evt);
        const droppable = dropGroup.checkDrop(this, dragIns, dragEl, evt);

        if (inSelf && !sortable || draggable && droppable) {
            if (emptyEl) { // empty case
                lastTarget = el;
                targetRect = DragDrop.getRect(target);

                const moveVector = this.onMove(rootEl, el, dragEl, dragRect, target, targetRect, evt);
                if (moveVector === false) return;

                if (inSelf) {
                    dragIns.hideClone();
                } else {
                    dragIns.showClone();
                }

                $dragEl.appendTo($target);

                parentEl = target;
                $parentEl = $(parentEl);

                this.dispatchEvent('change', dragEl, el, rootEl, evt, oldIndex, $dragEl.index());

                return completed.bind(this)(true);
            } else {
                const direction = this.getDirection($target);
                lastMode = 'insert';
                lastTarget = target;
                targetRect = DragDrop.getRect(target);

                const $nextEl = $target.next();
                const elChildren = $el.children().dom;
                const elLastChild = elChildren[elChildren.length - 1];
                let after = direction === 1;

                const moveVector = this.onMove(rootEl, el, dragEl, dragRect, target, targetRect, evt);
                if (moveVector === false) return;

                if (moveVector === 1) {
                    after = true;
                } else if (moveVector === -1) {
                    after = false;
                }

                if (inSelf) {
                    dragIns.hideClone();
                } else {
                    dragIns.showClone();
                }

                if (after) {
                    if ($nextEl.length) {
                        $dragEl.insertAfter($target);
                    } else {
                        $dragEl.appendTo($target.parent());
                    }
                } else {
                    $dragEl.insertBefore($target);
                }

                parentEl = target.parentNode;
                $parentEl = $(parentEl);

                this.dispatchEvent('change', dragEl, el, rootEl, evt, oldIndex, $dragEl.index());

                return completed.bind(this)(true);
            }
        }
    }

    _onGlobalDragging(evt) {
        evt.dataTransfer.dropEffect = 'move';
        evt.cancelable && evt.preventDefault();
    }

    _onDrop(evt) {
        if (!$dragEl) return;
        $dragEl.off('dragend', this.handleEvent);
        $rootEl.off('dragstart', this.onDragStart);
        $rootEl.off('drop', this.handleEvent);

        if (moved) {
            evt.cancelable && evt.preventDefault();
            evt.stopPropagation();
        }

        dragEl.draggable = false;
        $dragEl.removeClass(this.options.chosenClass);

        if (dragIns) {
            const { dragClass, ghostClass } = dragIns.options;
            $dragEl.removeClass(dragClass).removeClass(ghostClass);
        }

        this.dispatchEvent('unchoose', dragEl, rootEl, parentEl, evt, oldIndex);

        if (rootEl !== parentEl) {
            newIndex = $dragEl.index();
            this.dispatchEvent('add', dragEl, rootEl, parentEl, evt, oldIndex, newIndex);
            this.dispatchEvent('remove', dragEl, rootEl, parentEl, evt, oldIndex, newIndex);
        } else {
            if (dragEl.nextSibling !== nextEl) {
                newIndex = $dragEl.index();
                this.dispatchEvent('update', dragEl, rootEl, parentEl, evt, oldIndex, newIndex);
                this.dispatchEvent('sort', dragEl, rootEl, parentEl, evt, oldIndex, newIndex);
            }
        }

        if (dragIns) {
            newIndex = newIndex || oldIndex;
            this.dispatchEvent('end', dragEl, rootEl, parentEl, evt, oldIndex, newIndex);
        }

        this.reset();
    }

    reset() {
        rootEl =
        $rootEl =
        parentEl =
        $parentEl =
        dragEl =
        $dragEl =
        cloneEl =
        $cloneEl =
        nextEl =
        $nextEl =
        oldIndex =
        newIndex =
        dragIns =
        dropIns =
        moved =
        dragRect =
        targetRect =
        lastMode =
        lastTarget = null;
    }

    getDirection($target) {
        const dragElIndex = $dragEl.index();
        const targetIndex = $target.index();

        if (dragElIndex < targetIndex) {
            return 1;
        } else {
            return -1;
        }
    }

    animate(prevRect, target) {
        let { duration, easing } = this.options;

        if (!duration) return;

        let { top: pTop, left: pLeft, height: pHeight, width: pWidth } = prevRect,
            $target = $(target),
            currRect = DragDrop.getRect(target),
            { top: cTop, left: cLeft, height: cHeight, width: cWidth } = currRect;

        // center point changed vertical or horizontal
        if ((pTop + pHeight / 2) !== (cTop + cHeight / 2) ||
            (pLeft + pWidth / 2) !== (cLeft + cWidth / 2)) {
            let matrix = DragDrop.matrix(this.el),
                {a: scaleX = 1, d: scaleY = 1} = matrix,
                pTransform = `translate3d(${(pLeft - cLeft) / scaleX}px, ${(pTop - cTop) / scaleY}px, 0)`,
                cTransform = 'translate3d(0, 0, 0)',
                transition = `transform ${duration}ms ${easing}`;

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
        if (dragIns && dragIns.options.group.drag !== 'clone') {
            return;
        }

        if ($nextEl.length) {
            $cloneEl.insertBefore($nextEl);
        } else {
            $cloneEl.appendTo($rootEl);
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
        let { clientX, clientY } = evt,
            inss = this.instances,
            len = inss.length;

        for (let i = 0; i < len; i++) {
            let ins = inss[i],
                el = ins.el,
                $el = ins.$el;

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
}

export default DragDrop;
