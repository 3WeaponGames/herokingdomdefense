'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createRequire } = require('node:module');
const Catalog = require('../lib/catalog');
const mainFile = path.join(__dirname, '../main.js'), panelFile = path.join(__dirname, '../panel/index.js');
function catalog(text = 'Initial') {
  return { version: 1, defaultLanguage: 'en', languages: [{ code: 'en', nameKey: 'language.en' }],
    entries: { 'language.en': { en: 'English' }, greeting: { en: text, extension: { retained: [1, true] } } }, future: { keep: 'exact' } };
}
function fixture() {
  const root = path.resolve('/inert-localization-project'), file = path.join(root, 'assets/resources/localization/catalog.json');
  const original = JSON.stringify(catalog(), null, 2) + '\n', files = new Map([[file, original]]);
  const storage = new Map(), refreshes = [], compiles = [], timers = new Map(), heldLoads = [], heldErrors = [], statuses = [], requests = [];
  let writes = 0, draftWrites = 0, nextTimer = 0, definition, main, holdLoads = false, holdErrors = false;
  const memoryFS = {
    readFileSync(name) { if (!files.has(name)) throw Error('Missing inert file: ' + name); return files.get(name); },
    writeFileSync(name, bytes) { files.set(name, String(bytes)); writes++; },
    mkdirSync() {}, existsSync: name => files.has(name),
    renameSync(from, to) { files.set(to, files.get(from)); files.delete(from); }, unlinkSync: name => files.delete(name)
  };
  const schedule = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; };
  const Editor = { Project: { path: root }, Panel: { extend(value) { definition = value; } },
    assetdb: { refresh(url, callback) { assert.equal(url, 'db://assets/resources/localization'); refreshes.push(callback); } },
    Ipc: { sendToMain(message, ...args) {
      const callback = args.pop(), action = message.split(':')[1];
      requests.push(action);
      const event = { reply(error, data) {
        const reply = () => callback(error, data);
        if (action === 'load' && holdLoads) heldLoads.push(reply);
        else if (error && holdErrors) heldErrors.push(reply);
        else reply();
      } };
      main.messages[action](event, ...args);
    } }
  };
  const mainRequire = createRequire(mainFile), panelRequire = createRequire(panelFile);
  const mainContext = { module: { exports: {} }, Editor, console, setTimeout: schedule, clearTimeout: id => timers.delete(id),
    require(name) {
      if (name === 'fs') return memoryFS;
      if (name === './lib/art-compiler') return { compile: async value => { compiles.push(Catalog.clone(value)); return { count: 0, pending: [] }; } };
      return mainRequire(name);
    } };
  vm.runInNewContext(fs.readFileSync(mainFile, 'utf8'), mainContext, { filename: mainFile }); main = mainContext.module.exports;
  const panelContext = { Editor, console, __dirname: path.dirname(panelFile), window: { confirm: () => true },
    setTimeout: schedule, clearTimeout: id => timers.delete(id),
    localStorage: { getItem: key => storage.get(key), setItem(key, value) { draftWrites++; storage.set(key, value); }, removeItem: key => storage.delete(key) },
    require(name) {
      if (name !== 'fs') return panelRequire(name);
      return { readFileSync(file, ...args) { return files.has(file) ? files.get(file) : fs.readFileSync(file, ...args); } };
    } };
  vm.runInNewContext(fs.readFileSync(panelFile, 'utf8'), panelContext, { filename: panelFile });
  function newPanel() {
    return Object.assign(Object.create(definition), { $save: { disabled: true }, $draftInfo: {},
      _populateLocales() {}, _render() {}, _subtitle() {}, _validate() { return []; },
      _status(message, error) { statuses.push({ message, error }); } });
  }
  const panel = newPanel();
  return { panel, newPanel, file, original, files, storage, refreshes, compiles, statuses, requests, main,
    holdLoads(value) { holdLoads = value; }, holdErrors(value) { holdErrors = value; }, heldLoads, heldErrors,
    writes: () => writes, draftWrites: () => draftWrites,
    edit(text, target = panel) { target._catalog.entries.greeting.en = text; target._changed(); },
    draft: () => JSON.parse(storage.get(panel._draftKey)),
    disk: () => main._read(),
    flushDrafts() { for (const [id, timer] of timers) if (timer.delay === 500) { timers.delete(id); timer.callback(); } },
    async flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
  };
}

