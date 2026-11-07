'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { harness, config, clone } = require('./persistence-harness.cjs');
const root = path.resolve(__dirname, '../..');

function load(name, modules = {}, globals = {}) {
  const context = { exports: {}, console: { log() {}, warn() {}, error() {} },
    require: id => modules[id] || {}, __extends: (ctor, base) => Object.setPrototypeOf(ctor.prototype, base.prototype),
    __decorate: (_d, target, key) => key === undefined ? target : undefined,
    __spreadArrays: (...args) => [].concat(...args), ...globals };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), context, { filename: name + '.js' });
  return context.exports;
}

function checkpoint(h) {
  h.player.missionData.initData();
  h.player.gameData.setCheckpoint({ levelNum: 1, roundNum: 2, coin: 42, buffList: [], buildingLevel: [], businessList: {}, taskList: { index: 0, list: [1], stage: 0 } });
}

test('settlement retirement and new-game reset retain journal receipts without restoring a completed run', () => {
  for (const retire of ['settlement', 'new-game']) {
    const h = harness(), p = h.player; checkpoint(h);
    p.gameData.data.futureField = { retain: 7 };
    const save = h.Cache.saveData;
    h.Cache.saveData = function (key, value) {
      return key === p.rewardJournalKey() && value === '' ? false : save.call(this, key, value);
    };
    assert.equal(p.claimRewards([{ id: 2001, num: 123 }], 1, null,
      () => p.gameData.setCheckpoint({ roundNum: 3, coin: 45 }), () => true), null);
    const receipt = p.gameData.data.rewardTransaction;
    assert.ok(receipt); assert.ok(p.pendingRewardJournal);
    if (retire === 'settlement') p.gameData.beginSettlement([{ id: 2001, num: 50 }], 1, 1, true);
    else assert.equal(p.gameData.setNewGame(), true);
    assert.equal(p.gameData.data.rewardTransaction, receipt);
    assert.equal(p.gameData.data.levelNum, -1);
    const reloaded = harness(h.persist()); reloaded.player.preload();
    assert.equal(reloaded.player.pendingRewardJournal, null);
    assert.equal(reloaded.player.gameData.data.levelNum, -1, retire);
    assert.equal(reloaded.player.gameData.data.roundNum, undefined);
    assert.equal(reloaded.player.udata.getGoldNum(), retire === 'settlement' ? 173 : 123);
    assert.deepEqual(clone(reloaded.player.gameData.data.futureField), { retain: 7 });
    assert.equal(reloaded.player.gameData.data.rewardTransaction, receipt);
  }
});

test('failed new-game reset keeps the original resumable checkpoint and its receipt', () => {
  const h = harness(); checkpoint(h);
  h.player.gameData.data.rewardTransaction = 'retained';
  h.state.failKeys.add(h.player.gameData.gameKey);
  const before = clone(h.player.gameData.data);
  assert.equal(h.player.gameData.setNewGame(), false);
  assert.deepEqual(clone(h.player.gameData.data), before);
});

test('wave relic rewards unlock once, add fragments on double reward, and survive duplicate callbacks', () => {
  const h = harness(); checkpoint(h);
  const relic = config.TreasureCfg[0];
  const settlement = h.player.gameData.beginSettlement([{ id: relic.goodID, num: 1 }], 1, 1, true);
  assert.deepEqual(clone(h.player.udata.getTreasureLevel(relic.ID)), { id: relic.ID, level: 1, frame: 0 });
  assert.equal(h.player.gameData.settleBattle(settlement, 2), true);
  assert.equal(h.player.udata.getTreasureLevel(relic.ID).frame, 1);
  assert.equal(h.player.gameData.settleBattle(settlement, 2), true);
  const reloaded = harness(h.persist()); reloaded.player.preload();
  assert.equal(reloaded.player.udata.getTreasureLevel(relic.ID).frame, 1);
  assert.equal(reloaded.player.missionData.getAchInfoByType(2).num, 1);
});

test('all configured max-level relic wave rewards convert once and record the same earned currency', () => {
  for (const relic of config.TreasureCfg) {
    const h = harness(); checkpoint(h);
    h.player.udata.setTreasureLevel({ id: relic.ID, level: relic.levelInfo.length, frame: 0 });
    const settlement = h.player.gameData.beginSettlement([{ id: relic.goodID, num: 1 }], 1, 1, true);
    h.player.gameData.settleBattle(settlement, 2);
    h.player.gameData.settleBattle(settlement, 2);
    const expected = relic.Conversion[1] * 2;
    const actual = relic.Conversion[0] === 2001 ? h.player.udata.getGoldNum() : h.player.udata.getDiamondNum();
    assert.equal(actual, expected, 'relic ' + relic.ID);
    const type = relic.Conversion[0] === 2001 ? 8 : 9;
    assert.equal(h.player.missionData.getAchInfoByType(type).num, expected, 'earned currency for relic ' + relic.ID);
    assert.equal(h.player.udata.getTreasureLevel(relic.ID).frame, 0);
  }
});

