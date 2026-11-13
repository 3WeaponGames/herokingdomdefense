'use strict';
// Model Creator's destroyed SpriteFrame event target and deferred Node teardown.
// No renderer, preview, audio, game state or disposable output is involved.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../assets/_script/KinghtFallDepthView.js'), 'utf8');
function fixture() {
  const frames = [], textures = [], components = [], deferred = [], releaseRefs = [];
  class Frame {
    constructor(texture) { this.texture = texture; this._eventTarget = {}; frames.push(this); }
    hasEventListener(type) { return !!this._eventTarget[type]; }
    once(type, fn, target) { this.hasEventListener(type); this._eventTarget[type] = { fn, target }; }
    off(type) { delete this._eventTarget[type]; }
    setFlipY() {}
    destroy() {
      assert.ok(this._eventTarget, 'An owned frame is released once');
      releaseRefs.push(components.filter(component => component.spriteFrame === this));
      this._eventTarget = null;
    }
  }
  class Texture {
    constructor() { textures.push(this); }
    initWithSize(width, height) { this.width = width; this.height = height; }
    destroy() { assert.ok(!this.destroyed); this.destroyed = true; }
  }
  class Renderer {
    constructor() { this._frame = null; components.push(this); }
    get spriteFrame() { return this._frame; }
    set spriteFrame(value) {
      if (value === this._frame) return;
      // Creator's Sprite/Mask setters always unsubscribe from the previous
      // SpriteFrame. A destroyed _eventTarget makes this throw immediately.
      if (this._frame) this._frame.off('load', this.onLoad, this);
      this._frame = value;
      if (value && this.node.activeInHierarchy) value.once('load', this.onLoad, this);
    }
    onEnable() { if (this._frame) this._frame.once('load', this.onLoad, this); }
    onDisable() { if (this._frame) this._frame.off('load', this.onLoad, this); }
    onDestroy() { this.spriteFrame = null; }
    setMaterial() {}
  }
  class Sprite extends Renderer {}
  Sprite.SizeMode = { CUSTOM: 1 };
  class Mask extends Renderer {}
  Mask.Type = { IMAGE_STENCIL: 1 };
  class Node {
    constructor(name = 'node', parent = null) {
      Object.assign(this, { name, children: [], components: [], x: 0, y: 0, width: 40, height: 60,
        scaleX: 1, scaleY: 1, anchorX: .5, anchorY: 0, opacity: 255, color: { r: 255, g: 255, b: 255 }, zIndex: 0, _active: true });
      if (parent) this.parent = parent;
    }
    get parent() { return this._parent; }
    set parent(value) {
      if (this._parent) this._parent.children.splice(this._parent.children.indexOf(this), 1);
      this._parent = value;
      if (value) value.children.push(this);
    }
    get childrenCount() { return this.children.length; }
    get active() { return this._active; }
    set active(value) {
      if (value === this._active) return;
      this._active = value;
      this.notify(value);
    }
    get activeInHierarchy() { return this._active && !this.destroyed && (!this.parent || this.parent.activeInHierarchy); }
    notify(enabled) {
      this.components.forEach(component => component[enabled ? 'onEnable' : 'onDisable']());
      this.children.forEach(child => { if (child.active) child.notify(enabled); });
    }
    addComponent(Type) {
      const component = new Type(); component.node = this; this.components.push(component);
      if (this.activeInHierarchy) component.onEnable();
      return component;
    }
    setPosition(x, y) { this.x = x; this.y = y; }
    setContentSize(width, height) {
      if (typeof width === 'object') ({ width, height } = width);
      this.width = width; this.height = height;
    }
    setSiblingIndex(index) {
      const siblings = this.parent.children; siblings.splice(siblings.indexOf(this), 1); siblings.splice(index, 0, this);
    }
    convertToWorldSpaceAR(point) {
      const value = { x: this.x + point.x, y: this.y + point.y };
      return this.parent ? this.parent.convertToWorldSpaceAR(value) : value;
    }
    convertToNodeSpaceAR(point) {
      const origin = this.convertToWorldSpaceAR({ x: 0, y: 0 }); return { x: point.x - origin.x, y: point.y - origin.y };
    }
    destroy() { if (!this.queued && !this.destroyed) { this.queued = true; deferred.push(this); } }
    finishDestroy() {
      if (this.destroyed) return;
      this.components.forEach(component => { component.onDisable(); component.onDestroy(); });
      this.children.slice().forEach(child => child.finishDestroy());
      this.destroyed = true; this.parent = null;
    }
  }
  const cc = { Node, Sprite, Mask, RenderTexture: Texture, SpriteFrame: Frame, gfx: { RB_FMT_S8: 1 },
    v2: (x, y) => ({ x, y }), color: (r, g, b) => ({ r, g, b }), isValid: value => !!value && !value.destroyed,
    director: { off() {} }, Director: { EVENT_BEFORE_DRAW: 'draw' } };
  const context = { cc, sp: { Skeleton: class {} }, exports: {} };
  vm.runInNewContext(source, context, { filename: 'KinghtFallDepthView.js' });
  return { ...context.exports, cc, Node, Sprite, Mask, Frame, frames, textures, components, releaseRefs,
    flush() { deferred.splice(0).forEach(node => node.finishDestroy()); },
    assertSafeReleases() { assert.ok(releaseRefs.every(references => references.length === 0), 'Every owned frame detaches all consumers before destruction'); } };
}
function frameCache() { return { poses: new Set(), transforms: new Map(), bounds: new Map() }; }