test('a rejected first artwork binding leaves the optional images table absent on an unrelated save', async () => {
  const h = fixture(), p = h.panel;
  await p._load();
  assert.equal(Object.hasOwn(p._catalog, 'images'), false);
  p.$imageNewUuid = { value: 'example-frame' };
  p.$keyName = { value: 'missing.translation' };
  p.$search = { value: '' };
  p._addImage();
  assert.match(h.statuses.at(-1).message, /Add and translate the key first/);
  assert.equal(Object.hasOwn(p._catalog, 'images'), false);
  assert.equal(p._dirty, false);
  assert.equal(h.writes(), 0);

  h.edit('New greeting');
  const translation = p._save(); await h.flush(); h.refreshes[0](); await translation;
  assert.equal(Object.hasOwn(h.disk().catalog, 'images'), false);
  assert.equal(h.disk().catalog.entries.greeting.en, 'New greeting');

  p.$keyName.value = 'greeting';
  p._addImage();
  assert.equal(p._dirty, true);
  assert.equal(Object.hasOwn(h.disk().catalog, 'images'), false);
  const binding = p._save(); await h.flush(); h.refreshes[1](); await binding;
  assert.deepEqual(JSON.parse(h.files.get(h.file)).images, {
    'example-frame': { key: 'greeting', mode: 'replace', artwork: {} }
  });
});

test('actual Save/import acknowledgements cannot regress a newer loaded/saved revision or its recovery draft', async () => {
  const h = fixture(), p = h.panel; await p._load();
  h.edit('B'); const first = p._save(); await h.flush();
  await p._load(); h.edit('C'); const second = p._save(); await h.flush();
  assert.deepEqual(h.compiles.map(x => x.entries.greeting.en), ['B', 'C']);
  h.refreshes[1](); await second; const revision = p._revision;
  h.edit('D'); h.flushDrafts(); const recovery = h.storage.get(p._draftKey), statusCount = h.statuses.length;
  h.refreshes[0](); await first;
  assert.equal(p._revision, revision); assert.equal(h.disk().revision, revision); assert.equal(p._dirty, true);
  assert.equal(h.storage.get(p._draftKey), recovery); assert.equal(h.statuses.length, statusCount);
  const reopened = h.newPanel(); await reopened._load(); reopened._restoreDraft();
  assert.equal(reopened._catalog.entries.greeting.en, 'D'); assert.equal(reopened._dirty, true);
  assert.equal(reopened._revision, revision); assert.equal(h.disk().catalog.entries.greeting.en, 'C');
});

test('single Save retains edits typed during import and adopts committed revision even when import reports a warning', async () => {
  for (const importFailure of [false, true]) {
    const h = fixture(), p = h.panel; await p._load(); h.edit('B'); const saved = p._save(); await h.flush();
    h.edit('D'); h.refreshes[0](importFailure ? Error('inert import failure') : undefined); await saved;
    assert.equal(p._revision, h.disk().revision); assert.equal(p._dirty, true); assert.equal(p.$save.disabled, false);
    assert.equal(h.draft().catalog.entries.greeting.en, 'D'); assert.equal(h.draft().revision, h.disk().revision);
    assert.equal(JSON.stringify(h.disk().catalog.future), JSON.stringify(catalog().future));
    assert.deepEqual(h.draft().catalog.entries.greeting.extension, catalog().entries.greeting.extension);
    if (importFailure) assert.match(h.statuses.at(-1).message, /import failure/);
  }
});

test('failed and skipped Reloads do not strand a valid pending Save acknowledgement', async () => {
  for (const failure of [false, true]) {
    const h = fixture(), p = h.panel; await p._load(); h.edit('B'); const saved = p._save(); await h.flush();
    h.holdLoads(true); if (failure) h.files.delete(h.file); const loaded = p._load();
    if (failure) h.files.set(h.file, JSON.stringify(catalog('B'), null, 2) + '\n');
    h.edit('D'); h.heldLoads[0](); await loaded; h.refreshes[0](); await saved;
    assert.equal(p._revision, h.disk().revision); assert.equal(p._dirty, true); assert.equal(p._catalog.entries.greeting.en, 'D');
    assert.equal(h.draft().revision, h.disk().revision);
  }
});