test('relic settlement recovers every record-write interruption without losing or repeating a reward', () => {
  const relic = config.TreasureCfg[0];
  for (const mode of ['new', 'overflow']) {
    for (let boundary = 1; boundary <= 4; boundary++) {
      const h = harness(); checkpoint(h);
      if (mode === 'overflow') h.player.udata.setTreasureLevel({ id: relic.ID, level: relic.levelInfo.length, frame: 0 });
      h.state.writes = 0; h.state.crashAt = boundary;
      assert.throws(() => h.player.gameData.beginSettlement([{ id: relic.goodID, num: 1 }, { id: 2001, num: 7 }], 1, 1, true), /process interruption/);
      const reloaded = harness(h.persist()); reloaded.player.preload();
      const p = reloaded.player;
      assert.equal(p.gameData.data.pendingSettlement, undefined, mode + ' boundary ' + boundary);
      assert.equal(p.gameData.data.levelNum, -1);
      assert.equal(p.udata.getTreasureLevel(relic.ID).frame, 0);
      assert.equal(p.udata.getGoldNum(), 7 + (mode === 'overflow' && relic.Conversion[0] === 2001 ? relic.Conversion[1] : 0));
      assert.equal(p.udata.getDiamondNum(), mode === 'overflow' && relic.Conversion[0] === 2002 ? relic.Conversion[1] : 0);
      assert.equal(p.missionData.getAchInfoByType(8).num, p.udata.getGoldNum());
      assert.equal(p.missionData.getAchInfoByType(2).num, 1);
      const again = harness(reloaded.persist()); again.player.preload();
      assert.equal(again.player.udata.getGoldNum(), p.udata.getGoldNum());
      assert.deepEqual(clone(again.player.udata.getTreasureLevel(relic.ID)), clone(p.udata.getTreasureLevel(relic.ID)));
    }
  }
});

test('legacy settlement receipts without reward totals still double currency exactly once', () => {
  const h = harness(); checkpoint(h);
  const settlement = h.player.gameData.beginSettlement([{ id: 2001, num: 17 }, { id: 2004, num: 9 }], 1, 1, true);
  delete h.player.udata.data.battleSettlement.rewardTotals;
  delete h.player.missionData.data.battleSettlement.rewardTotals;
  h.player.gameData.settleBattle(settlement, 2); h.player.gameData.settleBattle(settlement, 2);
  assert.equal(h.player.udata.getGoldNum(), 34);
  assert.equal(h.player.missionData.getAchInfoByType(8).num, 34);
  assert.equal(h.player.missionData.data.achievementPoint, 18);
});

test('chapter chests use configured challenge IDs while preserving chest-index claim flags', () => {
  const h = harness(); h.player.missionData.initData(); h.player.udata.data.stageInfo = [1];
  const stage = clone(config.LevelCfg[0]);
  stage.Challenge = [3, 1, 2]; stage.ChallengeReward = [[[2001, 123]], [[2001, 456]], [[2001, 789]]];
  function Base() {}
  const animation = { setAnimation() {}, addAnimation() {} };
  const chest = { getChildByName: () => ({ getComponent: () => animation }), convertToWorldSpaceAR: () => ({ x: 0, y: 0 }) };
  const Type = load('KinghtFallHomeBattleCtrl', {
    BaseCtrl: { default: Base }, KinghtFallPlayerMgr: { KinghtFallPlayerMgr: { getInstance: () => h.player } },
    KinghtFallConfig: { KinghtFallUIID: { UIGoldReward: 1, UIHome: 2 } },
    UIMgr: { UIMgr: { getInstance: () => ({ openUI() {} }) } }
  }, { cc: { _decorator: { ccclass: t => t, property: () => () => {} }, v2: (x, y) => ({ x, y }) }, sp: { Skeleton: function () {} } }).default;
  const ctrl = Object.create(Type.prototype);
  Object.assign(ctrl, { ndBoxShow: { getChildByName: n => n === 'ndTips' ? { active: false } : chest }, selectStage: 1, cfgList: [stage], hideBoxReward() {}, initMapView() {}, showBoxReward() {} });
  ctrl.onBoxClick(0); assert.equal(h.player.udata.getGoldNum(), 0);
  ctrl.onBoxClick(1); assert.equal(h.player.udata.getGoldNum(), 456);
  assert.equal(h.player.udata.getStageReward(1, 2), true);
  assert.equal(h.player.udata.getStageReward(1, 1), false);
  ctrl.onBoxClick(2); assert.equal(h.player.udata.getGoldNum(), 456);
});

