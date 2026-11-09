'use strict';
// Independent scene-transform and lifecycle audit. No editor, simulator or game
// is launched; this executes the shipped artwork helper and tower controller.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const { setup } = require('./backend-gameplay-harness.cjs');
const close = (a, b, label = '') => assert(Math.abs(a - b) < 1e-6, `${label}: ${a} != ${b}`);
const pointClose = (a, b, label = '') => { close(a.x, b.x, label + ' x'); close(a.y, b.y, label + ' y'); };
function localMuzzle(h) {
  const weapon=h.owner.buildInfo.cfg.Appearance.weapon,state=h.owner._buildingAppearance;
  const view=weapon.views?.[state.weaponView]||weapon;
  return{x:view.muzzleX,y:view.muzzleY};
}

function fixture(type = 'cannon', level = 1) {
  class Vec2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    clone() { return new Vec2(this.x, this.y); }
    sub(value) { return new Vec2(this.x - value.x, this.y - value.y); }
    add(value) { return new Vec2(this.x + value.x, this.y + value.y); }
    len() { return Math.hypot(this.x, this.y); }
  }
  class Node {
    constructor(name) { Object.assign(this, { name, active: true, x: 0, y: 0, angle: 0, scaleX: 1, scaleY: 1, opacity: 255, children: [], components: [], anchorX: .5, anchorY: .5 }); }
    set parent(value) { if (this._parent) this._parent.children = this._parent.children.filter(n => n !== this); this._parent = value; if (value) value.children.push(this); }
    get parent() { return this._parent; }
    get activeInHierarchy() { return this.active && (!this.parent || this.parent.activeInHierarchy); }
    setParent(value) { this.parent = value; }
    getPosition(out = new Vec2()) { out.x = this.x; out.y = this.y; return out; }
    setPosition(x, y) { if (typeof x === 'object') ({ x, y } = x); this.x = x; this.y = y; }
    setContentSize(width, height) { this.width = width; this.height = height; }
    setAnchorPoint(x, y) { this.anchorX = x; this.anchorY = y; }
    setScale(x, y = x) { this.scaleX = x; this.scaleY = y; }
    addComponent(Type) { const component = new Type(); component.node = this; this.components.push(component); return component; }
    getComponent(Type) { return this.components.find(c => c instanceof Type); }
    getComponents(Type) { return this.components.filter(c => c instanceof Type); }
    convertToWorldSpaceAR(p) {
      const radians = this.angle * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
      const local = new Vec2(this.x + p.x * this.scaleX * c - p.y * this.scaleY * s, this.y + p.x * this.scaleX * s + p.y * this.scaleY * c);
      return this.parent ? this.parent.convertToWorldSpaceAR(local) : local;
    }
    convertToNodeSpaceAR(p) {
      const local = this.parent ? this.parent.convertToNodeSpaceAR(p) : p;
      const radians = -this.angle * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
      return new Vec2(((local.x - this.x) * c - (local.y - this.y) * s) / this.scaleX, ((local.x - this.x) * s + (local.y - this.y) * c) / this.scaleY);
    }
    destroy() { this.destroyed = true; this.children.forEach(c => c.destroy()); }
  }
  class Sprite { constructor() { this.enabled = true; } } Sprite.SizeMode = { CUSTOM: 0 };
  class Graphics { clear() {} moveTo() {} lineTo() {} close() {} fill() {} }
  const tweens = [];
  const cc = { Node, Sprite, Graphics, Vec2, v2: (x, y) => typeof x === 'object' ? new Vec2(x.x, x.y) : new Vec2(x, y),
    Color: { WHITE: 'white' }, color: (...values) => values, isValid: value => !!value && !value.destroyed,
    Tween: { stopAllByTarget(target) { tweens.filter(t => t.target === target).forEach(t => t.stopped = true); } },
    tween(target) { const t = { target, actions: [], to(duration, props) { this.actions.push({ duration, props }); return this; },
      call(fn) { this.actions.push({ fn }); return this; }, start() { tweens.push(this); return this; }, stop() { this.stopped = true; } }; return t; } };
  const node = new Node('Tower'), shot = new Node('Shot'); shot.parent = node; shot.setPosition(-4, 91);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallConfig/GameJsonCfg.json')));
  const row = config.BuildEnum['2'].levelList.find(r => r.Tower?.attackType === type && r.level === level);
  assert(row?.Appearance?.weapon, `${type} level ${level} must retain its production weapon layer`);
  const weapon = row.Appearance.weapon;
  const loads = [], owner = { node, ndShot: shot, ndAniMain: { enabled: true }, ndAniOther: [], enabled: true, isDestroyed: false,
    buildInfo: { cfg: row }, loadSpriteFrame(bundle, file, done) { loads.push({ bundle, file, done }); } };
  const game = { ndUI: new Node('Effects') };
  const mod = { exports: {} };
  const lighting = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/BuildingLighting.js'), 'utf8'), { cc, module: lighting, exports: lighting.exports });
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/BuildingAppearance.js'), 'utf8'), {
    cc, module: mod, exports: mod.exports, require: name => name === 'KinghtFallUIGame' ? { default: { instance: { ctrGame: game } } } : name === 'BuildingLighting' ? lighting.exports : require(path.join(root, 'assets/_script', name))
  }, { filename: 'BuildingAppearance.js' });
  let resolved = 0;
  function resolve() { let limit = 50; while (resolved < loads.length && limit--) { const load = loads[resolved++]; load.done({ name: load.file }); } assert(limit > 0); }
  function target(x, y, parent = null) { const node = new Node('Monster'); node.setPosition(x, y); node.parent = parent; return { node, hp: 100, isDead: () => false }; }
  return { api: mod.exports, owner, row, weapon, loads, resolve, target, Node, cc, game, tweens };
}

