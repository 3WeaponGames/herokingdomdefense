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
