'use strict';

// Exercise Creator's real fixture ownership and contact pooling together. A
// collider-only stub cannot detect a contact whose collider.body was retired.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const configured = process.env.COCOS_ENGINE_ROOT || process.env.COCOS_ENGINE_DIR;
const engine = configured || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const files = {
  box2d: 'external/box2d/box2d.js',
  collider: 'cocos2d/core/physics/collider/CCPhysicsCollider.js',
  contact: 'cocos2d/core/physics/CCPhysicsContact.js',
  listener: 'cocos2d/core/physics/platform/CCPhysicsContactListner.js'
};
const present = Object.values(files).every(file => fs.existsSync(path.join(engine, file)));
if (configured && !present) throw Error('Configured Creator engine lacks contact/fixture sources: ' + engine);

function portableGuard(native, emit) {
  function Contact() {}
  Contact.prototype.emit = emit;
  const context = { exports: {}, cc: { sys: { isNative: native }, PhysicsContact: Contact } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/_script/PhysicsContactCompat.js'), 'utf8'), context);
  return { Contact, cc: context.cc, install: context.exports.install };
}

test('portable compatibility contract selects native only and installs once', () => {
  const original = function () {};
  const f = portableGuard(false, original);
  f.install(); assert.equal(f.Contact.prototype.emit, original, 'Browser dispatcher must remain untouched');
  f.cc.sys.isNative = true; f.install();
  const guarded = f.Contact.prototype.emit;
  assert.notEqual(guarded, original); assert.equal(guarded._hkdRetiredFixtureGuard, true);
  assert.equal(guarded._retiredFixtureSkips, 0);
  f.install(); assert.equal(f.Contact.prototype.emit, guarded, 'repeated stage initialization cannot stack wrappers');
  f.cc.PhysicsContact = null; assert.doesNotThrow(() => f.install(), 'an unavailable engine contact API is optional');
});

test('portable live-contact delegation preserves receiver, arguments, return value and thrown errors', () => {
  const payload = {}, extra = Symbol('extra argument'), result = {}, failure = Error('unrelated gameplay failure');
  const calls = [], contact = { colliderA: { body: {} }, colliderB: { body: {} }, disabled: true };
  const f = portableGuard(true, function () {
    calls.push({ receiver: this, args: Array.from(arguments) });
    if (arguments[0] === 'throw') throw failure;
    return result;
  });
  f.install();
  assert.equal(f.Contact.prototype.emit.call(contact, 'end-contact', payload, extra), result);
  assert.equal(calls[0].receiver, contact);
  assert.deepEqual(calls[0].args, ['end-contact', payload, extra]);
  assert.throws(() => f.Contact.prototype.emit.call(contact, 'throw', payload), error => error === failure);
  assert.equal(calls.length, 2); assert.equal(f.Contact.prototype.emit._retiredFixtureSkips, 0);
});

test('portable retired-contact containment covers either owner and leaves EndContact pooling available', () => {
  let delegated = 0;
  const f = portableGuard(true, () => { delegated++; }); f.install();
  for (const side of ['colliderA', 'colliderB']) for (const missing of ['collider', 'body']) {
    const toggles = [], contact = { colliderA: { body: {} }, colliderB: { body: {} }, _b2contact: {},
      setEnabled(value) { assert.equal(this, contact); toggles.push(value); } };
    if (missing === 'collider') contact[side] = null; else contact[side].body = null;
    assert.doesNotThrow(() => f.Contact.prototype.emit.call(contact, 'begin-contact'));
    assert.deepEqual(toggles, [false], 'retired overlap must not remain a solid obstruction');
    assert.doesNotThrow(() => f.Contact.prototype.emit.call(contact, 'end-contact'));
    assert.deepEqual(toggles, [false], 'manager must be able to finish EndContact without native writes');
  }
  const noNativeContact = { colliderA: null, colliderB: { body: {} }, _b2contact: null,
    setEnabled() { throw Error('invalid native contact accessed'); } };
  assert.doesNotThrow(() => f.Contact.prototype.emit.call(noNativeContact, 'pre-solve'));
  assert.equal(delegated, 0); assert.equal(f.Contact.prototype.emit._retiredFixtureSkips, 9);
});

function fixture() {
  const box = require(path.join(engine, files.box2d));
  const world = new box.b2World(new box.b2Vec2(0, 0));
  const delayed = [], nodes = [], events = [];
  let stepping = false, preSolveAction = null;
  class Vec2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } clone() { return new Vec2(this.x, this.y); } }
  Vec2.ZERO = new Vec2();
  function Collider() { this._enabled = false; }
  Object.defineProperties(Collider.prototype, {
    enabled: { get() { return this._enabled; }, set(value) { if (value === this._enabled) return; this._enabled = value; value ? this.onEnable() : this.onDisable(); } },
    enabledInHierarchy: { get() { return this.enabled && this.node.activeInHierarchy; } }
  });
  Collider.prototype.getComponent = function () { return this.node.bodyComponent; };
  const cc = {
    Collider, RigidBody: function () {}, Vec2, v2: (x, y) => new Vec2(x, y), rect: () => ({}),
    game: { collisionMatrix: [[true]] }, sys: { isNative: true },
    js: { array: { remove(array, value) { const at = array.indexOf(value); if (at >= 0) array.splice(at, 1); } } },
    director: { getPhysicsManager: () => manager },
    Class(definition) {
      function Type() {
        definition.extends.call(this);
        for (const [key, value] of Object.entries(definition.properties || {})) {
          if (value && (value.get || value.set)) continue;
          this[key] = value && typeof value === 'object' && 'default' in value ? value.default : value;
        }
        definition.ctor.call(this);
      }
      Type.prototype = Object.create(definition.extends.prototype);
      for (const [key, value] of Object.entries(definition)) if (typeof value === 'function' && !['extends', 'ctor'].includes(key)) Type.prototype[key] = value;
      for (const [key, value] of Object.entries(definition.properties || {})) if (value && (value.get || value.set)) Object.defineProperty(Type.prototype, key, { get: value.get, set: value.set });
      return Type;
    }
  };
  const types = { PTM_RATIO: 32, ContactType: { BEGIN_CONTACT: 'begin-contact', END_CONTACT: 'end-contact', PRE_SOLVE: 'pre-solve', POST_SOLVE: 'post-solve' } };
  function load(file) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(engine, file), 'utf8') + '\nmodule.exports._realmArray=Array;', {
      module, cc, CC_DEV: false,
      b2: { AABB: box.b2AABB, FixtureDef: box.b2FixtureDef, WorldManifold: box.b2WorldManifold, Manifold: box.b2Manifold },
      require(name) { if (/CCPhysicsTypes$/.test(name)) return types; if (/utils$/.test(name)) return { getWorldScale: node => ({ x: node.scale, y: node.scale }) }; throw Error(name); }
    }, { filename: path.join(engine, file) });
    return module.exports;
  }
  const Physics = load(files.collider), Contact = load(files.contact), Listener = load(files.listener);
  const listener = new Listener();
  const manager = {
    _contactListener: listener,
    pushDelayEvent(target, name, args) { if (stepping) delayed.push(() => target[name](...args)); else target[name](...args); },
    _registerContactFixture(fix) { listener.registerContactFixture(fix); },
    _unregisterContactFixture(fix) { listener.unregisterContactFixture(fix); }
  };
  listener.setBeginContact(contact => Contact.get(contact).emit(types.ContactType.BEGIN_CONTACT));
  listener.setEndContact(contact => { if (contact._contact) { contact._contact.emit(types.ContactType.END_CONTACT); Contact.put(contact); } });
  listener.setPreSolve(contact => { if (contact._contact) contact._contact.emit(types.ContactType.PRE_SOLVE); });
  listener.setPostSolve((contact, impulse) => { const c = contact._contact; if (c) { c._impulse = impulse; c.emit(types.ContactType.POST_SOLVE); c._impulse = null; } });
  world.SetContactListener(listener);

  function node(name, dynamic, x) {
    const def = new box.b2BodyDef(); def.type = dynamic ? box.b2BodyType.b2_dynamicBody : box.b2BodyType.b2_staticBody; def.position.Set(x, 0);
    const body = world.CreateBody(def);
    const n = { name, activeInHierarchy: true, groupIndex: 0, scale: 1, colliders: [], _components: [] };
    n.bodyComponent = { node: n, enabledContactListener: dynamic, _getBody: () => body };
    n._components.push({
      onBeginContact(contact, self, other) { events.push(['begin', self.node.name, other.node.name]); },
      onEndContact(contact, self, other) { events.push(['end', self.node.name, other.node.name]); },
      onPreSolve(contact, self, other) { events.push(['pre', self.node.name, other.node.name]); if (preSolveAction) preSolveAction(contact, self, other); }
    });
    nodes.push(n); return n;
  }
  function collider(n, radius = false, pieces = 1) {
    const c = new Physics(); c.node = n; c.extent = .6;
    c._createShape = function (scale) {
      const shapes = [];
      for (let i = 0; i < pieces; i++) {
        let shape;
        if (radius) shape = new box.b2CircleShape(.5 * scale.x);
        else { shape = new box.b2PolygonShape(); shape.SetAsBox(c.extent * scale.x, c.extent * scale.y, new box.b2Vec2(i * 1.2, 0)); }
        shapes.push(shape);
      }
      Object.setPrototypeOf(shapes, Physics._realmArray.prototype); return shapes;
    };
    n.colliders.push(c); return c;
  }
  function integrity() {
    const alive = new Set();
    for (let body = world.GetBodyList(); body; body = body.GetNext()) for (let fix = body.GetFixtureList(); fix; fix = fix.GetNext()) {
      alive.add(fix); assert(fix.collider, 'live Box2D fixture lost its collider');
      assert(fix.collider.body, 'live Box2D fixture references a collider with body=null');
      assert.equal(fix.collider.body._getBody(), body, 'fixture retained the wrong rigid body');
      assert(fix.collider._fixtures.includes(fix), 'fixture survived outside its owning collider list');
    }
    for (const fix of listener._contactFixtures) assert(alive.has(fix), 'listener retained a destroyed fixture');
  }
  function flush() { while (delayed.length) delayed.shift()(); }
  function step(check = true) {
    if (check) integrity(); stepping = true;
    // Match Creator: pending fixture writes flush only after a successful step.
    world.Step(1 / 60, 10, 10); stepping = false; flush(); if (check) integrity();
  }
  function touch(n, x = 0) { n.bodyComponent._getBody().SetTransformVec(new box.b2Vec2(x, 0), 0); }
  const unit = node('cavalry', true, 0), building = node('barracks', false, .75);
  const unitShape = collider(unit, true), tier1 = collider(building, false), tier2 = collider(building, false, 2);
  unitShape.enabled = true; tier1.enabled = true;
  function install(native = true) {
    cc.sys.isNative = native;
    const context = { exports: {}, cc };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/_script/PhysicsContactCompat.js'), 'utf8'), context);
    context.exports.install(); return context.exports.install;
  }
  return { world, box, cc, Contact, types, manager, listener, unit, building, unitShape, tier1, tier2, events, step, flush, touch, integrity, install, setPreSolve: action => { preSolveAction = action; } };
}

