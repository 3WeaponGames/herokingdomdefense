'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), { test } = require('node:test');
const { Service } = require('../../packages/hkd-characters/lib/service');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hkd-ally-level-editor-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  function write(relative, value) {
    const file = path.join(dir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
    return file;
  }
  const guard = {
    name: 'Guard', base: { type: 'ally', id: '90001' }, scale: 1,
    parts: [{ id: 'helmet', sprite: 'helmet', layer: 'model', slot: 'head', bone: 'head-bone', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, order: 0, hideSlots: [] }],
    future: { keep: 13 }
  };
  write('assets/resources/characters/catalog.json', '{\n  "version": 1,\n  "future": { "value": 1.00 },\n  "profiles": ' + JSON.stringify({ guard }) + ',\n  "assignments": {"ally:90001:default":"guard"}\n}\n');
  write('assets/resources/character-parts/catalog.json', { version: 1, parts: [{ id: 'helmet' }] });
  write('assets/resources/localization/catalog.json', { entries: {} });
  const config = write('assets/KinghtFallConfig/GameJsonCfg.json', {
    AllyCfg: {
      90001: { ID: 90001, prefab: 'ItemEnemy01', Name: 'Guard' },
      90002: { ID: 90002, prefab: 'ItemEnemy02', Name: 'Infantry' }
    },
    SoldierCfg: { 90001: { ID: 90001, prefab: 'ItemEnemy01', Name: 'Enemy' } },
    BuildEnum: { 3: { levelList: [
      { index: 11, level: 1, Data: [4, 90001, 8] },
      { index: 13, level: 3, Data: [8, 90001, 8] },
      { index: 12, level: 2, Data: [6, 90001, 8] },
      { index: 4, level: 3, Data: [10, 90001, 5] }
    ] } },
    GameTools: { timingDefaults: { approved: { attack: .3 } }, timings: { custom: { attack: .4 } } },
    unknown: 'preserved'
  });
  write('assets/KinghtFallEnemy/PlayItemEnemy01.prefab', []);
  write('assets/KinghtFallEnemy/PlayItemEnemy02.prefab', []);
  const store = new Service(dir);
  store.describe = () => ({ layers: [{ uuid: 'model', skins: ['default'], json: { bones: [{ name: 'head-bone' }], slots: [{ name: 'head' }, { name: 'body' }] } }] });
  return { dir, store, file: store.file, config, home: path.join(dir, 'artifact-home') };
}

function addLevel(data, level) {
  const id = 'guard-level-' + level;
  data.profiles[id] = structuredClone(data.profiles.guard);
  data.profiles[id].name += ' level ' + level;
  data.profiles[id].base.level = level;
  data.assignments['ally:90001:level:' + level] = id;
  return data.profiles[id];
}
function stage(store, mutate) {
  const data = store.snapshot().data;
  mutate(data);
  return store.change({ version: store.version, data });
}
function save(f) {
  // Exercise the real transaction while keeping disposable backup artifacts in
  // this test's OS temporary directory, outside the working project.
  const original = os.homedir;
  os.homedir = () => f.home;
  try { return f.store.save({ version: f.store.version }); }
  finally { os.homedir = original; }
}

test('ally levels use sorted logical barracks levels, deduplicate branches and retain a level-one fallback', t => {
  const f = fixture(t), units = f.store.units();
  assert.deepEqual(units.find(unit => unit.type === 'ally' && unit.id === '90001').levels, [1, 2, 3]);
  assert.deepEqual(units.find(unit => unit.type === 'ally' && unit.id === '90002').levels, [1]);
  assert.equal(units.filter(unit => unit.type === 'ally').length, 2, 'levels do not duplicate character bases');
  assert.equal(units.find(unit => unit.type === 'enemy').key, 'enemy:90001:default');
});

test('opening and browsing ally levels and unchanged Save perform no writes or normalization', t => {
  const f = fixture(t), before = fs.readFileSync(f.file), config = fs.readFileSync(f.config);
  const stamp = fs.statSync(f.file).mtimeMs;
  const loaded = f.store.load();
  for (const level of loaded.units.find(unit => unit.id === '90001' && unit.type === 'ally').levels) {
    f.store.describe({ type: 'ally', id: '90001', level }, true);
    f.store.snapshot();
  }
  assert.equal(save(f).result.saved, false);
  assert.deepEqual(fs.readFileSync(f.file), before);
  assert.equal(fs.statSync(f.file).mtimeMs, stamp);
  assert.deepEqual(fs.readFileSync(f.config), config);
  assert.equal(fs.existsSync(f.home), false);
  assert.equal(f.store.snapshot().dirty, false);
});

