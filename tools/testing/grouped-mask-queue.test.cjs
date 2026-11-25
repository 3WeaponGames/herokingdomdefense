'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { patch, STOCK_SHA256, PATCHED_SHA256 } = require('../native/grouped-mask-queue.cjs');

const sdkAdapter = process.env.HKD_CREATOR_JSB_SOURCE || path.join(process.env.ProgramData || 'C:/ProgramData',
    'cocos/editors/Creator/2.4.13/resources/cocos2d-x/simulator/win32/jsb-adapter/jsb-engine.js');
const sourceAvailable = fs.existsSync(sdkAdapter);
const needsSdk = { skip: sourceAvailable ? false : 'Creator 2.4.13 Windows adapter is unavailable' };
const sha256 = input => createHash('sha256').update(input).digest('hex');
const UPDATE = 4;
const COLOR = 8;

test('grouped queue refuses unverified JSB source before transforming it', () => {
    for (const input of [null, {}, Buffer.alloc(3), 'RenderFlow.render = function(scene) {}']) {
        assert.throws(() => patch(input), /verified Creator 2\.4\.13 native adapter/);
    }
});

test('the pinned installed adapter transforms deterministically without editing stock bytes', needsSdk, () => {
    const stock = fs.readFileSync(sdkAdapter);
    assert.equal(sha256(stock), STOCK_SHA256);
    const deployed = patch(stock);
    assert.notEqual(deployed, stock);
    assert.equal(sha256(deployed), PATCHED_SHA256);
    assert.deepEqual(deployed, patch(stock.toString('utf8')));
    assert.throws(() => patch(deployed), /verified Creator 2\.4\.13 native adapter/);
    assert.equal(sha256(stock), STOCK_SHA256);
    new vm.Script(deployed.toString('utf8'));
});

function between(source, start, next) {
    const from = source.indexOf(start);
    const to = source.indexOf(next, from + start.length);
    assert(from >= 0 && to > from, start);
    return source.slice(from, to);
}
function fixture(adapter) {
    const source = adapter.toString('utf8').replace(/\r\n/g, '\n');
    const flow = between(source, 'var RenderFlow = cc.RenderFlow;\nRenderFlow.FLAG_REORDER_CHILDREN =', '\n},{}]');
    const setter = between(source, 'cc.js.getset(cc.Node.prototype, "_renderFlag"', 'cc.PrivateNode.prototype._posDirty');
    const parentHandler = between(source, 'function updateParent() {', '\n  updateZOrder:')
        .trimEnd().replace(/,$/, '');
    const scope = { main: { name: 'map' }, branch: null, camera: { _camera: {} } };
    const scene = { _proxy: {} };
    const branches = [{ name: 'A' }, { name: 'B' }];
    let onValidate = null;
    let onNative = null;
    const sideEffects = [];
    const probes = { predicateCalls: 0, updateCalls: 0 };
    const RenderFlow = {
        FLAG_UPDATE_RENDER_DATA: UPDATE,
        FLAG_COLOR: COLOR,
        validateRenderers() {
            const action = onValidate;
            onValidate = null;
            if (action) action();
        },
        _nativeFlow: { render() {
            const action = onNative;
            onNative = null;
            if (action) action();
        } }
    };
    function Node() {}
    const cc = { RenderFlow, director: {}, Node, js: { getset(object, name, get, set) {
        Object.defineProperty(object, name, { get, set });
    } } };
    const window = {};
    const receipt = `window.inspectQueues = function () {
        function report(queue) {
            return queue.map(function (row) {
                return row.members || [row];
            }).flat().map(function (node) {
                return [node.name, node._dirtyPtr[0], node._inJsbDirtyList];
            });
        }
        return { current: report(_dirtyTargets), waiting: report(_dirtyWaiting),
            groups: _dirtyTargets.filter(function (row) { return !!row.members; }).map(function (row) {
                return row.members.map(function (node) { return node.name; });
            }) };
    };`;
    const setup = `var COLOR = ${COLOR}, UPDATE_RENDER_DATA = ${UPDATE};\n`;
    vm.runInNewContext(flow + setup + setter + 'window.updateParent = (' + parentHandler + ');\n' + receipt, { cc, window });
    const queue = RenderFlow._hkdMaskQueue;
    function node(name, masked) {
        const n = new Node();
        Object.assign(n, { name, masked, clean: true, _parent: scope.main, _dirtyPtr: [0],
            _inJsbDirtyList: false, _hkdMaskRun: null });
        function cleanAndHidden() {
            return n.masked && n.clean && !!scope.branch && n._parent === scope.main && scope.branch !== n;
        }
        function prepare() {
            ++probes.updateCalls;
            if (n.onUpdate) n.onUpdate();
            if (!cleanAndHidden()) {
                sideEffects.push(['render data', name]);
                n.clean = true;
            }
            n._renderFlag |= UPDATE;
        }
        prepare._hkdCarryDirtyMask = function () {
            if (masked) ++probes.predicateCalls;
            return cleanAndHidden();
        };
        n._renderComponent = {
            _assembler: { _updateRenderData: prepare },
            _updateColor() { sideEffects.push(['color', name]); }
        };
        return n;
    }
    function draw(branch, camera = scope.camera._camera) {
        const previous = scope.branch;
        const owner = queue && queue.scope;
        scope.branch = branch;
        if (queue) queue.scope = branch ? scope : null;
        try {
            RenderFlow.render(scene, camera ? 0 : 1, camera);
        } finally {
            scope.branch = previous;
            if (queue) queue.scope = owner;
        }
    }
    function move(n, parent) {
        n._parent = parent;
        parent._spaceInfo = { unitID: 2, index: 1, dirty: [0] };
        window.updateParent.call({ _owner: n, _parentPtr: [0, 0], _dirtyPtr: [0], notifyUpdateParent() {} });
    }
    function inspect() {
        return JSON.parse(JSON.stringify(window.inspectQueues()));
    }
    return { scope, queue, RenderFlow, branches, node, draw, move, inspect, probes, sideEffects,
        validate(action) { onValidate = action; },
        native(action) { onNative = action; } };
}

