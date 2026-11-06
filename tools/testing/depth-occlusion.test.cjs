'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'assets/_script/KinghtFallDepthView.js'), 'utf8');
function load(cc = {}, sp = {}) {
  const context = { exports: {}, cc, sp };
  vm.runInNewContext(source, context);
  return context.exports;
}
test('depth follows exact ground Y, including subpixel crossings and equal-height units', () => {
  const { DepthView } = load();
  const wall = { y: 60.5 }, rear = { y: 60.51, _combatActor: true }, front = { y: 60.49, _combatActor: true }, hero = { y: 60.5 };
  const nodes = [front, hero, wall, rear];
  nodes.forEach((node, index) => { node.getSiblingIndex = () => index; });
  const view = { main: { children: nodes }, game: { ctrPlay: { node: hero } } };
  DepthView.prototype.sort.call(view);
  assert.ok(rear.zIndex < wall.zIndex);
  assert.ok(wall.zIndex < hero.zIndex);
  assert.ok(wall.zIndex < front.zIndex);
  front.y = 60.6;
  DepthView.prototype.sort.call(view);
  assert.ok(front.zIndex < wall.zIndex, 'crossing to the upper side immediately changes depth');
});
test('mask nodes never enter ground sorting, and off-axis objects do not count as occlusion', () => {
  const { DepthView, overlaps } = load();
  const mask = { _occlusionMask: true, zIndex: 91 }, hero = { y: -100, getSiblingIndex: () => 0 };
  DepthView.prototype.sort.call({ main: { children: [mask, hero] }, game: { ctrPlay: { node: hero } } });
  assert.equal(mask.zIndex, 91);
  const b = { minX: 0, minY: 0, maxX: 30, maxY: 70 };
  assert.equal(overlaps(b, { minX: 31, minY: 5, maxX: 50, maxY: 80 }), false);
  assert.equal(overlaps(b, { minX: 20, minY: 5, maxX: 50, maxY: 80 }), true);
});
test('silhouette sources include the full equipped hero and exclude smoke/revive/health effects', () => {
  const { bodyVisuals } = load();
  const names = ['spAniMa', 'spAniBody', 'spAniDrap', 'spAniHead', 'spAniBow', 'spAniArrow', 'spAniHand'];
  const animation = Object.fromEntries([...names, 'spAniSmoke', 'spAniRevive'].map(name => [name, { name }]));
  assert.deepEqual(Array.from(bodyVisuals({ ctrPlayAni: animation }), v => v.name), names);
  const soldier = { spAni: {} };
  assert.equal(bodyVisuals(soldier)[0], soldier.spAni);
});
test('multiple hidden units share one object stencil and contain render components only', () => {
  const added = [];
  class Node { constructor(name) { this.name = name; } addComponent(Type) { added.push(Type); return new Type(); } }
  class Mask {} Mask.Type = { IMAGE_STENCIL: 2 };
  class Skeleton {}
  const { DepthView } = load({ Node, Mask }, { Skeleton });
  const view = { main: {} }, object = { masks: new Map() };
  const source = new Skeleton(); source.skeletonData = {}; source.enableBatch = true;
  const a = DepthView.prototype.makeMask.call(view, object, {}, [source]);
  const b = DepthView.prototype.makeMask.call(view, object, {}, [source]);
  assert.equal(a.node.parent, b.node.parent);
  assert.equal(added.filter(type => type === Mask).length, 1);
  assert.deepEqual(added.filter(type => type !== Mask), [Skeleton, Skeleton]);
  assert.equal(a.visuals[0].visual.paused, true, 'proxy never starts independent animation callbacks');
  assert.equal(a.visuals[0].visual.enableBatch, true, 'crowd silhouettes retain the source mesh batching');
});
test('pooled/dead actors lose their overlays immediately and inactive scenery cannot occlude', () => {
  const cc = { v2: (x, y) => ({ x, y }), isValid: node => node.valid !== false };
  const { DepthView } = load(cc);
  const hero = { node: { activeInHierarchy: false } }, pooled = { node: { activeInHierarchy: false } };
  let destroyed = 0;
  const object = { node: { activeInHierarchy: false, convertToWorldSpaceAR: p => p }, sources: [], overlay: { node: { active: true } }, masks: new Map([[pooled, { node: { active: true, destroy() { destroyed++; } } }]]) };
  const game = { ctrPlay: hero, gameData: { getSoldierList: () => [pooled], getEnemyList: () => [] } };
  const view = { main: { activeInHierarchy: true, convertToNodeSpaceAR: p => p }, game, objects: [object], sort() {}, snapshot() { throw Error('inactive object was rendered'); } };
  DepthView.prototype.update.call(view);
  assert.equal(destroyed, 1);
  assert.equal(object.masks.size, 0);
  assert.equal(object.overlay.node.active, false);
});
const engine = process.env.COCOS_ENGINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const runtime = path.join(engine, 'extensions/spine/lib/spine.js');
test('real Spine pose, attachments, deform, draw order and alpha survive flat silhouette copying', { skip: !fs.existsSync(runtime) && !process.env.COCOS_ENGINE_ROOT ? 'Install Creator 2.4.13 for real Spine integration' : false }, () => {
  const spine = require(runtime), { copyPose } = load();
  const data = new spine.SkeletonData();
  data.bones.push(new spine.BoneData(0, 'root', null), new spine.BoneData(1, 'head', null));
  data.slots.push(new spine.SlotData(0, 'body', data.bones[0]), new spine.SlotData(1, 'head', data.bones[1]));
  const from = new spine.Skeleton(data), to = new spine.Skeleton(data);
  from.bones[0].x = -15; from.bones[0].rotation = 38;
  from.bones[1].x = 5; from.bones[1].y = 35;
  const attachment = new spine.RegionAttachment('body');
  attachment.offset.set([-10, 0, -10, 50, 10, 50, 10, 0]);
  from.slots[0].setAttachment(attachment);
  from.slots[0].deform.push(1, 2, 3, 4);
  from.slots[0].color.set(.3, .4, .5, .6);
  from.drawOrder.reverse();
  let dirty = 0;
  const original = { _skeleton: from, skeletonData: data }, proxy = { _skeleton: to, skeletonData: data, markForRender() { dirty++; } };
  from.updateWorldTransform();
  const expected = from.bones.map(b => [b.a, b.b, b.c, b.d, b.worldX, b.worldY]);
  copyPose(original, proxy, {});
  assert.deepEqual(to.bones.map(b => [b.a, b.b, b.c, b.d, b.worldX, b.worldY]), expected);
  assert.equal(to.slots[0].getAttachment(), attachment);
  assert.deepEqual(to.slots[0].deform, from.slots[0].deform);
  assert.equal(to.drawOrder[0], to.slots[1]);
  assert.equal(to.slots[0].color.a, .6);
  assert.equal(to.slots[0].color.r, 1);
  assert.equal(to.slots[0].darkColor.r, 1);
  assert.equal(proxy.useTint, true, 'Creator two-color Spine shading is enabled');
  assert.equal(from.slots[0].color.r, .3, 'source model tint is untouched');
  assert.equal(from.slots[0].darkColor, null);
  assert.equal(dirty, 1);
  const expectedBounds = [new spine.Vector2(), new spine.Vector2()], copiedBounds = [new spine.Vector2(), new spine.Vector2()];
  from.getBounds(...expectedBounds, []); to.getBounds(...copiedBounds, []);
  assert.deepEqual(copiedBounds, expectedBounds, 'overlay matches the current pose, not setup bounds');
  class Skeleton {}
  const geometry = load({ v2: (x, y) => ({ x, y }) }, { Skeleton });
  const renderer = Object.assign(new Skeleton(), original, { enabled: true, node: { activeInHierarchy: true, convertToWorldSpaceAR: p => p } });
  const box = geometry.bounds(renderer, { convertToNodeSpaceAR: p => p });
  assert.ok(Number.isFinite(box.minX) && box.maxY > box.minY, 'Spine bounds use a compatible (x,y) setter');
  renderer.enabled = false;
  assert.equal(geometry.bounds(renderer, {}), null);
  assert.equal(geometry.union(box, null), box, 'hidden optional renderers do not erase an object bounds');
  copyPose(original, proxy, null);
  assert.equal(to.slots[0].color.r, .3);
  assert.equal(to.slots[0].darkColor, null);
});
test('every authored gate side has independently positioned Spine sections to interleave with units', () => {
  for (let map = 1; map <= 4; map++) {
    const prefab = JSON.parse(fs.readFileSync(path.join(root, `assets/KinghtFallIconMap/Map0${map}.prefab`)));
    const containers = prefab.filter(n => /^\d+-cq-[LR]$/.test(n._name || ''));
    assert.ok(containers.length);
    for (const container of containers) {
      const parts = (container._children || []).map(r => prefab[r.__id__]).filter(n => (n._components || []).some(r => prefab[r.__id__].__type__ === 'sp.Skeleton'));
      assert.ok(parts.length >= 1);
      if (parts.length > 1) assert.ok(new Set(parts.map(p => p._trs.array[1])).size > 1, `Map0${map} ${container._name} contains distinct ground heights`);
    }
  }
});
test('flattening every authored gate preserves mirrored visuals, collider world points and component identities', () => {
  const geometry = require('../navigation/runtime-harness.cjs');
  class Node extends geometry.Node {
    get parent() { return this._parent || null; }
    set parent(value) { if (this._parent) this._parent.children.splice(this._parent.children.indexOf(this), 1); this._parent = value; if (value) value.children.push(this); }
    setParent(value) { this.parent = value; }
    setScale(x, y) { this.scaleX = x; this.scaleY = y; }
  }
  class Skeleton {}
  const { DepthView } = load({ v2: (x, y) => new geometry.Vec2(x, y), Sprite: class {} }, { Skeleton });
  for (let map = 1; map <= 4; map++) {
    const a = JSON.parse(fs.readFileSync(path.join(root, `assets/KinghtFallIconMap/Map0${map}.prefab`)));
    const scene = new Node('scene', null, 120, 83); scene.scaleX = scene.scaleY = .8;
    const main = new Node('ndMain', scene, -22, 35), parts = [];
    for (const authored of a.filter(n => /^\d+-cq-[LR]$/.test(n._name || ''))) {
      const t = authored._trs.array, container = new Node(authored._name, main, t[0], t[1]);
      for (const ref of authored._children || []) {
        const value = a[ref.__id__], components = (value._components || []).map(r => a[r.__id__]);
        if (!components.some(c => c.__type__ === 'sp.Skeleton')) continue;
        const v = value._trs.array, node = new Node(value._name, container, v[0], v[1]);
        node.scaleX = v[7]; node.scaleY = v[8];
        const renderer = node.addComponent(Skeleton);
        const collider = components.find(c => c.__type__ === 'cc.PhysicsPolygonCollider');
        const points = collider ? collider.points : [{ x: 0, y: 0 }, { x: 20, y: 30 }];
        const world = points.map(p => node.convertToWorldSpaceAR(p));
        parts.push({ node, renderer, points, world });
      }
    }
    DepthView.prototype.prepareObjects.call({ main, objects: [], game: { gameData: { bulidPointMap: {}, obstacles: [] } } });
    for (const part of parts) {
      assert.equal(part.node.parent, main);
      assert.equal(part.node.getComponent(Skeleton), part.renderer);
      part.points.forEach((p, index) => assert.ok(geometry.distance(part.node.convertToWorldSpaceAR(p), part.world[index]) < 1e-6));
    }
  }
});

