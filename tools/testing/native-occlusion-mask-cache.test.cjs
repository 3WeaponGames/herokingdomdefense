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
      this.geometry = this.materials = this.dirty = 0;
      this._graphics = {};
    }
  }
  const prototype = {
    setMaskInverted(value) { calls.push(['inverted', value]); this.inverted = !!value; },
    setUseModel(value) { calls.push(['model', value]); this.model = !!value; },
    setImageStencil(value) { calls.push(['image', value]); this.image = !!value; },
    updateRenderData(mask) {
      mask.geometry++; mask.materials++;
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
  assert.equal(mask.geometry, 100); assert.equal(mask.materials, 100); assert.equal(mask.dirty, 100);
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
