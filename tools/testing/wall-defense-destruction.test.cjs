'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { env, root } = require('./backend-legacy-harness.cjs');
const engine = process.env.COCOS_ENGINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const options = { skip: !fs.existsSync(engine) && !process.env.COCOS_ENGINE_ROOT ? 'Install Creator 2.4.13 for destruction integration' : false };

// Execute installed Creator lifecycle/event methods, including the exact JSB
// getters in the reported stack. Only native rendering and final field clearing
// are inert. No scene, audio, persistent player or authored data is opened.
function fixture() {
  const h = env();
  h.cc.isValid = value => !!value && !value.destroyed;
  const Driver = h.load('GAD_Enemy_Ani').default;
  const context = vm.createContext({ cc: h.cc, CC_EDITOR: false, CC_TEST: false,
    Destroying: 1, Destroyed: 2 });
  const read = file => fs.readFileSync(path.join(engine, file), 'utf8');
  function method(source, marker) {
    const start = source.indexOf(marker);
    assert(start >= 0, 'Creator method exists: ' + marker);
    const body = source.indexOf('{', start);
    let depth = 1, end = body + 1;
    while (depth && end < source.length) {
      if (source[end] === '{') depth++;
      else if (source[end] === '}') depth--;
      end++;
    }
    return vm.runInContext('(function' + source.slice(start + marker.length, end) + ')', context);
  }
  const native = read('bin/cocos2d-jsb-for-preview.js');
  const baseDestroy = method(read('cocos2d/core/utils/base-node.js'), '_onPreDestroy ');
  const immediateDestroy = method(read('cocos2d/core/platform/CCObject.js'), 'prototype._destroyImmediate = function ');
  const dirty = method(native, '_setDirtyForNode: function _setDirtyForNode');
  const getCount = method(native.slice(native.indexOf('childrenCount: {')), 'get: function get');
  const off = method(native.slice(native.indexOf('proto.__off = proto.off;')), 'proto.off = function');
  const innerOff = method(native.slice(native.indexOf('proto.off = function(key, callback, target)')), 'proto.off = function');
  // Component destruction order comes from the actual shipped enemy prefab.
  const prefab = JSON.parse(fs.readFileSync(path.join(root, 'assets/gad_prefabs/_res/Prefab/GAD_UIGame/pbt_enermy.prefab'), 'utf8'));
  const driverData = prefab.find(item => item.ani && prefab[item.ani.__id__].__type__ === 'cc.Animation');
  assert(driverData, 'enemy prefab has an animation driver');
  const icon = prefab[driverData.node.__id__];
  assert(icon._components.findIndex(ref => prefab[ref.__id__] === driverData) >
    icon._components.findIndex(ref => ref.__id__ === driverData.ani.__id__), 'Animation is destroyed before its driver');
  function Node(name, parent) {
    Object.assign(this, { name, _objFlags: 0, _children: [], _components: [], __eventTargets: [], _parent: parent || null });
    if (parent) parent._children.push(this);
  }
  Object.defineProperty(Node.prototype, 'childrenCount', { get: getCount });
  Object.assign(Node.prototype, { _onPreDestroy: baseDestroy, _destroyImmediate: immediateDestroy,
    _destruct() { this._children = this._components = null; this.destroyed = true; } });
  const roles = new Node('roleRoot'), enemy = new Node('enemy', roles);
  new Node('shadow', enemy);
  const enemyIcon = new Node(icon._name, enemy);
  const driver = new Driver();
  driver._attackFunc = driver._attackCompleteFunc = () => assert.fail('destroyed attack callback');
  const animation = { _callbackTable: {}, __off: innerOff, off,
    _destroyImmediate() { this._callbackTable = null; this.destroyed = true; } };
  driver.ani = animation;
  enemyIcon._components.push(animation, { _destroyImmediate() { driver.onDestroy(); } });
  const manager = { _nodeListenersMap: {}, _setDirtyForNode: dirty };
  return { roles, enemy, driver, animation, dirty: () => dirty.call(manager, roles) };
}

test('Wall Defense enemy removal completes after Animation has already been destroyed', options, () => {
  const h = fixture();
  assert.doesNotThrow(() => h.enemy._destroyImmediate());
  assert.equal(h.roles.childrenCount, 0, 'dead enemy must detach from roleRoot');
  assert.equal(h.enemy._children, null, 'destruction must finish');
  assert.equal(h.driver._attackFunc, null);
  assert.equal(h.driver._attackCompleteFunc, null);
  assert.doesNotThrow(h.dirty, 'scene sorting must not visit a half-destroyed enemy');
});

test('interrupted enemy destruction reproduces both reported Simulator errors', options, () => {
  const h = fixture();
  // Retain the old cleanup only in this control case, to verify the causal
  // chain rather than merely asserting a validity check exists in source.
  h.driver.onDestroy = function () { this.ani.off('finished', this.onAttackFinished, this); };
  assert.throws(() => h.enemy._destroyImmediate(), /null/);
  assert.equal(h.roles.childrenCount, 1);
  assert.equal(h.enemy._children[0]._children, null, 'an earlier sibling was already destroyed');
  assert.throws(h.dirty, /(?:length.*null|null.*length)/);
});

test('Wall Defense cleanup still unregisters from a living Animation and clears callbacks', () => {
  const h = env(); h.cc.isValid = value => !!value && !value.destroyed;
  const driver = new (h.load('GAD_Enemy_Ani').default)(), calls = [];
  driver.ani = { off: (...args) => calls.push(args) };
  driver._attackFunc = driver._attackCompleteFunc = () => assert.fail('late callback');
  driver.onDestroy();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ['finished', driver.onAttackFinished, driver]);
  assert.equal(driver._attackFunc, null); assert.equal(driver._attackCompleteFunc, null);
});

test('Wall Defense cleanup tolerates an unassigned or destroyed Animation', () => {
  const h = env(); h.cc.isValid = value => !!value && !value.destroyed;
  const Driver = h.load('GAD_Enemy_Ani').default;
  for (const animation of [null, { destroyed: true, off() { assert.fail('destroyed emitter accessed'); } }]) {
    const driver = new Driver(); driver.ani = animation;
    driver._attackFunc = driver._attackCompleteFunc = () => {};
    assert.doesNotThrow(() => driver.onDestroy());
    assert.equal(driver._attackFunc, null); assert.equal(driver._attackCompleteFunc, null);
  }
});
