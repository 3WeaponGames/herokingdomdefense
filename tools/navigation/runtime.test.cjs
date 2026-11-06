'use strict';
// Exercise the shipped adapter and unit classes against the real planner.
// The Cocos mock implements scene transforms and component discovery; it does
// not replace pathfinding or the movement/arrival code under test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { NavigationGrid } = require('../../assets/_script/NavigationGrid');
const sourceDir = path.resolve(__dirname, '../../assets/_script');
const engineDir = process.env.COCOS_ENGINE_DIR || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }
function near(actual, expected, epsilon = 1e-6) { assert(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function installIntersection(cc) {
  const file = path.join(engineDir, 'cocos2d/core/collider/CCIntersection.js');
  if (fs.existsSync(file)) {
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { cc, module: { exports: {} } }, { filename: file });
  } else {
    // Portable geometry mock; installed Creator's implementation is used above
    // whenever present, including for the real gate regression on this PC.
    cc.Intersection = { polygonCircle(polygon, circle) {
      let inside = false, closest = Infinity; const p = circle.position;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[j], b = polygon[i], dx = b.x - a.x, dy = b.y - a.y;
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
        const length = dx * dx + dy * dy, t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
        closest = Math.min(closest, distance(p, { x: a.x + t * dx, y: a.y + t * dy }));
      }
      return inside || closest < circle.radius;
    } };
  }
}
class Vec2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  clone() { return new Vec2(this.x, this.y); }
  len() { return Math.hypot(this.x, this.y); }
  mag() { return this.len(); }
  static subtract(out, a, b) { out.x = a.x - b.x; out.y = a.y - b.y; return out; }
  static add(out, a, b) { out.x = a.x + b.x; out.y = a.y + b.y; return out; }
  static random(out, r) { out.x = r; out.y = 0; return out; }
  static distance(a, b) { return distance(a, b); }
}
Vec2.ZERO = new Vec2();
class Node {
  constructor(name = '', parent = null, x = 0, y = 0) {
    Object.assign(this, { name, x, y, scaleX: 1, scaleY: 1, angle: 0, active: true, components: [], children: [], parent: null, width: 400, height: 400 });
    if (parent) this.setParent(parent);
  }
  get activeInHierarchy() { return this.active && (!this.parent || this.parent.activeInHierarchy); }
  get position() { return this.getPosition(); }
  set position(value) { this.setPosition(value); }
  get childrenCount() { return this.children.length; }
  setParent(parent) {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = parent;
    if (parent) parent.children.push(this);
  }
  setPosition(x, y) { if (typeof x === 'object') ({ x, y } = x); this.x = x; this.y = y; }
  getPosition(out = new Vec2()) { out.x = this.x; out.y = this.y; return out; }
  getContentSize() { return { width: this.width, height: this.height }; }
  getChildByName(name) { return this.children.find(n => n.name === name); }
  convertToWorldSpaceAR(p) {
    const a = this.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const result = new Vec2(this.x + c * p.x * this.scaleX - s * p.y * this.scaleY, this.y + s * p.x * this.scaleX + c * p.y * this.scaleY);
    return this.parent ? this.parent.convertToWorldSpaceAR(result) : result;
  }
  convertToNodeSpaceAR(p) {
    const parentPoint = this.parent ? this.parent.convertToNodeSpaceAR(p) : p;
    const a = -this.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), x = parentPoint.x - this.x, y = parentPoint.y - this.y;
    return new Vec2((c * x - s * y) / this.scaleX, (s * x + c * y) / this.scaleY);
  }
  addComponent(Type) { const value = new Type(); value.node = this; this.components.push(value); return value; }
  getComponent(Type) { return this.components.find(value => value instanceof Type); }
  getComponents(Type) { return this.components.filter(value => value instanceof Type); }
  getComponentsInChildren(Type) { return this.getComponents(Type).concat(...this.children.map(n => n.getComponentsInChildren(Type))); }
}
class Collider { constructor() { this.enabled = true; this.sensor = false; this.offset = new Vec2(); } }
class PhysicsPolygonCollider extends Collider {}
class PhysicsBoxCollider extends Collider { constructor() { super(); this.size = { width: 20, height: 20 }; } }
class PhysicsCircleCollider extends Collider { constructor() { super(); this.radius = 8; } }
class CircleCollider extends Collider { constructor() { super(); this.radius = 8; } }
class RigidBody {
  constructor() { this.active = true; this.linearVelocity = new Vec2(77, -32); }
  syncPosition() {}
  syncRotation() {}
  getComponents(Type) { return this.node.getComponents(Type); }
}
function BaseCtrl() {}
BaseCtrl.prototype.onDestroy = function () { this.baseDestroyed = true; };
function enums() { return new Proxy({}, { get: (_, key) => String(key) }); }
function environment() {
  let now = 0;
  const physics = { listeners: [],
    on(event, callback, target) { this.listeners.push({ event, callback, target }); },
    off(event, callback, target) { this.listeners = this.listeners.filter(l => l.event !== event || l.callback !== callback || l.target !== target); },
    emit(event) { this.listeners.slice().filter(l => l.event === event).forEach(l => l.callback.call(l.target)); } };
  const game = {
    ndMain: new Node('ndMain'), mapSize: { width: 400, height: 400 },
    ndAggFlag: new Node('flag'), pathList: [],
    gameData: { obstacles: [], buildings: [], soldiers: [], talentAdd: {}, treasureAdd: {}, addTime: {}, getHpAdd: () => 1, getAttAdd: () => 1, getGameBuff: () => null,
      getBulidList() { return this.buildings; }, getSoldierList() { return this.soldiers; } }
  };
  game.ctrPlay = { node: new Node('hero', game.ndMain, 150, 150), ndRange: new Node(), isDead: () => false };
  const ui = { default: { instance: { ctrGame: game, speed: 1, ctrEffect: { onMoveTrack() {} } } } };
  const cc = { Node, Vec2, PhysicsCollider: Collider, PhysicsPolygonCollider, PhysicsBoxCollider, PhysicsCircleCollider, CircleCollider, RigidBody,
    director: { getPhysicsManager: () => physics }, game: { config: { frameRate: 60 } },
    v2: (x = 0, y = 0) => typeof x === 'object' ? new Vec2(x.x, x.y) : new Vec2(x, y), size: (width, height) => ({ width, height }),
    winSize: { width: 750, height: 1334 }, _decorator: { ccclass: target => target, property: () => () => undefined } };
  const cfg = { ID: 90001, AttackRange: 20, SearchRange: 40, Health: 100, AttackDamage: 5, AttackInterval: 1, BuildingCross: 1, MoveSpeed: 60 };
  const enumModule = new Proxy({}, { get: () => enums() });
  const stubs = {
    NavigationGrid: { NavigationGrid }, BaseCtrl: { default: BaseCtrl }, KinghtFallUIGame: ui,
    KinghtFallConfig: { KinghtFallParameter: { FollowRange: 40, FollowMode: 1 }, KinghtFallBundelName: {}, KinghtFallPrefabName: {}, KinghtFallPoolName: {} },
    KinghtFallDataMgr: { KinghtFallDataMgr: { getInstance: () => ({ getSoldierCfgById: () => cfg }) } },
    KinghtFallEnum: enumModule,
    KinghtFallModle: { KinghtFallSoldierAniEnum: { Idle: 'idle', Move: 'move' }, KinghtFallGameArmy: {}, KinghtFallGameStage: { Prepare: 0, Fight: 1 } },
    KinghtFallGameCtrlData: { default: function () {}, KinghtFallTimeType: {}, KinghtFallCommerceKeyType: {} }
  };
  const modules = {};
  function load(name) {
    if (stubs[name]) return stubs[name];
    if (modules[name]) return modules[name].exports;
    if (!/^(KinghtFallNavigation|KinghtFallInterface|KinghtFallGameCtrl|KinghtFallEnemy(Base|Melee|Long|Auxiliary|Item\d+)|KinghtFallSoldier(Base|Item\d+))$/.test(name)) return { default: function () {} };
    const module = { exports: {} }; modules[name] = module;
    const context = { module, exports: module.exports, require: load, cc, sp: { Skeleton: function () {} }, console, Set, Date: { now: () => now },
      __extends(Child, Parent) { Object.setPrototypeOf(Child, Parent); Child.prototype = Object.create(Parent.prototype); Child.prototype.constructor = Child; },
      __decorate(decorators, target, key) { if (key !== undefined) return undefined; return decorators.reduceRight((value, decorator) => decorator(value) || value, target); },
      __spreadArrays: (...arrays) => [].concat(...arrays) };
    vm.runInNewContext(fs.readFileSync(path.join(sourceDir, name + '.js'), 'utf8'), context, { filename: name + '.js' });
    return module.exports;
  }
  const nav = load('KinghtFallNavigation');
  function unit(x = -100, y = 0, parent = game.ndMain) {
    const node = new Node('unit', parent, x, y), rigidBody = node.addComponent(RigidBody);
    return { node, rigidBody, getSpeed: () => 60 };
  }
  function box(x, y, width, height, building = false, parent = game.ndMain) {
    const node = new Node('obstacle', parent, x, y), collider = node.addComponent(PhysicsBoxCollider);
    collider.size = { width, height }; (building ? game.gameData.buildings : game.gameData.obstacles).push({ node });
    return collider;
  }
  function actor(name, x = -100, y = 0, parent = game.ndMain) {
    const value = new (load(name).default)(), body = unit(x, y, parent);
    Object.assign(value, body, { state: 1, time: { Attack: -1, Spell: 0, SpellMax: Infinity, Movetime: 0 }, cfg, hp: 100, hpMax: 100, hpctrl: { setHp() {}, setType() {} },
      getAttSpeed: () => 1, isDead: () => false, getFind: () => null, isFind: () => false,
      spAni: { node: new Node(), setAnimation() {} }, setLeft(value) { this.facingLeft = value; }, onFindList() {} });
    value.spAni2 = value.spAni3 = value.spAni;
    if (value.oldPos) value.node.getPosition(value.oldPos);
    return value;
  }
  return { game, nav, unit, box, actor, load, cc, cfg, physics, setTime: value => { now = value; } };
}

