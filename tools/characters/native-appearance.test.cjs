'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'assets/_script/CharacterAppearance.js'), 'utf8');
const Core = require('../../assets/_script/CharacterPartsCore');
const library = require('../../assets/resources/character-parts/catalog.json');
const savedLooks = require('./fixtures/legacy-look.json');

// Creator 2.4's JSB index intentionally omits sp.SkeletonTexture. Native
// attachments also cannot run the web runtime's JS computeWorldVertices hook.
function fixture(options = {}) {
  let now = 0;
  const native = options.native !== false, pending = [], requests = [], warnings = [], notices = [];
  const config = JSON.parse(JSON.stringify(savedLooks));
  const profileId = config.assignments['ally:90001:default'];
  const profile = config.profiles[profileId], layer = profile.parts[0].layer;
  if (options.unassigned) config.assignments = {};
  if (options.profile) options.profile(profile, layer);
  const originalCatalog = JSON.stringify(config);
  const calls = { prepare: 0, apply: 0, restore: 0 };
  const browserCore = {
    actorKey: Core.actorKey,
    skinTint: Core.skinTint,
    prepare(_runtime, skeleton) {
      calls.prepare++;
      assert.equal(!!(native || options.rendererNative), false, 'native actors must retain native attachments');
      return { skeleton };
    },
    apply() { calls.apply++; },
    restore() { calls.restore++; }
  };
  class Component {}
  class Texture {
    constructor() { if (options.textureFailure === 'constructor') throw Error('adapter construction failed'); }
    setRealTexture(image) {
      if (options.textureFailure === 'binding') throw Error('texture binding failed');
      this.image = image;
    }
  }
  const sp = { spine: {} };
  if (!native || options.browserApiOnNative) sp.SkeletonTexture = Texture;
  if (options.missingTextureApi) delete sp.SkeletonTexture;
  const cc = {
    Component, Texture2D: class {}, JsonAsset: class {}, sys: { isNative: native },
    isValid: value => !!value && !value.destroyed,
    warn: message => warnings.push(message),
    log: message => notices.push(message),
    Class(definition) {
      function Appearance() {}
      Appearance.prototype = Object.assign(Object.create(Component.prototype), definition);
      return Appearance;
    },
    resources: { load(id, _type, done) {
      requests.push(id);
      if (options.loadFailure && id.startsWith('character-parts/Parts/')) throw Error('resource request failed');
      pending.push(() => {
        if (id === 'character-parts/catalog') return done(null, { json: library });
        if (id === 'characters/catalog') return done(null, { json: config });
        const entry = library.parts.find(part => part.resource === id);
        assert.ok(entry, id);
        done(null, { width: entry.width, height: entry.height });
      });
    } }
  };
  const context = { exports: {}, cc, sp, Date: { now: () => now },
    require(id) {
      if (id === 'CharacterPartsCore') return browserCore;
      if (id === 'UnitLevelStats') return require('../../assets/_script/UnitLevelStats');
      if (id === 'HeroItemLooks') return { current: base => base || profile };
      if (id === 'HeroBakedLooks') return require('../../assets/_script/HeroBakedLooks');
      throw Error('Unexpected module ' + id);
    }
  };
  vm.runInNewContext(source, context, { filename: 'CharacterAppearance.js' });
  const units = [];
  function add(type = 'ally') {
    const attachments = Object.freeze({ helmet: 'authored helmet', weapon: 'authored weapon' });
    const track = Object.freeze({ animation: 'attack', trackTime: .37 });
    const pose = { skin: { name: 'lan' }, attachments };
    const node = { activeInHierarchy: true, scaleX: -.5, scaleY: .5, x: 4, y: 8, angle: 2, opacity: 230 };
    const original = { ...node };
    const renderer = {
      uuid: 'renderer-' + units.length, skeletonData: { uuid: layer }, _skeleton: pose, node,
      setSkin(name) { pose.skin = { name }; }, setSlotsToSetupPose() {},
      setAnimation() { throw Error('Appearance must not restart animation'); }, getCurrent: () => track
    };
    if (native || options.rendererNative) renderer._nativeSkeleton = { native: true };
    const components = [], ownerNode = {
      activeInHierarchy: true,
      getComponent: Type => components.find(value => value instanceof Type),
      addComponent(Type) { const component = new Type(); components.push(component); return component; }
    };
    const actor = { cfg: { ID: 90001 }, node: ownerNode, hp: 100, attack: 12 };
    if (type === 'hero') actor.ctrPlayAni = { spAniBody: renderer };
    else actor.spAni = renderer;
    const component = context.exports.bind(actor, type);
    const unit = { actor, component, renderer, attachments, track, original };
    units.push(unit);
    return unit;
  }
  return {
    add, units, cc, sp, calls, requests, warnings, notices, config, profile, layer, options, api: context.exports,
    flush() { while (pending.length) pending.shift()(); },
    step(count = 1) { for (let i = 0; i < count; i++) units.forEach(unit => unit.component.lateUpdate()); },
    setNow(value) { now = value; },
    partRequests() { return requests.filter(id => id.startsWith('character-parts/Parts/')); },
    assertCatalogUntouched() { assert.equal(JSON.stringify(config), originalCatalog); }
  };
}

