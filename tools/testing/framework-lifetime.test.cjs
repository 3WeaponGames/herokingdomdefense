'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');

function harness() {
  const h = { requests: [], scheduled: [], time: 0, modules: {}, closes: 0 };
  function Component() { this.node = new Node(); }
  Component.prototype.scheduleOnce = function (fn) { h.scheduled.push(fn); };
  class Node {
    constructor(name) { this.name = name; this.parent = null; this.isValid = true; this.children = []; this.active = true; }
    destroy() { this.destroyed = true; this.isValid = false; }
    removeFromParent() { this.parent = null; }
    getComponent() { return this.ui; }
    addChild(node) { node.parent = this; this.children.push(node); }
    getChildByName(name) { return this.children.find(node => node.name === name); }
  }
  Node.EventType = { TOUCH_END: 'touch-end' };
  function Asset() { this.refCount = 0; this.releases = 0; }
  Asset.prototype.addRef = function () { this.refCount++; return this; };
  Asset.prototype.decRef = function () { this.refCount = Math.max(0, this.refCount - 1); this.releases++; return this; };
  function Prefab() { Asset.call(this); }
  Prefab.prototype = Object.create(Asset.prototype); Prefab.prototype.constructor = Prefab;
  function Texture2D() { Asset.call(this); }
  Texture2D.prototype = Object.create(Asset.prototype); Texture2D.prototype.constructor = Texture2D;
  function SpriteFrame(texture) { Asset.call(this); this.texture = texture; }
  SpriteFrame.prototype = Object.create(Asset.prototype); SpriteFrame.prototype.constructor = SpriteFrame;
  SpriteFrame.prototype.getTexture = function () { return this.texture; };
  const bundle = { load(file, type, done) { h.requests.push({ file, type, done }); } };
  h.cc = {
    Component, Node, Asset, Prefab, Texture2D, SpriteFrame, Enum() {},
    _decorator: { ccclass: value => value, property: () => () => {} },
    js: { getClassName: value => 'cc.' + value.name },
    isValid: value => !!value && !value.destroyed && value.isValid !== false,
    instantiate: value => new Node(value.name),
    assetManager: { getBundle: () => bundle, loadRemote(url, options, done) { h.requests.push({ url, options, done }); } }
  };
  h.modules.TimeUtils = { TimeUtils: { GetTimeBySecond: () => h.time } };
  h.modules.PlatformManager = { PlatformManager: { currentPlatform: 'web' } };
  h.modules.BasePlatform = { Platform: { BYTEDANCE: 'byte' } };
  h.modules.UIMgr = { UIMgr: { getInstance: () => ({ closeUI() { h.closes++; } }) } };
  h.modules.LogMgr = { LogMgr: { getInstance: () => ({ error() {} }) } };
  h.load = name => {
    const context = {
      cc: h.cc, sp: { Skeleton: function () {} }, exports: h.modules[name] || (h.modules[name] = {}), console: { log() {}, warn() {}, error() {} },
      require: key => h.modules[key] || (h.modules[key] = {}),
      __extends(child, parent) { Object.setPrototypeOf(child, parent); child.prototype = Object.create(parent.prototype); child.prototype.constructor = child; },
      __decorate(decorators, target, key) { return key ? undefined : target; },
      setTimeout: () => 1, clearTimeout() {}
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), context, { filename: name + '.js' });
    return (h.modules[name] = context.exports);
  };
  h.events = h.load('EventMgr').EventMgr.getInstance();
  h.Manager = h.load('BaseMgr').default;
  h.load('ArgsParseUtils');
  h.resources = h.load('ResourceMgr').ResourceMgr.getInstance();
  h.cache = h.load('ResCacheMgr').ResCacheMgr.getInstance();
  h.Ctrl = h.load('BaseCtrl').default;
  h.UI = h.load('BaseUI').default;
  h.asset = () => new Prefab();
  h.key = (bundle, file, type, asset) => new h.modules.ResourceMgr.ResCacheKey(bundle, file, type, asset);
  h.expire = () => { h.time += 20; h.cache.autoRelease(); };
  return h;
}

