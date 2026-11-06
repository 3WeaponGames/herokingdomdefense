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
    return this.data.levelNum == t;
  };
  _ctor.prototype.initData = function () {
    // UserData and MissionData are loaded before this record. Finish any settlement
    // interrupted between their independent saves before a battle can be resumed.
    if (this.data.pendingSettlement) this.completeSettlement(this.data.pendingSettlement);
  };
  _ctor.prototype.validateSaveRecord = function (data) {
    data = this.normalizeSaveRecord(data, new l());
    data.buildingLevel = data.buildingLevel.filter(function (row) { return row && Number.isInteger(row.point) && Number.isInteger(row.level) && row.level >= 0; });
    data.buffList = data.buffList.filter(function (id) { return Number.isInteger(id) && id > 0; });
    Object.keys(data.businessList).forEach(function (key) { if (typeof data.businessList[key] !== "number" || !isFinite(data.businessList[key]) || data.businessList[key] < 0) delete data.businessList[key]; });
    if (data.taskList && (!Number.isInteger(data.taskList.index) || data.taskList.index < 0 || !Array.isArray(data.taskList.list) || !data.taskList.list.every(function (id) { return Number.isInteger(id) && id > 0; }) || [0, 1, 2].indexOf(data.taskList.stage) < 0)) delete data.taskList;
    if (data.levelNum >= 0 && (!Number.isInteger(data.roundNum) || data.roundNum < 1 || typeof data.coin !== "number" || !isFinite(data.coin) || data.coin < 0)) data.levelNum = -1;
    if (data.pendingSettlement && (typeof data.pendingSettlement.id !== "string" || !Number.isInteger(data.pendingSettlement.stage) || data.pendingSettlement.stage < 1 || [1, 2].indexOf(data.pendingSettlement.multiplier) < 0 || !Number.isInteger(data.pendingSettlement.challengeMask) || typeof data.pendingSettlement.isWin !== "boolean" || !Array.isArray(data.pendingSettlement.rewards) || !data.pendingSettlement.rewards.every(function (reward) { return reward && Number.isInteger(reward.id) && typeof reward.num === "number" && isFinite(reward.num) && reward.num >= 0; }))) delete data.pendingSettlement;
    return data;
  };
  _ctor.prototype.readyForNewBattle = function () {
    return !this.data.pendingSettlement || this.completeSettlement(this.data.pendingSettlement);
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
    this.data = new l();
    if (this.saveData() === false) { this.data = previous; return false; }
    require("EventMgr").EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 31);
    return true;
  };
  _ctor.prototype.setNewGame = function () {
    if (this.data.pendingSettlement && !this.completeSettlement(this.data.pendingSettlement)) return false;
    this.data = new l();
    return this.saveData() !== false;
  };
  _ctor.prototype.getRoundNum = function () {
    return this.data.roundNum;
  };
  _ctor.prototype.getCoin = function () {
    return this.data.coin;
  };
  _ctor.prototype.getBuildingLevel = function () {
    return this.data.buildingLevel;
  };
  _ctor.prototype.setLevelInfo = function (t, e, n) {
    this.data.levelNum = t;
    this.data.roundNum = e;
    this.data.coin = n;
  };
  _ctor.prototype.getBuffList = function () {
    return this.data.buffList;
  };
  _ctor.prototype.setBuffList = function (t) {
    this.data.buffList = t;
  };
  _ctor.prototype.getBuildInfoList = function () {
    return this.data.buildingLevel;
  };
  _ctor.prototype.setBuildInfoList = function (t) {
    this.data.buildingLevel = t;
    this.saveData();
  };
  _ctor.prototype.getBusinessList = function () {
    return this.data.businessList;
  };
  _ctor.prototype.setBusinessList = function (t) {
    this.data.businessList = t;
    this.saveData();
  };
  _ctor.prototype.getTaskInfo = function () {
    return this.data.taskList;
  };
  _ctor.prototype.setTaskInfo = function (t) {
    this.data.taskList = t;
    this.saveData();
  };
  return _ctor;
}($z1BaseData.BaseData);
exports.KinghtFallGameData = exp_KinghtFallGameData;
