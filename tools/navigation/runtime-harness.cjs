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
    Object.assign(this, { name, x, y, scaleX: 1, scaleY: 1, angle: 0, active: true, components: [], children: [], parent: null, width: 400, height: 400, anchorX: .5, anchorY: .5 });
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
class PhysicsPolygonCollider extends Collider { apply() {} }
class PolygonCollider extends Collider {}
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
    gameData: { obstacles: [], buildings: [], soldiers: [], enemies: [], talentAdd: {}, treasureAdd: {}, addTime: {}, getHpAdd: () => 1, getAttAdd: () => 1, getGameBuff: () => null,
      getBulidList() { return this.buildings; }, getSoldierList() { return this.soldiers; }, getEnemyList() { return this.enemies; } }
  };
  game.ctrPlay = { node: new Node('hero', game.ndMain, 150, 150), ndRange: new Node(), ndAgg: new Node(), isDead: () => false };
  const ui = { default: { instance: { ctrGame: game, speed: 1, ctrEffect: { onMoveTrack() {} } } } };
  const cc = { Node, Vec2, PolygonCollider, PhysicsCollider: Collider, PhysicsPolygonCollider, PhysicsBoxCollider, PhysicsCircleCollider, CircleCollider, RigidBody,
    director: { getPhysicsManager: () => physics }, game: { config: { frameRate: 60 } },
    v2: (x = 0, y = 0) => typeof x === 'object' ? new Vec2(x.x, x.y) : new Vec2(x, y), size: (width, height) => ({ width, height }),
    isValid: value => !!value && !value.destroyed,
    winSize: { width: 750, height: 1334 }, _decorator: { ccclass: target => target, property: () => () => undefined } };
  const cfg = { ID: 90001, AttackRange: 20, SearchRange: 40, Health: 100, AttackDamage: 5, AttackInterval: 1, BuildingCross: 1, MoveSpeed: 60 };
  const enumModule = new Proxy({}, { get: () => enums() });
  const dataManager = { data: {}, getSoldierCfgById: () => cfg };
  const stubs = {
    NavigationGrid: { NavigationGrid }, BaseCtrl: { default: BaseCtrl }, KinghtFallUIGame: ui,
    KinghtFallConfig: { KinghtFallParameter: { FollowRange: 40, FollowMode: 1 }, KinghtFallBundelName: {}, KinghtFallPrefabName: {}, KinghtFallPoolName: {} },
    KinghtFallDataMgr: { KinghtFallDataMgr: { getInstance: () => dataManager } },
    KinghtFallEnum: enumModule,
    KinghtFallModle: { KinghtFallSoldierAniEnum: { Idle: 'idle', Move: 'move' }, KinghtFallGameArmy: {}, KinghtFallGameStage: { Prepare: 0, Fight: 1 } },
    KinghtFallGameCtrlData: { default: function () {}, KinghtFallTimeType: {}, KinghtFallCommerceKeyType: {} }
  };
  const modules = {};
  function load(name) {
    if (stubs[name]) return stubs[name];
    if (modules[name]) return modules[name].exports;
    if (!/^(GameToolsOverrides|KinghtFallNavigation|KinghtFallInterface|KinghtFallGameCtrl|KinghtFallBuild(Base|Wall|Barracks)|KinghtFallEnemy(Base|Melee|Long|Auxiliary|Item\d+)|KinghtFallSoldier(Base|Item\d+))$/.test(name)) return { default: function () {} };
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
    Object.assign(value, body, { state: 1, time: { Attack: -1, Spell: 0, SpellMax: Infinity, Movetime: 0 }, cfg, attackRange: cfg.AttackRange, hp: 100, hpMax: 100, hpctrl: { setHp() {}, setType() {} },
      getAttSpeed: () => 1, isDead: () => false, getFind: () => null, isFind: () => false,
      spAni: { node: new Node(), setAnimation() {} }, setLeft(value) { this.facingLeft = value; }, onFindList() {} });
    value.spAni2 = value.spAni3 = value.spAni;
    if (value.oldPos) value.node.getPosition(value.oldPos);
    return value;
  }
  return { game, nav, unit, box, actor, load, cc, cfg, physics, stubs, setTime: value => { now = value; } };
}

