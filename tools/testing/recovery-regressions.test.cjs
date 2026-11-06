const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
const source = name => fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8');

function load(name, modules, globals = {}) {
  const context = { exports: {}, require: id => modules[id] || {}, console: { log() {}, error() {}, warn() {} }, ...globals };
  vm.runInNewContext(source(name), context, { filename: name + '.js' });
  return context.exports;
}

function saves(local, options = {}) {
  const storage = new Map(local == null ? [] : [['save', local]]);
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem(key, value) { if (options.noBackup && key !== 'save') throw Error('Storage full'); storage.set(key, value); }
  };
  const BaseData = load('BaseData', {
    CacheUtils: { CacheUtils: { getData: localStorage.getItem, saveData: localStorage.setItem } },
    Utils: { Utils: { restoreObjectKeys: x => x, renameObjectKeys: x => x, decrypt: x => { if (options.decryptError) throw Error('Bad cipher'); return x; } } },
    PlatformManager: { PlatformManager: { currentPlatform: 0 } },
    BasePlatform: { Platform: { WECHAT: 1, WEB_LINK: 2 } },
    ServerDataMgr: { ServerdataMgr: { getNeedSaveServer: () => false, saveData() { throw Error('Unexpected server write'); } } }
  }, { localStorage }).BaseData;
  const data = new BaseData();
  data.gameKey = 'save';
  data.createData = () => ({ coins: 0 });
  data.initialized = [];
  data.initData = fresh => { data.initialized.push(fresh); if (options.saveDuringInit) data.saveData(); };
  return { data, storage };
}

test('a malformed server record does not hide a valid local save', () => {
  const h = saves('{"coins":900,"sft":20}');
  assert.equal(h.data.loaddata('{broken', 'save').coins, 900);
  assert.deepEqual(h.data.initialized, [false]);
  assert.ok([...h.storage.entries()].some(([key, value]) => key !== 'save' && value === '{broken'));
});

test('a malformed local record does not hide a valid server save', () => {
  const h = saves('{broken');
  assert.equal(h.data.loaddata('{"coins":700,"sft":10}', 'save').coins, 700);
  assert.ok([...h.storage.entries()].some(([key, value]) => key !== 'save' && value === '{broken'));
});

test('both malformed records are preserved before fresh data can be saved', () => {
  const h = saves('{local-broken', { saveDuringInit: true });
  assert.equal(h.data.loaddata('{server-broken', 'save').coins, 0);
  assert.deepEqual(h.data.initialized, [true]);
  const backups = [...h.storage.entries()].filter(([key]) => key !== 'save').map(([, value]) => value);
  assert.ok(backups.includes('{local-broken'));
  assert.ok(backups.includes('{server-broken'));
  assert.equal(JSON.parse(h.storage.get('save')).coins, 0);
});

test('failed quarantine never overwrites the only corrupt record', () => {
  const h = saves('{broken', { noBackup: true, saveDuringInit: true });
  assert.equal(h.data.loaddata(null, 'save').coins, 0);
  h.data.saveData();
  h.data.UpdateData();
  assert.equal(h.storage.get('save'), '{broken');
});

test('invalid root shapes and decrypt errors recover; valid save precedence stays intact', () => {
  for (const raw of ['null', '42', '"text"']) {
    const h = saves(raw);
    assert.equal(h.data.loaddata(null, 'save').coins, 0);
  }
  const encrypted = saves('ciphertext', { decryptError: true });
  encrypted.data.ecrypt = true;
  assert.equal(encrypted.data.loaddata('{"coins":5}', 'save').coins, 5);
  const h = saves('{"coins":9,"sft":20}');
  assert.equal(h.data.loaddata('{"coins":7,"sft":10}', 'save', false).coins, 9);
  assert.equal(h.data.initialized.length, 0);
  assert.equal(h.storage.size, 1);
});