test('one draw shares exact Spine geometry across bounds and multiple silhouettes, then refreshes the next pose', { skip: !fs.existsSync(runtime) }, () => {
  const spine = require(runtime), data = new spine.SkeletonData();
  data.bones.push(new spine.BoneData(0, 'root', null));
  data.slots.push(new spine.SlotData(0, 'body', data.bones[0]));
  const skeleton = new spine.Skeleton(data), attachment = new spine.RegionAttachment('body');
  attachment.offset.set([-10, 0, -10, 50, 10, 50, 10, 0]);
  skeleton.slots[0].setAttachment(attachment);
  let transforms = 0, boundsCalls = 0;
  const update = skeleton.updateWorldTransform, getBounds = skeleton.getBounds;
  skeleton.updateWorldTransform = function () { transforms++; return update.call(this); };
  skeleton.getBounds = function () { boundsCalls++; return getBounds.apply(this, arguments); };
  class Skeleton {}
  const { bounds, copyPose } = load({ v2: (x, y) => ({ x, y }) }, { Skeleton });
  const renderer = Object.assign(new Skeleton(), { _skeleton: skeleton, skeletonData: data, enabled: true, node: { activeInHierarchy: true, convertToWorldSpaceAR: p => p } });
  const main = { convertToNodeSpaceAR: p => p };
  function frame() { return { poses: new Set(), transforms: new Map(), bounds: new Map() }; }
  const cache = frame(), first = bounds(renderer, main, cache);
  for (let i = 0; i < 12; i++) {
    assert.equal(bounds(renderer, main, cache), first);
    copyPose(renderer, { _skeleton: new spine.Skeleton(data), skeletonData: data, markForRender() {} }, {}, cache);
  }
  assert.equal(transforms, 1, 'a unit behind several structures updates its bones once');
  assert.equal(boundsCalls, 1, 'mesh vertices are traversed once per source per draw');
  skeleton.bones[0].x = 37;
  const next = bounds(renderer, main, frame());
  assert.equal(next.minX, first.minX + 37, 'the next draw uses the current animation pose');
  assert.equal(transforms, 2);
  assert.equal(boundsCalls, 2);
});

