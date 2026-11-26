'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const depth = fs.readFileSync(path.resolve(__dirname, '../../assets/_script/KinghtFallDepthView.js'), 'utf8');
const helper = depth.slice(depth.indexOf('var foregroundStencilHost;'), depth.indexOf('function DepthView(game)'));

function fixture() {
  class NodeProxy {
    constructor(owner) { this._owner = owner; }
  }
  class Node {
    constructor(parent) {
      this.parent = parent;
      this.children = [];
      this._proxy = new NodeProxy(this);
      Object.assign(this, { activeInHierarchy: true, anchorX: .5, anchorY: .5, scaleX: 1, scaleY: 1, width: 48, height: 64 });
      if (parent) parent.children.push(this);
    }
  }
  class Mask { constructor(node) { this.node = node; this.enabled = true; this.type = Mask.Type.IMAGE_STENCIL; } }
  Mask.Type = { IMAGE_STENCIL: 2 };
  class Sprite { constructor(node) { this.node = node; this.enabled = true; } }
  const calls = [], captureOwners = new WeakMap(), directorEvents = new Map();
  let scene = new Node(), totalFrames = 15, armed = false, onRender;
  class RenderFlow {
    render(proxy, dt, camera) {
      calls.push(['render', proxy, dt, camera, armed]);
      if (onRender) onRender();
      return dt;
    }
  }
  const renderer = {
    NodeProxy, RenderFlow,
    _hkdForegroundStencilBegin() { calls.push(['begin']); armed = true; return true; },
    _hkdForegroundStencilTag(proxy, source) { calls.push(['tag', proxy, source, armed]); return true; },
    _hkdForegroundStencilEnd() { calls.push(['end']); armed = false; return true; }
  };
  const flow = new RenderFlow(), originalRender = flow.render;
  const renderFlow = {
    _nativeFlow: flow,
    render(root, dt, camera) { return flow.render(root._proxy, dt, camera === undefined ? null : camera); }
  };
  const cc = {
    ENGINE_VERSION: '2.4.13', Node, Mask, Sprite,
    sys: { isNative: true, os: 'Windows', OS_WINDOWS: 'Windows' },
    RenderFlow: renderFlow, renderer: { _flow: renderFlow },
    Director: { EVENT_BEFORE_SCENE_LAUNCH: 'scene' },
    isValid: value => !!value && !value.destroyed,
    director: {
      getScene: () => scene, getTotalFrames: () => totalFrames,
      on: (event, callback) => directorEvents.set(event, callback)
    }
  };
  const api = vm.runInNewContext(`${helper}\n({foregroundStencilSupport, NativeForegroundStencil})`, { renderer, cc, captureOwners });
  const main = new Node(scene), game = { ndMain: main, gameData: {}, _combatEpoch: 1 };
  const view = game._depthView = { main, game, captureSupported: true };
  let batch;
  function object() { return { node: new Node(main), frame: {}, center: { x: 0, y: 0 }, size: { width: 48, height: 64 } }; }
  function record(source) {
    const root = new Node(main), child = new Node(root);
    root._occlusionMask = true;
    const mask = root._renderComponent = new Mask(root), sprite = child._renderComponent = new Sprite(child);
    mask.spriteFrame = source.frame;
    captureOwners.set(mask, source);
    return { foreground: { node: root, mask }, node: child, sprite };
  }
  function prepare(groups, completed = true) {
    batch ||= new api.NativeForegroundStencil(view, api.foregroundStencilSupport());
    batch.clear();
    batch.begin();
    groups.forEach(({ records, source }, index) => records.forEach(item => batch.entries.push(item, source, source.frame, index + 1)));
    batch.finish(completed);
    return batch;
  }
  function mainRender(dt = .02) { return renderFlow.render(scene, dt); }
  return {
    api, cc, renderer, view, flow, originalRender, calls, object, record, prepare, mainRender,
    manualRender: camera => renderFlow.render(scene, 0, camera),
    setRender: callback => { onRender = callback; },
    nextFrame: () => { totalFrames++; },
    launchScene: () => { directorEvents.get('scene')(); scene = new Node(); }
  };
}