test('30 freshly spawned native barracks allies never call unavailable browser Spine APIs', () => {
  const f = fixture();
  for (let i = 0; i < 30; i++) f.add();
  assert.equal(f.sp.SkeletonTexture, undefined, 'same missing constructor as Creator native Simulator');
  assert.doesNotThrow(() => { f.flush(); f.step(); f.flush(); f.step(120); });
  assert.equal(f.partRequests().length, 0);
  assert.equal(f.requests.length, 2, 'catalogs are shared, not requested per soldier/frame');
  assert.equal(f.calls.prepare, 0);
  assert.equal(f.calls.apply, 0);
  assert.equal(f.warnings.length, 0);
  assert.equal(f.notices.length, 1, 'one informational compatibility notice per session');
  for (const unit of f.units) {
    assert.equal(unit.renderer._skeleton.attachments, unit.attachments);
    assert.equal(unit.renderer.getCurrent(), unit.track);
    assert.equal(unit.actor.hp, 100); assert.equal(unit.actor.attack, 12);
    assert.deepEqual(unit.renderer.node, unit.original);
  }
  f.assertCatalogUntouched();
});

test('the actual soldier body-initialization hook binds the native-safe appearance', () => {
  const f = fixture(), exports = {};
  f.cc._decorator = { ccclass: value => value, property: () => () => {} };
  const context = { exports, cc: f.cc, sp: f.sp,
    __extends(child, parent) { child.prototype = Object.create(parent.prototype); },
    __decorate(_decorators, target, key) { return key === undefined ? target : undefined; },
    require(id) {
      if (id === 'CharacterAppearance') return f.api;
      if (id === 'BaseCtrl') return { default: function BaseCtrl() {} };
      return {};
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/KinghtFallInterface.js'), 'utf8'), context);
  for (let i = 0; i < 6; i++) {
    const unit = f.add(); unit.actor.navigationTeam = 'friendly';
    exports.KinghtFallInterface.prototype.setBody.call(unit.actor, unit.renderer.node);
    assert.equal(unit.actor.body, unit.renderer.node);
  }
  assert.doesNotThrow(() => { f.flush(); f.step(); f.flush(); f.step(60); });
  assert.equal(f.partRequests().length, 0); assert.equal(f.calls.prepare, 0);
});

test('native initialization waits for the real skeleton before recording restorable skin/model state', () => {
  const f = fixture({ profile(profile, layer) { profile.scale = 1.2; profile.skins = { [layer]: 'alternate' }; } });
  const unit = f.add(), skeleton = unit.renderer._skeleton;
  unit.renderer._skeleton = null;
  f.flush(); f.step();
  assert.equal(unit.component.models.length, 0);
  assert.deepEqual(unit.renderer.node, unit.original);
  unit.renderer._skeleton = skeleton; f.step();
  assert.equal(skeleton.skin.name, 'alternate');
  unit.component.onDisable();
  assert.equal(skeleton.skin.name, 'lan'); assert.deepEqual(unit.renderer.node, unit.original);
});

for (const type of ['ally', 'hero']) test(`native ${type} retains supported skins/transforms and restores them after pooling`, () => {
  const f = fixture({ profile(profile, layer) {
    profile.scale = 1.2;
    profile.models = { [layer]: { x: 8, y: -3, rotation: 4, scaleX: 1.1, scaleY: .9, opacity: .8 } };
    profile.skins = { [layer]: 'alternate' };
  } });
  const unit = f.add(type); f.flush(); f.step(); f.flush(); f.step();
  assert.equal(unit.renderer.node.x, 12); assert.equal(unit.renderer.node.y, 5);
  assert.equal(unit.renderer.node.scaleX, -.5 * 1.2 * 1.1);
  assert.equal(unit.renderer.node.scaleY, .5 * 1.2 * .9);
  assert.equal(unit.renderer._skeleton.skin.name, 'alternate');
  assert.equal(unit.renderer.getCurrent(), unit.track);
  unit.component.onDisable();
  assert.deepEqual(unit.renderer.node, unit.original);
  assert.equal(unit.renderer._skeleton.skin.name, 'lan');
  assert.equal(unit.renderer._skeleton.attachments, unit.attachments);
  f.api.bind(unit.actor, type); f.step(); unit.component.onDestroy();
  assert.deepEqual(unit.renderer.node, unit.original);
  assert.equal(f.partRequests().length, 0);
  f.assertCatalogUntouched();
});

test('native renderers are protected even when web constructors exist or the platform flag is incomplete', () => {
  for (const options of [{ browserApiOnNative: true }, { native: false, rendererNative: true }]) {
    const f = fixture(options); f.add(); f.flush(); f.step(); f.flush(); f.step(20);
    assert.equal(f.partRequests().length, 0); assert.equal(f.calls.prepare, 0);
    assert.equal(f.warnings.length, 0); assert.equal(f.notices.length, 1);
  }
});

test('unassigned native actors keep their authored visuals without a compatibility warning', () => {
  const f = fixture({ unassigned: true }), unit = f.add(); f.flush(); f.step(30);
  assert.deepEqual(unit.renderer.node, unit.original);
  assert.equal(f.partRequests().length, 0); assert.equal(f.warnings.length, 0);
});
test('baked native allies are recognized by their asset UUID even when JSB does not expose skeletonJson',()=>{
  const f=fixture({profile(profile,layer){profile.baked={uuid:layer};profile.scale=1.7;profile.models={[layer]:{x:20,scaleX:1.2,tint:'#80c0ff'}};}}),unit=f.add();
  f.flush();f.step(10);assert.deepEqual(unit.renderer.node,unit.original,'baked transforms were applied a second time');assert.equal(f.partRequests().length,0);assert.equal(f.notices.length,0);assert.equal(f.calls.prepare,0);
});

for (const kind of ['constructor', 'binding']) test(`web ${kind} failures stay inside the texture callback and recover after shared backoff`, () => {
  const f = fixture({ native: false, textureFailure: kind });
  for (let i = 0; i < 6; i++) f.add();
  f.flush(); f.step(); assert.doesNotThrow(() => f.flush());
  const initial = f.partRequests().length;
  for (let now = 0; now < 1000; now += 16) { f.setNow(now); f.step(); }
  assert.equal(initial, 2); assert.equal(f.partRequests().length, initial);
  f.options.textureFailure = null; f.setNow(1000); f.step(); f.flush(); f.step();
  assert.equal(f.partRequests().length, 4); assert.equal(f.calls.prepare, 6);
  assert.equal(f.warnings.length, 2); f.assertCatalogUntouched();
});

test('a missing web texture adapter cannot leak the same native-style constructor error', () => {
  const f = fixture({ native: false, missingTextureApi: true });
  f.add(); f.flush(); f.step(); assert.doesNotThrow(() => f.flush());
  f.sp.SkeletonTexture = class { setRealTexture() {} };
  f.setNow(1000); f.step(); f.flush(); f.step();
  assert.equal(f.calls.prepare, 1); assert.equal(f.partRequests().length, 4);
});

test('a synchronous texture request failure is bounded and does not abort the actor update', () => {
  const f = fixture({ native: false, loadFailure: true });
  f.add(); f.flush(); assert.doesNotThrow(() => f.step());
  f.step(100); assert.equal(f.partRequests().length, 2);
  f.options.loadFailure = false; f.setNow(1000); f.step(); f.flush(); f.step();
  assert.equal(f.calls.prepare, 1); assert.equal(f.partRequests().length, 4);
});
