const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const scriptRoot = path.resolve(__dirname, '../../assets/_script');
const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const clone = value => JSON.parse(JSON.stringify(value));

function harness(saved = {}) {
  const storage = clone(saved);
  const state = { writes: 0, crashAfter: Infinity, adCalls: 0, closed: 0, selected: 120001 };
  const modules = {};
  const singleton = object => ({ getInstance: () => object });
  function Base() {}
  Base.prototype.saveData = function () {
    storage[this.gameKey] = clone(this.data);
    state.writes++;
    if (state.writes === state.crashAfter) throw new Error('simulated process interruption');
  };
  Base.prototype.init = function () {};
  function load(name) {
    if (modules[name]) return modules[name];
    const ctx = { exports: {}, require: name => modules[name] || {}, console: { log() {} },
      Date, Math: Object.assign(Object.create(Math), { random: () => 1 }),
      cc: { _decorator: { ccclass: t => t, property: () => () => {} }, Node: { EventType: { TOUCH_END: 'touch' } } },
      sp: { Skeleton() {} }, __extends: (ctor, base) => Object.setPrototypeOf(ctor.prototype, base.prototype),
      __decorate: (decorators, target, key) => key === undefined ? target : undefined };
    vm.runInNewContext(fs.readFileSync(path.join(scriptRoot, name + '.js'), 'utf8'), ctx, { filename: name });
    return modules[name] = ctx.exports;
  }
  modules.BaseData = { BaseData: Base };
  modules.BaseUI = modules.BaseCtrl = { default: Base };
  modules.Config = { GameConfig: { AppCacheName: 'test' }, UIID: {} };
  modules.KinghtFallConfig = { KinghtFallParameter: { AppCacheName: 'kinght' }, KinghtFallEventName: {}, KinghtFallAudioId: {}, KinghtFallUIID: {} };
  modules.KinghtFallEnum = load('KinghtFallEnum');
  modules.EventMgr = { EventMgr: singleton({ emit() {} }) };
  modules.AudioMgr = { AudioMgr: singleton({ stopMusic() {}, playEffect() {}, playEffectFree() {} }) };
  modules.KinghtFallModle = { default: singleton({ compareIsToday: () => true }), KinghtFallRewardItem: function () {} };
  const dataMgr = {
    getGoodsCfgById: id => config.GoodsCfg[id],
    getTreasureCfgById: id => config.TreasureCfg.find(row => row.ID === id),
    getBannerCfg: () => [{ RewardID: state.selected, Weight: 1 }]
  };
  modules.KinghtFallDataMgr = { KinghtFallDataMgr: singleton(dataMgr) };
  modules.Utils = { Utils: { weight_rand: () => ({ id: state.selected }) } };
  modules.UIMgr = { UIMgr: singleton({ closeById: () => state.closed++, openUI: (a, b, rewards) => state.displayed = rewards }) };
  modules.PlayerMgr = { PlayerMgr: singleton({ getTrackData: () => ({ youmengTrack() {} }) }) };
  modules.GameTrackDataEvent = { TrackId: {} };
  modules.SdkMgr = { AdType: {}, SdkMgr: singleton({ playVideo: (type, success, fail) => { state.adCalls++; state.adSuccess = success; state.adFail = fail; } }) };
  const Player = load('KinghtFallPlayerMgr').KinghtFallPlayerMgr;
  const player = Player.getInstance();
  const User = load('KinghtFallUserData').KinghtFallUserData;
  const Mission = load('KinghtFallMissionData').KinghtFallMissionData;
  const Game = load('KinghtFallGameData').KinghtFallGameData;
  player.udata = new User(); player.missionData = new Mission(); player.gameData = new Game();
  for (const record of [player.udata, player.missionData, player.gameData]) {
    record.createData();
    if (storage[record.gameKey]) record.data = clone(storage[record.gameKey]);
  }
  player.missionData.data.taskInfo = { type: 0 };
  const controller = { gameData: { levelCfg: { Level: 1, WaveCfg: [{ WaveReward: [[2001, 125], [2004, 50]] }] }, round: 1 }, gameTag: {} };
  modules.KinghtFallUIGame = { default: { instance: { ctrGame: controller } } };
  function screen(win = true) {
    const UI = load('KinghtFallUIGameEnd').default;
    const ui = new UI();
    const node = () => { const n = {}; n.on = (event, fn) => { n.click = fn; }; return n; };
    Object.assign(ui, { isWin: win, closeUI: () => state.closed++, ndReward: { init() {} },
      btnBreak: node(), btnVideo: node(), btnNewGame: node(), spAni: { setAnimation() { return {}; }, addAnimation() {}, setTrackCompleteListener() {} } });
    return ui;
  }
  function draw(name, id) {
    state.selected = id;
    const UI = load(name).default;
    const ui = new UI();
    Object.assign(ui, { cfgBox: { GuarantNumber: 20 }, sendEvent() {}, initView() {}, upView() {}, scheduleOnce() {}, ndCtr: { init() {}, node: { removeAllChildren() {} } } });
    ui.getReward(1, 1);
    return name === 'KinghtFallHomeTreasureCtrl' ? state.displayed : ui.getSkillList;
  }
  return { player, storage, state, screen, draw, controller, enums: modules.KinghtFallEnum };
}

