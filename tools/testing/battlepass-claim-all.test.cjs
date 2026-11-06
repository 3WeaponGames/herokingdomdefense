const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json').BpCfg;
const copy = value => JSON.parse(JSON.stringify(value));
const pointsFor = level => config.slice(0, level).reduce((sum, row) => sum + row.LevelCost, 0);

function harness(points = 0, claimed = {}) {
  const state = { points, claimed: { ...claimed }, grants: [], popups: [], tracks: [], ads: [], events: {} };
  function Base() {}
  Base.prototype.addEvent = function (event, fn) { state.events[event] = fn.bind(this); };
  Base.prototype.sendEvent = function (event) { if (state.events[event]) state.events[event](); };
  Base.prototype.openUI = function (id, rewards) { state.popups.push({ id, rewards: copy(rewards) }); };
  Base.prototype.closeUI = function () {};
  const mission = {
    getAchPoint: () => state.points,
    getAchReward: id => state.claimed[id] || 0,
    setAchReward: (id, bits) => { state.claimed[id] = (state.claimed[id] || 0) | bits; }
  };
  const singleton = object => ({ getInstance: () => object });
  const player = {
    getMissionData: () => mission,
    getUserData: () => ({ getMaxStage: () => 1 }),
    claimRewards(rewards, multiplier, position, markClaim, eligible) {
      if (!eligible()) return null;
      this.addRewards(rewards, multiplier, position);
      markClaim();
      return rewards;
    },
    addRewards(rewards) {
      state.grants.push(copy(rewards));
      if (state.duringGrant) state.duringGrant();
      if (state.events.redpoint) state.events.redpoint();
    }
  };
  const modules = {
    BaseUI: { default: Base },
    KinghtFallDataMgr: { KinghtFallDataMgr: singleton({ getPassCfg: () => config }) },
    KinghtFallPlayerMgr: { KinghtFallPlayerMgr: singleton(player) },
    KinghtFallConfig: { KinghtFallEventName: { TimeUpdate: 'time', UpdateRedPoint: 'redpoint' }, KinghtFallUIID: { UIGoldReward: 'reward-popup' } },
    PlayerMgr: { PlayerMgr: singleton({ getTrackData: () => ({ youmengTrack: (...args) => state.tracks.push(args) }) }) },
    GameTrackDataEvent: { TrackId: { token_normal_X: 'free', token_better_X: 'bonus' } },
    KinghtFallModle: { default: singleton({ twBreatheRedPoint() {} }) },
    SdkMgr: { AdType: { AdFreeTime: 'rewarded' }, SdkMgr: singleton({ playVideo: (...args) => state.ads.push(args) }) }
  };
  const cc = {
    _decorator: { ccclass: x => x, property: () => () => {} },
    Node: { EventType: { TOUCH_END: 'touch' } }, Label() {}, Sprite() {}, Button() {}, v2: (x, y) => ({ x, y })
  };
  function node(name, names = []) {
    const value = { name, active: true, position: { x: 0, y: 0 }, component: {}, children: [], listeners: {} };
    value.children = names.map(name => node(name));
    value.getChildByName = name => value.children.find(child => child.name === name);
    value.getComponent = () => value.component;
    value.on = (event, fn, target) => { value.listeners[event] = fn.bind(target); };
    value.off = event => { delete value.listeners[event]; };
    value.convertToWorldSpaceAR = position => position;
    value.click = () => { if (value.listeners.touch) value.listeners.touch(); };
    return value;
  }
  const ctx = { exports: {}, require: name => modules[name] || {}, cc,
    __extends: (ctor, base) => Object.setPrototypeOf(ctor.prototype, base.prototype),
    __decorate: (decorators, target, key) => key === undefined ? target : undefined };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/KinghtFallUIPassport.js'), 'utf8'), ctx);
  const ui = new ctx.exports.default();
  ui.ndTop = node('top', ['labLevel', 'labPro', 'sprPro']);
  ui.btnClose = node('close');
  ui.btnClaimAll = node('claimAll', ['bgDisabled']);
  ui.ctrList = { tmpNode: node('template'), numItems: 0 };
  ui.start();
  const row = index => {
    const value = node('row');
    for (const side of ['ndLeft', 'ndRight']) {
      const child = node(side, ['ndItem', 'ndGet', 'ndFinish', 'ndMask', 'sprVideo']);
      child.getChildByName('ndItem').ItemGood = { initView() {} };
      value.children.push(child);
    }
    value.children.push(node('ndPro', ['labLevel', 'sprPro']));
    ui.initItemView(value, index);
    return value;
  };
  return { ui, state, row, isEnabled: () => ui.btnClaimAll.component.interactable, isGray: () => ui.btnClaimAll.getChildByName('bgDisabled').active };
}

test('locked pass has a gray disabled Claim All and grants nothing', () => {
  const h = harness();
  assert.equal(h.isEnabled(), false);
  assert.equal(h.isGray(), true);
  h.ui.onClaimAll();
  assert.deepEqual(h.state.grants, []);
  assert.deepEqual(h.state.ads, []);
});