test('affine bounds remain exact under mirrored, rotated and scaled scene parents', () => {
  const { Node, Vec2 } = require('../navigation/runtime-harness.cjs');
  const scene = new Node('scene', null, 17, 29), main = new Node('main', scene, -31, 75), node = new Node('sprite', main, 22, -43);
  scene.scaleX = .7; scene.scaleY = 1.2; scene.angle = 19;
  main.scaleX = 1.3; main.scaleY = -.8; main.angle = -7;
  node.scaleX = -1.6; node.scaleY = .9; node.angle = 38;
  Object.assign(node, { active: true, width: 60, height: 110, anchorX: .3, anchorY: .8 });
  const { bounds } = load({ v2: (x, y) => new Vec2(x, y) }, { Skeleton: class {} });
  const box = bounds({ node, enabled: true }, main);
  const corners = [[-18, -88], [42, -88], [-18, 22], [42, 22]].map(([x, y]) => main.convertToNodeSpaceAR(node.convertToWorldSpaceAR(new Vec2(x, y))));
  for (const [key, value] of Object.entries({ minX: Math.min(...corners.map(p => p.x)), maxX: Math.max(...corners.map(p => p.x)), minY: Math.min(...corners.map(p => p.y)), maxY: Math.max(...corners.map(p => p.y)) })) assert.ok(Math.abs(box[key] - value) < 1e-8, key);
});