test('Nested transforms use one main-space radius and convert movement back to the local parent', () => {
  const e = environment();
  e.game.ndMain.setPosition(350, -200); e.game.ndMain.scaleX = e.game.ndMain.scaleY = 1.3;
  const group = new Node('group', e.game.ndMain, 70, 30); group.angle = 90; group.scaleX = group.scaleY = 2;
  const u = e.unit(0, 0, group), child = new Node('body', u.node, 3, 0);
  child.addComponent(PhysicsCircleCollider).radius = 4;
  u.node.addComponent(CircleCollider).radius = 500; // search range must not affect navigation
  assert.equal(e.nav.get(e.game).radius(u), 20);
  const result = e.nav.moveTo(u, e.game, { x: 70, y: 120 }, 0.5);
  near(u.node.x, 15); near(u.node.y, 0);
  near(e.nav.positionOf(u.node, e.game).y, 60);
  assert.equal(result.arrived, false);
  near(u.rigidBody.linearVelocity.len(), 0);
});

test('Actual obstacle path advances by safe segments, clamps large timesteps, and never skips a nearby corner', () => {
  const e = environment(); e.box(0, 0, 40, 100);
  const u = e.unit(), target = { x: 100, y: 0 }, nav = e.nav.get(e.game);
  let result = e.nav.moveTo(u, e.game, target, 0), last = e.nav.positionOf(u.node, e.game);
  assert.equal(result.arrived, false); near(last.x, -100);
  for (let i = 0; i < 40 && !result.arrived; i++) {
    result = e.nav.moveTo(u, e.game, target, 10);
    const current = e.nav.positionOf(u.node, e.game);
    assert(nav.grid.segmentClear(last, current, nav.radius(u)), 'movement cut through an inflated collider');
    last = current;
  }
  assert.equal(result.reached, true); near(last.x, 100); near(last.y, 0);
  // A target less than the old 2px tolerance away is not arrived without travel.
  result = e.nav.moveTo(u, e.game, { x: 101.5, y: 0 }, 0);
  assert.equal(result.arrived, false); near(u.node.x, 100);
  result = e.nav.moveTo(u, e.game, { x: 101.5, y: 0 }, 100);
  assert.equal(result.reached, true); near(u.node.x, 101.5);
});

