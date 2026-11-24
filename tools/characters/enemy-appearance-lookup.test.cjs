'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const Core = require('../../assets/_script/CharacterPartsCore');
const Profiles = require('../../assets/_script/EnemyStageProfiles');
const source = fs.readFileSync(path.join(__dirname, '../../assets/_script/CharacterAppearance.js'), 'utf8');

function fixture(native, initial = 100215) {
  let legacy = 0, visuals = 0;
  class Skeleton {
    constructor() {
      this.node = { scaleX: 1, scaleY: 1 };
      this.skeletonData = { _uuid: 'model', skeletonJson: {} };
      this._skeleton = { skin: { name: 'default' } };
    }
  }
  const catalog = { assignments: {}, profiles: {}, unitAnimationSpeeds: {} };
  const table = { entries: { [initial]: { baseId: 91032 } }, bossForms: {} };
  const data = { GameTools: { unitProfiles: table } };
  const modules = {
    CharacterPartsCore: Core,
    UnitLevelStats: require('../../assets/_script/UnitLevelStats'),
    KinghtFallDataMgr: { KinghtFallDataMgr: { getInstance() { return { data }; } } },
    EnemyStageProfiles: { referenceIds(...args) { legacy++; return Profiles.referenceIds(...args); } }
  };
  const api = {}, context = {
    exports: api,
    sp: { Skeleton },
    cc: {
      ENGINE_VERSION: '2.4.13',
      sys: { isNative: native },
      Class(definition) { function Component() {} Component.prototype = definition; return Component; },
      isValid: value => !!value
    },
    require(name) { assert(modules[name], 'Unexpected module ' + name); return modules[name]; },
    visualQuery() { visuals++; }
  };
  vm.runInNewContext(source.replace('function visuals(actor, type) {',
    'function visuals(actor, type) { visualQuery();'), context);
  api.prime(catalog, { parts: [] });
  const actor = { cfg: { ID: initial }, spAni: new Skeleton(), node: { activeInHierarchy: true }, navigationTeam: 'enemy' };
  const appearance = Object.assign(new api.component(), { owner: actor, team: 'enemy', models: [], states: [] });
  return { api, actor, appearance, catalog, data, table, counters: () => ({ legacy, visuals }) };
}

function assign(f, id, look, speed) {
  if (look) {
    f.catalog.profiles[look] = { scale: 1.25, name: look };
    f.catalog.assignments['enemy:' + id + ':default'] = look;
  }
  f.catalog.unitAnimationSpeeds['enemy:' + id + ':default'] = speed;
}

test('normal stock enemy reads current explicit and inherited data without materializing a profile chain', () => {
  for (const native of [false, true]) {
    const f = fixture(native);
    assign(f, 91032, 'parent', .75);
    assert.equal(f.api.assignedLook(f.catalog, f.actor, 'enemy').id, 'parent');
    assert.equal(f.api.animationSpeed(f.actor, 'enemy'), .75);
    assign(f, 100215, 'direct', 0);
    assert.equal(f.api.assignedLook(f.catalog, f.actor, 'enemy').id, 'direct');
    assert.equal(f.api.animationSpeed(f.actor, 'enemy'), 0);
    delete f.catalog.profiles.direct;
    delete f.catalog.unitAnimationSpeeds['enemy:100215:default'];
    f.table.entries[100215].baseId = 91042;
    assign(f, 91042, 'new-parent', 2);
    assert.equal(f.api.assignedLook(f.catalog, f.actor, 'enemy').id, 'new-parent');
    assert.equal(f.api.animationSpeed(f.actor, 'enemy'), 2);
    assert.equal(f.counters().legacy, native ? 0 : 4);
  }
});

test('native profile traversal retains the legacy fallback for deep or non-numeric chains and custom actors', () => {
  const deep = fixture(true);
  for (let id = 100215; id < 100228; id++) deep.table.entries[id] = { baseId: id + 1 };
  assign(deep, 100228, 'deep', 1.25);
  assert.equal(deep.api.assignedLook(deep.catalog, deep.actor, 'enemy').id, 'deep');
  assert.equal(deep.api.animationSpeed(deep.actor, 'enemy'), 1.25);
  deep.table.entries[100228] = { baseId: 100215 };
  delete deep.catalog.profiles.deep;
  delete deep.catalog.unitAnimationSpeeds['enemy:100228:default'];
  assert.equal(deep.api.assignedLook(deep.catalog, deep.actor, 'enemy').profile, undefined);
  assert.equal(deep.api.animationSpeed(deep.actor, 'enemy'), undefined);
  assert.equal(deep.counters().legacy, 4);

  const f = fixture(true);
  f.table.entries[100215].baseId = '91032';
  assign(f, 91032, 'parent', 1.1);
  assert.equal(f.api.assignedLook(f.catalog, f.actor, 'enemy').id, 'parent');
  f.actor.getSpAni = () => f.actor.spAni;
  f.table.entries[100215].baseId = 91032;
  assert.equal(f.api.animationSpeed(f.actor, 'enemy'), 1.1);
  assert.equal(f.counters().legacy, 2);
});

test('stock native enemies skip renderer collection only while the current appearance is absent', () => {
  for (const native of [false, true]) {
    const f = fixture(native);
    f.appearance.lateUpdate();
    assert.equal(f.counters().visuals, native ? 0 : 1);
    assign(f, 91032, 'parent', undefined);
    f.appearance.lateUpdate();
    assert.equal(f.actor.spAni.node.scaleY, 1.25);
    assert.equal(f.counters().visuals, native ? 1 : 2);
    delete f.catalog.assignments['enemy:91032:default'];
    f.appearance.lateUpdate();
    assert.equal(f.actor.spAni.node.scaleY, 1);
    assert.equal(f.appearance.models.length, 0);
    assert.equal(f.counters().visuals, native ? 1 : 3);
  }
});
