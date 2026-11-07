'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createRequire } = require('node:module');
const Catalog = require('../lib/catalog');
const file = path.join(__dirname, '../panel/index.js');
function catalog() {
  return { version: 1, defaultLanguage: 'en', languages: [{ code: 'en', nameKey: 'language.en' }],
    entries: { 'language.en': { en: 'English', fr: 'Anglais' }, greeting: { en: 'Hello', fr: 'Bonjour', metadata: { keep: [1, true] } }, absent: { en: 'Goodbye' } },
    futureSection: { exact: ['unchanged'] } };
}
function fixture() {
  const requests = [], storage = new Map(), timers = new Map(), statuses = [];
  let definition, nextTimer = 0, writes = 0;
  const requireFromPanel = createRequire(file);
  const context = { __dirname: path.dirname(file), console, window: { confirm: () => true },
    require(name) { return name === 'fs' ? { readFileSync: fs.readFileSync, writeFileSync() { throw Error('Panel must not save on browse/edit'); } } : requireFromPanel(name); },
    localStorage: { getItem: key => storage.get(key), setItem(key, value) { writes++; storage.set(key, value); }, removeItem: key => storage.delete(key) },
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    Editor: { Panel: { extend(value) { definition = value; } }, Ipc: { sendToMain(...args) { requests.push({ message: args[0], args: args.slice(1, -1), reply: args.at(-1) }); } } } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  const panel = Object.assign(Object.create(definition), { _catalog: catalog(), _revision: 'r1', _file: '/inert/assets/resources/localization/catalog.json',
    _draftKey: 'inert-draft', _dirty: false, $save: {}, $draftInfo: {}, $languageCode: { value: 'fr' }, $languageName: { value: 'Français' }, $target: {},
    _status(message) { statuses.push(message); }, _subtitle() {}, _populateLocales() {}, _render() {}, _validate() { return []; } });
  return { panel, requests, storage, statuses, writes: () => writes,
    flushDrafts() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); },
    reply(index, value = catalog(), revision = 'r2') { requests[index].reply(null, { catalog: value, revision, file: panel._file }); } };
}

test('adding a locale preserves its existing text and unknown metadata without saving', () => {
  const h = fixture(), before = Catalog.clone(h.panel._catalog);
  Catalog.structure(before); h.panel._addLanguage(); Catalog.structure(h.panel._catalog);
  assert.equal(h.panel._catalog.entries.greeting.fr, 'Bonjour');
  assert.equal(h.panel._catalog.entries['language.en'].fr, 'Anglais');
  assert.equal(h.panel._catalog.entries.absent.fr, '');
  assert.deepEqual(h.panel._catalog.entries.greeting.metadata, before.entries.greeting.metadata);
  assert.deepEqual(h.panel._catalog.futureSection, before.futureSection);
  assert.equal(h.panel._catalog.entries['language.fr'].fr, 'Français');
  assert.equal(h.panel._dirty, true); assert.equal(h.requests.length, 0); assert.equal(h.writes(), 0);
});

test('a locale collision with non-text extension data rejects before changing any draft field', () => {
  for (const value of [{ preserve: true }, null, 7, ['original']]) {
    const h = fixture(); h.panel._catalog.entries.absent.fr = value;
    const before = JSON.stringify(h.panel._catalog); Catalog.structure(h.panel._catalog);
    h.panel._addLanguage();
    assert.equal(JSON.stringify(h.panel._catalog), before); assert.equal(h.panel._dirty, false);
    assert.equal(h.panel.$languageCode.value, 'fr'); assert.equal(h.requests.length, 0); assert.equal(h.writes(), 0);
    assert.match(h.statuses.at(-1), /non-text metadata/);
  }
});

test('reload retains edits typed after its request and saves their recovery draft with the original revision', async () => {
  const h = fixture(), pending = h.panel._load();
  h.panel._catalog.entries.greeting.en = 'Typed while loading'; h.panel._changed();
  h.reply(0); await pending; h.flushDrafts();
  assert.equal(h.panel._catalog.entries.greeting.en, 'Typed while loading');
  assert.equal(h.panel._revision, 'r1'); assert.equal(h.panel._dirty, true); assert.equal(h.panel.$save.disabled, false);
  assert.match(h.statuses.at(-1), /draft changed/);
  const draft = JSON.parse(h.storage.get('inert-draft'));
  assert.equal(draft.catalog.entries.greeting.en, 'Typed while loading'); assert.equal(draft.revision, 'r1');
  assert.equal(h.requests.length, 1, 'reload never submits a save');
});

test('only the newest reload may adopt a catalog, including out-of-order replies', async () => {
  for (const newestFirst of [false, true]) {
    const h = fixture(), first = h.panel._load(), second = h.panel._load();
    const older = catalog(), newer = catalog(); older.entries.greeting.en = 'Older'; newer.entries.greeting.en = 'Newer';
    if (newestFirst) { h.reply(1, newer, 'new'); await second; h.reply(0, older, 'old'); }
    else { h.reply(0, older, 'old'); await first; assert.equal(h.panel._revision, 'r1'); h.reply(1, newer, 'new'); }
    await Promise.all([first, second]);
    assert.equal(h.panel._catalog.entries.greeting.en, 'Newer'); assert.equal(h.panel._revision, 'new'); assert.equal(h.panel._dirty, false);
    assert.equal(h.writes(), 0);
  }
});

test('closing a panel preserves its draft and makes late reload success or failure inert', async () => {
  for (const fails of [false, true]) {
    const h = fixture(), pending = h.panel._load();
    h.panel._catalog.entries.greeting.en = 'Last typed draft'; h.panel._changed(); h.panel.close();
    const statusCount = h.statuses.length;
    if (fails) h.requests[0].reply('load failure'); else h.reply(0);
    await pending; h.flushDrafts();
    assert.equal(h.panel._catalog.entries.greeting.en, 'Last typed draft'); assert.equal(h.panel._revision, 'r1');
    assert.equal(h.statuses.length, statusCount); assert.equal(h.writes(), 1);
    assert.equal(JSON.parse(h.storage.get('inert-draft')).catalog.entries.greeting.en, 'Last typed draft');
  }
});

test('normal reload performs no draft/save writes; a failed reload leaves an existing draft saveable', async () => {
  const clean = fixture(), loaded = clean.panel._load(); clean.reply(0); await loaded;
  assert.equal(clean.panel._revision, 'r2'); assert.equal(clean.panel._dirty, false); assert.equal(clean.writes(), 0);
  const dirty = fixture(); dirty.panel._changed(); const failed = dirty.panel._load();
  dirty.requests[0].reply('inert load failure'); await failed;
  assert.equal(dirty.panel._revision, 'r1'); assert.equal(dirty.panel._dirty, true); assert.equal(dirty.panel.$save.disabled, false);
  assert.match(dirty.statuses.at(-1), /load failure/);
});

test('edits during an explicit save remain dirty and recoverable after that save completes', async () => {
  const h = fixture(); h.panel._catalog.entries.greeting.en = 'Submitted'; h.panel._changed();
  const saving = h.panel._save(); assert.equal(h.requests[0].args[0].entries.greeting.en, 'Submitted');
  h.panel._catalog.entries.greeting.en = 'Later unsaved edit'; h.panel._changed();
  h.requests[0].reply(null, { revision: 'r2', noChanges: false, saved: true, artwork: { count: 0 } }); await saving;
  assert.equal(h.panel._dirty, true); assert.equal(h.panel._revision, 'r2');
  assert.equal(JSON.parse(h.storage.get('inert-draft')).catalog.entries.greeting.en, 'Later unsaved edit');
});
