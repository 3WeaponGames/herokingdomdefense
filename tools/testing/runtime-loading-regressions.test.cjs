const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');

function inputFixture(options = {}) {
  const h = harness(options), platform = require('./backend-platform-harness.cjs').harness('editor');
  let swallow = false, success;
  const context = { exports: {}, require: name => name === 'BaseUI' ? { default: function () {} } : { BaseEventName: { blocktouch: 'block' } },
    __extends: (child, parent) => Object.setPrototypeOf(child.prototype, parent.prototype),
    __decorate: (_d, target, key) => key === undefined ? target : undefined,
    cc: { _decorator: { ccclass: x => x, property: () => () => {} }, Node: function () {}, Tween: { stopAllByTarget() {} } } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/UITouch.js'), 'utf8'), context);
  const touch = new context.exports.default();
  touch.node = { _touchListener: { setSwallowTouches(value) { swallow = value; } } }; touch.ndMask = {};
  h.events.push = function (...entries) {
    for (const entry of entries) if (entry[0] === 'block') touch.onBlockTouch(entry[1], entry[2]);
    return Array.prototype.push.apply(this, entries);
  };
  platform.stubs.EventMgr = { EventMgr: { getInstance: () => ({ emit: (...args) => h.events.push(args) }) } };
  platform.stubs.Appcfg = { BaseEventName: { blocktouch: 'block', AdStart: 'ad' } };
  platform.stubs.Config = { UIID: { UITips: 'first' } };
  platform.stubs.UIMgr = { UIMgr: { getInstance: () => h.ui } };
  platform.stubs.PlatformManager = { PlatformManager: { getInstance: () => ({ showVideoAd(id, type, done) { success = done; } }) } };
  return { ...h, touch, sdk: platform.load('SdkMgr').SdkMgr.getInstance(), blocked: () => swallow, finishAd: () => success() };
}

test('busy-ad toast completion cannot release the pending ad input owner', () => {
  const h = inputFixture(); let rewarded = 0, rejected = 0;
  h.sdk.playVideo('first', () => rewarded++, () => {});
  h.sdk.playVideo('second', () => {}, () => rejected++);
  assert.equal(h.blocked(), true); h.requests[0].done(null, h.asset);
  assert.equal(h.blocked(), true); assert.equal(rejected, 0);
  h.finishAd(); h.finishAd();
  assert.equal(h.blocked(), false); assert.equal(rewarded, 1); assert.equal(rejected, 1);
});

test('ad completion, legacy unlock, and transition cancellation release only their own claims', () => {
  let opened;
  const h = inputFixture({ openAni(component, done) { opened = done; } });
  h.sdk.playVideo('ad', () => {}, () => {});
  h.ui.openUI('second', ''); h.requests[0].done(null, h.asset);
  h.touch.onBlockTouch(false, 'transition');
  h.finishAd(); assert.equal(h.blocked(), true);
  h.touch.onBlockTouch(true); assert.equal(h.blocked(), true, 'legacy unlock is not a global reset');
  h.touch.cancelTransition(); assert.equal(h.blocked(), true, 'opening animation still owns input');
  opened(); assert.equal(h.blocked(), false);
});

function harness(options = {}) {
  const h = { requests: [], events: [], timers: new Map(), nextTimer: 1, paused: !!options.paused, pauses: 0, resumes: 0, restarts: 0, reloads: 0, instantiations: 0 };
  class Node {
    constructor(name) { this.name = name; this.children = []; this.active = true; this.isValid = true; this.handlers = {}; this.components = []; }
    set parent(value) { this._parent = value; if (value) value.children.push(this); }
    get parent() { return this._parent; }
    setContentSize(width, height) { this.width = width; this.height = height; }
    getSiblingIndex() { return this.parent.children.indexOf(this); }
    setSiblingIndex(index) { const children = this.parent.children; children.splice(children.indexOf(this), 1); children.splice(index, 0, this); }
    addComponent(Type) { const component = new Type(); component.node = this; this.components.push(component); return component; }
    getComponent() { return this.ui; }
    addChild(node) { node.parent = this; }
    getChildByName(name) { return this.children.find(node => node.name === name); }
    on(event, fn) { this.handlers[event] = fn; }
    removeFromParent() { if (this._parent) this._parent.children = this._parent.children.filter(node => node !== this); this._parent = null; }
    destroy() { this.destroyed = true; this.isValid = false; this.removeFromParent(); }
  }
  Node.EventType = { TOUCH_END: 'touch-end' };
  class Label {}
  Label.Overflow = { RESIZE_HEIGHT: 3, CLAMP: 1 };
  Label.HorizontalAlign = Label.VerticalAlign = { CENTER: 1 };
  class Graphics { rect() {} roundRect() {} fill() {} }
  function Prefab() {}
  const bundle = { load(name, type, done) { h.requests.push({ name, type, done }); }, loadDir(name, type, done) { h.requests.push({ name, type, done }); } };
  const cc = {
    Node, Label, Graphics, Prefab, Asset: function Asset() {}, BlockInputEvents: function () {}, Color: function () {},
    Canvas: {}, winSize: { width: 750, height: 1334 }, macro: { MAX_ZINDEX: 32767 },
    js: { getClassName: cls => cls.name }, isValid: value => !!value && !value.destroyed,
    director: { isPaused: () => h.paused, pause() { h.paused = true; h.pauses++; }, resume() { h.paused = false; h.resumes++; } },
    game: { restart() { h.restarts++; } },
    assetManager: { getBundle: () => options.missingBundle ? null : bundle, loadBundle(name, done) { h.requests.push({ name, bundle: true, done }); } },
    instantiate() {
      h.instantiations++;
      const node = new Node();
      node.ui = {
        node, init() { if (options.init) options.init(this); },
        setUid(value) { this.uid = value; }, getUid() { return this.uid; },
        openAni(done) { if (options.openAni) options.openAni(this, done); else done(); },
        closeAni(done) { done(); }, onClose() {}, refreshUI() {}
      };
      h.lastNode = node;
      return node;
    }
  };
  const modules = {
    LogMgr: { LogMgr: { getInstance: () => ({ error() {}, debug() {} }) } },
    TimeUtils: { TimeUtils: { GetTimeBySecond: () => 0 } },
    ResCacheMgr: { ResCacheMgr: { getInstance: () => ({ getAssets: () => null, addAssets() {}, addAssetKeyToMap() {} }) } },
    BaseUI: { default: function () {} }, Appcfg: { BaseEventName: { blocktouch: 'block', OpenUI: 'open' }, OrderLayer: { pop: 10, Log: 20 } },
    Config: { UIID: { UITouch: 'touch' } },
    EventMgr: { EventMgr: { getInstance: () => ({ emit: (...args) => h.events.push(args) }) } },
    LanguageMgr: { LanguageMgr: { getInstance: () => ({ t: key => key }) } }
  };
  function load(name) {
    const context = {
      exports: {}, require: name => modules[name] || {}, cc, console,
      setTimeout(fn) { const id = h.nextTimer++; h.timers.set(id, fn); return id; },
      clearTimeout(id) { h.timers.delete(id); }
    };
    if (options.browser) context.window = { location: { reload() { h.reloads++; } } };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), context, { filename: name + '.js' });
    modules[name] = context.exports;
    return context.exports;
  }
  load('ArgsParseUtils');
  h.resources = load('ResourceMgr').ResourceMgr.getInstance();
  h.ui = load('UIMgr').UIMgr.getInstance();
  h.ui.uiRoot = new Node('Root');
  h.ui.setConf({ first: { bundleName: 'ui', prefab: 'first', name: 'First', zIndex: 1 }, second: { bundleName: 'ui', prefab: 'second', name: 'Second', zIndex: 2 } });
  h.asset = { addRef() {} };
  h.bundle = bundle;
  h.Prefab = Prefab;
  return h;
}