test('real Creator contacts survive repeated barracks fixture growth, tier replacement and scale', { skip: !present }, () => {
  const h = fixture();
  for (let pass = 0; pass < 20; pass++) {
    h.touch(h.unit); h.step();
    h.tier1.enabled = false; h.tier2.enabled = true;
    h.building.scale = 1.1; h.tier2.apply(); h.step();
    h.building.scale = 1; h.tier2.apply(); h.touch(h.unit); h.step();
    h.tier2.enabled = false; h.tier1.enabled = true;
  }
  assert(h.events.some(event => event[0] === 'begin'));
  assert(h.events.some(event => event[0] === 'pre'));
  assert(h.events.some(event => event[0] === 'end'));
  h.integrity(); assert.equal(h.world.IsLocked(), false);
});

test('contact-time apply and disable wait until Box2D unlocks and retain valid contact owners', { skip: !present }, () => {
  const h = fixture(); let applied = false;
  h.setPreSolve(() => { if (!applied) { applied = true; assert(h.world.IsLocked()); h.tier1.apply(); } });
  h.step(); assert(applied); h.setPreSolve(null); h.touch(h.unit); h.step();
  let disabled = false;
  h.setPreSolve(() => { if (!disabled) { disabled = true; h.tier1.enabled = false; } });
  h.step(); assert(disabled); h.setPreSolve(null); h.step();
  assert.equal(h.tier1.body, null); assert.equal(h.world.IsLocked(), false); h.integrity();
});