test('ally profile levels must be configured integers and cannot be attached to heroes or enemies', t => {
  const f = fixture(t), before = fs.readFileSync(f.file);
  for (const level of [0, 4, -1, 1.5, '2', true, null, NaN, Infinity]) {
    const data = f.store.snapshot().data;
    addLevel(data, 2);
    data.profiles['guard-level-2'].base.level = level;
    assert.throws(() => f.store.change({ version: f.store.version, data }), 'invalid level ' + String(level));
  }
  for (const base of [{ type: 'hero', id: 'hero', level: 2 }, { type: 'enemy', id: '90001', level: 2 }]) {
    const data = f.store.snapshot().data;
    data.profiles.other = { name: 'Other', base, parts: [] };
    assert.throws(() => f.store.validate(data), 'only allies support level-specific looks');
  }
  const data = f.store.snapshot().data;
  data.profiles.infantry = { name: 'Infantry', base: { type: 'ally', id: '90002', level: 2 }, parts: [] };
  assert.throws(() => f.store.validate(data), 'level must belong to the chosen ally');
  assert.deepEqual(fs.readFileSync(f.file), before);
  assert.equal(f.store.snapshot().dirty, false);
});

test('level assignments must match the profile ally and exact level while legacy defaults stay valid', t => {
  const f = fixture(t);
  assert.equal(f.store.validate(f.store.snapshot().data), true);
  const valid = f.store.snapshot().data;
  addLevel(valid, 2);
  assert.equal(f.store.validate(valid), true);
  for (const mutate of [
    data => { data.assignments['ally:90001:level:2'] = 'guard'; },
    data => { data.assignments['ally:90001:default'] = 'guard-level-2'; },
    data => { data.assignments['ally:90001:level:3'] = 'guard-level-2'; },
    data => { data.assignments['ally:90002:level:2'] = 'guard-level-2'; },
    data => { data.assignments['enemy:90001:level:2'] = 'guard-level-2'; },
    data => { data.assignments['ally:90001:level:02'] = 'guard-level-2'; }
  ]) {
    const data = structuredClone(valid);
    mutate(data);
    assert.throws(() => f.store.validate(data));
  }
});

test('editing a level draft preserves default and sibling looks until explicit Save and keeps unknown data', t => {
  const f = fixture(t), before = fs.readFileSync(f.file), config = fs.readFileSync(f.config);
  const defaultProfile = f.store.snapshot().data.profiles.guard;
  stage(f.store, data => { addLevel(data, 2).parts[0].x = 7.5; addLevel(data, 3).parts[0].x = 19; });
  const staged = f.store.snapshot();
  assert.equal(staged.dirty, true);
  assert.deepEqual(staged.data.profiles.guard, defaultProfile);
  assert.deepEqual(staged.savedData.profiles, { guard: defaultProfile });
  assert.equal(staged.data.assignments['ally:90001:default'], 'guard');
  assert.equal(staged.data.profiles['guard-level-2'].parts[0].x, 7.5);
  assert.equal(staged.data.profiles['guard-level-3'].parts[0].x, 19);
  assert.deepEqual(fs.readFileSync(f.file), before);
  assert.equal(fs.existsSync(f.home), false);

  const result = save(f), written = fs.readFileSync(f.file, 'utf8'), persisted = JSON.parse(written);
  assert.equal(result.result.saved, true);
  assert.deepEqual(result.result.files, ['assets/resources/characters/catalog.json']);
  assert.deepEqual(fs.readFileSync(path.resolve(f.dir, result.result.backup)), before);
  assert(written.includes('"value": 1.00'));
  assert.deepEqual(persisted.profiles.guard, defaultProfile);
  assert.equal(persisted.profiles['guard-level-2'].future.keep, 13);
  assert.equal(persisted.profiles['guard-level-2'].base.level, 2);
  assert.equal(persisted.assignments['ally:90001:level:3'], 'guard-level-3');
  assert.deepEqual(fs.readFileSync(f.config), config);
  const stamp = fs.statSync(f.file).mtimeMs;
  assert.equal(save(f).result.saved, false);
  assert.equal(fs.statSync(f.file).mtimeMs, stamp);
  assert.equal(new Service(f.dir).snapshot().data.assignments['ally:90001:level:2'], 'guard-level-2');
});

test('stale shared drafts and external saved edits cannot overwrite a level appearance or lose its draft', t => {
  const f = fixture(t), stale = f.store.snapshot();
  stage(f.store, data => { addLevel(data, 2).parts[0].x = 8; });
  assert.throws(() => f.store.change({ version: stale.version, data: stale.data }), /another window/);
  assert.throws(() => f.store.save({ version: stale.version }), /another window/);
  const external = JSON.parse(fs.readFileSync(f.file));
  external.future.value = 99;
  fs.writeFileSync(f.file, JSON.stringify(external));
  assert.throws(() => save(f), /outside this draft/);
  assert.equal(JSON.parse(fs.readFileSync(f.file)).future.value, 99);
  assert.equal(f.store.snapshot().data.profiles['guard-level-2'].parts[0].x, 8);
  assert.equal(f.store.snapshot().dirty, true);
  assert.equal(fs.existsSync(f.home), false);
});

test('discarding a level override restores the saved default without creating a level assignment', t => {
  const f = fixture(t), before = fs.readFileSync(f.file);
  stage(f.store, data => { addLevel(data, 2).name = 'Unsaved level look'; });
  const result = f.store.discard({ version: f.store.version });
  assert.equal(result.dirty, false);
  assert.equal(result.data.assignments['ally:90001:level:2'], undefined);
  assert.deepEqual(Object.keys(result.data.profiles), ['guard']);
  assert.deepEqual(fs.readFileSync(f.file), before);
  assert.equal(fs.existsSync(f.home), false);
});