test('Blocked building goals report safe endpoint arrival separately from exact target arrival', () => {
  const e = environment(); e.box(0, 0, 40, 40, true); const u = e.unit();
  let result;
  for (let i = 0; i < 20; i++) { result = e.nav.moveTo(u, e.game, { x: 0, y: 0 }, 1); if (result.arrived) break; }
  assert.equal(result.arrived, true); assert.equal(result.reached, false);
  assert(u.node.x < -20); assert(e.nav.get(e.game).grid.isWalkable(e.nav.positionOf(u.node, e.game), 12));
});

test('A moving target cannot report arrival at its stale cached endpoint', () => {
  const e = environment(), u = e.unit();
  e.nav.moveTo(u, e.game, { x: 100, y: 0 }, 1);
  let result = e.nav.moveTo(u, e.game, { x: 110, y: 0 }, 100);
  near(u.node.x, 100); assert.equal(result.arrived, false); assert.equal(result.reached, false);
  result = e.nav.moveTo(u, e.game, { x: 110, y: 0 }, 100);
  near(u.node.x, 110); assert.equal(result.reached, true);
});

test('Unreachable routes clear stale velocity, throttle retries, and recover immediately on geometry revision', () => {
  const e = environment(); const wall = e.box(0, 0, 20, 400), u = e.unit(), target = { x: 100, y: 0 };
  let result = e.nav.moveTo(u, e.game, target, 1), nav = e.nav.get(e.game);
  assert.equal(result.blocked, true); near(u.node.x, -100); near(u.rigidBody.linearVelocity.len(), 0);
  assert.equal(nav.stats.searches, 1);
  e.setTime(100); e.nav.moveTo(u, e.game, target, 1); assert.equal(nav.stats.searches, 1);
  e.setTime(801); e.nav.moveTo(u, e.game, target, 1); assert.equal(nav.stats.searches, 2);
  wall.enabled = false; e.nav.beginFrame(e.game);
  result = e.nav.moveTo(u, e.game, target, 1);
  assert.equal(result.blocked, false); assert.equal(nav.stats.searches, 3); near(u.node.x, -40);
});

test('Collider snapshots track active buildings, sensors, body activation, transforms and map bounds', () => {
  const e = environment(), wall = e.box(0, 0, 20, 100, true), nav = e.nav.get(e.game);
  nav.refresh(); const grid = nav.grid; assert.equal(nav.revision, 1);
  e.nav.beginFrame(e.game); nav.refresh(); assert.equal(nav.grid, grid);
  wall.sensor = true; e.nav.beginFrame(e.game); nav.refresh(); assert.equal(nav.revision, 2);
  assert(nav.grid.segmentClear({ x: -80, y: 0 }, { x: 80, y: 0 }, 12));
  wall.sensor = false; wall.body = { active: false }; e.nav.beginFrame(e.game); nav.refresh(); assert.equal(nav.revision, 2);
  wall.body.active = true; e.nav.beginFrame(e.game); nav.refresh(); assert.equal(nav.revision, 3);
  wall.node.x = 10; e.nav.beginFrame(e.game); nav.refresh(); assert.equal(nav.revision, 4);
  wall.node.active = false; e.nav.beginFrame(e.game); nav.refresh(); assert.equal(nav.revision, 5);
  e.game.mapSize.width = 500; e.nav.beginFrame(e.game); nav.refresh(); assert.equal(nav.revision, 6);
  assert(nav.grid.isWalkable({ x: 230, y: 0 }, 12));
});

test('Round physics obstacles use a conservative polygon rather than cutting into a circle', () => {
  const e = environment(), owner = new Node('round', e.game.ndMain);
  owner.addComponent(PhysicsCircleCollider).radius = 80; e.game.gameData.obstacles.push({ node: owner });
  const nav = e.nav.get(e.game); nav.refresh();
  for (let i = 0; i < 128; i++) {
    const a = i * Math.PI / 64;
    assert.equal(nav.grid.isWalkable({ x: Math.cos(a) * 79.99, y: Math.sin(a) * 79.99 }, 0), false);
  }
});

test('Gate sibling wall pieces referenced by ndAniOther block routes and track their own activation', () => {
  const e = environment(), gate = e.box(0, 180, 20, 20, true), owner = e.game.gameData.buildings[0];
  const wingParent = new Node('side wall group', e.game.ndMain, 30, 0), wing = new Node('wing', wingParent, -30, 0);
  const collider = wing.addComponent(PhysicsBoxCollider); collider.size = { width: 20, height: 400 };
  owner.ndAniOther = [{ node: wing }, { node: wing }, wing];
  const u = e.unit(), nav = e.nav.get(e.game), result = e.nav.moveTo(u, e.game, { x: 100, y: 0 }, 1);
  assert.equal(result.blocked, true); assert.equal(nav.grid.polygons.length, 2, 'Repeated references must not duplicate shapes');
  gate.node.active = false; e.nav.beginFrame(e.game); nav.refresh();
  assert.equal(nav.grid.polygons.length, 1, 'A visible sibling wing remains solid independently of the gate');
  assert.equal(nav.grid.segmentClear({ x: -100, y: 0 }, { x: 100, y: 0 }, 12), false);
  collider.enabled = false; e.nav.beginFrame(e.game);
  assert.equal(e.nav.moveTo(u, e.game, { x: 100, y: 0 }, 1).blocked, false);
});

test('A validated overlap escape moves gradually and cached paths are discarded after an unrelated teleport', () => {
  const e = environment(); e.box(0, 0, 40, 40); const u = e.unit(-25, 0), target = { x: -100, y: 0 };
  let result = e.nav.moveTo(u, e.game, target, 0.01), state = u._navigationState;
  assert(state.escape); near(distance({ x: -25, y: 0 }, e.nav.positionOf(u.node, e.game)), 0.6);
  const searches = e.nav.get(e.game).stats.searches;
  for (let i = 0; i < 40 && !result.arrived; i++) result = e.nav.moveTo(u, e.game, target, 0.1);
  assert.equal(result.reached, true); assert.equal(e.nav.get(e.game).stats.searches, searches);
  u.node.setPosition(25, 0);
  e.nav.moveTo(u, e.game, target, 0.01);
  assert(e.nav.get(e.game).stats.searches > searches); assert(u._navigationState.escape);
});