test('a Load snapshot or failure held before Save completion cannot replace the newly adopted revision', async () => {
  for (const failure of [false, true]) {
    const h = fixture(), p = h.panel; await p._load(); h.edit('B');
    h.holdLoads(true); if (failure) h.files.delete(h.file); const loaded = p._load();
    if (failure) h.files.set(h.file, h.original);
    const saved = p._save(); await h.flush(); h.refreshes[0](); await saved;
    const revision = p._revision, statusCount = h.statuses.length; h.heldLoads[0](); await loaded;
    assert.equal(p._revision, revision); assert.equal(p._catalog.entries.greeting.en, 'B'); assert.equal(p._dirty, false);
    assert.equal(p.$save.disabled, true); assert.equal(h.statuses.length, statusCount);
  }
});

test('an ABA disk revision cannot make an old Save acknowledgement current again', async () => {
  const h = fixture(), p = h.panel; await p._load(); const initialRevision = p._revision;
  h.edit('B'); const saved = p._save(); await h.flush();
  h.files.set(h.file, h.original); await p._load(); assert.equal(p._revision, initialRevision);
  const statusCount = h.statuses.length; h.refreshes[0](); await saved;
  assert.equal(p._revision, initialRevision); assert.equal(p._catalog.entries.greeting.en, 'Initial');
  assert.equal(p._dirty, false); assert.equal(h.statuses.length, statusCount);
});

test('a failed Save stays recoverable but obsolete Save errors cannot alter a later loaded draft', async () => {
  const h = fixture(), p = h.panel; await p._load(); h.edit('B');
  h.files.set(h.file, JSON.stringify(catalog('External'), null, 2) + '\n');
  await p._save(); h.flushDrafts(); assert.equal(p._dirty, true); assert.equal(p.$save.disabled, false);
  assert.equal(h.draft().catalog.entries.greeting.en, 'B'); assert.match(h.statuses.at(-1).message, /changed on disk/);
  h.holdErrors(true); const failed = p._save(); await p._load(); h.edit('D'); h.flushDrafts();
  const revision = p._revision, recovery = h.storage.get(p._draftKey), statusCount = h.statuses.length;
  h.heldErrors[0](); await failed;
  assert.equal(p._revision, revision); assert.equal(p._dirty, true); assert.equal(h.storage.get(p._draftKey), recovery);
  assert.equal(h.statuses.length, statusCount); assert.equal(h.disk().catalog.entries.greeting.en, 'External');
});

test('closing makes pending Save success/error callbacks inert and preserves the owned draft', async () => {
  for (const failure of [false, true]) {
    const h = fixture(), p = h.panel; await p._load(); h.edit('B');
    if (failure) { h.files.set(h.file, JSON.stringify(catalog('External'))); h.holdErrors(true); }
    const saved = p._save(); await h.flush(); h.edit('D'); p.close();
    const recovery = h.storage.get(p._draftKey), statusCount = h.statuses.length, writes = h.draftWrites();
    if (failure) h.heldErrors[0](); else h.refreshes[0](); await saved; h.flushDrafts();
    assert.equal(h.storage.get(p._draftKey), recovery); assert.equal(h.statuses.length, statusCount); assert.equal(h.draftWrites(), writes);
    assert.equal(h.draft().catalog.entries.greeting.en, 'D');
  }
});

test('no-change Save performs no file/import/recovery writes and retains current revision', async () => {
  const h = fixture(), p = h.panel; await p._load(); const revision = p._revision;
  await p._save(); assert.equal(p._revision, revision); assert.equal(p._dirty, false);
  assert.equal(h.writes(), 0); assert.equal(h.compiles.length, 0); assert.equal(h.refreshes.length, 0); assert.equal(h.draftWrites(), 0);
});