test('closing during inactive initialization finishes teardown and leaves no registered UI', () => {
  const h = harness({ init(ui) { ui.isclose = true; } });
  h.ui.openUI('first', ''); h.requests[0].done(null, h.asset);
  assert.equal(h.ui.uistatck.has('first'), false); assert.equal(h.lastNode.destroyed, true);
  assert.equal(h.ui.isopening, false); assert.equal(h.ui._openingInputCount, 0);
});

test('reopening during close animation waits for teardown and opens a fresh instance', () => {
  const h = harness(); h.ui.openUI('first', ''); h.requests[0].done(null, h.asset);
  const first = h.ui.uistatck.get('first'); let finishClose;
  first.closeAni = done => finishClose = done;
  h.ui.closeUI(first.node); h.ui.openUI('first', '');
  assert.equal(h.ui.watingOpen.length, 1); finishClose();
  assert.equal(h.requests.length, 2); h.requests[1].done(null, h.asset);
  assert.notEqual(h.ui.uistatck.get('first'), first); assert.equal(first.node.destroyed, true);
  assert.equal(h.ui.watingOpen.length, 0);
});

test('concurrent UI preloads share one instance and complete all waiters', () => {
  const h = harness(); let completed = 0;
  h.ui.preLoadUI('first', () => completed++); h.ui.preLoadUI('first', () => completed++);
  assert.equal(h.requests.length, 1); h.requests[0].done(null, h.asset);
  assert.equal(h.instantiations, 1); assert.equal(completed, 2);
  h.ui.preLoadUI('first', () => completed++); assert.equal(h.requests.length, 1); assert.equal(completed, 3);
  h.ui.openUI('first', ''); assert.equal(h.instantiations, 1); assert.equal(h.ui.uichace.size, 0);
});

