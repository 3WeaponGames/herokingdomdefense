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
  const component = config.ID === 1 ? 'KinghtFallBuildMainFortress' : 'KinghtFallBuildBartizan';
  const T = h.load(component).default, value = new T();
  value.node = new Node('tower', h.g.ndMain);
  value.buildInfo = { cfg: config };
  value.attRange = 500;
  value.time = { AttackTime: 1, AttackNum: 50 };
  value.getBuffList = () => [];
  return value;
}
function shotSetup(overrides) {
  const h = setup(overrides);
  h.g.ndUI = new Node('effects');
  h.ui.ctrEffect = { showDamageNum() {}, onMonsterAttack() {} };
  const B = h.load('KinghtFallBulletBuild').default;
  function makeShot() {
    const bullet = new B();
    bullet.node = new Node('shot', h.g.ndUI);
    bullet.node.setSiblingIndex = () => {};
    bullet.bullet = new Node('authored arrow', bullet.node);
    bullet.speed = 550;
    bullet.node.getComponent = Type => bullet instanceof Type ? bullet : null;
    return bullet.node;
  }
  h.g.buildBullet = { node: makeShot };
  const bullet = makeShot().getComponent(B);
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
  selected = null;
  tower(h, { ID: 1 }).doAttack();
  assert.equal(selected, near, 'a keep without authored settings also keeps its nearest-target shot');
});