function gateFixture() {
  const f = fixture(), main = new f.Node('main'), gateNode = new f.Node('gate', main), actor = { node: new f.Node('unit', main) };
  gateNode.zIndex = 10; actor.node.y = 10; actor.node.zIndex = 20;
  let width = 40;
  const slots = ['near', 'far'].map((name, index) => {
    const attachment = { name: 'rts_door_closed', computeWorldVertices(bone, points) {
      points.push(-width / 2, 0, -width / 2, 60, width / 2, 60, width / 2, 0);
    } };
    return { data: { name: 'rts_wall_leaf_' + name, index }, bone: { active: true }, color: { r: 1, g: 1, b: 1, a: 1 }, getAttachment: () => attachment };
  });
  const renderer = { enabled: true, node: gateNode, _startSlotIndex: -1, _endSlotIndex: -1,
    _skeleton: { slots, drawOrder: slots, skin: { name: 'cq-rts-1' }, color: { r: 1, g: 1, b: 1, a: 1 }, updateWorldTransform() {} },
    skeletonData: { skeletonJson: { wallDoor: { gate: true, tiers: [{ hinges: { left: { x: 0, y: 60 }, right: { x: 40, y: 60 } }, states: { closed: { width: 40, height: 60 } } }] } } },
    setSlotsRange(start, end) { this._startSlotIndex = start; this._endSlotIndex = end; }, markForRender() {} };
  const view = { main, game: { gameData: { bulidPointMap: { gate: { ndAniMain: renderer } } } }, renderNative() {}, snapshotActor: f.DepthView.prototype.snapshotActor };
  const pass = new f.GateOcclusion(view);
  const entry = { actor, sources: [], tint: { r: 140, g: 215, b: 255 }, bounds: { minX: -10, maxX: 10, minY: 10, maxY: 50 } };
  return { ...f, main, actor, renderer, pass, entry, grow(nextWidth = 100) { width = nextWidth; entry.bounds.minX = -nextWidth * .6; entry.bounds.maxX = nextWidth * .6; },
    update(active = [entry]) { pass.update(active, frameCache(), null); } };
}

test('gate tier/pose resizing detaches shared body, leaf and tint frames before reactivating masks', () => {
  const f = gateFixture(); f.update();
  assert.equal(f.pass.leaves.get(f.renderer).size, 2);
  const oldBody = f.pass.actors.get(f.actor).frame;
  const oldLeaves = [...f.pass.leaves.get(f.renderer).values()].map(record => record.frame);
  assert.ok(f.components.filter(component => component.spriteFrame === oldBody).length >= 2, 'One body serves multiple leaf records');
  f.grow(); f.update();
  assert.equal(oldBody._eventTarget, null); oldLeaves.forEach(frame => assert.equal(frame._eventTarget, null));
  assert.notEqual(f.pass.actors.get(f.actor).frame, oldBody);
  for (const record of f.pass.leaves.get(f.renderer).values()) {
    const overlay = record.overlays.get(f.actor);
    assert.equal(overlay.node.active, true); assert.equal(overlay.tint.node.active, true);
    for (const component of [overlay.mask, overlay.sprite, overlay.tint.mask, overlay.tint.sprite]) assert.ok(component.spriteFrame._eventTarget);
  }
  for (const width of [140, 90, 180, 120, 220, 100]) { f.grow(width); f.update(); }
  f.actor.node.y = -10; f.actor.node.zIndex = 0; f.update();
  for (const record of f.pass.leaves.get(f.renderer).values()) assert.equal(record.overlays.get(f.actor).tint.node.active, false);
  f.pass.destroy(); f.flush(); f.assertSafeReleases();
});