for (const type of ['cannon', 'sniper']) for (const level of [1, 2, 3]) test(`${type} level ${level} aims and spawns at its visible muzzle in all eight directions`, () => {
  const h = fixture(type, level); h.owner.node.setPosition(230, 140); h.api.apply(h.owner); h.resolve();
  for (let direction = 0; direction < 8; direction++) {
    const angle = direction * Math.PI / 4, pivot = { x: h.weapon.offsetX, y: h.weapon.offsetY };
    const localTarget = { x: pivot.x + Math.cos(angle) * 400, y: pivot.y + Math.sin(angle) * 400 };
    const target = h.target(0, 0); target.node.setPosition(h.owner.node.convertToWorldSpaceAR(localTarget));
    h.api.aim(h.owner, target); h.api.step(h.owner, 1);
    const state = h.owner._buildingAppearance;
    const visible = state.weaponNode.convertToWorldSpaceAR(localMuzzle(h));
    const muzzle = h.api.muzzle(h.owner, h.game);
    pointClose(muzzle, h.game.ndUI.convertToNodeSpaceAR(visible), 'visible barrel tip');
    const worldPivot = state.weaponPivot.convertToWorldSpaceAR({ x: 0, y: 0 });
    const vector = { x: visible.x - worldPivot.x, y: visible.y - worldPivot.y };
    const toward = { x: target.node.x - worldPivot.x, y: target.node.y - worldPivot.y };
    close(vector.x * toward.y - vector.y * toward.x, 0, 'barrel must point at target');
    assert(vector.x * toward.x + vector.y * toward.y > 0, 'barrel must point forward');
  }
});

test('aim respects rotated/scaled/translated map, building, enemy and effects parents', () => {
  const h = fixture(), map = new h.Node('Map'), enemies = new h.Node('Enemies');
  map.setPosition(110, -70); map.angle = 27; map.setScale(1.3, .85);
  h.owner.node.parent = map; h.owner.node.setPosition(60, 210); h.owner.node.angle = -13; h.owner.node.setScale(.8, 1.15);
  enemies.setPosition(-80, 140); enemies.angle = -22; enemies.setScale(.7, 1.4);
  h.game.ndUI.setPosition(50, -30); h.game.ndUI.angle = 17; h.game.ndUI.setScale(.9, 1.2);
  h.api.apply(h.owner); h.resolve();
  const target = h.target(-420, 90, enemies); h.api.aim(h.owner, target); h.api.step(h.owner, 1);
  const state = h.owner._buildingAppearance;
  const tip = state.weaponNode.convertToWorldSpaceAR(localMuzzle(h));
  pointClose(h.api.muzzle(h.owner, h.game), h.game.ndUI.convertToNodeSpaceAR(tip));
  const pivot = state.weaponPivot.convertToWorldSpaceAR({ x: 0, y: 0 }), to = target.node.convertToWorldSpaceAR({ x: 0, y: 0 });
  close((tip.x - pivot.x) * (to.y - pivot.y) - (tip.y - pivot.y) * (to.x - pivot.x), 0);
});

