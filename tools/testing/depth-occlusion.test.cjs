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

test('native stage keeps drawing while the silhouette material loads and releases captures on exit', () => {
  const events = [];
  let loadEffect, destroyed = 0;
  class Node { constructor(name) { this.name = name; } addComponent(Type) { return new Type(); } destroy() { destroyed++; } }
  class Camera {} Camera.ClearFlags = { COLOR: 1, DEPTH: 2, STENCIL: 4 };
  const material = { define() {}, destroy() { destroyed++; } };
  const cc = { Node, Camera, isValid: value => !!value, color: () => ({}), resources: { load(name, type, done) { loadEffect = done; } },
    EffectAsset: class {}, Material: { create: () => material }, sys: { isNative: true }, Director: { EVENT_BEFORE_DRAW: 'draw' }, director: {
    getScene: () => ({}),
    on(event, callback, owner) { events.push({ event, callback, owner }); },
    off(event, callback, owner) { const i = events.findIndex(e => e.event === event && e.callback === callback && e.owner === owner); events.splice(i, 1); }
  } };
  class Skeleton {}
  const { DepthView } = load(cc, { Skeleton });
  const scenery = { name: 'Tower', y: 100 }, hero = { name: 'Hero', y: 50 };
  const main = { activeInHierarchy: true, children: [hero, scenery] };
  const game = { ndMain: main, ctrPlay: { node: hero }, gameData: { bulidPointMap: {} } };
  // A native skeleton can animate normally but has no browser getBounds API.
  // Awaiting the material must not block ordinary stage drawing/depth sorting.
  Object.defineProperty(game.gameData, 'getSoldierList', { get() { throw Error('native silhouette traversal'); } });
  const view = new DepthView(game);
  assert.equal(view.captureSupported, false);
  assert.ok(view.camera, 'manual native camera is available before asynchronous material loading');
  assert.equal(events.length, 1);
  for (let frame = 0; frame < 60; frame++) events[0].callback.call(events[0].owner);
  assert.ok(scenery.zIndex < hero.zIndex);
  hero.y = 150;
  view.update();
  assert.ok(hero.zIndex < scenery.zIndex, 'live ground sorting still follows movement');
  loadEffect(null, {});
  assert.equal(view.captureSupported, true);
  view.nativeActors.set(hero, { frame: { destroy() { destroyed++; } }, texture: { destroy() { destroyed++; } } });
  view.destroy();
  assert.equal(events.length, 0, 'native cleanup unregisters before-draw callback');
  assert.equal(view.nativeActors.size, 0);
  assert.equal(destroyed, 5, 'capture nodes, material and per-actor GPU resources are released');
  loadEffect(null, {});
  assert.equal(destroyed, 5, 'late asset completion after leaving the stage cannot recreate a material');
});

test('native animated bounds use JSB renderer geometry without browser Spine methods', () => {
  class Skeleton {}
  let updates = 0;
  const node = { activeInHierarchy: true, convertToWorldSpaceAR: p => ({ x: 30 - p.x * 2, y: 50 + p.y * 3 }) };
  const renderer = Object.assign(new Skeleton(), { node, enabled: true,
    _skeleton: { updateWorldTransform() { updates++; }, getBounds() { throw Error('Browser-only API'); } },
    _nativeSkeleton: { getBoundingBox: () => ({ x: -10, y: -5, width: 40, height: 60 }) } });
  const { bounds } = load({ v2: (x, y) => ({ x, y }) }, { Skeleton });
  const cache = { poses: new Set(), bounds: new Map(), transforms: new Map(), vertexStore: new WeakMap() };
  const box = bounds(renderer, { convertToNodeSpaceAR: p => p }, cache);
  assert.deepEqual({ ...box }, { minX: -30, minY: 35, maxX: 50, maxY: 215 });
  assert.equal(bounds(renderer, {}, cache), box);
  assert.equal(updates, 1);
});

test('native captures select only live visual nodes and restore the camera even if rendering fails', () => {
  const { DepthView } = load({ v2: (x, y) => ({ x, y }), Camera: { ClearFlags: { COLOR: 1, DEPTH: 2, STENCIL: 4 } } });
  const calls = [], camera = { render(node) { calls.push({ node, clear: this.clearFlags }); if (node.fail) throw Error('GPU failure'); } };
  const view = { main: { convertToWorldSpaceAR: p => ({ x: 10 + p.x * 2, y: 20 + p.y * 2 }) }, camera, cameraNode: { setPosition(x, y) { this.position = { x, y }; } } };
  const sources = [false, true, true].map(enabled => ({ enabled, node: { activeInHierarchy: true } }));
  DepthView.prototype.renderNative.call(view, sources, { x: 30, y: 40 }, 80, {});
  assert.deepEqual(calls.map(c => c.node), sources.slice(1).map(s => s.node));
  assert.deepEqual(calls.map(c => c.clear), [7, 6], 'later body parts preserve the captured alpha of earlier parts');
  assert.deepEqual(view.cameraNode.position, { x: 70, y: 100 });
  assert.equal(camera.orthoSize, 80);
  assert.equal(camera.targetTexture, null);
  sources[1].node.fail = true;
  assert.throws(() => DepthView.prototype.renderNative.call(view, sources, { x: 0, y: 0 }, 80, {}), /GPU failure/);
  assert.equal(camera.targetTexture, null);
});