test('stale gate overlays detach before deferred destruction and actor-capture cleanup', () => {
  const f = gateFixture(); f.update();
  const owned = f.frames.slice();
  f.update([]);
  assert.equal(f.pass.leaves.size, 0); assert.equal(f.pass.actors.size, 0);
  owned.forEach(frame => assert.equal(frame._eventTarget, null));
  f.flush(); f.assertSafeReleases();
  assert.ok(f.components.every(component => component.spriteFrame === null));
});

test('gate disposal does not destroy a borrowed frame assigned over an owned capture', () => {
  const f = gateFixture(); f.update();
  const record = f.pass.leaves.get(f.renderer).values().next().value, borrowed = new f.Frame({ borrowed: true });
  record.overlays.get(f.actor).sprite.spriteFrame = borrowed;
  f.pass.destroy(); f.flush(); f.assertSafeReleases();
  assert.ok(borrowed._eventTarget, 'Only generated capture assets belong to the compositor');
});

test('ordinary object and actor captures survive resize, actor retirement and deferred view teardown', () => {
  const f = fixture(), main = new f.Node('main'), obstacle = new f.Node('obstacle', main), actorNode = new f.Node('unit', main);
  actorNode.y = 10; actorNode.width = 20; actorNode.height = 40; actorNode.zIndex = -1;
  const actor = { node: actorNode, hp: 10, spAni: { enabled: true, node: actorNode } };
  const borrowed = new f.Frame({ borrowed: true }), source = { enabled: true, node: obstacle, spriteFrame: borrowed };
  const overlayNode = new f.Node('ObjectStencil', main), object = { node: obstacle, sources: [source], masks: new Map(),
    overlay: { node: overlayNode, mask: overlayNode.addComponent(f.Mask) } };
  const view = Object.assign(Object.create(f.DepthView.prototype), { main, nativeCapture: true, captureSupported: true, nativeActors: new Map(), objects: [object],
    game: { ctrPlay: actor, gameData: { getSoldierList: () => [], getEnemyList: () => [] } }, sort() {}, renderNative() {},
    makeMask(object, actor) { const node = new f.Node('ObjectActor', object.overlay.node), mask = { node, sprite: node.addComponent(f.Sprite) }; object.masks.set(actor, mask); return mask; } });
  view.update();
  const oldObject = object.frame, oldActor = view.nativeActors.get(actor).frame;
  obstacle.width = actorNode.width = 100; source.spriteFrame = new f.Frame({ anotherBorrowed: true });
  view.update();
  assert.equal(oldObject._eventTarget, null); assert.equal(oldActor._eventTarget, null);
  assert.ok(object.overlay.mask.spriteFrame._eventTarget);
  assert.ok(object.masks.get(actor).sprite.spriteFrame._eventTarget);
  actor.hp = 0; view.update();
  assert.equal(view.nativeActors.size, 0); assert.equal(object.masks.size, 0);
  f.flush(); view.destroy(); f.flush(); f.assertSafeReleases();
  assert.ok(borrowed._eventTarget); assert.ok(source.spriteFrame._eventTarget);
});

test('animated actor bounds reuse capacity over 240 frames while capture centers follow the live pose', () => {
  const f = fixture(), calls = [], record = {};
  const view = { renderNative(sources, center, height, texture) { calls.push({ center, height, texture }); } };
  for (let frame = 0; frame < 240; frame++) {
    const width = frame === 80 ? 145 : 76 + 9 * Math.sin(frame * .3), height = 94 + 7 * Math.sin(frame * .27);
    const x = frame * 3, y = 15 + Math.sin(frame * .13) * 5;
    const box = { minX: x - width / 2, maxX: x + width / 2, minY: y, maxY: y + height };
    f.DepthView.prototype.snapshotActor.call(view, record, [], box, 4);
    assert.ok(Math.abs(record.center.x - x) < 1e-7);
    assert.ok(Math.abs(record.center.y - (y + height / 2)) < 1e-7);
    assert.ok(record.size.width >= width + 4 && record.size.height >= height + 4, 'High-water bounds contain the whole animated body');
  }
  assert.equal(calls.length, 240, 'Every animated pose is still captured');
  assert.equal(f.textures.length, 2, 'One ordinary allocation and one larger attack allocation; shrinking and movement reuse capacity');
  assert.equal(f.frames.length, 2);
  assert.equal(f.frames[0]._eventTarget, null);
  assert.ok(f.frames[1]._eventTarget);
  f.assertSafeReleases();
});
