'use strict';
// No scene, renderer, game, SDK, or audio is started. The optional integration
// executes Creator's actual collider lifecycle against an in-memory Box2D world.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
const configured = process.env.COCOS_ENGINE_ROOT || process.env.COCOS_ENGINE_DIR;
const engine = configured || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const colliderFile = path.join(engine, 'cocos2d/core/physics/collider/CCPhysicsCollider.js');
const box2dFile = path.join(engine, 'external/box2d/box2d.js');
const enginePresent = fs.existsSync(colliderFile) && fs.existsSync(box2dFile);
if (configured && !enginePresent) throw Error('Configured Cocos engine must contain CCPhysicsCollider.js and Box2D: ' + engine);

function fixture(actualEngine = false, actualPolygon = false) {
  const tweens = [], delayed = [], state = { broadStops: 0, applies: 0, near: false };
  const physics = { pushDelayEvent(target, name, args) { delayed.push(() => target[name](...args)); }, _registerContactFixture() {}, _unregisterContactFixture() {} };
  function flush() { while (delayed.length) delayed.shift()(); }
  class Vec2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } clone() { return new Vec2(this.x, this.y); } equals(p) { return this.x === p.x && this.y === p.y; } }
  Vec2.ZERO = new Vec2();
  function Collider() { this._enabled = false; }
  Object.defineProperties(Collider.prototype, {
    enabled: { get() { return this._enabled; }, set(value) { if (value === this._enabled) return; this._enabled = value; if (this.node) value ? this.onEnable() : this.onDisable(); } },
    enabledInHierarchy: { get() { return this.enabled && this.node.activeInHierarchy; } }
  });
  Collider.prototype.getComponent = function () { return this.node.bodyComponent; };
  const cc = { Vec2, v2: (x, y) => new Vec2(x, y), Collider, RigidBody: function () {}, Node: function () {}, Label: function () {}, Sprite: function () {},
    rect: () => ({}), game: { collisionMatrix: [[true]] }, director: { getPhysicsManager: () => physics },
    isValid: value => !!value && !value.destroyed, _decorator: { ccclass: value => value, property: () => () => {} },
    Tween: { stopAllByTarget() { state.broadStops++; } },
    tween(target) { const tween = { target, stopped: false, complete: false,
      to(duration, props, options) { this.duration = duration; this.options = options; return this; },
      start() { tweens.push(this); return this; }, stop() { this.stopped = true; } }; return tween; }
  };
  let Physics, box2d, world;
  if (actualEngine) {
    box2d = require(box2dFile);
    world = new box2d.b2World(new box2d.b2Vec2(0, 0));
    cc.Class = definition => {
      function Type() {
        definition.extends.call(this);
        for (const [key, value] of Object.entries(definition.properties || {})) {
          if (!value || typeof value !== 'object') this[key] = value;
          else if ('default' in value) this[key] = value.default;
        }
        definition.ctor.call(this);
      }
      Type.prototype = Object.create(definition.extends.prototype);
      for (const [key, value] of Object.entries(definition)) if (typeof value === 'function' && key !== 'ctor' && key !== 'extends') Type.prototype[key] = value;
      for (const [key, value] of Object.entries(definition.properties || {})) if (value && (value.get || value.set)) Object.defineProperty(Type.prototype, key, { get: value.get, set: value.set });
      return Type;
    };
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(colliderFile, 'utf8')+'\nmodule.exports._realmArray=Array;', { module, cc, CC_DEV: false,
      b2: { AABB: box2d.b2AABB, FixtureDef: box2d.b2FixtureDef },
      require(name) { if (name === '../CCPhysicsTypes') return { PTM_RATIO: 32 }; if (name === '../utils') return { getWorldScale: () => ({ x: 1, y: 1 }) }; throw Error(name); }
    }, { filename: colliderFile });
    Physics = module.exports;
  } else {
    Physics = function () { Collider.call(this); this._fixtures = []; this._inited = false; };
    Physics.prototype = Object.create(Collider.prototype);
    Object.assign(Physics.prototype, {
      onEnable() { physics.pushDelayEvent(this, '__init', []); }, onDisable() { physics.pushDelayEvent(this, '__destroy', []); },
      __init() { if (!this._inited) { this._fixtures.push({}); this._inited = true; } },
      __destroy() { this._fixtures.length = 0; this._inited = false; },
      apply() { physics.pushDelayEvent(this, '__destroy', []); physics.pushDelayEvent(this, '__init', []); }
    });
  }
  cc.PhysicsPolygonCollider = Physics;
  let polygonBuilder;
  if (actualPolygon) {
    const separator={exports:{}},polygon={exports:{}};
    vm.runInNewContext(fs.readFileSync(path.join(engine,'cocos2d/core/physics/CCPolygonSeparator.js'),'utf8'),{module:separator,cc});
    const api={...cc,PhysicsCollider:Physics,Collider:{Polygon:{}},Class:definition=>definition._createShape};
    vm.runInNewContext(fs.readFileSync(path.join(engine,'cocos2d/core/physics/collider/CCPhysicsPolygonCollider.js'),'utf8'),{
      module:polygon,cc:api,CC_EDITOR:false,b2:{PolygonShape:box2d.b2PolygonShape,Vec2:box2d.b2Vec2,maxPolygonVertices:8},
      require:name=>name==='../CCPhysicsTypes'?{PTM_RATIO:32}:separator.exports
    });
    polygonBuilder=polygon.exports;
  }
  function node(name) {
    const value = { name, active: true, groupIndex: 0, colliders: [], get activeInHierarchy() { return this.active; }, getComponents() { return this.colliders; } };
    if (actualEngine) {
      const body = world.CreateBody(new box2d.b2BodyDef());
      value.bodyComponent = { node: value, _getBody: () => body, enabledContactListener: false };
    }
    return value;
  }
  function collider(parent, tag) {
    const value = new Physics(); Object.assign(value, { node: parent, tag, uuid: parent.name + tag,
      points: [new Vec2(-20, -10), new Vec2(20, -10), new Vec2(20, 10), new Vec2(-20, 10)] });
    if (actualPolygon) { value.offset=Vec2.ZERO;value._createShape=function(scale){const shapes=polygonBuilder.call(this,scale);Object.setPrototypeOf(shapes,Physics._realmArray.prototype);return shapes;}; }
    else if (actualEngine) value._createShape = function () {
      const shape = new box2d.b2PolygonShape();
      shape.Set(this.points.map(p => new box2d.b2Vec2(p.x / 32, p.y / 32)), this.points.length); return shape;
    };
    const apply = value.apply; value.apply = function () { state.applies++; apply.call(this); };
    parent.colliders.push(value); return value;
  }
  function animation(name) { const n = node(name); return { node: n, animation: 'idle', setSkin() {}, setAnimation() {}, addAnimation() {}, getComponents: () => n.colliders }; }
  function Parent() { this.enabled = true; }
  Parent.prototype.onDestroy = function () { this.parentDestroyed = true; };
  Parent.prototype.delAllBuff = Parent.prototype.sendEvent = function () {};
  Parent.prototype.T = value => value;
  const modules = { BuildingAppearance: { apply() {}, hide() {}, onDead() {}, dispose() {} }, KinghtFallInterface: { KinghtFallInterface: Parent },
    KinghtFallBuildInfo: { KinghtFallBuildInfo: function (type, cfg) { this.cfg = cfg; this.canUpgrade = false; } },
    KinghtFallConfig: { KinghtFallEventName: {}, KinghtFallAudioId: {}, KinghtFallUIID: {} },
    KinghtFallEnum: { KinghtFallEnumBuffCfg: {} }, KinghtFallTextConfig: { KinghtFallTextConfig: {} },
    Config: { UIID: {} }, Utils: { Utils: { StringFormat: value => value } }, UIMgr: { UIMgr: { getInstance: () => ({ openUI() {} }) } },
    AudioMgr: { AudioMgr: { getInstance: () => ({ playEffectFree() {} }) } },
    KinghtFallUIGame: { default: { instance: { ctrGame: { gameStatus: 0, gameData: { getGameBuff: () => null } } } } },
    KinghtFallModle: { KinghtFallGameStage: { Prepare: 0 } } };
  function load(name) {
    const context = { exports: {}, cc, sp: { Skeleton: function () {} }, console, require: name => modules[name] || {},
      __extends(Child, Base) { Child.prototype = Object.create(Base.prototype); Child.prototype.constructor = Child; },
      __decorate: (_d, target, key) => key === undefined ? target : undefined };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), context, { filename: name + '.js' });
    return modules[name] = context.exports;
  }
  load('KinghtFallBuildBase'); const Wall = load('KinghtFallBuildWall').default;
  const wall = new Wall(); wall.node = node('leaf'); wall.ndAniMain = animation('main'); wall.ndAniDown = animation('floor');
  wall.ndAniOther = [animation('wing')]; wall.ndAniEffect = animation('effect'); wall.ndLockList = [];
  wall.ndCoin = { getChildByName: () => ({ getComponent: () => ({ string: '' }) }) };
  wall.buildCfg = { enumValue: 1, levelList: [1, 2, 3].map(level => ({ level, Skin: 'skin' + level })) };
  wall.getSell = () => 0; wall.hasFriendlyAtGate = () => state.near;
  const leaves = [1, 2, 3].map(tag => collider(wall.node, tag));
  const wings = [1, 2, 3].map(tag => collider(wall.ndAniOther[0].node, tag));
  wall.onLoad();
  function step(progress) {
    for (const tween of tweens.slice()) if (!tween.stopped && !tween.complete) {
      if (tween.options && tween.options.onUpdate) tween.options.onUpdate(tween.target, progress);
      if (progress >= 1) tween.complete = true;
    }
    flush();
  }
  return { wall, leaves, wings, tweens, state, cc, flush, step, fixtures: () => leaves.concat(wings).map(c => c._fixtures.length) };
}