function verifyBase(h, win = true, multiplier = 1) {
  const { player, enums } = h;
  assert.equal(player.udata.getGoldNum(), 125 * multiplier);
  assert.equal(player.missionData.getAchPoint(), 50 * multiplier);
  assert.equal(player.udata.getMaxStage(), win ? 2 : 1);
  assert.equal(player.missionData.getAchInfoByType(enums.KinghtFallEnumAchiEnum.GetGold).num, 125 * multiplier);
  assert.equal(player.missionData.getAchInfoByType(enums.KinghtFallEnumAchiEnum.LevelChallenges).num, 1);
  assert.equal(player.gameData.hasSave(1), false);
}

test('settlement screen credits and saves victory and defeat rewards before Continue', () => {
  for (const win of [true, false]) {
    const h = harness();
    h.player.gameData.setLevelInfo(1, 1, 0);
    const ui = h.screen(win);
    ui.start();
    verifyBase(h, win);
    const reloaded = harness(h.storage);
    reloaded.player.gameData.initData();
    verifyBase(reloaded, win);
    ui.btnBreak.click(); ui.btnBreak.click();
    verifyBase(h, win);
  }
});

test('every settlement save boundary recovers once after a process interruption', () => {
  for (const win of [true, false]) for (let step = 1; step <= 4; step++) {
    const h = harness();
    h.state.crashAfter = step;
    assert.throws(() => h.screen(win).start(), /interruption/);
    const restored = harness(h.storage);
    restored.player.gameData.initData();
    restored.player.gameData.initData();
    verifyBase(restored, win);
  }
});

test('double reward grants only one extra copy and ignores repeated callbacks', () => {
  const h = harness(), ui = h.screen();
  ui.start();
  ui.btnVideo.click(); ui.btnVideo.click(); ui.btnBreak.click();
  assert.equal(h.state.adCalls, 1);
  assert.equal(h.state.closed, 0);
  h.state.adSuccess(); h.state.adSuccess(); ui.btnBreak.click();
  verifyBase(h, true, 2);
  const reloaded = harness(h.storage); reloaded.player.gameData.initData();
  verifyBase(reloaded, true, 2);
});

test('failed ad preserves the base reward and permits Continue', () => {
  const h = harness(), ui = h.screen(); ui.start();
  ui.btnVideo.click(); h.state.adFail(); ui.btnBreak.click();
  verifyBase(h);
  assert.equal(h.state.closed, 2);
  h.state.adSuccess(); verifyBase(h);
});

test('interrupted double reward replays each target record without duplicating base rewards', () => {
  for (let step = 1; step <= 4; step++) {
    const h = harness(), ui = h.screen(); ui.start(); ui.btnVideo.click();
    h.state.crashAfter = h.state.writes + step;
    assert.throws(() => h.state.adSuccess(), /interruption/);
    const restored = harness(h.storage); restored.player.gameData.initData(); restored.player.gameData.initData();
    verifyBase(restored, true, 2);
  }
});

test('reopening the same settlement panel does not duplicate its base reward', () => {
  const h = harness(); h.screen().start();
  const repeated = h.screen(); repeated.start();
  verifyBase(h);
  repeated.btnVideo.click(); h.state.adSuccess(); verifyBase(h, true, 2);
});

test('a stale double-reward callback cannot overwrite a newer saved run', () => {
  const h = harness(), ui = h.screen(); ui.start();
  ui.btnVideo.click();
  h.player.gameData.setLevelInfo(2, 3, 42);
  h.player.gameData.saveData();
  const before = clone(h.storage);
  assert.equal(h.player.gameData.settleBattle(ui.settlement, 2), false);
  h.state.adSuccess();
  assert.equal(h.state.closed, 0);
  assert.deepEqual(h.storage, before);
  assert.equal(h.player.gameData.hasSave(2), true);
  assert.equal(h.player.gameData.getRoundNum(), 3);
  assert.equal(h.player.udata.getGoldNum(), 125);
});

for (const screen of ['KinghtFallHomeTreasureCtrl', 'KinghtFallUITreasureReward']) {
  test(screen + ': all 27 max-level relic duplicates convert into their configured currency', () => {
    for (const relic of config.TreasureCfg) {
      const h = harness();
      h.player.udata.setTreasureLevel({ id: relic.ID, level: relic.levelInfo.length, frame: 0 });
      const result = h.draw(screen, relic.ID);
      assert.deepEqual(clone(result), [{ item: { id: relic.Conversion[0], num: relic.Conversion[1] }, isNew: false }], 'relic ' + relic.ID);
      assert.equal(h.player.udata.getTreasureLevel(relic.ID).frame, 0);
      const balance = relic.Conversion[0] === 2001 ? h.player.udata.getGoldNum() : h.player.udata.getDiamondNum();
      assert.equal(balance, relic.Conversion[1]);
    }
  });
  test(screen + ': first ownership, needed fragments, and fully funded upgrades retain intended rewards', () => {
    const relic = config.TreasureCfg[0], h = harness();
    assert.equal(h.draw(screen, relic.ID)[0].isNew, true);
    assert.equal(h.player.udata.getTreasureLevel(relic.ID).frame, 0);
    assert.equal(h.draw(screen, relic.ID)[0].item.id, relic.goodID);
    assert.equal(h.player.udata.getTreasureLevel(relic.ID).frame, 1);
    const capacity = relic.levelInfo.slice(0, -1).reduce((sum, level) => sum + level.PieceCost, 0);
    h.player.udata.getTreasureLevel(relic.ID).frame = capacity;
    assert.equal(h.draw(screen, relic.ID)[0].item.id, relic.Conversion[0]);
    assert.equal(h.player.udata.getTreasureLevel(relic.ID).frame, capacity);
  });
}