function ordinaryCaptureSequence(bytes, enable) {
    const f = fixture(bytes);
    if (f.queue) f.queue.enabled = enable;
    const receipts = [];
    const [a, b] = f.branches;
    const first = f.node('first', true);
    const middle = f.node('middle', true);
    const last = f.node('last', true);
    const newMask = f.node('validation', true);
    const overlay = f.node('color', false);
    first._renderFlag |= UPDATE;
    middle._renderFlag |= UPDATE;
    overlay._renderFlag |= UPDATE | COLOR;
    last._renderFlag |= UPDATE;
    function take(name, branch, camera) {
        f.draw(branch, camera);
        const { groups, ...queues } = f.inspect();
        receipts.push([name, queues, f.sideEffects.splice(0)]);
        return groups;
    }
    const initially = take('form adjacent runs', a);
    const predicateCalls = f.probes.predicateCalls;
    const carried = take('carry whole runs', b);
    if (enable && f.queue) {
        assert.deepEqual(initially, [['first', 'middle'], ['last']]);
        assert.deepEqual(carried, initially);
        assert.equal(f.probes.predicateCalls, predicateCalls);
    }
    f.validate(() => { newMask._renderFlag |= UPDATE; });
    f.native(() => { overlay._renderFlag |= COLOR; });
    take('validation and native registration preserve their positions', a);
    middle.clean = false;
    f.RenderFlow.register(middle);
    take('already queued real registration is visible', b);
    first._renderFlag &= ~UPDATE;
    take('clear-only invalidation never adds the bit back', b);
    last.clean = false;
    f.move(last, b);
    take('original native parent publication invalidates eligibility', b);
    take('observing mask as the scene branch', middle);
    take('unowned camera expands every run', null, {});
    take('ordinary main render receives exact order', null, null);
    return receipts;
}

test('grouped masks preserve logical dirty order and render-data effects', needsSdk, () => {
    const stock = fs.readFileSync(sdkAdapter);
    const deployed = patch(stock);
    assert.deepEqual(ordinaryCaptureSequence(deployed, true), ordinaryCaptureSequence(stock, false));
    assert.deepEqual(ordinaryCaptureSequence(deployed, false), ordinaryCaptureSequence(stock, false));
});

test('retired queued nodes reach the stock renderer checks during a grouped capture', needsSdk, () => {
    const stock = fs.readFileSync(sdkAdapter);
    function witness(adapter) {
        const f = fixture(adapter);
        const [branch] = f.branches;
        const removed = [f.node('component released', false), f.node('assembler released', false)];
        removed.forEach(node => { node._renderFlag |= UPDATE; });
        removed[0]._renderComponent = null;
        removed[1]._renderComponent._assembler = null;
        removed.forEach(node => { node._dirtyPtr = null; });
        const live = f.node('next renderer', false);
        live._renderFlag |= COLOR;
        f.draw(branch);
        return { removed: removed.map(node => node._inJsbDirtyList), effects: f.sideEffects };
    }
    assert.deepEqual(witness(patch(stock)), witness(stock));
});

test('foreign native reentry does not dispatch the outer waiting run or retain discarded memberships', needsSdk, () => {
    const stock = fs.readFileSync(sdkAdapter);
    function witness(adapter) {
        const f = fixture(adapter);
        const [a, b] = f.branches;
        const first = f.node('first', true);
        const second = f.node('second', true);
        first._renderFlag |= UPDATE;
        second._renderFlag |= UPDATE;
        f.draw(a);
        let inner;
        f.native(() => {
            f.draw(null, {});
            inner = f.inspect().current;
        });
        f.draw(b);
        const { current, waiting } = f.inspect();
        assert.equal(first._hkdMaskRun, null);
        assert.equal(second._hkdMaskRun, null);
        return { inner, current, waiting, sideEffects: f.sideEffects };
    }
    assert.deepEqual(witness(patch(stock)), witness(stock));
});
