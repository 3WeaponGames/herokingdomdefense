'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const scripts = path.resolve(__dirname, '../../assets/_script');

function load(script, bindings, exposed = '') {
  const context = { exports: {}, ...bindings };
  vm.runInNewContext(fs.readFileSync(path.join(scripts, script), 'utf8') + exposed, context);
  return context.exports;
}

function mockSceneryCoverage() {
  class Sprite {
    constructor() {
      this.enabled = true;
      this.node = { activeInHierarchy: true };
    }
  }
  class RenderTexture {
    constructor() {
      Object.assign(this, {
        width: 64, height: 64, packable: false, _wrapS: 2, _wrapT: 2,
        _minFilter: 1, _magFilter: 1, _framebuffer: {}, _texture: {}
      });
    }
    readPixels() { throw new Error('The JS framebuffer API cannot restore native-owned bindings'); }
  }
  class SpriteFrame {}
  let generation = 23;
  let readCount = 0;
  let flushCount = 0;
  const targets = new Map();
  const cc = {
    Sprite, SpriteFrame, RenderTexture, isValid: () => true,
    Texture2D: { Filter: { LINEAR: 1, NEAREST: 0 }, WrapMode: { CLAMP_TO_EDGE: 2 } },
    game: { _renderContext: {
      FRAMEBUFFER_BINDING: 0x8ca6,
      getParameter(key) { assert.equal(key, 0x8ca6); flushCount++; }
    } }
  };
  const spine = {
    _hkdReadSceneryAlpha(framebuffer, storage, rgba) {
      if (arguments.length === 0) return generation;
      assert.equal(storage, targets.get(framebuffer));
      rgba.fill(0);
      rgba[(32 * 64 + 32) * 4 + 3] = 255;
      readCount++;
      return generation;
    }
  };
  const coverage = load('NativeSceneryMaskCoverage.js', { cc, spine });
  function scenery() {
    const texture = new RenderTexture();
    targets.set(texture._framebuffer, texture._texture);
    return {
      texture, signature: [], center: { x: 0, y: 0 }, size: { width: 64, height: 64 },
      sources: [new Sprite()],
      frame: Object.assign(new SpriteFrame(), {
        _texture: texture, _flipY: true, _rect: { x: 0, y: 0, width: 64, height: 64 },
        _originalSize: { width: 64, height: 64 }, _offset: { x: 0, y: 0 },
        uv: [0, 0, 1, 0, 0, 1, 1, 1]
      })
    };
  }
  return {
    coverage, scenery,
    advanceGeneration() { generation++; },
    get reads() { return readCount; },
    get flushes() { return flushCount; }
  };
}

test('scenery alpha receipts use the native readback and expire when its generation changes', () => {
  const fixture = mockSceneryCoverage();
  const { coverage, scenery } = fixture;
  const object = scenery(), texture = object.texture;
  const view = {};
  const first = coverage.readAlpha(view, object, {});
  assert(first);
  assert.equal(coverage.isCurrent(first, object), true);
  assert.equal(coverage.readAlpha(view, object, {}), first);
  assert.equal(coverage.isEmpty(first, object, { x: 0, y: 0 }, { width: 1, height: 1 }), false);
  assert.equal(coverage.isEmpty(first, object, { x: 22, y: 22 }, { width: 1, height: 1 }), true);
  fixture.advanceGeneration();
  assert.equal(coverage.isCurrent(first, object), false);
  assert.equal(coverage.readAlpha(view, object, { read: true }), null);
  const next = coverage.readAlpha(view, object, {});
  assert.notEqual(next, first);
  assert.equal(coverage.isCurrent(next, object), true);
  object.frame._flipY = false;
  assert.equal(coverage.isCurrent(next, object), false);
  object.frame._flipY = true;
  texture.width = object.frame._rect.width = object.frame._originalSize.width = 32;
  assert.equal(coverage.isCurrent(next, object), false);
  assert.equal(fixture.reads, 2);
  assert.equal(fixture.flushes, 2);
});

test('crowded scenery reuses its active alpha receipts and eventually replaces idle ones', () => {
  const fixture = mockSceneryCoverage();
  const { coverage, scenery } = fixture;
  const view = {}, objects = Array.from({ length: 7 }, scenery);
  for (let frame = 0; frame < 60; frame++) {
    const draw = {};
    for (const object of objects) coverage.readAlpha(view, object, draw);
  }
  assert.equal(fixture.reads, 6);

  const newlyVisible = objects[6];
  for (let frame = 0; frame < 60; frame++) coverage.readAlpha(view, newlyVisible, {});
  assert.equal(fixture.reads, 7);
  assert(coverage.isCurrent(coverage.readAlpha(view, newlyVisible, {}), newlyVisible));
});

test('an owned inactive foreground mask remains eligible after Creator clears its renderer links', () => {
  class Node {
    constructor() {
      Object.assign(this, { activeInHierarchy: true, x: 0, y: 0, angle: 0,
        scaleX: 1, scaleY: 1, anchorX: .5, anchorY: .5, children: [] });
    }
  }
  class Sprite { constructor() { this.type = 1; this.trim = true; } }
  class Mask { constructor() { this._type = 2; this.inverted = false; this.alphaThreshold = .1; } }
  Sprite.Type = { SIMPLE: 1 };
  Mask.Type = { IMAGE_STENCIL: 2 };
  const cc = { Node, Sprite, Mask };
  const coverage = load('NativeSceneryMaskCoverage.js', { cc });
  const { isStockForegroundMask, suppressedForegroundMasks } = load('KinghtFallDepthView.js', { cc, sp: {} },
    '\nexports.isStockForegroundMask = isStockForegroundMask;\nexports.suppressedForegroundMasks = suppressedForegroundMasks;');
  const view = { main: new Node() };
  const root = new Node(), node = new Node(), stencil = new Mask(), sprite = new Sprite();
  root.parent = view.main;
  node.parent = root;
  root.children.push(node);
  root._components = [stencil];
  node._components = [sprite];
  root._renderComponent = stencil;
  node._renderComponent = sprite;
  const mask = { node, sprite, foreground: { node: root, mask: stencil } };
  assert.equal(isStockForegroundMask(view, mask, coverage), true);

  suppressedForegroundMasks.set(node, mask);
  root.activeInHierarchy = node.activeInHierarchy = false;
  root._renderComponent = node._renderComponent = null;
  assert.equal(isStockForegroundMask(view, mask, coverage), true);
  assert.equal(isStockForegroundMask(view, { ...mask }, coverage), false);
  root._components.push(new Mask());
  assert.equal(isStockForegroundMask(view, mask, coverage), false);
});
