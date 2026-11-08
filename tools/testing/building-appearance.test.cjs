'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function fixture(weapon = false) {
  class Node {
    constructor(name) { this.name = name; this.active = true; this.x = this.y = this.angle = 0; this.scaleX = this.scaleY = 1; this.components = []; this.anchorX = this.anchorY = .5; }
    setContentSize(width, height) { this.width = width; this.height = height; }
    setAnchorPoint(x, y) { this.anchorX = x; this.anchorY = y; }
    setPosition(x, y) { this.x = x; this.y = y; }
    setScale(x, y = x) { this.scaleX = x; this.scaleY = y; }
    addComponent(type) { const component = new type(); component.node = this; this.components.push(component); return component; }
    convertToWorldSpaceAR(p) {
      const angle = this.angle * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
      const local = { x: this.x + c * p.x * this.scaleX - s * p.y * this.scaleY, y: this.y + s * p.x * this.scaleX + c * p.y * this.scaleY };
      return this.parent ? this.parent.convertToWorldSpaceAR(local) : local;
    }
    convertToNodeSpaceAR(p) {
      const local = this.parent ? this.parent.convertToNodeSpaceAR(p) : p;
      const angle = -this.angle * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle), x = local.x - this.x, y = local.y - this.y;
      return { x: (c * x - s * y) / this.scaleX, y: (s * x + c * y) / this.scaleY };
    }
    destroy() { this.destroyed = true; }
  }
  class Sprite {} Sprite.SizeMode = { CUSTOM: 0 };
  class Graphics { moveTo() {} lineTo() {} close() {} fill() {} }
  const cc = { Node, Sprite, Graphics, isValid: value => !!value && !value.destroyed,
    color: (...values) => values, Color: { WHITE: 'white' }, v2: (x, y) => ({ x, y }),
    Tween: { stopAllByTarget() {} }, tween: () => ({ to() { return this; }, call() { return this; }, start() {} }) };
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/BuildingAppearance.js'), 'utf8'), { cc, exports: mod.exports, module: mod });
  const loads = [], node = new Node('tower'), shot = new Node('shot'); shot.parent = node; shot.setPosition(-3, 97);
  const owner = { node, ndShot: shot, ndAniMain: { enabled: true }, ndAniOther: [],
    buildInfo: { cfg: { Appearance: { sprite: 'buildings/towers/cannon-1', width: 187, height: 212, offsetY: -38, muzzleX: 40, muzzleY: 130 }, Tower: { attackType: 'cannon' } } },
    loadSpriteFrame(bundle, path, callback) { loads.push({ bundle, path, callback }); } };
  if (weapon) owner.buildInfo.cfg.Appearance.weapon = { sprite: 'buildings/towers/cannon-1-weapon', width: 120, height: 80,
    pivotX: .25, pivotY: .4, offsetX: 0, offsetY: 150, muzzleX: 80, muzzleY: 12 };
  return { api: mod.exports, owner, loads, Node };
}

test('static artwork waits for its frame and preserves collider-owning skeleton nodes', () => {
  const h = fixture(); h.api.apply(h.owner);
  assert.equal(h.owner.ndAniMain.enabled, true, 'keep fallback visible until the sprite arrives');
  assert.equal(h.loads[0].bundle, 'resources'); h.loads[0].callback({ name: 'cannon-1' });
  const state = h.owner._buildingAppearance;
  assert.equal(h.owner.ndAniMain.enabled, false); assert.equal(h.owner.node.active, true);
  assert.equal(state.node.parent, h.owner.node); assert.equal(state.node.anchorY, 0);
  assert.equal(state.node.width, 187); assert.equal(state.node.height, 212); assert.equal(state.node.y, -38);
  assert.equal(h.owner.ndShot.x, 40); assert.equal(h.owner.ndShot.y, 130);
  h.api.apply(h.owner); assert.equal(h.loads.length, 1, 'reapplying a loaded level does not load another frame');
});

test('out-of-order loads cannot replace an upgraded tower or revive a sold tower', () => {
  const h = fixture(); h.api.apply(h.owner);
  h.owner.buildInfo.cfg.Appearance.sprite = 'buildings/towers/cannon-2'; h.api.apply(h.owner);
  h.loads[0].callback({ name: 'old' }); assert.equal(h.owner._buildingAppearance.node, null);
  h.loads[1].callback({ name: 'new' }); assert.equal(h.owner._buildingAppearance.sprite.spriteFrame.name, 'new');
  h.owner.buildInfo.cfg = null; h.api.apply(h.owner);
  assert.equal(h.owner._buildingAppearance.node.active, false); assert.equal(h.owner.ndAniMain.enabled, true);
  assert.equal(h.owner.ndShot.x, -3); assert.equal(h.owner.ndShot.y, 97);
  h.loads[1].callback({ name: 'late' }); assert.equal(h.owner._buildingAppearance.node.active, false);
});

