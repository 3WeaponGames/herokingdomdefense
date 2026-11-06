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
    this.saveData();
    this.completeSettlement(pending);
    return true;
  };
  _ctor.prototype.completeSettlement = function (settlement) {
    var player = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance();
    // Each target record saves its receipt together with its rewards. Retrying this
    // journal after a reload cannot award either balance twice.
    player.getUserData().applyBattleSettlement(settlement);
    player.getMissionData().applyBattleSettlement(settlement);
    this.setNewGame();
    require("EventMgr").EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 31);
  };
  _ctor.prototype.setNewGame = function () {
    this.data = new l();
    this.saveData();
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
