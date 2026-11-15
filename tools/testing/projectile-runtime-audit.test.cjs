'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {setup, Node, Vec2} = require('./backend-gameplay-harness.cjs');
const Warm = require('../../assets/_script/StageAssetWarmup');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

function artworkApi(modules = {}) {
  const api = {}, requests = [], cc = {
    isValid: value => !!value && !value.destroyed,
    SpriteFrame: function () {},
    resources: {load(resource, type, done) {requests.push({resource, done});}}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/_script/ProjectileLooks.js'), 'utf8'), {exports: api, cc, require: name => {if (modules[name.replace(/^\.\//, '')]) return modules[name.replace(/^\.\//, '')]; throw Error('Unexpected runtime dependency ' + name);}});
  return {api, cc, requests};
}

function shot(h, type) {
  const Bullet = h.load('KinghtFallBullet' + type).default, bullet = new Bullet();
  bullet.node = new Node('shot'); bullet.node.angle = -123;
  bullet.bullet = {active: false}; bullet.state = 2;
  bullet.ctrPar = {freeBullet() {}};
  return bullet;
}

for (const type of ['Base', 'Play', 'Enemy', 'Soldier', 'Enemy8', 'Build']) {
  test(type + ' artwork begins once after final heading and impact callback are initialized', () => {
    const h = setup(), bullet = shot(h, type), seen = [], victim = new Node('target', null, 0, 200);
    bullet._launchProjectileLook = () => seen.push({angle: bullet.node.angle, state: bullet.state, attack: typeof bullet.callAttack});
    bullet.setTag(new Vec2(), victim, () => {});
    assert.equal(seen.length, 1);
    assert.equal(seen[0].angle, type === 'Base' ? 160 : 90);
    assert.equal(seen[0].state, 0); assert.equal(seen[0].attack, 'function');
  });
}

for (const type of ['Play', 'Enemy', 'Soldier']) {
  test(type + ' left/right launches use this checkout heading', () => {
    const h = setup(), bullet = shot(h, type), victim = new Node('target', null, 0, 200), seen = [];
    bullet._launchProjectileLook = () => seen.push(bullet.node.angle);
    if (type === 'Play') bullet.setLeft(true, victim, () => {});
    else bullet.setLeft(new Vec2(1, 0), victim, () => {});
    assert.equal(seen.length, 1); assert.equal(seen[0], 160);
  });
}

test('Enemy8 never animates an old impact over a rebound or already-completed new shot', () => {
  for (const finishNew of [false, true]) {
    const h = setup(), bullet = shot(h, 'Enemy8'), victim = new Node('first', null, 10, 0), next = new Node('next', null, 20, 0), animations = [];
    bullet.spAni = {setAnimation: (...args) => animations.push(args)};
    bullet.setTag(new Vec2(), victim, () => {bullet.setTag(new Vec2(), next, () => {}); if (finishNew) bullet.onDie();});
    bullet.onDie();
    assert.equal(animations.length, finishNew ? 1 : 0);
    assert.equal(bullet.state, finishNew ? 1 : 0);
  }
});

test('Enemy8 impact does not access a renderer retired or replaced by damage callbacks', () => {
  for (const teardown of ['renderer', 'node', 'replacement']) {
    const h = setup(), bullet = shot(h, 'Enemy8'), victim = new Node('target', null, 10, 0);
    const renderer = {setAnimation() {assert.fail('retired impact animation');}}; bullet.spAni = renderer;
    bullet.setTag(new Vec2(), victim, () => {
      if (teardown === 'renderer') renderer.destroyed = true;
      else if (teardown === 'node') bullet.node.destroyed = true;
      else bullet.spAni = {setAnimation() {assert.fail('replacement renderer belongs to a different lifecycle');}};
    });
    assert.doesNotThrow(() => bullet.onDie());
  }
});

test('modern tower cached trail choices win after reset and use the converted final heading', () => {
  const h = setup(), bullet = shot(h, 'Build'), victim = new Node('target', null, 30, 40), seen = [];
  const legacy = {enabled: false, resets: 0, reset() {this.resets++;}};
  h.e.cc.MotionStreak = function () {};
  bullet.node.getComponentsInChildren = () => [legacy];
  bullet._launchProjectileLook = () => {
    seen.push({heading: bullet.node.angle, enabledBeforeOverride: legacy.enabled});
    legacy.enabled = false;
  };
  bullet.setTowerTag(new Vec2(), victim, () => {}, {attackType: 'arrow'});
  assert.equal(seen.length, 1); assert.equal(seen[0].enabledBeforeOverride, true);
  assert(Math.abs(seen[0].heading - Math.atan2(40, 30) * 180 / Math.PI) < 1e-9);
  assert.equal(legacy.enabled, false); assert.equal(legacy.resets, 1);
});

test('campaign controller destruction disposes the artwork bank once and drops its asset ownership', () => {
  const h = setup(); let disposed = 0;
  h.g._projectileLooks = {dispose() {disposed++;}};
  h.g.onDestroy(); assert.equal(disposed, 1); assert.equal(h.g._projectileLooks, null);
  h.g.onDestroy(); assert.equal(disposed, 1);
});

test('stage warmup expands complete sets, inherited tower choices, trails and mystic fallback without writes', () => {
  const projectile = {
    assignments: {
      hero: {set: 'hero-set'},
      tower: {set: 'shared-set', trail: 'trail'},
      'tower:2:4': {set: 'tower-set'},
      'enemy:1': {set: 'enemy-set'},
      'enemy:2': {set: 'unused-set'}
    },
    sets: [
      {id: 'hero-set', flight: 'hero-flight', launch: 'launch', impact: 'impact'},
      {id: 'shared-set', flight: 'shared-flight'},
      {id: 'tower-set', flight: 'tower-flight', launch: 'launch'},
      {id: 'enemy-set', flight: 'enemy-flight'},
      {id: 'unused-set', flight: 'unused-flight'}
    ],
    assets: ['hero-flight', 'shared-flight', 'tower-flight', 'enemy-flight', 'unused-flight', 'launch', 'impact', 'original:fireball'].map(id => ({id, kind: 'sprite', resource: id})),
    trails: [{id: 'trail', resource: 'selected-trail'}]
  };
  const catalogs = {characters: {profiles: {}, assignments: {}}, parts: {parts: []}, projectiles: projectile};
  const before = JSON.stringify(catalogs);
  const items = Warm.presentationPlan({}, {}, {enemies: ['1'], allies: []}, catalogs, {names: {}, style: 'mystic'});
  const paths = new Set(items.map(item => item.path));
  for (const id of ['hero-flight', 'shared-flight', 'tower-flight', 'enemy-flight', 'launch', 'impact', 'original:fireball', 'selected-trail']) assert(paths.has(id), id);
  assert(!paths.has('unused-flight')); assert.equal(items.filter(item => item.path === 'launch').length, 1);
  assert.equal(items.find(item => item.path === 'selected-trail').type, 'texture');
  assert.equal(JSON.stringify(catalogs), before);
});

test('valid maximum wall volleys retain all delayed gameplay attacks beyond the visual cap', () => {
  const {api} = artworkApi(), owner = {_combatEpoch: 1}, source = {node: {}, time: {}}, hits = [];
  api.prime({assets: [], assignments: {'wall-defense': {launchDelay: 10}}});
  for (let volley = 0; volley < 10; volley++) for (let arrow = 0; arrow < 15; arrow++) api.queueLaunch(owner, 'wall-defense', source, () => hits.push([volley, arrow]), () => true);
  assert.equal(owner._projectileLooks.launches.length, 150);
  owner._projectileLooks.update(10); assert.equal(hits.length, 150); assert.deepEqual(hits[149], [9, 14]);
  owner._projectileLooks.update(10); assert.equal(hits.length, 150); owner._projectileLooks.dispose();
});

test('launch snapshots keep callback order, defer reentrant attacks and stop when disposed', () => {
  const {api} = artworkApi(), owner = {_combatEpoch: 1}, source = {node: {}}, calls = [];
  api.prime({assets: [], assignments: {tower: {launchDelay: .25}}});
  api.queueLaunch(owner, 'tower', source, () => {calls.push('first'); api.queueLaunch(owner, 'tower', source, () => calls.push('new'), () => true);}, () => true);
  api.queueLaunch(owner, 'tower', source, () => calls.push('second'), () => true);
  const bank = owner._projectileLooks;
  bank.update(.25); assert.deepEqual(calls, ['first', 'second']); assert.equal(bank.launches.length, 1);
  bank.update(.25); assert.deepEqual(calls, ['first', 'second', 'new']);
  api.queueLaunch(owner, 'tower', source, () => {calls.push('dispose'); bank.dispose();}, () => true);
  api.queueLaunch(owner, 'tower', source, () => calls.push('discarded'), () => true);
  assert.doesNotThrow(() => bank.update(.25)); assert.deepEqual(calls, ['first', 'second', 'new', 'dispose']); assert.equal(bank.launches.length, 0);
});

test('one failed launch retains unrelated queued attacks and reentrant additions', () => {
  const {api} = artworkApi(), owner = {_combatEpoch: 1}, source = {node: {}}, calls = [];
  api.prime({assets: [], assignments: {tower: {launchDelay: .25}}});
  api.queueLaunch(owner, 'tower', source, () => {calls.push('failed'); api.queueLaunch(owner, 'tower', source, () => calls.push('new'), () => true); throw Error('release failed');}, () => true);
  api.queueLaunch(owner, 'tower', source, () => calls.push('second'), () => true);
  const bank = owner._projectileLooks; assert.throws(() => bank.update(.25), /release failed/); assert.equal(bank.launches.length, 2);
  bank.update(.25); assert.deepEqual(calls, ['failed', 'second', 'new']); assert.equal(bank.launches.length, 0); bank.dispose();
});

test('a cold stage-profile shot keeps its launch-time source artwork after its shooter is pooled', () => {
  const settings = {}, {api, requests} = artworkApi({FantasyEffects: {projectile: () => ({})}, EnemyStageProfiles: require('../../assets/_script/EnemyStageProfiles'), KinghtFallDataMgr: {KinghtFallDataMgr: {getInstance: () => ({data: {GameTools: settings}})}}});
  const data = {assets: [{id: 'first', kind: 'sprite', resource: 'first'}, {id: 'next', kind: 'sprite', resource: 'next'}], assignments: {'enemy:90003': {flight: 'first'}, 'enemy:90008': {flight: 'next'}}};
  const actor = {cfg: {ID: 1000000000, ProfileBaseID: 90003}}, node = {parent: {}, angle: 0, getPosition: () => ({x: 0, y: 0})}, bullet = {node, _shot: {}}, owner = {_combatEpoch: 1};
  api.prepare(bullet, owner, 'enemy:1000000000', actor); bullet._launchProjectileLook(); assert.equal(requests.length, 1);
  actor.cfg = {ID: 1000000003, ProfileBaseID: 90008}; requests.shift().done(null, {json: data});
  assert.equal(bullet._projectileVisual.options.flight, 'first'); assert.equal(requests[0].resource, 'first'); owner._projectileLooks.dispose();
});

test('cold visual effect work is bounded and cancellations release slots without dropping gameplay', () => {
  const {api, requests} = artworkApi(), bank = new api.Bank({_combatEpoch: 1}), descriptor = {id: 'effect', resource: 'effect', kind: 'sprite'}, cancellations = [];
  for (let i = 0; i < 1000; i++) {const cancel = bank.effect(descriptor, {}, {x: 0, y: 0}, 0, {size: 40}, () => true); if (cancel) cancellations.push(cancel);}
  assert.equal(requests.length, 1); assert.equal(bank.pendingEffects, 128); assert.equal(bank.cache.effect.callbacks.length, 128);
  cancellations.slice(0, 64).forEach(cancel => {cancel(); cancel();});
  assert.equal(bank.pendingEffects, 64); assert.equal(bank.cache.effect.callbacks.length, 64);
  requests[0].done(Error('missing optional effect'));
  assert.equal(bank.pendingEffects, 0); assert.equal(bank.cache.effect.callbacks.length, 0);
  bank.effect(descriptor, {}, {x: 0, y: 0}, 0, {size: 40}, () => true); assert.equal(bank.pendingEffects, 0, 'backoff completes synchronously');
  bank.dispose(); cancellations.forEach(cancel => cancel()); assert.equal(bank.pendingEffects, 0);
});

for (const selection of ['prefab', 'trail', 'off']) test('failed optional ' + selection + ' resource retains authored trail fallback and honors explicit off', () => {
  const {api, cc, requests} = artworkApi(); cc.MotionStreak = function () {}; cc.Texture2D = function () {};
  const streak = new cc.MotionStreak(); streak.enabled = true;
  const node = {parent: {}, angle: 0, getPosition: () => ({x: 0, y: 0}), getComponentsInChildren: () => [streak]}, bullet = {node, _shot: {}};
  const prefab = {id: 'visual', kind: 'sprite', visualPrefab: {resource: 'visual'}};
  const assignment = selection === 'prefab' ? {flight: 'visual'} : selection === 'off' ? {flight: 'visual', trail: false} : {trail: 'preset'};
  api.prime({assignments: {tower: assignment}, assets: [prefab], trails: [{id: 'preset', resource: 'preset'}]});
  const owner = {_combatEpoch: 1}; api.prepare(bullet, owner, 'tower'); bullet._launchProjectileLook();
  assert.equal(streak.enabled, false); requests[0].done(Error('optional resource unavailable'));
  assert.equal(streak.enabled, selection !== 'off'); owner._projectileLooks.dispose(); assert.equal(streak.enabled, true);
});

test('stage admission warms model-authored projectile defaults after replacement rigs load', async () => {
  const projectiles = {assignments: {}, assets: [{id: 'model-flight', kind: 'spine', resource: 'model-flight'}, {id: 'model-impact', kind: 'sprite', resource: 'model-impact'}]};
  const catalogs = {characters: {assignments: {hero: 'baked'}, profiles: {baked: {baked: {resource: 'replacement-rig'}}}}, parts: {parts: []}, projectiles};
  const model = {skeletonJson: {_fantasy: {effects: {projectile: {flight: 'model-flight', impact: 'model-impact'}}}}};
  const seen = [], session = new Warm.Session({config: {BuildEnum: {}, SoldierCfg: {}}, level: {prefab: 'map', WaveCfg: []}, names: {IconMap: 'maps'}, load(item, done) {
    seen.push(item.path);
    const json = {'characters/catalog': catalogs.characters, 'character-parts/catalog': catalogs.parts, 'projectiles/catalog': projectiles}[item.path];
    done(null, json ? {json} : item.path === 'replacement-rig' ? model : {});
  }});
  await session.run(); assert(session.ready);
  assert(seen.indexOf('model-flight') > seen.indexOf('replacement-rig')); assert(seen.includes('model-impact'));
  assert.equal(seen.filter(value => value === 'replacement-rig').length, 1); session.dispose();
});

test('wall battle startup waits for the catalog before starting waves or its reward clock', () => {
  const output = {}, calls = [], scheduled = [], resource = {}, player = {beginRun() {calls.push('begin'); return {};}, setState(value) {calls.push(['state', value]);}};
  function Base() {}
  const looks = {warmup() {}, prime(value) {calls.push(['prime', value]);}};
  const cc = {_decorator: {ccclass: value => value, property: () => () => {}}, JsonAsset: function () {}, Node: function () {}, Prefab: function () {}, winSize: {width: 750, height: 1334}};
  const stubs = {ProjectileLooks: looks, BaseUI: {default: Base}, GAD_Cards: {default: function () {}}, GAD_Configs: {GADConfig: {WallWidth: 830, BottomHeight: 50}, emGADGameState: {Game: 1}}, GAD_PlayerMgr: {default: {getInstance: () => player}}, GAD_DataMgr: {default: {getInstance: () => ({getParam: (_id, fallback) => fallback})}}, GADGameEnumData: {enumGADBasicCfg: {}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/_script/GAD_UIGame.js'), 'utf8'), {exports: output, cc, require: name => stubs[name] || {}, __extends: (C, B) => {C.prototype = Object.create(B.prototype); C.prototype.constructor = C;}, __decorate: (_ds, target, key) => key === undefined ? target : undefined});
  const game = new output.default(); game.ndCardGroup = {getComponent: () => ({})}; game.ndFence = {};
  game.initEvents = () => {}; game.buildWave = () => calls.push('wave'); game.scheduleOnce = callback => scheduled.push(callback);
  game.loadFromRes = (name, type, callback) => {assert.equal(name, 'projectiles/catalog'); resource.done = callback;};
  game.start(); assert.deepEqual(calls, []); assert.equal(scheduled.length, 0);
  const data = {assignments: {'wall-defense': {launchDelay: .8}}}; resource.done({json: data});
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'prime'); assert.equal(scheduled.length, 1);
  scheduled.shift()(); assert.deepEqual(calls.map(value => Array.isArray(value) ? value[0] : value), ['prime', 'begin', 'state', 'wave']);
  game.start(); resource.done({json: data}); game.isclose = true; scheduled.shift()();
  assert.equal(calls.filter(value => value === 'wave').length, 1, 'closing during scheduled admission cannot start a late battle');
});


test('shared and stage fighting profiles inherit projectile speed without seeding overrides', () => {
  const h = setup(), api = h.load('GameToolsOverrides'), config = h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data;
  config.GameTools = {unitProfiles: {entries: {100001: {baseId: 90003}, 100002: {baseId: 90011}}}, projectileSpeeds: {'enemy:90003:default': 730, 'enemy:90011:2': 820}};
  const original = JSON.stringify(config.GameTools);
  for (const cfg of [{ID: 100001}, {ID: 1000000000, ProfileBaseID: 100001}]) assert.equal(api.projectileSpeed({cfg}, 'enemy', 500), 730);
  assert.equal(api.projectileSpeed({cfg: {ID: 100002}}, 'enemy', 500), 820);
  assert.equal(JSON.stringify(config.GameTools), original);
  config.GameTools.projectileSpeeds['enemy:100001:default'] = 940;
  assert.equal(api.projectileSpeed({cfg: {ID: 1000000000, ProfileBaseID: 100001}}, 'enemy', 500), 940);
  config.GameTools.projectileSpeeds['enemy:100001:default'] = 0;
  assert.equal(api.projectileSpeed({cfg: {ID: 100001}}, 'enemy', 500), 500, 'malformed explicit override retains its authored fallback');
});

test('Enemy8 fireballs acquire and follow a moving mirrored doorway center', () => {
  const h = setup(), bullet = shot(h, 'Enemy8'), parent = new Node('map'), gate = new Node('gate', parent, 300, 20), origin = new Vec2(0, 0);
  gate._buildingAttackPoint = new Vec2(80, 40); gate.scaleX = -1;
  const first = parent.convertToNodeSpaceAR(gate.convertToWorldSpaceAR(gate._buildingAttackPoint));
  let hits = 0; bullet.spAni = {setAnimation() {}}; bullet.node.setPosition(origin);
  bullet.setTag(origin, gate, () => hits++);
  assert.equal(bullet.tagPos.x, first.x); assert.equal(bullet.tagPos.y, first.y);
  assert(Math.abs(bullet.node.angle - Math.atan2(first.y, first.x) * 180 / Math.PI) < 1e-9);
  gate.x = 450; gate.scaleX = 1;
  const moved = parent.convertToNodeSpaceAR(gate.convertToWorldSpaceAR(gate._buildingAttackPoint));
  bullet.node.setPosition(moved.x - 20, moved.y); bullet.onUpdate(.01);
  assert.equal(hits, 1); assert.equal(bullet.state, 1);
});