test('Physics-disabled building-crossing units retain direct movement and clear old cached routes', () => {
  const e = environment(); e.box(0, 0, 20, 400); const u = e.unit();
  u._navigationState = { stale: true }; u.rigidBody.active = false;
  const result = e.nav.moveTo(u, e.game, { x: 100, y: 0 }, 100);
  near(u.node.x, 100); assert.equal(result.reached, true); assert.equal(u._navigationState, null);
  assert.equal(e.nav.get(e.game).stats.searches, 0); near(u.rigidBody.linearVelocity.len(), 0);
});

test('Every enemy archetype inherits live navigation; stale combat vectors cannot steer authored movement', () => {
  for (let n = 1; n <= 10; n++) {
    const e = environment(), name = 'KinghtFallEnemyItem' + String(n).padStart(2, '0'), u = e.actor(name);
    const routeParent = new Node('route', e.game.ndMain, 30, -10), waypoint = new Node('goal', routeParent, 70, 10);
    u.bornInfo = { nodeIndex: 0, pathList: [waypoint] };
    u.vec2_2 = new Vec2(-9000, 9000); u.onUpdate(0.1);
    near(u.node.x, -94); near(u.node.y, 0); assert.equal(u.bornInfo.nodeIndex, 0, name);
    assert(u._navigationState, name + ' did not use the planner');
    assert(u instanceof e.load('KinghtFallEnemyBase').default);
  }
});

test('Enemy combat targets use transformed child-node positions without consuming authored route entries', () => {
  const e = environment(), u = e.actor('KinghtFallEnemyItem01'), group = new Node('building', e.game.ndMain, 30, 20), target = new Node('tag', group, 70, -20);
  u.bornInfo = { nodeIndex: 0, pathList: [new Node('authored', e.game.ndMain, -100, 150)] };
  u.getFind = () => ({ tag: target, canAtt: false });
  u.onUpdate(100); near(u.node.x, 100); near(u.node.y, 0); assert.equal(u.bornInfo.nodeIndex, 0);
  u.onUpdate(0); assert.equal(u.bornInfo.nodeIndex, 0);
});

test('A fully upgraded Map02 gate wing is approached at its attack polygon rather than its unreachable origin', () => {
  const fixture = require('./fixtures/map02-upper-left-gate-level3.json');
  for (const spawn of [fixture.spawn, { x: -640, y: 880 }, { x: -600, y: 880 }]) {
    const e = environment(); installIntersection(e.cc);
    e.game.mapSize = { width: fixture.bounds.maxX - fixture.bounds.minX, height: fixture.bounds.maxY - fixture.bounds.minY };
    e.game.ctrPlay.isDead = () => true;
    function shape(node, points) {
      const collider = node.addComponent(PhysicsPolygonCollider);
      collider.points = points.map(p => ({ x: p.x - node.x, y: p.y - node.y }));
      return collider;
    }
    fixture.terrain.forEach(points => { const node = new Node('terrain', e.game.ndMain); shape(node, points); e.game.gameData.obstacles.push({ node }); });
    const parts = fixture.parts.map(part => {
      const node = new Node(part.name, e.game.ndMain, part.origin.x, part.origin.y); node.fixtureId = part.id;
      return { node, collider: shape(node, part.points) };
    });
    const gate = { node: parts[0].node, ndAniOther: parts.slice(1), getIsWork: () => true,
      getWposPhyCol2: () => parts.map(p => ({ tagNode: p.node, points: p.collider.points.map(v => p.node.convertToWorldSpaceAR(v)) })) };
    e.game.gameData.buildings.push(gate);
    const u = e.actor('KinghtFallEnemyItem01', spawn.x, spawn.y), body = u.node.addComponent(PhysicsBoxCollider);
    body.size = { width: 22, height: 22 }; u.cfg.AttackRange = fixture.attackRange; u.cfg.SearchRange = fixture.searchRange;
    delete u.getFind; delete u.onFindList;
    let attacks = 0; u.doAttackStart = () => { attacks++; };
    u.bornInfo = { nodeIndex: 0, pathList: [new Node('objective', e.game.ndMain, -245.465, 598.627)] };
    const selected = u.getFind(), nav = e.nav.get(e.game); nav.refresh();
    if (spawn === fixture.spawn) assert.equal(selected.tag.fixtureId, fixture.expectedOldSelection);
    assert.equal(selected.canAtt, false); assert(selected.polygon.length >= 3);
    assert.equal(nav.grid.findPath(spawn, e.nav.positionOf(selected.tag, e.game), fixture.radius), null, 'fixture no longer reproduces the buried-origin failure');
    assert.equal(!!u.onFindList(), false); assert.equal(attacks, 0);
    const approach = e.nav.attackPositionOf(selected, u, e.game);
    assert(nav.grid.findPath(spawn, approach, fixture.radius), 'polygon approach has no safe path');
    let previous = u.node.getPosition();
    for (let i = 0; i < 160 && !u.getFind().canAtt; i++) {
      u.onUpdate(0.05);
      const current = u.node.getPosition();
      assert(nav.grid.segmentClear(previous, current, fixture.radius), 'enemy cut through the closed gate or terrain');
      assert(distance(previous, current) <= 3.000001, 'approach teleported');
      assert.equal(u.bornInfo.nodeIndex, 0, 'combat pursuit consumed the route objective');
      previous = current;
    }
    assert.equal(u.getFind().canAtt, true, 'enemy never entered its unchanged attack range');
    u.time.Attack = 1; u.onUpdate(0);
    assert.equal(attacks, 1, 'normal movement update did not enter an attack on the closed gate');
    assert(parts.every(p => p.collider.enabled), 'fix opened or disabled the gate');
  }
});

