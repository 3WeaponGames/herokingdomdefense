'use strict';
// Model the installed 2.4.13 JSB Mask assembler's pure boolean setters. The
// ordinary geometry/material/dirty work remains live on every camera render.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../assets/_script/NativeOcclusionMaskCache.js'), 'utf8');

function fixture(options = {}) {
  const calls = [];
  class Mask {
    constructor() {
      this.node = { _occlusionMask: true };
      this.inverted = false; this.type = 2;
      this.geometry = this.materialUpdates = this.dirty = 0;
      this._graphics = {};
    }
  }
  const prototype = {
    setMaskInverted(value) { calls.push(['inverted', value]); this.inverted = !!value; },
    setUseModel(value) { calls.push(['model', value]); this.model = !!value; },
    setImageStencil(value) { calls.push(['image', value]); this.image = !!value; },
    updateRenderData(mask) {
      mask.geometry++; mask.materialUpdates++;
      this.setMaskInverted(mask.inverted);
      this.setUseModel(mask.type !== 2);
      this.setImageStencil(mask.type === 2);
      mask._graphics._assembler.setUseModel(mask.type !== 2);
      mask.dirty++;
    }
  };
  function assembler(owner) { return Object.assign(Object.create(prototype), { _renderComp: owner }); }
  function mask() {
    const value = new Mask();
    value._assembler = assembler(value);
    value._graphics._assembler = assembler(value._graphics);
    return value;
  }
  const cc = { ENGINE_VERSION: options.version || '2.4.13', Mask,
    sys: { isNative: options.native !== false }, isValid: value => !!value && !value.destroyed };
  const api = {};
  vm.runInNewContext(source, { exports: api, cc, WeakMap }, { filename: 'NativeOcclusionMaskCache.js' });
  const value = mask();
  return { api, cc, calls, prototype, mask, assembler, value,
    update(value) { value._assembler.updateRenderData(value); } };
}

test('generated native masks skip duplicate booleans while all camera geometry, material and dirty work remains live', () => {
  const f = fixture(), mask = f.value;
  for (let camera = 0; camera < 100; camera++) {
    mask.spriteFrame = { camera }; mask.width = 80 + camera; mask.alphaThreshold = camera / 100;
    f.api.sync(mask); f.update(mask);
  }
  assert.equal(mask.geometry, 100); assert.equal(mask.materialUpdates, 100); assert.equal(mask.dirty, 100);
  assert.equal(f.calls.length, 4);
  assert.equal(mask._assembler.inverted, false); assert.equal(mask._assembler.image, true);
  assert.equal(mask._assembler.model, false); assert.equal(mask._graphics._assembler.model, false);
  assert.equal(mask.spriteFrame.camera, 99); assert.equal(mask.width, 179); assert.equal(mask.alphaThreshold, .99);
});

test('inversion and mask-type changes immediately publish their different native values', () => {
  const f = fixture(), mask = f.value;
  f.api.sync(mask); f.update(mask); mask.inverted = true; f.update(mask);
  assert.equal(mask._assembler.inverted, true); assert.equal(f.calls.length, 5);
  mask.type = 0; f.update(mask);
  assert.equal(mask._assembler.image, false); assert.equal(mask._assembler.model, true);
  assert.equal(mask._graphics._assembler.model, true); assert.equal(f.calls.length, 8);
  mask.type = 2; f.update(mask); assert.equal(f.calls.length, 11);
});

test('first values always publish and nonboolean or foreign-receiver calls invalidate cached identity', () => {
  const f = fixture(), a = f.value._assembler;
  f.api.sync(f.value); a.setUseModel(false); a.setUseModel(false); assert.equal(f.calls.length, 1);
  a.setUseModel(1); a.setUseModel(false); assert.equal(f.calls.length, 3); assert.equal(a.model, false);
  const other = {}; a.setUseModel.call(other, true); assert.equal(other.model, true);
  a.setUseModel(false); assert.equal(f.calls.length, 5);
  a.setUseModel(false, 'extra'); a.setUseModel(false); assert.equal(f.calls.length, 7);
});