test('UI lookup tolerates absent configuration and counts owned multi-instance nodes', () => {
  const h = harness(); assert.equal(h.ui.getUIById('unknown'), null); assert.equal(h.ui.getUIByIdWithNode('unknown', h.ui.uiRoot), null);
  h.ui.UIConf.first.showMult = true;
  h.ui.openUI('first', ''); h.requests[0].done(null, h.asset);
  h.ui.openUI('first', ''); h.requests[1].done(null, h.asset);
  assert.equal(h.ui.getUIShowNum('first'), 2);
  h.ui.closeUI(h.ui.uistatck.get('first').node); assert.equal(h.ui.getUIShowNum('first'), 1);
});

test('resource recovery attempts every independent retry before surfacing a thrown callback', () => {
  const h = harness(); let retried = 0;
  h.resources.runtimeFailures = [{ retry() { throw Error('first retry failed'); } }, { retry() { retried++; } }];
  assert.throws(() => h.resources.resolveRuntimeRecovery(true), /first retry failed/);
  assert.equal(retried, 1); assert.equal(h.resources.runtimeFailures.length, 0);
});

test('UI initialization failure removes the partial instance and allows the waiting screen to open', () => {
  let inits = 0;
  const h = harness({ init() { if (!inits++) throw Error('initializer failed'); } });
  h.ui.openUI('first', ''); h.ui.openUI('second', '');
  assert.throws(() => h.requests[0].done(null, h.asset), /initializer failed/);
  assert.equal(h.ui.uistatck.has('first'), false); assert.equal(h.lastNode.destroyed, true);
  assert.equal(h.requests[1].name, 'second'); assert.equal(h.ui.watingOpen.length, 0);
  h.requests[1].done(null, h.asset);
  assert.equal(h.ui.isopening, false); assert.equal(h.ui.uistatck.has('second'), true);
  const released = h.events[h.events.length - 2];
  assert.deepEqual(released.slice(0, 2), ['block', true]);
  assert(h.events.some(event => event[0] === 'block' && event[1] === false && event[2] === released[2]));
});

