const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');

function harness(options = {}) {
  const h = { requests: [], events: [], timers: new Map(), nextTimer: 1, paused: !!options.paused, pauses: 0, resumes: 0, restarts: 0, reloads: 0, instantiations: 0 };
  class Node {
    constructor(name) { this.name = name; this.children = []; this.active = true; this.handlers = {}; this.components = []; }
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
    destroy() { this.destroyed = true; }
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
      node.ui = { node, init() {}, setUid() {}, openAni(done) { done(); }, refreshUI() {} };
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
  assert.deepEqual(h.events[h.events.length - 1], ['block', true]);
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
  const source = fs.readFileSync(path.join(root, 'assets/_script/UITouch.js'), 'utf8');
  const method = source.match(/_ctor\.prototype\.cancelTransition = (function \(\) \{[\s\S]*?\n  \});/)[1];
  let stopped; let input;
  const cancelTransition = vm.runInNewContext('(' + method + ')', { cc: { Tween: { stopAllByTarget(target) { stopped = target; } } } });
  const touch = { ndMask: { active: true }, onBlockTouch(value) { input = value; } };
  cancelTransition.call(touch);
  assert.equal(stopped, touch.ndMask);
  assert.equal(touch.ndMask.active, false);
  assert.equal(input, true);
});
