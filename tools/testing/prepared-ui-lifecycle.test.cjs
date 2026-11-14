'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('./backend-ui-harness.cjs');

// Exercise the real manager and BaseUI at the resource/input/scene boundaries.
// Nodes record effective activation, rather than just assignments to active:
// active -> active reparenting must not replay Cocos Label.onEnable.
function setup() {
  const h = fixture(), BaseUI = h.load('BaseUI').default;
  const released = [], created = [], opened = [];
  const cache = h.modules.ResCacheMgr.ResCacheMgr.getInstance();
  cache.refreshTime = keys => { released.push(...keys); };
  h.modules.ResCacheMgr.ResCacheMgr.getInstance = () => cache;
  class Node extends h.cc.Node {
    constructor(name) { super(name); this.transitions = []; }
    get active() { return this._active !== false; }
    set active(value) {
      const before = this.activeInHierarchy;
      this._active = !!value;
      this.record(before);
    }
    get activeInHierarchy() {
      return !this.destroyed && this.active && !!this.parent &&
        this.parent.active !== false && this.parent.activeInHierarchy !== false;
    }
    get parent() { return this._parent; }
    set parent(parent) {
      const before = this.activeInHierarchy;
      if (this._parent) this._parent.children = this._parent.children.filter(n => n !== this);
      this._parent = parent;
      if (parent && !parent.children.includes(this)) parent.children.push(this);
      this.record(before);
    }
    setParent(parent) { this.parent = parent; }
    removeFromParent() { this.parent = null; }
    record(before) {
      const after = this.activeInHierarchy;
      if (this.transitions && before !== after) this.transitions.push(after ? 'enable' : 'disable');
    }
    pauseSystemEvents() { this.inputPaused = true; }
    resumeSystemEvents() { this.inputPaused = false; }
  }
  function Panel() { BaseUI.call(this); this.opens = []; this.cache = false; }
  Panel.prototype = Object.create(BaseUI.prototype);
  Panel.prototype.constructor = Panel;
  Panel.prototype.init = function (...args) {
    this.opens.push(args); [this.build, this.callback, this.cancel] = args;
    if (this.throwInit) throw Error('choice init failed');
  };
  Panel.prototype.openAni = function (done) { if (this.throwOpen) throw Error('choice opening failed'); done(); };
  Panel.prototype.closeAni = function (done) { done(); };
  Panel.prototype.onClose = function () { const cancel = this.cancel; this.cancel = null; if (cancel) cancel(); };
  Panel.prototype.onDestroy = function () { this.onClose(); BaseUI.prototype.onDestroy.call(this); };
  Panel.prototype.select = function (value, generation) { return this.finishDecision(this.callback, value, generation); };
  function panel(cache = false) {
    const p = new Panel(); p.node = new Node('Choice'); p.node.ui = p; p.cache = cache;
    p.resArray = [{owner: p}]; created.push(p); return p;
  }
  h.ui.setConf({choice: {bundleName: 'ui', prefab: 'choice', name: 'Choice', zIndex: 1}});
  h.cc.instantiate = () => panel().node;
  const host = new Node('PreparedHost'); host.parent = h.ui.uiRoot; host.opacity = 0;
  function provider(p = panel(true), extra = {}) {
    let available = true;
    p.node.parent = host; p.isclose = true; p.node.pauseSystemEvents(); p.node.transitions.length = 0;
    const implementation = {
      take(args) { this.lastArgs = args; if (!available || this.invalid || p.node.destroyed || args[0] && args[0].unsupported) return null; available = false; return p; },
      canReuse(value) { return value === p && !this.invalid && value.node.activeInHierarchy; },
      willOpen(value) { assert.equal(value.isclose, true); value.node.resumeSystemEvents(); opened.push(value); },
      park(value) { assert.equal(value.isclose, true); value.node.pauseSystemEvents(); value.node.setParent(host); available = true; return true; },
      dispose() { p.cache = false; p.release(true); p.node.destroy(); available = false; }
    };
    Object.assign(implementation, extra); p._preparedUIProvider = implementation;
    return {p, implementation};
  }
  function open(build = {}, callback = () => {}, cancel = () => {}) {
    h.ui.openUIOfCallback('choice', 'game', () => {}, build, callback, cancel, [2, 3]);
    return h.ui.getUIById('choice');
  }
  return {...h, Node, panel, provider, host, released, created, opened, open};
}

