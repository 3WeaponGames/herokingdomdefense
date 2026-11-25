'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const grouped = require('../native/grouped-mask-queue.cjs');
const terrain = require('../native/terrain-geometry-revision.cjs');
const targetless = require('../native/targetless-actor-captures-resources.cjs');

const sdk = process.env.HKD_CREATOR_SDK_ROOT || (process.platform === 'win32'
    ? 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/cocos2d-x' : null);
const available = !!sdk && terrain.PATCHES.every(patch => fs.existsSync(path.join(sdk, patch.file)));

function resourceSource() {
    const [core, adapter] = terrain.PATCHES;
    const coreBytes = fs.readFileSync(path.join(sdk, core.file));
    const adapterBytes = fs.readFileSync(path.join(sdk, adapter.file));
    return {
        core: targetless.patchCore(terrain.patchSource(coreBytes, core)).toString('utf8'),
        adapter: targetless.patchAdapter(terrain.patchGroupedAdapter(grouped.patch(adapterBytes))).toString('utf8')
    };
}

function scope({ result = 2, revalidate = () => true, observer, groupedDispatch = false, maskCase } = {}) {
    const source = resourceSource();
    const events = [], validation = [];
    class RenderComponent {
        constructor() { this.enabledInHierarchy = true; }
        _validateRender() { events.push('stock validate'); }
        disableRender() { events.push('stock disable'); }
        _updateColor() { events.push('stock color'); }
    }
    class Sprite extends RenderComponent {}
    class Mask extends RenderComponent {}
    class Assembler {
        _updateRenderData() { this.updateRenderData(); }
        updateRenderData() { events.push('stock data'); }
    }
    const root = { _proxy: {} }, camera = { target: null };
    const flow = { FLAG_UPDATE_RENDER_DATA: 1, FLAG_COLOR: 2 };
    flow._nativeFlow = { render(proxy, dt, view) {
        assert.equal(proxy, root._proxy);
        assert.equal(dt, 0);
        assert.equal(view, camera);
        assert.equal(camera.target, 'original');
        events.push('forward');
    } };
    const spine = { _hkdTargetlessLeaf(...args) {
        assert.equal(args.length, 4);
        assert.deepEqual(args.slice(0, 3), [flow._nativeFlow, root._proxy, camera]);
        assert.equal(camera.target, null);
        events.push('native');
        if (result === 1) {
            assert(args[3]());
            flow._nativeFlow.render(root._proxy, 0, camera);
        }
        return result;
    } };
    const context = vm.createContext({
        cc: { RenderFlow: flow, Assembler, RenderComponent, Sprite, Mask, director: {} }, sp: {}, spine, validation
    });
    const adapterStart = source.adapter.lastIndexOf('var RenderFlow = cc.RenderFlow;');
    const adapterEnd = source.adapter.indexOf('},{}]},{},[27]);', adapterStart);
    assert(adapterStart >= 0 && adapterEnd > adapterStart);
    new vm.Script(source.adapter.slice(adapterStart, adapterEnd)).runInContext(context);
    const validateStart = source.core.indexOf('        if (RenderFlow._hkdTargetlessRequest && RenderFlow._hkdTargetlessRequest.validating)');
    const validateEnd = source.core.indexOf('renderComp.disableRender();', validateStart) + 'renderComp.disableRender();'.length;
    assert(validateStart >= 0 && validateEnd > validateStart);
    new vm.Script('RenderFlow.validateRenderers = function () { validation.splice(0).forEach(function (renderComp) {\n' +
        source.core.slice(validateStart, validateEnd) + '\n}); };').runInContext(context);

    const verified = flow._hkdTargetlessAdapter;
    assert(Object.isFrozen(verified));
    assert(!verified.ownsRoute(flow.render, flow.renderCamera));
    verified.initialize();
    assert(verified.ownsRoute(flow.render, flow.renderCamera));
    assert(!verified.ownsRoute(() => {}, flow.renderCamera));
    assert(!verified.ownsRoute(flow.render, () => {}));

    const sprite = maskCase ? new Mask() : new Sprite(), assembler = new Assembler();
    sprite._assembler = assembler;
    assembler._renderComp = sprite;
    const node = { _renderComponent: sprite, _dirtyPtr: [maskCase ? 1 : 3] };
    if (maskCase) {
        sprite.node = node;
        node._occlusionMask = true;
        const original = maskCase === 'foreign original' ? function () {
            assert.equal(camera.target, 'original');
            events.push('foreign original');
        } : assembler._updateRenderData;
        const wrapper = assembler._updateRenderData = function () { original.call(this); };
        const carry = function () {
            assert.equal(camera.target, maskCase === 'registered' ? null : 'original');
            events.push('carry');
            return maskCase === 'impostor';
        };
        if (maskCase === 'accessor') {
            Object.defineProperty(wrapper, '_hkdCarryDirtyMask', { get() {
                assert.equal(camera.target, 'original');
                events.push('carry getter');
                return carry;
            } });
        } else if (maskCase === 'mutable') {
            wrapper._hkdCarryDirtyMask = carry;
        } else {
            Object.defineProperty(wrapper, '_hkdCarryDirtyMask', { value: carry });
        }
        if (maskCase !== 'impostor') {
            const registered = maskCase === 'registered' || maskCase === 'changed data';
            assert.equal(verified.registerMaskWrapper(assembler, wrapper, original), registered);
        }
        if (maskCase === 'changed data') assembler.updateRenderData = function () {
            assert.equal(camera.target, 'original');
            events.push('foreign data');
        };
    }
    if (observer === 'validation') sprite._validateRender = function () {
        assert.equal(camera.target, 'original');
        events.push('foreign validate');
    };
    if (observer === 'data') assembler._updateRenderData = function () {
        assert.equal(camera.target, 'original');
        events.push('foreign data');
    };
    if (observer === 'color') sprite._updateColor = function () {
        assert.equal(camera.target, 'original');
        events.push('foreign color');
    };
    validation.push(sprite);
    flow.register(node);
    if (groupedDispatch) flow._hkdMaskQueue.scope = { camera: { _camera: camera }, branch: root };
    const request = {
        root, flow: flow._nativeFlow, nativeCamera: camera, run: spine._hkdTargetlessLeaf,
        revalidate, materialized: false, result: 0,
        materialize() {
            assert(!request.materialized);
            request.materialized = true;
            camera.target = 'original';
            events.push('materialize');
            return true;
        }
    };
    return { flow, root, camera, request, events, spine };
}

function draw(run) {
    run.flow._hkdTargetlessRequest = run.request;
    run.flow.renderCamera(run.camera, run.root);
    assert.equal(run.request.validating, false);
    return run.events;
}

test('only pinned composed Creator resources admit the request and parse as complete modules', { skip: !available }, () => {
    const patched = resourceSource();
    new vm.Script(patched.core);
    new vm.Script(patched.adapter);
    assert.throws(() => targetless.patchCore(Buffer.from(patched.core)), /require verified Creator/);
    assert.throws(() => targetless.patchAdapter(Buffer.from(patched.adapter)), /require verified Creator/);
    assert.throws(() => targetless.patchAdapter(fs.readFileSync(path.join(sdk, terrain.ADAPTER))), /require verified Creator/);
});

test('targetless success and both native continuations keep original callbacks and dispatch exactly once', { skip: !available }, () => {
    for (const result of [0, 1, 2]) {
        const run = scope({ result });
        assert.deepEqual(draw(run), ['stock validate', 'stock data', 'stock color', 'native',
            ...(result === 2 ? [] : ['materialize', 'forward'])]);
        assert.equal(run.request.result, result === 2 ? 2 : 1);
    }
    const denied = scope({ revalidate: () => false });
    assert.deepEqual(draw(denied), ['stock validate', 'stock data', 'stock color', 'materialize', 'forward']);
    assert.equal(denied.request.result, 1);
    const replaced = scope();
    replaced.spine._hkdTargetlessLeaf = () => assert.fail('foreign binding');
    assert(!replaced.flow._hkdTargetlessAdapter.ownsRoute(replaced.flow.render, replaced.flow.renderCamera));
    assert.deepEqual(draw(replaced), ['materialize', 'stock validate', 'stock data', 'stock color', 'forward']);
    assert.equal(replaced.request.result, 1);
});

test('foreign validation and both dirty queue branches see the original target first', { skip: !available }, () => {
    for (const groupedDispatch of [false, true]) {
        for (const observer of ['validation', 'data', 'color']) {
            const run = scope({ groupedDispatch, observer });
            const events = draw(run);
            const key = observer === 'validation' ? 'foreign validate' : 'foreign ' + observer;
            assert(events.indexOf('materialize') === events.indexOf(key) - 1);
            assert.equal(events.filter(value => value === key).length, 1);
            assert.equal(events.filter(value => value === 'forward').length, 1);
            assert(!events.includes('native'));
            assert.equal(run.request.result, 1);
        }
    }
});

test('only an immutable registered Mask wrapper with the current stock data method can stay targetless', { skip: !available }, () => {
    for (const groupedDispatch of [false, true]) {
        const registered = scope({ groupedDispatch, maskCase: 'registered' });
        assert.deepEqual(draw(registered), groupedDispatch ? ['stock validate', 'carry', 'stock data', 'native'] :
            ['stock validate', 'stock data', 'native']);
        assert.equal(registered.request.result, 2);

        for (const maskCase of ['changed data', 'impostor', 'foreign original', 'mutable', 'accessor']) {
            const run = scope({ groupedDispatch, maskCase });
            const events = draw(run);
            assert.equal(run.request.result, 1);
            assert.equal(events.filter(value => value === 'materialize').length, 1);
            assert.equal(events.filter(value => value === 'forward').length, 1);
            assert(!events.includes('native'));
            if (maskCase === 'changed data') assert(events.indexOf('materialize') < events.indexOf('foreign data'));
            if (maskCase === 'foreign original') assert(events.indexOf('materialize') < events.indexOf('foreign original'));
            if (groupedDispatch && maskCase === 'accessor') assert(events.indexOf('materialize') < events.indexOf('carry getter'));
            if (groupedDispatch && maskCase === 'impostor') assert(events.includes('carry') && !events.includes('stock data'));
        }
    }
});