function cacheHarness(platform) {
  const storage = new Map([['progress', 'old'], ['keep', 'yes'], ['um_od', 'identity'], ['localOnly', 'stale']]);
  const state = { disk: JSON.stringify(Object.fromEntries(storage)), failFile: false, failClear: false };
  const sdk = { sffile: { progress: 'old', keep: 'yes', um_od: 'identity' }, env: { USER_DATA_PATH: 'memory' },
    getFileSystemManager: () => ({ writeFileSync(_path, bytes) { if (state.failFile) throw Error('file unavailable'); state.disk = bytes; } }) };
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value),
    clear() { if (state.failClear) throw Error('mirror unavailable'); storage.clear(); }, get length() { return storage.size; }, key: index => Array.from(storage.keys())[index] };
  const Cache = load('CacheUtils', { BasePlatform: { Platform: { WECHAT: 1, BYTEDANCE: 3 } }, PlatformManager: { PlatformManager: { currentPlatform: platform } } }, { wx: sdk, tt: sdk, localStorage }).CacheUtils;
  return { Cache, storage, state, sdk };
}

test('mini-app clearAll keeps identity keys but cannot resurrect removed file or local records', () => {
  for (const platform of [1, 3]) {
    const h = cacheHarness(platform);
    assert.equal(h.Cache.clearAll(['keep']), true);
    assert.equal(h.Cache.getData('progress'), null); assert.equal(h.Cache.getData('localOnly'), null);
    assert.equal(h.Cache.getData('keep'), 'yes'); assert.equal(h.Cache.getData('um_od'), 'identity');
    h.Cache.saveData('fresh', 'new');
    const disk = JSON.parse(h.state.disk);
    assert.equal(disk.progress, ''); assert.equal(disk.localOnly, ''); assert.equal(disk.fresh, 'new');
    assert.equal(disk.keep, 'yes'); assert.equal(disk.um_od, 'identity');
  }
});

test('failed authoritative clear preserves original data; failed mirror clear cannot revive cleared file data', () => {
  for (const platform of [1, 3]) {
    const h = cacheHarness(platform), before = h.state.disk;
    h.state.failFile = true;
    assert.equal(h.Cache.clearAll(['keep']), false);
    assert.equal(h.state.disk, before); assert.equal(h.Cache.getData('progress'), 'old'); assert.equal(h.storage.get('progress'), 'old');
    h.state.failFile = false; h.state.failClear = true;
    assert.equal(h.Cache.clearAll(['keep']), false);
    assert.equal(h.storage.get('progress'), 'old');
    assert.equal(h.Cache.getData('progress'), null); assert.equal(h.Cache.getData('localOnly'), null);
    h.Cache.saveData('fresh', 'new'); assert.equal(JSON.parse(h.state.disk).progress, '');
    assert.equal(h.Cache.getData('keep'), 'yes');
  }
});

test('actual legacy GuideData roundtrip restores numeric aliases without changing serialized keys', () => {
  const h = harness(), modules = {};
  modules.Utils = load('Utils');
  modules.Config = { GameConfig: { AppCacheName: 'legacy-test' } };
  modules.CacheUtils = { CacheUtils: h.Cache };
  modules.PlatformManager = { PlatformManager: { currentPlatform: 0 } };
  modules.BasePlatform = { Platform: { WECHAT: 1, WEB_LINK: 2 } };
  modules.ServerDataMgr = { ServerdataMgr: { getDataByKey: () => null, getNeedSaveServer: () => false } };
  modules.EventMgr = { EventMgr: { getInstance: () => ({ on() {}, emit() {} }) } };
  const globals = { setInterval() {}, cc: { game: { on() {}, EVENT_HIDE: 'hide' } } };
  modules.BaseData = load('BaseData', modules, globals);
  const Guide = load('GameGuideData', modules, globals).GuideData;
  const first = new Guide(); first.getData(); first.addCurrentId(); first.addCurrentId();
  assert.equal(first.getCurrentId(), 3);
  assert.equal(JSON.parse(h.storage.get(first.gameKey))['1'], 3);
  assert.equal(JSON.parse(h.storage.get(first.gameKey)).currentId, undefined);
  const second = new Guide(); second.getData();
  assert.equal(second.getCurrentId(), 3); assert.equal(second.getGuideEnd(), false);
  second.addCurrentId();
  const third = new Guide(); third.getData(); assert.equal(third.getGuideEnd(), true);
});

test('switch versions honor configured platforms and retain legacy Google and unknown fallbacks', () => {
  const BasePlatform = load('BasePlatform'), PlatformSetting = { currentPlatform: '' };
  const Manager = load('AppManager', { BasePlatform, PlatformSetting: { PlatformSetting } }, { cc: { error() {} } }).AppManager;
  const manager = new Manager();
  for (const platform of Object.values(BasePlatform.Platform)) {
    PlatformSetting.currentPlatform = platform;
    assert.equal(manager.getSwitchVersion({ android_google: 'google', h5_baidu: 'fallback', [platform]: 'configured' }), platform === BasePlatform.Platform.GOOGLE ? 'google' : 'configured', platform);
  }
  PlatformSetting.currentPlatform = 'unknown';
  assert.equal(manager.getSwitchVersion({ h5_baidu: 'fallback' }), 'fallback');
  assert.equal(manager.getSwitchVersion(null), 0);
});