function rapidLevels(h) {
  h.wall.setLevel(1); h.step(.5);
  const stale = h.tweens.slice(), unrelated = h.cc.tween(h.leaves[0]).to(1, {}, {}).start();
  h.wall.setLevel(3); h.flush(); h.step(1);
  for (const tween of stale) tween.options.onUpdate(tween.target, 1);
  h.flush();
  assert.deepEqual(h.fixtures(), [0, 0, 1, 0, 0, 1]);
  assert(stale.every(tween => tween.stopped)); assert.equal(unrelated.stopped, false); assert.equal(h.state.broadStops, 0);
  assert(h.tweens.filter(t => t.options.onUpdate).every(t => t.duration === .2));
  assert.deepEqual(Array.from(h.leaves[2].points, p => [p.x, p.y]), [[-20, -10], [20, -10], [20, 10], [-20, 10]]);
}

test('appended building variants reuse the authored collider footprint and retire late growth callbacks', () => {
  const h = fixture();
  h.wall.buildCfg.levelList.push({ level: 1, Skin: 'skin1', ColliderIndex: 1 }, { level: 2, Skin: 'skin3', ColliderIndex: 3 });
  h.wall.setLevel(4); h.step(.5);
  assert.equal(h.wall.getColliderIndex(), 1);
  const stale = h.tweens.slice(); h.wall.setLevel(5); h.step(1);
  stale.forEach(t => t.options.onUpdate(t.target, 1)); h.flush();
  assert.equal(h.wall.getColliderIndex(), 3);
  assert.deepEqual(h.fixtures(), [0, 0, 1, 0, 0, 1]);
});

