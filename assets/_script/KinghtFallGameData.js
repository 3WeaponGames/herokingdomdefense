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
var checkpointFields = ["levelNum", "roundNum", "coin", "buffList", "buildingLevel", "businessList", "taskList", "relicState"];
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
  if (data.taskList && (!Number.isInteger(data.taskList.index) || data.taskList.index < 0 || !Array.isArray(data.taskList.list) || !data.taskList.list.every(function (id) { return Number.isInteger(id) && id > 0; }) || [0, 1, 2].indexOf(data.taskList.stage) < 0)) delete data.taskList;
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
    if (multiplier > 1) {
      var player = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance();
      var receipt = player.getUserData().data.battleSettlement;
      // An ad belonging to a closed result screen must not overwrite a newer run.
      if (this.data.levelNum >= 0 || !receipt || receipt.id !== settlement.id) return false;
    }
    var pending = Object.assign({}, settlement, { multiplier: multiplier });
    this.data.pendingSettlement = pending;
    this.pendingSettlementNeedsSave = true;
    if (this.saveData() === false) return false;
    this.pendingSettlementNeedsSave = false;
    return this.completeSettlement(pending);
  };
  _ctor.prototype.completeSettlement = function (settlement) {
    if (this.pendingSettlementNeedsSave) {
      if (this.saveData() === false) return false;
      this.pendingSettlementNeedsSave = false;
    }
    var player = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance();
    // Each target record saves its receipt together with its rewards. Retrying this
    // journal after a reload cannot award either balance twice.
    if (player.getUserData().applyBattleSettlement(settlement) === false) return false;
    if (player.getMissionData().applyBattleSettlement(settlement) === false) return false;
    var previous = this.data;
    this.data = this.resetCheckpointData(settlement.stage);
    if (this.saveData() === false) { this.data = previous; return false; }
    require("EventMgr").EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 31);
    return true;
  };
  _ctor.prototype.setNewGame = function (stage) {
    if (this.data.pendingSettlement && !this.completeSettlement(this.data.pendingSettlement)) return false;
    var previous = this.data;
    this.data = this.resetCheckpointData(stage);
    if (this.saveData() === false) { this.data = previous; return false; }
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
    if (!validCheckpoint(checkpoint)) return false;
    saves[stage] = checkpoint;
    var previous = this.data;
    this.data = Object.assign(activateCheckpoint(this.data, checkpoint), { stageCheckpoints: saves });
    if (this.saveData() === false) { this.data = previous; return false; }
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