test('a throwing native setter never makes the next successful write look redundant', () => {
  const f = fixture(), a = f.value._assembler;
  let attempts = 0;
  a.setUseModel = function (value) { if (++attempts === 1) throw Error('native write failed'); this.model = value; };
  f.api.sync(f.value);
  assert.throws(() => a.setUseModel(true), /native write failed/);
  a.setUseModel(true); a.setUseModel(true); assert.equal(attempts, 2);
});

test('pooled assemblers bypass stale ownership and a new generated owner gets a cold cache without wrapper chains', () => {
  const f = fixture(), old = f.value, a = old._assembler;
  f.api.sync(old); a.setUseModel(false); a.setUseModel(false);
  const next = f.mask(); next._assembler = a; a._renderComp = next;
  a.setUseModel(true); a.setUseModel(true); assert.equal(f.calls.length, 3);
  f.api.sync(next); a.setUseModel(false); a.setUseModel(false); assert.equal(f.calls.length, 4);
  // The previous component may still hold its old assembler field until deferred
  // destruction. It cannot remove the new component's instance wrapper.
  f.api.sync(old); a.setUseModel(false); assert.equal(f.calls.length, 4);
  f.api.dispose(old); a.setUseModel(false); assert.equal(f.calls.length, 4);
  f.api.dispose(next); assert.equal(Object.hasOwn(a, 'setUseModel'), false);
});

test('replacing mask and Graphics assemblers restores and releases retired instance methods immediately', () => {
  const f = fixture(), mask = f.value;
  f.api.sync(mask); f.update(mask);
  for (let replacement = 0; replacement < 200; replacement++) {
    const a = mask._assembler, graphics = mask._graphics._assembler;
    mask._assembler = f.assembler(mask);
    mask._graphics = {}; mask._graphics._assembler = f.assembler(mask._graphics);
    f.api.sync(mask); f.update(mask);
    for (const key of ['setMaskInverted', 'setUseModel', 'setImageStencil']) assert.equal(Object.hasOwn(a, key), false);
    assert.equal(Object.hasOwn(graphics, 'setUseModel'), false);
  }
  assert.equal(f.calls.length, 804);
  const a = mask._assembler, graphics = mask._graphics._assembler;
  f.api.dispose(mask); f.api.dispose(mask);
  assert.equal(Object.hasOwn(a, 'setUseModel'), false); assert.equal(Object.hasOwn(graphics, 'setUseModel'), false);
});

test('removing private Graphics releases its former assembler without affecting the current mask', () => {
  const f = fixture(), mask = f.value, graphics = mask._graphics._assembler;
  f.api.sync(mask); const method = mask._assembler.setUseModel;
  mask._graphics = null; f.api.sync(mask);
  assert.equal(Object.hasOwn(graphics, 'setUseModel'), false); assert.equal(mask._assembler.setUseModel, method);
  f.api.dispose(mask);
});

test('disabled masks retain correct values, while invalid or unmarked masks release their wrappers', () => {
  const f = fixture(), mask = f.value, a = mask._assembler;
  f.api.sync(mask); f.update(mask); mask.node.activeInHierarchy = false; mask.enabled = false;
  f.api.sync(mask); f.update(mask); assert.equal(f.calls.length, 4);
  mask.node.activeInHierarchy = true; mask.enabled = true; mask.inverted = true;
  f.api.sync(mask); f.update(mask); assert.equal(a.inverted, true); assert.equal(f.calls.length, 5);
  mask.node._occlusionMask = false; f.api.sync(mask); assert.equal(Object.hasOwn(a, 'setUseModel'), false);
  mask.node._occlusionMask = true; f.api.sync(mask); mask.destroyed = true; f.api.sync(mask);
  assert.equal(Object.hasOwn(a, 'setUseModel'), false);
});

test('web, other engine versions, unrelated Mask components and Sprite components retain the engine path', () => {
  for (const options of [{ native: false }, { version: '2.4.12' }, { version: '3.8.0' }]) {
    const f = fixture(options); f.api.sync(f.value);
    for (let i = 0; i < 4; i++) f.update(f.value);
    assert.equal(f.calls.length, 16); assert.equal(Object.hasOwn(f.value._assembler, 'setUseModel'), false);
  }
  const f = fixture(); f.value.node._occlusionMask = false; f.api.sync(f.value);
  assert.equal(Object.hasOwn(f.value._assembler, 'setUseModel'), false);
  const sprite = { node: { _occlusionMask: true } }; sprite._assembler = f.assembler(sprite); f.api.sync(sprite);
  assert.equal(Object.hasOwn(sprite._assembler, 'setUseModel'), false); assert.equal(f.prototype.setUseModel, sprite._assembler.setUseModel);
});