test('rapid building1→3 restore retires only owned colliders and preserves complete authored geometry', () => rapidLevels(fixture()));

test('hide, death, disable and destroy retire old collider callbacks including forced late completion', () => {
  for (const action of ['hide', 'onDead', 'onDisable', 'onDestroy']) {
    const h = fixture(); h.wall.setLevel(1); h.step(.5); const stale = h.tweens.slice();
    if (action === 'onDisable' || action === 'onDestroy') { h.wall.enabled = false; h.leaves.concat(h.wings).forEach(c => { c.enabled = false; }); }
    h.wall[action](); h.flush(); const applies = h.state.applies;
    stale.forEach(tween => tween.options.onUpdate(tween.target, 1)); h.flush();
    assert.deepEqual(h.fixtures(), [0, 0, 0, 0, 0, 0]); assert.equal(h.state.applies, applies);
    assert(stale.every(tween => tween.stopped));
    if (action === 'onDestroy') assert.equal(h.wall.parentDestroyed, true);
  }
});

test('opening during gate-close tween removes leaf fixtures while side walls remain enabled', () => {
  const h = fixture(); h.wall.setLevel(3); h.step(1); h.state.near = true; h.wall.doTime(); h.flush();
  assert.deepEqual(h.fixtures(), [0, 0, 0, 0, 0, 1]);
  h.state.near = false; h.wall.doTime(); h.step(.5);
  const closing = h.tweens.at(-1); assert.equal(closing.duration, .1);
  h.state.near = true; h.wall.doTime(); h.flush(); closing.options.onUpdate(closing.target, 1); h.flush();
  assert.equal(h.wall.isOpen, true); assert.equal(closing.stopped, true); assert.deepEqual(h.fixtures(), [0, 0, 0, 0, 0, 1]);
});

