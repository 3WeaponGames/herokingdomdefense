'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function fixture() {
  function Base() {}
  const cc = {
    sys: { isNative: false }, Sprite: class {}, RichText: class {},
    _decorator: { ccclass: value => value, property: () => () => {} },
    isValid: (value, strict) => !!value && !value.destroyed && (!strict || !value.queuedDestroy)
  };
  const rows = { 1: { Quality: 1, Image: 'old-icon', Pamer: [], Describe: 'Old' },
    2: { Quality: 2, Image: 'new-icon', Pamer: [], Describe: 'New' } };
  const modules = {
    BaseUI: { default: Base },
    KinghtFallConfig: { KinghtFallBundelName: { IconBuff: 'icons' } },
    KinghtFallDataMgr: { KinghtFallDataMgr: { getInstance: () => ({ getBuffCfgById: id => rows[id] }) } },
    Utils: { Utils: { StringFormat: value => value } },
    LanguageMgr: { LanguageMgr: { getInstance: () => ({ format: value => value }) } }
  };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/_script/KinghtFallUIBuff.js'), 'utf8'), {
    exports, cc, sp: { Skeleton: class {} }, require: name => modules[name] || {},
    __extends: (ctor, base) => { Object.setPrototypeOf(ctor.prototype, base.prototype); },
    __decorate: (_decorators, target, key) => key === undefined ? target : undefined,
    __spreadArrays: (...args) => [].concat(...args)
  });
  const view = new exports.default(), pending = [], icon = { node: {} }, rich = {};
  const skeleton = { node: {}, setSkin() {} };
  const children = { spAniBg: { getComponent: () => skeleton }, spAniIcon: {},
    sprIcon: { getComponent: () => icon }, sprBg: { getComponent: () => ({}) },
    sprIocnBg: { getComponent: () => ({}) }, labInfo: { getComponent: () => rich } };
  const item = { active: true, getChildByName: name => children[name] };
  view.sprfBgList = view.sprfIconList = [{}, {}, {}, {}];
  view.ndItemList = [item]; view._resourceGeneration = 1;
  // BaseUI guards panel lifetime. Hold actual showItem completions independently
  // to exercise offer changes within that same live panel.
  view.loadSpriteFrame = (_bundle, image, done) => pending.push({ image, done });
  function show(id) { view.selInfo = id === undefined ? [] : [id]; view.showItem(0); }
  return { view, pending, icon, item, show };
}

test('reroll keeps the current offer icon when an earlier load completes last', () => {
  const h = fixture(); h.show(1); h.show(2);
  const current = {}; h.pending[1].done(current); h.pending[0].done({});
  assert.equal(h.icon.spriteFrame, current);
});

test('a hidden offer invalidates its pending icon and a later visible offer can load', () => {
  const h = fixture(); h.show(1); h.show(); h.pending[0].done({});
  assert.equal(h.icon.spriteFrame, undefined);
  h.show(2); const current = {}; h.pending[1].done(current);
  assert.equal(h.icon.spriteFrame, current);
});

for (const retire of ['closed panel', 'reopened panel', 'replaced item', 'destroyed panel',
  'queued item destruction', 'destroyed sprite', 'queued sprite-node destruction']) {
  test('pending perk icon ignores ' + retire, () => {
    const h = fixture(); h.show(1);
    if (retire === 'closed panel') h.view.isclose = true;
    if (retire === 'reopened panel') h.view._resourceGeneration++;
    if (retire === 'replaced item') h.view.ndItemList[0] = {};
    if (retire === 'destroyed panel') h.view.destroyed = true;
    if (retire === 'queued item destruction') h.item.queuedDestroy = true;
    if (retire === 'destroyed sprite') h.icon.destroyed = true;
    if (retire === 'queued sprite-node destruction') h.icon.node.queuedDestroy = true;
    h.pending[0].done({}); assert.equal(h.icon.spriteFrame, undefined);
  });
}

test('request identity rejects an older load even when reroll selects the same perk again', () => {
  const h = fixture(); h.show(1); h.show(1);
  const current = {}; h.pending[1].done(current); h.pending[0].done({});
  assert.equal(h.icon.spriteFrame, current);
});
