'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
function fixture() {
  const requests = [], listeners = [], imports = [];
  let pulseStopped = 0, size = { width: 750, height: 1334 };
  const language = { setCatalog(data) { this.catalog = data; }, t: key => key };
  const eventTarget = { on: (...args) => listeners.push(args), off: (name, fn, owner) => {
    const index = listeners.findIndex(v => v[0] === name && v[1] === fn && v[2] === owner);
    if (index >= 0) listeners.splice(index, 1);
  } };
  const context = { module: { exports: {} }, require(name) {
    imports.push(name); assert.equal(name, 'LanguageMgr', 'title screen does not initialize gameplay services');
    return { LanguageMgr: { getInstance: () => language } };
  }, cc: { Component: function () {}, Node: {}, Label: {}, JsonAsset: {},
    Class(definition) { function Type() {} Object.assign(Type.prototype, definition); return Type; },
    isValid: value => !!value && !value.destroyed, error() {}, debug: { setDisplayStats() {} },
    Node: { EventType: { TOUCH_END: 'touch' } }, SystemEvent: { EventType: { KEY_DOWN: 'key' } },
    macro: { KEY: { enter: 13, space: 32 } }, systemEvent: eventTarget,
    view: { ...eventTarget, getVisibleSize: () => size },
    tween() { const tween = { to() { return this; }, union() { return this; }, repeatForever() { return this; }, start() { return this; }, stop() { pulseStopped++; } }; return tween; },
    director: { loadScene(scene, callback) { const request = { scene, callback }; requests.push(request); return true; } }
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/StartScreen.js'), 'utf8'), context);
  const owner = new context.module.exports();
  Object.assign(owner, { node: eventTarget, prompt: { node: {} }, catalog: { json: { entries: {} } }, content: { setScale(value) { this.scale = value; } } });
  owner.onLoad();
  return { owner, context, requests, listeners, imports, resize(width, height) { size = { width, height }; owner.fitContent(); }, get pulseStopped() { return pulseStopped; } };
}
test('title screen waits indefinitely for input; touch, Enter and Space open loading only once', () => {
  for (const input of ['touch', 13, 32]) {
    const h = fixture(); assert.equal(h.requests.length, 0);
    h.owner.onKeyDown({ keyCode: 65 }); assert.equal(h.requests.length, 0);
    if (input === 'touch') h.listeners.find(v => v[0] === 'touch')[1].call(h.owner);
    else h.owner.onKeyDown({ keyCode: input });
    h.owner.beginLoading(); h.owner.onKeyDown({ keyCode: 13 });
    assert.equal(h.requests.length, 1); assert.equal(h.requests[0].scene, 'loading'); assert(h.pulseStopped > 0);
  }
});
test('failed scene transitions can retry and stale callbacks cannot affect a later attempt', () => {
  const h = fixture(); h.owner.beginLoading(); h.requests[0].callback(Error('offline'));
  assert.equal(h.owner.prompt.string, 'start.retry'); assert.equal(h.owner._starting, false);
  h.owner.beginLoading(); assert.equal(h.requests.length, 2);
  h.requests[0].callback(Error('late')); assert.equal(h.owner._starting, true); assert.equal(h.owner.prompt.string, 'start.opening');
  h.requests[1].callback(null); assert.equal(h.owner._starting, true);
});
test('rejected and throwing scene loads are recoverable without a second automatic request', () => {
  for (const fail of [() => false, () => { throw Error('unavailable'); }]) {
    const h = fixture(); h.context.cc.director.loadScene = fail;
    assert.doesNotThrow(() => h.owner.beginLoading()); assert.equal(h.owner._starting, false);
    assert.equal(h.owner.prompt.string, 'start.retry');
  }
});
test('keyboard modifiers and repeats do not start; destroy releases all listeners and ignores late failures', () => {
  const h = fixture();
  for (const field of ['repeat', 'ctrlKey', 'altKey', 'metaKey']) h.owner.onKeyDown({ keyCode: 13, [field]: true });
  assert.equal(h.requests.length, 0); h.owner.beginLoading(); h.owner.onDestroy();
  assert.equal(h.listeners.length, 0); h.requests[0].callback(Error('late'));
  assert.equal(h.owner.prompt.string, 'start.opening');
});
test('title, artwork and prompt stay within compact landscape and tall phone viewports', () => {
  const h = fixture();
  for (const [width, height] of [[750,1334],[750,1624],[1334,750],[600,750]]) {
    h.resize(width, height); assert(h.owner.content.scale > 0 && h.owner.content.scale <= 1);
    assert(720 * h.owner.content.scale <= width - 64 + .01);
    assert(1120 * h.owner.content.scale <= height - 96 + .01);
  }
});
test('both build and editor start at the dedicated title scene with all required text and assets authored', () => {
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const scene = read('assets/scenes/Start.fire'), meta = read('assets/scenes/Start.fire.meta');
  assert.equal(read('settings/builder.json').startScene, meta.uuid);
  assert.equal(read('settings/project.json')['start-scene'], meta.uuid);
  const hex = read('assets/_script/StartScreen.js.meta').uuid.replace(/-/g, ''), alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const classId = hex.slice(0, 5) + hex.slice(5).replace(/.../g, group => { const value = parseInt(group, 16); return alphabet[value >> 6] + alphabet[value & 63]; });
  assert(scene.some(value => value.__type__ === classId));
  for (const name of ['Background','GameLogo','Castle','TapToStart']) assert(scene.some(value => value._name === name));
  const catalog = read('assets/resources/localization/catalog.json');
  assert.equal(catalog.entries['start.tap'].en, 'Tap to Start'); assert(catalog.entries['start.tap'].zh);
});
