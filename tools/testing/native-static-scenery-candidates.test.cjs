'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../assets/_script/NativeStaticSceneryCandidates.js'), 'utf8');
const load = new Function('cc', 'exports', source + '\nreturn exports;');

function fixture(options = {}) {
  class Node {
    constructor() {
      this._trs = new Float32Array(10);
      this._worldMatDirty = false;
      this._worldMatrix = { m: new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]) };
      this._contentSize = {};
      this._anchorPoint = {};
      this._components = [];
      this._children = [];
    }
    get children() { return this._children; }
    get activeInHierarchy() { return true; }
    get parent() { return this._parent; }
    get y() { return this._y; }
    set y(value) { this._y = value; }
    getWorldMatrix() {}
    _updateWorldMatrix() {}
  }
  class Scene extends Node {}
  class Sprite {
    constructor(node) { this.node = node; }
    get enabled() { return true; }
    get trim() { return true; }
  }
  class Terrain {
    constructor(node, artwork, ground) {
      this.node = node; this.artwork = artwork; this.ground = ground; this.objectLayerOrder = 0;
    }
  }

  const calls = [], activeTickets = new Map(), released = [];
  const api = {
    version: options.version ?? 1,
    track(members, ancestors) {
      assert(ancestors.every(node => members.includes(node)));
      const ticket = { value: 0 };
      members.forEach(member => activeTickets.set(member, ticket));
      return ticket;
    },
    mark(member) { const owner = activeTickets.get(member); if (owner) owner.value++; },
    release(ticket, members) {
      released.push(ticket);
      members.forEach(member => { if (activeTickets.get(member) === ticket) activeTickets.delete(member); });
    }
  };

  function addChild(parent) {
    const child = new Node();
    parent._children.push(child);
    child._parent = parent;
    return child;
  }

  let scene = new Scene();
  const main = addChild(scene);
  const cc = {
    Node, Scene, Sprite, ENGINE_VERSION: '2.4.13',
    sys: { isNative: options.isNative ?? true, os: 'Windows', OS_WINDOWS: 'Windows' },
    director: { getScene: () => scene },
    js: { _getClassById: id => id.startsWith('483a8') ? Terrain : null }
  };
  if (!options.missingBridge) cc._hkdTerrainGeometry = api;
  const shapes = new WeakMap();
  function object(id, minX, staticType = true) {
    const root = addChild(main), artwork = addChild(root), ground = addChild(root), sprite = new Sprite(artwork);
    root._depthMapObject = staticType;
    root._depthGround = ground;
    if (staticType) root._components.push(new Terrain(root, artwork, ground));
    artwork._components.push(sprite);
    ground.y = id + 1;
    shapes.set(root, { stamps: [[sprite]] });
    return { id, node:root, sources:[sprite], box: rect(minX) };
  }
  function rect(minX) { return {minX, minY: 0, maxX: minX + 20, maxY: 100}; }
  const objects = [object(0, 600), object(1, 0), object(2, 8, false), object(3, 8), object(4, 70)];
  const view = { main, game: { gameData: {}, _combatEpoch: 1 }, objects, _sceneryShapes: shapes,
    _staticOcclusionBounds: new WeakMap() };
  const visible = {minX: -60, minY: -60, maxX: 70, maxY: 300};
  function overlaps(a, b) {
    return a.minY < b.maxY && a.maxY > b.minY && a.minX < b.maxX && a.maxX > b.minX;
  }
  function stock(view, object, cache, viewport, retained) {
    calls.push(object.id);
    if (f.onStock) f.onStock(object);
    const renderer = object.sources[0], box = cache.bounds.get(renderer) || object.box;
    cache.bounds.set(renderer, box);
    if (retained) retained.box = box;
    const words = renderer.node._worldMatrix.m;
    view._staticOcclusionBounds.set(renderer, {box, stamp: [
      0,0,20,100, words[0],words[1],words[4],words[5],words[12],words[13], 1,0,0,1,0,0
    ]});
    if (viewport && !overlaps(box, viewport)) return null;
    return { object, box, ground: object.node._depthGround.y, hidden: [] };
  }
  const {create} = load(cc, {});
  const controller = create(view, stock, node => ({ y: node.y }), overlaps, options.seedGroundReader);
  if (controller && !options.includeFirstDraw) {
    assert.equal(controller.collect({bounds: new Map()}, visible, [], new Map()), false);
  }
  function draw(bounds = new Map(), viewport = visible) {
    const cache = { bounds }, candidates = [], byObject = new Map();
    const handled = controller && controller.collect(cache, viewport, candidates, byObject);
    if (!handled) view.objects.forEach(object => {
      const candidate = stock(view, object, cache, viewport);
      if (candidate) { candidates.push(candidate); byObject.set(candidate.object, candidate); }
    });
    assert.deepEqual([...byObject.values()], candidates);
    return { handled, candidates, ids: candidates.map(value => value.object.id), calls: calls.splice(0) };
  }
  const f = {cc, api, controller, objects, view, draw, released, rect, activeTickets, changeScene: () => { scene = new Scene(); }};
  return f;
}

