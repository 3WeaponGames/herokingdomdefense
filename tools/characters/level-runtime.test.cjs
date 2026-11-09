'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const Core = require('../../assets/_script/CharacterPartsCore');
const source = fs.readFileSync(path.resolve(__dirname, '../../assets/_script/CharacterAppearance.js'), 'utf8');

function fixture(options = {}) {
  let now = 0;
  const pending = [], requests = [], originals = {}, assets = {}, units = [];
  const config = {version: 1, profiles: {}, assignments: {}};
  for (const id of [90001, 90002, 90003, 90004]) {
    const original = originals[id] = {uuid: 'default-' + id, skeletonJson: {_unitLook: 'default-' + id}};
    config.profiles['default-' + id] = {name: 'Default', base: {type: 'ally', id: String(id)}, parts: [], scale: 1, baked: {uuid: original.uuid}};
    config.assignments['ally:' + id + ':default'] = 'default-' + id;
    for (const level of [1, 2, 3]) {
      const key = id + '-' + level, resource = 'unit-library/runtime/level-' + key;
      assets[resource] = {uuid: 'level-' + key, skeletonJson: {_unitLook: 'level-' + key}};
      config.profiles['level-' + key] = {name: 'Level ' + level, base: {type: 'ally', id: String(id), level}, parts: [], scale: 1.7,
        models: {unused: {x: 123}}, baked: {uuid: assets[resource].uuid, resource}};
      config.assignments['ally:' + id + ':level:' + level] = 'level-' + key;
    }
  }
  const cc = {Component: class {}, JsonAsset: class {}, Texture2D: class {}, sys: {isNative: !!options.native},
    isValid: value => !!value && !value.destroyed, warn(message) { throw Error(message); },
    Class(definition) { function Appearance() {} Appearance.prototype = definition; return Appearance; },
    resources: {load(resource, _type, callback) {
      requests.push(resource);
      if (resource === 'characters/catalog' || resource === 'character-parts/catalog') {
        pending.push({resource, run: () => callback(null, {json: resource === 'characters/catalog' ? config : {parts: []}})});
      } else {
        assert.ok(assets[resource], resource);
        pending.push({resource, run: error => callback(error || null, error ? null : assets[resource])});
      }
    }}
  };
  const context = {exports: {}, cc, sp: {SkeletonData: class {}}, Date: {now: () => now},
    require(name) { if(name==='UnitLevelStats')return require('../../assets/_script/UnitLevelStats');assert.equal(name, 'CharacterPartsCore'); return Core; }};
  vm.runInNewContext(source, context, {filename: 'CharacterAppearance.js'});
  function add(id = 90001, level = 1) {
    const node = {activeInHierarchy: true, scaleX: -.5, scaleY: .5, x: 4, y: 8, angle: 2, opacity: 230};
    const components = [], ownerNode = {activeInHierarchy: true,
      getComponent: Type => components.find(component => component instanceof Type),
      addComponent(Type) { const component = new Type(); components.push(component); return component; }};
    const callbacks = {complete: () => {}, event: () => {}}, plays = [], swaps = [];
    let data = originals[id], track, reaction = null, activeSkin = 'default';
    function makeTrack(name, loop, time = .37, speed = .8) {
      if (!options.native) return {animation: {name}, loop, trackTime: time, timeScale: speed};
      return {getAnimation: () => ({getName: () => name}), getLoop: () => loop,
        getTrackTime: () => time, setTrackTime: value => { time = value; },
        getTimeScale: () => speed, setTimeScale: value => { speed = value; }};
    }
    const renderer = {uuid: 'renderer-' + units.length, node, defaultSkin: 'default', defaultAnimation: 'idle', loop: true, timeScale: 1.5,
      _listener: callbacks, _skeleton: {skin: {name: activeSkin}},
      get skeletonData() { return data; },
      set skeletonData(value) {
        swaps.push(value.uuid); data = value; track = null; reaction = null;
        // Match Creator's skeletonData setter, which clears authored defaults.
        this.defaultSkin = ''; this.defaultAnimation = ''; this._skeleton = {skin: {name: 'default'}};
      },
      setSkin(name) { activeSkin = name; this._skeleton.skin = {name}; }, setSlotsToSetupPose() {},
      getCurrent(index) { return index === 1 ? reaction : track; },
      setAnimation(index, name, loop) { assert.equal(index, 0); plays.push({name, loop}); return track = makeTrack(name, loop, 0, 1); }
    };
    if (options.native) renderer._nativeSkeleton = {};
    track = makeTrack('idle', true);
    const actor = {cfg: {ID: id}, node: ownerNode, spAni: renderer, outBuild: {index: 22, buildInfo: {cfg: {level}}}, hp: 70, attack: 18,
      time: {Attack: .4}, dead: false, isDead() { return this.dead; }};
    const component = context.exports.bind(actor, 'ally');
    const unit = {actor, component, renderer, plays, swaps, callbacks, original: originals[id],
      track: () => track, setTrack(name, loop = false) { return track = makeTrack(name, loop); }, reaction(value) { reaction = value; }};
    units.push(unit); return unit;
  }
  function flush(resource, error) {
    let at;
    while ((at = pending.findIndex(job => !resource || job.resource === resource)) >= 0) pending.splice(at, 1)[0].run(error);
  }
  return {api: context.exports, config, assets, originals, add, requests, pending, flush,
    step(count = 1) { for (let i = 0; i < count; i++) for (const unit of units) unit.component.lateUpdate(); },
    setNow(value) { now = value; }};
}