test('camera culling skips offscreen silhouettes without changing live actor renderers', () => {
  const rect = { bottomLeft: { x: 0, y: 0 }, bottomRight: { x: 100, y: 0 }, topLeft: { x: 0, y: 100 }, topRight: { x: 100, y: 100 } };
  const cc = { visibleRect: rect, v2: (x, y) => ({ x, y }), isValid: () => true };
  const { DepthView, viewBounds } = load(cc, { Skeleton: class {} });
  const main = { activeInHierarchy: true, convertToNodeSpaceAR: p => ({ x: p.x - 10, y: p.y - 20 }) };
  const camera = { getScreenToWorldPoint: p => ({ x: p.x / 2 + 110, y: p.y / 2 + 220 }) };
  assert.deepEqual(JSON.parse(JSON.stringify(viewBounds({ camera }, main))), { minX: 100, minY: 200, maxX: 150, maxY: 250 });
  const actor = { hp: 10, node: { y: 900, activeInHierarchy: true } };
  Object.defineProperty(actor, 'spAni', { get() { throw Error('offscreen actor mesh was inspected'); } });
  const scenery = { activeInHierarchy: true, width: 50, height: 60, anchorX: 0, anchorY: 0, convertToWorldSpaceAR: p => ({ x: p.x + 1000, y: p.y + 800 }) };
  const mask = { node: { active: true } }, object = { node: scenery, sources: [{ enabled: true, node: scenery }], masks: new Map([[actor, mask]]), overlay: { node: { active: true } } };
  const game = { camera, ctrPlay: actor, gameData: { getSoldierList: () => [], getEnemyList: () => [] } };
  DepthView.prototype.update.call({ main, game, objects: [object], sort() {}, snapshot() { throw Error('offscreen capture was rendered'); } });
  assert.equal(object.overlay.node.active, false);
  assert.equal(mask.node.active, false);
  assert.equal(actor.node.activeInHierarchy, true, 'offscreen combat and source animation remain active');
});