test('left/right crossings keep the barrel upright and never move or mirror the base', () => {
  const h = fixture('sniper'); h.api.apply(h.owner); h.resolve();
  const state = h.owner._buildingAppearance, base = { x: state.node.x, y: state.node.y, angle: state.node.angle, scaleX: state.node.scaleX, scaleY: state.node.scaleY };
  for (const x of [300, 1, -1, -300, -1, 1, 300]) {
    const target = h.target(x, 330); h.api.aim(h.owner, target); h.api.step(h.owner, .5);
    assert.equal(state.weaponPivot.scaleX < 0, state.weaponView === 'side' && x < h.weapon.offsetX);
    assert(Math.abs(state.weaponPivot.angle) <= 90.000001, 'art stays upright rather than rotating upside down');
    assert.deepEqual({ x: state.node.x, y: state.node.y, angle: state.node.angle, scaleX: state.node.scaleX, scaleY: state.node.scaleY }, base);
  }
});

test('weapon loading is generation-owned across upgrade, sale, death, repair and scene disposal', () => {
  const h = fixture(); h.api.apply(h.owner); const stale = h.loads.slice();
  h.row.Appearance = { ...h.row.Appearance, sprite: 'new-base', weapon: { ...h.weapon, sprite: 'new-weapon' } };
  h.api.apply(h.owner); h.resolve();
  stale.forEach(load => load.done({ name: 'obsolete' }));
  let state = h.owner._buildingAppearance;
  assert.equal(state.sprite.spriteFrame.name, 'new-base'); assert.equal(state.weaponSprite.spriteFrame.name, 'new-weapon');
  h.owner.isDestroyed = true; h.api.onDead(h.owner);
  assert.equal(state.weaponPivot.active, false);
  h.owner.isDestroyed = false; h.api.apply(h.owner); h.resolve(); assert.equal(state.weaponPivot.active, true);
  h.owner.buildInfo.cfg = null; h.api.apply(h.owner);
  assert.equal(state.weaponPivot.active, false); assert.equal(state.node.active, false);
  pointClose(h.owner.ndShot.getPosition(), { x: -4, y: 91 }, 'legacy muzzle restored');
  h.owner.buildInfo.cfg = h.row; h.api.apply(h.owner); h.api.dispose(h.owner); h.resolve();
  assert.equal(h.owner._buildingAppearance, null); assert.equal(h.owner.ndAniMain.enabled, true);
});

test('death while artwork is loading cannot revive a detached weapon and repair can load it afresh', () => {
  const h = fixture(); h.api.apply(h.owner); h.owner.isDestroyed = true; h.api.onDead(h.owner); h.resolve();
  const state = h.owner._buildingAppearance;
  assert(!state.weaponPivot || !state.weaponPivot.active, 'late artwork is not a living gun');
  h.owner.isDestroyed = false; h.api.apply(h.owner); h.resolve();
  assert.equal(state.weaponPivot.active, true);
});

function controllerFixture(type = 'cannon', level = 1, loadArtwork = true) {
  const h = fixture(type, level), world = setup();
  world.e.stubs.BuildingAppearance = h.api;
  const T = world.load('KinghtFallBuildBartizan').default, owner = new T();
  Object.assign(owner, h.owner); h.owner = owner;
  owner.attRange = 2000; owner.time = { AttackTime: 0, AttackSpeed: .05, AttackNum: 50, Invincible: -1 };
  owner.getAttack = () => 50; owner.vec2_1 = new world.e.cc.Vec2();
  world.g.ndUI = h.game.ndUI; world.ui.ctrEffect = { showDamageNum() {}, onMonsterAttack() {} };
  const shots = [], originalShot = world.g.onShotBuild;
  world.g.onShotBuild = function (tower, actor) {
    const tip = tower._buildingAppearance.weaponNode.convertToWorldSpaceAR(localMuzzle(h));
    const expected = this.ndUI.convertToNodeSpaceAR(tip), node = new h.Node('Projectile');
    node.parent = this.ndUI; node.setSiblingIndex = () => {};
    const bullet = { node, speed: 550, setTowerTag(origin, target, attack, behavior) { shots.push({ origin, target, expected, nodePosition: node.getPosition(), behavior }); } };
    node.getComponent = () => bullet; this.ndBuildArr1.push(node);
    originalShot.call(this, tower, actor);
  };
  h.api.apply(owner); if (loadArtwork) h.resolve();
  return { ...h, world, shots, fireDirect: (tower, target) => originalShot.call(world.g, tower, target) };
}

