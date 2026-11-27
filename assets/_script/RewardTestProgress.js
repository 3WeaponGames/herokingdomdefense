"use strict";

var PROFILE_RESTART_KEY = "project-cocos.preview.new-player";
var SaveSlots = require("PreviewSaveSlots");
var session, saveSlots, selectedSlot;

function savePrefixes() {
  var config = require("Config").GameConfig;
  return [config.AppCacheName, config.WebCacheName];
}

function recordsReady(player) {
  if (!player) return [];
  var cache = require("CacheUtils").CacheUtils;
  var records = player.rewardRecords();
  if (player.claimingRewardTransaction || player.pendingRewardJournal || player.rewardStorageCheckPending ||
      player.shopPaymentPending || cache.getData(player.rewardJournalKey()) || records.some(function (record) {
        return record.pause || record.deferSave || record.saveBlockedByRecovery || record.localSavePending || record.clearPending;
      })) throw Error("Finish the pending save or reward claim before testing.");
  return records;
}

function restartStorage() {
  return cc.sys.isNative ? cc.sys.localStorage : window.sessionStorage;
}

function restartWithProfile(profile) {
  var storage = restartStorage();
  var audio, previous = storage.getItem(PROFILE_RESTART_KEY);
  try {
    storage.setItem(PROFILE_RESTART_KEY, profile);
    if (storage.getItem(PROFILE_RESTART_KEY) !== profile) throw Error("Could not switch profiles.");
    audio = require("AudioMgr").AudioMgr.getInstance();
    audio.setRestarting(true);
    // Keep the old profile's writes isolated until its managers are gone.
    // Native restart rebuilds the JS VM. Web restart reloads the whole page.
    if (cc.sys.isNative) {
      if (cc.game.restart() === false) throw Error("Could not restart the preview.");
    }
    else window.location.reload();
  } catch (error) {
    if (audio) audio.setRestarting(false);
    if (storage.getItem(PROFILE_RESTART_KEY) === profile) {
      if (previous == null) storage.removeItem(PROFILE_RESTART_KEY);
      else storage.setItem(PROFILE_RESTART_KEY, previous);
    }
    throw error;
  }
}

function manager() {
  if (!require("TestMode").TestMode.getInstance().isAvailable()) throw Error("Save slots are available in game previews.");
  if (!saveSlots) saveSlots = SaveSlots.create(cc.sys.localStorage, savePrefixes());
  return saveSlots;
}

function slotView(revision) {
  var view = manager().read();
  if (revision !== undefined && revision !== view.revision) throw Error("The save slots changed. Refresh the list and try again.");
  return view;
}

function currentSlot(view) { return selectedSlot || view.state.active; }

function readyToSwitch(view, player) {
  if (view.state.slots.some(function (slot) { return slot.id === currentSlot(view); })) recordsReady(player);
}

function listSaves() {
  var view = slotView();
  return {
    revision: view.revision,
    current: currentSlot(view),
    saves: view.state.slots.map(function (slot) { return { id: slot.id, name: SaveSlots.name(slot) }; })
  };
}

function commitAndRestart(view, request) {
  var rollback = manager().commit(view, view.state);
  try { restartWithProfile(request); }
  catch (error) { rollback(); throw error; }
}

function requestNewPlayer(player, revision) {
  var view = slotView(revision);
  readyToSwitch(view, player);
  var slot = manager().add(view.state);
  commitAndRestart(view, "new:" + slot.id);
}

function loadSave(id, player, revision) {
  var view = slotView(revision);
  if (!view.state.slots.some(function (slot) { return slot.id === id; })) throw Error("This save slot no longer exists.");
  readyToSwitch(view, player);
  view.state.active = id;
  commitAndRestart(view, "load:" + id);
}

function renameSave(id, value, revision) {
  var view = slotView(revision);
  var slot = view.state.slots.find(function (slot) { return slot.id === id; });
  if (!slot) throw Error("This save slot no longer exists.");
  var name = SaveSlots.cleanName(value);
  if (!name) throw Error("Enter a name of 1–" + SaveSlots.MAX_NAME_LENGTH + " characters on one line.");
  if (name !== SaveSlots.name(slot)) {
    slot.name = name;
    manager().commit(view, view.state);
  }
  return name;
}

function deleteSave(id, player, revision) {
  var view = slotView(revision), state = view.state;
  var index = state.slots.findIndex(function (slot) { return slot.id === id; });
  if (index < 0) throw Error("This save slot no longer exists.");
  var deletingCurrent = id === currentSlot(view);
  if (deletingCurrent) recordsReady(player);
  state.slots.splice(index, 1);
  state.pendingDeletes.push(id);
  var needsNew = !state.slots.length;
  if (needsNew) manager().add(state);
  else if (deletingCurrent || state.active === id) state.active = state.slots[Math.min(index, state.slots.length - 1)].id;
  if (deletingCurrent) {
    commitAndRestart(view, (needsNew ? "new:" : "load:") + state.active);
    return { restarting: true };
  }
  manager().commit(view, state);
  try { manager().collectDeleted(); return { restarting: false }; }
  catch (error) { return { restarting: false, cleanupPending: true }; }
}

function active() { return !!session; }

function returnToSavedProgress() {
  if (!active() || !require("TestMode").TestMode.getInstance().isAvailable()) return;
  var view = listSaves();
  loadSave(view.current, undefined, view.revision);
}

function prepareStartup() {
  if (selectedSlot || !require("TestMode").TestMode.getInstance().isAvailable()) return false;
  var profile;
  try {
    var storage = restartStorage();
    profile = storage && storage.getItem(PROFILE_RESTART_KEY);
    if (profile) storage.removeItem(PROFILE_RESTART_KEY);
  } catch (error) { /* Resume the last selected slot if a restart marker is unavailable. */ }
  var match = /^(load|new):(.+)$/.exec(profile || "");
  try {
    var slots = manager(), state = slots.read().state;
    var requested = match && state.slots.some(function (slot) { return slot.id === match[2]; });
    var id = requested ? match[2] : state.active;
    require("CacheUtils").CacheUtils.usePreviewSaveSlot(slots.bind(id));
    selectedSlot = id;
    try { slots.collectDeleted(); }
    catch (error) { console.warn("Could not finish deleting save data", error); }
    return profile === "saved" || !!requested && match[1] === "load";
  } catch (error) {
    console.warn("Could not read preview save slots", error);
    return false;
  }
}

function start(player) {
  if (session && session.player === player) return;
  var records = recordsReady(player);
  if (!require("CacheUtils").CacheUtils.previewProgress(savePrefixes())) {
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
exports.active = active;
exports.listSaves = listSaves;
exports.requestNewPlayer = requestNewPlayer;
exports.loadSave = loadSave;
exports.renameSave = renameSave;
exports.MAX_SAVE_NAME_LENGTH = SaveSlots.MAX_NAME_LENGTH;
exports.deleteSave = deleteSave;
exports.returnToSavedProgress = returnToSavedProgress;
exports.prepareStartup = prepareStartup;