test('capture stamps ignore floating transform noise but invalidate genuine pose, skin and attachment changes', () => {
  const { sameStamp } = load();
  const asset = {}, before = [asset, 'skin-blue', 'helmet', 17.25, -400];
  assert.equal(sameStamp(before, [asset, 'skin-blue', 'helmet', 17.25 + 1e-10, -400]), true);
  assert.equal(sameStamp(before, [asset, 'skin-blue', 'helmet', 17.3, -400]), false);
  assert.equal(sameStamp(before, [asset, 'skin-red', 'helmet', 17.25, -400]), false);
  assert.equal(sameStamp(before, [asset, 'skin-blue', 'crown', 17.25, -400]), false);
  assert.equal(sameStamp(before, [{}, 'skin-blue', 'helmet', 17.25, -400]), false);
});

test('repeated pose copies retain slot material caches and only notify actual tint changes', { skip: !fs.existsSync(runtime) }, () => {
  const spine = require(runtime), { copyPose } = load(), data = new spine.SkeletonData();
  data.bones.push(new spine.BoneData(0, 'root', null));
  const source = { _skeleton: new spine.Skeleton(data), skeletonData: data, useTint: false };
  let tint = false, invalidations = 0;
  const target = { _skeleton: new spine.Skeleton(data), skeletonData: data, markForRender() {}, get useTint() { return tint; }, set useTint(value) { tint = value; invalidations++; } };
  for (let i = 0; i < 60; i++) copyPose(source, target, {});
  assert.equal(invalidations, 1, 'unchanged tint must not clear cached slot materials every draw');
  copyPose(source, target, null);
  assert.equal(invalidations, 2, 'leaving silhouette tint still refreshes material defines');
  copyPose(source, target, null);
  assert.equal(invalidations, 2);
});

test('continuously visible silhouettes keep their render component lifecycle active', () => {
  class Skeleton {}
  const cc = { v2: (x, y) => ({ x, y }), isValid: () => true, color: () => ({}) };
  const { DepthView } = load(cc, { Skeleton });
  let active = true, transitions = 0;
  const sourceNode = { activeInHierarchy: true, width: 10, height: 20, anchorX: .5, anchorY: 0, opacity: 255, convertToWorldSpaceAR: p => ({ x: p.x, y: p.y + 5 }) };
  const actor = { hp: 10, node: { y: 5, activeInHierarchy: true }, spAni: { node: sourceNode, enabled: true } };
  const mask = { node: { get active() { return active; }, set active(value) { if (active !== value) transitions++; active = value; } }, visuals: [] };
  const objectNode = { activeInHierarchy: true, width: 40, height: 40, anchorX: .5, anchorY: 0, convertToWorldSpaceAR: p => p };
  const overlay = { node: { active: true, setPosition() {}, setContentSize() {} }, mask: {} };
  const object = { node: objectNode, sources: [{ node: objectNode, enabled: true }], masks: new Map([[actor, mask]]), overlay, center: { x: 0, y: 0 }, size: {}, frame: {} };
  const game = { ctrPlay: actor, gameData: { getSoldierList: () => [], getEnemyList: () => [] } };
  const view = { main: { activeInHierarchy: true, convertToNodeSpaceAR: p => p }, game, objects: [object], sort() {}, snapshot() {} };
  for (let i = 0; i < 60; i++) DepthView.prototype.update.call(view);
  assert.equal(active, true);
  assert.equal(transitions, 0, 'visible masks should never cycle through onDisable/onEnable each frame');
  actor.node.y = -1;
  DepthView.prototype.update.call(view);
  assert.equal(active, false);
  assert.equal(transitions, 1, 'moving in front still hides the silhouette immediately');
});