test('expired owner load failures do not pause unrelated gameplay or offer abandoned retries', () => {
  for (const kind of ['controller', 'ui']) {
    for (const method of ['loadPrefab', 'loadTexture2D', 'loadSpriteFrame', 'loadRemoteSpriteFrame', 'loadFromRes']) {
      const h = harness(), owner = kind === 'ui' ? new h.UI() : new h.Ctrl();
      const prompts = []; h.resources.showRuntimeRecovery = (...args) => prompts.push(args);
      if (kind === 'ui') owner.init();
      if (method === 'loadRemoteSpriteFrame') owner[method]('https://example.invalid/avatar.png', () => {});
      else if (method === 'loadFromRes') owner[method]('unused', h.cc.Prefab, () => {});
      else owner[method]('battle', 'unused', () => {});
      if (kind === 'ui') owner.closeUI(); else owner.onDestroy();
      h.requests.shift().done(Error('offline')); assert.equal(prompts.length, 0, kind + ':' + method);
    }
  }
  const h = harness(), owner = new h.Ctrl(), prompts = [];
  h.resources.showRuntimeRecovery = (...args) => prompts.push(args);
  owner.loadPrefab('battle', 'current', () => {}); h.requests.shift().done(Error('offline'));
  assert.equal(prompts.length, 1, 'current owner still receives recovery');
});

test('closing tutorial presses resolve once even on callback failure; movement guides keep their repeat contract', () => {
  for (const throws of [false, true]) {
    const h = harness(), handlers = {};
    h.cc.Node.EventType.TOUCH_START = 'touch-start';
    h.cc.Node.prototype.on = function (name, callback) { handlers.root = callback; };
    const Guide = h.load('UIGuide').default, guide = new Guide(); let choices = 0;
    guide.mask = { node: { active: false, getChildByName: () => ({ on(name, callback) { handlers.bg = callback; } }) } };
    guide.cfg = { clickType: 0, delay: 1, isWeek: true, callBack() { choices++; if (throws) throw Error('decision failed'); } };
    guide.start(); guide.canClose = true;
    if (throws) assert.throws(() => handlers.bg({}), /decision failed/); else handlers.bg({});
    handlers.bg({}); handlers.root({}); assert.equal(choices, 1); assert.equal(guide.isclose, true);
  }
  const h = harness(), guide = new (h.load('UIGuide').default)(); let moves = 0;
  guide.cfg = { callBack() { moves++; } }; guide.resolvePress(false); guide.resolvePress(false);
  assert.equal(moves, 2); assert.equal(guide.isclose, false);
});

test('event dispatch preserves surviving listeners while additions wait and duplicate removals are complete', () => {
  const h = harness(), target = {}, seen = [];
  function first(value) { seen.push('first:' + value); h.events.off('tick', target, first); h.events.on('tick', target, added); }
  function added() { seen.push('added'); }
  function second() { seen.push('second'); }
  h.events.on('tick', target, first); h.events.on('tick', target, second);
  h.events.emit('tick', 7);
  assert.deepEqual(seen, ['first:7', 'second']);
  h.events.emit('tick');
  assert.deepEqual(seen.slice(2), ['second', 'added']);
  h.events.on('duplicate', target, second, true); h.events.on('duplicate', target, second, true);
  h.events.off('duplicate', target, second);
  assert.equal(h.events.getEventNum('duplicate'), 0);
});

test('event removal during dispatch cancels removed listeners and inherited property names are ordinary keys', () => {
  const h = harness(), seen = [];
  function later() { seen.push('later'); }
  h.events.on('__proto__', null, () => { seen.push('first'); h.events.off('__proto__', null, later); });
  h.events.on('__proto__', null, later);
  h.events.emit('__proto__');
  assert.deepEqual(seen, ['first']);
  h.events.on('clear', null, () => h.events.removeAll()); h.events.on('clear', null, later);
  h.events.emit('clear');
  assert.deepEqual(seen, ['first']);
  const manager = new h.Manager(); manager.addEvent('owned', later); manager.onDestroy(); h.events.emit('owned');
  assert.deepEqual(seen, ['first']);
});

