'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
const prefab = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallPrefabs/home/homectrl/KinghtFallHomeBattleCtrl.prefab'), 'utf8'));

function harness(deferred = false) {
  let serial = 0;
  class Node {
    constructor(name, parent = null) {
      Object.assign(this, { name, uuid: name + '-' + serial++, parent: null, children: [], components: [], listeners: [], active: true,
        x: 0, y: 0, width: 100, height: 100, anchorX: .5, anchorY: .5, scale: 1, paused: false });
      if (parent) this.setParent(parent);
    }
    get activeInHierarchy() { return this.active && (!this.parent || this.parent.activeInHierarchy); }
    get childrenCount() { return this.children.length; }
    get position() { return { x: this.x, y: this.y }; }
    setParent(parent) { this.parent = parent; parent.children.push(this); }
    getChildByName(name) { return this.children.find(child => child.name === name); }
    getComponent(Type) { return this.components.find(component => component instanceof Type) || null; }
    attr(values) { Object.assign(this, values); }
    setScale(value) { this.scale = value; }
    convertToWorldSpaceAR(point) { const p = { x: point.x + this.x, y: point.y + this.y }; return this.parent ? this.parent.convertToWorldSpaceAR(p) : p; }
    convertToNodeSpaceAR(point) { const origin = this.convertToWorldSpaceAR({ x: 0, y: 0 }); return { x: point.x - origin.x, y: point.y - origin.y }; }
    getBoundingBoxToWorld() {
      const p = this.convertToWorldSpaceAR({ x: 0, y: 0 });
      return { contains: q => Math.abs(q.x - p.x) <= this.width / 2 && Math.abs(q.y - p.y) <= this.height / 2 };
    }
    on(type, fn, target, capture = false) { this.listeners.push({ type, fn, target, capture }); }
    off(type, fn, target, capture = false) { this.listeners = this.listeners.filter(v => !(v.type === type && v.fn === fn && v.target === target && v.capture === capture)); }
    emit(type, event, capture = false) { for (const v of this.listeners.slice()) if (v.type === type && v.capture === capture) v.fn.call(v.target, event); }
    pauseSystemEvents() { this.paused = true; }
    resumeSystemEvents() { this.paused = false; }
  }
  Node.EventType = { TOUCH_START: 'start', TOUCH_END: 'end', TOUCH_CANCEL: 'cancel' };
  function Button() { this.interactable = true; this.enabledInHierarchy = true; }
  Button.Transition = {};
  Button.prototype._onTouchBegan = function () { this._pressed = true; };
  Button.prototype._onTouchEnded = function (event) { this._pressed = false; event.stopPropagation(); };
  Button.prototype._resetState = function () { this._pressed = false; };
  Button.prototype.update = Button.prototype.onEnable = Button.prototype.onDisable = function () {};
  function Base() {}
  Base.prototype.onDestroy = function () {};
  function Item() {}
  Item.prototype.initView = function (reward) { this.reward = JSON.parse(JSON.stringify(reward)); };
  function Layout() {}
  Layout.prototype.updateLayout = function () {};
  const uiRoot = new Node('uiRoot'), home = new Node('home', uiRoot), battleNode = new Node('battle', home), overlay = new Node('non-swallow-overlay', uiRoot);
  const state = { sounds: 0, tweens: new Map(), loads: [] };
  const cc = { Node, Button, Layout, v2: (x = 0, y = 0) => ({ x, y }), Vec2: { ZERO: { x: 0, y: 0 } }, winSize: { width: 750, height: 1334 },
    isValid: node => !!node && !node.destroyed, _decorator: { ccclass: t => t, property: () => () => {}, menu: () => t => t },
    Class: { Attr: { setClassAttr() {} } }, Tween: { stopAllByTarget(node) { state.tweens.delete(node); } },
    tween(node) { const api = { set(values) { Object.assign(node, values); return api; }, to(duration, values) { state.tweens.set(node, { duration, values }); return api; }, start() { return api; } }; return api; },
    instantiate() { const node = new Node('reward'); const item = new Item(); node.components.push(item); return node; }
  };
  const modules = {
    BaseCtrl: { default: Base }, KinghtFallItemGood: { default: Item },
    AudioMgr: { AudioMgr: { getInstance: () => ({ playAudioButtonClicked() { state.sounds++; } }) } },
    UIMgr: { UIMgr: { getInstance: () => ({ uiRoot }) } },
    KinghtFallPlayerMgr: { KinghtFallPlayerMgr: { getInstance: () => ({ getUserData: () => ({ getStageInfo: () => 0, getStageReward: () => false }) }) } },
    KinghtFallConfig: { KinghtFallPoolName: {}, KinghtFallBundelName: {}, KinghtFallPrefabName: {} },
    PoolMgr: { PoolMgr: { getInstance: () => ({ getNode: () => null, creatrePool() {}, freeNode() {} }) } }
  };
  function load(name) {
    const exports = {};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), {
      exports, require: id => modules[id] || {}, cc, sp: { Skeleton: function () {} }, console,
      __extends: (ctor, base) => { Object.setPrototypeOf(ctor.prototype, base.prototype); },
      __decorate: (decorators, target, key) => key === undefined ? target : undefined,
      __spreadArrays: (...args) => [].concat(...args)
    }, { filename: name + '.js' });
    return exports;
  }
  const BaseButton = load('BaseButton').BaseButton;
  const controller = new (load('KinghtFallHomeBattleCtrl').default)();
  controller.node = battleNode; controller.ndBoxShow = new Node('boxes', battleNode);
  controller.cfgList = [{ ChallengeReward: [[[2001, 100]], [[2002, 20]], [[2004, 50]]] }]; controller.selectStage = 1;
  controller.newSel = controller.onUpdateTask = controller.scheduleOnce = function () {};
  controller.loadPrefab = (bundle, name, done) => state.loads.push(done);
  const chests = [0, 1, 2].map(index => {
    const node = new Node('ndTag' + (index + 1), controller.ndBoxShow); node.x = 100 + index * 200; node.y = 100;
    const button = new BaseButton(); button.node = node;
    const authored = prefab.find(value => value._name === node.name);
    const component = authored._components.map(ref => prefab[ref.__id__]).find(value => value.__type__ === '08526eaTJpCXYM9VKuRXAnP');
    if (component.invertTime !== undefined) button.invertTime = component.invertTime;
    node.components.push(button);
    node.on('end', button._onTouchEnded, button);
    node.on('end', () => controller.onBoxClick(index));
    return node;
  });
  const popup = new Node('ndTips', controller.ndBoxShow); popup.active = false; popup.y = 220;
  const layout = new Node('ndLayout', popup); layout.width = 200; layout.components.push(new Layout());
  if (!deferred) { const item = new Node('reward', layout); item.components.push(new Item()); }
  function event(target, point) { return { target, getLocation: () => point, touch: { getLocation: () => point, getID: () => 1 }, stopPropagation() { this.stopped = true; } }; }
  function dispatch(target, point) { const e = event(target, point); uiRoot.emit('end', e, true); if (!target.paused) target.emit('end', e); return e; }
  function clickChest(index) {
    const node = chests[index], point = node.convertToWorldSpaceAR({ x: 0, y: 0 });
    node.components[0]._onTouchBegan(event(node, point));
    // Creator dispatches the same physical touch to non-swallow overlays first.
    dispatch(overlay, point); if (!node.paused) dispatch(node, point);
  }
  return { controller, chests, popup, layout, uiRoot, home, overlay, state, Item, BaseButton, Node, event, dispatch, clickChest };
}

