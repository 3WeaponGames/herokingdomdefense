'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function fixture(weapon = false, ruins = false, directions = false) {
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
  const lighting = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/BuildingLighting.js'), 'utf8'), { cc, exports: lighting.exports, module: lighting });
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/BuildingAppearance.js'), 'utf8'), { cc, exports: mod.exports, module: mod, require: name => name === 'BuildingLighting' ? lighting.exports : require(path.join(root, 'assets/_script', name)) });
  const loads = [], node = new Node('tower'), shot = new Node('shot'); shot.parent = node; shot.setPosition(-3, 97);
  const owner = { node, ndShot: shot, ndAniMain: { enabled: true }, ndAniOther: [],
    buildInfo: { cfg: { Appearance: { sprite: 'buildings/towers/cannon-1', width: 187, height: 212, offsetY: -38, muzzleX: 40, muzzleY: 130 }, Tower: { attackType: 'cannon' } } },
    loadSpriteFrame(bundle, path, callback) { loads.push({ bundle, path, callback }); } };
  if (weapon) owner.buildInfo.cfg.Appearance.weapon = { sprite: 'buildings/towers/cannon-1-weapon', width: 120, height: 80,
    pivotX: .25, pivotY: .4, offsetX: 0, offsetY: 150, muzzleX: 80, muzzleY: 12 };
  if (ruins) owner.buildInfo.cfg.Appearance.destroyed = { sprite: 'buildings/towers/cannon-1-destroyed', width: 187, height: 187, offsetY: -38 };
  if (directions) owner.buildInfo.cfg.Appearance.weapon.views = {
    north: { sprite: 'buildings/towers/cannon-1-weapon-north', width: 70, height: 60, pivotX: .5, pivotY: .4, muzzleX: 0, muzzleY: 24 },
    south: { sprite: 'buildings/towers/cannon-1-weapon-south', width: 72, height: 64, pivotX: .5, pivotY: .6, muzzleX: 0, muzzleY: -26 }
  };
  return { api: mod.exports, owner, loads, Node };
}

test('static artwork waits for its frame and preserves collider-owning skeleton nodes', () => {
  const h = fixture(); h.api.apply(h.owner);
  assert.equal(h.owner.ndAniMain.enabled, true, 'keep fallback visible until the sprite arrives');
  assert.equal(h.loads[0].bundle, 'resources'); h.loads[0].callback({ name: 'cannon-1' });
  const state = h.owner._buildingAppearance;
  assert.equal(h.owner.ndAniMain.enabled, false); assert.equal(h.owner.node.active, true);
  assert.equal(state.node.parent, state.presentation); assert.equal(state.presentation.parent, h.owner.node); assert.equal(state.node.anchorY, 0);
  assert.equal(state.node.width, 187); assert.equal(state.node.height, 212); assert.equal(state.node.y, -38);
  assert.equal(h.owner.ndShot.x, 40); assert.equal(h.owner.ndShot.y, 130);
  h.api.apply(h.owner); assert.equal(h.loads.length, 1, 'reapplying a loaded level does not load another frame');
});