test('a throwing open callback releases input and drains the queue while preserving the opened screen', () => {
  const h = harness();
  h.ui.openUIOfCallback('first', '', () => { throw Error('consumer failed'); }); h.ui.openUI('second', '');
  assert.throws(() => h.requests[0].done(null, h.asset), /consumer failed/);
  assert.equal(h.ui.uistatck.get('first').node.destroyed, undefined);
  assert.equal(h.requests[1].name, 'second'); h.requests[1].done(null, h.asset);
  assert.equal(h.ui.isopening, false); assert.equal(h.ui.watingOpen.length, 0);
});

test('overlapping open animations balance input ownership even when one screen closes early', () => {
  const animations = [], h = inputFixture({ openAni(ui, done) { animations.push(done); } });
  h.ui.openUI('first', ''); h.ui.openUI('second', '');
  h.requests[0].done(null, h.asset); h.requests[1].done(null, h.asset);
  const first = h.ui.uistatck.get('first');
  h.ui.closeUI(first.node);
  animations[0]();
  assert.equal(h.events.filter(event => event[0] === 'block' && event[1]).length, 1);
  assert.equal(h.blocked(), true);
  animations[1](); animations[1]();
  assert.equal(h.events.filter(event => event[0] === 'block' && event[1]).length, 2);
  assert.equal(h.blocked(), false);
  assert.equal(h.ui._openingInputCount, 0);
});

test('post-startup resource failures offer recovery without the destroyed Loading handler', () => {
  const h = harness(); let completed = 0;
  h.resources.loadRes('battle', 'map', h.Prefab, () => completed++);
  h.requests[0].done(Error('offline'));
  assert.equal(h.resources.loadErrorHandler, undefined);
  assert.equal(h.resources.runtimeRecoveryNode.name, 'ResourceRecovery');
  assert.equal(h.resources.runtimeCancelLabel.string, 'loading.reload');
  assert.equal(h.paused, true);
  h.resources.resolveRuntimeRecovery(true);
  assert.equal(h.paused, false);
  assert.equal(h.requests.length, 2);
  h.requests[0].done(null, h.asset);
  assert.equal(completed, 0, 'failed attempt must not finish a later request');
  h.requests[1].done(null, h.asset);
  h.requests[1].done(null, h.asset);
  assert.equal(completed, 1);
  assert.equal(h.timers.size, 0);
});

test('runtime bundle and directory failures both retain their original continuation', () => {
  const h = harness({ missingBundle: true }); let result;
  h.resources.loadDir('battle', 'enemies', value => result = value);
  h.requests[0].done(Error('bundle failed'));
  h.resources.resolveRuntimeRecovery(true);
  h.requests[1].done(null, h.bundle);
  h.requests[2].done(Error('directory failed'));
  h.resources.resolveRuntimeRecovery(true);
  const assets = [h.asset];
  h.requests[3].done(null, assets);
  assert.equal(result, assets);
  assert.equal(h.timers.size, 0);
});

test('multiple runtime failures share a prompt, retry once each, and preserve an existing pause', () => {
  const h = harness({ paused: true }); let completed = 0;
  h.resources.loadRes('battle', 'map', h.Prefab, () => completed++);
  h.resources.loadRes('battle', 'enemy', h.Prefab, () => completed++);
  h.requests[0].done(Error('map failed'));
  const prompt = h.resources.runtimeRecoveryNode;
  h.requests[1].done(Error('enemy failed'));
  assert.equal(h.resources.runtimeRecoveryNode, prompt);
  h.resources.resolveRuntimeRecovery(true);
  assert.equal(h.paused, true);
  assert.equal(h.resumes, 0);
  h.requests[2].done(null, h.asset);
  h.requests[3].done(null, h.asset);
  assert.equal(completed, 2);
});

test('reloading a critical resource failure abandons callbacks before restarting', () => {
  const h = harness(); let completed = 0;
  h.resources.loadRes('battle', 'map', h.Prefab, () => completed++);
  h.requests[0].done(Error('map unavailable'));
  h.resources.resolveRuntimeRecovery(false);
  h.requests[0].done(null, h.asset);
  assert.equal(h.restarts, 1);
  assert.equal(completed, 0);
  assert.equal(h.paused, false);
});