function resources(options = {}) {
  const h = { errors: [], calls: [], timers: new Map(), nextTimer: 1, assets: [], cache: [] };
  function JsonAsset() {}
  const bundle = { load(name, type, done) { h.assets.push({ name, type, done }); } };
  const args = load('ArgsParseUtils', {}).ArgsParseUtils;
  const mgr = load('ResourceMgr', {
    ArgsParseUtils: { ArgsParseUtils: args },
    LogMgr: { LogMgr: { getInstance: () => ({ error() {}, debug() {} }) } },
    TimeUtils: { TimeUtils: { GetTimeBySecond: () => 0 } },
    ResCacheMgr: { ResCacheMgr: { getInstance: () => ({ getAssets: () => null, addAssets: asset => h.cache.push(asset), addAssetKeyToMap() {} }) } }
  }, {
    cc: { JsonAsset, js: { getClassName: cls => cls.name }, assetManager: { getBundle: () => options.bundle ? bundle : null, loadBundle: (name, done) => h.calls.push({ name, done }) } },
    setTimeout(fn) { const id = h.nextTimer++; h.timers.set(id, fn); return id; },
    clearTimeout(id) { h.timers.delete(id); }
  }).ResourceMgr.getInstance();
  mgr.loadErrorHandler = (error, retry) => h.errors.push({ error, retry });
  return { ...h, mgr, bundle, JsonAsset };
}

test('bundle failure exposes retry and resumes the original callback exactly once', () => {
  const h = resources(); let successes = 0;
  h.mgr.loadBundle('configs', asset => { assert.equal(asset, h.bundle); successes++; });
  h.calls[0].done(Error('Network unavailable'));
  assert.equal(successes, 0);
  assert.equal(h.errors.length, 1);
  h.errors[0].retry();
  h.calls[1].done(null, h.bundle);
  h.calls[1].done(null, h.bundle);
  assert.equal(successes, 1);
  assert.equal(h.timers.size, 0);
});

test('failed config asset retries without restarting successful startup stages', () => {
  const h = resources({ bundle: true }); let successes = 0; let refs = 0;
  h.mgr.loadRes('configs', 'GameJsonCfg', h.JsonAsset, () => successes++);
  h.assets[0].done(Error('Download interrupted'));
  assert.equal(h.errors.length, 1);
  h.errors[0].retry();
  h.assets[1].done(null, { json: {}, addRef() { refs++; } });
  assert.equal(successes, 1);
  assert.equal(refs, 1);
  assert.equal(h.cache.length, 1);
  assert.equal(h.timers.size, 0);
});

test('stalled requests time out and late callbacks cannot complete a retry twice', () => {
  const h = resources(); let successes = 0;
  h.mgr.loadBundle('configs', () => successes++);
  const timer = [...h.timers.values()][0];
  assert.equal(typeof timer, 'function');
  timer();
  assert.equal(h.errors.length, 1);
  h.errors[0].retry();
  h.calls[0].done(null, h.bundle);
  assert.equal(successes, 0);
  h.calls[1].done(null, h.bundle);
  assert.equal(successes, 1);
});

test('a bundle failure inside loadRes retries before loading the requested config', () => {
  const h = resources(); let successes = 0;
  h.mgr.loadRes('configs', 'GameJsonCfg', h.JsonAsset, () => successes++);
  h.calls[0].done(Error('Bundle failed'));
  assert.equal(h.assets.length, 0);
  h.errors[0].retry();
  h.calls[1].done(null, h.bundle);
  h.assets[0].done(null, { json: {}, addRef() {} });
  assert.equal(successes, 1);
});

test('timed-out config ignores late success and error callbacks across retry', () => {
  const h = resources({ bundle: true }); let successes = 0;
  h.mgr.loadRes('configs', 'GameJsonCfg', h.JsonAsset, () => successes++);
  [...h.timers.values()][0]();
  h.errors[0].retry();
  h.assets[0].done(null, { addRef() { throw Error('Late asset must not be retained'); } });
  h.assets[0].done(Error('Late failure'));
  h.assets[1].done(null, { addRef() {} });
  h.errors[0].retry();
  assert.equal(successes, 1);
  assert.equal(h.errors.length, 1);
  assert.equal(h.assets.length, 2);
  assert.equal(h.timers.size, 0);
});