test('manual late registration is unique and pooled unit activation does not retain retired fixtures', { skip: !present }, () => {
  const h = fixture();
  for (let pass = 0; pass < 20; pass++) {
    // This is Navigation.enableTerrainContacts' late-fixture registration rule.
    for (const fix of h.unitShape._fixtures) if (!h.listener._contactFixtures.includes(fix)) h.manager._registerContactFixture(fix);
    h.touch(h.unit); h.step();
    h.unit.bodyComponent._getBody().SetActive(false); h.unitShape.enabled = false;
    h.unitShape.enabled = true; h.unit.bodyComponent._getBody().SetActive(true);
    h.tier1.apply(); h.touch(h.unit); h.step(); h.integrity();
    assert.equal(new Set(h.listener._contactFixtures).size, h.listener._contactFixtures.length);
  }
  assert.equal(h.world.IsLocked(), false);
});

test('reported retired-body BeginContact state previously poisoned Step and all later transforms', { skip: !present }, () => {
  const h = fixture();
  // Inject the observed ownership state, not a claimed reproduction of how it
  // arose: a live fixture's component has lost body before contact dispatch.
  h.tier1.body = null;
  assert.throws(() => h.step(false), /enabledContactListener/);
  assert.equal(h.world.IsLocked(), true, 'the failed callback prevents Box2D from releasing its step lock');
  assert.throws(() => h.touch(h.unit), Error, 'the subsequent SetTransform cascade is a result of the first failure');
});

