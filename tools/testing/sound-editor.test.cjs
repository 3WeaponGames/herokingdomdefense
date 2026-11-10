'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const root = path.resolve(__dirname, '../..'), folder = path.join(root, 'packages/hkd-sounds');
const Catalog = require(path.join(folder, 'catalog')), Model = require(path.join(folder, 'model')), { Player } = require(path.join(folder, 'player'));
const { SoundService } = require(path.join(folder, 'service')), { commit } = require('../../packages/hkd-characters/lib/asset-transaction');
const baseline = require(path.join(folder, 'original-audio.json'));
function fixture(t, text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hkd-sound-editor-'));
  t.after(() => { assert.equal(path.dirname(dir), os.tmpdir()); assert(path.basename(dir).startsWith('hkd-sound-editor-')); fs.rmSync(dir, { recursive: true, force: true }); });
  const asset = 'assets/KinghtFallAudio/button_click.mp3', file = path.join(dir, asset);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.copyFileSync(path.join(root, asset), file); fs.copyFileSync(path.join(root, asset + '.meta'), file + '.meta');
  fs.writeFileSync(path.join(dir, 'assets/guard.json'), '{"progress":123,"unknown":1.00}');
  const review = path.join(dir, 'authoring/audio-review.json');
  if (text) { fs.mkdirSync(path.dirname(review), { recursive: true }); fs.writeFileSync(review, text); }
  return { dir, file, review, service: new SoundService(dir), text };
}
test('the sound catalog finds every current audio asset, including all eight horse biomes, music and voices', () => {
  const indexed = Catalog.index(root), files = [];
  function walk(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, item.name); if (item.isDirectory()) walk(p); else if (Catalog.AUDIO.test(item.name)) files.push(path.relative(root, p).split(path.sep).join('/')); } }
  walk(path.join(root, 'assets'));
  assert.deepEqual(indexed.items.map(item => item.file).sort(), files.sort()); assert.equal(indexed.warnings.length, 0);
  assert.equal(new Set(indexed.items.map(item => item.id)).size, files.length);
  assert.deepEqual(indexed.items.filter(item => item.category === 'horses').map(item => item.biome).sort(), Catalog.BIOMES.slice().sort());
  assert(indexed.items.some(item => item.kind === 'music')); assert(indexed.items.some(item => item.kind === 'voice' && item.tier === 3));
  assert(indexed.items.filter(item => item.generated).every(item => item.origin === 'new' && item.category !== 'other'));
});
test('Original means the actual initial bytes; replaced original paths and later additions are New', t => {
  const f = fixture(t); let entry = f.service.catalog.items[0]; assert.equal(entry.origin, 'original'); assert(baseline.files[entry.file]);
  fs.appendFileSync(f.file, 'modified'); entry = f.service.load().items[0]; assert.equal(entry.origin, 'new'); assert.equal(entry.replacesOriginal, true);
  const fresh = path.join(f.dir, 'assets/later.wav'); fs.writeFileSync(fresh, 'future sound');
  assert.equal(f.service.load().items.find(item => item.file === 'assets/later.wav').origin, 'new');
});
test('opening, refreshing and unchanged Save perform no writes, including mark-then-unmark', t => {
  const f = fixture(t), before = fs.readFileSync(path.join(f.dir, 'assets/guard.json')); let writes = 0;
  f.service.commit = () => { writes++; throw Error('Unexpected write'); };
  let snapshot = f.service.load(); assert.equal(snapshot.dirty, false);
  assert.equal(f.service.save({ version: snapshot.version }).result.saved, false);
  snapshot = f.service.mark({ version: snapshot.version, id: snapshot.items[0].id, color: 'green' }); assert(snapshot.dirty); assert(!fs.existsSync(f.review));
  snapshot = f.service.mark({ version: snapshot.version, id: snapshot.items[0].id, color: 'green' }); assert(!snapshot.dirty);
  assert.equal(f.service.save({ version: snapshot.version }).result.saved, false); assert.equal(writes, 0); assert(!fs.existsSync(f.review));
  assert.deepEqual(fs.readFileSync(path.join(f.dir, 'assets/guard.json')), before);
});
test('a saved checklist survives a fresh tool session and a clip rename through its asset UUID', t => {
  const f = fixture(t), selected = f.service.load().items[0];
  f.service.mark({ version: f.service.version, id: selected.id, color: 'yellow' }); const saved = f.service.save({ version: f.service.version });
  assert(saved.result.saved); assert.deepEqual(saved.result.files, ['authoring/audio-review.json']); assert(!saved.dirty);
  fs.renameSync(f.file, f.file.replace('button_click', 'renamed')); fs.renameSync(f.file + '.meta', f.file.replace('button_click', 'renamed') + '.meta');
  const restored = new SoundService(f.dir).load(); assert.equal(restored.items[0].id, selected.id); assert.equal(restored.marks[selected.id], 'yellow'); assert.equal(restored.items[0].origin, 'original');
});
test('saving marks preserves BOM, unknown fields, exact unknown number spellings, and orphan review entries', t => {
  const text = '\uFEFF{ "version":1, "marks": {"future":{"unknown":1.00}}, "unknown":1.00 }\r\n', f = fixture(t, text), id = f.service.catalog.items[0].id;
  f.service.mark({ version: f.service.version, id, color: 'red' }); f.service.save({ version: f.service.version });
  const after = fs.readFileSync(f.review, 'utf8'); assert(after.startsWith('\uFEFF')); assert(after.endsWith('\r\n')); assert(after.includes('"unknown":1.00'));
  assert(after.includes('"future":{"unknown":1.00}')); assert.equal(JSON.parse(after.slice(1)).marks[id], 'red');
  const stamp = fs.statSync(f.review).mtimeMs; assert.equal(f.service.save({ version: f.service.version }).result.saved, false); assert.equal(fs.statSync(f.review).mtimeMs, stamp);
});
test('stale panel revisions, invalid marks and disk conflicts retain the draft and never overwrite another save', t => {
  const f = fixture(t), second = new SoundService(f.dir), id = f.service.catalog.items[0].id, version = f.service.version;
  f.service.mark({ version, id, color: 'green' }); assert.throws(() => f.service.mark({ version, id, color: 'red' }), /another panel/);
  assert.throws(() => f.service.mark({ version: f.service.version, id: 'outside', color: 'red' }), /existing sound/);
  assert.throws(() => f.service.mark({ version: f.service.version, id, color: 'purple' }), /green, yellow or red/);
  second.mark({ version: second.version, id, color: 'red' }); second.save({ version: second.version }); const external = fs.readFileSync(f.review);
  assert.throws(() => f.service.save({ version: f.service.version }), /changed on disk/); assert.deepEqual(fs.readFileSync(f.review), external); assert(f.service.dirty());
  assert.equal(f.service.discard({ version: f.service.version }).marks[id], 'red');
});
test('a write arriving during save preparation is rejected by the guarded transaction', t => {
  const f = fixture(t, '{"version":1,"marks":{}}'), id = f.service.catalog.items[0].id, newer = '{"version":1,"marks":{},"external":true}';
  f.service.mark({ version: f.service.version, id, color: 'yellow' });
  f.service.commit = (...args) => { fs.writeFileSync(f.review, newer); return commit(...args); };
  assert.throws(() => f.service.save({ version: f.service.version }), /Another editor changed/); assert.equal(fs.readFileSync(f.review, 'utf8'), newer); assert(f.service.dirty());
});
function sample() {
  return { categories: [{ id: 'weapons', name: 'Weapons' }, { id: 'voices', name: 'Voices' }], marks: { a: 'red', b: 'green', c: 'yellow' }, items: [
    { id: 'a', name: 'Arrow', key: 'arrow', file: 'a.wav', origin: 'original', category: 'weapons', kind: 'effect', duration: 2, biome: 'forest' },
    { id: 'b', name: 'Bolt', key: 'bolt', file: 'b.wav', origin: 'new', category: 'weapons', kind: 'effect', duration: 1, biome: 'ice' },
    { id: 'c', name: 'Crossbowman line', key: 'crossbowman-level-1', file: 'c.mp3', origin: 'new', category: 'voices', kind: 'voice', unit: 'crossbowman', tier: 1, duration: 3 },
    { id: 'd', name: 'Different line', key: 'line', file: 'd.mp3', origin: 'new', category: 'voices', kind: 'voice', duration: null }
  ] };
}
test('category, source, type, biome, multiword search and colored checklist filters compose', () => {
  const s = sample(); assert.deepEqual(Model.view(s, { origin: 'new', kind: 'effect', biome: 'ice', mark: 'green' }).items.map(x => x.id), ['b']);
  assert.deepEqual(Model.view(s, { search: 'crossbow tier 1', origin: 'new' }).items.map(x => x.id), ['c']);
  assert.deepEqual(Model.view(s, { mark: 'unmarked' }).items.map(x => x.id), ['d']);
  assert.deepEqual(Model.view(s, { category: 'voices' }).reviewCounts, { all: 2, unmarked: 1, green: 0, yellow: 1, red: 0 });
});
test('sorting follows the displayed order, with unknown duration last and unmarked sounds after all dots', () => {
  const s = sample(), ids = sort => Model.view(s, { sort, grouped: false }).items.map(item => item.id);
  assert.deepEqual(ids('duration-desc'), ['c', 'a', 'b', 'd']); assert.deepEqual(ids('mark'), ['b', 'c', 'a', 'd']);
  assert.deepEqual(ids('mark-reverse'), ['a', 'c', 'b', 'd']); assert.equal(ids('origin')[0], 'a');
  const grouped = Model.view(s, { sort: 'name-desc' }); assert.deepEqual(grouped.items.map(x => x.id), ['b', 'a', 'd', 'c']);
});
test('all requested shortcuts work, while text inputs, controls, composition and repeated keys keep their own behavior', () => {
  const event = (key, extra) => ({ key, target: { tagName: 'DIV' }, ...extra });
  assert.equal(Model.shortcut(event(' ')), 'play');
  for (const [key, action] of Object.entries({ Q: 'previous', E: 'next', W: 'mode', A: 'green', S: 'yellow', D: 'red' })) assert.equal(Model.shortcut(event(key, { shiftKey: true })), action);
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(Model.shortcut(event('A', { shiftKey: true, target: { tagName } })), null);
  assert.equal(Model.shortcut(event(' ', { target: { tagName: 'BUTTON' } })), 'play');
  for (const prop of ['repeat', 'altKey', 'metaKey', 'ctrlKey', 'isComposing']) assert.equal(Model.shortcut(event('Q', { shiftKey: true, [prop]: true })), null);
});
function playerFixture() {
  const created = [], pending = [], updates = [];
  class Audio {
    constructor() { this.currentTime = 0; this.duration = 2; this.muted = true; this.paused = true; this.plays = 0; this.cleared = 0; created.push(this); }
    play() { this.plays++; this.paused = false; return new Promise((resolve, reject) => pending.push({ resolve, reject })); }
    pause() { this.paused = true; } removeAttribute(key) { if (key === 'src') { this.src = ''; this.cleared++; } } load() {}
  }
  const player = new Player({ createAudio: () => new Audio(), url: item => '/muted/' + item.id, onChange: state => updates.push(state) });
  player.setItems(sample().items); return { player, created, pending, updates, finish: async () => { while (pending.length) pending.shift().resolve(); await Promise.resolve(); } };
}
test('opening/selecting starts no audio; Play/Pause resumes the same clip and preserves mute', async () => {
  const f = playerFixture(); assert.equal(f.created.length, 0); f.player.select('b', false); assert.equal(f.created.length, 0);
  f.player.toggle(); await f.finish(); const media = f.created[0]; assert.equal(f.player.status, 'playing'); assert.equal(media.muted, true);
  media.currentTime = .8; media.ontimeupdate(); f.player.toggle(); assert.equal(f.player.status, 'paused'); f.player.toggle(); await f.finish();
  assert.equal(f.created.length, 1); assert.equal(media.currentTime, .8); f.player.setVolume(0); assert.equal(media.volume, 0); assert(media.muted);
});
test('previous/next audition the actual filtered list and old play promises, ends and errors cannot affect the replacement', async () => {
  const f = playerFixture(); f.player.play(); const old = f.created[0], end = old.onended, error = old.onerror;
  f.player.step(1); await f.finish(); assert.equal(f.player.id, 'b'); assert.equal(old.paused, true); assert.equal(old.src, '');
  end(); error(); assert.equal(f.player.id, 'b'); assert.equal(f.player.status, 'playing');
  f.player.setItems(f.player.items.filter(x => x.id === 'c')); assert.equal(f.player.id, 'c'); assert.equal(f.player.status, 'ready'); assert.equal(f.created[1].paused, true);
  assert.equal(f.player.step(1), false); assert.equal(f.player.step(-1), false);
});
test('mode cycles Once/Loop/Autoplay next, advances only after a finished clip, and stops at the end of the list', async () => {
  const f = playerFixture(); f.player.play(); await f.finish(); f.player.cycleMode(); assert.equal(f.player.mode, 'loop'); assert.equal(f.player.media.loop, true);
  f.player.cycleMode(); assert.equal(f.player.mode, 'next'); assert.equal(f.player.media.loop, false);
  const list = f.player.items; f.player.setItems([list[0], list[2]]); f.player.media.onended(); await f.finish(); assert.equal(f.player.id, 'c');
  f.player.media.onended(); assert.equal(f.player.status, 'ended'); assert.equal(f.created.length, 2); f.player.cycleMode(); assert.equal(f.player.mode, 'once');
});
test('paused/loading playback, late rejections and a late end cannot restart a retired or closed preview', async () => {
  const f = playerFixture(); f.player.play(); f.player.pause(); await f.finish(); assert.equal(f.player.status, 'paused');
  f.player.play(); const end = f.player.media.onended; f.player.destroy(); f.pending.shift().reject(Error('late blocked load')); await Promise.resolve();
  end(); assert.equal(f.player.items.length, 0); assert.equal(f.created[0].src, ''); assert(f.created[0].paused);
});
test('ending before a delayed play promise settles stays ended, and a failed clip does not block the next sound', async () => {
  const f = playerFixture(); f.player.play(); f.player.media.onended(); await f.finish(); assert.equal(f.player.status, 'ended');
  f.player.step(1); f.pending.shift().reject(Error('unsupported')); await Promise.resolve(); assert.equal(f.player.status, 'error');
  f.player.step(1); await f.finish(); assert.equal(f.player.status, 'playing'); assert.equal(f.player.id, 'c');
});