test('resource lookup reuses a live asset without erasing or repeating closed-owner release credits', () => {
  const h = harness(), asset = h.asset(); let first, second;
  h.resources.loadRes('battle', 'unit', h.cc.Prefab, value => first = value, true);
  h.requests.shift().done(null, asset);
  h.cache.refreshTime([h.key('battle', 'unit', h.cc.Prefab, asset)]);
  h.resources.loadRes('battle', 'unit', h.cc.Prefab, value => second = value, true);
  assert.equal(h.requests.length, 0); assert.equal(first, second); assert.equal(asset.refCount, 2);
  h.expire(); assert.equal(asset.refCount, 1);
  h.time += 3 * 86400; h.cache.autoRelease(); assert.equal(asset.refCount, 1);
  h.cache.refreshTime([h.key('battle', 'unit', h.cc.Prefab, asset)]);
  h.expire(); assert.equal(asset.refCount, 0); assert.equal(asset.releases, 2);
});

test('temporary and permanent acquisitions share the asset and release each permanent owner only once', () => {
  const h = harness(), asset = h.asset();
  h.resources.loadRes('battle', 'unit', h.cc.Prefab, () => {}, true);
  h.requests.shift().done(null, asset);
  h.resources.loadRes('battle', 'unit', h.cc.Prefab, () => {}, false, 10, 'scene-a');
  h.resources.loadRes('battle', 'unit', h.cc.Prefab, () => {}, false, 10, 'scene-b');
  assert.equal(h.requests.length, 0); assert.equal(asset.refCount, 3);
  h.cache.releaseAssetsFromMap('scene-a'); h.cache.releaseAssetsFromMap('scene-a');
  assert.equal(asset.refCount, 2);
  h.cache.refreshTime([h.key('battle', 'unit', h.cc.Prefab, asset)]); h.expire();
  assert.equal(asset.refCount, 1);
  h.cache.releaseAssetsFromMap('scene-b'); assert.equal(asset.refCount, 0);
});

test('concurrent reloads of the same path keep release accounting attached to the returned asset identity', () => {
  const h = harness(), old = h.asset(), current = h.asset();
  h.resources.loadRes('battle', 'unit', h.cc.Prefab, () => {}, true);
  h.resources.loadRes('battle', 'unit', h.cc.Prefab, () => {}, true);
  h.requests.shift().done(null, old); h.requests.shift().done(null, current);
  h.cache.refreshTime([h.key('battle', 'unit', h.cc.Prefab, current)]); h.expire();
  assert.equal(current.refCount, 0); assert.equal(old.refCount, 1);
  h.cache.refreshTime([h.key('battle', 'unit', h.cc.Prefab, old)]); h.expire();
  assert.equal(old.refCount, 0);
});

test('remote requests always return SpriteFrames and retain their texture until the last frame owner releases', () => {
  const h = harness(), texture = new h.cc.Texture2D(); let first, second;
  h.resources.loadRemoteSpriteFrame('https://example.invalid/avatar.png', value => first = value, true);
  h.requests.shift().done(null, texture);
  h.resources.loadRemoteSpriteFrame('https://example.invalid/avatar.png', value => second = value, true);
  assert.equal(first, second); assert.ok(first instanceof h.cc.SpriteFrame);
  assert.equal(first.refCount, 2); assert.equal(texture.refCount, 1); assert.equal(h.requests.length, 0);
  h.cache.refreshTime([h.key('', 'https://example.invalid/avatar.png', h.cc.SpriteFrame, first)]); h.expire();
  assert.equal(first.refCount, 1); assert.equal(texture.refCount, 1);
  h.cache.refreshTime([h.key('', 'https://example.invalid/avatar.png', h.cc.SpriteFrame, first)]); h.expire(); h.expire();
  assert.equal(first.refCount, 0); assert.equal(texture.refCount, 0); assert.equal(texture.releases, 1);
});

