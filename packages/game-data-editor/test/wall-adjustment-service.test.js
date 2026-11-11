'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const API = require('../walls/service'), Runtime = require('../../../assets/_script/WallAdjustments');
const clone = value => JSON.parse(JSON.stringify(value));
const empty = () => ({version: 1, poses: {}});
function fixture(data = empty(), options = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hkd-wall-adjustments-')), root = path.join(base, 'project'), artifacts = path.join(base, 'external-artifacts'), file = path.join(root, API.FILE);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const header = "'use strict';\r\n// Keep this authored header.\r\nmodule.exports = ", footer = ';\r\n// Keep this footer too.\r\n';
  fs.writeFileSync(file, header + JSON.stringify(data, null, 2).replace(/\n/g, '\r\n') + footer);
  const protectedFiles = ['assets/_script/WallAdjustmentData.js.meta', 'assets/configs/GameJsonCfg.json', 'authoring/worlds/stages/A-1.json'];
  for (const relative of protectedFiles) {const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, JSON.stringify({sentinel: relative}));}
  const helper = {validate: Runtime.validate, edit: Runtime.edit, saved: clone(data), setData(value) {if (options.cacheFailure) throw Error('injected refresh failure'); this.saved = clone(value);}};
  const service = new API.Service(root, {artifacts, helper, preview: (draft, selection) => ({pieces: [{id: 'door/near', slots: ['near'], offset: draft.poses[selection.tier + '/' + selection.face + '/' + selection.state]?.pieces?.['door/near'] || {x: 0, y: 0}}], record: {sentinel: true}}), ...options});
  return {base, root, file, artifacts, service, helper, header, footer, protectedFiles, cleanup() {if (!path.resolve(base).startsWith(path.resolve(os.tmpdir()) + path.sep + 'hkd-wall-adjustments-')) throw Error('Temporary fixture cleanup escaped its directory.'); fs.rmSync(base, {recursive: true, force: true});}};
}
function moved(data = empty(), tier = 1) {return Runtime.edit(data, {tier, face: 'NW', state: 'closed'}, {type: 'move', id: 'door/near', x: 7.5, y: -2});}

test('loading, draft preview edits, discard/reload and unchanged Save create no writes or backups', t => {
  const f = fixture({version: 1, poses: {}, Future: {keep: ['a', 17]}}); t.after(f.cleanup);
  const before = fs.readFileSync(f.file), stamp = fs.statSync(f.file).mtimeMs, snapshot = f.service.load({preview: false});
  const draft = clone(snapshot.data), preview = f.service.preview({data: draft, tier: 2, face: 'NW', state: 'closed', night: true, edit: {type: 'move', id: 'door/near', x: 12, y: 4}});
  assert.deepEqual(draft, snapshot.data); assert.equal(preview.data.poses['2/NW/closed'].pieces['door/near'].x, 12); assert.equal(preview.selection.night, true);
  assert.deepEqual(f.service.load({preview: false}), snapshot, 'Reload/discard reads saved source instead of persisting the draft');
  const result = f.service.save({revision: snapshot.revision, data: snapshot.data}); assert.deepEqual(result.result, {saved: false, noChanges: true, files: []});
  assert(fs.readFileSync(f.file).equals(before)); assert.equal(fs.statSync(f.file).mtimeMs, stamp); assert(!fs.existsSync(f.artifacts)); assert.deepEqual(f.helper.saved, snapshot.data);
  const leaked = f.service.load({preview: false}); leaked.data.Future.keep.push('caller edit'); assert.deepEqual(f.service.load({preview: false}).data, snapshot.data);
});

test('explicit Save writes only the shared literal module and retains wrapper, unknown data, cache refresh and external backup', t => {
  const f = fixture({version: 1, poses: {}, Future: {number: 123, text: '}; // not code'}}); t.after(f.cleanup);
  const before = fs.readFileSync(f.file), protectedBefore = f.protectedFiles.map(file => fs.readFileSync(path.join(f.root, file))), loaded = f.service.load({preview: false}), edited = moved(loaded.data);
  const saved = f.service.save({revision: loaded.revision, data: edited, file: 'unrelated-file.js'});
  assert.equal(saved.result.saved, true); assert.deepEqual(saved.result.files, [API.FILE]); assert.notEqual(saved.revision, loaded.revision); assert.equal(saved.result.warning, undefined);
  const bytes = fs.readFileSync(f.file), text = bytes.toString('utf8'); assert(text.startsWith(f.header) && text.endsWith(f.footer)); assert.deepEqual(API.readSource(f.root).data, edited); assert.deepEqual(f.helper.saved, edited);
  assert(fs.readFileSync(path.join(saved.result.backup, 'before-WallAdjustmentData.js')).equals(before)); assert.equal(JSON.parse(fs.readFileSync(path.join(saved.result.backup, 'journal.json'))).status, 'committed');
  f.protectedFiles.forEach((file, i) => assert(fs.readFileSync(path.join(f.root, file)).equals(protectedBefore[i])));
  assert(!fs.readdirSync(path.dirname(f.file)).some(name => name.endsWith('.tmp')), 'Adjacent atomic transaction files are removed');
  assert.equal(f.service.save({revision: saved.revision, data: saved.data}).result.saved, false);
});