test('unchanged panel actions and clean Save leave the offered recovery available after reopening', async () => {
  const h = fixture(), authored = catalog();
  authored.artTemplates = { badge: { width: 12, height: 12, regions: [] } };
  authored.labelStyles = { greeting: { en: { width: 20 } } };
  for (const entry of Object.values(authored.entries)) entry.context = '';
  const diskBytes = JSON.stringify(authored, null, 2) + '\n';
  h.files.set(h.file, diskBytes); await h.panel._load();
  h.edit('Recover this work'); h.panel.close();
  const p = h.newPanel(); await p._load();
  const draft = h.storage.get(p._draftKey), writes = h.draftWrites(), revision = p._revision;
  function checkRecovery() {
    h.flushDrafts();
    assert.equal(p._dirty, false); assert.equal(p.$save.disabled, true);
    assert.equal(p.$draftInfo.hidden, false); assert.equal(h.storage.get(p._draftKey), draft);
    assert.equal(h.draftWrites(), writes); assert.equal(p._revision, revision);
    assert.equal(h.requests.filter(action => action === 'save').length, 0);
    assert.equal(h.writes(), 0); assert.equal(h.refreshes.length, 0); assert.equal(h.compiles.length, 0);
  }
  p._template = 'badge'; p._renderTemplate = () => {};
  p.$templateJson = { value: '{"regions":[],"height":12,"width":12}' };
  p._applyTemplate(); checkRecovery();
  p.$keyName = { value: 'greeting' }; p.$search = {}; p._renderLayoutList = () => {};
  p._addLayout(); assert.equal(p._layout, 'greeting'); checkRecovery();
  h.files.set('inert.csv', Catalog.toCSV(authored)); p.$importFile = { files: [{ path: 'inert.csv' }] };
  p._import(); checkRecovery();
  await p._save(); checkRecovery();
  assert.equal(h.files.get(h.file), diskBytes);
  p._restoreDraft(); assert.equal(p._catalog.entries.greeting.en, 'Recover this work');
  const saved = p._save(); await h.flush(); h.refreshes[0](); await saved;
  assert.equal(h.disk().catalog.entries.greeting.en, 'Recover this work');
  assert.equal(h.storage.has(p._draftKey), false);
});

test('the unchanged shipped CSV round trip produces no draft, backup, revision change, asset import or write', async () => {
  const h = fixture(), p = h.panel;
  const original = fs.readFileSync(path.resolve(__dirname, '../../../assets/resources/localization/catalog.json'), 'utf8');
  h.files.set(h.file, original); await p._load();
  const revision = p._revision, before = Catalog.clone(p._catalog);
  h.files.set('shipped.csv', Catalog.toCSV(before)); p.$importFile = { files: [{ path: 'shipped.csv' }] };
  p._import(); assert.deepEqual(Catalog.clone(p._catalog), before); assert.equal(p._dirty, false);
  await p._save(); h.flushDrafts();
  const direct = h.main._backupAndSave(Catalog.mergeCSV(before, h.files.get('shipped.csv')).catalog, revision);
  assert.equal(direct.noChanges, true); assert.equal(direct.revision, revision); assert.equal(p._revision, revision);
  assert.equal(h.files.get(h.file), original); assert.equal(h.files.size, 2); assert.equal(h.writes(), 0);
  assert.equal(h.draftWrites(), 0); assert.equal(h.refreshes.length, 0); assert.equal(h.compiles.length, 0);
});

