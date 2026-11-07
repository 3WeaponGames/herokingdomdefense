'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json').onLineRewardCfg;

function harness(minutes = 0, previouslyClaimed = []) {
  const state = { seconds: minutes * 60, claimed: new Set(previouslyClaimed), grants: [], events: [], callbacks: {} };
  const daily = {
    getOnlineTime: () => state.seconds,
    getOnlineTimeReward: id => state.claimed.has(id),
    setOnlineTimeReward: id => state.claimed.add(id)
  };
  const player = {
    getDailyData: () => daily,
    claimRewards(rewards, multiplier, position, markClaim, eligible) {
      if (!eligible()) return null;
      this.addRewards(rewards, multiplier, position);
      markClaim();
      return rewards;
    },
    addRewards(rewards, multiplier) {
      state.grants.push(JSON.parse(JSON.stringify(rewards)));
      assert.equal(multiplier, 1);
      if (state.duringGrant) state.duringGrant();
    }
  };
  function Base() {}
  Base.prototype.addEvent = (name, handler) => { state.callbacks[name] = handler; };
  Base.prototype.sendEvent = (...args) => state.events.push(args);
  const Button = function () {}, ItemGood = function () {};
  function node(name = '') {
    const children = new Map(), component = {};
    return {
      name, active: true, position: { x: 0, y: 0 },
      getChildByName(key) { if (!children.has(key)) children.set(key, node(key)); return children.get(key); },
      getComponent() { return component; },
      convertToWorldSpaceAR: value => value,
      on(event, callback, target) { this.click = () => callback.call(target); }, off() {},
      setParent() {}, setScale() {}
    };
  }
  const modules = {
    BaseUI: { default: Base }, List: { default: function () {} },
    KinghtFallPlayerMgr: { KinghtFallPlayerMgr: { getInstance: () => player } },
    KinghtFallDataMgr: { KinghtFallDataMgr: { getInstance: () => ({ getOnlineRewardCfg: () => config }) } },
    KinghtFallConfig: { KinghtFallEventName: { TimeUpdate: 'time', UpdateRedPoint: 'red' }, KinghtFallPoolName: {} },
    KinghtFallTextConfig: { KinghtFallTextConfig: {} },
    KinghtFallItemGood: { default: ItemGood }, Utils: { Utils: { StringFormat: value => value } }
  };
  const cc = { Button, Label: function () {}, RichText: function () {}, Sprite: function () {},
    Node: { EventType: { TOUCH_END: 'touch' } }, v2: (x, y) => ({ x, y }),
    _decorator: { ccclass: value => value, property: () => () => {} } };
  const context = { exports: {}, require: name => modules[name] || {}, cc,
    __extends: (ctor, base) => Object.setPrototypeOf(ctor.prototype, base.prototype),
    __decorate: (decorators, target, key) => key === undefined ? target : undefined };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/KinghtFallUIOnlineReward.js'), 'utf8'), context);
  const ui = new context.exports.default();
  ui.btnClose = node(); ui.btnClaimAll = node();
  state.listResizes = 0; state.rowRefreshes = [];
  ui.ctrList = { tmpNode: node(), updateItem(index) { state.rowRefreshes.push(index); },
    get numItems() { return this.count; }, set numItems(value) { this.count = value; state.listResizes++; } };
  ui.T = value => value;
  ui.start();
  function row(index) {
    const item = node(); item.getChildByName('ndItem').ItemGood = { initView() {} };
    ui.initListItem(item, index);
    return item;
  }
  return { ui, state, row, Button };
}

test('Playtime Claim All is gray and cannot grant rewards before the first threshold', () => {
  const { ui, state, Button } = harness(4.99);
  assert.equal(ui.btnClaimAll.getComponent(Button).interactable, false);
  assert.equal(ui.btnClaimAll.getChildByName('bgDisabled').active, true);
  ui.btnClaimAll.click();
  assert.equal(state.grants.length, 0);
  assert.equal(state.claimed.size, 0);
});