test('unsupported or missing bridge leaves stock candidate scan active', () => {
  for (const options of [{ missingBridge: true }, { version: 2 }, { isNative: false }]) {
    const f = fixture(options);
    assert.equal(f.controller, null);
    assert.deepEqual(f.draw().calls, [0, 1, 2, 3, 4]);
  }
});

test('the first draw uses the original scan and the second draw can seed', () => {
  const f = fixture({includeFirstDraw: true});
  const first = f.draw();
  assert.equal(first.handled, false);
  assert.deepEqual(first.calls, [0, 1, 2, 3, 4]);
  assert.equal(f.activeTickets.size, 0);

  const seeded = f.draw();
  assert.equal(seeded.handled, true);
  assert.deepEqual(seeded.candidates, first.candidates);
  assert(f.activeTickets.size > 0);
  assert.deepEqual(f.draw().calls, [2]);
});

test('seed publishes original rows and warm scan preserves strict overlaps, order and empty per-draw hidden lists', () => {
  const f = fixture();
  const cold = f.draw();
  assert(cold.handled);
  assert.deepEqual(cold.calls, [0, 1, 2, 3, 4]);
  assert.deepEqual(cold.ids, [1, 2, 3]);
  const warm = f.draw();
  assert(warm.handled);
  assert.deepEqual(warm.ids, cold.ids);
  assert.deepEqual(warm.candidates, cold.candidates);
  assert.deepEqual(warm.calls, [2]);
  warm.candidates[0].hidden.push('actor');
  assert.deepEqual(f.draw().candidates, cold.candidates);

  const fromNewViewport = f.draw(undefined, {minX: 599, minY: 0, maxX: 710, maxY: 101});
  assert.deepEqual(fromNewViewport.ids, [0]);
  assert.equal(fromNewViewport.candidates[0].ground, 1);
});

test('painter-only enrollment retains static geometry and skips dynamic candidates', () => {
  const f = fixture();
  const enrolled = [];
  f.onStock = object => enrolled.push(object.id);
  f.controller.preparePainter({ bounds: new Map() });
  assert.deepEqual(enrolled, [0, 1, 3, 4]);
  assert(f.controller.painter()(f.objects[1].node));
  assert(f.controller.painter()(f.objects[3].node));
  assert.equal(f.controller.painter()(f.objects[2].node), null);
  f.controller.preparePainter({ bounds: new Map() });
  assert.deepEqual(enrolled, [0, 1, 3, 4]);
  assert.deepEqual(f.draw().ids, [1, 2, 3]);
});

test('cold seed reads only culled anchors after the original candidate callbacks', () => {
  const events = [];
  const f = fixture({seedGroundReader(main) {
    assert.equal(main, f.view.main);
    return (ground, owner) => {
      assert.equal(ground.parent, owner);
      events.push(['ground', ground.y]);
      return ground.y;
    };
  }});
  f.onStock = object => {
    events.push(['stock', object.id]);
    if (object.id === 4) f.objects[0].node._depthGround.y = 12;
  };
  assert.deepEqual(f.draw().ids, [1, 2, 3]);
  assert.deepEqual(events, [['stock', 0], ['stock', 1], ['stock', 2], ['stock', 3], ['stock', 4],
    ['ground', 12], ['ground', 5]]);
  const warm = f.draw(undefined, {minX: 599, minY: 0, maxX: 710, maxY: 101});
  assert.equal(warm.candidates[0].ground, 12);
  assert.deepEqual(events.at(-1), ['stock', 2]);
});

test('a stock callback replacing a public geometry reader leaves the cold ground sweep on the original path', () => {
  const f = fixture({seedGroundReader() { assert.fail('Modified public reader reached the shortcut'); }});
  f.onStock = object => {
    if (object.id === 4) f.cc.Node.prototype.getWorldMatrix = function () {};
  };
  assert.deepEqual(f.draw().ids, [1, 2, 3]);
  assert.deepEqual(f.draw(undefined, {minX: 599, minY: 0, maxX: 710, maxY: 101}).ids, [0]);
});

test('stock callback invalidates a later cached row and resumes once in original order', () => {
  const f = fixture();
  f.draw();
  f.onStock = object => {
    if (object.id !== 2) return;
    f.objects[4].box = f.rect(20);
    f.api.mark(f.objects[4].node);
  };
  const result = f.draw();
  assert(result.handled);
  assert.deepEqual(result.ids, [1, 2, 3, 4]);
  assert.deepEqual(result.calls, [2, 3, 4]);
  assert.equal(f.released.length, 1);
});