test('locked or accessor native bindings preserve their original descriptors and ordinary rendering', () => {
  const f = fixture(), a = f.value._assembler;
  Object.defineProperty(a, 'setUseModel', { value: f.prototype.setUseModel, writable: false, configurable: false });
  let reads = 0;
  Object.defineProperty(a, 'setImageStencil', { get() { reads++; return f.prototype.setImageStencil; }, configurable: false });
  const before = ['setUseModel', 'setImageStencil'].map(key => Object.getOwnPropertyDescriptor(a, key));
  f.api.sync(f.value); for (let i = 0; i < 4; i++) f.update(f.value); f.api.dispose(f.value);
  assert.equal(f.calls.length, 10); assert(reads >= 4);
  assert.deepEqual(['setUseModel', 'setImageStencil'].map(key => Object.getOwnPropertyDescriptor(a, key)), before);
  assert.equal(Object.hasOwn(a, 'setMaskInverted'), false);
});

test('disposal restores exact own descriptors and does not overwrite concurrent instrumentation', () => {
  const f = fixture(), a = f.value._assembler;
  Object.defineProperty(a, 'setUseModel', { value: f.prototype.setUseModel, writable: true, enumerable: true, configurable: false });
  const before = Object.getOwnPropertyDescriptor(a, 'setUseModel');
  f.api.sync(f.value); f.update(f.value); f.api.dispose(f.value);
  assert.deepEqual(Object.getOwnPropertyDescriptor(a, 'setUseModel'), before);
  f.api.sync(f.value); const memo = a.setImageStencil;
  const observer = a.setImageStencil = function (...args) { return memo.apply(this, args); };
  a.setImageStencil(true); a.setImageStencil(true); const count = f.calls.length;
  f.api.dispose(f.value); assert.equal(a.setImageStencil, observer);
  a.setImageStencil(true); a.setImageStencil(true); assert.equal(f.calls.length, count + 2);
});

test('a runtime compatibility change releases cached wrappers and empty input remains safe', () => {
  const f = fixture(), a = f.value._assembler;
  f.api.sync(f.value); f.cc.sys.isNative = false; f.api.sync(f.value);
  assert.equal(Object.hasOwn(a, 'setUseModel'), false);
  for (const value of [null, undefined, {}, false]) assert.doesNotThrow(() => { f.api.sync(value); f.api.dispose(value); });
});

