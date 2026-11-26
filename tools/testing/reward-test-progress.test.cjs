'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { harness, config } = require('./persistence-harness.cjs');

function fixture() {
  const h = harness(), player = h.player, daily = player.getDailyData(), mission = player.getMissionData();
  mission.initData();
  player.rewardRecords().forEach(record => record.saveData());
  const before = h.persist();
  const Progress = h.load('RewardTestProgress');
  const data = {
    getSignCfg: () => config.SignCfg,
    getPassCfg: () => config.BpCfg,
    getOnlineRewardCfg: () => config.onLineRewardCfg
  };
  const main = { checkDailyRollover() { daily.ensureCurrentDay(); mission.initData(); } };
  h.modules.ServerDataMgr.ServerdataMgr.getNeedSaveServer = () => true;
  h.modules.ServerDataMgr.ServerdataMgr.saveData = () => assert.fail('Preview records must not sync to the server');
  return { ...h, player, daily, mission, Progress, before, run: (action, battle) => Progress.run(action, player, data, main, battle) };
}

test('seven days of ordinary sign-in claims and daily reset use temporary progress', () => {
  const f = fixture(), login = f.load('KinghtFallEnum').KinghtFallEnumAchiEnum.LoginDays;
  const original = f.mission.getAchInfoByType(login).num;
  assert.equal(f.Progress.active(), false);
  f.run('day');
  assert.equal(f.daily.getSignDay(), 0, 'an unclaimed sign-in day remains available');
  for (let i = 0; i < 7; i++) {
    assert.equal(f.daily.getSignDay(), i);
    assert.equal(f.daily.getSignReward(), 0);
    assert(f.claim('sign'));
    assert.equal(f.daily.getSignReward(), 1);
    f.daily.addOnlineTime(400);
    f.daily.setOnlineTimeReward(1);
    const previous = new Date(f.daily.calendarTime()).toDateString();
    f.run('day');
    assert.notEqual(new Date(f.daily.calendarTime()).toDateString(), previous);
    assert.equal(f.daily.getOnlineTime(), 0);
    assert.equal(f.daily.getOnlineTimeReward(1), undefined);
    assert.equal(f.daily.ensureCurrentDay(), false);
  }
  assert.equal(f.daily.getSignDay(), 7);
  assert.equal(f.mission.getAchInfoByType(login).num, original + 8);
  assert.deepEqual(f.persist(), f.before);
  assert.equal(harness(f.before).player.getDailyData().getSignDay(), 0);
});

test('reward shortcuts make the next item claimable without collecting or changing the real save', () => {
  const f = fixture(), quest = f.mission.getQuestViews().find(row => !row.progress.ready);
  assert(quest);
  const passCost = config.BpCfg[0].LevelCost;
  const playtime = config.onLineRewardCfg[0];
  const task = { list: ['kill-hero'], index: 0, stage: 0, targets: [16], progress: 4 };
  let savedTask = 0, refreshed = 0;
  const battle = { ctrGame: { gameData: { taskInfo: task }, saveGame() { savedTask++; } }, initView() { refreshed++; } };
  f.run('quest');
  assert(f.mission.getQuestViews().some(row => row.task.id === quest.task.id && row.progress.ready));
  f.run('pass');
  assert.equal(f.mission.getAchPoint(), passCost);
  assert.equal(f.mission.getAchReward(1), 0);
  f.run('playtime');
  assert.equal(f.daily.getOnlineTime(), playtime.condition * 60);
  assert.equal(f.daily.getOnlineTimeReward(playtime.id), undefined);
  f.run('task', battle);
  assert.deepEqual([task.stage, task.progress, savedTask, refreshed], [1, 16, 1, 1]);
  assert.deepEqual(f.persist(), f.before);
});