test('browser recovery performs a full reload so destroyed singleton state is not reused', () => {
  const h = harness({ browser: true });
  h.resources.loadRes('battle', 'map', h.Prefab, () => {});
  h.requests[0].done(Error('map unavailable'));
  h.resources.resolveRuntimeRecovery(false);
  assert.equal(h.reloads, 1);
  assert.equal(h.restarts, 0);
});

test('a failed UI prefab releases input, cancels safely, and drains the waiting UI queue', () => {
  const h = harness(); let first = 0; let second = 0;
  let transitionCancelled = 0;
  h.ui.uistatck.set('touch', { cancelTransition() { transitionCancelled++; } });
  h.ui.openUIOfCallback('first', '', () => first++);
  h.ui.openUIOfCallback('second', '', () => second++);
  assert.equal(h.ui.watingOpen.length, 1);
  h.requests[0].done(Error('prefab missing'));
  assert.equal(h.ui.isopening, false);
  const released = h.events[h.events.length - 1];
  assert.deepEqual(released.slice(0, 2), ['block', true]);
  assert(h.events.some(event => event[0] === 'block' && event[1] === false && event[2] === released[2]));
  assert.equal(h.resources.runtimeCancelLabel.string, 'loading.cancel');
  h.resources.resolveRuntimeRecovery(false);
  assert.equal(transitionCancelled, 1, 'restore the previous screen behind a closed battle transition');
  assert.equal(h.requests[1].name, 'second');
  h.requests[0].done(null, h.asset);
  h.requests[1].done(null, h.asset);
  assert.equal(first, 0);
  assert.equal(second, 1);
  assert.equal(h.ui.isopening, false);
  assert.equal(h.ui.watingOpen.length, 0);
  assert.equal(h.instantiations, 1);
});

test('retrying a UI enters the queue anew and cannot instantiate an abandoned attempt', () => {
  const h = harness(); let first = 0; let second = 0;
  h.ui.openUIOfCallback('first', '', () => first++);
  h.ui.openUIOfCallback('second', '', () => second++);
  h.requests[0].done(Error('prefab missing'));
  h.resources.resolveRuntimeRecovery(true);
  assert.equal(h.requests[1].name, 'first');
  h.requests[1].done(null, h.asset);
  assert.equal(h.requests[2].name, 'second');
  h.requests[2].done(null, h.asset);
  h.requests[0].done(null, h.asset);
  assert.equal(first, 1);
  assert.equal(second, 1);
  assert.equal(h.instantiations, 2);
  assert.equal(h.ui.isopening, false);
  assert.equal(h.ui.watingOpen.length, 0);
});

test('startup UI failures still use the original Loading retry without abandoning startup', () => {
  const h = harness(); let retry; let completed = 0;
  h.resources.loadErrorHandler = (error, again) => retry = again;
  h.ui.openUIOfCallback('first', '', () => completed++);
  h.requests[0].done(Error('startup UI failed'));
  assert.equal(h.ui.isopening, true);
  assert.equal(h.resources.runtimeRecoveryNode, undefined);
  retry();
  h.requests[1].done(null, h.asset);
  assert.equal(completed, 1);
  assert.equal(h.ui.isopening, false);
});

test('cancelling a transition stops its pending tween and removes the opaque mask', () => {
  const { cc, touch } = require('./backend-ui-harness.cjs').fixture();
  let stopped;
  cc.Tween.stopAllByTarget = target => { stopped = target; };
  touch.ndMask.active = true;
  touch.onBlockTouch(false, 'transition');
  touch.cancelTransition();
  assert.equal(stopped, touch.ndMask);
  assert.equal(touch.ndMask.active, false);
  assert.equal(touch._inputOwners.has('transition'), false);
});
