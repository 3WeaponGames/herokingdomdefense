var i;
var cc__extends = __extends;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallGameData = undefined;
var $z1BaseData = require("BaseData");
var $z1Config = require("Config");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var l = function () {
  this.levelNum = -1;
  this.buildingLevel = [];
  this.buffList = [];
  this.businessList = {};
};
var checkpointFields = ["levelNum", "roundNum", "coin", "buffList", "buildingLevel", "businessList", "taskList", "relicState", "restartSetup"];
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function validCheckpoint(value) {
  return value && Number.isInteger(value.levelNum) && value.levelNum > 0 && Number.isInteger(value.roundNum) && value.roundNum > 0 &&
    typeof value.coin === "number" && isFinite(value.coin) && value.coin >= 0;
}
function checkpointFieldsFrom(value) {
  var snapshot = new l();
  checkpointFields.forEach(function (key) { if (Object.prototype.hasOwnProperty.call(value, key)) snapshot[key] = clone(value[key]); });
  return snapshot;
}
function activateCheckpoint(data, checkpoint) {
  var next = Object.assign({}, data);
  checkpointFields.forEach(function (key) { delete next[key]; });
  return Object.assign(next, checkpointFieldsFrom(checkpoint));
}
function sanitizeCheckpoint(data) {
  data.buildingLevel = (Array.isArray(data.buildingLevel) ? data.buildingLevel : []).filter(function (row) { return row && Number.isInteger(row.point) && Number.isInteger(row.level) && row.level >= 0; });
  data.buffList = (Array.isArray(data.buffList) ? data.buffList : []).filter(function (id) { return Number.isInteger(id) && id > 0; });
  if (!data.businessList || typeof data.businessList !== "object" || Array.isArray(data.businessList)) data.businessList = {};
  Object.keys(data.businessList).forEach(function (key) { if (typeof data.businessList[key] !== "number" || !isFinite(data.businessList[key]) || data.businessList[key] < 0) delete data.businessList[key]; });
  if (data.taskList && (!Number.isInteger(data.taskList.index) || data.taskList.index < 0 || !Array.isArray(data.taskList.list) || !data.taskList.list.every(function (id) { return Number.isInteger(id) && id > 0 || typeof id === "string"; }) || [0, 1, 2].indexOf(data.taskList.stage) < 0)) delete data.taskList;
  sanitizeRestartSetup(data);
}
function sanitizeRestartSetup(data) {
  if (data.restartSetup === undefined) return true;
  var setup = data.restartSetup;
  if (!setup || typeof setup !== "object" || Array.isArray(setup) || !setup.treasureAddTime ||
      typeof setup.treasureAddTime !== "object" || Array.isArray(setup.treasureAddTime) ||
      !Object.keys(setup.treasureAddTime).every(function (key) { return /^[1-9]\d*$/.test(key) && Number.isSafeInteger(setup.treasureAddTime[key]) && setup.treasureAddTime[key] > 0; })) { delete data.restartSetup; return false; }
  return true;
}
var exp_KinghtFallGameData = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.aliseMap = {};
    e.protoId = 1;
    e.ecrypt = false;
    e.gameKey = $z1Config.GameConfig.AppCacheName + $z1KinghtFallConfig.KinghtFallParameter.AppCacheName + "GameData";
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.createData = function () {
    this.data = new l();
    return this.data;
  };
  _ctor.prototype.hasSave = function (t) {
    return !!this.checkpointForStage(t);
  };
  // Compatibility is read-only. Keep an older checkpoint available for the
  // player's explicit New Game choice rather than rewriting paid progress.
  _ctor.prototype.getResumeIssue = function (stage, config) {
    var saved = this.checkpointForStage(stage);
    if (!saved) return null;
    config = config || require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().data;
    var level = config && (config.LevelCfg || []).find(function (row) { return row.Level === saved.levelNum; });
    if (!level || !Array.isArray(level.WaveCfg) || !level.WaveCfg[saved.roundNum - 1]) return "This saved wave is no longer available. Start a new game for this stage.";
    if (!Array.isArray(saved.buffList) || saved.buffList.some(function (id) { return !(config.BuffCfg || []).some(function (row) { return row.ID === id; }); })) return "A saved perk is no longer available. Start a new game for this stage.";
    var task = saved.taskList;
    if (task) {
      var issue = "A saved mission is no longer available. Start a new game for this stage.", counted = false;
      if (!Array.isArray(task.list) || !Number.isInteger(task.index) || task.index < 0 || task.index > task.list.length ||
          task.stage === 1 && task.index >= task.list.length || task.list.some(function (id) {
            if ((config.InGameTaskEnum || {})[id]) return false;
            if (typeof id !== "string" || !require("BattleTaskObjectives").definition(id)) return true;
            counted = true;
            return false;
          })) return issue;
      if (counted && (!Array.isArray(task.reward) || !Array.isArray(task.targets) || task.targets.length !== task.list.length ||
          task.targets.some(function (target) { return !Number.isSafeInteger(target) || target < 1; }) ||
          !Number.isSafeInteger(task.progress) || task.progress < 0 || task.progress > (task.targets[task.index] || 0) ||
          task.waveIntact !== undefined && typeof task.waveIntact !== "boolean" ||
          task.scoredRound !== undefined && (!Number.isSafeInteger(task.scoredRound) || task.scoredRound < 1 || task.scoredRound > saved.roundNum))) return issue;
      if (task.rewardMultiplier !== undefined && (!Number.isFinite(task.rewardMultiplier) || task.rewardMultiplier < 0)) return issue;
      if (task.reward !== undefined || task.authored) {
        if (!Array.isArray(task.reward) || task.reward.length !== task.list.length || task.reward.some(function (reward) {
          return !reward || !Number.isSafeInteger(reward.id) || reward.id <= 0 || config.GoodsCfg && !config.GoodsCfg[reward.id] ||
            typeof reward.num !== "number" || !isFinite(reward.num) || reward.num < 0;
        })) return issue;
      } else {
        var definition = (config.InGameTaskCfg || []).find(function (row) { return row.ID === (saved.levelNum === 1 ? 1 : 2); });
        if (!definition || !Array.isArray(definition.Award) || task.list.length > definition.Award.length) return issue;
      }
    }
    return null;
  };
  _ctor.prototype.checkpointForStage = function (stage) {
    stage = stage === undefined ? this.data.levelNum : Number(stage);
    // The old flat record remains the active slot for existing callers. A
    // legacy save is read directly until the next explicit checkpoint write.
    if (this.data.levelNum === stage && validCheckpoint(this.data)) return this.data;
    var saved = this.data.stageCheckpoints && this.data.stageCheckpoints[stage];
    return validCheckpoint(saved) && saved.levelNum === stage ? saved : null;
  };
  _ctor.prototype.getCheckpoint = function (stage) {
    var saved = this.checkpointForStage(stage);
    return saved ? clone(saved === this.data ? Object.assign({}, this.data.stageCheckpoints && this.data.stageCheckpoints[saved.levelNum], checkpointFieldsFrom(saved)) : saved) : null;
  };
  _ctor.prototype.copyStageCheckpoints = function () {
    var saves = Object.assign({}, this.data.stageCheckpoints || {});
    if (validCheckpoint(this.data)) saves[this.data.levelNum] = Object.assign({}, saves[this.data.levelNum], checkpointFieldsFrom(this.data));
    return saves;
  };
  _ctor.prototype.activateStage = function (stage) {
    var saved = this.checkpointForStage(stage);
    if (!saved) return false;
    // Only mounting a battle changes the active slot. Looking at a stage or
    // closing its Continue notice leaves both the slot and storage untouched.
    var saves = this.copyStageCheckpoints();
    this.data = Object.assign(activateCheckpoint(this.data, saved), { stageCheckpoints: saves });
    return true;
  };
  _ctor.prototype.initData = function () {
    // UserData and MissionData are loaded before this record. Finish any settlement
    // interrupted between their independent saves before a battle can be resumed.
    if (!this.deferSettlementRecovery && this.data.pendingSettlement) this.completeSettlement(this.data.pendingSettlement);
  };
  _ctor.prototype.validateSaveRecord = function (data) {
    data = this.normalizeSaveRecord(data, new l());
    sanitizeCheckpoint(data);
    if (data.levelNum >= 0 && (!Number.isInteger(data.roundNum) || data.roundNum < 1 || typeof data.coin !== "number" || !isFinite(data.coin) || data.coin < 0)) data.levelNum = -1;
    // Optional for backward compatibility with already-persisted reward
    // journals: validating an old record must not invent new journal fields.
    if (Object.prototype.hasOwnProperty.call(data, "stageCheckpoints")) {
      if (!data.stageCheckpoints || typeof data.stageCheckpoints !== "object" || Array.isArray(data.stageCheckpoints)) data.stageCheckpoints = {};
      Object.keys(data.stageCheckpoints).forEach(function (key) {
        var saved = data.stageCheckpoints[key];
        if (!/^[1-9]\d*$/.test(key) || !saved || typeof saved !== "object" || Array.isArray(saved) || saved.levelNum !== Number(key) || !validCheckpoint(saved)) { delete data.stageCheckpoints[key]; return; }
        sanitizeCheckpoint(saved);
      });
    }
    if (data.pendingSettlement && (typeof data.pendingSettlement.id !== "string" || !Number.isInteger(data.pendingSettlement.stage) || data.pendingSettlement.stage < 1 || [1, 2].indexOf(data.pendingSettlement.multiplier) < 0 || !Number.isInteger(data.pendingSettlement.challengeMask) || typeof data.pendingSettlement.isWin !== "boolean" || !Array.isArray(data.pendingSettlement.rewards) || !data.pendingSettlement.rewards.every(function (reward) { return reward && Number.isInteger(reward.id) && typeof reward.num === "number" && isFinite(reward.num) && reward.num >= 0; }))) delete data.pendingSettlement;
    return data;
  };
  _ctor.prototype.readyForNewBattle = function () {
    var player = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance();
    return player.restorePendingRewards() && (!this.data.pendingSettlement || this.completeSettlement(this.data.pendingSettlement));
  };
  _ctor.prototype.beginSettlement = function (rewards, stage, challengeMask, isWin) {
    var settlement = this.data.pendingSettlement || {
      id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2),
      rewards: rewards.map(function (reward) { return { id: reward.id, num: reward.num }; }),
      stage: stage,
      challengeMask: challengeMask,
      isWin: isWin,
      multiplier: 1
    };
    this.settleBattle(settlement, settlement.multiplier);
    return settlement;
  };
  _ctor.prototype.settleBattle = function (settlement, multiplier) {
    if (this.data.pendingSettlement && this.data.pendingSettlement.id !== settlement.id) return false;
    if (multiplier > 1) {
      var player = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance();
      var receipt = player.getUserData().data.battleSettlement;
      // An ad belonging to a closed result screen must not overwrite a newer run.
      if (this.data.levelNum >= 0 || !receipt || receipt.id !== settlement.id) return false;
    }
    var data = this.data, pending = Object.assign({}, settlement, { multiplier: multiplier });
    data.pendingSettlement = pending;
    this.pendingSettlementNeedsSave = true;
    var saved = this.saveData();
    if (this.data !== data || data.pendingSettlement !== pending) return !this.data.pendingSettlement;
    if (saved === false) return false;
    this.pendingSettlementNeedsSave = false;
    return this.completeSettlement(pending);
  };
  _ctor.prototype.completeSettlement = function (settlement) {
    var owner = this, data = this.data, pending = data.pendingSettlement;
    var player = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance();
    if (!pending) {
      var userReceipt = player.getUserData().data.battleSettlement, missionReceipt = player.getMissionData().data.battleSettlement;
      return !!userReceipt && userReceipt.id === settlement.id && userReceipt.multiplier >= settlement.multiplier &&
        !!missionReceipt && missionReceipt.id === settlement.id && missionReceipt.multiplier >= settlement.multiplier;
    }
    if (pending.id !== settlement.id) return false;
    // beginSettlement returns its original object; settleBattle stores a clone.
    // Once matched, only the exact current journal may own later continuations.
    settlement = pending;
    function current() { return owner.data === data && data.pendingSettlement === pending; }
    if (this.pendingSettlementNeedsSave) {
      var saved = this.saveData();
      if (!current()) return !this.data.pendingSettlement;
      if (saved === false) return false;
      this.pendingSettlementNeedsSave = false;
    }
    // Each target record saves its receipt together with its rewards. Retrying this
    // journal after a reload cannot award either balance twice.
    var applied = player.getUserData().applyBattleSettlement(settlement);
    if (!current()) return !this.data.pendingSettlement;
    if (applied === false) return false;
    applied = player.getMissionData().applyBattleSettlement(settlement);
    if (!current()) return !this.data.pendingSettlement;
    if (applied === false) return false;
    var previous = this.data, cleanup = this.resetCheckpointData(settlement.stage);
    this.data = cleanup;
    var saved = this.saveData();
    // A callback can install B into this same cleanup object before returning.
    if (this.data !== cleanup || cleanup.pendingSettlement) return !this.data.pendingSettlement;
    if (saved === false) { this.data = previous; return false; }
    require("EventMgr").EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 31);
    return true;
  };
  _ctor.prototype.setNewGame = function (stage) {
    if (this.data.pendingSettlement && !this.completeSettlement(this.data.pendingSettlement)) return false;
    var previous = this.data, next = this.resetCheckpointData(stage), pending = next.pendingSettlement;
    this.data = next;
    if (this.saveData() === false) { if (this.data === next && next.pendingSettlement === pending) this.data = previous; return false; }
    return true;
  };
  _ctor.prototype.resetCheckpointData = function (stage) {
    // Keep journal receipts and unknown fields when retiring a run. A pending
    // journal cleanup must never reinstall the checkpoint from that finished run.
    stage = stage === undefined ? this.data.levelNum : Number(stage);
    var data = Object.assign({}, this.data), saves = this.copyStageCheckpoints();
    delete saves[stage];
    if (Object.prototype.hasOwnProperty.call(this.data, "stageCheckpoints") || Object.keys(saves).length) data.stageCheckpoints = saves;
    if (this.data.levelNum === stage) {
      Object.assign(data, new l());
      ["roundNum", "coin", "taskList", "relicState"].forEach(function (key) { delete data[key]; });
    }
    delete data.pendingSettlement;
    return data;
  };
  _ctor.prototype.getRoundNum = function (stage) {
    var saved = this.checkpointForStage(stage); return saved ? saved.roundNum : undefined;
  };
  _ctor.prototype.getCoin = function (stage) {
    var saved = this.checkpointForStage(stage); return saved ? saved.coin : undefined;
  };
  _ctor.prototype.getBuildingLevel = function (stage) {
    var saved = this.checkpointForStage(stage); return saved ? saved.buildingLevel : [];
  };
  _ctor.prototype.setLevelInfo = function (t, e, n) {
    var saves = this.copyStageCheckpoints(), saved = this.checkpointForStage(t);
    var next = Object.assign(activateCheckpoint(this.data, saved || new l()), { levelNum: t, roundNum: e, coin: n });
    saves[t] = Object.assign({}, saves[t], checkpointFieldsFrom(next));
    next.stageCheckpoints = saves; this.data = next;
  };
  _ctor.prototype.setCheckpoint = function (snapshot) {
    // Merge only checkpoint fields so receipts and unknown future fields survive.
    var stage = snapshot.levelNum === undefined ? this.data.levelNum : snapshot.levelNum;
    if (!Number.isInteger(stage) || stage < 1) return false;
    var saves = this.copyStageCheckpoints(), saved = saves[stage] || new l();
    var checkpoint = Object.assign({}, saved);
    checkpointFields.forEach(function (key) { if (Object.prototype.hasOwnProperty.call(snapshot, key)) checkpoint[key] = clone(snapshot[key]); });
    if (!sanitizeRestartSetup(checkpoint)) return false;
    if (!validCheckpoint(checkpoint)) return false;
    saves[stage] = checkpoint;
    var previous = this.data, next = Object.assign(activateCheckpoint(this.data, checkpoint), { stageCheckpoints: saves }), pending = next.pendingSettlement;
    this.data = next;
    if (this.saveData() === false) { if (this.data === next && next.pendingSettlement === pending) this.data = previous; return false; }
    return true;
  };
  _ctor.prototype.getBuffList = function (stage) {
    var saved = this.checkpointForStage(stage); return saved ? saved.buffList : [];
  };
  _ctor.prototype.setBuffList = function (t) {
    this.data.buffList = t;
  };
  _ctor.prototype.getBuildInfoList = function (stage) {
    return this.getBuildingLevel(stage);
  };
  _ctor.prototype.setBuildInfoList = function (t) {
    this.data.buildingLevel = t;
    this.saveData();
  };
  _ctor.prototype.getBusinessList = function (stage) {
    var saved = this.checkpointForStage(stage); return saved ? saved.businessList : {};
  };
  _ctor.prototype.setBusinessList = function (t) {
    this.data.businessList = t;
    this.saveData();
  };
  _ctor.prototype.getTaskInfo = function (stage) {
    var saved = this.checkpointForStage(stage); return saved ? saved.taskList : undefined;
  };
  _ctor.prototype.setTaskInfo = function (t) {
    this.data.taskList = t;
    this.saveData();
  };
  return _ctor;
}($z1BaseData.BaseData);
exports.KinghtFallGameData = exp_KinghtFallGameData;