test('a killing tower impact cannot apply a relic pulse to a replacement battle', () => {
  for(const type of ['arrow','cannon']){
    const {h,bullet}=shotSetup(),t=tower(h,{Tower:{attackType:type}});
    t.buildCfg={enumValue:2};
    const target=enemy('target',100,0,1),next=enemy('next-battle',100,0);
    h.d.enemyList=[target];h.d.treasureAdd[120037]=[.8];
    target.onAttacked=function(damage){this.hp-=damage;h.g._combatEpoch++;h.g.gameData={treasureAdd:{120037:[.8]},enemyList:[next],_relicCombatTime:0};};
    h.g.onShotBuild(t,target);complete(bullet);
    assert.equal(next._relicControl,undefined,type+' must not affect the replacement battle');
  }
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

test('Archer and Keep tiers use their authored speed, range and damage and fire one arrow per target', () => {
  const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
  const rows = config.BuildEnum[1].levelList.concat(config.BuildEnum[2].levelList.filter(row => row.Tower?.attackType === 'arrow'));
  for (const row of rows) {
    const { h } = shotSetup(), t = tower(h, row), selected = [];
    const [damage, rate, range] = row.Data;
    const count = row.ID === 1 ? (row.level >= 3 ? 2 : 1) : row.level;
    t.buildInfo.initBuffData = () => {};
    const collider = t.node.addComponent(h.e.cc.CircleCollider);
    t.startRoundGame();
    assert.equal(t.attRange, range);
    assert.equal(collider.radius, range);
    const targets = [100, 150, 200, 250].map((x, index) => enemy('target ' + index, x, 0));
    const boundary = enemy('out of range', t.attRange, 0);
    h.d.enemyList = [boundary, targets[3], targets[0], targets[0], targets[2], targets[1]];
    const launch = h.g.onShotBuild;
    h.g.onShotBuild = function (source, target) { selected.push(target); launch.call(this, source, target); };
    t.time.AttackTime = 0;
    t.doTime(.99 / rate);
    assert.equal(selected.length, 0);
    t.doTime(.02 / rate);
    assert.deepEqual(selected, targets.slice(0, count));
    assert.equal(h.g.ndBuildArr2.length, count);
    assert.equal(t.time.AttackTime, 0);
    h.g.ndBuildArr2.forEach(shot => { assert.equal(shot.speed, 700); complete(shot); });
    assert.deepEqual(targets.map(target => target.hits), targets.map((_, index) => index < count ? [damage] : []));
    assert.deepEqual(boundary.hits, []);
  }
  const { h } = shotSetup(), t = tower(h, { Tower: { shotsPerVolley: 4, targeting: 'highestHp' } });
  const near = enemy('near', 90, 0), farther = enemy('higher HP', 250, 0, 200), retired = enemy('dead', 50, 0, 0);
  h.d.enemyList = [near, farther, near, retired, farther];
  const selected = [];
  h.g.onShotBuild = (_source, target) => selected.push(target);
  t.doAttack();
  assert.deepEqual(selected, [farther, near], 'remaining arrows need distinct live enemies');
});

test('a fast Sniper bolt hits in straight travel order, up to the authored limit including the first hit', () => {
  const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
  const tiers = config.BuildEnum[2].levelList.filter(row => row.Tower?.attackType === 'sniper');
  const single = { Tower: { attackType: 'sniper', projectileSpeed: 3000, pierceTargets: 1 } };
  for (const row of [single, ...tiers]) {
    const cap = row.level ? row.level + 1 : 1, damage = row.Data?.[0] ?? 50;
    const { h, bullet } = shotSetup(), t = tower(h, row);
    t.attRange = row.Data?.[2] ?? 500;
    t.time.AttackNum = damage;
    const aligned = [90, 150, 220, 290, 360, 420].map((x, index) => enemy('aligned ' + index, x, 0, index === 1 ? 300 : 100));
    const offLine = enemy('off line', 160, 26), behind = enemy('behind muzzle', -80, 0), order = [];
    h.d.enemyList = [behind, offLine, ...aligned.slice().reverse(), aligned[0]];
    aligned.forEach(actor => { actor.onAttacked = function (damage) { order.push(this); this.hits.push(damage); }; });
    t.doAttack();
    bullet.onUpdate(.5);
    assert.deepEqual(order, aligned.slice(0, cap));
    assert.deepEqual(aligned.map(actor => actor.hits), aligned.map((_, index) => index < cap ? [damage] : []));
    assert.deepEqual(offLine.hits, []); assert.deepEqual(behind.hits, []);
    assert.equal(bullet.state, 1);
    assert(Math.abs(bullet.node.x - (aligned[cap - 1].node.x - 25)) < 1e-6);
  }
});

test('Sniper flight holds its launch direction across moving enemies and transformed layers, stopping at tower range', () => {
  const { h, bullet } = shotSetup(), world = h.g.ndMain, effects = h.g.ndUI;
  effects.setPosition(180, 30); effects.angle = 67; effects.scaleX = 1.5; effects.scaleY = .85;
  h.e.stubs.BuildingAppearance.muzzle = () => effects.convertToNodeSpaceAR(world.convertToWorldSpaceAR(new Vec2(0, 80)));
  const t = tower(h, { Tower: { attackType: 'sniper', projectileSpeed: 3000, pierceTargets: 2 } });
  t.attRange = 300;
  const target = enemy('initial aim', 160, 80, 300, world), entrant = enemy('moves onto the line', 220, -100, 100, world);
  const beyond = enemy('past tower range', 370, 80, 100, world);
  h.d.enemyList = [target, entrant, beyond];
  t.doAttack();
  const heading = bullet.node.angle;
  target.node.setPosition(175, 180); entrant.node.setPosition(220, 80);
  bullet.onUpdate(.01); bullet.onUpdate(.4);
  assert.equal(bullet.node.angle, heading);
  assert.deepEqual(target.hits, []); assert.deepEqual(entrant.hits, [50]); assert.deepEqual(beyond.hits, []);
  const end = world.convertToNodeSpaceAR(effects.convertToWorldSpaceAR(bullet.node.getPosition()));
  assert(Math.abs(end.x - Math.sqrt(300 ** 2 - 80 ** 2)) < 1e-6);
  assert(Math.abs(end.y - 80) < 1e-6);
});

test('a piercing bolt skips a recycled contact and never repeats a hit across frames', () => {
  const { h, bullet } = shotSetup(), t = tower(h, { Tower: { attackType: 'sniper', projectileSpeed: 1000, pierceTargets: 3 } });
  const first = enemy('first', 120, 0), recycled = enemy('recycled', 140, 0), last = enemy('last', 330, 0);
  first.onAttacked = function (damage) { this.hits.push(damage); recycled.node._combatGeneration++; recycled.node.setPosition(140, 100); };
  h.d.enemyList = [first, recycled, last];
  h.g.onShotBuild(t, last);
  bullet.onUpdate(.14);
  assert.deepEqual(first.hits, [50]); assert.deepEqual(recycled.hits, []);
  complete(bullet);
  assert.deepEqual(first.hits, [50]); assert.deepEqual(last.hits, [50]);
});

test('a battle retired during tower launch feedback cannot spawn a piercing shot in the next battle', () => {
  const { h } = shotSetup({ BattleSounds: { attack() { h.g._combatEpoch++; } } });
  const t = tower(h, { Tower: { attackType: 'sniper', pierceTargets: 2 } });
  const target = enemy('target', 150, 0);
  h.d.enemyList = [target];
  t.doAttack();
  assert.equal(h.g.ndBuildArr2.length, 0);
  assert.equal(h.g.ndBuildArr1.length, 1);
  assert.deepEqual(target.hits, []);
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

test('cannon impacts apply each tier’s splash radius and edge damage at the committed aim position', () => {
  const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
  for (const row of config.BuildEnum[2].levelList.filter(row => row.Tower?.attackType === 'cannon')) {
    const { h, bullet } = shotSetup(), t = tower(h, row);
    const [damage] = row.Data, radius = [40, 50, 60, 70][row.level - 1], edgeRatio = [.1, .15, .2, .25][row.level - 1];
    t.time.AttackNum = damage;
    const primary = enemy('moving', 100, 0), edge = enemy('edge', 700, 0), arrival = enemy('arrival', 700, 0);
    const outside = enemy('past the blast', 101 + radius, 0);
    h.d.enemyList = [primary, edge, arrival, outside]; h.g.onShotBuild(t, primary);
    primary.node.setPosition(500, 0); edge.node.setPosition(100 + radius, 0); arrival.node.setPosition(100 + radius / 2, 0);
    complete(bullet);
    assert.deepEqual(primary.hits, []); assert.deepEqual(outside.hits, []);
    assert.equal(edge.hits.length, 1); assert(Math.abs(edge.hits[0] - damage * edgeRatio) < 1e-9);
    assert.equal(arrival.hits.length, 1); assert(Math.abs(arrival.hits[0] - damage * (1 + edgeRatio) / 2) < 1e-9);
  }
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

test('Cannon and Sniper keep and reset their fallback trails and use saved level speeds',()=>{
 const config=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
 for(const type of ['cannon','sniper'])for(const cfg of config.BuildEnum[2].levelList.filter(r=>r.Tower?.attackType===type)){
  const {h,bullet}=shotSetup();class Render{constructor(){this.enabled=true;}}class Trail extends Render{reset(){this.resets=(this.resets||0)+1;}}
  class Graphics extends Render{clear(){}circle(){}fill(){}stroke(){}moveTo(){}lineTo(){}close(){}}
  Object.assign(h.e.cc,{RenderComponent:Render,MotionStreak:Trail,Graphics,color:(...x)=>x});
  Node.prototype.setScale=function(s){this.scaleX=this.scaleY=s;};
  const trailNode=new Node('authored trail',bullet.node),trail=trailNode.addComponent(Trail),original=bullet.bullet.addComponent(Render),target=enemy('target',330,80,1000);
  h.d.enemyList=[target];h.g.onShotBuild(tower(h,cfg),target);
  assert.equal(bullet.speed,type==='cannon'?375:2100);assert.equal(trail.enabled,true);assert.equal(trail.resets,1);assert.equal(original.enabled,false);
  complete(bullet);assert.deepEqual(target.hits,[50]);bullet.freeNode();assert.equal(trail.enabled,true);assert.equal(original.enabled,true);
  h.g.onShotBuild(tower(h,cfg),target);assert.equal(trail.resets,2,'pooled shots retain an old trail');assert.equal(trail.enabled,true);complete(bullet);assert.deepEqual(target.hits,[50,50]);
 }
});

test('all Keep and tower tiers select their family trail and pooled flight keeps it visible through impact', () => {
  const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
  const catalog = require('../../assets/resources/projectiles/catalog.json');
  const trailIds = { arrow: 'trail:tower-archer', cannon: 'trail:tower-cannon', sniper: 'trail:tower-sniper' };
  const { h, bullet } = shotSetup(), looks = h.load('ProjectileLooks');
  class Renderer { constructor() { this.enabled = true; } }
  class Trail extends Renderer { reset() {} }
  class Texture {}
  Object.assign(h.e.cc, {
    RenderComponent: Renderer, MotionStreak: Trail, Texture2D: Texture, color: value => value,
    assetManager: { getBundle: bundle => ({ load(resource, type, done) {
      const descriptor = catalog.trails.find(trail => trail.bundle === bundle && trail.resource === resource);
      if (descriptor && type === Texture) done(null, new Texture());
      else done(new Error('Only trail textures are loaded in this fixture'));
    } }) },
    resources: { load(_resource, _type, done) { done(new Error('Only trail textures are loaded in this fixture')); } }
  });
  looks.prime(catalog);
  const fallback = bullet.bullet.addComponent(Trail);
  for (const row of config.BuildEnum[1].levelList.concat(config.BuildEnum[2].levelList)) {
    const trail = catalog.trails.find(value => value.id === trailIds[row.Tower.attackType]);
    assert.equal(looks.select(catalog, 'tower:' + row.ID + ':' + row.index).trail, trail.id);
    const target = enemy('target', 250, 0);
    h.d.enemyList = [target]; h.g.onShotBuild(tower(h, row), target);
    const node = bullet._projectileVisual.trailNode;
    assert(node && node.active, row.Tower.attackType);
    assert.equal(node.getComponent(Trail).stroke, trail.width);
    assert.equal(node.getComponent(Trail).fadeTime, trail.lifetime);
    assert.equal(fallback.enabled, false);
    complete(bullet);
    assert.equal(node.active, true, 'the trail can fade after the projectile ends');
    bullet.freeNode();
    assert.equal(node.active, false); assert.equal(fallback.enabled, true);
  }
});