test('a destroyed controller releases a late load and forces release of cached resources', () => {
  const h = harness(), controller = new h.Ctrl(), asset = h.asset(); let applied = 0;
  controller.cache = true;
  controller.loadPrefab('battle', 'unit', () => applied++);
  controller.onDestroy(); h.requests.shift().done(null, asset); h.expire();
  assert.equal(applied, 0); assert.equal(controller.resArray.length, 0); assert.equal(asset.refCount, 0);
  const second = new h.Ctrl(); second.cache = true;
  second.loadPrefab('battle', 'next', () => applied++); const next = h.asset(); h.requests.shift().done(null, next);
  second.onDestroy(); h.expire(); assert.equal(next.refCount, 0);
});

test('closed and reopened UI rejects the old lifetime callback while retaining the new owner', () => {
  const h = harness(), ui = new h.UI(), asset = h.asset(), applied = [];
  ui.init(); ui.loadPrefab('battle', 'unit', () => applied.push('old')); ui.closeUI();
  ui.init(); ui.loadPrefab('battle', 'unit', () => applied.push('current'));
  h.requests.shift().done(null, asset); h.requests.shift().done(null, asset); h.expire();
  assert.deepEqual(applied, ['current']); assert.equal(asset.refCount, 1);
  h.scheduled.shift()(); assert.equal(h.closes, 0, 'old scheduled close cannot close the reopened UI');
  ui.closeUI(); ui.onDestroy(); h.expire(); assert.equal(asset.refCount, 0);
});

test('resource-folder wrappers use the canonical cache key and release owner counts once', () => {
  const h = harness(), ctrl = new h.Ctrl(), asset = h.asset();
  ctrl.loadFromRes('unit', h.cc.Prefab, () => {});
  h.requests.shift().done(null, asset);
  ctrl.loadFromRes('unit', h.cc.Prefab, () => {});
  assert.equal(ctrl.resArray.length, 1); assert.equal(ctrl.resArray[0].defCount, 2);
  ctrl.onDestroy(); h.expire(); assert.equal(asset.refCount, 0);
});

const engine = process.env.COCOS_ENGINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const poolSource = path.join(engine, 'extensions/ccpool/CCNodePool.js');
test('actual Creator NodePool honors the watermark, ignores duplicate returns and tears down owned templates', {
  skip: !fs.existsSync(poolSource) && !process.env.COCOS_ENGINE_ROOT ? 'Install Creator 2.4.13 for actual NodePool integration' : false
}, () => {
  const h = harness(), context = { cc: h.cc, module: { exports: {} }, CC_DEV: false, console, require: () => ({}) };
  vm.runInNewContext(fs.readFileSync(poolSource, 'utf8'), context);
  const Pool = h.load('PoolMgr').PoolNode, pool = new Pool(), template = new h.cc.Node('owned');
  pool.init(template, 0); pool.setWaterMark(1);
  const first = new h.cc.Node(), extra = new h.cc.Node(); pool.freeNode(first); pool.freeNode(first); pool.freeNode(extra);
  assert.equal(pool._nodes.size(), 1); assert.equal(first.destroyed, undefined); assert.equal(extra.destroyed, true);
  assert.equal(pool.getNode(), first); pool.freeNode(first); pool.destory();
  assert.equal(template.destroyed, true); assert.equal(first.destroyed, true); assert.equal(pool.getNode(), null);
  const borrowed = new h.cc.Node('authored'); borrowed.parent = new h.cc.Node('scene');
  const authored = new Pool(); authored.init(borrowed, 1); authored.destory(); assert.equal(borrowed.destroyed, undefined);
});

function decisions(h) {
  const ads = [];
  h.modules.SdkMgr = { AdType: { AdFreeTime: 1 }, SdkMgr: { getInstance: () => ({ playVideo(type, success, failure) { ads.push({ success, failure }); } }) } };
  function button() { return { on(event, callback, target) { this.press = () => callback.call(target); } }; }
  const Video = h.load('KinghtFallUIVideoTips').default, ui = new Video();
  const outcomes = [];
  ui.onOpened(); ui.init(1, value => outcomes.push(value));
  ui.labTitle = {}; ui.labInfo = {}; ui.sprIcon = {}; ui.T = value => value;
  ui.btnClose = button(); ui.btnVideo = button(); ui.start();
  return { ui, ads, outcomes, button };
}

