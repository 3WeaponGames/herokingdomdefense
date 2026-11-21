'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { Store, files } = require('../lib/store');
const Schema = require('../lib/schema');
const temporary = require('./owned-temp');
const { ProjectilesService } = require('../../hkd-projectiles/service');

const root = path.resolve(__dirname, '../../..');
const projectileFile = 'assets/resources/projectiles/catalog.json';

function panelFixture(store) {
  const file = path.join(__dirname, 'building-panel.test.js');
  const source = fs.readFileSync(file, 'utf8').split("test('building catalog")[0]
    .replace('function fixture()', 'function fixture(storeForTest)')
    .replace('const store = new Store(project)', 'const store = storeForTest')
    .replace(".create('buildings')", ".create('units')")
    .replace("_kind: 'buildings'", "_kind: 'units'")
    .replace("else if (message === 'game-data-editor:asset-index')", "else if (message === 'game-data-editor:open-projectiles') callback(null,{opened:true}); else if (message === 'game-data-editor:asset-index')");
  const context = { require: createRequire(file), __dirname, module: { exports: {} }, setTimeout, clearTimeout };
  vm.runInNewContext(source + '\nmodule.exports={fixture,fields,all};', context);
  const { fixture, fields, all } = context.module.exports;
  const f = fixture(store);
  const input = label => fields(f.panel.$detail, label)[0];
  return { ...f, input, button: label => all(f.panel.$detail, n => n.tagName === 'button' && n.textContent === label)[0],
    async edit(label, value) {
      const field = input(label);
      assert(field, label);
      field.value = String(value);
      field.onchange();
      await f.panel._queue;
    } };
}

function isolatedProject() {
  const directory = temporary('hkd-unit-attack-');
  for (const file of new Set([...Object.values(files), projectileFile])) {
    const to = path.join(directory, file);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(root, file), to);
  }
  const store = new Store(directory, { backupRoot: path.join(directory, 'backups'), validators: [Schema.validate] });
  return { directory, store, config: path.join(directory, files.A), catalog: path.join(directory, projectileFile) };
}

test('Units shows relevant attack fields, opens Projectiles on the ranged draft, and saves just this unit', async () => {
  const { store, config } = isolatedProject();
  const before = fs.readFileSync(config), f = panelFixture(store);
  const id = '91090', key = 'enemy:' + id;
  const pathToUnit = ['SoldierCfg', id, 'UnitAttack'];
  f.render(key);
  assert.equal(f.input('Attack delivery').value, 'original');
  assert.equal(f.button('Open Projectile editor'), undefined);
  assert.equal(store.changes().length, 0);
  await f.edit('Attack delivery', 'melee');
  assert.deepEqual(Array.from(f.input('Attack pattern').children, option => option.value), ['single', 'splash']);
  await f.edit('Attack pattern', 'splash');
  await f.edit('Splash radius', 110);
  await f.edit('Damage at splash edge (%)', 35);
  assert.equal(store.draftState().A.SoldierCfg[id].UnitAttack.splashFalloff, .35);
  await f.edit('Attack delivery', 'ranged');
  assert.deepEqual(Array.from(f.input('Attack pattern').children, option => option.value), ['single', 'splash', 'volley', 'piercing', 'chain']);
  await f.button('Open Projectile editor').onclick();
  assert.equal(f.messages.find(message => message.message === 'game-data-editor:open-projectiles').request.key, key);
  await f.edit('Attack pattern', 'volley');
  await f.edit('Projectiles per attack', 3);
  assert.equal(f.input('Splash radius'), undefined);
  await f.edit('Attack pattern', 'piercing');
  await f.edit('Targets per projectile', 4);
  await f.edit('Attack pattern', 'chain');
  await f.edit('Maximum chain hits', 4);
  await f.edit('Chain jump range', 170);
  await f.edit('Damage lost per jump (%)', 20);
  assert.deepEqual(fs.readFileSync(config), before);
  assert.deepEqual(store.changes().map(change => change.path), [pathToUnit]);
  const expected = { delivery: 'ranged', pattern: 'chain', splashRadius: 110, splashFalloff: .35, shotsPerVolley: 3, pierceTargets: 4, chainHits: 4, chainRange: 170, chainDamageLoss: .2 };
  assert.deepEqual(store.draftState().A.SoldierCfg[id].UnitAttack, expected);
  const saved = store.save({ version: store.version });
  assert.equal(saved.result.saved, true, JSON.stringify(saved.issues));
  const exact = JSON.parse(before);
  exact.SoldierCfg[id].UnitAttack = expected;
  assert.deepEqual(JSON.parse(fs.readFileSync(config)), exact);
});

test('existing melee units can receive a projectile draft while Units saves ranged delivery separately', () => {
  const f = isolatedProject(), service = new ProjectilesService(f.directory), key = 'enemy:90001';
  const initialConfig = fs.readFileSync(f.config), initialCatalog = fs.readFileSync(f.catalog);
  assert(!service.units().some(unit => unit.key === key));
  assert.equal(service.focusUnit(key), key);
  const snapshot = service.snapshot();
  assert(snapshot.units.some(unit => unit.key === key));
  assert.equal(snapshot.dirty, false);
  assert.deepEqual(fs.readFileSync(f.config), initialConfig);
  assert.deepEqual(fs.readFileSync(f.catalog), initialCatalog);
  const flight = snapshot.data.assets.find(asset => asset.role === 'flight').id;
  snapshot.data.assignments[key] = { ...snapshot.data.assignments[key], flight };
  service.change({ version: snapshot.version, data: snapshot.data });
  f.store.change({ version: f.store.version, edits: [{ doc: 'A', path: ['SoldierCfg', '90001', 'UnitAttack'], value: { delivery: 'ranged', pattern: 'single' } }] });
  assert(f.store.save({ version: f.store.version }).result.saved);
  const publishedConfig = fs.readFileSync(f.config);
  const saved = service.save({ version: service.version });
  assert.deepEqual(saved.result.files, [projectileFile]);
  assert.deepEqual(fs.readFileSync(f.config), publishedConfig);
  assert.equal(JSON.parse(fs.readFileSync(f.catalog)).assignments[key].flight, flight);
  assert(new ProjectilesService(f.directory).units().some(unit => unit.key === key));
});

test('projectile focus opens the panel and delivers the selected unit once', async () => {
  const f = isolatedProject(), plugin = require('../../hkd-projectiles/main');
  const previous = global.Editor, notifications = [];
  global.Editor = {
    Project: { path: f.directory }, Panel: { open: id => notifications.push(id) },
    Ipc: { sendToAll: (name, message) => notifications.push([name, message.sequence]) }, warn() {}
  };
  function call(name, data) {
    return new Promise((resolve, reject) => plugin.messages[name]({ reply: (error, value) => error ? reject(Error(error)) : resolve(value) }, data));
  }
  try {
    const focused = await call('focus', { key: 'ally:90001' });
    assert.equal(focused.target.key, 'ally:90001');
    assert.deepEqual(notifications, ['hkd-projectiles', ['hkd-projectiles:focus-available', focused.target.sequence]]);
    const snapshot = await call('load');
    assert.equal(snapshot.focus.key, focused.target.key);
    assert(snapshot.units.some(unit => unit.key === focused.target.key));
    assert.equal(await call('take-focus'), null);
    assert.equal(snapshot.dirty, false);
  } finally {
    plugin.unload();
    global.Editor = previous;
  }
});
