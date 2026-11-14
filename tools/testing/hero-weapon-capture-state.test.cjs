'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../assets/_script/HeroWeaponIcon.js'), 'utf8');

function fixture(options = {}) {
  const native = options.native !== false, flags = 2 | 4, other = 64;
  const cameras = [], textures = [], log = [];
  class Node {
    constructor(name) { Object.assign(this, {name, children: [], components: [], width: 128, height: 128, x: 0, y: 0, _renderFlag: other | (native ? flags : 0), targetWorld: 37, targetOpacity: 197, vertexWorld: -1, vertexOpacity: 0}); }
    setParent(parent) { this.parent = parent; parent.children.push(this); }
    setPosition(x, y) { this.x = x; this.y = y; }
    convertToWorldSpaceAR(point) { return {x: this.x + point.x, y: this.y + point.y}; }
    addComponent(Type) { const component = new Type(); component.node = this; this.components.push(component); return component; }
    getComponent(Type) { return this.components.find(component => component instanceof Type); }
    destroy() { this.destroyed = true; log.push('camera-destroy'); }
  }
  const scene = new Node('Scene'), world = new Node('Unrelated world'), hud = new Node('Unrelated HUD'), card = new Node('Weapon card'), weapon = new Node('Weapon pose');
  world.setParent(scene); hud.setParent(scene); card.setParent(scene); weapon.setParent(card);
  function walk(node, callback) { callback(node); node.children.forEach(child => walk(child, callback)); }
  class Camera {
    constructor() { cameras.push(this); }
    set targetTexture(texture) { this._target = texture; log.push(texture ? 'target-attach' : 'target-detach'); }
    get targetTexture() { return this._target; }
    render(root) {
      assert.equal(root, weapon, 'Only weapon artwork is captured'); log.push('render');
      // JSB clears scene-wide transform/opacity ownership for a subtree draw,
      // but only that subtree receives newly generated vertices.
      if (native) walk(scene, node => { node._renderFlag &= ~flags; });
      if (options.renderThrows) throw Error('fixture render failure');
    }
  }
  Camera.ClearFlags = {COLOR: 1, DEPTH: 2, STENCIL: 4};
  class RenderTexture {
    constructor() { this.destroys = 0; textures.push(this); }
    initWithSize(width, height) { this.width = width; this.height = height; if (options.initThrows) throw Error('fixture target initialization failure'); }
    readPixels() { const pixels = new Uint8Array(this.width * this.height * 4); pixels[(120 * this.width + 100) * 4 + 3] = 255; pixels[(180 * this.width + 160) * 4 + 3] = 255; return pixels; }
    destroy() { assert(cameras.every(camera => camera.targetTexture === null), 'Every camera must detach before a captured texture is destroyed'); assert.equal(this.destroys++, 0, 'Only owned targets are released, exactly once'); log.push('texture-destroy'); }
  }
  const cc = {Node, Camera, RenderTexture, Component: class {}, Class: () => class {}, sys: {isNative: native}, RenderFlow: {FLAG_WORLD_TRANSFORM: 2, FLAG_OPACITY: 4}, director: {getScene: () => scene}, v2: (x, y) => ({x, y}), color: () => ({})};
  const exports = {};
  vm.runInNewContext(source + '\nexports.measureForTest = visibleShape;', {exports, cc, WeakMap, require(name) { assert.equal(name, 'HeroItemLooks'); return {}; }});
  // Native normal rendering inherits the root's dirty flags. This deliberately
  // does not repair flags itself: a missing capture finally leaves stale HUD
  // position/opacity vertices and the assertions below fail.
  function normalRender(node = scene, inherited = 0) {
    const dirty = inherited | node._renderFlag;
    if (dirty & 2) node.vertexWorld = node.targetWorld;
    if (dirty & 4) node.vertexOpacity = node.targetOpacity;
    node._renderFlag &= ~flags;
    node.children.forEach(child => normalRender(child, dirty & flags));
  }
  return {api: exports, cc, scene, world, hud, weapon, cameras, textures, log, walk, normalRender, pose: {node: weapon, signature: 'fixed authored idle pose'}};
}

for (const throws of [false, true]) test('native weapon pixel capture allows the following world and HUD draw to update ' + (throws ? 'when rendering throws' : 'after success'), () => {
  const h = fixture({renderThrows: throws}), result = h.api.measureForTest(h.pose);
  if (throws) assert.equal(result, null); else assert(result.width > 0 && result.height > 0);
  assert.equal(h.cameras.length, 1); assert.equal(h.cameras[0].targetTexture, null); assert(h.cameras[0].node.destroyed);
  assert.equal(h.textures.length, 1); assert.equal(h.textures[0].destroys, 1);
  assert(h.log.indexOf('target-detach') < h.log.indexOf('texture-destroy'));
  h.normalRender();
  for (const node of [h.world, h.hud]) {
    assert.equal(node.vertexWorld, node.targetWorld, node.name + ' gets current world vertices');
    assert.equal(node.vertexOpacity, node.targetOpacity, node.name + ' gets its current visible opacity');
    assert.equal(node._renderFlag & 64, 64, 'Unrelated native render flags survive');
  }
});

test('cached weapon silhouettes do not capture again or dirty the scene', () => {
  const h = fixture(), first = h.api.measureForTest(h.pose);
  h.walk(h.scene, node => { node._renderFlag = 64; });
  assert.equal(h.api.measureForTest(h.pose), first);
  assert.equal(h.cameras.length, 1); assert.equal(h.textures.length, 1);
  h.walk(h.scene, node => assert.equal(node._renderFlag, 64));
});

test('browser weapon capture releases owned targets without native scene reflagging', () => {
  const h = fixture({native: false}); assert(h.api.measureForTest(h.pose));
  h.walk(h.scene, node => assert.equal(node._renderFlag, 64));
  assert.equal(h.cameras[0].targetTexture, null); assert.equal(h.textures[0].destroys, 1);
});

test('an unavailable capture API or an unrendered initialization failure cannot dirty native scene state', () => {
  const h = fixture({initThrows: true}); h.walk(h.scene, node => { node._renderFlag = 64; });
  assert.equal(h.api.measureForTest(h.pose), null); assert.equal(h.cameras.length, 0); assert.equal(h.textures[0].destroys, 1);
  h.walk(h.scene, node => assert.equal(node._renderFlag, 64));
  h.cc.RenderTexture = null;
  assert.equal(h.api.measureForTest({...h.pose, signature: 'no readback API'}), null); assert.equal(h.textures.length, 1);
  h.walk(h.scene, node => assert.equal(node._renderFlag, 64));
});
