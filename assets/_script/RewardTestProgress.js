"use strict";

var session;

function start(player) {
  if (session && session.player === player) return;
  var cache = require("CacheUtils").CacheUtils;
  var records = player.rewardRecords(), journal = player.rewardJournalKey();
  if (player.claimingRewardTransaction || player.pendingRewardJournal || player.rewardStorageCheckPending ||
      cache.getData(journal) || records.some(function (record) {
        return record.pause || record.deferSave || record.saveBlockedByRecovery || record.localSavePending || record.clearPending;
      })) throw Error("Finish the pending save or reward claim before testing.");
  if (!cache.previewProgress(records.map(function (record) { return record.gameKey; }).concat(journal))) {
    throw Error("Reload the preview to start a new reward test session.");
  }
  records.forEach(function (record) { record.invalidateCloudSaves(); });
  var preview = session = { player: player, days: 0 };
  function clock() {
    var date = new Date();
    date.setDate(date.getDate() + preview.days);
    return date.getTime();
  }
  player.getDailyData()._rewardTestClock = clock;
  player.getMissionData()._rewardTestClock = clock;
}

function nextTask(battle) {
  var game = battle && battle.ctrGame, data = game && game.gameData, task = data && data.taskInfo;
  if (!task || game._restartRetired || task.index >= task.list.length) return "No Advisor task is available.";
  if (task.stage === 1) return "The current Advisor task is ready to claim.";
  if (task.targets) task.progress = task.targets[task.index];
  task.stage = 1;
  game.saveGame();
  battle.initView();
  return "The next Advisor task is ready to claim.";
}

function nextQuest(mission) {
  var next = mission.getQuestViews().find(function (row) { return !row.progress.ready; });
  if (!next) return "There are no incomplete quests on the board.";
  mission.setTaskInfo(Object.assign({}, next.task, { num: next.progress.total, stage: 1 }));
  return "Quest " + next.task.id + " is ready to claim.";
}

function nextPass(mission, config) {
  var points = mission.getAchPoint(), threshold = 0;
  var tier = config.getPassCfg().find(function (row) {
    threshold += row.LevelCost;
    return threshold > points;
  });
  if (!tier) return "All Battle Pass tiers are unlocked.";
  mission.addAchPoint(threshold - points);
  return "Battle Pass tier " + tier.ID + " is ready to claim.";
}

function nextPlaytime(daily, config) {
  var elapsed = daily.getOnlineTime();
  var reward = config.getOnlineRewardCfg().find(function (row) {
    return row.condition * 60 > elapsed && !daily.getOnlineTimeReward(row.id);
  });
  if (!reward) return "All playtime rewards are available or collected.";
  daily.addOnlineTime(reward.condition * 60 - elapsed);
  return "The " + reward.condition + "-minute playtime reward is ready.";
}

function refreshRewards() {
  var events = require("EventMgr").EventMgr.getInstance();
  var names = require("KinghtFallConfig").KinghtFallEventName;
  events.emit(names.TimeUpdate);
  events.emit(names.UpdateRedPoint, 31);
}

function run(action, player, config, main, battle) {
  start(player);
  switch (action) {
    case "day":
      session.days++;
      main.checkDailyRollover();
      return "A new test day has started.";
    case "task":
      return nextTask(battle);
    case "quest":
      var quest = nextQuest(player.getMissionData());
      refreshRewards();
      return quest;
    case "pass":
      var tier = nextPass(player.getMissionData(), config);
      refreshRewards();
      return tier;
    case "playtime":
      player.getDailyData().ensureCurrentDay();
      var reward = nextPlaytime(player.getDailyData(), config);
      refreshRewards();
      return reward;
  }
}

exports.run = run;
exports.start = start;
exports.active = function () { return !!session; };
