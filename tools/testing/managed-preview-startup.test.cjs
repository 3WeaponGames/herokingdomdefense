'use strict';
// Actual managed preview setup/reset/unload, with inert windows and memory files.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events'), { createRequire } = require('node:module');
const file = path.resolve(__dirname, '../../packages/game-data-editor/testing/session.js');
const root = path.resolve(__dirname, '../../local/inert-managed-startup');
function fixture(options = {}) {
    const trace = [], windows = [], files = new Map(), pending = [];
    const config = { GoodsCfg: {}, TreasureCfg: [], EquipCfg: [], TalentLevelCfg: [], LevelCfg: [] };
    const memoryFS = { mkdirSync() {}, writeFileSync(name, bytes) { files.set(name, String(bytes)); },
        readFileSync(name) { return files.has(name) ? files.get(name) : JSON.stringify(String(name).includes('localization') ? { entries: {} } : config); } };
    const module = { exports: {} }, local = createRequire(file);
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module,
        require: name => name === 'fs' ? memoryFS : local(name),
        setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 10)), clearTimeout }, { filename: file });
    const api = module.exports;
    class Window extends EventEmitter {
        constructor() {
            super(); windows.push(this); this.dead = false; this.url = ''; this.mainLoads = 0;
            this.webContents = new EventEmitter();
            Object.assign(this.webContents, {
                setAudioMuted: value => {
                    assert.equal(value, true); trace.push('mute');
                    assert.equal(api._sessions.get(root).window, this, 'ownership precedes fallible setup');
                    if (options.muteError) throw Error('disposed contents'); this.muted = true;
                },
                getURL: () => this.url,
                executeJavaScript(_script, _gesture, done) { done({ ok: true, value: { ready: true, storage: { QA: 'saved' }, state: {} } }); },
                session: { clearStorageData(_options, done) { trace.push('clear'); done(); } }
            });
        }
        isDestroyed() { return this.dead; }
        loadURL(url) {
            assert(this.muted, 'mute before every URL'); trace.push('load:' + url);
            if (options.loadError) throw Error('navigation blocked');
            this.url = url; this.webContents.emit('did-start-loading');
            if (options.rejectLoad) return Promise.reject(Error('ERR_CONNECTION_REFUSED'));
            if (url !== 'about:blank') this.mainLoads++;
            setImmediate(() => { if (!this.dead) this.webContents.emit('did-finish-load'); });
            if (options.holdFirstMain && this.mainLoads === 1 && url !== 'about:blank') return new Promise((_resolve, reject) => pending.push(reject));
            return options.promise ? Promise.resolve() : undefined;
        }
        show() { trace.push('show'); }
        destroy() {
            trace.push('destroy'); if (options.destroyError) throw Error('window busy');
            this.dead = true; this.emit('closed');
        }
    }
    const Editor = { PreviewServer: { _previewPort: 7456 } }, deps = { BrowserWindow: Window, partition: 'hkd-qa-startup-test', show: false };
    return { api, trace, windows, pending, files, options,
        start: () => api.handle(Editor, root, { action: 'start' }, deps),
        close: () => api.handle(Editor, root, { action: 'close' }),
        reset: () => api.handle(Editor, root, { action: 'reset', confirm: api.confirmReset }),
        status: () => api.handle(Editor, root, { action: 'status' }) };
}

for (const fault of ['muteError', 'loadError']) test('failed managed setup closes its exact owned window: ' + fault, async () => {
    const h = fixture({ [fault]: true });
    await assert.rejects(h.start(), fault === 'muteError' ? /disposed contents/ : /navigation blocked/);
    assert.equal(h.windows.length, 1); assert(h.windows[0].dead); assert.equal(h.api._sessions.size, 0);
    if (fault === 'muteError') assert(!h.trace.some(x => x.startsWith('load:')));
    assert.equal(h.files.size, 0);
});

test('a failed cleanup remains owned and can be closed after the native failure clears', async () => {
    const h = fixture({ loadError: true, destroyError: true });
    await assert.rejects(h.start(), /navigation blocked/); assert.equal(h.api._sessions.size, 1); assert(!h.windows[0].dead);
    assert.match((await h.status()).message, /could not load/); await assert.rejects(h.start(), /navigation blocked/);
    assert.equal(h.windows.length, 1); h.options.destroyError = false; await h.close();
    assert(h.windows[0].dead); assert.equal(h.api._sessions.size, 0);
});

test('a rejected promise-form navigation reports its cause and creates no unhandled rejection', async () => {
    const h = fixture({ rejectLoad: true });
    // node:test also fails this entry if the rejected native promise escapes.
    await assert.rejects(h.start(), /ERR_CONNECTION_REFUSED/); await new Promise(setImmediate);
    assert(h.windows[0].dead); assert.equal(h.api._sessions.size, 0); assert.equal(h.files.size, 0);
});

for (const promise of [false, true]) test('ordinary callback/promise preview startup keeps mute and owned shutdown: ' + promise, async () => {
    const h = fixture({ promise }); assert.equal((await h.start()).ready, true);
    assert(h.trace.indexOf('mute') < h.trace.findIndex(x => x.startsWith('load:')));
    assert.equal(h.files.size, 0); h.api.shutdown(); assert(h.windows[0].dead); assert.equal(h.api._sessions.size, 0);
});

test('an earlier rejected Main navigation cannot close the successfully reset current page', async () => {
    const h = fixture({ holdFirstMain: true }); await h.start();
    assert.equal(h.pending.length, 1); const result = await h.reset(); assert(result.backup); assert.equal(h.windows[0].mainLoads, 2);
    h.pending[0](Error('obsolete navigation')); await new Promise(setImmediate);
    assert(!h.windows[0].dead); assert.equal((await h.status()).ready, true); assert.equal(h.api._sessions.size, 1);
    assert(h.trace.includes('clear')); h.api.shutdown();
});

test('late disposed contents cannot throw out of the owned load-completion listener', async () => {
    const h = fixture(); await h.start(); h.options.muteError = true;
    assert.doesNotThrow(() => h.windows[0].webContents.emit('did-finish-load'));
    assert(h.windows[0].dead); assert.equal(h.api._sessions.size, 0);
});

test('unload tries every captured window, ignores mute failure and preserves a failed destroy for retry', async () => {
    const h = fixture(), trace = [];
    const owner = (name, failMute, failDestroy) => ({ window: { dead: false, isDestroyed() { return this.dead; },
        webContents: { setAudioMuted() { trace.push(name + ':mute'); if (failMute) throw Error('disposed contents'); } },
        destroy() { trace.push(name + ':destroy'); if (failDestroy.value) throw Error('window busy'); this.dead = true; } } });
    const fail = { value: true }, old = owner('old', true, fail), other = owner('other', false, { value: false });
    h.api._sessions.set('old', old); h.api._sessions.set('other', other);
    assert.throws(() => h.api.shutdown(), /window busy/);
    assert.deepEqual(trace, ['old:mute', 'old:destroy', 'other:mute', 'other:destroy']);
    assert.equal(h.api._sessions.size, 1); assert.equal(h.api._sessions.get('old'), old); assert(other.window.dead);
    fail.value = false; h.api.shutdown(); assert(old.window.dead); assert.equal(h.api._sessions.size, 0);
});

test('unload preserves a replacement installed by an older close callback', async () => {
    const h = fixture(); await h.start(); const replacement = { window: { isDestroyed: () => false } };
    h.windows[0].on('closed', () => h.api._sessions.set(root, replacement)); h.api.shutdown();
    assert(h.windows[0].dead); assert.equal(h.api._sessions.get(root), replacement);
});
