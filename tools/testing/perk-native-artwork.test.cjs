'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
function harness(native = true) {
  function Base() {}
  Base.prototype.onLoad = function () { this.baseLoaded = true; };
  Base.prototype.onDestroy = function () { this.baseDestroyed = true; };
  class SpriteFrame {
    constructor(texture, rect, rotated, offset, size) { Object.assign(this, { texture, rect, rotated, offset, size }); }
    destroy() { this.destroyed = (this.destroyed || 0) + 1; }
  }
  const cc = { sys: { isNative: native }, SpriteFrame, Sprite: class {}, _decorator: { ccclass: t => t, property: () => () => {} } };
  const modules = { BaseUI: { default: Base } };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/_script/KinghtFallUIBuff.js'), 'utf8'), {
    exports, cc, sp: { Skeleton: class {} }, require: name => modules[name] || (modules[name] = {}),
    __extends: (ctor, base) => { Object.setPrototypeOf(ctor.prototype, base.prototype); },
    __decorate: (decorators, target, key) => key === undefined ? target : undefined,
    __spreadArrays: (...args) => [].concat(...args)
  });
  const view = new exports.default();
  const texture = { packable: true }, atlas = {};
  const frame = { _original: { _texture: texture, _x: 4, _y: 7 }, insetLeft: 59, insetRight: 59, insetTop: 24, insetBottom: 24,
    getTexture: () => atlas, getRect: () => ({ x: 900, y: 835, width: 224, height: 92 }),
    isRotated: () => true, getOffset: () => ({ x: 3, y: -2 }), getOriginalSize: () => ({ width: 230, height: 96 }) };
  return { view, frame, texture, atlas, modules };
}
test('native perk artwork recovers original texture coordinates without modifying shared atlas frames', () => {
  const { view, frame, texture, atlas } = harness(), original = frame._original;
  const copy = view._nativeFrame(frame);
  assert.equal(copy.texture, texture);
  assert.deepEqual(copy.rect, { x: 4, y: 7, width: 224, height: 92 });
  assert.equal(copy.rotated, true);
  assert.deepEqual(copy.offset, { x: 3, y: -2 });
  assert.deepEqual(copy.size, { width: 230, height: 96 });
  assert.deepEqual([copy.insetLeft, copy.insetRight, copy.insetTop, copy.insetBottom], [59, 59, 24, 24]);
  assert.equal(texture.packable, false, 'native modal sprites must not re-enter a stale atlas');
  assert.equal(frame._original, original, 'other live UI sprites retain their atlas binding');
  assert.equal(frame.getTexture(), atlas);
  assert.equal(view._nativeFrame(frame), copy, 'duplicate ad icons share a recovered frame');
});
test('all native perk sprites rebind and modal teardown releases only its owned frame wrappers', () => {
  const { view, frame, texture } = harness();
  const sprites = [{ spriteFrame: frame }, { spriteFrame: frame }, { spriteFrame: null }];
  view.node = { getComponentsInChildren: () => sprites };
  view.onLoad();
  assert.equal(view.baseLoaded, true);
  assert.equal(sprites[0].spriteFrame, sprites[1].spriteFrame);
  assert.notEqual(sprites[0].spriteFrame, frame);
  assert.equal(sprites[2].spriteFrame, null);
  view.onDestroy();
  assert.equal(sprites[0].spriteFrame.destroyed, 1);
  assert.equal(view._nativeSpriteFrames.size, 0);
  assert.equal(view.baseDestroyed, true);
  assert.equal(frame.destroyed, undefined);
  assert.equal(texture.destroyed, undefined);
});
test('unpacked native textures stay original and browser artwork keeps its existing batching', () => {
  const { view, frame, texture } = harness();
  frame._original = null; frame.getTexture = () => texture;
  assert.equal(view._nativeFrame(frame), frame);
  assert.equal(texture.packable, false);
  const browser = harness(false);
  assert.equal(browser.view._nativeFrame(browser.frame), browser.frame);
  assert.equal(browser.texture.packable, true);
  assert.equal(browser.view._nativeSpriteFrames, undefined);
});

test('every authored perk icon exists and asynchronous choice callbacks bind its original native artwork', () => {
  const root = path.resolve(__dirname, '../..'), config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
  for (const perk of Object.values(config.BuffCfg)) {
    assert(fs.existsSync(path.join(root, 'assets/KinghtFallIconBuff', perk.Image + '.png')), 'Missing perk artwork: ' + perk.Image);
  }
  const { view, frame, texture, modules } = harness(), pending = [];
  Object.assign(modules.KinghtFallConfig, { KinghtFallBundelName: { IconBuff: 'perks' } });
  Object.assign(modules.KinghtFallDataMgr, { KinghtFallDataMgr: { getInstance: () => ({ getBuffCfgById: id => Object.values(config.BuffCfg).find(perk => perk.ID === id) }) } });
  Object.assign(modules.Utils, { Utils: { StringFormat: value => value } });
  modules.LanguageMgr = { LanguageMgr: { getInstance: () => ({ format: value => value }) } };
  view.sprfBgList = view.sprfIconList = [frame, frame, frame, frame];
  const icon = {}, rich = {}, skeleton = { node: {}, setSkin() {} };
  const children = { spAniBg: { getComponent: () => skeleton }, spAniIcon: {}, sprIcon: { getComponent: () => icon },
    sprBg: { getComponent: () => ({}) }, sprIocnBg: { getComponent: () => ({}) }, labInfo: { getComponent: () => rich } };
  view.ndItemList = [{ getChildByName: name => children[name] }];
  view.loadSpriteFrame = (_bundle, image, done) => pending.push({ image, done });
  for (const perk of Object.values(config.BuffCfg)) {
    view.selInfo = [perk.ID]; view.showItem(0);
    const request = pending.pop(); assert.equal(request.image, perk.Image);
    request.done(frame);
    assert.equal(icon.spriteFrame.texture, texture, 'loaded perk icon did not reach its Sprite');
  }
});