function captureFixture(grouped = false) {
  const f = fixture();
  const main = {}, branch = { _parent: main }, leaf = { _parent: branch };
  const privateCamera = { _camera: {}, targetTexture: {} };
  const view = { main, camera: privateCamera };
  let current = [], waiting = [], rendering = false;
  const FLAG_UPDATE_RENDER_DATA = 4;
  const Mask = f.cc.Mask;
  f.cc.RenderTexture = class RenderTexture { constructor() { this.packable = false; } };
  Mask.Type = { IMAGE_STENCIL: 2 };
  const RenderFlow = f.cc.RenderFlow = {
    FLAG_UPDATE_RENDER_DATA,
    validateRenderers() {},
    _nativeFlow: { render() {} },
    register(node) {
      if (node._inJsbDirtyList) return;
      node._inJsbDirtyList = true;
      (rendering ? waiting : current).push(node);
    },
    render: function (scene, dt, camera) {
      rendering = true;
      RenderFlow.validateRenderers();
      try {
        for (const node of current) {
          node._inJsbDirtyList = false;
          const assembler = node._renderComponent._assembler;
          if (node.flags & FLAG_UPDATE_RENDER_DATA) {
            node.flags &= ~FLAG_UPDATE_RENDER_DATA;
            assembler._updateRenderData();
          }
        }
        current = [];
        this._nativeFlow.render(scene._proxy, dt, camera);
      } finally {
        current = waiting;
        waiting = [];
        rendering = false;
      }
    }
  };
  f.cc.Assembler = function Assembler() {};
  f.cc.Assembler.prototype = f.prototype;
  f.prototype._updateRenderData = function () {
    const mask = this._renderComp;
    this.updateRenderData(mask);
    mask._vertsDirty = false;
    mask._materials[0].effect._dirty = false;
    mask.node._renderFlag |= FLAG_UPDATE_RENDER_DATA;
  };
  const mask = f.value, node = mask.node;
  Object.assign(mask, { _type: 2, isValid: true, alphaThreshold: .1, _spriteFrame: { _texture: new f.cc.RenderTexture() } });
  mask._materials = [{ effect: { _dirty: false } }];
  mask._assembler._effect = [mask._materials[0].effect];
  mask._clearMaterial = { effect: {} };
  mask._clearGraphics = { _assembler: { _effect: [mask._clearMaterial.effect] } };
  Object.assign(node, { name: 'ForegroundOcclusion', _parent: main, _renderComponent: mask, flags: 0 });
  Object.defineProperty(node, '_renderFlag', {
    get() { return this.flags; },
    set(flags) {
      this.flags = flags;
      if (flags & FLAG_UPDATE_RENDER_DATA) RenderFlow.register(this);
    }
  });
  if (grouped) {
    RenderFlow._hkdMaskQueue = { scope: null, invalidations: [], invalidate(node) { this.invalidations.push(node); } };
    delete mask.inverted;
    Object.setPrototypeOf(node, { _onSetParent() {} });
    Object.defineProperties(Mask.prototype, {
      inverted: { get() { return !!this._inverted; }, set(value) { this._inverted = value; } },
      materials: { get() { return this._materials; }, set(value) { this._materials = value; } }
    });
    Mask.prototype._updateMaterial = function () {};
    Mask.prototype._resetAssembler = function () {};
    Mask.prototype.getMaterial = function (index) { return this._materials[index]; };
    Mask.prototype.getMaterials = function () { return this._materials; };
  }
  f.api.sync(mask);
  node._renderFlag = FLAG_UPDATE_RENDER_DATA;
  return { f, mask, node, view, leaf, RenderFlow, privateCamera,
    capture(root = leaf, camera = privateCamera._camera) { RenderFlow.render(root, 0, camera); } };
}

test('disjoint private capture retains the queued mask until a root that can draw it', () => {
  const g = captureFixture(), { f, mask, node, view, RenderFlow } = g;
  const original = RenderFlow.render;
  const finish = f.api.beginCaptureUpdates(view);
  assert.equal(typeof finish, 'function');
  g.capture(); g.capture();
  assert.equal(mask.geometry, 0);
  assert.equal(node._inJsbDirtyList, true);
  g.capture(node);
  assert.equal(mask.geometry, 1);
  g.capture(); g.capture(view.main);
  assert.equal(mask.geometry, 2);
  g.capture(g.leaf, {});
  assert.equal(mask.geometry, 3);
  finish();
  assert.equal(RenderFlow.render, original);
  g.capture();
  assert.equal(mask.geometry, 4);
});

test('dirty vertices, mask changes, and a moved mask still get their normal preparation', () => {
  const g = captureFixture(), { f, mask, node, view } = g;
  const finish = f.api.beginCaptureUpdates(view);
  g.capture();
  mask.inverted = true;
  g.capture();
  assert.equal(mask._assembler.inverted, true);
  mask.inverted = false;
  mask._vertsDirty = true;
  g.capture();
  assert.equal(mask.geometry, 2);
  assert.equal(mask._assembler.inverted, false);
  mask._materials[0].effect._dirty = true;
  g.capture();
  assert.equal(mask.geometry, 3);
  node._parent = g.leaf;
  g.capture();
  assert.equal(mask.geometry, 4);
  finish();
  f.api.dispose(mask);
  assert.equal(Object.hasOwn(mask._assembler, '_updateRenderData'), false);
});

test('capture errors restore dispatch, and unrecognized render hooks keep stock registration', () => {
  const g = captureFixture(), { f, mask, view, RenderFlow } = g;
  const original = RenderFlow.render;
  const native = RenderFlow._nativeFlow.render;
  const finish = f.api.beginCaptureUpdates(view);
  try {
    RenderFlow._nativeFlow.render = () => { throw new Error('capture failed'); };
    assert.throws(() => g.capture(), /capture failed/);
  } finally {
    finish();
    RenderFlow._nativeFlow.render = native;
  }
  assert.equal(RenderFlow.render, original);
  RenderFlow.render = function (...args) { return original.apply(this, args); };
  assert.equal(f.api.beginCaptureUpdates(view), null);
  g.capture();
  assert.equal(mask.geometry, 1);
});

