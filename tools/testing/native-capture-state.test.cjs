'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

// Model Creator 2.4.13's native RenderFlow.cpp: every manual camera pass
// updates/clears transforms for ALL nodes, but Sprite buffers only update in
// the rendered subtree. Spine draws its matrix directly and hides this fault.
function fixture() {
  const flow = { FLAG_WORLD_TRANSFORM: 8, FLAG_OPACITY: 32 };
  const WORLD_CHANGED = 1 << 30, OPACITY_CHANGED = 1 << 31;
  class Node {
    constructor(name, parent) {
      Object.assign(this, { name, parent, children: [], activeInHierarchy: true,
        x: 0, worldX: 0, scaleX: 1, worldScaleX: 1, opacity: 255, realOpacity: 255, _renderFlag: 40 });
      if (parent) parent.children.push(this);
    }
    move(x) { this.x = x; this._renderFlag |= flow.FLAG_WORLD_TRANSFORM; }
    fade(value) { this.opacity = value; this._renderFlag |= flow.FLAG_OPACITY; }
    scale(value) { this.scaleX = value; this._renderFlag |= flow.FLAG_WORLD_TRANSFORM; }
    setPosition() {} setContentSize() {}
  }
  const scene = new Node('scene'), map = new Node('map', scene), hero = new Node('hero', map);
  const follow = new Node('follow ring', hero), body = new Node('body', hero), ui = new Node('ui', scene);
  const joystick = new Node('joystick', ui), knob = new Node('knob', joystick);
  const popup = new Node('building popup', ui), panel = new Node('panel', popup);
  const wall = new Node('wall', map), wallArt = new Node('wall artwork', wall);
  const cost = new Node('barracks cost', map), coin = new Node('silver coin', cost);
  const hp = new Node('health bar', hero), hpBackground = new Node('health background', hp), hpFill = new Node('health fill', hp);
  const overlay = new Node('occlusion', map);
  const sprites = [follow, knob, panel, wallArt, coin, hpBackground, hpFill];
  const nodes = [];
  function visit(node, action) { action(node); node.children.forEach(child => visit(child, action)); }
  visit(scene, node => nodes.push(node));
  function render(root) {
    for (const node of nodes) node._renderFlag &= ~(WORLD_CHANGED | OPACITY_CHANGED);
    for (const node of nodes) {
      const parent = node.parent;
      if ((node._renderFlag & flow.FLAG_WORLD_TRANSFORM) || parent && (parent._renderFlag & WORLD_CHANGED)) {
        node.worldX = node.x * (parent ? parent.worldScaleX : 1) + (parent ? parent.worldX : 0);
        node.worldScaleX = node.scaleX * (parent ? parent.worldScaleX : 1);
        node._renderFlag = (node._renderFlag & ~flow.FLAG_WORLD_TRANSFORM) | WORLD_CHANGED;
      }
      if ((node._renderFlag & flow.FLAG_OPACITY) || parent && (parent._renderFlag & OPACITY_CHANGED)) {
        node.realOpacity = node.opacity * (parent ? parent.realOpacity : 255) / 255;
        node._renderFlag = (node._renderFlag & ~flow.FLAG_OPACITY) | OPACITY_CHANGED;
      }
    }
    visit(root, node => {
      if (sprites.includes(node) && (node.vertexX === undefined || node._renderFlag & (WORLD_CHANGED | OPACITY_CHANGED))) {
        node.vertexX = node.worldX; node.vertexOpacity = node.realOpacity; node.vertexScaleX = node.worldScaleX;
      }
    });
  }
  const camera = { captures: 0, render(node) { this.captures++; render(node); if (this.fail) throw Error('capture failed'); } };
  const cc = { RenderFlow: flow, director: { getScene: () => scene }, v2: (x, y) => ({ x, y }),
    color: () => ({}), isValid: () => true, Camera: { ClearFlags: { COLOR: 1, DEPTH: 2, STENCIL: 4 } } };
  const context = { exports: {}, cc, sp: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/_script/KinghtFallDepthView.js'), 'utf8'), context);
  const { DepthView } = context.exports;
  const actor = { node: hero, hp: 100, spAni: { node: body, enabled: true } };
  const mask = { node: new Node('silhouette', overlay) };
  const object = { node: wall, sources: [{ node: wallArt, enabled: true }], masks: new Map([[actor, mask]]), center: {}, size: {}, frame: {}, overlay: { node: overlay, mask: {} } };
  const view = Object.assign(Object.create(DepthView.prototype), {
    nativeCapture: true, captureSupported: true, nativeActors: new Map(), objects: [object],
    main: Object.assign(map, { convertToNodeSpaceAR: p => p, convertToWorldSpaceAR: p => p }),
    game: { ctrPlay: actor, gameData: { getSoldierList: () => [], getEnemyList: () => [] } },
    camera, cameraNode: new Node('camera', scene), sort() {},
    snapshot() { this.renderNative([{ enabled: true, node: wallArt }], { x: 0, y: 0 }, 100, {}); },
    syncNativeMask() { this.renderNative([{ enabled: true, node: body }], { x: 0, y: 0 }, 100, {}); }
  });
  // Only bounds/overlap setup is stubbed; execute the production capture batch.
  context.bounds = () => ({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  context.point = () => ({ x: 0, y: -1 });
  wall.y = 0; hero.y = 5;
  render(scene);
  return { view, scene, hero, follow, joystick, knob, popup, panel, wallArt, camera, render, cost, coin, hp, hpBackground, hpFill };
}

test('native occlusion captures preserve follow, joystick release and popup updates for the main draw', () => {
  const f = fixture();
  for (let frame = 1; frame <= 60; frame++) {
    f.hero.move(frame * 7);
    f.joystick.move(frame % 2 ? 120 : 0); f.knob.move(frame % 2 ? 50 : 0);
    f.popup.move(frame * 3); f.popup.fade(frame % 2 ? 255 : 160);
    f.view.update(); f.render(f.scene);
    assert.equal(f.follow.vertexX, f.hero.worldX, 'follow ring retained its previous location');
    assert.equal(f.knob.vertexX, f.joystick.x + f.knob.x, 'released joystick retained its drag position');
    assert.equal(f.panel.vertexX, f.popup.worldX, 'popup panel missed layout movement');
    assert.equal(f.panel.vertexOpacity, f.popup.opacity, 'popup panel missed inherited opacity');
  }
  // No movement on the next frame must still show the last released state.
  f.view.update(); f.render(f.scene);
  assert.equal(f.knob.vertexX, 0);
  assert.equal(f.camera.captures, 122);
});

test('each native capture refreshes the selected Sprite even after an earlier capture consumed its flags', () => {
  const f = fixture();
  f.wallArt.move(75);
  f.view.renderNative([{ enabled: true, node: f.hero }], { x: 0, y: 0 }, 100, {});
  f.view.renderNative([{ enabled: true, node: f.wallArt }], { x: 0, y: 0 }, 100, {});
  assert.equal(f.wallArt.vertexX, 75);
});

test('failed native capture restores scene inheritance and detaches its target texture', () => {
  const f = fixture(); f.hero.move(90); f.camera.fail = true;
  assert.throws(() => f.view.update(), /capture failed/);
  assert.equal(f.camera.targetTexture, null);
  f.render(f.scene);
  assert.equal(f.follow.vertexX, 90);
});

test('frames with no occlusion capture do not force scene transform updates', () => {
  const f = fixture();
  f.hero.y = -5; f.scene._renderFlag = 0;
  f.view.update();
  assert.equal(f.scene._renderFlag, 0);
});

test('native captures cannot freeze an animated barracks cost scale or leave the HP background behind its fill', () => {
  const f = fixture();
  for (const scale of [.01, .3, .8, 1.2, 1]) {
    f.cost.scale(scale); f.hero.move(f.hero.x + 10); f.hp.move(15);
    f.view.update(); f.render(f.scene);
    assert.equal(f.coin.vertexScaleX, scale, 'cost coin froze at an intermediate reveal scale');
    assert.equal(f.hpBackground.vertexX, f.hpFill.vertexX);
    assert.equal(f.hpBackground.vertexX, f.hero.worldX + 15);
  }
  f.hp.fade(0); f.view.update(); f.render(f.scene);
  assert.equal(f.hpBackground.vertexOpacity, 0); assert.equal(f.hpFill.vertexOpacity, 0);
  assert.equal(f.coin.vertexScaleX, 1, 'finished reveal must restore full size');
});