test('component disable during growth retains authored footprint for re-enable without setLevel', () => {
  const h = fixture(); h.wall.setLevel(1); h.step(.5);
  assert.equal(h.leaves[0].points[0].x, -10);
  h.wall.enabled = false; h.wall.onDisable(); h.flush(); h.wall.enabled = true;
  assert.equal(h.leaves[0].points[0].x, -20); assert.deepEqual(h.fixtures(), [1, 0, 0, 1, 0, 0]);
  assert.equal(h.wall._colliderTweens.size, 0);
});

test('Creator collider/Box2D reproduces disabled apply and validates rapid restore/open/hide cleanup', { skip: !enginePresent }, () => {
  const control = fixture(true), leaf = control.leaves[0];
  leaf.enabled = true; control.flush(); leaf.enabled = false; control.flush();
  assert.equal(leaf._fixtures.length, 0);
  leaf.apply(); control.flush();
  assert.equal(leaf.enabled, false); assert.equal(leaf._fixtures.length, 1, 'actual Creator negative control recreates disabled fixture');
  leaf.onDisable(); control.flush();
  const h = fixture(true); rapidLevels(h);
  h.state.near = true; h.wall.doTime(); h.flush(); assert.deepEqual(h.fixtures(), [0, 0, 0, 0, 0, 1]);
  h.wall.setLevel(1); h.step(.5); const stale = h.tweens.slice(); h.wall.hide(); h.flush();
  stale.filter(t => t.options && t.options.onUpdate).forEach(t => t.options.onUpdate(t.target, 1)); h.flush();
  assert.deepEqual(h.fixtures(), [0, 0, 0, 0, 0, 0]);
  h.wall.setLevel(1); h.step(.5); const disabled = h.tweens.slice();
  h.wall.enabled = false; h.leaves.concat(h.wings).forEach(c => { c.enabled = false; });
  h.wall.onDisable(); h.flush();
  disabled.filter(t => t.options && t.options.onUpdate).forEach(t => t.options.onUpdate(t.target, 1)); h.flush();
  assert.deepEqual(h.fixtures(), [0, 0, 0, 0, 0, 0]);
  assert.equal(h.leaves[0].points[0].x, -20, 'interrupted geometry remains authored for the next enable');
});

test('actual Creator triangulation reproduces zero-frame corruption and survives mill/house-style whole-map refreshes', { skip: !enginePresent }, () => {
  const old=fixture(true,true),leaf=old.leaves[0];leaf.points=[0,0,0,0].map(()=>new old.cc.Vec2());
  assert.throws(()=>{leaf.enabled=true;old.flush();for(let i=0;i<8;i++){leaf.apply();old.flush();}},/undefined|reading.*x/,'zero-sized vertices must reproduce the captured Area/Right error');
  const h=fixture(true,true);h.wall.setLevel(1);h.step(0);
  for(let refresh=0;refresh<12;refresh++){
    // A mill build or house upgrade refreshes every wall, often before its
    // growth tween has advanced from its first frame.
    h.wall.setLevel(refresh<6?1:3);h.step(0);h.wall.ndAniOther[0].node.active=true;
    for(const collider of h.leaves.concat(h.wings).filter(c=>c.enabled)){
      assert(collider.points.length>=3);const points=collider.points,area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0);assert(Math.abs(area)>1);
      collider.apply();h.flush();
    }
  }
  h.step(1);assert.deepEqual(h.fixtures(),[0,0,1,0,0,1]);
  for(const collider of [h.leaves[2],h.wings[2]])assert.deepEqual(Array.from(collider.points,p=>[p.x,p.y]),[[-20,-10],[20,-10],[20,10],[-20,10]]);
});