test('a queued end or decode error after Stop/Pause cannot autoplay the next clip or replace its stopped state', async () => {
  for (const action of ['stop', 'pause']) {
    const f = playerFixture(); f.player.cycleMode(); f.player.cycleMode(); f.player.play(); await f.finish();
    const end = f.player.media.onended, error = f.player.media.onerror; f.player[action](); const status = f.player.status;
    end(); error(); assert.equal(f.player.id, 'a'); assert.equal(f.player.status, status); assert.equal(f.created.length, 1);
  }
});

test('Creator menu and IPC expose only checklist operations and explicit asset selection', async () => {
  const vm = require('node:vm'), menu = require(path.join(folder, 'package.json')), calls = [], broadcasts = [];
  assert.equal(menu['main-menu']['Tools/Hero Kingdom Defense/Sound Editor'].message, 'hkd-sounds:open');
  class Service {
    constructor(project) { this.root = project; calls.push(['constructor', project]); }
    dirty() { return false; }
    load() { calls.push(['load']); return { version: 1 }; }
    mark(request) { calls.push(['mark', request]); return { version: 2 }; }
    save(request) { calls.push(['save', request]); return { version: 3 }; }
    discard() { calls.push(['discard']); return { version: 4 }; }
    asset() { return { uuid: 'chosen-audio' }; }
  }
  const module = { exports: {} }, editor = { Project: { path: root }, Panel: { open: name => calls.push(['open', name]) },
    Selection: { select: (...args) => calls.push(['select', ...args]) }, Ipc: { sendToAll: (...args) => broadcasts.push(args) } };
  vm.runInNewContext(fs.readFileSync(path.join(folder, 'main.js'), 'utf8'), { module, Editor: editor, require: name => name === './service' ? { SoundService: Service } : require(name) });
  const api = module.exports, invoke = (name, request) => new Promise((resolve, reject) => api.messages[name]({ reply: (error, value) => error ? reject(Error(error)) : resolve(value) }, request));
  api.load(); api.messages.open(); assert.deepEqual(calls, [['open', 'hkd-sounds']]);
  await invoke('load'); assert(!calls.some(row => row[0] === 'save'));
  await invoke('mark', { version: 1, id: 'clip', color: 'green' }); await invoke('save', { version: 2 }); await invoke('reveal', { id: 'clip' });
  assert(calls.some(row => row[0] === 'select' && row[1] === 'asset' && row[2] === 'chosen-audio'));
  assert.equal(broadcasts.length, 2); api.unload(); assert.equal(calls.filter(row => row[0] === 'save').length, 1);
});

test('Creator panel starts no audio on mount and releases the player on close', () => {
  const vm = require('node:vm'); let definition, mounted = 0, destroyed = 0, created = 0;
  vm.runInNewContext(fs.readFileSync(path.join(folder, 'panel.js'), 'utf8'), {
    __dirname: folder, document: { createElement() { created++; return {}; } },
    Editor: { Project: { path: root }, Panel: { extend: value => { definition = value; } } },
    require: name => name === './client' ? { mount(host, api) { mounted++; assert.equal(created, 0); assert.equal(typeof api.createAudio, 'function'); return { destroy() { destroyed++; } }; } } : require(name)
  });
  definition.$root = {}; definition.ready(); assert.equal(mounted, 1); assert.equal(created, 0); definition.close(); assert.equal(destroyed, 1);
});