test('one native actor capture serves multiple occluders and refreshes with the next animated frame', () => {
  const { DepthView } = load({ color: (r, g, b) => ({ r, g, b }) });
  let captures = 0;
  const actor = {}, entry = { actor, sources: [], bounds: {}, tint: { r: 255, g: 115, b: 115 } };
  const view = { nativeActors: new Map(), snapshotActor(record) { captures++; record.center = { x: 30, y: 40 }; record.size = { width: 60, height: 70 }; record.frame = {}; } };
  const masks = Array.from({ length: 2 }, () => ({ sprite: {}, node: { setPosition(x, y) { this.position = { x, y }; }, setContentSize(size) { this.size = size; } } }));
  const frame = {};
  masks.forEach((mask, i) => DepthView.prototype.syncNativeMask.call(view, mask, entry, { center: { x: i * 10, y: 20 } }, frame));
  assert.equal(captures, 1);
  assert.equal(masks[0].sprite.spriteFrame, masks[1].sprite.spriteFrame);
  assert.deepEqual(masks[1].node.position, { x: 20, y: 20 });
  assert.deepEqual(masks[0].node.color, entry.tint);
  assert.equal(masks[0].node.opacity, 204);
  DepthView.prototype.syncNativeMask.call(view, masks[0], entry, { center: { x: 0, y: 0 } }, {});
  assert.equal(captures, 2, 'live animation is captured again on the next draw');
});
test('a native depth draw shares one GPU actor capture across masks without retaining browser pose caches', () => {
  class Skeleton {}
  const cc = { v2: (x, y) => ({ x, y }), color: () => ({}), isValid: Boolean };
  const { DepthView } = load(cc, { Skeleton });
  const main = { activeInHierarchy: true, convertToNodeSpaceAR: p => p };
  function node(y) {
    return { y, activeInHierarchy: true, width: 40, height: 40, anchorX: .5, anchorY: 0,
      convertToWorldSpaceAR: p => ({ x: p.x, y: p.y + y }), setPosition() {}, setContentSize() {}, destroy() {} };
  }
  const actor = { node: node(5), hp: 10 };
  let boundsReads = 0, captures = 0, disposed = 0;
  actor.spAni = Object.assign(new Skeleton(), {
    enabled: true, node: actor.node, _skeleton: { updateWorldTransform() {} },
    _nativeSkeleton: { getBoundingBox() { boundsReads++; return { x: -5, y: 0, width: 10, height: 20 }; } }
  });
  const objects = [0, 1].map(y => {
    const wall = node(y);
    return { node: wall, sources: [{ enabled: true, node: wall }], overlay: { node: node(y), mask: {} },
      masks: new Map([[actor, { node: node(y), sprite: {} }]]), center: { x: 0, y }, size: {}, frame: {} };
  });
  const view = Object.assign(Object.create(DepthView.prototype), {
    nativeCapture: true, captureSupported: true, nativeActors: new Map(), main, objects, sort() {},
    game: { ctrPlay: actor, gameData: { getSoldierList: () => [], getEnemyList: () => [] } },
    snapshot(_object, _box, cache) { assert.equal(cache.vertexConsumers, undefined); assert.equal(cache.vertexStore, undefined); },
    snapshotActor(record) {
      captures++; record.center = { x: 0, y: 5 }; record.size = {};
      if (!record.frame) {
        record.frame = { destroy() { disposed++; } };
        record.texture = { destroy() { disposed++; } };
      }
    }
  });
  for (let frame = 1; frame <= 2; frame++) {
    view.update();
    assert.equal(boundsReads, frame);
    assert.equal(captures, frame);
    const record = view.nativeActors.get(actor);
    assert.equal(record.draw.bounds, undefined, 'actor texture retained the full per-draw bounds cache');
    for (const object of objects) assert.equal(object.masks.get(actor).sprite.spriteFrame, record.frame);
  }
  actor.hp = 0; view.update();
  assert.equal(view.nativeActors.size, 0); assert.equal(disposed, 2);
});
test('native animated captures retain GPU capacity as pose bounds change and grow without clipping', () => {
  let allocations = 0, released = 0;
  class RenderTexture { initWithSize(width, height) { Object.assign(this, { width, height }); allocations++; } destroy() { released++; } }
  class SpriteFrame { setFlipY() {} destroy() { released++; } }
  const { DepthView } = load({ RenderTexture, SpriteFrame, gfx: { RB_FMT_S8: 8 } });
  const captures = [], view = { renderNative(sources, center, height, texture) { captures.push({ center, height, texture }); } }, record = {};
  for (const dx of [0, 1, -1, 2, 0]) DepthView.prototype.snapshotActor.call(view, record, [], { minX: 10, minY: 20, maxX: 96 + dx, maxY: 106 });
  assert.equal(allocations, 1, 'ordinary animation changes must reuse the texture/frame');
  assert.equal(record.size.width, 96);
  assert.equal(captures.length, 5, 'the captured pose still refreshes each frame');
  DepthView.prototype.snapshotActor.call(view, record, [], { minX: -10, minY: 20, maxX: 130, maxY: 106 });
  assert.equal(record.size.width, 160, 'a wider attack pose receives enough capacity');
  assert.equal(allocations, 2);
  assert.equal(released, 2, 'replaced frame and texture are released together');
  DepthView.prototype.snapshotActor.call(view, record, [], { minX: 10, minY: 20, maxX: 96, maxY: 106 });
  assert.equal(allocations, 2, 'returning to idle retains capacity for the next attack');
});
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
test('before-draw depth changes flush Creator delayed sorting before the frame is rendered', () => {
  const { DepthView } = load();
  const actor = { y: 110, zIndex: 1200 }, wall = { y: 100, zIndex: 0 };
  const main = { children: [wall, actor], sortAllChildren() { this.children.sort((a, b) => a.zIndex - b.zIndex); } };
  const view = { main, game: { ctrPlay: { node: actor } } };
  for (let frame = 0; frame < 3; frame++) {
    // Gameplay assigns a legacy actor zIndex during update; Creator's regular
    // AFTER_UPDATE sort therefore places it above the wall each frame.
    actor.zIndex = 1200; main.sortAllChildren();
    assert.equal(main.children[1], actor);
    DepthView.prototype.sort.call(view);
    assert.equal(main.children[0], actor, 'the same frame must draw the rear actor below the wall');
  }
  actor.y = 90;
  DepthView.prototype.sort.call(view);
  assert.equal(main.children[1], actor, 'crossing in front immediately restores the full unit');
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

for (const nativeCapture of [false, true]) test('late tower artwork and its weapon replace occlusion sources through upgrades and removal (' + (nativeCapture ? 'native' : 'browser') + ')', () => {
  const { Node, Vec2 } = require('../navigation/runtime-harness.cjs');
  class Skeleton {} class Sprite {}
  const cc = { Sprite, v2: (x, y) => new Vec2(x, y), isValid: value => !!value && !value.destroyed };
  const { DepthView } = load(cc, { Skeleton });
  const main = new Node('Map'), tower = new Node('Tower', main), model = new Node('OriginalTower', tower);
  const skeleton = model.addComponent(Skeleton); skeleton.enabled = true;
  const owner = { node: tower, ndAniMain: skeleton }, game = { ndMain: main, ctrPlay: { node: { activeInHierarchy: false } },
    gameData: { bulidPointMap: { tower: owner }, getSoldierList: () => [], getEnemyList: () => [] } };
  const view = { main, game, objects: [], nativeCapture, nativeActors: new Map(), sort() {} };
  DepthView.prototype.prepareObjects.call(view);
  assert.equal(view.objects.length, 1);
  const object = view.objects[0]; assert.deepEqual(Array.from(object.sources), [skeleton]);
  let capturesReleased = 0;
  object.capture = { active: true, destroy() { capturesReleased++; } };
  const base = new Node('BuildingArtwork', tower).addComponent(Sprite), pivot = new Node('WeaponPivot', tower);
  const weapon = new Node('BuildingWeapon', pivot).addComponent(Sprite);
  base.enabled = weapon.enabled = true; skeleton.enabled = false;
  owner._buildingAppearance = { sprite: base, weaponSprite: weapon };
  DepthView.prototype.update.call(view);
  assert.deepEqual(Array.from(object.sources), [skeleton, base, weapon]);
  assert.equal(capturesReleased, 1); assert.equal(object.capture, null);
  assert.equal(tower._depthGround, model, 'replacement artwork must retain the authored ground point');
  const stable = object.sources;
  for (let i = 0; i < 30; i++) DepthView.prototype.update.call(view);
  assert.equal(object.sources, stable, 'steady frames should not rebuild source arrays or captures');
  base.spriteFrame = { name: 'next tower level' }; weapon.spriteFrame = { name: 'next weapon level' };
  DepthView.prototype.update.call(view); assert.equal(object.sources, stable);
  const ruins = new Node('BuildingRuins', tower).addComponent(Sprite); ruins.enabled = true;
  base.node.active = false; pivot.active = false; owner._buildingAppearance.destroyedSprite = ruins;
  DepthView.prototype.update.call(view);
  assert.deepEqual(Array.from(object.sources).filter(source => source.enabled && source.node.activeInHierarchy), [ruins]);
  const old = object.capture = { active: true, destroy() { capturesReleased++; } };
  owner._buildingAppearance = null; skeleton.enabled = true;
  DepthView.prototype.update.call(view);
  assert.equal(old.active, false); assert.equal(capturesReleased, 2);
  assert.deepEqual(Array.from(object.sources), [skeleton]);
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

function vertexFixture(spine) {
  class Skeleton {}
  const api = load({ v2: (x, y) => ({ x, y }) }, { Skeleton, spine });
  const store = new WeakMap(), main = { convertToNodeSpaceAR: p => p };
  return {
    ...api, store, main,
    // Most vertex tests exercise several consumers. Explicitly opt in; bounds
    // or a single silhouette alone must use the ordinary Spine implementation.
    frame: (consumers = 2, previous = consumers) => ({ poses: new Set(), bounds: new Map(), transforms: new Map(), vertexStore: store,
      vertexConsumers: { get: () => consumers }, previousVertexConsumers: { get: () => previous } }),
    source: skeleton => Object.assign(new Skeleton(), { _skeleton: skeleton, skeletonData: skeleton.data, enabled: true,
      node: { activeInHierarchy: true, convertToWorldSpaceAR: p => p } }),
    target: data => ({ _skeleton: new spine.Skeleton(data), skeletonData: data, markForRender() {} })
  };
}
function checkVertexScatter(spine, sourceSlot, targetSlot) {
  const original = sourceSlot.getAttachment(), facade = targetSlot.getAttachment();
  const region = original instanceof spine.RegionAttachment;
  assert(facade instanceof (region ? spine.RegionAttachment : spine.MeshAttachment));
  assert.equal(Object.getPrototypeOf(facade), original);
  for (const key of ['region', 'uvs', 'triangles', 'color', 'deformAttachment']) assert.equal(facade[key], original[key], key);
  const size = region ? 8 : original.worldVerticesLength;
  for (const stride of [2, 5, 6]) for (const start of region ? [0] : [0, 2]) {
    const count = size - start, offset = 3;
    const expected = new Float32Array(7 + size / 2 * stride).fill(-987);
    const actual = expected.slice();
    if (region) {
      original.computeWorldVertices(sourceSlot.bone, expected, offset, stride);
      facade.computeWorldVertices(targetSlot.bone, actual, offset, stride);
    } else {
      original.computeWorldVertices(sourceSlot, start, count, expected, offset, stride);
      facade.computeWorldVertices(targetSlot, start, count, actual, offset, stride);
    }
    assert.deepEqual(actual, expected, `cached XY differs or overwrites UV/color fields at stride ${stride}, start ${start}`);
  }
}

test('silhouette facades reuse exact weighted/deformed vertices with all renderer strides and retain clipping', { skip: !fs.existsSync(runtime) }, () => {
  const spine = require(runtime), f = vertexFixture(spine), data = new spine.SkeletonData();
  data.bones.push(new spine.BoneData(0, 'root', null), new spine.BoneData(1, 'child', null));
  for (let i = 0; i < 4; i++) data.slots.push(new spine.SlotData(i, 'slot' + i, data.bones[i % 2]));
  const skeleton = new spine.Skeleton(data), region = new spine.RegionAttachment('region');
  region.offset.set([-10, -10, -10, 30, 30, 30, 30, -10]);
  const mesh = new spine.MeshAttachment('weighted');
  mesh.worldVerticesLength = 6; mesh.bones = [2, 0, 1, 2, 0, 1, 2, 0, 1];
  mesh.vertices = [0, 0, .3, 2, 4, .7, 30, 0, .6, 25, 3, .4, 0, 30, .5, 3, 25, .5];
  mesh.triangles = [0, 1, 2]; mesh.uvs = [0, 0, 1, 0, 0, 1]; mesh.region = { texture: {} };
  const unweighted = new spine.MeshAttachment('deformed');
  unweighted.worldVerticesLength = 6; unweighted.vertices = [0, 0, 30, 0, 0, 30];
  const clip = new spine.ClippingAttachment('clip');
  clip.worldVerticesLength = 8; clip.vertices = [-20, -20, 45, -20, 45, 45, -20, 45]; clip.endSlot = data.slots[3];
  [region, mesh, unweighted, clip].forEach((attachment, index) => skeleton.slots[index].setAttachment(attachment));
  skeleton.slots[1].deform.push(1, 2, -3, 4, 5, -6, 7, 8, -9, 10, 11, -12);
  skeleton.slots[2].deform.push(-3, 2, 35, 4, 1, 37);
  Object.assign(skeleton.bones[0], { x: 17, y: -9, rotation: 23, scaleX: -1.3, scaleY: .8 });
  Object.assign(skeleton.bones[1], { x: -11, y: 13, rotation: -37, scaleX: .7, scaleY: -1.2 });
  const source = f.source(skeleton), frame = f.frame();
  const originals = skeleton.slots.map(slot => slot.getAttachment());
  let computations = 0;
  for (const attachment of originals.slice(0, 3)) {
    const compute = attachment.computeWorldVertices;
    attachment.computeWorldVertices = function () { computations++; return compute.apply(this, arguments); };
  }
  const box = f.bounds(source, f.main, frame);
  assert.equal(computations, 3);
  const targets = Array.from({ length: 12 }, () => f.target(data));
  for (const target of targets) {
    f.copyPose(source, target, {}, frame);
    const offset = new spine.Vector2(), size = new spine.Vector2();
    target._skeleton.getBounds(offset, size, []);
    assert.equal(offset.x, box.minX); assert.equal(offset.y, box.minY);
    assert.equal(offset.x + size.x, box.maxX); assert.equal(offset.y + size.y, box.maxY);
  }
  assert.equal(computations, 3, 'steady silhouettes should reuse the bounds traversal without skinning again');
  for (let i = 0; i < 3; i++) {
    checkVertexScatter(spine, skeleton.slots[i], targets[0]._skeleton.slots[i]);
    assert.equal(targets[0]._skeleton.slots[i].getAttachment(), targets[1]._skeleton.slots[i].getAttachment());
  }
  assert.deepEqual(skeleton.slots.map(slot => slot.getAttachment()), originals, 'source skin was replaced by cached facades');
  assert.equal(targets[0]._skeleton.slots[3].getAttachment(), clip, 'clipping attachment identity changed');
  function clipped(s) {
    const c = new spine.SkeletonClipping(), xy = [], attachment = s.slots[1].getAttachment();
    c.clipStart(s.slots[3], clip);
    attachment.computeWorldVertices(s.slots[1], 0, 6, xy, 0, 2);
    c.clipTriangles(xy, 6, mesh.triangles, 3, mesh.uvs, new spine.Color(1, 1, 1, 1), new spine.Color(), false, 2);
    const result = { vertices: c.clippedVertices.slice(), triangles: c.clippedTriangles.slice() };
    c.clipEndWithSlot(s.slots[3]); assert.equal(c.isClipping(), false);
    return result;
  }
  assert.deepEqual(clipped(targets[0]._skeleton), clipped(skeleton));
  const reused = targets[0]._skeleton.slots[1].getAttachment();
  const previousXY = reused._depthVertices.slice();
  skeleton.slots[1].deform[0] += 9;
  unweighted.worldVerticesLength = 8;
  skeleton.slots[2].deform.push(30, 35);
  f.copyPose(source, targets[0], {}, f.frame());
  assert.equal(targets[0]._skeleton.slots[1].getAttachment(), reused);
  checkVertexScatter(spine, skeleton.slots[1], targets[0]._skeleton.slots[1]);
  checkVertexScatter(spine, skeleton.slots[2], targets[0]._skeleton.slots[2]);
  assert.notDeepEqual(reused._depthVertices, previousXY, 'next-frame weighted deformation reused stale XY');
  assert.equal(targets[0]._skeleton.slots[2].getAttachment()._depthVertices.length, 8, 'changing vertex extent retained the old buffer length');
});

test('vertex buffers refresh per pose and stay isolated across shared skins, attachment changes and rebuilt skeletons', { skip: !fs.existsSync(runtime) }, () => {
  const spine = require(runtime), f = vertexFixture(spine), data = new spine.SkeletonData();
  data.bones.push(new spine.BoneData(0, 'root', null)); data.slots.push(new spine.SlotData(0, 'body', data.bones[0]));
  const shared = new spine.RegionAttachment('shared'); shared.offset.set([-10, 0, -10, 40, 10, 40, 10, 0]);
  const sources = [f.source(new spine.Skeleton(data)), f.source(new spine.Skeleton(data))];
  sources.forEach((source, index) => { source._skeleton.slots[0].setAttachment(shared); source._skeleton.bones[0].x = index * 100; });
  const targets = sources.map(() => f.target(data)), frame = f.frame();
  sources.forEach((source, index) => { f.bounds(source, f.main, frame); f.copyPose(source, targets[index], {}, frame); });
  sources.forEach((source, index) => checkVertexScatter(spine, source._skeleton.slots[0], targets[index]._skeleton.slots[0]));
  const facade = targets[0]._skeleton.slots[0].getAttachment(), buffer = facade._depthVertices;
  assert.notEqual(facade, targets[1]._skeleton.slots[0].getAttachment(), 'different actors shared an animated vertex buffer');
  const before = buffer.slice();
  sources[0]._skeleton.bones[0].x = 37;
  const next = f.frame(); f.copyPose(sources[0], targets[0], {}, next);
  checkVertexScatter(spine, sources[0]._skeleton.slots[0], targets[0]._skeleton.slots[0]);
  assert.equal(targets[0]._skeleton.slots[0].getAttachment(), facade, 'stable attachments allocated a new facade each draw');
  assert.equal(facade._depthVertices, buffer, 'stable geometry allocated a new XY buffer each draw');
  assert.equal(buffer[0], before[0] + 37);
  assert.equal(targets[1]._skeleton.slots[0].getAttachment()._depthVertices[0], before[0] + 100);
  const capture = f.target(data); f.copyPose(sources[0], capture, null, next);
  assert.equal(capture._skeleton.slots[0].getAttachment(), shared, 'ordinary capture unexpectedly used silhouette facades');
  sources[0]._skeleton.slots[0].setAttachment(null);
  f.copyPose(sources[0], targets[0], {}, f.frame()); assert.equal(targets[0]._skeleton.slots[0].getAttachment(), null);
  sources[0]._skeleton.slots[0].setAttachment(shared); sources[0]._skeleton.bones[0].x = -22;
  f.copyPose(sources[0], targets[0], {}, f.frame()); checkVertexScatter(spine, sources[0]._skeleton.slots[0], targets[0]._skeleton.slots[0]);
  const replacement = new spine.RegionAttachment('new skin'); replacement.offset.set([-30, -5, -30, 50, 30, 50, 30, -5]);
  sources[0]._skeleton.slots[0].setAttachment(replacement);
  f.copyPose(sources[0], targets[0], {}, f.frame()); checkVertexScatter(spine, sources[0]._skeleton.slots[0], targets[0]._skeleton.slots[0]);
  const rebuilt = new spine.Skeleton(data); rebuilt.slots[0].setAttachment(shared); rebuilt.bones[0].x = -97;
  sources[0]._skeleton = rebuilt;
  f.copyPose(sources[0], targets[0], {}, f.frame()); checkVertexScatter(spine, rebuilt.slots[0], targets[0]._skeleton.slots[0]);
  rebuilt.bones[0].active = false;
  f.copyPose(sources[0], targets[0], {}, f.frame());
  assert.equal(targets[0]._skeleton.slots[0].getAttachment(), shared, 'inactive bone retained stale cached geometry');
});

test('authored red/blue soldier meshes keep exact animated and mirrored silhouette geometry', { skip: !fs.existsSync(runtime) }, () => {
  const spine = require(runtime), f = vertexFixture(spine);
  let checkedMeshes = 0;
  for (const name of ['wqyl_qb', 'wqyl_zbb']) {
    const dir = path.join(root, 'assets/KinghtFallEnemyAni', name);
    const atlas = new spine.TextureAtlas(fs.readFileSync(path.join(dir, name + '.atlas'), 'utf8'), () => ({
      setFilters() {}, setWraps() {}, getImage: () => ({ width: 2048, height: 2048 })
    }));
    const reader = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas));
    const data = reader.readSkeletonData(JSON.parse(fs.readFileSync(path.join(dir, name + '.json'))));
    for (const skin of ['hong', 'lan']) for (const animation of ['idle', 'move', 'attack']) for (const time of [.13, .57]) {
      const skeleton = new spine.Skeleton(data);
      skeleton.setSkinByName(skin); skeleton.setSlotsToSetupPose(); skeleton.scaleX = time < .2 ? -1 : 1;
      const state = new spine.AnimationState(new spine.AnimationStateData(data));
      state.setAnimation(0, animation, true); state.update(time); state.apply(skeleton);
      const source = f.source(skeleton), target = f.target(data), frame = f.frame();
      const expected = f.bounds(source, f.main, frame);
      f.copyPose(source, target, {}, frame);
      const offset = new spine.Vector2(), size = new spine.Vector2();
      skeleton.getBounds(offset, size, []);
      assert.equal(expected.minX, offset.x); assert.equal(expected.maxY, offset.y + size.y);
      for (let i = 0; i < skeleton.slots.length; i++) {
        const slot = skeleton.slots[i], attachment = slot.getAttachment();
        if (slot.bone.active && (attachment instanceof spine.RegionAttachment || attachment instanceof spine.MeshAttachment)) {
          checkVertexScatter(spine, slot, target._skeleton.slots[i]);
          if (attachment instanceof spine.MeshAttachment) checkedMeshes++;
        }
      }
    }
  }
  assert(checkedMeshes > 100, 'authored weighted mesh coverage was lost');
});

test('zero and single silhouette consumers retain no vertex records or extra skinning work', { skip: !fs.existsSync(runtime) }, () => {
  const spine = require(runtime), f = vertexFixture(spine), data = new spine.SkeletonData();
  data.bones.push(new spine.BoneData(0, 'root', null)); data.slots.push(new spine.SlotData(0, 'body', data.bones[0]));
  const attachment = new spine.RegionAttachment('body'); attachment.offset.set([-10, 0, -10, 40, 10, 40, 10, 0]);
  let computations = 0;
  const original = attachment.computeWorldVertices;
  attachment.computeWorldVertices = function () { computations++; return original.apply(this, arguments); };
  for (const consumers of [0, 1]) {
    const source = f.source(new spine.Skeleton(data)); source._skeleton.slots[0].setAttachment(attachment);
    const frame = f.frame(consumers), target = f.target(data), before = computations;
    f.bounds(source, f.main, frame);
    assert.equal(computations, before + 1);
    assert.equal(f.store.has(source), false, 'bounds retained an unneeded source geometry record');
    if (consumers) {
      f.copyPose(source, target, {}, frame);
      assert.equal(target._skeleton.slots[0].getAttachment(), attachment);
      assert.equal(computations, before + 1, 'copyPose skinned a single consumer prematurely');
      target._skeleton.getBounds(new spine.Vector2(), new spine.Vector2(), []);
      assert.equal(computations, before + 2, 'one consumer performed more than one ordinary skinning pass');
      assert.equal(f.store.has(source), false);
    }
  }
  const source = f.source(new spine.Skeleton(data)); source._skeleton.slots[0].setAttachment(attachment);
  const frame = f.frame(); frame.vertexConsumers = new Map();
  f.copyPose(source, f.target(data), {}, frame);
  assert.equal(f.store.has(source), false, 'an unlisted source was treated as having multiple consumers');
});

test('newly multiple consumers use frozen ordinary copies before enabling branch-free vertex reuse', { skip: !fs.existsSync(runtime) }, () => {
  const spine = require(runtime), f = vertexFixture(spine), data = new spine.SkeletonData();
  data.bones.push(new spine.BoneData(0, 'root', null)); data.slots.push(new spine.SlotData(0, 'body', data.bones[0]));
  const attachment = new spine.MeshAttachment('weighted');
  attachment.worldVerticesLength = 6; attachment.bones = [1, 0, 1, 0, 1, 0];
  attachment.vertices = [0, 0, 1, 30, 0, 1, 0, 30, 1];
  const source = f.source(new spine.Skeleton(data)), targets = [f.target(data), f.target(data)], frame = f.frame(2, 0);
  source._skeleton.slots[0].setAttachment(attachment); source._skeleton.slots[0].deform.push(1, 2, 3, 4, 5, 6);
  f.bounds(source, f.main, frame);
  targets.forEach(target => f.copyPose(source, target, {}, frame));
  const facade = targets[0]._skeleton.slots[0].getAttachment(), expected = [];
  assert.equal(facade, attachment, 'first multi-consumer draw should use ordinary copied attachments');
  assert.equal(f.store.has(source), false);
  attachment.computeWorldVertices(targets[0]._skeleton.slots[0], 0, 6, expected, 0, 2);
  source._skeleton.bones[0].x = 900;
  source._skeleton.slots[0].deform[0] = 125;
  source._skeleton.updateWorldTransform();
  for (const target of targets) {
    const actual = [];
    facade.computeWorldVertices(target._skeleton.slots[0], 0, 6, actual, 0, 2);
    assert.deepEqual(actual, expected, 'rendering observed the live source instead of the copied pose');
  }
  const next = f.frame(); targets.forEach(target => f.copyPose(source, target, {}, next));
  const reused = targets[0]._skeleton.slots[0].getAttachment();
  assert.notEqual(reused, attachment, 'steady multiple consumers did not enable geometry reuse');
  const current = []; reused.computeWorldVertices(targets[0]._skeleton.slots[0], 0, 6, current, 0, 2);
  assert.notDeepEqual(current, expected, 'the following draw retained the previous pose');
  const single = f.frame(1); f.copyPose(source, targets[0], {}, single);
  assert.equal(targets[0]._skeleton.slots[0].getAttachment(), attachment, 'returning to one consumer retained its caching facade');
});

test('adaptive 1-to-multiple-to-1 consumers reuse steady bounds work and refresh every copied pose', { skip: !fs.existsSync(runtime) }, () => {
  const spine = require(runtime), f = vertexFixture(spine), data = new spine.SkeletonData();
  data.bones.push(new spine.BoneData(0, 'root', null)); data.slots.push(new spine.SlotData(0, 'body', data.bones[0]));
  const attachment = new spine.RegionAttachment('body'); attachment.offset.set([-10, 0, -10, 40, 10, 40, 10, 0]);
  const source = f.source(new spine.Skeleton(data)), targets = Array.from({ length: 3 }, () => f.target(data));
  source._skeleton.slots[0].setAttachment(attachment);
  let computations = 0, previous = 0;
  const compute = attachment.computeWorldVertices;
  attachment.computeWorldVertices = function () { computations++; return compute.apply(this, arguments); };
  for (const consumers of [1, 3, 3, 1, 1, 3, 3, 0, 0]) {
    source._skeleton.bones[0].x += 11;
    const frame = f.frame(consumers, previous), before = computations;
    f.bounds(source, f.main, frame);
    assert.equal(computations, before + 1, 'bounds traversed vertices more than once');
    for (let i = 0; i < consumers; i++) f.copyPose(source, targets[i], {}, frame);
    const expected = [];
    compute.call(attachment, source._skeleton.bones[0], expected, 0, 2);
    // The ordinary renderer can change the live source after copying. Both
    // cached facades and ordinary first-draw copies retain the frozen pose.
    source._skeleton.bones[0].x += 900; source._skeleton.updateWorldTransform();
    for (let i = 0; i < consumers; i++) {
      const slot = targets[i]._skeleton.slots[0], output = [];
      slot.getAttachment().computeWorldVertices(slot.bone, output, 0, 2);
      assert.deepEqual(output, expected);
      if (consumers === 1) assert.equal(slot.getAttachment(), attachment);
    }
    const cloneComputations = consumers === 0 || consumers >= 2 && previous >= 2 ? 0 : consumers;
    assert.equal(computations, before + 1 + cloneComputations, `unexpected skinning work at ${previous}->${consumers}`);
    previous = consumers;
  }
});

test('the depth pass counts actual overlapping consumers before copying and forgets departed occluders', () => {
  class Skeleton {}
  const cc = { v2: (x, y) => ({ x, y }), isValid: () => true, color: () => ({}) }, { DepthView } = load(cc, { Skeleton });
  const source = { enabled: true, node: { activeInHierarchy: true, width: 10, height: 20, anchorX: .5, anchorY: 0,
    convertToWorldSpaceAR: p => ({ x: p.x, y: p.y + 5 }) } };
  const actor = { hp: 10, node: { y: 5, activeInHierarchy: true }, spAni: source };
  function object(x) {
    const node = { activeInHierarchy: true, width: 40, height: 40, anchorX: .5, anchorY: 0, convertToWorldSpaceAR: p => ({ x: p.x + x, y: p.y }) };
    return { node, sources: [{ node, enabled: true }], masks: new Map([[actor, { node: { active: true }, visuals: [] }]]),
      overlay: { node: { active: true, setPosition() {}, setContentSize() {} }, mask: {} }, center: {}, size: {}, frame: {} };
  }
  const objects = [object(0), object(0), object(200)], counts = [];
  const view = { main: { activeInHierarchy: true, convertToNodeSpaceAR: p => p }, objects,
    game: { ctrPlay: actor, gameData: { getSoldierList: () => [], getEnemyList: () => [] } }, sort() {},
    snapshot(_object, _box, cache) { counts.push([cache.vertexConsumers.get(source), cache.previousVertexConsumers && cache.previousVertexConsumers.get(source)]); } };
  DepthView.prototype.update.call(view);
  assert.deepEqual(counts, [[2, undefined], [2, undefined]], 'first copy saw an incomplete or non-overlapping consumer count');
  counts.length = 0; objects[1].node.activeInHierarchy = false;
  DepthView.prototype.update.call(view);
  assert.deepEqual(counts, [[1, 2]]);
  counts.length = 0; DepthView.prototype.update.call(view);
  assert.deepEqual(counts, [[1, 1]], 'a departed occluder kept requesting eager geometry');
  actor.node.y = -1; DepthView.prototype.update.call(view);
  assert.equal(view._vertexConsumers.has(source), false);
});

test('high-water bounds scratch matches native bounds after a larger mesh, inactive bone and clipping-only pose', { skip: !fs.existsSync(runtime) }, () => {
  const spine = require(runtime), f = vertexFixture(spine), data = new spine.SkeletonData();
  data.bones.push(new spine.BoneData(0, 'root', null)); data.slots.push(new spine.SlotData(0, 'body', data.bones[0]));
  const skeleton = new spine.Skeleton(data), source = f.source(skeleton), frame = f.frame(0);
  const large = new spine.MeshAttachment('large'); large.worldVerticesLength = 200;
  large.vertices = Array.from({ length: 200 }, (_, index) => index * 100);
  skeleton.slots[0].setAttachment(large); f.bounds(source, f.main, frame);
  const region = new spine.RegionAttachment('small'); region.offset.set([-2, 0, -2, 4, 2, 4, 2, 0]);
  skeleton.slots[0].setAttachment(region); frame.bounds.clear();
  const box = f.bounds(source, f.main, frame), offset = new spine.Vector2(), size = new spine.Vector2();
  skeleton.getBounds(offset, size, []);
  assert.equal(box.minX, offset.x); assert.equal(box.maxX, offset.x + size.x);
  assert.equal(box.minY, offset.y); assert.equal(box.maxY, offset.y + size.y);
  assert.equal(frame.boundsScratch.length, 200, 'scratch was needlessly resized between slot types');
  skeleton.bones[0].active = false; frame.bounds.clear(); assert.equal(f.bounds(source, f.main, frame), null);
  skeleton.bones[0].active = true;
  const clip = new spine.ClippingAttachment('clip'); clip.worldVerticesLength = 8; clip.vertices = region.offset;
  skeleton.slots[0].setAttachment(clip); frame.bounds.clear(); assert.equal(f.bounds(source, f.main, frame), null);
  assert.equal(f.store.has(source), false);
});