test('all four allies resolve exact logical barracks levels rather than branch indices', () => {
  const f = fixture();
  for (const id of [90001, 90002, 90003, 90004]) {
    const unit = f.add(id, 1);
    for (const level of [1, 2, 3]) {
      unit.actor.outBuild.buildInfo.cfg.level = level;
      const selected = f.api.assignedLook(f.config, unit.actor, 'ally');
      assert.equal(f.api.allyLevel(unit.actor), level);
      assert.equal(selected.id, 'level-' + id + '-' + level);
    }
  }
});

test('unknown, missing and unassigned levels retain the legacy default assignment', () => {
  const f = fixture(), unit = f.add();
  for (const level of [undefined, 0, -1, 1.5, '2', NaN, Infinity, 99]) {
    unit.actor.outBuild.buildInfo.cfg.level = level;
    assert.equal(f.api.assignedLook(f.config, unit.actor, 'ally').id, 'default-90001');
  }
  unit.actor.outBuild = null;
  assert.equal(f.api.assignedLook(f.config, unit.actor, 'ally').id, 'default-90001');
  unit.actor.outBuild = {getLevel: () => 2};
  assert.equal(f.api.assignedLook(f.config, unit.actor, 'ally').id, 'level-90001-2');
  delete f.config.assignments['ally:90001:level:2'];
  assert.equal(f.api.assignedLook(f.config, unit.actor, 'ally').id, 'default-90001');
});

for (const native of [false, true]) test(`${native ? 'native' : 'web'} allies switch baked rigs with locomotion time and gameplay intact`, () => {
  const f = fixture({native}), unit = f.add(90003, 2), nodeBefore = {...unit.renderer.node};
  const catalogBefore = JSON.stringify(f.config);
  f.flush(); f.step();
  assert.equal(unit.renderer.skeletonData, unit.original, 'loads do not replace the active rig');
  f.flush(); f.step();
  assert.equal(unit.renderer.skeletonData.uuid, 'level-90003-2');
  assert.equal(unit.plays.length, 1);
  const track = unit.track();
  assert.equal(native ? track.getTrackTime() : track.trackTime, .37);
  assert.equal(native ? track.getTimeScale() : track.timeScale, .8);
  assert.equal(unit.renderer.timeScale, 1.5);
  assert.equal(unit.renderer._listener, unit.callbacks);
  assert.deepEqual(unit.renderer.node, nodeBefore, 'baked transforms are not overlaid again');
  assert.equal(unit.actor.hp, 70); assert.equal(unit.actor.attack, 18); assert.equal(unit.actor.time.Attack, .4);
  f.step(25); assert.equal(unit.plays.length, 1); assert.equal(unit.swaps.length, 1);
  unit.actor.outBuild.buildInfo.cfg.level = 3; f.step(); f.flush(); f.step();
  assert.equal(unit.renderer.skeletonData.uuid, 'level-90003-3');
  assert.equal(JSON.stringify(f.config), catalogBefore);
});

test('rig switches wait for attacks, death, hit reactions and pending gameplay hits', () => {
  const f = fixture(), unit = f.add(); f.flush(); f.step(); f.flush();
  const attack = unit.setTrack('attack'); f.step();
  assert.equal(unit.track(), attack); assert.equal(unit.swaps.length, 0);
  unit.setTrack('idle', true); unit.actor.time.Attack = -1; f.step(); assert.equal(unit.swaps.length, 0);
  unit.actor.time.Attack = 0; unit.actor.dead = true; f.step(); assert.equal(unit.swaps.length, 0);
  unit.actor.dead = false; unit.actor._hitReactionPlaying = true; f.step(); assert.equal(unit.swaps.length, 0);
  unit.actor._hitReactionPlaying = false; unit.reaction({animation: {name: 'hit'}}); f.step(); assert.equal(unit.swaps.length, 0);
  unit.reaction(null); unit.setTrack('die'); f.step(); assert.equal(unit.swaps.length, 0);
  unit.setTrack('move', true); f.step(); assert.equal(unit.swaps.length, 1);
  assert.equal(unit.plays[0].name, 'move');
});