test('declining an ad offer cancels its late success and repeated taps cannot resolve a decision twice', () => {
  const h = harness(), f = decisions(h);
  f.ui.btnVideo.press(); f.ui.btnVideo.press(); assert.equal(f.ads.length, 1);
  f.ui.btnClose.press(); f.ui.btnClose.press(); f.ads[0].success();
  assert.deepEqual(f.outcomes, [false]); assert.equal(h.scheduled.length, 1);
});

test('ad failure permits a retry while a previous lifetime completion cannot change a reopened decision', () => {
  const h = harness(), f = decisions(h);
  f.ui.btnVideo.press(); f.ads[0].failure(); f.ui.btnVideo.press(); assert.equal(f.ads.length, 2);
  f.ui.closeUI(); f.ui.onOpened(); const current = [];
  f.ui.init(1, value => current.push(value)); f.ui.btnVideo.press();
  f.ads[1].success();
  assert.equal(f.ui._decisionPending, true); assert.deepEqual(current, []);
  f.ads[2].success(); f.ads[2].success(); assert.deepEqual(current, [true]);
});

test('battle retry and building branch handlers resolve exactly one choice', () => {
  const h = harness(), f = decisions(h), outcomes = [];
  const Back = h.load('KinghtFallUIGameBack').default, back = new Back();
  back.onOpened(); back.init(value => outcomes.push(value)); back.addCoin = 10;
  back.btnBreak = f.button(); back.btnNewGame = f.button(); back.initBtnEvent();
  back.btnNewGame.press(); back.btnBreak.press(); f.ads[0].success(); assert.deepEqual(outcomes, [0]);
  const rows = [];
  h.cc.instantiate = () => {
    const row = f.button(); row.children = [];
    row.getChildByName = () => ({ getComponent: () => ({}) }); rows.push(row); return row;
  };
  const Branch = h.load('KinghtFallUIBuildSel').default, branch = new Branch(), chosen = [];
  h.modules.KinghtFallConfig.KinghtFallBundelName = { IconBuild: 'build' };
  branch.onOpened(); branch.ndItem = {}; branch.ndParent = {}; branch.loadSpriteFrame = () => {}; branch.T = value => value;
  h.modules.LanguageMgr.LanguageMgr = { getInstance: () => ({ format: value => value }) };
  branch.init({ buildInfo: { cfg: { BranchBuild: [1, 2] } }, buildCfg: { levelList: [{ BuildSliverCost: 1 }, { BuildSliverCost: 1 }] } }, value => chosen.push(value));
  branch.initView(); rows[0].press(); rows[1].press(); assert.deepEqual(chosen, [1]);
});

test('onOpen exceptions still finish the owned input callback and decision callback failures close once', () => {
  const h = harness(), ui = new h.UI(); let released = 0;
  ui.onOpened(); ui.onOpen = () => { throw Error('open failed'); };
  assert.throws(() => ui.openAni(() => released++), /open failed/); assert.equal(released, 1);
  assert.throws(() => ui.finishDecision(() => { throw Error('decision failed'); }, true), /decision failed/);
  assert.equal(ui.isclose, true); assert.equal(h.scheduled.length, 1);
  assert.equal(ui.finishDecision(() => assert.fail('duplicate decision'), false), false);
});