test('ready shots wait for both artwork layers without spending cooldown or allocating a projectile', () => {
  const h = controllerFixture('cannon', 1, false), target = h.target(400, 200); h.world.d.enemyList = [target];
  h.owner.time.AttackTime = 1; h.owner.doTime(.01);
  assert.equal(h.shots.length, 0); assert(h.owner.time.AttackTime >= 1);
  assert.doesNotThrow(() => h.fireDirect(h.owner, target));
  assert.equal(h.world.g.ndBuildArr2.length, 0, 'direct callbacks cannot allocate an invisible shot');
  h.loads.find(load => load.file === h.row.Appearance.sprite).done({ name: 'base-only' }); h.owner.doTime(.01);
  assert.equal(h.shots.length, 0); assert(h.owner.time.AttackTime >= 1);
  h.resolve(); h.owner.doTime(.01);
  assert.equal(h.shots.length, 1); assert.equal(h.owner.time.AttackTime, 0);
  pointClose(h.shots[0].origin, h.shots[0].expected, 'first fully loaded shot');
});

for (const type of ['cannon', 'sniper']) for (const level of [1, 2, 3]) test(`${type} level ${level} actual controller fires from its current muzzle in eight directions, including during recoil`, () => {
  const h = controllerFixture(type, level), target = h.target(400, 200); h.world.d.enemyList = [target];
  for (let direction = 0; direction < 8; direction++) {
    const angle = direction * Math.PI / 4;
    target.node.setPosition(h.weapon.offsetX + Math.cos(angle) * 400, h.weapon.offsetY + Math.sin(angle) * 400);
    h.owner.time.AttackTime = 1; h.owner.doTime(.01);
    const shot = h.shots.at(-1); assert.equal(h.shots.length, direction + 1);
    pointClose(shot.origin, shot.expected, 'committed shot muzzle'); pointClose(shot.nodePosition, shot.expected, 'spawned projectile');
    const state = h.owner._buildingAppearance;
    pointClose(state.flash.convertToWorldSpaceAR({ x: 0, y: 0 }), state.weaponNode.convertToWorldSpaceAR(localMuzzle(h)), 'flash follows the barrel tip');
  }
});

test('layer pair becomes visible atomically and recoil moves only the weapon, not the building', () => {
  const h = fixture(); h.api.apply(h.owner);
  assert.equal(h.loads.length, 3 + Object.keys(h.weapon.views || {}).length, 'intact layers and the independent destroyed sprite preload');
  h.loads.find(load => load.file === h.row.Appearance.sprite).done({ name: 'base' }); assert.equal(h.owner.ndAniMain.enabled, true, 'fallback remains while weapon is outstanding');
  assert(!h.owner._buildingAppearance.node || !h.owner._buildingAppearance.node.active);
  h.loads.filter(load => load.file !== h.row.Appearance.sprite && load.file !== h.row.Appearance.destroyed.sprite).forEach(load => load.done({ name: load.file }));
  const state = h.owner._buildingAppearance;
  assert.equal(h.api.ready(h.owner), true, 'ruins loading never delays a healthy tower firing');
  assert.equal(state.destroyedFrame, null);
  h.api.aim(h.owner, h.target(-300, 200));
  const base = { x: state.node.x, y: state.node.y, scaleX: state.node.scaleX, scaleY: state.node.scaleY };
  h.api.fire(h.owner); assert(state.recoilRemaining > 0); assert(Math.hypot(state.weaponNode.x, state.weaponNode.y) > 0);
  h.api.step(h.owner, .1);
  assert.deepEqual({ x: state.node.x, y: state.node.y, scaleX: state.node.scaleX, scaleY: state.node.scaleY }, base);
  h.api.step(h.owner, 1); pointClose(state.weaponNode.getPosition(), { x: 0, y: 0 }); assert.equal(state.flash.active, false);
});