test('death and repair retain selected artwork and disposal invalidates pending callbacks', () => {
  const h = fixture(); h.api.apply(h.owner); h.loads[0].callback({ name: 'cannon' });
  h.owner.isDestroyed = true; h.api.onDead(h.owner);
  assert.equal(h.owner._buildingAppearance.node.scaleY, .72);
  h.owner.isDestroyed = false; h.api.apply(h.owner); assert.equal(h.owner._buildingAppearance.node.scaleY, 1);
  h.api.fire(h.owner); assert.equal(h.owner._buildingAppearance.flash.active, true);
  const artwork = h.owner._buildingAppearance.node, flash = h.owner._buildingAppearance.flash;
  h.api.dispose(h.owner); assert.equal(artwork.destroyed, true); assert.equal(flash.destroyed, true);
  assert.equal(h.owner.ndAniMain.enabled, true); assert.equal(h.owner._buildingAppearance, null);
  h.loads[0].callback({ name: 'stale' }); assert.equal(h.owner._buildingAppearance, null);
});

test('shot muzzle uses the building-local authored position in the game effects layer', () => {
  const h = fixture(); h.owner.node.setPosition(250, 400);
  h.api.apply(h.owner); h.loads[0].callback({ name: 'cannon' });
  const parent = new h.Node('effects'); parent.setPosition(100, 200);
  const point = h.api.muzzle(h.owner, { ndUI: parent });
  assert.equal(point.x, 190); assert.equal(point.y, 330);
});

test('tower health bar stays above the selected artwork and restores the original anchor', () => {
  const h = fixture(), hp = h.owner.ndHp = new h.Node('HP anchor'), bar = new h.Node('HP bar');
  hp.parent = h.owner.node; hp.setPosition(0, 163);
  bar.parent = new h.Node('UI'); h.owner.ctrHp = { node: bar };
  h.api.apply(h.owner); h.loads[0].callback({ name: 'cannon' });
  assert.equal(hp.y, 184); assert.equal(bar.y, 184);
  h.owner.buildInfo.cfg.Appearance.height = 250; h.api.apply(h.owner);
  assert.equal(hp.y, 222); assert.equal(bar.y, 222);
  h.owner.buildInfo.cfg = null; h.api.apply(h.owner);
  assert.equal(hp.y, 163); assert.equal(bar.y, 163);
});

for (const first of [0, 1]) test('layered tower keeps its fallback until both frames arrive, arrival order ' + first, () => {
  const h = fixture(true); h.owner.node.group = 'world'; h.api.apply(h.owner);
  assert.equal(h.api.ready(h.owner), false);
  assert.equal(h.loads.length, 2); h.loads[first].callback({ name: first ? 'weapon' : 'base' });
  assert.equal(h.owner.ndAniMain.enabled, true); assert.equal(h.owner._buildingAppearance.node, null);
  assert.equal(h.api.ready(h.owner), false);
  h.loads[1 - first].callback({ name: first ? 'base' : 'weapon' });
  const state = h.owner._buildingAppearance;
  assert.equal(h.owner.ndAniMain.enabled, false); assert.equal(state.node.active, true); assert.equal(state.weaponPivot.active, true);
  assert.equal(h.api.ready(h.owner), true);
  assert.equal(state.weaponPivot.parent, h.owner.node); assert.equal(state.weaponNode.parent, state.weaponPivot);
  assert.equal(state.weaponNode.anchorX, .25); assert.equal(state.weaponNode.anchorY, .4);
  assert.equal(state.weaponNode.width, 120); assert.equal(state.weaponNode.height, 80);
  assert.equal(state.node.group, 'world'); assert.equal(state.weaponPivot.group, 'world'); assert.equal(state.weaponNode.group, 'world');
});