test('pre-frame mutation, scene change, and disposal revoke the active lease', () => {
  for (const revoke of [f => f.api.mark(f.objects[3].node), f => f.changeScene(), f => f.controller.dispose()]) {
    const f = fixture();
    f.draw();
    assert(f.activeTickets.size > 0);
    revoke(f);
    f.objects[3].box = f.rect(800);
    const report = f.draw();
    assert.equal(report.handled, false);
    assert.deepEqual(report.ids, [1, 2]);
    assert.deepEqual(report.calls, [0, 1, 2, 3, 4]);
    assert.equal(f.activeTickets.size, 0);
    f.controller.dispose();
    assert.equal(f.released.length, 1);
  }
});

test('shared renderers and own overrides stay stock, and a changed prototype drops the lease', () => {
  const f = fixture();
  f.objects[0].sources = [f.objects[1].sources[0]];
  Object.defineProperty(f.objects[3].sources[0], 'trim', { get: () => true });
  f.draw();
  assert.deepEqual(f.draw().calls, [0, 1, 2, 3]);
  Object.defineProperty(f.cc.Node.prototype, 'width', { get: () => 20 });
  assert.deepEqual(f.draw().calls, [0, 1, 2, 3, 4]);
  assert.equal(f.released.length, 1);
});

test('an existing same-draw strict value sends that original suffix through stock', () => {
  const f = fixture();
  f.draw();
  const drawBounds = new Map([[f.objects[3].sources[0], f.rect(800)]]);
  const result = f.draw(drawBounds);
  assert.deepEqual(result.ids, [1, 2]);
  assert.deepEqual(result.calls, [2, 3, 4]);
  assert.equal(f.released.length, 1);
});

test('nested collection cannot reuse the outer scan scratch or release its valid lease', () => {
  const f = fixture();
  f.draw();
  f.onStock = object => {
    assert.equal(object.id, 2);
    assert.equal(f.controller.collect({bounds: new Map()}, null, [], new Map()), false);
  };
  const result = f.draw();
  assert.deepEqual(result.ids, [1, 2, 3]);
  assert.deepEqual(result.calls, [2]);
  assert.equal(f.released.length, 0);
});

test('a native world word can settle without a setter and makes the whole viewport query use stock', () => {
  const f = fixture();
  f.draw();
  assert.deepEqual(f.draw().calls, [2]);
  const offscreen = f.objects[0];
  offscreen.sources[0].node._worldMatrix.m[12] = 32;
  offscreen.box = f.rect(32);
  assert.equal(f.controller.painter(), null);
  const result = f.draw();
  assert.deepEqual(result.calls, [0, 1, 2, 3, 4]);
  assert.deepEqual(result.ids, [0, 1, 2, 3]);
  assert.equal(f.released.length, 1);
});

test('a dirty ancestor rejects a clean source matrix before the stock world getter can recompute it', () => {
  const f = fixture();
  f.draw();
  const root = f.objects[1].node;
  assert.equal(f.objects[1].sources[0].node._worldMatDirty, false);
  root._worldMatDirty = true;
  assert.equal(f.controller.painter(), null);
  assert.deepEqual(f.draw().calls, [0, 1, 2, 3, 4]);
  assert.equal(f.released.length, 1);
});

test('painter reads stay with verified rows, exact ground anchors and valid revisions', () => {
  const f = fixture();
  assert.equal(f.controller.painter(), null);
  f.draw();
  const painter = f.controller.painter();
  const owner = f.objects[1].node, anchor = owner._depthGround;
  const saved = painter(owner, anchor);
  assert(saved);
  saved.ground = 321;
  saved.shape = {minX: 1, maxX: 8};
  assert.equal(f.controller.painter()(owner, anchor), saved);
  assert.equal(painter(owner, f.objects[0].node._depthGround), null);
  assert.equal(painter(f.objects[2].node, f.objects[2].node._depthGround), null);
  f.api.mark(owner);
  assert.equal(painter(owner, anchor), null);
  assert.equal(f.controller.painter(), null);
});

test('painter lookup cannot outlive view disposal or join a nested candidate scan', () => {
  const f = fixture();
  f.draw();
  const painter = f.controller.painter();
  f.onStock = () => {
    assert.equal(f.controller.painter(), null);
    assert.equal(painter(f.objects[1].node, f.objects[1].node._depthGround), null);
  };
  f.draw();
  f.controller.dispose();
  assert.equal(f.controller.painter(), null);
  assert.equal(painter(f.objects[1].node, f.objects[1].node._depthGround), null);
});
