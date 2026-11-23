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
  assert.equal(f.input('Damage at splash edge (%)').value, '20');
  assert.equal(store.draftState().A.SoldierCfg[id].UnitAttack.splashFalloff, undefined);
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

test('on-hit effects are configurable together and save only on the selected unit attack', async () => {
  const { store, config } = isolatedProject();
  const before = fs.readFileSync(config), f = panelFixture(store), id = '91155';
  f.render('enemy:' + id);
  assert.equal(f.input('Effect'), undefined);
  await f.edit('Attack delivery', 'ranged');
  await f.edit('Attack pattern', 'splash');
  assert.equal(f.button('Add effect').disabled, true);
  await f.edit('Effect', 'slow');
  assert.equal(f.input('Movement slow (%)').value, '30');
  await f.edit('Movement slow (%)', 45);
  await f.edit('Slow duration (seconds)', 2.5);
  assert.equal(store.draftState().A.SoldierCfg[id].UnitAttack.onHit, undefined);
  await f.button('Add effect').onclick();
  assert.equal(f.input('Movement slow (%)').value, '45');
  assert.deepEqual(Array.from(f.input('Effect').children, option => option.value), ['', 'lifeSteal']);
  await f.edit('Effect', 'lifeSteal');
  await f.edit('Life steal (%)', 18);
  assert.equal(store.draftState().A.SoldierCfg[id].UnitAttack.onHit.lifeSteal, undefined);
  await f.button('Add effect').onclick();
  assert.equal(f.input('Life steal (%)').value, '18');
  assert.equal(f.input('Effect'), undefined);
  await assert.rejects(f.edit('Life steal (%)', 110), /between 0 and 100/);
  await f.edit('Attack delivery', 'melee');
  await f.edit('Attack pattern', 'single');
  assert.equal(f.input('Movement slow (%)').value, '45');
  await f.button('Remove life steal').onclick();
  assert.equal(f.input('Life steal (%)'), undefined);
  await f.edit('Effect', 'lifeSteal');
  await f.button('Add effect').onclick();
  await f.edit('Life steal (%)', 18);
  assert.deepEqual(fs.readFileSync(config), before);
  const expected = JSON.parse(before);
  expected.SoldierCfg[id].UnitAttack = {
    delivery: 'melee', pattern: 'single', onHit: { slow: { percent: .45, duration: 2.5 }, lifeSteal: { percent: .18 } }
  };
  const saved = store.save({ version: store.version });
  assert.equal(saved.result.saved, true, JSON.stringify(saved.issues));
  assert.deepEqual(JSON.parse(fs.readFileSync(config)), expected);
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

test('Units and Buildings share a draft that can save after Projectiles publishes a launch delay', () => {
  const f = isolatedProject(), service = new ProjectilesService(f.directory), id = 100248, key = 'enemy:' + id;
  service.focusUnit(key);
  const snapshot = service.snapshot(), flight = snapshot.data.assets.find(asset => asset.role === 'flight').id;
  snapshot.data.assignments[key] = { ...snapshot.data.assignments[key], flight };
  service.change({ version: snapshot.version, data: snapshot.data, timings: { ...snapshot.timings, [key]: .36 } });
  assert(service.save({ version: service.version }).result.files.includes(files.A));
  const published = fs.readFileSync(f.config, 'utf8'), catalog = fs.readFileSync(f.catalog);
  f.store.change({ version: f.store.version, edits: [
    { doc: 'A', path: ['SoldierCfg', String(id), 'AttackRange'], value: 200 },
    { doc: 'A', path: ['SoldierCfg', String(id), 'UnitAttack'], value: { delivery: 'ranged', pattern: 'single' } },
    { doc: 'A', path: ['BuildEnum', '2', 'levelList', 6, 'ModelOffset'], value: { x: -21.51, y: -13.41 } }
  ] });
  const result = f.store.save({ version: f.store.version }).result;
  assert(result.saved);
  assert.equal(fs.readFileSync(path.join(result.backup, files.A), 'utf8'), published);
  const config = JSON.parse(fs.readFileSync(f.config));
  assert.equal(config.SoldierCfg[id].AttackRange, 200);
  assert.equal(config.SoldierCfg[id].UnitAttack.delivery, 'ranged');
  assert.deepEqual(config.BuildEnum[2].levelList[6].ModelOffset, { x: -21.51, y: -13.41 });
  assert.equal(config.GameTools.unitProfiles.entries[id].stats.AttackRange, 200);
  assert.equal(config.GameTools.timings[key + ':default'].attack, .36);
  assert.equal(config.GameTools.unitProfiles.entries[id].timing.custom.attack, .36);
  assert.deepEqual(config.LevelCfg, JSON.parse(published).LevelCfg);
  assert.deepEqual(fs.readFileSync(f.catalog), catalog);
});

test('competing launch delay edits retain the Units draft and the published Projectiles value', () => {
  const f = isolatedProject(), service = new ProjectilesService(f.directory), id = 100248, key = 'enemy:' + id;
  service.focusUnit(key);
  const snapshot = service.snapshot();
  f.store.change({ version: f.store.version, edits: [
    { doc: 'overrides', path: ['timings', key + ':default'], value: { attack: .8 } }
  ] });
  service.change({ version: snapshot.version, data: snapshot.data, timings: { ...snapshot.timings, [key]: .36 } });
  service.save({ version: service.version });
  const before = fs.readFileSync(f.config), draft = f.store.draftState(), undo = f.store.undoStack.slice();
  assert.throws(() => f.store.save({ version: f.store.version }), /both changed.*timings/);
  assert.deepEqual(fs.readFileSync(f.config), before);
  assert.deepEqual(f.store.draftState(), draft);
  assert.deepEqual(f.store.undoStack, undo);
});

test('a wave shortcut selects and reveals the exact shared profile with existing filters', async () => {
  const f = panelFixture(isolatedProject().store), key = 'enemy:100248';
  const revealed = [];
  let selectedCard;
  f.panel._unitSidebar = {
    render(rows, selected) { selectedCard = rows.find(row => row.key === selected); },
    reveal(profile) {
      assert.equal(selectedCard.key, profile);
      revealed.push(profile);
    }
  };
  f.render('enemy:90001');
  f.panel.$search.value = 'Wolf';
  f.panel._unitPack = 'allies';
  await f.panel.run({ unitKey: key });
  assert.equal(f.panel._selected, key);
  assert.deepEqual(revealed, [key]);
  assert.equal(f.panel.$search.value, '');
  assert.equal(f.panel._unitPack, 'all');
  assert(f.input('Attack delivery'));
  assert.equal(f.store.changes().length, 0);
});

test('the Unit Editor saves a chosen default for the model and new waves without rewriting existing waves', async () => {
  const { store, config } = isolatedProject(), f = panelFixture(store), baseId = 91153;
  const Catalog = require('../worlds/unit-catalog');
  const before = fs.readFileSync(config), settings = store.draftState().overrides;
  const newDefault = settings.unitProfiles.families[baseId].profiles.skirmisher;
  f.render('enemy:' + baseId);
  const profile = f.input('Profile');
  assert.equal(profile.value, String(baseId));
  profile.value = String(newDefault);
  await profile.onchange();
  assert.equal(f.panel._selected, 'enemy:' + newDefault);
  assert.deepEqual(store.changes().map(change => [change.doc, change.path]), [
    ['overrides', ['unitProfiles', 'families', String(baseId), 'defaultProfileId']]
  ]);
  assert.deepEqual(fs.readFileSync(config), before);
  assert(store.save({ version: store.version }).result.saved);

  const latest = JSON.parse(fs.readFileSync(config));
  assert.deepEqual(latest.LevelCfg, JSON.parse(before).LevelCfg);
  assert.deepEqual(latest.SoldierCfg, JSON.parse(before).SoldierCfg);
  const group = Catalog.groups(Catalog.rows(latest, store.documents.catalog.data)).find(group => group.key === 'fighting:' + baseId);
  assert.equal(Catalog.firstProfile(group.units).id, newDefault);
  await f.panel._load(false);
  f.render('enemy:91001');
  f.panel.$list.children.find(card => card.textContent.includes('Ironclad Slime')).onclick();
  assert.equal(f.input('Profile').value, String(newDefault));
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
