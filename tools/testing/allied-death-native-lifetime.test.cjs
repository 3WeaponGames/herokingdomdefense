'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const {environment, Node} = require('../navigation/runtime-harness.cjs');
const root = path.resolve(__dirname, '../..');
const configuration = require('../../assets/configs/GameJsonCfg.json');
const catalog = require('../../assets/resources/characters/catalog.json');

// Creator's JSB skeletonData setter immediately destroys the old native
// SkeletonAnimation and AnimationState. Its completion dispatcher must return
// before an allied casualty can deactivate a node whose appearance restores it.
for (const branch of [11, 20]) test('paid barracks ' + branch + ' finishes a baked ally death outside native Spine dispatch', () => {
  const e = environment(), scheduled = [], changes = [];
  const row = configuration.BuildEnum[3].levelList.find(value => value.index === branch);
  assert(row, 'The purchased branch must be present in the shipped configuration');
  const id = row.Data[1], prefab = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallEnemy/Play' + configuration.SoldierCfg[id].prefab + '.prefab')));
  const originalId = prefab.find(value => value.__type__ === 'sp.Skeleton')['_N$skeletonData'].__uuid__;
  const look = catalog.profiles[catalog.assignments['ally:' + id + ':level:' + row.level]];
  assert(look && look.baked && look.baked.uuid !== originalId, 'The paid branch actually replaces its prefab rig');
  const original = {uuid: originalId, skeletonJson: {_unitLook: catalog.assignments['ally:' + id + ':default']}};
  const baked = {uuid: look.baked.uuid, skeletonJson: {_unitLook: catalog.assignments['ally:' + id + ':level:' + row.level]}};
  let data = original, track = {animation: {name: 'idle'}, loop: true, trackTime: .1, timeScale: 1}, completion, inNativeCallback = false;
  const actor = e.actor('KinghtFallSoldierBase');
  delete actor.isDead;
  actor.cfg = {...actor.cfg, ID: id};
  actor.hp = 10;
  actor.time.Attack = .4;
  actor.scheduleOnce = callback => scheduled.push(callback);
  actor.delAllBuff = () => {};
  actor._syncFollowMarker = () => {};
  actor.outBuild = {index: branch, buildInfo: {cfg: row}, addDie() { changes.push('respawn-queue'); }};
  actor.node._combatGeneration = 1;
  const renderer = actor.spAni = {
    uuid: 'paid-ally-' + id, node: new Node('spAni', actor.node), defaultSkin: 'default', defaultAnimation: 'idle', _nativeSkeleton: {},
    get skeletonData() { return data; },
    set skeletonData(value) {
      assert.equal(inNativeCallback, false, 'Replacing skeletonData destroys the native state while its completion dispatcher is still using it');
      changes.push('rig:' + value.uuid); data = value; track = null;
      this.defaultSkin = ''; this.defaultAnimation = '';
    },
    getCurrent: index => index === 0 ? track : null,
    setSkin() {}, setSlotsToSetupPose() {},
    findAnimation: name => name === 'die',
    setAnimation(index, name, loop) { return track = {animation: {name}, loop, trackTime: 0, timeScale: 1}; },
    setTrackCompleteListener(_entry, callback) { completion = callback; }
  };
  e.cc.sys = {isNative: true};
  e.cc.Component = function () {};
  e.cc.Class = definition => { function Component() {} Object.assign(Component.prototype, definition); return Component; };
  e.cc.resources = {load(resource, _type, callback) {
    callback(null, resource === 'characters/catalog' ? {json: catalog} : resource === 'character-parts/catalog' ? {json: {parts: []}} : baked);
  }};
  e.stubs.UnitHitFeedback = {reset() {}};
  e.stubs.UnitVoices = {death() {}};
  const module = {exports: {}};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/CharacterAppearance.js'), 'utf8'), {
    module, exports: module.exports, cc: e.cc, sp: {SkeletonData: function () {}},
    require: name => name === 'UnitLevelStats' ? require('../../assets/_script/UnitLevelStats') : require('../../assets/_script/CharacterPartsCore')
  }, {filename: 'CharacterAppearance.js'});
  const appearance = module.exports.bind(actor, 'ally');
  appearance.lateUpdate(); appearance.lateUpdate();
  assert.equal(renderer.skeletonData, baked);
  assert.equal(appearance.bakedModels.length, 1);
  let active = true;
  Object.defineProperty(actor.node, 'active', {configurable: true, get: () => active, set(value) {
    active = value;
    if (!value) appearance.onDisable();
  }});
  actor.onAttacked(20);
  assert.equal(actor.isDead(), true);
  assert.equal(actor.node.active, true);
  assert.equal(typeof completion, 'function');
  const dispatch = () => {
    inNativeCallback = true;
    try { completion(); } finally { inNativeCallback = false; }
  };
  assert.doesNotThrow(dispatch);
  assert.doesNotThrow(dispatch, 'A duplicate native completion cannot schedule another casualty');
  while (scheduled.length) scheduled.shift()();
  assert.equal(actor.node.active, false);
  assert.equal(renderer.skeletonData, original);
  assert.equal(changes.filter(value => value === 'respawn-queue').length, 1);
});

for (const invalidation of ['generation', 'pooled', 'destroyed', 'revived', 'replaced']) test('deferred native death completion rejects an owner that was ' + invalidation, () => {
  const e = environment(), actor = e.actor('KinghtFallSoldierBase'), scheduled = [];
  e.cc.sys = {isNative: true};
  let completion, dead = true, finished = 0;
  actor.node._combatGeneration = 1;
  actor.isDead = () => dead;
  actor.scheduleOnce = callback => scheduled.push(callback);
  actor.spAni = {
    findAnimation: name => name === 'die', setAnimation: () => ({}),
    setTrackCompleteListener(_entry, callback) { completion = callback; }
  };
  actor.playDeath(() => finished++);
  completion(); completion();
  assert.equal(finished, 0, 'Gameplay finalization must wait until the native dispatcher returns');
  assert.equal(scheduled.length, 1, 'Duplicate completion events must schedule only one finalization');
  if (invalidation === 'generation') actor.node._combatGeneration++;
  if (invalidation === 'pooled') actor._isPooled = true;
  if (invalidation === 'destroyed') actor.destroyed = true;
  if (invalidation === 'revived') dead = false;
  if (invalidation === 'replaced') actor._deathAnimation = {};
  while (scheduled.length) scheduled.shift()();
  assert.equal(finished, 0);
});