test('Claim All collects every earned tier once and combines identical currencies', () => {
  const { ui, state, Button } = harness(10);
  assert.equal(ui.btnClaimAll.getComponent(Button).interactable, true);
  assert.equal(ui.btnClaimAll.getChildByName('bgDisabled').active, false);
  ui.btnClaimAll.click();
  assert.deepEqual(state.grants, [[{ id: 2002, num: 30 }]]);
  assert.deepEqual([...state.claimed], [1, 2]);
  assert.deepEqual(state.events, [['red', 4]]);
  assert.equal(ui.btnClaimAll.getComponent(Button).interactable, false);
  assert.equal(ui.btnClaimAll.getChildByName('bgDisabled').active, true);
  ui.btnClaimAll.click();
  assert.equal(state.grants.length, 1);
});

test('Already claimed rewards are excluded and all six tiers remain claimable', () => {
  const { ui, state } = harness(60, [1, 3]);
  ui.onClaimAll();
  assert.deepEqual(state.grants, [[{ id: 2002, num: 170 }]]);
  assert.equal(state.claimed.size, 6);
});

test('Time updates enable Claim All exactly when another reward becomes earned', () => {
  const { ui, state, Button } = harness(5, [1]);
  assert.equal(ui.btnClaimAll.getComponent(Button).interactable, false);
  state.seconds = 600;
  state.callbacks.time.call(ui);
  assert.equal(ui.btnClaimAll.getComponent(Button).interactable, true);
  ui.onClaimAll();
  assert.deepEqual(state.grants, [[{ id: 2002, num: 20 }]]);
});

test('second ticks never resize or rebuild the scrolling list; minute and claim changes update rows only', () => {
  const { ui, state } = harness(4);
  for (let second=241;second<300;second++) { state.seconds=second; state.callbacks.time.call(ui); }
  assert.equal(state.listResizes,1);assert.equal(state.rowRefreshes.length,0);
  state.seconds=300;state.callbacks.time.call(ui);
  assert.equal(state.listResizes,1);assert.equal(state.rowRefreshes.length,config.length);
  ui.onClaimAll();assert.equal(state.listResizes,1);assert.equal(state.rowRefreshes.length,config.length*2);
});

test('Individual claims and Claim All share eligibility and cannot double-award', () => {
  const { ui, state, row } = harness(10);
  const first = row(0).getChildByName('ndFinish').getChildByName('btnGet');
  first.click(); first.click();
  ui.onClaimAll();
  assert.deepEqual(state.grants, [[{ id: 2002, num: 10 }], [{ id: 2002, num: 20 }]]);
  assert.deepEqual([...state.claimed], [1, 2]);
  ui.claimRewards([config[5]]);
  assert.equal(state.grants.length, 2);
});

test('A synchronous reward callback cannot reenter Claim All before flags are saved', () => {
  const { ui, state } = harness(10);
  state.duringGrant = () => ui.onClaimAll();
  ui.onClaimAll();
  assert.equal(state.grants.length, 1);
  assert.equal(state.claimed.size, 2);
});

test('The fixed footer is centered below the scroll viewport with shared localized text', () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallPrefabs/homePop/KinghtFallUIOnlineReward.prefab'), 'utf8'));
  const ui = data.find(value => value.ctrList && value.btnClose);
  const button = data[ui.btnClaimAll.__id__];
  const scroll = data.find(value => value._name === 'New ScrollView');
  const label = data[button._children.find(ref => data[ref.__id__]._name === 'labTitle').__id__];
  assert.equal(button._parent.__id__, scroll._parent.__id__);
  assert.equal(button._trs.array[0], 0);
  assert(button._trs.array[1] + button._contentSize.height / 2 < scroll._trs.array[1] - scroll._contentSize.height / 2);
  assert.equal(data[label._components[0].__id__]._string, '[[loc:common.claimAll]]');
  const catalog = require('../../assets/resources/localization/catalog.json');
  assert.equal(catalog.entries['common.claimAll'].en, 'Claim All');
  assert(catalog.labelStyles['common.claimAll'].en.width <= button._contentSize.width);
});