test('opening the test service does no writes and pending real progress keeps ownership', () => {
  const f = fixture(), writes = f.state.writes;
  f.player.getDailyData().localSavePending = true;
  assert.throws(() => f.run('day'), /pending save/);
  assert.equal(f.state.writes, writes);
  assert.equal(f.Progress.active(), false);
  f.player.getDailyData().localSavePending = false;
  f.run('day');
  assert.equal(f.state.writes, writes);
});

test('advancing a test day renews the shop daily deal and keeps the saved shop and wallet intact', () => {
  const f = fixture();
  const manager = { ...f.modules.KinghtFallDataMgr.KinghtFallDataMgr.getInstance(), getTreasureCfg: () => config.TreasureCfg };
  const shop = f.load('ShopRuntime').create(f.player, manager, {
    now: () => f.daily.calendarTime(), isTestProfile: f.Progress.active
  });
  f.run('playtime');
  const view = shop.getView();
  assert.equal(view.ready, true, view.error);
  assert.equal(shop.claimDaily(view.token).ok, true);
  assert.equal(shop.getView().dailyDeal.claimed, true);
  f.run('day');
  assert.equal(shop.getView().dailyDeal.claimed, false);
  assert.equal(f.Cache.clearAll(), false);
  assert.deepEqual(f.persist(), f.before);
});

for (const isNative of [false, true]) {
  test(`reset boots an empty test profile and returning reloads the saved progress (${isNative ? 'native' : 'browser'})`, () => {
    let restarts = 0;
    const tabStorage = new Map(), restart = () => { restarts++; };
    function boot({ globals, modules }) {
      globals.cc.sys = { isNative, localStorage: globals.localStorage };
      globals.cc.game.restart = restart;
      globals.window = { location: { reload: restart }, sessionStorage: {
        getItem: key => tabStorage.get(key), setItem: (key, value) => tabStorage.set(key, value), removeItem: key => tabStorage.delete(key)
      } };
      modules.TestMode = { TestMode: { getInstance: () => ({ isAvailable: () => true }) } };
    }
    const before = harness({}, boot);
    before.player.udata.data.goldNum = 4589;
    before.player.guideData.data.GroupId = 99;
    before.player.rewardRecords().forEach(record => record.saveData());
    const otherProgress = 'test' + 'trackdata';
    before.Cache.saveData(otherProgress, 'previous player');
    before.Cache.saveData('MUSIC', '0');
    const original = before.persist();
    before.load('RewardTestProgress').returnToSavedProgress();
    assert.equal(restarts, 0);
    before.load('RewardTestProgress').requestNewPlayer(before.player);
    assert.equal(restarts, 1);

    const fresh = harness(before.persist(), context => {
      boot(context);
      assert.equal(context.load('RewardTestProgress').prepareStartup(), false);
    });
    assert.equal(fresh.load('RewardTestProgress').active(), true);
    assert.notEqual(fresh.player.udata.getGoldNum(), 4589);
    assert.equal(fresh.player.guideData.getGroupId(), 1);
    assert.equal(fresh.Cache.getData(otherProgress), null);
    assert.equal(fresh.Cache.getData('MUSIC'), '0');
    fresh.Cache.saveData(otherProgress, 'test player');
    assert(fresh.claim('sign'));
    assert.deepEqual(fresh.persist(), original);
    fresh.load('RewardTestProgress').returnToSavedProgress();
    assert.equal(restarts, 2);
    const reopened = harness(fresh.persist(), context => {
      boot(context);
      const progress = context.load('RewardTestProgress');
      assert.equal(progress.prepareStartup(), true);
      assert.equal(progress.prepareStartup(), false);
    });
    assert.equal(reopened.load('RewardTestProgress').active(), false);
    assert.equal(reopened.player.udata.getGoldNum(), 4589);
    assert.equal(reopened.player.guideData.getGroupId(), 99);
    assert.equal(reopened.player.getDailyData().getSignDay(), 0);
    assert.equal(reopened.player.getDailyData().getSignReward(), 0);
    assert.equal(reopened.Cache.getData(otherProgress), 'previous player');
    assert.deepEqual(reopened.persist(), original);
  });
}