test('native retired-contact containment lets Step finish and later transforms work', { skip: !present }, () => {
  const h = fixture(); h.install();
  const body = h.tier1.body; h.tier1.body = null;
  assert.doesNotThrow(() => h.step(false));
  assert.equal(h.world.IsLocked(), false);
  assert(h.Contact.prototype.emit._retiredFixtureSkips > 0);
  assert.doesNotThrow(() => h.touch(h.unit));
  h.tier1.body = body; h.tier1.apply(); h.step(); h.integrity();
});

test('native guard contains either missing collider or body without mutating valid contacts', { skip: !present }, () => {
  const h = fixture(), original = h.Contact.prototype.emit; h.install();
  for (const field of ['colliderA', 'colliderB']) for (const missing of ['collider', 'body']) {
    const contact = new h.Contact(), calls = [];
    contact.colliderA = h.unitShape; contact.colliderB = h.tier1;
    const restore = missing === 'body' ? contact[field].body : null;
    if (missing === 'body') contact[field].body = null; else contact[field] = null;
    contact._b2contact = { SetEnabled(value) { calls.push(value); } };
    assert.doesNotThrow(() => contact.emit(h.types.ContactType.BEGIN_CONTACT));
    assert.deepEqual(calls, [false]);
    contact.emit(h.types.ContactType.END_CONTACT); assert.deepEqual(calls, [false], 'EndContact must remain available for manager-owned pooling');
    if (missing === 'body') (field === 'colliderA' ? h.unitShape : h.tier1).body = restore;
  }
  const contact = new h.Contact(), toggles = [];
  contact.colliderA = h.unitShape; contact.colliderB = h.tier1; contact.disabledOnce = true;
  contact._b2contact = { SetEnabled(value) { toggles.push(value); } };
  const before = h.events.length;
  assert.equal(contact.emit(h.types.ContactType.BEGIN_CONTACT), original.call(Object.assign(new h.Contact(), {
    colliderA: h.unitShape, colliderB: h.tier1, _b2contact: { SetEnabled() {} }
  }), h.types.ContactType.BEGIN_CONTACT));
  assert.equal(h.events.length - before, 2, 'valid callbacks retain the exact engine path');
  assert.deepEqual(toggles, [false]); assert.equal(contact.disabledOnce, false);
  h.unit._components[0].onBeginContact = () => { throw Error('valid gameplay callback failure'); };
  assert.throws(() => contact.emit(h.types.ContactType.BEGIN_CONTACT), /valid gameplay callback failure/, 'the compatibility gate does not catch unrelated errors');
});