test('unsupported builds and empty foreground sets leave the native render method untouched', () => {
  const f = fixture();
  f.cc.sys.os = 'Android';
  assert.equal(f.api.foregroundStencilSupport(), null);
  f.cc.sys.os = 'Windows';
  const begin = f.renderer._hkdForegroundStencilBegin;
  f.renderer._hkdForegroundStencilBegin = undefined;
  assert.equal(f.api.foregroundStencilSupport(), null);
  f.renderer._hkdForegroundStencilBegin = begin;
  f.prepare([]);
  assert.equal(f.flow.render, f.originalRender);
  assert.equal(f.mainRender(), .02);
  assert.deepEqual(f.calls.map(call => call[0]), ['render']);
});

test('only the owned main flow consumes grouped tags and scopes them to one draw', () => {
  const f = fixture(), one = f.object(), two = f.object();
  const records = [f.record(one), f.record(one), f.record(two), f.record(two)];
  f.prepare([{ source: one, records: records.slice(0, 2) }, { source: two, records: records.slice(2) }]);
  f.manualRender({});
  assert.equal(f.mainRender(), .02);
  f.mainRender();
  assert.deepEqual(f.calls.map(call => call[0]), ['render', 'begin', 'tag', 'tag', 'tag', 'tag', 'render', 'end', 'render']);
  assert.deepEqual(f.calls.filter(call => call[0] === 'tag'), records.map((item, index) => ['tag', item.foreground.node._proxy, index < 2 ? 1 : 2, true]));
  assert.deepEqual(f.calls.filter(call => call[0] === 'render').map(call => call[4]), [false, true, false]);
  const wrapper = f.flow.render;
  f.prepare([]);
  assert.equal(f.flow.render, wrapper);
});

test('stale and non-stock ownership, pinning, or frame changes leave a singleton on the stock path', () => {
  for (const change of [
    (second) => { second.foreground.node.scaleX = 2; },
    (second) => { second.foreground.node.activeInHierarchy = false; },
    (second) => { second.foreground.mask.inverted = true; },
    (second) => { second.foreground.node.children.push({}); },
    (second) => { second.foreground.node._proxy._owner = {}; },
    (second) => { second.sprite.destroyed = true; },
    (second) => { second.foreground.mask.spriteFrame = {}; },
    (_second, source) => { source.frame = {}; },
    (_second, source) => { source.node.destroyed = true; }
  ]) {
    const f = fixture(), source = f.object(), second = f.record(source);
    f.prepare([{ source, records: [f.record(source), second] }]);
    change(second, source);
    f.mainRender();
    assert.deepEqual(f.calls.map(call => call[0]), ['render']);
  }
});

test('aborted updates and expired scene or battle leases never arm the renderer', () => {
  for (const invalidate of [f => f.nextFrame(), f => f.launchScene(), f => { f.view.game._combatEpoch++; },
    f => { f.view.game._depthView = {}; }, f => { f.cc.RenderFlow.render = () => {}; }]) {
    const f = fixture(), source = f.object();
    const groups = [{ source, records: [f.record(source), f.record(source)] }];
    const batch = f.prepare(groups, false);
    assert.equal(batch.entries.length, 0);
    f.prepare(groups);
    invalidate(f);
    f.flow.render(f.view.main._proxy, .02, null);
    if (f.cc.RenderFlow.render.length) f.mainRender();
    assert(f.calls.every(call => call[0] === 'render' && call[4] === false));
  }
});

test('throw and nested native camera rendering both close the armed scope exactly once', () => {
  for (const action of ['throw', 'camera', 'main']) {
    const f = fixture(), source = f.object();
    const batch = f.prepare([{ source, records: [f.record(source), f.record(source)] }]);
    const expected = new Error('draw error');
    f.setRender(() => {
      f.setRender(null);
      if (action === 'throw') throw expected;
      if (action === 'camera') f.manualRender({});
      else f.mainRender();
    });
    if (action === 'throw') assert.throws(() => f.mainRender(), error => error === expected);
    else assert.equal(f.mainRender(), .02);
    assert.deepEqual(f.calls.map(call => call[0]), action === 'throw' ?
      ['begin', 'tag', 'tag', 'render', 'end'] : ['begin', 'tag', 'tag', 'render', 'end', 'render']);
    assert.equal(batch.entries.length, 0);
    f.mainRender();
    assert.equal(f.calls.at(-1)[4], false);
  }
});