test('tower tracks a moving target continuously during cooldown and actual shot starts at the rendered barrel tip', () => {
  const h = controllerFixture('sniper'), target = h.target(300, 230);
  h.world.d.enemyList = [target];
  const angles = [];
  for (const [x, y] of [[300, 230], [200, 400], [-150, 350], [-300, 100], [200, -200]]) {
    target.node.setPosition(x, y); h.owner.doTime(.1);
    angles.push(h.owner._buildingAppearance.weaponPivot.angle);
  }
  assert.equal(h.shots.length, 0, 'tracking does not consume/skip the authored cooldown');
  assert(new Set(angles.map(a => Math.round(a))).size >= 4, 'aim changes before the next shot is ready');
  h.owner.time.AttackTime = 1; h.owner.doTime(.01);
  assert.equal(h.shots.length, 1); pointClose(h.shots[0].origin, h.shots[0].expected, 'shot origin');
  pointClose(h.shots[0].nodePosition, h.shots[0].expected, 'projectile node');
  assert.equal(h.owner.time.AttackTime, 0);
});

test('actual firing path converts the moving muzzle into a differently transformed projectile layer', () => {
  const h = controllerFixture('cannon', 3), map = new h.Node('Map'), enemyParent = new h.Node('Enemies');
  map.setPosition(200, -75); map.angle = 23; map.setScale(1.2, .8);
  h.owner.node.parent = map; h.owner.node.setPosition(120, 250); h.owner.node.angle = -11;
  enemyParent.setPosition(-130, 60); enemyParent.angle = -17; enemyParent.setScale(.7, 1.3);
  h.game.ndUI.setPosition(80, 90); h.game.ndUI.angle = 14; h.game.ndUI.setScale(.85, 1.1);
  const target = h.target(450, 300, enemyParent); h.world.d.enemyList = [target];
  h.owner.time.AttackTime = 1; h.owner.doTime(.01);
  assert.equal(h.shots.length, 1); pointClose(h.shots[0].origin, h.shots[0].expected); pointClose(h.shots[0].nodePosition, h.shots[0].expected);
});

test('an invincibility expiry cannot fire a ready shot after destroying the tower', () => {
  const h = controllerFixture(), target = h.target(300, 230); h.world.d.enemyList = [target];
  h.owner.time.Invincible = .01; h.owner.time.AttackTime = 1;
  h.owner.onDead = function () { this.isDestroyed = true; h.api.onDead(this); };
  h.owner.doTime(.02);
  assert.equal(h.owner.isDestroyed, true); assert.equal(h.shots.length, 0);
});

test('paused battle update preserves the weapon pose and cooldown while enemies move elsewhere', () => {
  const h = controllerFixture(), target = h.target(300, 230); h.world.d.enemyList = [target]; h.owner.doTime(.1);
  const before = h.owner._buildingAppearance.weaponPivot.angle, cooldown = h.owner.time.AttackTime;
  target.node.setPosition(-400, -300);
  const source = fs.readFileSync(path.join(root, 'assets/_script/KinghtFallUIGame.js'), 'utf8');
  const begin = source.indexOf('  _ctor.prototype.update = function'), end = source.indexOf('\n  };', begin) + 5;
  const update = vm.runInNewContext('(' + source.slice(begin, end).split(' = ').slice(1).join(' = ').replace(/;$/, '') + ')');
  update.call({ isPauset: true, _updateTestControls() {}, ctrGame: { onUpdate: dt => h.owner.doTime(dt) } }, .1);
  assert.equal(h.owner._buildingAppearance.weaponPivot.angle, before); assert.equal(h.owner.time.AttackTime, cooldown); assert.equal(h.shots.length, 0);
});

test('losing the final live enemy returns an eight-direction tower to northeast after its recoil',()=>{
  const h=controllerFixture('sniper'),target=h.target(300,-250);h.world.d.enemyList=[target];
  h.owner.time.AttackTime=1;h.owner.doTime(.01);assert.equal(h.shots.length,1);assert.equal(h.owner._buildingAppearance.weaponView,'southeast');
  target.hp=0;h.world.d.enemyList=[];h.owner.doTime(.01);
  assert.equal(h.owner._buildingAppearance.weaponView,'southeast','a spent shot finishes recoiling');
  h.owner.doTime(1);const state=h.owner._buildingAppearance;
  assert.equal(state.weaponView,'side');assert.equal(state.weaponFacing,'northeast');assert.equal(state.weaponPivot.angle,0);assert.equal(state.weaponPivot.scaleX,1);
  assert.equal(h.shots.length,1);assert.equal(h.owner._towerAimTarget,null);
});
