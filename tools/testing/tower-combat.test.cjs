'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, Node, Vec2 } = require('./backend-gameplay-harness.cjs');
const TowerCombat = require('../../assets/_script/TowerCombat');
Vec2.prototype.rotateSelf = function (angle) {
  const x = this.x, y = this.y;
  this.x = x * Math.cos(angle) - y * Math.sin(angle);
  this.y = x * Math.sin(angle) + y * Math.cos(angle);
  return this;
};

function enemy(name, x, y, hp = 100, parent) {
  const unit = { node: new Node(name, parent, x, y), hp, hpMax: hp, hits: [], isDead() { return this.hp <= 0; },
    onAttacked(damage) { this.hits.push(damage); this.hp -= damage; } };
  unit.node._combatActor = unit;
  unit.node._combatGeneration = 1;
  return unit;
}
function tower(h, config) {
  const T = h.load('KinghtFallBuildBartizan').default, value = new T();
  value.node = new Node('tower', h.g.ndMain);
  value.buildInfo = { cfg: config };
  value.attRange = 500;
  value.time = { AttackTime: 1, AttackNum: 50 };
  value.getBuffList = () => [];
  return value;
}
function shotSetup() {
  const h = setup();
  h.g.ndUI = new Node('effects');
  h.ui.ctrEffect = { showDamageNum() {}, onMonsterAttack() {} };
  const B = h.load('KinghtFallBulletBuild').default, bullet = new B();
  bullet.node = new Node('shot', h.g.ndUI); bullet.uuid = 'shot';
  bullet.node.setSiblingIndex = () => {};
  bullet.bullet = new Node('authored arrow', bullet.node);
  bullet.speed = 550;
  bullet.node.getComponent = Type => bullet instanceof Type ? bullet : null;
  h.g.ndBuildArr1.push(bullet.node);
  return { h, bullet };
}
function complete(bullet) {
  for (let frame = 0; frame < 180 && bullet.state === 0; frame++) bullet.onUpdate(1 / 60);
  assert.equal(bullet.state, 1, 'projectile arrives');
}

test('legacy towers retain nearest targeting and no override; partial authored settings are supported', () => {
  assert.equal(TowerCombat.settings({}), null);
  assert.deepEqual(TowerCombat.settings({ Tower: { projectileSpeed: 450 } }), {
    attackType: 'arrow', targeting: 'nearest', projectileSpeed: 450, splashRadius: 0, splashFalloff: 1, projectileLook: ''
  });
  const h = setup(), t = tower(h, {}), near = enemy('near', 20, 0, 10), distant = enemy('distant', 200, 0, 1000);
  h.d.enemyList = [distant, near];
  let selected;
  h.g.onShotBuild = (_tower, target) => selected = target;
  t.doAttack(); assert.equal(selected, near); assert.equal(t.time.AttackTime, 0);
});

test('sniper prefers highest living HP in range with deterministic nearest ties and configurable priorities', () => {
  const h = setup(), t = tower(h, { Tower: { attackType: 'sniper' } });
  const near = enemy('near', 40, 0, 10), big = enemy('big', 400, 0, 500), beyond = enemy('beyond', 501, 0, 1000);
  const equalCloser = enemy('equal closer', 300, 0, 500), dead = enemy('dead', 20, 0, 900); dead.node.active = false;
  h.d.enemyList = [near, big, beyond, dead, equalCloser];
  let selected; h.g.onShotBuild = (_tower, target) => selected = target;
  t.doAttack(); assert.equal(selected, equalCloser);
  t.buildInfo.cfg.Tower.targeting = 'lowestHp'; t.doAttack(); assert.equal(selected, near);
  t.buildInfo.cfg.Tower.targeting = 'farthest'; t.doAttack(); assert.equal(selected, big);
  t.attRange = 0; selected = null; t.time.AttackTime = 1; t.doAttack();
  assert.equal(selected, null); assert.equal(t.time.AttackTime, 1, 'empty range does not spend the cooldown');
  for (const invalid of [-100, NaN, undefined]) {
    t.attRange = invalid; t.doAttack(); assert.equal(selected, null, 'invalid range cannot acquire enemies');
  }
});

