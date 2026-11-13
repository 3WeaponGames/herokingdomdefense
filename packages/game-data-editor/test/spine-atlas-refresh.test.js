'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), EventEmitter = require('events');
const R = require('../lib/spine-atlas-refresh');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {for (let i = 0; i < 150; i++) {if (predicate()) return;await wait(10);}throw Error('Refresh did not settle');}
function fixture(t, fresh = false) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hkd-spine-refresh-'));
    t.after(() => {assert(path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('hkd-spine-refresh-'));fs.rmSync(root, {recursive: true, force: true});});
    const dir = path.join(root, 'assets/KinghtFallIconMap/com/Ani/cb');fs.mkdirSync(dir, {recursive: true});
    const file = path.join(dir, 'cb.json'), atlas = path.join(dir, 'cb.atlas'), library = path.join(root, 'library/imports/ab/ab-source.json');
    const json = {skeleton: {spine: '3.8'}, bones: [{name: 'root'}], skins: [], animations: {idle: {}}};
    fs.writeFileSync(file, JSON.stringify(json));fs.writeFileSync(file + '.meta', JSON.stringify({importer: 'spine', uuid: 'ab-source', Future: {keep: true}}));
    fs.writeFileSync(atlas, '\ncb.png\nsize: 100,100\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nbody\n  xy: 0, 0\n  size: 100, 100\n');
    fs.writeFileSync(path.join(dir, 'cb.png.meta'), JSON.stringify({uuid: 'texture-uuid'}));
    fs.mkdirSync(path.dirname(library), {recursive: true});
    function imported() {return {__type__: 'sp.SkeletonData', _skeletonJson: JSON.parse(fs.readFileSync(file)), _atlasText: fs.readFileSync(atlas, 'utf8'), textures: [{__uuid__: 'texture-uuid'}], textureNames: ['cb.png']};}
    fs.writeFileSync(library, JSON.stringify({...imported(), ...(fresh ? {} : {_atlasText: 'old atlas crop coordinates'})}));
    const calls = [], warnings = [], watcher = new EventEmitter();watcher.close = () => {watcher.closed = true;};
    const db = {urlToUuid: () => 'ab-source',
        refresh(url, cb) {calls.push(['refresh', url]);if (url.endsWith('cb.json')) fs.writeFileSync(library, JSON.stringify(imported()));cb();},
        clearImports(url, cb) {calls.push(['clear', url]);fs.unlinkSync(library);cb();}};
    const Editor = {assetdb: db, warn: text => warnings.push(text)};
    const install = () => {const stop = R.install(Editor, root, {delay: 0, watch: (_dir, _options, listener) => {watcher.on('change', listener);return watcher;}});t.after(stop);return stop;};
    return {root, file, atlas, library, calls, warnings, watcher, db, Editor, imported, install};
}

test('stale sibling atlas coordinates force a parent Spine import after texture refresh, without source writes', async t => {
    const f = fixture(t), source = [f.file, f.file + '.meta', f.atlas].map(p => fs.readFileSync(p));
    assert.equal(R.sources(f.root).length, 1);assert(R.inspect(f.root, R.sources(f.root)[0]).stale);
    f.install();await until(() => f.calls.length === 3);
    assert.deepEqual(f.calls.map(c => c[0]), ['refresh', 'clear', 'refresh']);
    assert(f.calls[0][1].endsWith('/cb.png'));assert(f.calls[1][1].endsWith('/cb.json'));assert(f.calls[2][1].endsWith('/cb.json'));
    assert.equal(R.inspect(f.root, R.sources(f.root)[0]).stale, false);assert.deepEqual(f.warnings, []);
    [f.file, f.file + '.meta', f.atlas].forEach((p, i) => assert.deepEqual(fs.readFileSync(p), source[i]));
});

test('fresh imports and unrelated file events are no-ops; an atlas edit refreshes only its parent and unload closes watchers', async t => {
    const f = fixture(t, true), stop = f.install();await wait(30);assert.deepEqual(f.calls, []);
    f.watcher.emit('change', 'change', 'unrelated.txt');await wait(30);assert.deepEqual(f.calls, []);
    fs.appendFileSync(f.atlas, '\nnew-region\n  size: 4, 4\n');
    for (let i = 0; i < 10; i++) f.watcher.emit('change', 'change', 'cb.atlas');
    await until(() => f.calls.length === 3);await wait(20);assert.equal(f.calls.length, 3);
    stop();assert(f.watcher.closed);f.watcher.emit('change', 'change', 'cb.atlas');await wait(20);assert.equal(f.calls.length, 3);
});

test('cached source JSON, texture bindings and page names must all match, not just atlas text', t => {
    const f = fixture(t, true), item = R.sources(f.root)[0];assert.equal(R.inspect(f.root, item).stale, false);
    for (const changed of [{_skeletonJson: {}}, {textures: [{__uuid__: 'wrong-texture'}]}, {textureNames: ['other.png']}]) {
        fs.writeFileSync(f.library, JSON.stringify({...f.imported(), ...changed}));assert(R.inspect(f.root, item).stale);
    }
});

test('package startup waits for AssetDB registration before clearing an import', async t => {
    const f = fixture(t);let ready = false;f.db.urlToUuid = () => ready ? 'ab-source' : null;
    f.install();await wait(30);assert.deepEqual(f.calls, []);ready = true;
    await until(() => f.calls.length === 3);assert.deepEqual(f.warnings, []);
});

test('unloading during a texture refresh cannot clear or import later assets', async t => {
    const f = fixture(t);let release;
    f.db.refresh = (url, cb) => {f.calls.push(['refresh', url]);release = cb;};
    const stop = f.install();await until(() => release);stop();release();await wait(20);
    assert.equal(f.calls.length, 1);assert.equal(f.calls[0][0], 'refresh');assert(fs.existsSync(f.library));
});

test('malformed atlas metadata reports an error without clearing the existing usable import', async t => {
    const f = fixture(t);fs.writeFileSync(f.atlas, '\n../outside.png\n');f.install();
    await until(() => f.warnings.length);assert.deepEqual(f.calls, []);assert(fs.existsSync(f.library));
});