function loading(options = {}) {
  const resources = { loadErrorHandler: null };
  const state = { started: 0, logos: 0, requests: 0, sceneCalls: [], offs: 0 };
  const language = {
    ready: !options.catalogError,
    init(done) { state.requests++; if (done) done(language.ready ? null : Error('Missing catalog')); },
    preloadArtwork(done) { done([]); done([]); },
    t: (key, params) => key === 'loading.failed' ? '游戏加载失败，点击重试。' : params[0] + '%'
  };
  function node() {
    return { width: 128, height: 84, scaleX: .5, handlers: new Map(),
      on(event, fn, target) { this.handlers.set(event, () => fn.call(target)); },
      off(event) { this.handlers.delete(event); } };
  }
  const cc = {
    Component: function () {}, Node: { EventType: { TOUCH_END: 'touch' } },
    Label: { Overflow: { SHRINK: 2 }, HorizontalAlign: { CENTER: 1 } },
    _decorator: { ccclass: x => x, property: () => () => {} },
    isValid: x => !!x && !x.destroyed, winSize: { width: 750 },
    director: { preloadScene() {}, loadScene(name, done) { state.sceneCalls.push({ name, done }); return true; } }
  };
  const Loading = load('Loading', {
    ResourceMgr: { ResourceMgr: { getInstance: () => resources } },
    LanguageMgr: { LanguageMgr: { getInstance: () => language } },
    EventMgr: { EventMgr: { getInstance: () => ({ off() { state.offs++; } }) } },
    Appcfg: { BaseEventName: { Loading: 'loading' } }
  }, {
    cc,
    __extends(ctor, base) { ctor.prototype = Object.create(base.prototype); ctor.prototype.constructor = ctor; },
    __decorate: (decorators, target) => target
  }).default;
  const component = new Loading();
  component.node = node();
  component.labPro = { node: node(), string: '0%', overflow: 0, horizontalAlign: 0 };
  component.loadLogo = () => state.logos++;
  component.startGame = () => state.started++;
  component.onLoad();
  return { component, resources, language, state };
}

test('catalog failure offers an accessible retry before translations are available', () => {
  const h = loading({ catalogError: true });
  h.component.start();
  assert.match(h.component.labPro.string, /Tap to retry/);
  assert.equal(h.state.started, 0);
  assert.equal(h.component.labPro.node.width * .5, 640);
  h.language.ready = true;
  h.component.labPro.node.handlers.get('touch')();
  assert.equal(h.state.started, 1);
  assert.equal(h.state.logos, 1);
  assert.equal(h.component.labPro.node.width, 128);
  h.component.node.handlers.get('touch')();
  assert.equal(h.state.started, 1);
});

test('loading retries failed resources once and shows translated recovery copy', () => {
  const h = loading(); let first = 0; let second = 0;
  const retry = () => first++;
  h.resources.loadErrorHandler(Error('First failed'), retry);
  h.resources.loadErrorHandler(Error('Duplicate failed callback'), retry);
  h.resources.loadErrorHandler(Error('Second failed'), () => second++);
  assert.equal(h.component.labPro.string, '游戏加载失败，点击重试。');
  h.component.node.handlers.get('touch')();
  h.component.node.handlers.get('touch')();
  assert.equal(first, 1);
  assert.equal(second, 1);
  assert.equal(h.state.started, 0);
});

test('failed scene launch can retry and destroying loading releases its handlers', () => {
  const h = loading();
  h.component.loadMainScene();
  h.state.sceneCalls[0].done(Error('Scene asset failed'));
  h.component.retryLoading();
  assert.equal(h.state.sceneCalls.length, 2);
  h.state.sceneCalls[1].done(null);
  h.component.onDestroy();
  assert.equal(h.resources.loadErrorHandler, null);
  assert.equal(h.component.node.handlers.size, 0);
  assert.equal(h.component.labPro.node.handlers.size, 0);
  assert.equal(h.state.offs, 1);
});