test('cannon impact damages current monsters inside its radius even after its initial target dies', () => {
  const { h, bullet } = shotSetup(), t = tower(h, { Tower: { attackType: 'cannon', projectileSpeed: 300, splashRadius: 90 } });
  const primary = enemy('primary', 200, 0), neighbor = enemy('neighbor', 260, 0), outside = enemy('outside', 291, 0);
  h.d.enemyList = [primary, neighbor, outside]; h.g.onShotBuild(t, primary);
  primary.hp = 0; primary.node.active = false; primary.node._combatGeneration++;
  complete(bullet);
  assert.deepEqual(primary.hits, []); assert.deepEqual(neighbor.hits, [50]); assert.deepEqual(outside.hits, []);
  assert.equal(bullet.node.x, 200, 'blast is centered on the committed ground position');
});

test('cannon commits to the aim position, hits newly arrived enemies, and respects splash falloff', () => {
  const { h, bullet } = shotSetup(), t = tower(h, { Tower: { attackType: 'cannon', splashRadius: 100, splashFalloff: .5 } });
  const primary = enemy('moving', 200, 0), edge = enemy('edge', 700, 0), arrival = enemy('arrival', 700, 0);
  h.d.enemyList = [primary, edge, arrival]; h.g.onShotBuild(t, primary);
  primary.node.setPosition(500, 0); edge.node.setPosition(300, 0); arrival.node.setPosition(250, 0);
  complete(bullet);
  assert.deepEqual(primary.hits, []); assert.deepEqual(edge.hits, [25]); assert.deepEqual(arrival.hits, [37.5]);
});

test('sniper fires a fast single-target shot and discards a target recycled before impact', () => {
  const { h, bullet } = shotSetup(), t = tower(h, { Tower: { attackType: 'sniper', projectileSpeed: 1200 } });
  const primary = enemy('primary', 300, 0), nearby = enemy('nearby', 310, 0);
  h.d.enemyList = [primary, nearby]; h.g.onShotBuild(t, primary);
  assert.equal(bullet.speed, 1200); complete(bullet);
  assert.deepEqual(primary.hits, [50]); assert.deepEqual(nearby.hits, []);
  bullet.freeNode(); h.g.onShotBuild(t, primary); const stale = bullet.callAttack;
  primary.node._combatGeneration++; bullet.onUpdate(.1); stale();
  assert.deepEqual(primary.hits, [50]); assert.equal(bullet.state, 2);
});

test('cancelled cannon shots and prior combat epochs cannot damage a new battle', () => {
  const { h, bullet } = shotSetup(), t = tower(h, { Tower: { attackType: 'cannon' } });
  const target = enemy('target', 200, 0); h.d.enemyList = [target];
  h.g.onShotBuild(t, target); const priorEpoch = bullet.callAttack; h.g._combatEpoch++;
  bullet.onUpdate(.1); priorEpoch(); assert.deepEqual(target.hits, []); assert.equal(bullet.state, 2);
  h.g.onShotBuild(t, target); const beforeCancel = bullet.callAttack; bullet.freeNode(); beforeCancel();
  assert.deepEqual(target.hits, []);
});

test('a pooled projectile returns to the authored arrow speed and legacy hit path', () => {
  const { h, bullet } = shotSetup(), target = enemy('target', 200, 0);
  h.d.enemyList = [target]; h.g.onShotBuild(tower(h, { Tower: { attackType: 'sniper' } }), target);
  assert.equal(bullet.speed, 1000); bullet.freeNode();
  h.g.onShotBuild(tower(h, {}), target); assert.equal(bullet.speed, 550);
  complete(bullet); assert.deepEqual(target.hits, [50]);
});

test('AoE snapshots identities before a death callback recycles another enemy', () => {
  const h = setup(), a = enemy('a', 0, 0), b = enemy('b', 0, 0);
  h.d.enemyList = [a, b, b];
  a.onAttacked = function (damage) { this.hits.push(damage); b.node._combatGeneration++; };
  TowerCombat.damage(h.g, a, { x: 0, y: 0 }, 50, TowerCombat.settings({ Tower: { attackType: 'cannon' } }));
  assert.deepEqual(a.hits, [50]); assert.deepEqual(b.hits, []);
});

