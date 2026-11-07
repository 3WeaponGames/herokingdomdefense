'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

// Real UI/resource/guide methods, with inert Cocos nodes and deferred asset loads.
function fixture() {
  const requests = [], events = [], scheduled = [], timers = new Map();
  let nextTimer = 0, paused = false, swallow = false, instantiated = 0, touch;
  function Component() {}
  Component.prototype.scheduleOnce = function (fn) { scheduled.push(() => fn.call(this)); };
  Component.prototype.schedule = Component.prototype.scheduleOnce;
  Component.prototype.unscheduleAllCallbacks = function () {};
  class Vec2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } addSelf(p) { this.x += p.x; this.y += p.y; return this; } }
  class Vec3 extends Vec2 {} Vec3.ZERO = new Vec3();
  class Node {
    constructor(name) { this.name = name; this.children = []; this.active = this.isValid = true; this.handlers = {}; this._touchListener = { setSwallowTouches(value) { swallow = value; } }; }
    set parent(value) { this._parent = value; if (value) value.children.push(this); }
    get parent() { return this._parent; }
    addChild(child) { child.parent = this; }
    getComponent() { return this.ui; }
    getChildByName(name) { return this.children.find(child => child.name === name); }
    setContentSize(width, height) { this.width = width; this.height = height; }
    setPosition(x, y) { this.position = typeof x === 'object' ? new Vec2(x.x, x.y) : new Vec2(x, y); }
    getPosition() { return this.position || new Vec2(); }
    convertToNodeSpaceAR(p) { return p; }
    getSiblingIndex() { return this.parent.children.indexOf(this); }
    setSiblingIndex() {}
    on(type, fn) { this.handlers[type] = fn; }
    addComponent(Type) { const component = new Type(); component.node = this; return component; }
    removeFromParent() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this._parent = null; }
    destroy() { if (this.destroyed) return; this.destroyed = true; this.isValid = false; if (this.ui) this.ui.onDestroy(); this.removeFromParent(); }
  }
  Node.EventType = { TOUCH_START: 'start', TOUCH_END: 'end' };
  class Label {} Label.Overflow = { RESIZE_HEIGHT: 3, CLAMP: 1 }; Label.HorizontalAlign = Label.VerticalAlign = { CENTER: 1 };
  class Graphics { rect() {} roundRect() {} fill() {} }
  const bundle = { load(name, type, done) { requests.push({ name, done }); } };
  const cc = { Component, Node, Vec2, Vec3, v2: (x, y) => new Vec2(x, y), v3: point => point, Size: function (width, height) { this.width = width; this.height = height; },
    Label, Graphics, Prefab: function Prefab() {}, Asset: function Asset() {}, BlockInputEvents: function () {}, Color: function () {},
    Mask: { Type: { ELLIPSE: 0, RECT: 1 } }, Enum: x => x, _decorator: { ccclass: x => x, property: () => () => {} },
    Canvas: {}, winSize: { width: 750, height: 1334 }, macro: { MAX_ZINDEX: 32767 }, Tween: { stopAllByTarget() {} },
    js: { getClassName: type => type.name }, isValid: value => !!value && !value.destroyed,
    director: { isPaused: () => paused, pause() { paused = true; }, resume() { paused = false; } },
    assetManager: { getBundle: () => bundle },
    tween() { const tween = {}; for (const name of ['set', 'to', 'delay', 'union', 'repeatForever', 'start']) tween[name] = () => tween; return tween; }
  };
  const modules = {
    Config: { UIID: { UITouch: 'touch' } },
    Appcfg: { BaseEventName: { blocktouch: 'block', OpenUI: 'open', CloseUI: 'close' }, OrderLayer: { pop: 10, Log: 20 } },
    EventMgr: { EventMgr: { getInstance: () => ({ emit(...args) { events.push(args); if (args[0] === 'block' && touch) touch.onBlockTouch(args[1], args[2]); }, off() {}, on() {} }) } },
    LogMgr: { LogMgr: { getInstance: () => ({ error() {}, debug() {} }) } },
    TimeUtils: { TimeUtils: { GetTimeBySecond: () => 0 } },
    ResCacheMgr: { ResCacheMgr: { getInstance: () => ({ getAssets: () => null, addAssets() {}, addAssetKeyToMap() {}, refreshTime() {} }) } },
    LanguageMgr: { LanguageMgr: { getInstance: () => ({ t: key => key }) } },
    BasePlatform: {}, PlatformManager: {}, PoolMgr: {}, TweenMgr: {}
  };
  function load(name) {
    if (modules[name]) return modules[name];
    const exports = modules[name] = {};
    const context = { exports, require: load, cc, sp: { Skeleton: function () {} }, console,
      __extends(child, parent) { Object.setPrototypeOf(child, parent); child.prototype = Object.create(parent.prototype); child.prototype.constructor = child; },
      __decorate(_decorators, target, key) { return key === undefined ? target : undefined; },
      setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), context, { filename: name + '.js' });
    return exports;
  }
  const Guide = load('UIGuide'), Touch = load('UITouch').default;
  touch = new Touch(); touch.node = new Node('Touch'); touch.ndMask = {};
  const ui = load('UIMgr').UIMgr.getInstance(), resources = load('ResourceMgr').ResourceMgr.getInstance();
  ui.uiRoot = new Node('Root'); ui.uistatck.set('touch', touch);
  ui.setConf({ guide: { bundleName: 'ui', prefab: 'guide', name: 'Guide', zIndex: 1 } });
  cc.instantiate = () => {
    instantiated++;
    const node = new Node('Guide'), guide = new Guide.default(); node.ui = guide; guide.node = node;
    guide.hand = new Node('Hand'); guide.hand.parent = node;
    guide.tipBg = {}; guide.ndArr = {}; guide.tipText = {};
    const mask = new Node('Mask'); mask.parent = node;
    const background = new Node('bg'); background.parent = mask;
    guide.mask = { node: mask }; guide.showHand = guide.showTip = () => {};
    return node;
  };
  return { requests, events, scheduled, Guide, touch, ui, resources, cc, asset: { addRef() {} },
    blocked: () => swallow, paused: () => paused, instantiated: () => instantiated,
    flush() { while (scheduled.length) scheduled.shift()(); },
    open(cfg, done) { ui.openUIOfCallback('guide', 'home', done, cfg); } };
}