test('Building approach polygons transform from world space and ordinary unit targets retain their node position', () => {
  const e = environment(), u = e.unit(0, 0), target = new Node('target', e.game.ndMain, 100, 0);
  e.game.ndMain.setPosition(300, -200); e.game.ndMain.scaleX = e.game.ndMain.scaleY = 1.5; e.game.ndMain.angle = 25;
  const polygon = [{ x: 60, y: -20 }, { x: 120, y: -20 }, { x: 120, y: 20 }, { x: 60, y: 20 }].map(p => e.game.ndMain.convertToWorldSpaceAR(p));
  const approach = e.nav.attackPositionOf({ tag: target, polygon }, u, e.game);
  near(approach.x, 60); near(approach.y, 0);
  const ordinary = e.nav.attackPositionOf({ tag: target }, u, e.game);
  near(ordinary.x, 100); near(ordinary.y, 0);
});

test('Map02 level-two gate and neighboring built structures recover all four reproduced pursuit stalls', () => {
  const fixture = require('./fixtures/map02-upper-left-gate-level2.json');
  for (const spawn of fixture.starts) {
    const e = environment(); installIntersection(e.cc);
    e.game.mapSize = { width: fixture.bounds.maxX - fixture.bounds.minX, height: fixture.bounds.maxY - fixture.bounds.minY };
    e.game.ctrPlay.isDead = () => true;
    fixture.terrain.forEach(points => {
      const node = new Node('terrain', e.game.ndMain), collider = node.addComponent(PhysicsPolygonCollider); collider.points = points;
      e.game.gameData.obstacles.push({ node });
    });
    const colliders = [];
    fixture.buildings.forEach(building => {
      const root = new Node(building.name, e.game.ndMain, building.origin.x, building.origin.y);
      const parts = building.parts.map(part => {
        const node = part.id === building.nodeId ? root : new Node(part.name, e.game.ndMain, part.origin.x, part.origin.y);
        node.fixtureId = part.id;
        const collider = node.addComponent(PhysicsPolygonCollider);
        collider.points = part.points.map(p => ({ x: p.x - node.x, y: p.y - node.y })); colliders.push(collider);
        return { node, collider };
      });
      e.game.gameData.buildings.push({ node: root, ndAniOther: parts.filter(p => p.node !== root), getIsWork: () => true,
        getWposPhyCol2: () => parts.map(p => ({ tagNode: p.node, points: p.collider.points.map(v => p.node.convertToWorldSpaceAR(v)) })) });
    });
    const u = e.actor('KinghtFallEnemyItem01', spawn.x, spawn.y), body = u.node.addComponent(PhysicsBoxCollider);
    body.size = { width: 22, height: 22 }; u.cfg.AttackRange = fixture.attackRange; u.cfg.SearchRange = fixture.searchRange;
    delete u.getFind; delete u.onFindList; let attacks = 0; u.doAttackStart = () => { attacks++; };
    u.bornInfo = { nodeIndex: 0, pathList: [new Node('objective', e.game.ndMain, -245.465, 598.627)] };
    const selected = u.getFind(), nav = e.nav.get(e.game); nav.refresh();
    assert.equal(selected.canAtt, false);
    assert.equal(nav.grid.findPath(spawn, e.nav.positionOf(selected.tag, e.game), fixture.radius), null, JSON.stringify(spawn) + ' no longer reproduces old origin failure');
    assert(nav.grid.findPath(spawn, e.nav.attackPositionOf(selected, u, e.game), fixture.radius), 'nearest boundary is unreachable at ' + JSON.stringify(spawn));
    let previous = u.node.getPosition();
    for (let i = 0; i < 160 && !u.getFind().canAtt; i++) {
      u.onUpdate(0.05); const current = u.node.getPosition();
      assert(nav.grid.segmentClear(previous, current, fixture.radius), 'approach crossed another building');
      assert(distance(previous, current) <= 3.000001); previous = current;
    }
    assert.equal(u.getFind().canAtt, true, 'level-two enemy stayed outside attack range at ' + JSON.stringify(spawn));
    u.time.Attack = 1; u.onUpdate(0); assert.equal(attacks, 1);
    assert.equal(u.bornInfo.nodeIndex, 0); assert(colliders.every(c => c.enabled));
  }
});

test('All eight pursuing enemy classes resume forward after the hero leaves actual aggro range', () => {
  for (const n of [1, 2, 3, 4, 5, 7, 8, 10]) {
    const e = environment(), name = 'KinghtFallEnemyItem' + String(n).padStart(2, '0'), u = e.actor(name);
    delete u.getFind; // Exercise the shipped hero-distance/aggro selection too.
    u.bornInfo = { nodeIndex: 0, pathList: [new Node('passed', e.game.ndMain, -50, 0), new Node('objective', e.game.ndMain, 100, 0)] };
    for (let i = 0; i < 4; i++) {
      e.game.ctrPlay.node.setPosition(u.node.x + 42, 0);
      u.onUpdate(0.5);
      assert.equal(u.bornInfo.nodeIndex, 0, name + ' consumed a waypoint during combat');
    }
    near(u.node.x, 20); assert.equal(u._routeInterrupted, true);
    e.game.ctrPlay.node.setPosition(150, 150);
    u.onUpdate(0.1);
    near(u.node.x, 26); assert.equal(u.bornInfo.nodeIndex, 1, name);
    assert.equal(u._routeInterrupted, false); assert.equal(u.facingLeft, false);
    for (let i = 0; i < 20 && u.bornInfo.nodeIndex < 2; i++) u.onUpdate(0.1);
    near(u.node.x, 100); assert.equal(u.bornInfo.nodeIndex, 2, name + ' lost the final objective');
  }
});

test('Auxiliary classes share route resumption without acquiring hero aggro', () => {
  for (const name of ['KinghtFallEnemyItem06', 'KinghtFallEnemyItem09']) {
    const e = environment(), u = e.actor(name, 20, 0);
    u.bornInfo = { nodeIndex: 0, pathList: [new Node('passed', e.game.ndMain, -50, 0), new Node('objective', e.game.ndMain, 100, 0)] };
    u.getFind = () => { throw new Error('Auxiliary must not start chasing'); };
    u.interruptRoute(); u.onUpdate(0.1);
    near(u.node.x, 26); assert.equal(u.bornInfo.nodeIndex, 1); assert.equal(u._routeInterrupted, false);
    u.onUpdate(0.1); near(u.node.x, 32);
  }
});