test('native installation is idempotent and Browser dispatch remains untouched', { skip: !present }, () => {
  const web = fixture(), original = web.Contact.prototype.emit;
  web.install(false); assert.equal(web.Contact.prototype.emit, original);
  const install = web.install(true), guarded = web.Contact.prototype.emit;
  install(); assert.equal(web.Contact.prototype.emit, guarded);
  assert.equal(guarded._hkdRetiredFixtureGuard, true);
  assert.equal(guarded._retiredFixtureSkips, 0);
});

test('retired EndContact still returns through the real manager contact pool', { skip: !present }, () => {
  const h = fixture(); h.install(); h.step();
  const engineEnd = h.listener._EndContact; let returned = 0;
  h.listener.setEndContact(contact => {
    const c = contact._contact, collider = c.colliderA, body = collider.body;
    collider.body = null;
    try { engineEnd(contact); returned++; assert.equal(contact._contact, null, 'manager returned the wrapper to Creator contact pooling'); }
    finally { collider.body = body; }
  });
  h.tier1.enabled = false;
  assert.equal(returned, 1); h.integrity(); assert.equal(h.world.IsLocked(), false);
});

test('disabling a live collider still dispatches its valid EndContact before body retirement', { skip: !present }, () => {
  const h = fixture(); h.install(); h.step();
  const before = h.events.filter(event => event[0] === 'end').length;
  h.tier1.enabled = false;
  assert.equal(h.events.filter(event => event[0] === 'end').length, before + 1);
  assert.equal(h.Contact.prototype.emit._retiredFixtureSkips, 0, 'disabled does not mean an invalid contact owner');
  assert.equal(h.tier1.body, null); h.integrity();
});

test('expanding a small planning-phase building around a unit preserves physics contact progress', { skip: !present }, () => {
  const h = fixture(); h.install();
  h.tier1.extent = .2; h.tier1.apply(); h.touch(h.unit); h.step();
  assert.equal(h.events.filter(e => e[0] === 'begin').length, 0, 'unit starts outside the small footprint');
  const before = h.unit.bodyComponent._getBody().GetPosition().x;
  h.tier1.enabled = false; h.tier2.enabled = true;
  for (let frame = 0; frame < 20; frame++) h.step();
  assert(h.events.some(e => e[0] === 'begin'), 'the expanded collider really contacts the pre-existing unit');
  assert(Math.abs(h.unit.bodyComponent._getBody().GetPosition().x - before) > .1, 'Box2D continues separating the overlapped body');
  assert.equal(h.world.IsLocked(), false); h.integrity();
});