test('the verified adapter receives only disjoint capture scopes and a mask-specific eligibility check', () => {
  const g = captureFixture(true), { f, mask, leaf, view, RenderFlow } = g;
  const queue = RenderFlow._hkdMaskQueue, canCarry = mask._assembler._updateRenderData._hkdCarryDirtyMask;
  assert.equal(typeof canCarry, 'function');
  const received = [];
  RenderFlow._nativeFlow.render = () => received.push([queue.scope && queue.scope.branch, canCarry()]);
  const finish = f.api.beginCaptureUpdates(view);
  g.capture();
  g.capture(view.main);
  g.capture(leaf, {});
  assert.deepEqual(received, [[leaf._parent, true], [null, false], [null, false]]);
  assert.equal(queue.scope, null);
  RenderFlow._nativeFlow.render = () => { throw Error('render failed'); };
  assert.throws(() => g.capture(), /render failed/);
  assert.equal(queue.scope, null);
  finish();
});

test('only the owned targetless actor route carries masks without a physical target', () => {
  const g = captureFixture(true), { f, leaf, view, RenderFlow, privateCamera } = g;
  const original = RenderFlow.render;
  const renderCamera = RenderFlow.renderCamera = (camera, root) => RenderFlow.render(root, 0, camera);
  const adapter = RenderFlow._hkdTargetlessAdapter = {
    ownsRoute(render, camera) { return render === original && camera === renderCamera; }
  };
  const queue = RenderFlow._hkdMaskQueue, branches = [];
  RenderFlow._nativeFlow.render = () => branches.push(queue.scope && queue.scope.branch);
  const finish = f.api.beginCaptureUpdates(view);
  privateCamera.targetTexture = null;
  assert.equal(f.api.ownsTargetlessRoute(view), true);
  assert.equal(f.api.ownsTargetlessRoute({ ...view }), false);
  g.capture();
  RenderFlow._hkdTargetlessRequest = { root: leaf, camera: privateCamera, view };
  g.capture();
  g.capture(view.main);
  g.capture(leaf, {});
  RenderFlow._hkdTargetlessAdapter = { ...adapter };
  assert.equal(f.api.ownsTargetlessRoute(view), false);
  g.capture();
  RenderFlow._hkdTargetlessAdapter = adapter;
  RenderFlow.renderCamera = () => {};
  assert.equal(f.api.ownsTargetlessRoute(view), false);
  RenderFlow.renderCamera = renderCamera;
  assert.deepEqual(branches, [null, leaf._parent, null, null, null]);
  assert.equal(queue.scope, null);
  finish();
  assert.equal(RenderFlow.render, original);
  assert.equal(f.api.ownsTargetlessRoute(view), false);
});

test('mask mutations invalidate clean groups and exposed material uses individual dispatch', () => {
  const g = captureFixture(true), { f, mask, node, view, RenderFlow } = g;
  const queue = RenderFlow._hkdMaskQueue, canCarry = mask._assembler._updateRenderData._hkdCarryDirtyMask;
  const checks = [];
  RenderFlow._nativeFlow.render = () => checks.push(canCarry());
  const finish = f.api.beginCaptureUpdates(view);
  g.capture();
  mask.inverted = true;
  mask._updateMaterial();
  mask._resetAssembler();
  mask.inverted = false;
  node._onSetParent(view.main);
  g.capture();
  assert.deepEqual(queue.invalidations, [node, node, node, node, node]);
  assert.equal(mask.getMaterial(0), mask._materials[0]);
  g.capture();
  assert.deepEqual(checks, [true, true, false]);
  finish();
  f.api.dispose(mask);
  assert.deepEqual(queue.invalidations, [node, node, node, node, node, node, node]);
  assert.equal(Object.hasOwn(mask, 'inverted'), false);
  assert.equal(Object.hasOwn(mask, 'materials'), false);
  assert.equal(Object.hasOwn(mask, 'getMaterial'), false);
  assert.equal(Object.hasOwn(node, '_onSetParent'), false);
});