test('renderers without a current track wait for a known locomotion animation', () => {
  const f = fixture(), unit = f.add(); f.flush(); f.step(); f.flush();
  unit.renderer.getCurrent = () => null;
  f.step(); assert.equal(unit.swaps.length, 0, 'an unknown or uninitialized pose must not replace a gameplay track');
  unit.renderer.animation = 'attack'; f.step(); assert.equal(unit.swaps.length, 0);
  unit.renderer.animation = 'idle'; unit.renderer.loop = true; f.step();
  assert.equal(unit.renderer.skeletonData.uuid, 'level-90001-1'); assert.equal(unit.plays[0].name, 'idle');
});

test('late async results cannot apply a previous level or a pooled actor', () => {
  const f = fixture(), unit = f.add(); f.flush(); f.step();
  unit.actor.outBuild.buildInfo.cfg.level = 2; f.step();
  f.flush('unit-library/runtime/level-90001-2'); f.step();
  assert.equal(unit.renderer.skeletonData.uuid, 'level-90001-2');
  f.flush('unit-library/runtime/level-90001-1'); f.step();
  assert.equal(unit.renderer.skeletonData.uuid, 'level-90001-2');
  unit.actor.node.activeInHierarchy = false; unit.component.onDisable();
  assert.equal(unit.renderer.skeletonData, unit.original);
  assert.equal(unit.renderer.defaultSkin, 'default'); assert.equal(unit.renderer.defaultAnimation, 'idle');
  unit.actor.outBuild.buildInfo.cfg.level = 3;
  unit.actor.node.activeInHierarchy = true; unit.setTrack('idle', true); f.step();
  unit.actor.node.activeInHierarchy = false; unit.component.onDisable(); f.flush(); f.step();
  assert.equal(unit.renderer.skeletonData, unit.original);
  unit.actor.node.activeInHierarchy = true; unit.setTrack('idle', true); f.step();
  assert.equal(unit.renderer.skeletonData.uuid, 'level-90001-3');
});

test('unassigned level returns to the original default rig and pooling can select another level', () => {
  const f = fixture(), unit = f.add(); f.flush(); f.step(); f.flush(); f.step();
  unit.actor.outBuild.buildInfo.cfg.level = 99; f.step();
  assert.equal(unit.renderer.skeletonData, unit.original);
  unit.actor.outBuild.buildInfo.cfg.level = 2; f.step(); f.flush(); f.step();
  assert.equal(unit.renderer.skeletonData.uuid, 'level-90001-2');
  unit.component.onDisable(); assert.equal(unit.renderer.skeletonData, unit.original);
  unit.actor.outBuild.buildInfo.cfg.level = 1; unit.setTrack('idle', true); f.step();
  assert.equal(unit.renderer.skeletonData.uuid, 'level-90001-1');
  unit.component.onDestroy(); assert.equal(unit.renderer.skeletonData, unit.original); assert.equal(unit.component.owner, null);
});

test('rig requests are shared and failed loads retry without changing the active visual', () => {
  const f = fixture(), one = f.add(), two = f.add(); f.flush(); f.step(10);
  const resource = 'unit-library/runtime/level-90001-1';
  assert.equal(f.requests.filter(id => id === resource).length, 1);
  f.flush(resource, Error('temporarily unavailable')); f.step(30);
  assert.equal(one.renderer.skeletonData, one.original); assert.equal(two.renderer.skeletonData, two.original);
  assert.equal(f.requests.filter(id => id === resource).length, 1);
  f.setNow(1000); f.step(); assert.equal(f.requests.filter(id => id === resource).length, 2);
  f.flush(); f.step(); assert.equal(one.renderer.skeletonData.uuid, 'level-90001-1'); assert.equal(two.renderer.skeletonData.uuid, 'level-90001-1');
});

test('legacy catalogs without level assignments make no new rig requests or animation changes', () => {
  const f = fixture(), unit = f.add();
  for (const key of Object.keys(f.config.assignments)) if (key.includes(':level:')) delete f.config.assignments[key];
  const track = unit.track(); f.flush(); f.step(20);
  assert.equal(f.requests.length, 2); assert.equal(unit.renderer.skeletonData, unit.original);
  assert.equal(unit.track(), track); assert.equal(unit.swaps.length, 0); assert.equal(unit.plays.length, 0);
});