test('Claim All aggregates earned free rewards, preserves bonus bits, and excludes locked and claimed tiers', () => {
  const h = harness(pointsFor(4), { 1: 1, 3: 2 });
  assert.equal(h.isEnabled(), true);
  assert.equal(h.isGray(), false);
  const expected = [];
  for (const row of config.slice(1, 4)) {
    const reward = expected.find(item => item.id === row.Reward1[0]);
    if (reward) reward.num += row.Reward1[1];
    else expected.push({ id: row.Reward1[0], num: row.Reward1[1] });
  }
  h.state.duringGrant = () => h.ui.onClaimAll();
  h.ui.btnClaimAll.click();
  h.ui.onClaimAll();
  assert.deepEqual(h.state.grants, [expected]);
  assert.deepEqual(h.state.claimed, { 1: 1, 2: 1, 3: 3, 4: 1 });
  assert.deepEqual(h.state.popups, [{ id: 'reward-popup', rewards: expected }]);
  assert.deepEqual(h.state.ads, []);
  assert.equal(h.isEnabled(), false);
  assert.equal(h.isGray(), true);
});

test('individual claims refresh Claim All and stale row callbacks cannot grant twice', () => {
  const h = harness(pointsFor(2));
  const first = h.row(1).getChildByName('ndLeft');
  const second = h.row(2).getChildByName('ndLeft');
  first.click();
  assert.equal(h.isEnabled(), true);
  assert.equal(h.state.popups.length, 0);
  h.ui.onClaimAll();
  first.click(); second.click();
  assert.equal(h.state.grants.length, 2);
  assert.equal(h.state.popups.length, 1);
  assert.equal(h.isEnabled(), false);
});

test('points earned while open update availability without accumulating levels', () => {
  const h = harness();
  h.state.points = pointsFor(1) - 1;
  h.state.events.time();
  assert.equal(h.isEnabled(), false);
  h.state.points++;
  h.state.events.redpoint();
  assert.equal(h.ui.bpLevel, 1);
  assert.equal(h.isEnabled(), true);
  h.state.events.time(); h.state.events.time();
  assert.equal(h.ui.bpLevel, 1);
  h.ui.onClaimAll();
  assert.equal(h.isGray(), true);
  h.state.points = pointsFor(2);
  h.state.events.time();
  assert.equal(h.isEnabled(), true);
  assert.equal(h.ui.bpLevel, 2);
});

test('fully completed pass refreshes and claims safely at the final tier', () => {
  const h = harness(pointsFor(config.length) + 17);
  h.state.events.time(); h.state.events.redpoint();
  assert.equal(h.ui.bpLevel, config.length);
  assert.equal(h.ui.bpExp, 17);
  h.ui.onClaimAll();
  h.ui.onClaimAll();
  assert.equal(h.state.grants.length, 1);
  assert.equal(Object.keys(h.state.claimed).length, config.length);
  assert.equal(h.isGray(), true);
});

test('bonus-only availability stays gray and still requires the rewarded ad', () => {
  const h = harness(pointsFor(1), { 1: 1 });
  assert.equal(h.isGray(), true);
  h.ui.onClaimAll();
  assert.equal(h.state.grants.length, 0);
  const bonus = h.row(1).getChildByName('ndRight');
  bonus.click();
  assert.equal(h.state.ads.length, 1);
  assert.equal(h.state.grants.length, 0);
  assert.equal(h.state.ads[0][3], 'home.pass.premium');
  h.state.ads[0][1](); h.state.ads[0][1](); bonus.click();
  assert.deepEqual(h.state.grants, [[{ id: config[0].Reward2[0], num: config[0].Reward2[1] }]]);
  assert.equal(h.state.claimed[1], 3);
  assert.equal(h.state.ads.length, 1);
  assert.equal(h.isGray(), true);
});

test('footer Claim All is centered beside Back with green/gray art and a localized label', () => {
  const prefab = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallPrefabs/homePop/KinghtFallUIPassport.prefab'), 'utf8'));
  const controller = prefab.find(value => value.__type__ === '141cexLgaJDHaDNCakViJwv');
  const button = prefab[controller.btnClaimAll.__id__];
  const footer = prefab[button._parent.__id__];
  const back = prefab[controller.btnClose.__id__];
  assert.equal(footer._name, 'ndDown');
  assert.equal(back._parent.__id__, button._parent.__id__);
  assert.equal(button._trs.array[0], 0);
  assert.ok(back._trs.array[0] + back._contentSize.width / 2 < -button._contentSize.width / 2);
  assert.ok(Math.abs(button._trs.array[1]) + button._contentSize.height / 2 < footer._contentSize.height / 2);
  const components = button._components.map(ref => prefab[ref.__id__]);
  assert.equal(components.find(c => c.__type__ === 'cc.Sprite')._spriteFrame.__uuid__, '6c0a5351-a1ac-4371-a1bd-e6edc608d872');
  const disabled = button._children.map(ref => prefab[ref.__id__]).find(value => value._name === 'bgDisabled');
  assert.equal(prefab[disabled._components[0].__id__]._spriteFrame.__uuid__, 'c5d0e24f-8f33-44f4-a727-4c862aa4f968');
  assert.ok(prefab.some(value => value.__type__ === 'cc.Label' && value._string === '[[loc:common.claimAll]]'));
  const fileIds = prefab.filter(value => value.__type__ === 'cc.PrefabInfo').map(value => value.fileId);
  assert.equal(new Set(fileIds).size, fileIds.length);
  function validate(value) {
    if (!value || typeof value !== 'object') return;
    if ('__id__' in value) assert.ok(Number.isInteger(value.__id__) && prefab[value.__id__]);
    else Object.values(value).forEach(validate);
  }
  prefab.forEach(validate);
});