test('Combat acquisition and disengagement invalidate close destinations within the path cache tolerance', () => {
  const e = environment(), u = e.actor('KinghtFallEnemyItem01', 0, 0);
  const objective = new Node('objective', e.game.ndMain, 35, 0), hero = new Node('hero', e.game.ndMain, 20, 0);
  u.bornInfo = { nodeIndex: 0, pathList: [objective] };
  u.onUpdate(0); near(u._navigationState.target.x, 35);
  u.getFind = () => ({ tag: hero, canAtt: false });
  u.onUpdate(0); near(u._navigationState.target.x, 20);
  u.getFind = () => null;
  u.onUpdate(0.1); near(u._navigationState.target.x, 35); near(u.node.x, 6);
  assert.equal(e.nav.get(e.game).stats.searches, 3);
});

test('Disengaging skips multiple passed waypoints but retains the final objective and transforms', () => {
  const e = environment(), group = new Node('route', e.game.ndMain, -100, 20), u = e.actor('KinghtFallEnemyItem01', 60, 0);
  const nodes = [0, 60, 120, 200].map((x, i) => new Node('waypoint' + i, group, x, -20));
  u.bornInfo = { nodeIndex: 0, pathList: nodes }; u.interruptRoute();
  u.onUpdate(0); assert.equal(u.bornInfo.nodeIndex, 3); near(u.node.x, 60);
  u.onUpdate(0.1); near(u.node.x, 66); assert.equal(u.bornInfo.nodeIndex, 3);
  u.onUpdate(1); near(u.node.x, 100); assert.equal(u.bornInfo.nodeIndex, 4);
  assert.equal(nodes.length, 4); near(nodes[0].x, 0);
});

test('A resumed objective routes around intervening obstacles instead of cutting through them', () => {
  const e = environment(); e.box(60, 0, 16, 100);
  const u = e.actor('KinghtFallEnemyItem01', 20, 0), body = u.node.addComponent(PhysicsBoxCollider);
  body.size = { width: 22, height: 22 }; // 20-unit clearance, matching authored bodies.
  u.bornInfo = { nodeIndex: 0, pathList: [new Node('passed', e.game.ndMain, -50, 0), new Node('objective', e.game.ndMain, 150, 0)] };
  u.getFind = () => ({ tag: e.game.ctrPlay.node, canAtt: true }); u.onUpdate(0);
  u.getFind = () => null;
  const nav = e.nav.get(e.game); let last = u.node.getPosition(), detoured = false;
  for (let i = 0; i < 200 && u.bornInfo.nodeIndex < 2; i++) {
    u.onUpdate(0.1);
    assert(u.bornInfo.nodeIndex >= 1, 'returned to the obsolete waypoint');
    const current = u.node.getPosition();
    assert(nav.grid.segmentClear(last, current, nav.radius(u)), 'resumed movement crossed a collider');
    assert(distance(last, current) <= 6.000001, 'resumed movement teleported');
    detoured = detoured || Math.abs(current.y) > 50;
    last = current;
  }
  assert(detoured); near(u.node.x, 150); near(u.node.y, 0); assert.equal(u.bornInfo.nodeIndex, 2);
});

test('Route resumption cannot infer passed waypoints across a wall or before a forward segment', () => {
  const e = environment(); e.box(0, 0, 100, 20);
  const u = e.actor('KinghtFallEnemyItem01', 0, 40);
  u.bornInfo = { nodeIndex: 0, pathList: [new Node('first', e.game.ndMain, -100, -80), new Node('last', e.game.ndMain, 100, -80)] };
  u.interruptRoute(); u.onUpdate(0); assert.equal(u.bornInfo.nodeIndex, 0);
  // An intentional building-crossing unit still uses its configured behavior.
  u.rigidBody.active = false; u.interruptRoute(); u.onUpdate(0); assert.equal(u.bornInfo.nodeIndex, 1);
  const before = environment(), b = before.actor('KinghtFallEnemyItem01', -100, 40);
  b.bornInfo = { nodeIndex: 0, pathList: [new Node('first', before.game.ndMain, -50, 0), new Node('last', before.game.ndMain, 100, 0)] };
  b.interruptRoute(); b.onUpdate(0); assert.equal(b.bornInfo.nodeIndex, 0);
});

test('Enemy authored goals advance only at the resolved endpoint; wait and unreachable states never advance', () => {
  for (const name of ['KinghtFallEnemyItem01', 'KinghtFallEnemyItem06', 'KinghtFallEnemyItem09']) {
    const e = environment(); e.box(0, 0, 40, 40, true); const u = e.actor(name), waypoint = new Node('goal', e.game.ndMain);
    u.bornInfo = { nodeIndex: 0, pathList: [waypoint] };
    u.onUpdate(0); assert.equal(u.bornInfo.nodeIndex, 0);
    for (let i = 0; i < 20 && u.bornInfo.nodeIndex === 0; i++) u.onUpdate(0.2);
    assert.equal(u.bornInfo.nodeIndex, 1, name); assert(u.node.x < -20);
    u.state = 3; const pos = u.node.getPosition(); u.onUpdate(0.2); near(distance(pos, u.node.position), 0); assert.equal(u.bornInfo.nodeIndex, 1);
    const blocked = environment(); blocked.box(0, 0, 20, 400); const b = blocked.actor(name);
    b.bornInfo = { nodeIndex: 0, pathList: [new Node('goal', blocked.game.ndMain, 100, 0)] }; b.onUpdate(10);
    assert.equal(b.bornInfo.nodeIndex, 0); near(b.node.x, -100);
  }
});

