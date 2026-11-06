'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../assets/_script/TestMode.js'), 'utf8');

function emitter() {
  const listeners = new Map();
  return {
    listeners,
    on(type, fn, target) { const list = listeners.get(type) || []; list.push({ fn, target }); listeners.set(type, list); },
    off(type) { listeners.delete(type); },
    emit(type, event) { (listeners.get(type) || []).slice().forEach(item => item.fn.call(item.target, event)); }
  };
}
function environment(options = {}) {
  const stored = options.storage || new Map(), calls = { reads: 0, writes: 0, bindings: 0 };
  const dom = emitter(), system = emitter(), director = emitter(), game = emitter(), nativeListeners = [];
  let nativeFocused = false;
  const scene = { getComponentsInChildren: () => nativeFocused ? [{ isFocused: () => true }] : [] };
  director.getScene = () => scene;
  class Node {
    constructor(name) { this.name = name; this.children = []; this.width = 0; this.height = 0; this.components = []; this.active = true; this.group = 'UI'; }
    setContentSize(width, height) { this.width = width; this.height = height; }
    addChild(node) { node.parent = this; this.children.push(node); }
    addComponent(Type) { const component = new Type(); component.node = this; this.components.push(component); if (Type === Label) this.setContentSize(0, 0); return component; }
  }
  class Label {}
  Label.HorizontalAlign = { CENTER: 1 }; Label.VerticalAlign = { CENTER: 1 }; Label.Overflow = { SHRINK: 2 };
  class Graphics { roundRect() {} fill() {} stroke() {} }
  class Widget { updateAlignment() { this.node.y = this.node.parent.height / 2 - this.top - this.node.height / 2; } }
  Widget.AlignMode = { ALWAYS: 2 };
  const canvas = options.canvas ? { node: new Node('uiRoot') } : null;
  if (canvas) canvas.node.setContentSize(750, 1334);
  const cc = {
    sys: { localStorage: { getItem(key) { calls.reads++; if (options.storageFails) throw new Error('disabled'); return stored.get(key); }, setItem(key, value) { calls.writes++; if (options.storageFails) throw new Error('disabled'); stored.set(key, value); } } },
    director, Director: { EVENT_AFTER_SCENE_LAUNCH: 'scene' }, game, systemEvent: system,
    SystemEvent: { EventType: { KEY_DOWN: 'down', KEY_UP: 'up' } },
    EventListener: { KEYBOARD: 6, create: value => value }, eventManager: { addListener: listener => nativeListeners.push(listener) },
    isValid: value => !!value && !value.destroyed, EditBox: class {}, Canvas: { instance: canvas },
    Node, Label, Graphics, Widget, macro: { MAX_ZINDEX: 32767 }, color: function () { return Array.from(arguments); }
  };
  game.EVENT_HIDE = 'hide';
  const document = { activeElement: null };
  const context = {
    cc, exports: {}, CC_PREVIEW: !!options.preview, CC_DEBUG: !!options.debug, CC_EDITOR: !!options.editor,
    require(id) { assert.equal(id, 'LanguageMgr'); return { LanguageMgr: { getInstance: () => ({ bindLabel(label, key) { calls.bindings++; label.key = key; label.string = 'localized badge'; } }) } }; }
  };
  if (options.web !== false) {
    context.document = document;
    context.window = { addEventListener: (type, fn) => dom.on(type, fn) };
  }
  vm.runInNewContext(source, context, { filename: 'TestMode.js' });
  return { service: context.exports.TestMode.getInstance(), cc, stored, calls, dom, system, director, game, nativeListeners, document,
    setNativeFocus(value) { nativeFocused = value; } };
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function press(env, extra = {}) { env.dom.emit('keydown', Object.assign({ key: 'F8', code: 'F8', keyCode: 119 }, extra)); }
function release(env) { env.dom.emit('keyup', { code: 'F8', keyCode: 119 }); }

test('Preview defaults OFF and initializes hotkeys exactly once', () => {
  const env = environment({ preview: true });
  assert.equal(env.service.isAvailable(), true); assert.equal(env.service.isEnabled(), false);
  env.service.init(); env.service.init();
  assert.equal(env.dom.listeners.get('keydown').length, 1); assert.equal(env.calls.reads, 1);
  assert.equal(env.service.shouldBypassAdLimits(), false);
});
test('F8 toggles once per press, ignores repeats and clears its latch on blur', () => {
  const env = environment({ preview: true }); env.service.init();
  press(env); assert.equal(env.service.isEnabled(), true);
  press(env); press(env, { repeat: true }); assert.equal(env.service.isEnabled(), true);
  release(env); press(env); assert.equal(env.service.isEnabled(), false);
  env.dom.emit('blur'); press(env, { repeat: true }); assert.equal(env.service.isEnabled(), false);
  release(env); press(env); assert.equal(env.service.isEnabled(), true);
  assert.equal(env.service.shouldBypassAdLimits(), true);
});
test('Editable HTML/shadow/native focus and modifiers suppress F8', () => {
  const env = environment({ preview: true }); env.service.init();
  for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { isContentEditable: true }]) {
    press(env, { target }); release(env); assert.equal(env.service.isEnabled(), false);
  }
  press(env, { composedPath: () => [{ isContentEditable: true }] }); release(env);
  env.document.activeElement = { tagName: 'INPUT' }; press(env); release(env); env.document.activeElement = null;
  env.setNativeFocus(true); press(env); release(env); env.setNativeFocus(false);
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey', 'isComposing']) { press(env, { [modifier]: true }); release(env); }
  assert.equal(env.service.isEnabled(), false);
  press(env); assert.equal(env.service.isEnabled(), true);
});
test('Development preference survives reload, and blocked storage still allows session toggles', () => {
  const stored = new Map(); const first = environment({ debug: true, storage: stored }); first.service.setEnabled(true);
  assert.equal(stored.get('project-cocos.test-mode'), '1');
  const second = environment({ debug: true, storage: stored }); assert.equal(second.service.isEnabled(), true);
  second.service.setEnabled(false); assert.equal(stored.get('project-cocos.test-mode'), '0');
  const blocked = environment({ preview: true, storageFails: true }); assert.equal(blocked.service.isEnabled(), false);
  assert.equal(blocked.service.toggle(), true);
});
test('Release and editor ignore persisted ON and cannot enable or install listeners', () => {
  for (const flags of [{}, { debug: true, preview: true, editor: true }]) {
    const env = environment(Object.assign({ storage: new Map([['project-cocos.test-mode', '1']]) }, flags));
    assert.equal(env.service.isAvailable(), false); assert.equal(env.service.isEnabled(), false);
    assert.equal(env.service.setEnabled(true), false); assert.equal(env.service.toggle(), false);
    assert.equal(env.service.shouldBypassAdLimits(), false);
    assert.equal(env.calls.reads, 0); assert.equal(env.calls.writes, 0); assert.equal(env.dom.listeners.size, 0);
  }
});
test('Native keydown survives GAD clearing all system KEY_UP listeners', () => {
  const env = environment({ debug: true, web: false }); env.service.init();
  env.system.emit('down', { keyCode: 119 }); env.system.emit('down', { keyCode: 119 }); assert.equal(env.service.isEnabled(), true);
  env.system.off('up'); env.nativeListeners[0].onKeyReleased(119);
  env.system.emit('down', { keyCode: 119 }); assert.equal(env.service.isEnabled(), false);
  env.game.emit('hide'); env.system.emit('down', { keyCode: 119 }); assert.equal(env.service.isEnabled(), true);
});
test('Badge is localized, restores label width, stays inside spare top margin, and has no input handlers', () => {
  const env = environment({ preview: true, canvas: true }); env.service.init();
  assert.equal(env.cc.Canvas.instance.node.children.length, 0);
  env.service.setEnabled(true);
  const badge = env.service._badge, text = badge.children[0], label = text.components[0];
  assert.equal(badge.name, 'DevelopmentTestModeBadge'); assert.equal(badge.width, 240); assert.equal(badge.height, 30);
  assert.equal(text.width, 228); assert.equal(text.height, 30); assert.equal(label.key, 'testing.modeBadge');
  assert.equal(badge.y, 649); assert.equal(badge.components.length, 2); assert.equal(badge.on, undefined);
  env.service.setEnabled(false); assert.equal(badge.active, false);
  env.service.setEnabled(true); assert.equal(env.cc.Canvas.instance.node.children.length, 1);
  badge.destroyed = true; env.director.emit('scene'); assert.notEqual(env.service._badge, badge);
  assert.equal(env.calls.bindings, 2);
});
console.log(passed + ' TestMode checks passed; no SDK calls, rewards, or files written.');