test('Save preserves unknown nested metadata when a known pose or piece is reset', t => {
  const data = {version: 1, FutureRoot: {keep: true}, poses: {'1/NW/closed': {FuturePose: ['keep'], pieces: {'door/near': {x: 8, y: 3, FuturePiece: 'keep'}}}}};
  const f = fixture(data); t.after(f.cleanup); const loaded = f.service.load({preview: false}), draft = empty();
  const saved = f.service.save({revision: loaded.revision, data: draft});
  assert.deepEqual(saved.data.FutureRoot, data.FutureRoot); assert.deepEqual(saved.data.poses['1/NW/closed'].FuturePose, ['keep']); assert.equal(saved.data.poses['1/NW/closed'].pieces['door/near'].FuturePiece, 'keep');
  assert(!saved.data.poses['1/NW/closed'].pieces['door/near'].x && !saved.data.poses['1/NW/closed'].pieces['door/near'].y);
});

test('stale and racing revisions cannot overwrite another editor and invalid drafts never create a backup', t => {
  const f = fixture(); t.after(f.cleanup); const first = f.service.load({preview: false});
  fs.appendFileSync(f.file, '// external change\n'); const concurrent = fs.readFileSync(f.file);
  assert.throws(() => f.service.save({revision: first.revision, data: moved()}), /changed on disk/); assert(fs.readFileSync(f.file).equals(concurrent)); assert(!fs.existsSync(f.artifacts));
  const current = f.service.load({preview: false});
  for (const bad of [{version: 1, poses: {'1/NW/closed': {pieces: {'door/near': {x: NaN, y: 0}}}}}, {version: 1, poses: {'1/NW/closed': {order: ['door/near', 'door/near']}}}, {version: 2, poses: {}}, {version: 1, poses: {}, f() {}}]) {
    assert.throws(() => f.service.save({revision: current.revision, data: bad})); assert(fs.readFileSync(f.file).equals(concurrent)); assert(!fs.existsSync(f.artifacts));
  }
  const racing = new API.Service(f.root, {artifacts: f.artifacts, helper: f.helper, beforeCommit(file) {fs.appendFileSync(file, '// raced commit\n');}});
  assert.throws(() => racing.save({revision: current.revision, data: moved()}), /changed before commit/); assert(fs.readFileSync(f.file, 'utf8').endsWith('// raced commit\n')); assert(!fs.readdirSync(path.dirname(f.file)).some(name => name.endsWith('.tmp')));
});

test('atomic target replacement works when external backups cannot be renamed onto the target volume', t => {
  const f = fixture(); t.after(f.cleanup); const loaded = f.service.load({preview: false}), rename = fs.renameSync, calls = [];
  fs.renameSync = (from, to) => {calls.push([from, to]); if (path.dirname(from) !== path.dirname(to)) {const error = Error('Cross-device move'); error.code = 'EXDEV'; throw error;} return rename(from, to);};
  try {assert.equal(f.service.save({revision: loaded.revision, data: moved()}).result.saved, true);} finally {fs.renameSync = rename;}
  assert.equal(calls.length, 1); assert.equal(path.dirname(calls[0][0]), path.dirname(f.file)); assert.equal(calls[0][1], f.file);
});

test('post-commit journal or cache failures report saved:true with a warning', t => {
  for (const type of ['journal', 'cache']) {
    const f = fixture(empty(), {cacheFailure: type === 'cache'}); t.after(f.cleanup); const loaded = f.service.load({preview: false}), write = fs.writeFileSync;
    if (type === 'journal') fs.writeFileSync = (file, bytes, options) => {if (path.basename(file) === 'journal.json' && String(bytes).includes('"committed"')) throw Error('injected journal failure'); return write(file, bytes, options);};
    let result; try {result = f.service.save({revision: loaded.revision, data: moved()});} finally {fs.writeFileSync = write;}
    assert.equal(result.result.saved, true); assert.match(result.result.warning, /Saved, but/); assert.deepEqual(API.readSource(f.root).data, moved());
  }
});