test('Every allied archetype follows the same planner and ends a rally once, without stale-vector movement', () => {
  for (let n = 1; n <= 4; n++) {
    const e = environment(), name = 'KinghtFallSoldierItem' + String(n).padStart(2, '0'), u = e.actor(name);
    u.pathList = { nodeIndex: 0, pathIndex: 42, pathInfoList: [{ index: 42, pos: { x: 100, y: 0 } }] };
    e.game.ndAggFlag.Flag = 1; u.vec2_2 = new Vec2(-9000, 9000); u.onUpdate(0.1);
    near(u.node.x, -94); near(u.node.y, 0); assert(u._navigationState);
    u.onUpdate(100); near(u.node.x, 100); assert.equal(u.pathList, null); assert.equal(e.game.ndAggFlag.Flag, 0); assert.equal(u.state, 0);
    u.onUpdate(0); assert.equal(e.game.ndAggFlag.Flag, 0);
    assert(u instanceof e.load('KinghtFallSoldierBase').default);
  }
});

test('Allied combat pursuit and follow distance both use the main coordinate system', () => {
  const e = environment(), group = new Node('unit-group', e.game.ndMain, -100, 0), u = e.actor('KinghtFallSoldierItem01', 0, 0, group);
  const targetParent = new Node('target-group', e.game.ndMain, 100, 20), target = new Node('target', targetParent, 0, -20);
  u.getFind = () => ({ tag: { node: target }, canAtt: false }); u.onUpdate(0.1);
  near(e.nav.positionOf(u.node, e.game).x, -94); near(u.node.x, 6);
  // Same local coordinates under different parents are not close in the map.
  e.game.ctrPlay.node.setParent(targetParent); e.game.ctrPlay.node.setPosition(6, -20);
  u.isAgg = true; u.pathList = { nodeIndex: 0, pathIndex: 1, pathInfoList: [{ index: 1, pos: { x: 100, y: 0 } }] };
  u.onUpdate(0.1); assert.equal(u.state, 1); near(e.nav.positionOf(u.node, e.game).x, -88);
});

test('Pooled enemy/allied init, allied revival, new rallies and route updates discard cached navigation', () => {
  const e = environment(), enemy = e.actor('KinghtFallEnemyBase'), soldier = e.actor('KinghtFallSoldierBase');
  e.game.setPath = () => ({ nodeIndex: 0, pathList: [] });
  enemy._navigationState = { old: true }; enemy._routeInterrupted = true; enemy.initData(1, {});
  assert.equal(enemy._navigationState, null); assert.equal(enemy._routeInterrupted, false); near(enemy.rigidBody.linearVelocity.len(), 0);
  soldier._navigationState = { old: true }; soldier.initData(90001); assert.equal(soldier._navigationState, null); near(soldier.rigidBody.linearVelocity.len(), 0);
  soldier._navigationState = { old: true }; soldier.setNew(); assert.equal(soldier._navigationState, null); assert.equal(soldier.pathList, null);
  assert.equal(soldier.startAgg(null), false); assert.equal(soldier.startAgg({ index: 1 }), false);
  soldier._navigationState = { old: true }; assert.equal(soldier.startAgg({ index: 1, pos: { x: 100, y: 0 } }), true); assert.equal(soldier._navigationState, null);
  soldier._navigationState = { old: true }; soldier.setPath([], true); assert.equal(soldier._navigationState, null);
  soldier.setPath([{ index: 1, pos: { x: 100, y: 0 } }, { index: 2, pos: { x: 120, y: 0 } }], false);
  assert.equal(soldier.pathList.pathInfoList.length, 2);
  soldier.pathList = { nodeIndex: 0, pathIndex: 1, pathInfoList: [] }; assert.doesNotThrow(() => soldier.setPath([], false));
});

test('Game controller invalidates snapshots per update, bounds rally history, and initializes empty routes safely', () => {
  const e = environment(), ctrl = new (e.load('KinghtFallGameCtrl').default)();
  Object.assign(ctrl, e.game, { ctrPlay: { node: new Node('hero', e.game.ndMain, 0, 0), doMove() {} }, gameStatus: -1, isAgg: true,
    pathList: Array.from({ length: 1000 }, (_, i) => ({ index: i, pos: new Vec2(0, 0) })), pathIndex: 1000 });
  let received = 0;
  ctrl.gameData.soldiers = [{ onUpdate() {}, setPath(list) { received = list.length; }, node: new Node(), startAgg() { return false; } }];
  const nav = e.nav.get(ctrl); nav.refresh(); assert.equal(nav._refreshPending, false);
  ctrl.onUpdate(0); assert.equal(nav._refreshPending, true); assert.equal(received, 1000);
  assert.equal(ctrl.pathList.length, 500); assert.equal(ctrl.pathList[0].index, 500);
  ctrl.pathList = []; ctrl.onUpdate(0); assert.equal(ctrl.pathList.length, 1); assert.equal(ctrl.pathList[0].index, 1000);
});

test('Map initialization discards the previous map navigation instance', () => {
  const e = environment(), ctrl = new (e.load('KinghtFallGameCtrl').default)(), map = new Node('map');
  for (const name of ['ndBg', 'ndDown', 'ndPath', 'ndTrack', 'ndMain', 'ndUI']) new Node(name, map);
  new Node('ndStar', map.getChildByName('ndPath'), 10, 20);
  Object.assign(ctrl, e.game); ctrl.gameData.initMap = () => {}; e.nav.get(ctrl);
  ctrl.initMap(map); assert.equal(ctrl._navigation, null); assert.equal(ctrl.ctrPlay.node.parent, ctrl.ndMain);
});

function functionAt(source, marker) {
  const start = source.indexOf('function', source.indexOf(marker));
  assert(start >= 0, 'Function marker missing: ' + marker);
  const open = source.indexOf('{', start);
  let depth = 1, end = open + 1;
  for (; end < source.length && depth; end++) {
    if (source[end] === '{') depth++;
    else if (source[end] === '}') depth--;
  }
  assert.equal(depth, 0);
  return source.slice(start, end);
}