function map01GateEnvironment(level, hero) {
  const e = environment(), map = require('./fixtures/map01-authored.json');
  installIntersection(e.cc);
  const serialized = JSON.parse(fs.readFileSync(path.join(sourceDir, '../KinghtFallIconMap/Map01.prefab'), 'utf8'));
  function matrix(index) {
    const node = serialized[index], v = node._trs?.array || [0, 0, 0, 0, 0, 0, 1, 1, 1, 1];
    const c = 1 - 2 * v[5] * v[5], s = 2 * v[6] * v[5];
    let m = [c * v[7], s * v[7], -s * v[8], c * v[8], v[0], v[1]];
    if (node._parent) {
      const p = matrix(node._parent.__id__);
      m = [p[0] * m[0] + p[2] * m[1], p[1] * m[0] + p[3] * m[1], p[0] * m[2] + p[2] * m[3], p[1] * m[2] + p[3] * m[3], p[0] * m[4] + p[2] * m[5] + p[4], p[1] * m[4] + p[3] * m[5] + p[5]];
    }
    return m;
  }
  function position(index, point = { x: 0, y: 0 }) {
    const m = matrix(index);
    return { x: m[0] * point.x + m[2] * point.y + m[4], y: m[1] * point.x + m[3] * point.y + m[5] };
  }
  const components = index => (serialized[index]._components || []).map(ref => serialized[ref.__id__]);
  e.game.mapSize = { width: map.bounds.maxX - map.bounds.minX, height: map.bounds.maxY - map.bounds.minY };
  e.game.ctrPlay.isDead = () => !hero;
  if (hero) e.game.ctrPlay.node.setPosition(hero);
  for (const obstacle of map.obstacles) {
    const node = new Node(obstacle.name, e.game.ndMain);
    for (const polygon of obstacle.polygons) node.addComponent(PhysicsPolygonCollider).points = polygon;
    e.game.gameData.obstacles.push({ node });
  }
  // Match the screenshot's left gate, its neighboring arrow tower, and castle.
  // Read each level's actual main/sibling collider, avoiding stale geometry copies.
  for (const id of [1, 4, 17]) {
    const building = map.buildings.find(row => row.name.startsWith(id + '-') && !/[LR]$/.test(row.name));
    const owner = components(building.index).find(component => component.ID === id);
    const ids = [building.index].concat((owner.ndAniOther || []).map(ref => serialized[ref.__id__].node.__id__));
    const parts = [];
    for (const index of ids) {
      const origin = position(index), node = new Node(serialized[index]._name, e.game.ndMain, origin.x, origin.y);
      for (const collider of components(index)) {
        if (collider.__type__ !== 'cc.PhysicsPolygonCollider' || collider.tag !== (id === 17 ? level : 1)) continue;
        const points = collider.points.map(point => position(index, point));
        const shape = node.addComponent(PhysicsPolygonCollider);
        shape.points = points.map(point => ({ x: point.x - origin.x, y: point.y - origin.y }));
        parts.push({ tagNode: node, points, collider: shape });
      }
    }
    e.game.gameData.buildings.push({ node: parts[0].tagNode, ndAniOther: parts.slice(1).map(part => ({ node: part.tagNode })),
      getIsWork: () => true, getWposPhyCol2: () => parts, getWposPhyCol: () => parts.map(part => part.points),
      getNavigationGateShapes: () => id === 17 ? [{ collider: parts[0].collider, points: parts[0].points }] : [] });
  }
  return e;
}


module.exports = { environment, Node, Vec2, Collider, PolygonCollider, PhysicsPolygonCollider, PhysicsBoxCollider, PhysicsCircleCollider, CircleCollider, RigidBody, installIntersection, map01GateEnvironment, distance, near };