test('read parser accepts only a literal JSON module and never executes module code', t => {
  const f = fixture(); t.after(f.cleanup);
  for (const text of ["module.exports = (global.__wallServiceExecuted = true);", "'use strict'; module.exports = {\"version\":1,\"poses\":{}}; global.__wallServiceExecuted = true;", "module.exports = {version:1,poses:{}};"]) {
    fs.writeFileSync(f.file, text); assert.throws(() => f.service.load({preview: false})); assert.equal(global.__wallServiceExecuted, undefined);
  }
  assert.throws(() => new API.Service(f.root, {artifacts: path.join(f.root, 'backups')}), /outside the project/);
});

test('actual CQ1 draft previews expose independent closed leaves and night presentation without touching saved data', () => {
  const root = path.resolve(__dirname, '../../..'), before = fs.readFileSync(path.join(root, API.FILE)), snapshot = API.load(root, {preview: false});
  for (const state of ['closed', 'inward', 'outward']) {
    const result = API.preview(root, {data: snapshot.data, tier: 2, face: 'NW', state, night: true, edit: {type: 'move', id: 'door/near', x: 3, y: 5}});
    const d = result.descriptions[0]; assert.equal(d.scaleX, -1); assert.equal(d.scaleY, 1); assert.equal(d.skin, 'cq-rts-2'); assert.equal(d.animation, state === 'closed' ? 'idle_night' : 'open_' + state + '_night');
    assert(result.pieces.some(p => p.id === 'door/near') && result.pieces.some(p => p.id === 'door/far')); assert.deepEqual(result.pieces.find(p => p.id === 'door/near').offset, {x: 3, y: 5});
    assert.notEqual(result.pieces.find(p => p.id === 'door/near').slots[0], result.pieces.find(p => p.id === 'door/far').slots[0]); assert(result.runtimePath && result.bounds.width > 0);
  }
  assert(fs.readFileSync(path.join(root, API.FILE)).equals(before)); assert.deepEqual(API.load(root, {preview: false}).data, snapshot.data);
});

test('saving an external fixture refreshes an existing stage preview cache without changing source layouts or colliders', t => {
  const f = fixture(); t.after(f.cleanup);
  const originalRoot = path.resolve(__dirname, '../../..'), L = require('../worlds/legacy'), M = require('../worlds/model'), Preview = require('../worlds/building-preview');
  const assetDir = 'assets/KinghtFallIconMap/com/Ani/cq'; fs.mkdirSync(path.dirname(path.join(f.root, assetDir)), {recursive: true}); fs.cpSync(path.join(originalRoot, assetDir), path.join(f.root, assetDir), {recursive: true});
  const config = M.clone(L.read(originalRoot, L.configFile('A'))), source = L.inspect(originalRoot, 'Map01'), stage = L.adaptStage(originalRoot, 'A', 1, {...config.LevelCfg[0], prefab: 'Map01'});
  const wall = stage.buildings.find(b => b.kind === 6); wall.wallFacing = 'NW'; stage.buildings = [wall]; stage.specials = [];
  const index = {documents: {A: config, B: {}, D: {}}}, service = {root: f.root, index: () => index, source: () => source.data};
  const sourceBefore = JSON.stringify({config, source: source.data, stage}), first = Preview.describe(service, stage); assert.deepEqual(first.errors, []);
  assert.strictEqual(Preview.describe(service, stage), first, 'Unchanged shared data reuses the existing preview');
  const beforeRecord = JSON.stringify(first.buildings[wall.id]), loaded = f.service.load({preview: false}), saved = f.service.save({revision: loaded.revision, data: moved()});
  const next = Preview.describe(service, stage); assert.deepEqual(next.errors, []); assert.notStrictEqual(next, first); assert.notEqual(next.revision, first.revision);
  const before = first.buildings[wall.id].levels[1], after = next.buildings[wall.id].levels[1], main = after.skeletons.find(s => s.json.wallKit);
  assert.equal(after.wallAdjustmentRevision, saved.revision); assert.deepEqual(main.json.wallAdjustments.data, saved.data); assert.equal(main.json.wallAdjustments.face, 'NW');
  assert.deepEqual(after.blockers, before.blockers); assert.deepEqual(after.openBlockers, before.openBlockers); assert.equal(JSON.stringify(first.buildings[wall.id]), beforeRecord);
  assert.strictEqual(Preview.describe(service, stage), next); assert.equal(JSON.stringify({config, source: source.data, stage}), sourceBefore);
});
