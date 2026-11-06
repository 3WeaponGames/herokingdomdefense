var i;
var cc__extends = __extends;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallTaskCountName = exports.KinghtFallMissionData = undefined;
var $z1BaseData = require("BaseData");
var $z1Config = require("Config");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var g = function () {
  this.listTime = {};
  this.achievementInfo = [];
  this.time = 0;
  this.achievementPoint = 0;
  this.achievementReward = [];
  this.vesion = 1;
};
var exp_KinghtFallMissionData = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ecrypt = false;
    e.aliseMap = {
      time: "1",
      taskInfo: "2",
      listTime: "3",
      achievementInfo: "4",
      achievementPoint: "5",
      achievementReward: "6",
      id: "7",
      type: "8",
      num: "9",
      stage: "a",
      reward: "b"
    };
    e.gameKey = $z1Config.GameConfig.AppCacheName + $z1KinghtFallConfig.KinghtFallParameter.AppCacheName + "MissionData";
    e.vesion = 1;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.createData = function () {
    this.data = new g();
    return this.data;
  };
  _ctor.prototype.initData = function () {
    var t = false;
    if (!this.data.taskInfo) {
      var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTaskCfgById(1);
      this.data.taskInfo = {
        id: e.ID,
        type: e.MissionType,
        num: 0,
        stage: 0
      };
      t = true;
    }
    if (!$z1KinghtFallModle.default.getInstance().compareIsToday(this.data.time)) {
      this.initDailyData();
      t = true;
    }
    t && this.saveData();
  };
  _ctor.prototype.initDailyData = function () {
    this.data.time = Date.now();
    this.addAchNum($z1KinghtFallEnum.KinghtFallEnumAchiEnum.LoginDays, 1);
  };
  _ctor.prototype.getTaskInfo = function () {
    2 == this.data.taskInfo.stage && this.doUpTask();
    return this.data.taskInfo;
  };
  _ctor.prototype.doUpTask = function () {
    var t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTaskCfgById(this.data.taskInfo.id + 1);
    t && (this.data.taskInfo = {
      id: t.ID,
      type: t.MissionType,
      num: 0,
      stage: 0
    });
    this.saveData();
  };
  _ctor.prototype.setTaskInfo = function (t) {
    this.data.taskInfo = t;
    this.saveData();
  };
  _ctor.prototype.addTaskNum = function (t, e) {
    this.data.listTime[t] || (this.data.listTime[t] = 0);
    this.data.listTime[t] += e;
    this.saveData();
  };
  _ctor.prototype.getTaskNum = function (t) {
    this.data.listTime[t] || (this.data.listTime[t] = 0);
    return this.data.listTime[t];
  };
  _ctor.prototype.getAchInfoByType = function (t) {
    for (var e = 0; e < this.data.achievementInfo.length; e++) {
      var n = this.data.achievementInfo[e];
      if (n.type == t) {
        return n;
      }
    }
    return null;
  };
  _ctor.prototype.addAchNum = function (t, e) {
    var n = this.getAchInfoByType(t);
    if (n) {
      n.num += e;
    } else {
      this.data.achievementInfo.push({
        type: t,
        num: e,
        reward: []
      });
    }
    this.saveData();
  };
  _ctor.prototype.getAchRew = function (t, e) {
    for (var n = 0; n < this.data.achievementInfo.length; n++) {
      var i = this.data.achievementInfo[n];
      if (i.type == t) {
        i.reward.push(e);
        this.saveData();
        return true;
      }
    }
    this.data.achievementInfo.push({
      type: t,
      num: 0,
      reward: [e]
    });
    this.saveData();
    return true;
  };
  _ctor.prototype.addAchPoint = function (t) {
    this.data.achievementPoint += t;
    this.saveData();
  };
  _ctor.prototype.getAchPoint = function () {
    return this.data.achievementPoint;
  };
  _ctor.prototype.getAchReward = function (t) {
    return this.data.achievementReward[t - 1] || 0;
  };
  _ctor.prototype.setAchReward = function (t, e) {
    this.data.achievementReward[t - 1] || (this.data.achievementReward[t - 1] = 0);
    this.data.achievementReward[t - 1] |= e;
    this.saveData();
  };
  return _ctor;
}($z1BaseData.BaseData);
exports.KinghtFallMissionData = exp_KinghtFallMissionData;
(function (t) {
  t.EquipUp = "EquipUp";
  t.TalentUp = "TalentUp";
  t.TreasureUp = "TreasureUp";
  t.Kill = "Kill";
})(exports.KinghtFallTaskCountName || (exports.KinghtFallTaskCountName = {}));