test('prepared choice stays active and retains assets through park, reopen and fresh request parameters', () => {
  const h = setup(), {p, implementation} = h.provider();
  h.ui.registerPreparedUI('choice', implementation);
  const first = {id: 1}, second = {id: 2}, selected = [];
  h.open(first, value => selected.push(['first', value]));
  assert.equal(h.requests.length, 0); assert.equal(p.build, first); assert.equal(p.node.parent, h.ui.uiRoot);
  const oldGeneration = p._resourceGeneration;
  h.ui.closeById('choice'); h.ui.closeById('choice');
  assert.equal(p.node.parent, h.host); assert.equal(p.node.inputPaused, true);
  assert.equal(h.ui.getUIById('choice'), null); assert.equal(h.ui.uichace.get('choice'), p);
  h.open(second, value => selected.push(['second', value]));
  assert.equal(p.build, second); assert.equal(implementation.lastArgs[0], second);
  assert.equal(p.node.inputPaused, false); assert.equal(p.select(2, oldGeneration), false);
  p.select(3); p.select(2); h.flush();
  assert.deepEqual(selected, [['second', 3]]); assert.deepEqual(p.node.transitions, []);
  assert.equal(p.node.destroyed, undefined); assert.equal(h.released.length, 0);
  assert.equal(h.ui._openingInputCount, 0); assert.equal(h.blocked(), false);
});

test('prepared cancellation and selection settle each purchase owner once without invoking warmup callbacks', () => {
  const h = setup(), {p, implementation} = h.provider(); h.ui.registerPreparedUI('choice', implementation);
  let coins = 20, warmChoices = 0, refunds = 0, built = 0;
  p.callback = () => warmChoices++;
  function purchase() {
    coins -= 5; let settled = false;
    h.open({}, () => { if (!settled) { settled = true; built++; } }, () => { if (!settled) { settled = true; refunds++; coins += 5; } });
  }
  purchase(); h.ui.closeById('choice'); h.ui.closeById('choice');
  assert.equal(coins, 20); assert.equal(refunds, 1); assert.equal(built, 0); assert.equal(warmChoices, 0);
  purchase(); p.select(3); p.select(3); h.flush(); h.ui.closeById('choice');
  assert.equal(coins, 15); assert.equal(refunds, 1); assert.equal(built, 1); assert.equal(warmChoices, 0);
});

test('ordinary uncached and cached popups keep their existing load and activation behavior', () => {
  for (const cache of [false, true]) {
    const h = setup(); h.open(); assert.equal(h.requests.length, 1);
    h.requests.shift().done(null, h.asset); const p = h.ui.getUIById('choice'); p.cache = cache;
    assert.deepEqual(p.node.transitions, ['enable']);
    h.ui.closeById('choice');
    if (cache) { assert.equal(p.node.active, false); assert.equal(p.node.parent, null); h.open(); assert.equal(h.requests.length, 0); assert.deepEqual(p.node.transitions, ['enable', 'disable', 'enable']); }
    else { assert.equal(p.node.destroyed, true); assert.equal(h.released.length, 1); h.open(); assert.equal(h.requests.length, 1); }
  }
});

test('unsupported requests and invalid prepared context load the ordinary prefab instead of taking a parked view', () => {
  for (const invalidate of ['request', 'context', 'destroyed']) {
    const h = setup(), {p, implementation} = h.provider(); h.ui.registerPreparedUI('choice', implementation);
    if (invalidate === 'context') implementation.invalid = true;
    if (invalidate === 'destroyed') implementation.dispose();
    h.open(invalidate === 'request' ? {unsupported: true} : {});
    assert.equal(h.requests.length, 1); assert.equal(h.opened.length, 0);
    h.requests.shift().done(null, h.asset);
    assert.notEqual(h.ui.getUIById('choice'), p); assert.equal(h.ui.getUIById('choice').node.parent, h.ui.uiRoot);
    assert.equal(h.ui._openingInputCount, 0);
  }
});

test('a stale ordinary prepared cache cannot be reused when its registered provider cannot supply that request', () => {
  const h = setup(), {p, implementation} = h.provider(); h.ui.registerPreparedUI('choice', implementation);
  h.open(); h.ui.closeById('choice');
  implementation.invalid = true;
  h.open({unsupported: true}); assert.equal(h.requests.length, 1); assert.equal(h.opened.length, 1);
  h.requests.shift().done(null, h.asset); assert.notEqual(h.ui.getUIById('choice'), p);
});