test('AoE stops when a death callback retires the battle during an impact', () => {
  const h = setup(), a = enemy('a', 0, 0), b = enemy('b', 0, 0); h.d.enemyList = [a, b];
  a.onAttacked = function (damage) { this.hits.push(damage); h.g._combatEpoch++; };
  TowerCombat.damage(h.g, a, { x: 0, y: 0 }, 50, TowerCombat.settings({ Tower: { attackType: 'cannon' } }));
  assert.deepEqual(a.hits, [50]); assert.deepEqual(b.hits, []);
});

test('splash uses the projectile parent coordinate space when UI and world parents differ', () => {
  const h = setup(); h.g.ndUI = new Node('ui', null, 200, 30);
  const world = new Node('world', null, 50, 10), a = enemy('a', 300, 20, 100, world);
  h.d.enemyList = [a];
  TowerCombat.damage(h.g, a, { x: 150, y: 0 }, 40, TowerCombat.settings({ Tower: { attackType: 'cannon', splashRadius: 5 } }));
  assert.deepEqual(a.hits, [40]);
});

test('cross-parent target conversion passes a Vec2 to the Creator 2.4 transform overload', () => {
  const h = setup(), world = new Node('world', null, 30, 70), effects = new Node('effects', null, 5, 20);
  const node = new Node('target', world, 100, 200), transform = node.convertToWorldSpaceAR;
  node.convertToWorldSpaceAR = function (input) {
    assert(input instanceof h.e.cc.Vec2, 'Creator chooses its Vec3 overload for a plain {x,y}, producing NaN z');
    return transform.call(this, input);
  };
  const point = h.load('TowerCombat').point(node, effects);
  assert.equal(point.x, 125); assert.equal(point.y, 250);
  assert.equal(Number.isFinite(point.x) && Number.isFinite(point.y), true);
});

test('sniper follows a moving target across different world and effects transforms', () => {
  const { h, bullet } = shotSetup(); h.g.ndUI.setPosition(200, 30);
  const world = new Node('world', null, 50, 10), target = enemy('target', 300, 20, 100, world);
  h.d.enemyList = [target]; h.g.onShotBuild(tower(h, { Tower: { attackType: 'sniper' } }), target);
  target.node.setPosition(330, 20);
  complete(bullet); assert.deepEqual(target.hits, [50]);
  assert(bullet.node.x < 200, 'aim point is converted to effects-local coordinates');
});

test('a layered tower edited to arrow behavior still launches from its animated muzzle', () => {
  const { h, bullet } = shotSetup(); h.e.stubs.BuildingAppearance.muzzle = () => new Vec2(15, 85);
  const target = enemy('target', 200, 85); h.d.enemyList = [target];
  const t = tower(h, { Tower: { attackType: 'arrow' }, Appearance: { weapon: { sprite: 'weapon' } } });
  h.g.onShotBuild(t, target);
  assert.equal(bullet.node.x, 15); assert.equal(bullet.node.y, 85); assert.equal(bullet.speed, 550);
  complete(bullet); assert.deepEqual(target.hits, [50]);
});

test('cannon fallback art survives pooling without rotating with the authored arrow or leaving a blast behind', () => {
  const { h, bullet } = shotSetup();
  class RenderComponent { constructor() { this.enabled = true; } }
  class Graphics extends RenderComponent {
    clear() {} circle() {} fill() {} stroke() {} moveTo() {} lineTo() {} close() {}
  }
  h.e.cc.RenderComponent = RenderComponent; h.e.cc.Graphics = Graphics; h.e.cc.color = (...args) => args;
  Node.prototype.setScale = function (value) { this.scaleX = this.scaleY = value; };
  bullet.bullet.angle = 90;
  const original = bullet.bullet.addComponent(RenderComponent), target = enemy('target', 200, 0);
  h.d.enemyList = [target]; h.g.onShotBuild(tower(h, { Tower: { attackType: 'cannon' } }), target);
  assert.equal(original.enabled, false);
  assert.equal(bullet._towerFlightNode.parent, bullet.node);
  assert.equal(bullet._towerFlightNode.angle, 0, 'new flight art does not inherit the old arrow rotation');
  complete(bullet);
  assert.equal(bullet._towerFlightNode.active, false); assert.equal(bullet._towerImpactNode.active, true);
  bullet.onUpdate(.25); assert.equal(bullet._towerImpactNode.active, false);
  bullet.freeNode();
  assert.equal(original.enabled, true); assert.equal(bullet._towerImpactNode.active, false);
  h.g.onShotBuild(tower(h, {}), target);
  assert.equal(original.enabled, true); assert.equal(bullet._towerFlightNode.active, false);
});