test('guide configuration has no input side effect; failed load Cancel releases only loading ownership', () => {
  const h = fixture(), cfg = new h.Guide.GuildCfg(); let opened = 0;
  assert.equal(h.blocked(), false);
  h.touch.onBlockTouch(false, 'ad'); h.open(cfg, () => opened++);
  assert.equal(h.touch._inputOwners.size, 2);
  h.requests[0].done(Error('offline')); assert.equal(h.paused(), true);
  h.resources.resolveRuntimeRecovery(false); h.resources.resolveRuntimeRecovery(false);
  assert.deepEqual([...h.touch._inputOwners], ['ad']); assert.equal(h.paused(), false);
  assert.equal(h.instantiated(), 0); assert.equal(opened, 0); assert.equal(h.ui.watingOpen.length, 0);
  h.touch.onBlockTouch(true, 'ad'); assert.equal(h.blocked(), false);
});

test('retry opens once, owns reveal independently, and repeated presses cannot complete a guide twice', () => {
  const h = fixture(), cfg = new h.Guide.GuildCfg(); let opened = 0, completed = 0;
  cfg.callBack = () => completed++; h.open(cfg, () => opened++);
  h.requests[0].done(Error('offline')); h.resources.resolveRuntimeRecovery(true); h.resources.resolveRuntimeRecovery(true);
  assert.equal(h.requests.length, 2);
  h.requests[0].done(null, h.asset); assert.equal(h.instantiated(), 0, 'abandoned load cannot create a guide');
  h.requests[1].done(null, h.asset); h.requests[1].done(null, h.asset);
  assert.equal(opened, 1); assert.equal(h.instantiated(), 1); assert.equal(h.touch._inputOwners.size, 1);
  const guide = h.ui.uistatck.get('guide'); guide.start(); h.flush(); assert.equal(h.blocked(), false);
  guide.resolvePress(true); guide.resolvePress(true); h.flush();
  assert.equal(completed, 1); assert.equal(h.ui.uistatck.has('guide'), false); assert.equal(h.blocked(), false);
});

test('closing or destroying during reveal releases its claim; stale reveal callbacks cannot unlock a later guide', () => {
  const h = fixture(); h.open(new h.Guide.GuildCfg()); h.requests[0].done(null, h.asset);
  const guide = h.ui.uistatck.get('guide'), cfg = new h.Guide.GuildCfg(); cfg.isWeek = cfg.hideMask = true;
  guide.init(cfg); guide.clickTouch(cfg); const oldReveal = h.scheduled.splice(0);
  guide.init(new h.Guide.GuildCfg()); oldReveal.forEach(fn => fn()); assert.equal(h.blocked(), true);
  guide.closeUI(); assert.equal(h.blocked(), false); h.flush();
  h.open(new h.Guide.GuildCfg()); h.requests[1].done(null, h.asset);
  const next = h.ui.uistatck.get('guide'); assert.equal(h.blocked(), true);
  next.node.destroy(); assert.equal(h.blocked(), false); next.release(true); assert.equal(h.blocked(), false);
});

test('retry after the UI root is destroyed neither acquires guide ownership nor advances its callback', () => {
  const h = fixture(); let opened = 0; h.open(new h.Guide.GuildCfg(), () => opened++);
  h.requests[0].done(Error('offline')); h.ui.uiRoot.destroy();
  h.resources.resolveRuntimeRecovery(true);
  assert.equal(h.requests.length, 1); assert.equal(h.instantiated(), 0); assert.equal(opened, 0); assert.equal(h.blocked(), false);
});

test('a maskless movement guide releases its reveal claim without unlocking another input owner', () => {
  const h = fixture(), cfg = new h.Guide.GuildCfg();
  cfg.clickType = 1; cfg.hideMask = true;
  cfg.startNode = { convertToWorldSpaceAR: () => ({ x: 0, y: 0 }) };
  cfg.endNode = { convertToWorldSpaceAR: () => ({ x: 20, y: 30 }) };
  h.open(cfg); h.requests[0].done(null, h.asset); h.touch.onBlockTouch(false, 'ad');
  h.ui.uistatck.get('guide').moveTouch(cfg);
  assert.deepEqual([...h.touch._inputOwners], ['ad']);
  h.touch.onBlockTouch(true, 'ad'); assert.equal(h.blocked(), false);
});