test('UIGame settles the ancestor Widget before activating map Rigidbody components', () => {
  const source = fs.readFileSync(path.join(sourceDir, 'KinghtFallUIGame.js'), 'utf8');
  const callback = functionAt(source, 'this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.IconMap');
  let aligned = false, activated = false;
  const t = { ndCtrGame: { getComponent: () => ({ updateAlignment() { aligned = true; } }) },
    ctrGame: { initMap() {}, ndUI: {}, ndPath: {}, gameData: { upMap() {}, initCom() {} }, onLateUpdate() {}, loadGame: () => false },
    ctrEffect: { initData() {} }, sendEvent() {}, initBtnView() {}, ctrUI: { ndGuide: { setParent() {} } } };
  const cc = { Widget: function () {}, instantiate() { assert(aligned, 'Map instantiated before parent/ancestor layout'); return { setParent() { activated = true; assert(aligned); } }; } };
  vm.runInNewContext('(' + callback + ')', { t, cc, $z1Appcfg: { BaseEventName: {} } })({});
  assert(activated);
});

const engineBodyFile = path.join(engineDir, 'cocos2d/core/physics/CCRigidBody.js');
if (fs.existsSync(engineBodyFile)) {
  test('Installed Cocos physics reproduces the 166.667px drift; ancestor synchronization preserves all local map coordinates', () => {
    const e = environment(), physics = e.physics, scene = new Node('scene'), canvas = new Node('canvas', scene, 375, 667), map = new Node('map', canvas);
    const gate = e.unit(-453.39, 703.474, map), terrain = e.unit(-172.986, 1495.705, map), wallParent = new Node('wall parent', map, -400, 700), wall = e.unit(7.055, -42.225, wallParent);
    const bodySource = fs.readFileSync(engineBodyFile, 'utf8'), managerSource = fs.readFileSync(path.join(engineDir, 'cocos2d/core/physics/CCPhysicsManager.js'), 'utf8');
    const globals = { cc: e.cc, VEC2_ZERO: Vec2.ZERO, PTM_RATIO: 32, BodyType: { Animated: 3 }, PHYSICS_ANGLE_TO_ANGLE: 180 / Math.PI,
      vec2_tmp: new Vec2(), convertToNodeRotation: (_, value) => value, PhysicsManager: { VELOCITY_ITERATIONS: 10, POSITION_ITERATIONS: 10 } };
    const syncPosition = vm.runInNewContext('(' + functionAt(bodySource, '    syncPosition: function') + ')', globals);
    physics._syncNode = vm.runInNewContext('(' + functionAt(managerSource, '    _syncNode: function') + ')', globals);
    physics.update = vm.runInNewContext('(' + functionAt(managerSource, '    update: function') + ')', globals);
    Object.assign(physics, { enabled: true, enabledAccumulator: false, _delayEvents: [], _world: { Step() {} }, _bodies: [gate.rigidBody, terrain.rigidBody, wall.rigidBody] });
    for (const body of physics._bodies) {
      const p = body.node.convertToWorldSpaceAR(Vec2.ZERO);
      body.type = 0; body.syncPosition = syncPosition;
      body._b2Body = { pos: new Vec2(p.x / 32, p.y / 32), GetPosition() { return this.pos; }, GetAngle: () => 0,
        SetTransformVec(point) { this.pos = point.clone ? point.clone() : new Vec2(point.x, point.y); } };
    }
    canvas.y += 166.667; physics.update(1 / 60);
    near(gate.node.y, 703.474 - 166.667); near(terrain.node.y, 1495.705 - 166.667); near(wall.node.y, -42.225 - 166.667);
    canvas.y = 667; gate.node.setPosition(-453.39, 703.474); terrain.node.setPosition(-172.986, 1495.705); wall.node.setPosition(7.055, -42.225);
    physics._bodies.forEach(body => body.syncPosition());
    const ctrl = new (e.load('KinghtFallGameCtrl').default)(); ctrl._bindMapPhysics(map);
    assert.equal(physics.listeners.length, 1);
    canvas.y += 166.667; physics.update(1 / 60);
    near(gate.node.y, 703.474); near(terrain.node.y, 1495.705); near(wall.node.y, -42.225);
    canvas.y -= 50; physics.update(1 / 60); near(gate.node.y, 703.474); near(wall.node.y, -42.225);
    // Unchanged ancestors must not overwrite normal body simulation each tick.
    gate.rigidBody._b2Body.pos.x += 5 / 32; physics.update(1 / 60); near(gate.node.x, -453.39 + 5);
    let applied = 0; const collider = terrain.node.addComponent(PhysicsBoxCollider); collider.apply = () => { applied++; };
    canvas.scaleX = canvas.scaleY = 1.1; physics.update(1 / 60); near(terrain.node.y, 1495.705); assert.equal(applied, 1);
    ctrl._bindMapPhysics(map); assert.equal(physics.listeners.length, 1);
    ctrl.onDestroy(); assert.equal(physics.listeners.length, 0); assert.equal(ctrl.baseDestroyed, true);
  });
} else console.log('SKIP installed-engine physics regression: set COCOS_ENGINE_DIR to a Creator 2.4.13 engine checkout.');

test('Permanent combat buffs survive updates; timed buffs expire without removing adjacent permanent buffs', () => {
  for (const name of ['KinghtFallSoldierBase', 'KinghtFallEnemyBase']) {
    const e = environment(), actor = e.actor(name);
    actor.state = -1; actor.attack = 100;
    const kind = e.load('KinghtFallInterface').KinghtFallEnemyBuffType.DamageAdd;
    actor.addBuff(kind, { addNum: 0.1, time: -1 });
    actor.addBuff(kind, { addNum: 0.2, time: 1 });
    actor.addBuff(kind, { addNum: 0.3, time: -1 });
    actor.onUpdate(0.5);
    assert.equal(actor.getBuffList(kind).length, 3, name + ' retains permanent and unexpired buffs');
    actor.onUpdate(0.5);
    assert.equal(actor.getBuffList(kind).length, 2, name + ' expires only the timed buff');
    actor.onUpdate(60);
    assert.equal(actor.getBuffList(kind).length, 2);
    if (name === 'KinghtFallSoldierBase') near(actor.getAttack(), 140);
    actor.delBuff(kind);
    assert.equal(actor.getBuffList(kind).length, 0, 'permanent buffs can still be removed explicitly');
  }
});

console.log(`Navigation runtime integration: ${passed} tests passed.`);