test('a changed template, new layout and translated CSV remain staged until an explicit Save', async () => {
  const h = fixture(), p = h.panel, authored = catalog();
  authored.artTemplates = { badge: { width: 12, height: 12, regions: [] } };
  const before = JSON.stringify(authored, null, 2) + '\n';
  h.files.set(h.file, before); await p._load();
  p._template = 'badge'; p._renderTemplate = () => {};
  p.$templateJson = { value: '{"width":24,"height":12,"regions":[]}' };
  p._applyTemplate(); assert.equal(p._catalog.artTemplates.badge.width, 24);
  p.$keyName = { value: 'greeting' }; p.$search = {}; p._renderLayoutList = () => {};
  p._addLayout(); assert.ok(Object.hasOwn(p._catalog.labelStyles, 'greeting'));
  h.files.set('edit.csv', 'key,en\ngreeting,Translated'); p.$importFile = { files: [{ path: 'edit.csv' }] };
  p._import(); assert.equal(p._catalog.entries.greeting.en, 'Translated');
  assert.deepEqual(Catalog.clone(p._catalog.entries.greeting.extension), { retained: [1, true] });
  assert.equal(p._dirty, true); assert.equal(h.writes(), 0); assert.equal(h.files.get(h.file), before);
  const saved = p._save(); await h.flush(); h.refreshes[0](); await saved;
  assert.equal(p._dirty, false); assert.equal(h.disk().catalog.artTemplates.badge.width, 24);
  assert.ok(Object.hasOwn(h.disk().catalog.labelStyles, 'greeting')); assert.equal(h.disk().catalog.entries.greeting.en, 'Translated');
  assert.equal(h.compiles.length, 1); assert.equal(h.refreshes.length, 1);
  const backup = [...h.files.keys()].find(file => file.includes('localization-backups'));
  assert.equal(h.files.get(backup), before);
});

test('closing during import recovers newer edits only against the exact submitted disk snapshot', async () => {
  for (const changedOnDisk of [false, true]) {
    const h = fixture(), p = h.panel; await p._load(); h.edit('B'); const saved = p._save(); await h.flush();
    h.edit('D'); p.close();
    assert.equal(h.draft().pendingSave.catalog.entries.greeting.en, 'B');
    assert.equal(h.draft().pendingSave.revision, h.draft().revision);
    if (changedOnDisk) {
      const external = catalog('B'); external.future.keep = 'another author changed metadata';
      h.files.set(h.file, JSON.stringify(external, null, 2) + '\n');
    }
    const reopened = h.newPanel(); await reopened._load(); const recovery = h.storage.get(p._draftKey);
    // A closed panel cannot overwrite even a newer panel's edits or storage.
    h.refreshes[0](); await saved; assert.equal(h.storage.get(p._draftKey), recovery);
    reopened._restoreDraft();
    if (changedOnDisk) {
      assert.equal(reopened._catalog.entries.greeting.en, 'B'); assert.equal(reopened._dirty, false);
      assert.match(h.statuses.at(-1).message, /older disk revision/);
      assert.equal(h.storage.get(p._draftKey), recovery);
    } else {
      assert.equal(reopened._catalog.entries.greeting.en, 'D'); assert.equal(reopened._dirty, true);
      h.flushDrafts(); assert.equal(h.draft().revision, h.disk().revision); assert.equal(h.draft().pendingSave, undefined);
      const next = reopened._save(); await h.flush(); h.refreshes[1](); await next;
      assert.equal(h.disk().catalog.entries.greeting.en, 'D'); assert.equal(reopened._dirty, false);
    }
  }
});

test('pending-save recovery matches the loaded disk baseline, never later editable panel contents', async () => {
  const h = fixture(), p = h.panel; await p._load(); h.edit('B'); const saved = p._save(); await h.flush(); h.edit('D'); p.close();
  h.files.set(h.file, JSON.stringify(catalog('External'), null, 2) + '\n');
  const reopened = h.newPanel(); await reopened._load(); h.edit('B', reopened); reopened._restoreDraft();
  assert.equal(reopened._catalog.entries.greeting.en, 'B'); assert.match(h.statuses.at(-1).message, /older disk revision/);
  h.refreshes[0](); await saved;
});

test('overlapping Save requests share one pending snapshot while typing and a later explicit save remain available', async () => {
  const h = fixture(), p = h.panel; await p._load(); h.edit('B'); const first = p._save(); await h.flush();
  h.edit('D'); assert.equal(p.$save.disabled, true); await p._save();
  assert.equal(h.compiles.length, 1); h.flushDrafts(); assert.equal(h.draft().pendingSave.catalog.entries.greeting.en, 'B');
  h.refreshes[0](); await first; assert.equal(p.$save.disabled, false); assert.equal(h.draft().pendingSave, undefined);
  const second = p._save(); await h.flush(); h.refreshes[1](); await second;
  assert.equal(h.disk().catalog.entries.greeting.en, 'D'); assert.equal(p._dirty, false);
});