test('startup cloud denial remains a retryable error without rerunning initialized startup systems', () => {
  const h = harness(), callbacks = [], stages = [], starts = [];
  h.cc.debug = { setDisplayStats() {} }; h.cc.game = { addPersistRootNode() {} }; h.cc.winSize = { width: 750 };
  h.modules.PlatformManager.PlatformManager.getInstance = () => ({ init() { starts.push('platform'); } });
  h.cache.init = () => starts.push('cache');
  h.modules.UIMgr.UIMgr.getInstance = () => ({ addUICnf() {}, Init() {} });
  h.modules.TestMode = { TestMode: { getInstance: () => ({ init() { starts.push('test-mode'); } }) } };
  h.modules.AudioMgr = { AudioMgr: { getInstance: () => ({ init() { starts.push('audio-stub'); } }) } };
  h.modules.SdkMgr = { SdkMgr: { getInstance: () => ({ requestCheckVersion: done => done() }) } };
  h.modules.ServerDataMgr = { ServerdataMgr: { init: done => callbacks.push(done) } };
  h.modules.Appcfg = { BaseEventName: { Loading: 'loading' }, LoadingProcess: { StartLoading: 5 } };
  h.modules.Config = { UICF: {}, AudioCF: {} };
  h.modules.PlatformSetting = { PlatformSetting: { currentApp: 'Main', currentPlatform: 'test' } };
  h.modules.LanguageMgr.LanguageMgr = { getInstance: () => ({ ready: true, t: key => key }) };
  const Loading = h.load('Loading').default, loading = new Loading();
  loading.uiRoot = new h.cc.Node(); loading.progressBar = {};
  loading.labPro = { node: { width: 100, height: 20, scaleX: 1 }, overflow: 0, horizontalAlign: 0 };
  h.cc.Label = { Overflow: { SHRINK: 1 }, HorizontalAlign: { CENTER: 1 } };
  loading.setProcessLoad = value => stages.push(value);
  loading.startGame(); callbacks[0](Error('cloud denied'));
  assert.deepEqual(stages, []); assert.equal(loading.loadingRetries.length, 1);
  loading.retryLoading(); assert.equal(callbacks.length, 2);
  callbacks[1](null);
  assert.deepEqual(stages, [5]);
  assert.deepEqual(starts, ['platform', 'cache', 'test-mode', 'audio-stub']);
});

test('input-release errors cannot prevent scheduled or direct UI teardown', () => {
  const h = harness(), first = new h.UI(); first.onOpened();
  first._releaseOpeningInput = () => { throw Error('input subscriber failed'); };
  assert.throws(() => first.closeUI(), /input subscriber failed/);
  assert.equal(h.scheduled.length, 1); h.scheduled.shift()(); assert.equal(h.closes, 1);
  h.modules.Config = {}; h.modules.Appcfg = { BaseEventName: {}, OrderLayer: {} };
  const Manager = h.load('UIMgr').UIMgr, manager = new Manager(), second = new h.UI();
  second.node.ui = second; second.uid = 'second'; second.layer = 1;
  manager.UIConf = { second: { zIndex: 1 } }; manager.uistatck.set('second', second);
  second._releaseOpeningInput = () => { throw Error('input subscriber failed'); };
  assert.throws(() => manager.closeUI(second.node), /input subscriber failed/);
  assert.equal(second.node.destroyed, true); assert.equal(manager.uistatck.has('second'), false);
  assert.doesNotThrow(() => manager.closeUI(second.node));
});

test('cached UI event bindings are inactive while closed and restore once per reopen', () => {
  const h = harness();
  h.modules.Config = { UIID: { UITouch: 'UITouch' } };
  h.modules.Appcfg = { BaseEventName: { blocktouch: 'block', OpenUI: 'open', CloseUI: 'close' }, OrderLayer: { pop: 100, Log: 200, main: 0 } };
  const Manager = h.load('UIMgr').UIMgr, manager = new Manager(); Manager.instance = manager;
  manager.uiRoot = new h.cc.Node('root'); manager.UIConf = { cached: { name: 'Cached', zIndex: 1 } };
  const ui = new h.UI(); ui.node.ui = ui; ui.cache = true; ui.uid = 'cached'; ui.layer = 1; ui.onOpened();
  let seen = 0; const callback = () => seen++;
  ui.addEvent('state', callback); manager.uistatck.set('cached', ui);
  for (let i = 0; i < 8; i++) {
    manager.closeUI(ui.node); h.events.emit('state'); assert.equal(seen, i);
    manager.openUI('cached', ''); ui.addEvent('state', callback); h.events.emit('state'); assert.equal(seen, i + 1);
    assert.equal(ui.eventList.length, 1); assert.equal(h.events.getEventNum('state'), 1);
  }
  ui.onDestroy(); h.events.emit('state'); assert.equal(seen, 8); assert.equal(h.events.getEventNum('state'), 0);
});