test('weapon tracking follows a moving cached target every frame with bounded acquisition scans', () => {
  const positions = [], h = setup({ BuildingAppearance: { aim(_owner, target) { positions.push(target.node.x); }, step() {}, fire() {} } });
  const t = tower(h, { Tower: { attackType: 'sniper' }, Appearance: { weapon: { sprite: 'weapon' } } });
  t.time = { AttackTime: 0, AttackSpeed: .01, Invincible: -1 };
  const target = enemy('target', 100, 0); let scans = 0;
  h.d.getEnemyList = () => { scans++; return [target]; };
  for (let frame = 0; frame < 60; frame++) { target.node.x = 100 + frame; t.doTime(1 / 60); }
  assert.equal(positions.length, 60); assert.equal(positions.at(-1), 159);
  assert(scans >= 3 && scans <= 5, 'scan the roster around four times per second instead of every frame');
  const before = scans; target.node._combatGeneration++; t.doTime(1 / 60);
  assert.equal(scans, before + 1, 'recycled target triggers immediate reacquisition');
});

test('invincibility expiry cannot fire or animate a destroyed tower later in that same tick', () => {
  const h = setup(), t = tower(h, { Tower: { attackType: 'sniper' } });
  t.time = { AttackTime: 1, AttackSpeed: 1, Invincible: .01 };
  let shots = 0; h.g.onShotBuild = () => shots++;
  h.d.enemyList = [enemy('target', 100, 0)]; t.onDead = () => { t.isDestroyed = true; };
  t.doTime(.02); t.doAttack(); assert.equal(shots, 0); assert.equal(t.isDestroyed, true);
});

test('an idle ready weapon keeps acquisition bounded when no enemies are in range', () => {
  const h = setup(), t = tower(h, { Tower: { attackType: 'cannon' }, Appearance: { weapon: { sprite: 'weapon' } } });
  t.time = { AttackTime: 1, AttackSpeed: 1, Invincible: -1 }; let scans = 0;
  h.d.getEnemyList = () => { scans++; return []; };
  for (let frame = 0; frame < 60; frame++) t.doTime(1 / 60);
  assert(scans >= 3 && scans <= 5, 'ready cooldown does not turn an empty acquisition scan into a per-frame task');
  assert(t.time.AttackTime >= 1, 'the next shot remains ready');
});

test('Cannon and Sniper keep and reset their authored motion trails, use saved level speeds and retain single impacts',()=>{
 const config=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
 for(const type of ['cannon','sniper'])for(const cfg of config.BuildEnum[2].levelList.filter(r=>r.Tower?.attackType===type)){
  const {h,bullet}=shotSetup();class Render{constructor(){this.enabled=true;}}class Trail extends Render{reset(){this.resets=(this.resets||0)+1;}}
  class Graphics extends Render{clear(){}circle(){}fill(){}stroke(){}moveTo(){}lineTo(){}close(){}}
  Object.assign(h.e.cc,{RenderComponent:Render,MotionStreak:Trail,Graphics,color:(...x)=>x});
  Node.prototype.setScale=function(s){this.scaleX=this.scaleY=s;};
  const trailNode=new Node('authored trail',bullet.node),trail=trailNode.addComponent(Trail),original=bullet.bullet.addComponent(Render),target=enemy('target',330,80,1000);
  h.d.enemyList=[target];h.g.onShotBuild(tower(h,cfg),target);
  assert.equal(bullet.speed,type==='cannon'?375:3000);assert.equal(trail.enabled,true);assert.equal(trail.resets,1);assert.equal(original.enabled,false);
  complete(bullet);assert.deepEqual(target.hits,[50]);bullet.freeNode();assert.equal(trail.enabled,true);assert.equal(original.enabled,true);
  h.g.onShotBuild(tower(h,cfg),target);assert.equal(trail.resets,2,'pooled shots retain an old trail');assert.equal(trail.enabled,true);complete(bullet);assert.deepEqual(target.hits,[50,50]);
 }
});