test('weapon recoil leaves its base fixed, follows aim, and returns the muzzle and flash to rest', () => {
  const h = fixture(true); h.api.apply(h.owner); h.loads[0].callback({}); h.loads[1].callback({});
  const target = new h.Node('target'); target.setPosition(-300, 200); h.api.aim(h.owner, target);
  const state = h.owner._buildingAppearance, base = { x: state.node.x, y: state.node.y, angle: state.node.angle, scaleX: state.node.scaleX, scaleY: state.node.scaleY };
  assert.equal(state.weaponPivot.scaleX, -1);
  const before = h.api.muzzle(h.owner, { ndUI: new h.Node('effects') }); h.api.fire(h.owner);
  assert.equal(state.weaponNode.x < 0, true); assert.equal(state.flash.parent, state.weaponNode);
  const recoil = h.api.muzzle(h.owner, { ndUI: new h.Node('effects') });
  assert(Math.hypot(recoil.x - before.x, recoil.y - before.y) > 4.9);
  target.setPosition(300, 300); h.api.aim(h.owner, target); assert.equal(state.weaponPivot.scaleX, 1);
  h.api.step(h.owner, .12); assert.equal(state.flash.active, true); assert(state.flash.opacity < 230);
  h.api.step(h.owner, 1); assert.equal(state.weaponNode.x, 0); assert.equal(state.weaponNode.y, 0); assert.equal(state.flash.active, false);
  assert.deepEqual({ x: state.node.x, y: state.node.y, angle: state.node.angle, scaleX: state.node.scaleX, scaleY: state.node.scaleY }, base);
});

test('death invalidates pending layers; repair can load a complete pair and a failed frame keeps the fallback', () => {
  const h = fixture(true); h.api.apply(h.owner);
  h.loads[0].callback({}); h.owner.isDestroyed = true; h.api.onDead(h.owner); h.loads[1].callback({});
  assert.equal(h.owner._buildingAppearance.node, null); assert.equal(h.owner.ndAniMain.enabled, true);
  h.owner.isDestroyed = false; h.api.apply(h.owner); h.loads[2].callback({}); h.loads[3].callback(null);
  assert.equal(h.owner._buildingAppearance.node, null); assert.equal(h.owner.ndAniMain.enabled, true);
  h.api.apply(h.owner); h.loads[4].callback({}); h.loads[5].callback({});
  const state = h.owner._buildingAppearance; assert.equal(state.weaponPivot.active, true);
  h.owner.isDestroyed = true; h.api.onDead(h.owner); assert.equal(state.weaponPivot.active, false);
  h.owner.isDestroyed = false; h.api.apply(h.owner); assert.equal(state.weaponPivot.active, true); assert.equal(h.loads.length, 6);
  h.owner.buildInfo.cfg = null; h.api.apply(h.owner);
  assert.equal(state.node.active, false); assert.equal(state.weaponPivot.active, false); assert.equal(h.owner.ndAniMain.enabled, true);
  assert.equal(h.owner.ndShot.x, -3); assert.equal(h.owner.ndShot.y, 97);
});

test('a weapon-only asset change and disposal retire both outstanding layers', () => {
  const h = fixture(true); h.api.apply(h.owner);
  h.owner.buildInfo.cfg.Appearance.weapon.sprite = 'buildings/towers/cannon-2-weapon'; h.api.apply(h.owner);
  h.loads[0].callback({ name: 'old base' }); h.loads[1].callback({ name: 'old weapon' });
  assert.equal(h.owner._buildingAppearance.node, null);
  h.loads[2].callback({ name: 'new base' }); h.loads[3].callback({ name: 'new weapon' });
  const state = h.owner._buildingAppearance;
  assert.equal(state.weaponSprite.spriteFrame.name, 'new weapon');
  h.api.dispose(h.owner); assert.equal(state.weaponPivot.destroyed, true); assert.equal(h.owner._buildingAppearance, null);
  h.loads[2].callback({ name: 'late' }); h.loads[3].callback({ name: 'late' }); assert.equal(h.owner._buildingAppearance, null);
});

test('production tower families each contain three imported levels with independent tuning', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallConfig/GameJsonCfg.json')));
  const levels = cfg.BuildEnum['2'].levelList;
  for (const type of ['cannon', 'sniper']) {
    const rows = levels.filter(row => row.Tower?.attackType === type);
    assert.deepEqual(rows.map(row => row.level), [1, 2, 3]);
    for (const row of rows) {
      const file = path.join(root, 'assets/resources', row.Appearance.sprite + '.png');
      assert.equal(fs.readFileSync(file).subarray(1, 4).toString(), 'PNG');
      const meta = JSON.parse(fs.readFileSync(file + '.meta'));
      assert.equal(meta.type, 'sprite'); assert.equal(Object.values(meta.subMetas)[0].trimType, 'none');
      assert.equal(row.ColliderIndex >= 1 && row.ColliderIndex <= 3, true);
      assert.ok(row.Data[0] > 0 && row.Data[1] > 0 && row.Data[2] > 0);
    }
  }
  assert.deepEqual(cfg.BuildEnum['3'].InitialChoices.map(index => cfg.BuildEnum['3'].levelList[index - 1].Data[1]), [90001, 90002, 90003, 90004]);
});
