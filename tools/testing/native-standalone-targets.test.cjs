'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../assets/_script/KinghtFallDepthView.js'), 'utf8');
const box = { minX: 0, minY: 0, maxX: 70, maxY: 70 };

function fixture() {
  let scene = {}, anyReset = true, paint = true;
  const draws = [];

  class RenderTexture {
    initWithSize(width, height) {
      Object.assign(this, { width, height, pixel: 0, destroys: 0, _texture: {}, _depthStencilBuffer: {} });
      this._framebuffer = { owner: this };
    }
    destroy() { this.destroys++; }
  }
  class SpriteFrame {
    constructor(texture) { this.texture = texture; this.destroys = 0; }
    getTexture() { return this.texture; }
    setFlipY(value) { this.flipY = value; }
    destroy() { this.destroys++; }
  }
  const cc = {
    ENGINE_VERSION: '2.4.13', sys: { isNative: true }, game: { _renderContext: {} },
    director: { getScene: () => scene }, gfx: { RB_FMT_S8: 1 },
    isValid: value => value && !value.destroys, RenderTexture, SpriteFrame
  };
  const spine = {
    _hkdResetStandaloneTarget(framebuffer) {
      if (!anyReset) return false;
      framebuffer.owner.pixel = 0;
      return true;
    }
  };
  const context = { cc, sp: {}, spine, exports: {} };
  vm.runInNewContext(source, context);
  const view = Object.assign(Object.create(context.exports.DepthView.prototype), {
    nativeCapture: true, camera: {}, _nativeActorAtlas: {}, game: { gameData: {}, _combatEpoch: 1 },
    renderNative(sources, center, height, texture) {
      draws.push({ texture, input: texture.pixel });
      if (paint) texture.pixel = 127;
    }
  });
  const snapshot = (record, bounds = box) => view.snapshotActor(record, [], bounds);
  const park = record => view.parkStandaloneTarget(record, view._nativeActorAtlas);
  return { view, draws, snapshot, park, cc, spine, context,
    newScene() { scene = {}; }, rejectReset() { anyReset = false; }, skipPaint() { paint = false; } };
}

test('standalone target gets cleared before the original capture and receives a fresh frame', () => {
  const f = fixture(), record = {};
  f.snapshot(record);
  const texture = record.texture, frame = record.frame;
  const consumer = { spriteFrame: frame };
  record.consumers = new Set([consumer]);
  f.context.captureOwners.set(consumer, record);

  assert.equal(f.park(record), true);
  assert.equal(consumer.spriteFrame, null);
  assert.equal(f.context.captureOwners.has(consumer), false);
  assert.equal(frame.destroys, 1);
  assert.equal(texture.destroys, 0);

  // A camera interrupted before painting must leave a transparent target.
  f.skipPaint();
  f.snapshot(record);
  assert.equal(record.texture, texture);
  assert.notEqual(record.frame, frame);
  assert.equal(record.frame.flipY, true);
  assert.equal(record.texture.pixel, 0);
  assert.deepEqual(f.draws.map(row => row.input), [0, 0]);
});

test('unavailable or resized content falls back to a fresh allocation', () => {
  for (const changed of ['reset', 'dimensions', 'sampler', 'binding', 'scene']) {
    const f = fixture(), record = {};
    f.snapshot(record);
    const old = record.texture;
    assert.equal(f.park(record), true);
    if (changed === 'reset') f.rejectReset();
    if (changed === 'sampler') old._minFilter = 'nearest';
    if (changed === 'binding') delete f.spine._hkdResetStandaloneTarget;
    if (changed === 'scene') f.newScene();
    f.snapshot(record, changed === 'dimensions' ? { ...box, maxX: 105 } : box);
    assert.notEqual(record.texture, old, changed);
    assert.equal(old.destroys, 1, changed);
    assert.equal(f.draws.length, 2, changed);
  }
});

test('detachment preserves a replacement installed during the callback', () => {
  const f = fixture(), record = {};
  f.snapshot(record);
  const oldFrame = record.frame, oldTexture = record.texture, replacement = new f.cc.RenderTexture();
  replacement.initWithSize(96, 96);
  const replacementFrame = new f.cc.SpriteFrame(replacement);
  const consumer = {
    get spriteFrame() { return record.frame; },
    set spriteFrame(value) {
      assert.equal(value, null);
      record.frame = replacementFrame;
      record.texture = replacement;
      f.context.captureOwners.set(consumer, record);
    }
  };
  record.consumers = new Set([consumer]);
  f.context.captureOwners.set(consumer, record);

  assert.equal(f.park(record), null);
  assert.equal(record.frame, replacementFrame);
  assert.equal(record.texture, replacement);
  assert.equal(f.context.captureOwners.get(consumer), record);
  assert.equal(oldFrame.destroys, 1);
  assert.equal(oldTexture.destroys, 1);
  assert.equal(replacement.destroys, 0);
  assert.equal(f.view._standaloneTargets.parked.size, 0);
});

test('idle target budget evicts the oldest target and tears down on scene change', () => {
  const f = fixture(), old = [], large = { ...box, maxX: 575, maxY: 575 };
  for (let i = 0; i < 6; i++) {
    const record = {};
    f.snapshot(record, large);
    old.push(record.texture);
    assert.equal(f.park(record), true);
  }
  const state = f.view._standaloneTargets;
  assert.equal(state.parked.size, 4);
  assert.equal(state.bytes, 8 * 1024 * 1024);
  assert.deepEqual(old.map(texture => texture.destroys), [1, 1, 0, 0, 0, 0]);

  f.newScene();
  f.snapshot({});
  assert.equal(state.finished, true);
  assert.equal(state.bytes, 0);
  assert.equal(state.parked.size, 0);
  assert.deepEqual(old.map(texture => texture.destroys), [1, 1, 1, 1, 1, 1]);
});