test('unregistering a replaced provider does not remove the newer registration', () => {
  const h = setup(), first = h.provider(), next = h.provider();
  const removeFirst = h.ui.registerPreparedUI('choice', first.implementation);
  const removeNext = h.ui.registerPreparedUI('choice', next.implementation);
  removeFirst(); h.open(); assert.equal(h.ui.getUIById('choice'), next.p);
  h.ui.closeById('choice'); removeNext(); removeNext(); h.open(); assert.equal(h.requests.length, 1);
});

test('cancelled owner requests never take or activate a prepared popup', () => {
  const h = setup(), {p, implementation} = h.provider(); let takes = 0, cancels = 0;
  const original = implementation.take; implementation.take = function (args) { takes++; return original.call(this, args); };
  h.ui.registerPreparedUI('choice', implementation);
  h.ui.openUIWithOwner('choice', 'game', {isCurrent: () => false, onCancel: () => cancels++});
  assert.equal(takes, 0); assert.equal(cancels, 1); assert.equal(h.ui.getUIById('choice'), null);
  assert.deepEqual(p.node.transitions, []); assert.equal(h.ui._openingInputCount || 0, 0);
});

test('owner cancellation during prepared setup parks the popup and releases input once', () => {
  const h = setup(); let current = true, cancelled = 0, closed = 0;
  const {p, implementation} = h.provider(undefined, {willOpen() { current = false; }});
  h.ui.registerPreparedUI('choice', implementation);
  h.ui.openUIWithOwner('choice', 'game', {isCurrent: () => current, onCancel: () => cancelled++}, {}, () => {}, () => closed++);
  assert.equal(cancelled, 1); assert.equal(closed, 1); assert.equal(p.node.parent, h.host);
  assert.equal(h.ui.getUIById('choice'), null); assert.equal(h.ui._openingInputCount, 0);
  assert.equal(h.events.filter(e => e[0] === 'block' && e[1] === true).length, 1);
});

for (const failure of ['take', 'canReuse', 'willOpen', 'init', 'opening']) test(`prepared ${failure} exceptions dispose failed ownership and release input`, () => {
  const h = setup(), {p, implementation} = h.provider(); let cancels = 0;
  if (failure === 'init') p.throwInit = true;
  else if (failure === 'opening') p.throwOpen = true;
  else implementation[failure] = () => { throw Error('prepared failure'); };
  h.ui.registerPreparedUI('choice', implementation);
  assert.throws(() => h.ui.openUIWithOwner('choice', 'game', {onCancel: () => cancels++}, {}), /failed|failure/);
  assert.equal(h.ui.getUIById('choice'), null); assert.equal(h.ui._openingInputCount, 0); assert.equal(cancels, 1);
  assert.equal(h.blocked(), false);
  if (failure !== 'take') { assert.equal(p.node.destroyed, true); assert.equal(h.released.length, 1); }
});

test('a parking failure still retires the popup, settles its cancellation and drains waiting ownership', () => {
  const h = setup(); let cancelled = 0, queued = false, nextOpened = 0, nextCancelled = 0;
  const {p, implementation} = h.provider(undefined, {park() { throw Error('parking failed'); }});
  const close = p.onClose;
  p.onClose = function () {
    close.call(this);
    if (queued) return;
    queued = true;
    implementation.invalid = true;
    h.ui.openUIWithOwner('choice', 'next-game', {
      onOpened: () => nextOpened++, onCancel: () => nextCancelled++
    }, {name: 'queued request'});
    assert.equal(h.ui.watingOpen.length, 1);
  };
  h.ui.registerPreparedUI('choice', implementation); h.open({}, () => {}, () => cancelled++);
  assert.throws(() => h.ui.closeById('choice'), /parking failed/);
  assert.equal(cancelled, 1); assert.equal(h.ui.getUIById('choice'), null);
  assert.equal(p.node.destroyed, true); assert.equal(h.released.length, 1);
  assert.equal(h.ui.watingOpen.length, 0); assert.equal(h.requests.length, 1);
  assert.equal(h.ui._openingInputCount, 1); // Only the new resource request owns input.
  h.requests.shift().done(null, h.asset);
  assert.equal(nextOpened, 1); assert.equal(nextCancelled, 0);
  assert.equal(h.ui.getUIById('choice').build.name, 'queued request');
  assert.equal(h.ui._openingInputCount, 0); assert.equal(h.blocked(), false);
  h.ui.closeById('choice'); h.ui.closeById('choice');
  assert.equal(cancelled, 1); assert.equal(nextOpened, 1); assert.equal(h.released.length, 2);
});
