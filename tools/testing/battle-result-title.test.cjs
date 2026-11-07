'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'assets/_script/BattleResultTitle.js'), 'utf8');
const authored = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallPrefabs/_res/Skeleton/KinghtFallUIGameEnd/wqyl_settlement.json'), 'utf8'));

function fixture(native) {
  class Label {}
  Label.HorizontalAlign = Label.VerticalAlign = { CENTER: 1 };
  Label.Overflow = { NONE: 0 };
  class Node {
    constructor(name) { this.name = name; this.components = []; }
    setContentSize(width, height) { Object.assign(this, { width, height }); }
    addComponent(Type) { const component = new Type(); this.components.push(component); return component; }
    getComponent(Type) { return this.components.find(c => c instanceof Type); }
    setScale(scale) { this.scale = scale; }
    setPosition(x, y) { Object.assign(this, { x, y }); }
  }
  const manager = { language: 'en', catalog: { spineImages: {} }, getCurrentLanguage() { return this.language; },
    t: key => key === 'art.result.victory' ? 'VICTORY' : 'Defeat' };
  const context = { exports: {}, cc: { Node, Label, sys: { isNative: native }, isValid: value => !!value && !value.destroyed },
    require: () => ({ LanguageMgr: { getInstance: () => manager } }) };
  vm.runInNewContext(source, context);
  const calls = [], slots = new Map();
  const defaultSkin = authored.skins.find(skin => skin.name === 'default');
  for (const slot of authored.slots) slots.set(slot.name, slot.attachment);
  function setAttachment(slot, value) {
    // Creator 2.4.13 JSB: setAttachment -> seval_to_std_string ->
    // Value::toStringForce. Null becomes "null". Spine Skeleton.cpp:365
    // asserts if a nonempty name is absent from the skin. Empty clears.
    const name = native ? String(value) : value;
    assert(slots.has(slot), 'Slot not found: ' + slot);
    if (native ? name.length > 0 : name != null) {
      assert(defaultSkin.attachments[slot]?.[name], 'attachment != NULL: ' + name);
    }
    calls.push({ slot, value, name });
    slots.set(slot, name || null);
  }
  const bones = Object.fromEntries(['sl5', 'sb3'].map(name => [name, new Node(name)]));
  const skeleton = { skeletonData: { textures: [] }, attachUtil: { getAttachedNodes: name => [bones[name]] }, setAttachment };
  skeleton[native ? '_nativeSkeleton' : '_skeleton'] = {};
  const caption = { font: { name: 'Lilita One' } }, button = { getChildByName: () => ({ getComponent: () => caption }) };
  const owner = {}, sync = win => context.exports.sync(owner, skeleton, button, win);
  return { context, manager, skeleton, owner, calls, slots, sync, Label, caption };
}

test('native binding reproduces the reported assertion when null is sent as an attachment name', () => {
  const f = fixture(true);
  assert.throws(() => f.skeleton.setAttachment('shengli', null), /attachment != NULL: null/);
  assert.doesNotThrow(() => f.skeleton.setAttachment('shengli', ''));
});

for (const native of [false, true]) {
  test(`${native ? 'native' : 'web'} Victory and Defeat clear only their authored text attachment and share crisp typography`, () => {
    const f = fixture(native);
    for (const win of [true, false]) {
      f.sync(win);
      const state = f.owner._resultTitleState, label = state.node.getComponent(f.Label);
      assert.equal(label.string, win ? 'VICTORY' : 'DEFEAT');
      assert.equal(label.font, f.caption.font); assert.equal(label.fontSize, 56);
      assert.equal(state.node.scale, .875); assert.equal(state.node.active, true);
      assert.equal(f.calls.at(-1).value, native ? '' : null);
      assert.equal(f.slots.get(state.slot), null);
      assert.equal(f.slots.get('shibai_2'), 'shibai_2', 'keep the surrounding result artwork');
      const count = f.calls.length; f.sync(win); assert.equal(f.calls.length, count, 'no repeated cache rebuilds');
    }
    assert.equal(f.slots.get('shengli'), 'shengli', 'restore Victory when reusing the result UI for Defeat');
  });

  test(`${native ? 'native' : 'web'} result artwork refresh and language changes preserve safe attachment names`, () => {
    const f = fixture(native); f.sync(true);
    const state = f.owner._resultTitleState;
    const original = f.skeleton.skeletonData = { textures: [{ _uuid: 'page' }] };
    f.skeleton._localizedSpineOriginal = original;
    f.manager.catalog.spineImages.page = { boneScales: { en: { sl5: 1.75 } } };
    f.sync(true); assert.equal(state.node.scale, .875, 'unlocalized original has not been enlarged');
    f.skeleton.skeletonData = { textures: [] }; f.skeleton[native ? '_nativeSkeleton' : '_skeleton'] = {};
    const count = f.calls.length; f.sync(true);
    assert.equal(f.calls.length, count + 1); assert.equal(state.node.scale, .5);
    f.manager.language = 'zh'; f.sync(true);
    assert.equal(state.node.active, false); assert.equal(f.slots.get('shengli'), 'shengli');
    f.manager.language = 'en'; f.sync(true);
    assert.equal(state.node.active, true); assert.equal(f.slots.get('shengli'), null);
  });
}