test('chest previews toggle immediately before an animation or cooldown update can run', () => {
  const h = harness(); h.controller.bindBoxRewardDismissal();
  h.clickChest(0); assert.equal(h.popup.active, true, 'opening tap must not also dismiss');
  assert.ok(h.state.tweens.has(h.popup), 'test closes while opening animation is pending');
  h.clickChest(0); assert.equal(h.popup.active, false); assert.equal(h.popup.tagUUID, null);
  assert.equal(h.chests[0].paused, false); assert.equal(h.state.tweens.has(h.popup), false);
  h.clickChest(0); assert.equal(h.popup.active, true, 'a third immediate tap reopens');
});

test('different chests switch previews despite duplicate non-swallow overlay touch delivery', () => {
  const h = harness(); h.controller.bindBoxRewardDismissal();
  h.clickChest(0); h.clickChest(1);
  assert.equal(h.popup.active, true); assert.equal(h.popup.tagUUID, h.chests[1].uuid);
  assert.deepEqual(h.layout.children[0].getComponent(h.Item).reward, { id: 2002, num: 20 });
  h.clickChest(1); assert.equal(h.popup.active, false);
});

test('blank space, popup contents, and a sibling control dismiss without swallowing the control action', () => {
  const h = harness(); h.controller.bindBoxRewardDismissal();
  for (const target of [h.home, h.layout.children[0], new h.Node('settings', h.uiRoot)]) {
    let clicks = 0; target.on('end', event => { clicks++; event.stopPropagation(); });
    h.clickChest(2); assert.equal(h.popup.active, true);
    h.dispatch(target, { x: 600, y: 450 });
    assert.equal(h.popup.active, false); assert.equal(clicks, 1);
  }
});

test('dismissal listeners are unique and removed when leaving the battle home panel', () => {
  const h = harness(); h.controller.onEnable(); h.controller.bindBoxRewardDismissal();
  assert.equal(h.uiRoot.listeners.filter(v => v.type === 'end' && v.capture).length, 1);
  h.clickChest(0); h.controller.onDisable();
  assert.equal(h.popup.active, false); assert.equal(h.uiRoot.listeners.length, 0);
  h.controller.onEnable(); assert.equal(h.uiRoot.listeners.length, 1);
  h.controller.onDisable(); assert.equal(h.uiRoot.listeners.length, 0);
});

test('late prefab callbacks cannot fill another chest preview or repopulate a dismissed preview', () => {
  const h = harness(true); h.controller.bindBoxRewardDismissal();
  h.clickChest(0); const old = h.state.loads.splice(0);
  h.clickChest(1); const current = h.state.loads.splice(0);
  old.forEach(done => done({}));
  assert.equal(h.layout.children.length, 0, 'old chest load must not populate the new preview');
  current.forEach(done => done({}));
  assert.deepEqual(h.layout.children.filter(n => n.active).map(n => n.getComponent(h.Item).reward), [{ id: 2002, num: 20 }]);
  const closed = harness(true); closed.controller.bindBoxRewardDismissal(); closed.clickChest(0); closed.controller.hideBoxReward();
  closed.state.loads.forEach(done => done({}));
  assert.equal(closed.popup.active, false); assert.equal(closed.layout.children.length, 0);
});

test('only authored chest buttons opt out; ordinary buttons retain their cooldown protection', () => {
  const h = harness();
  assert.ok(h.chests.every(node => node.components[0].invertTime === 0));
  const button = new h.BaseButton(); button.node = new h.Node('ordinary');
  assert.equal(button.invertTime, 1);
  button._onTouchBegan(h.event(button.node, {})); button._onTouchEnded(h.event(button.node, {}));
  assert.equal(button.touched, true);
  button._onTouchBegan(h.event(button.node, {})); assert.equal(button.node.paused, true);
  button.update(1.01); assert.equal(button.node.paused, false); assert.equal(button.touched, false);
});