test('custom wall artwork and ruins rotate independently while the controller and purchase field stay fixed', () => {
  for (const mirrored of [false, true]) for (const angle of [-17, 13.5]) {
    const h = fixture(false, true); h.owner.wallRotation = angle;
    h.owner.node.x = 25; h.owner.node.y = -10; h.owner.node.angle = 29;
    h.owner.node.scaleX = mirrored ? -1.4 : 1.4; h.owner.node.scaleY = 1.4;
    const plate = new h.Node('purchase'); plate.parent = h.owner.node; plate.setPosition(-100, -80); h.owner.ndLockList = [plate];
    const point = plate.convertToWorldSpaceAR({x:0,y:0}), controller = {x:h.owner.node.x,y:h.owner.node.y,angle:h.owner.node.angle,scaleX:h.owner.node.scaleX,scaleY:h.owner.node.scaleY};
    h.api.apply(h.owner); h.loads.forEach(load => load.callback({name:load.path}));
    const state = h.owner._buildingAppearance;
    assert.equal(state.presentation.angle, mirrored ? -angle : angle);
    assert.deepEqual(plate.convertToWorldSpaceAR({x:0,y:0}), point);
    assert.deepEqual({x:h.owner.node.x,y:h.owner.node.y,angle:h.owner.node.angle,scaleX:h.owner.node.scaleX,scaleY:h.owner.node.scaleY}, controller);
    const pivot = h.owner.node.convertToWorldSpaceAR({x:0,y:0}), original = h.owner.node.convertToWorldSpaceAR({x:0,y:-38}), radians=angle*Math.PI/180;
    const expected={x:pivot.x+Math.cos(radians)*(original.x-pivot.x)-Math.sin(radians)*(original.y-pivot.y),y:pivot.y+Math.sin(radians)*(original.x-pivot.x)+Math.cos(radians)*(original.y-pivot.y)};
    const actual=state.node.convertToWorldSpaceAR({x:0,y:0});assert(Math.hypot(actual.x-expected.x,actual.y-expected.y)<1e-7);
    h.owner.isDestroyed = true; h.api.onDead(h.owner);
    assert.equal(state.destroyedNode.parent,state.presentation);assert.deepEqual(plate.convertToWorldSpaceAR({x:0,y:0}), point);
    h.api.dispose(h.owner);
  }
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
  assert.equal(state.weaponPivot.parent, state.presentation); assert.equal(state.presentation.parent, h.owner.node); assert.equal(state.weaponNode.parent, state.weaponPivot);
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

test('source ballista waits for every loaded and empty view, reloads in place, and respects a buffed attack rate',()=>{
  const h=fixture(true,false,true),weapon=h.owner.buildInfo.cfg.Appearance.weapon;
  h.owner.buildInfo.cfg.Tower.attackType='sniper';h.owner.buildInfo.cfg.Data=[60,10,500];weapon.referenceAngle=0;weapon.emptySprite='side-empty';
  weapon.views.northeast={...weapon.views.north,sprite:'northeast',referenceAngle:45};weapon.views.north.referenceAngle=90;weapon.views.south.referenceAngle=-90;
  weapon.views.southeast={...weapon.views.north,sprite:'southeast',referenceAngle:-45};Object.entries(weapon.views).forEach(([k,v])=>v.emptySprite=k+'-empty');
  weapon.motion={type:'spring',distance:16,speed:20,damping:5,reloadTime:1};h.api.apply(h.owner);
  assert.equal(h.loads.length,11);for(let i=0;i<h.loads.length-1;i++)h.loads[i].callback({name:h.loads[i].path});assert.equal(h.api.ready(h.owner),false);assert.equal(h.owner.ndAniMain.enabled,true);
  h.loads.at(-1).callback({name:h.loads.at(-1).path});assert.equal(h.api.ready(h.owner),true);
  const state=h.owner._buildingAppearance,base=[state.node.x,state.node.y,state.node.angle],target=new h.Node('target');target.setPosition(400,150);h.api.aim(h.owner,target);h.api.fire(h.owner);
  assert.equal(state.weaponSprite.spriteFrame.name,'side-empty');target.setPosition(0,-400);h.api.aim(h.owner,target);assert.equal(state.weaponSprite.spriteFrame.name,'south-empty');
  h.api.step(h.owner,.049);assert.equal(state.weaponSprite.spriteFrame.name,'south-empty');h.api.step(h.owner,.001);assert.equal(state.weaponSprite.spriteFrame.name,weapon.views.south.sprite);
  h.api.step(h.owner,.21);assert.equal(state.weaponNode.x,0);assert.equal(state.weaponNode.y,0);assert.equal(state.weaponMotion,null);assert.deepEqual([state.node.x,state.node.y,state.node.angle],base);
  h.api.fire(h.owner);h.owner.isDestroyed=true;h.api.onDead(h.owner);assert.equal(state.weaponMotion,null);h.owner.isDestroyed=false;h.api.apply(h.owner);assert(!state.weaponSprite.spriteFrame.name.endsWith('-empty'),'repair restores a loaded weapon');
});

test('obsolete and failed unloaded-frame callbacks cannot commit partial or upgraded tower art',()=>{
 const h=fixture(true),w=h.owner.buildInfo.cfg.Appearance.weapon;w.emptySprite='unloaded';w.motion={type:'spring',distance:10,speed:20,damping:5,reloadTime:1};h.api.apply(h.owner);const old=h.loads.slice();w.emptySprite='unloaded-new';h.api.apply(h.owner);old.forEach(l=>l.callback({name:'obsolete'}));assert.equal(h.api.ready(h.owner),false);
 const next=h.loads.slice(old.length);next.forEach(l=>l.callback(l.path==='unloaded-new'?null:{name:l.path}));assert.equal(h.api.ready(h.owner),false);assert.equal(h.owner.ndAniMain.enabled,true);
 h.api.apply(h.owner);h.loads.slice(old.length+next.length).forEach(l=>l.callback({name:l.path}));assert.equal(h.api.ready(h.owner),true);h.api.fire(h.owner);assert.equal(h.owner._buildingAppearance.weaponSprite.spriteFrame.name,'unloaded-new');
 h.api.dispose(h.owner);old.forEach(l=>l.callback({name:'late'}));assert.equal(h.owner._buildingAppearance,null);
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

test('destroyed artwork replaces both intact layers at full opacity; repair restores the selected tower', () => {
  const h = fixture(true, true); h.api.apply(h.owner);
  h.loads.forEach(load => load.callback({ name: load.path }));
  const state = h.owner._buildingAppearance;
  assert.equal(state.destroyedNode, undefined, 'preloading does not display ruins on a healthy tower');
  h.api.fire(h.owner); h.owner.isDestroyed = true; h.api.onDead(h.owner);
  assert.equal(state.node.active, false); assert.equal(state.weaponPivot.active, false); assert.equal(state.flash.active, false);
  assert.equal(state.destroyedNode.active, true); assert.equal(state.destroyedNode.anchorY, 0);
  assert.equal(state.destroyedNode.width, 187); assert.equal(state.destroyedNode.height, 187); assert.equal(state.destroyedNode.y, -38);
  assert.equal(state.destroyedNode.scaleY, 1, 'ruins are drawn at their authored proportions');
  assert.match(state.destroyedSprite.spriteFrame.name, /-destroyed$/); assert.equal(h.owner.ndAniMain.enabled, false);
  h.api.onDead(h.owner); assert.equal(h.loads.length, 3, 'repeated destruction does not reload a warm sprite');
  h.owner.isDestroyed = false; h.api.apply(h.owner);
  assert.equal(state.destroyedNode.active, false); assert.equal(state.node.active, true); assert.equal(state.weaponPivot.active, true);
  assert.equal(state.node.scaleY, 1); assert.equal(h.loads.length, 3, 'repair reuses the intact layers');
  const rubble = state.destroyedNode; h.api.dispose(h.owner); assert.equal(rubble.destroyed, true);
});

test('death during an intact-art load uses authored destruction until the ruins arrive', () => {
  const h = fixture(true, true); h.api.apply(h.owner);
  const ruined = h.loads.find(load => /-destroyed$/.test(load.path));
  h.owner.isDestroyed = true; h.api.onDead(h.owner);
  h.loads.filter(load => load !== ruined).forEach(load => load.callback({ name: 'late intact layer' }));
  const state = h.owner._buildingAppearance;
  assert.equal(state.node, null); assert.equal(h.owner.ndAniMain.enabled, true);
  ruined.callback({ name: 'ruins' }); assert.equal(state.destroyedNode.active, true); assert.equal(h.owner.ndAniMain.enabled, false);
  h.owner.isDestroyed = false; h.api.apply(h.owner);
  assert.equal(state.destroyedNode.active, false); assert.equal(h.owner.ndAniMain.enabled, true);
  h.loads.slice(3).forEach(load => load.callback({ name: 'repaired layer' }));
  assert.equal(state.node.active, true); assert.equal(state.weaponPivot.active, true); assert.equal(h.api.ready(h.owner), true);
});

test('a late ruins callback cannot replace repaired or sold artwork', () => {
  for (const sold of [false, true]) {
    const h = fixture(false, true); h.api.apply(h.owner);
    h.loads.find(load => !/-destroyed$/.test(load.path)).callback({ name: 'intact' });
    h.owner.isDestroyed = true; h.api.onDead(h.owner);
    h.owner.isDestroyed = false;
    if (sold) h.owner.buildInfo.cfg = null;
    h.api.apply(h.owner);
    h.loads[0].callback({ name: 'late ruins' });
    const state = h.owner._buildingAppearance;
    assert.equal(state.destroyedNode, undefined); assert.equal(state.node.active, !sold);
    assert.equal(h.owner.ndAniMain.enabled, sold);
  }
});

test('upgrading or removing destroyed artwork invalidates the previous resource request', () => {
  const h = fixture(false, true); h.api.apply(h.owner);
  const oldRuins = h.loads[0]; h.owner.buildInfo.cfg.Appearance.destroyed.sprite = 'buildings/towers/cannon-2-destroyed'; h.api.apply(h.owner);
  oldRuins.callback({ name: 'old ruins' });
  const next = h.loads.find(load => /cannon-2-destroyed$/.test(load.path));
  delete h.owner.buildInfo.cfg.Appearance.destroyed; h.api.apply(h.owner); next.callback({ name: 'removed ruins' });
  h.owner.buildInfo.cfg.Appearance.destroyed = { sprite: next.path }; h.api.apply(h.owner);
  const retry = h.loads[h.loads.length - 1]; assert.equal(retry.path, next.path); assert.notEqual(retry, next);
  retry.callback({ name: 'current ruins' }); h.owner.isDestroyed = true; h.api.onDead(h.owner);
  assert.equal(h.owner._buildingAppearance.destroyedSprite.spriteFrame.name, 'current ruins');
});

test('failed ruins keep the original destruction model and can retry without an intact overlay', () => {
  const h = fixture(false, true); h.api.apply(h.owner);
  h.loads[1].callback({ name: 'intact' }); h.loads[0].callback(null);
  h.owner.isDestroyed = true; h.api.onDead(h.owner);
  const state = h.owner._buildingAppearance;
  assert.equal(state.node.active, false); assert.equal(h.owner.ndAniMain.enabled, true);
  h.loads[2].callback({ name: 'retry ruins' }); assert.equal(state.destroyedNode.active, true); assert.equal(h.owner.ndAniMain.enabled, false);
});

test('an initially destroyed building needs only its ruins; disposal retires outstanding loads', () => {
  const h = fixture(true, true); h.owner.isDestroyed = true; h.api.apply(h.owner);
  assert.equal(h.loads.length, 1); assert.match(h.loads[0].path, /-destroyed$/);
  h.api.dispose(h.owner); h.loads[0].callback({ name: 'stale' }); assert.equal(h.owner._buildingAppearance, null);
});

test('directional frames commit together, select north/south perspectives and mirror only the side view', () => {
  const h=fixture(true,false,true);h.api.apply(h.owner);
  assert.equal(h.loads.length,4);
  h.loads.slice(0,3).forEach(load=>load.callback({name:load.path}));
  assert.equal(h.owner.ndAniMain.enabled,true);assert.equal(h.api.ready(h.owner),false);
  h.loads[3].callback({name:h.loads[3].path});const state=h.owner._buildingAppearance;
  const base={x:state.node.x,y:state.node.y,scaleX:state.node.scaleX,scaleY:state.node.scaleY};
  for(const [x,y,view,flip]of [[0,500,'north',1],[500,150,'side',1],[0,-500,'south',1],[-500,150,'side',-1]]){
    const target=new h.Node('target');target.setPosition(x,y);h.api.aim(h.owner,target);
    assert.equal(state.weaponView,view);assert.equal(state.weaponPivot.scaleX,flip);
    assert.equal(state.weaponSprite.spriteFrame.name,state.weaponFrames[view].name);
    if(view!=='side')assert(Math.abs(state.weaponPivot.angle)<1e-6,'cardinal front/rear frames stay upright');
    assert.deepEqual({x:state.node.x,y:state.node.y,scaleX:state.node.scaleX,scaleY:state.node.scaleY},base);
    const tip=state.weaponNode.convertToWorldSpaceAR({x:state.muzzleX,y:state.muzzleY});
    const origin=h.api.muzzle(h.owner,{ndUI:new h.Node('effects')});assert.deepEqual(origin,tip);
  }
});

test('view changes during recoil keep the flash and shot on the current sprite muzzle',()=>{
  const h=fixture(true,false,true);h.api.apply(h.owner);h.loads.forEach(load=>load.callback({name:load.path}));
  const target=new h.Node('target');target.setPosition(300,150);h.api.aim(h.owner,target);h.api.fire(h.owner);
  const state=h.owner._buildingAppearance;target.setPosition(0,-400);h.api.aim(h.owner,target);
  assert.equal(state.weaponView,'south');assert.equal(state.recoilX,0);assert(state.recoilY<0);assert(state.weaponNode.y>0);
  const flash=state.flash.convertToWorldSpaceAR({x:0,y:0});
  assert.deepEqual(flash,state.weaponNode.convertToWorldSpaceAR({x:state.muzzleX,y:state.muzzleY}));
  h.api.step(h.owner,1);assert.equal(state.weaponNode.y,0);assert.equal(state.flash.active,false);
});

test('changing only a directional sprite or destroying a loading tower retires every older view',()=>{
  const h=fixture(true,false,true);h.api.apply(h.owner);const stale=h.loads.slice();
  h.owner.buildInfo.cfg.Appearance.weapon.views.south.sprite='buildings/towers/replacement-south';h.api.apply(h.owner);
  stale.forEach(load=>load.callback({name:'old'}));assert.equal(h.owner._buildingAppearance.node,null);
  h.owner.isDestroyed=true;h.api.onDead(h.owner);h.loads.slice(4).forEach(load=>load.callback({name:'late'}));
  assert.equal(h.owner._buildingAppearance.node,null);h.owner.isDestroyed=false;h.api.apply(h.owner);
  h.loads.slice(8).forEach(load=>load.callback({name:load.path}));
  const target=new h.Node('target');target.setPosition(0,-300);h.api.aim(h.owner,target);
  assert.match(h.owner._buildingAppearance.weaponSprite.spriteFrame.name,/replacement-south$/);
});

test('eight-direction towers mirror the southeast layer and return northeast after recoil settles',()=>{
  const h=fixture(true,false,true),w=h.owner.buildInfo.cfg.Appearance.weapon;
  w.views.southeast={sprite:'buildings/towers/cannon-1-weapon-southeast',width:100,height:70,pivotX:.4,pivotY:.5,muzzleX:38,muzzleY:-22};
  h.api.apply(h.owner);h.loads.forEach(load=>load.callback({name:load.path}));const s=h.owner._buildingAppearance;
  for(const [x,y,flip]of [[400,-250,1],[-400,-250,-1]]){
    const target=new h.Node('target');target.setPosition(x,y);h.api.aim(h.owner,target);
    assert.equal(s.weaponView,'southeast');assert.equal(s.weaponPivot.scaleX,flip);assert.equal(s.weaponSprite.spriteFrame.name,w.views.southeast.sprite);
  }
  h.api.fire(h.owner);h.api.idle(h.owner);assert.equal(s.weaponView,'southeast','finish the visible shot recoil first');
  h.api.step(h.owner,1);h.api.idle(h.owner);assert.equal(s.weaponView,'side');assert.equal(s.weaponPivot.angle,0);assert.equal(s.weaponPivot.scaleX,1);assert.equal(s.target,null);
  assert.equal(s.weaponSprite.spriteFrame.name,w.sprite);assert.equal(s.weaponFacing,'northeast');
  const legacy=fixture(true);legacy.api.apply(legacy.owner);legacy.loads.forEach(load=>load.callback({}));
  const target=new legacy.Node('target');target.setPosition(-300,150);legacy.api.aim(legacy.owner,target);legacy.api.idle(legacy.owner);
  assert.equal(legacy.owner._buildingAppearance.weaponPivot.scaleX,-1,'existing appearances without southeast retain their previous idle behavior');
});

test('production cannon and sniper families contain four fitted levels with unchanged directional weapons', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallConfig/GameJsonCfg.json')));
  const levels = cfg.BuildEnum['2'].levelList;
  for (const type of ['cannon', 'sniper']) {
    const rows = levels.filter(row => row.Tower?.attackType === type);
    assert.deepEqual(rows.map(row => row.level), [1, 2, 3, 4]);
    for (const row of rows) {
      const file = path.join(root, 'assets/resources', row.Appearance.sprite + '.png');
      assert.equal(fs.readFileSync(file).subarray(1, 4).toString(), 'PNG');
      const meta = JSON.parse(fs.readFileSync(file + '.meta'));
      assert.equal(meta.type, 'sprite'); assert.equal(Object.values(meta.subMetas)[0].trimType, 'none');
      for (const direction of ['north','northeast','southeast','south']) {
        const view=row.Appearance.weapon.views[direction];
        assert.equal(view.sprite,row.Appearance.weapon.sprite+'-'+direction);
        assert.equal(view.referenceAngle,{north:90,northeast:45,southeast:-45,south:-90}[direction]);assert(Number.isFinite(view.muzzleX)&&Number.isFinite(view.muzzleY));
        const viewMeta=JSON.parse(fs.readFileSync(path.join(root,'assets/resources',view.sprite+'.png.meta')));
        const displayScale=require('./tower-native-weapon-assets.fixture.json').weaponDisplayScales?.[type]||1;assert(Math.abs(view.width/viewMeta.width-displayScale)<1e-6);assert(Math.abs(view.height/viewMeta.height-displayScale)<1e-6);assert.equal(viewMeta.filterMode,'bilinear');assert.equal(viewMeta.packable,false);assert.equal(viewMeta.genMipmaps,false);
        assert.equal(Object.values(viewMeta.subMetas)[0].trimType,'none');
      }
      assert.equal(row.Appearance.destroyed,undefined,'persistent debris is supplied by the shared building lifecycle');
      assert.equal(row.Appearance.lifecycle,'native-tower');
      assert.equal(row.Appearance.nightTint,'#A7A7A7');assert(row.Appearance.lighting.length>0);
      for(const light of row.Appearance.lighting){
        assert.equal(light.sprite,row.Appearance.sprite+'-window-light');
        assert.equal(light.width,row.Appearance.width);assert.equal(light.height,row.Appearance.height);
        const maskFile=path.join(root,'assets/resources',light.sprite+'.png');assert(fs.existsSync(maskFile));assert(fs.existsSync(maskFile+'.meta'));
        assert.equal(light.offsetX,0);assert.equal(light.offsetY,0);
      }
      assert.equal(row.ColliderIndex >= 1 && row.ColliderIndex <= 3, true);
      assert.ok(row.Data[0] > 0 && row.Data[1] > 0 && row.Data[2] > 0);
    }
  }
  assert.deepEqual(cfg.BuildEnum['3'].InitialChoices.map(index => cfg.BuildEnum['3'].levelList.find(row => row.index === index).Data[1]), [90001, 90002, 90003, 90004]);
});
