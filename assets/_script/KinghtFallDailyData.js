var i;
var cc__extends = __extends;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallDailyData = undefined;
var $z1BaseData = require("BaseData");
var $z1Config = require("Config");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var c = function () {
  this.time = 0;
  this.signDay = 0;
  this.signReward = 0;
  this.onlineTime = 0;
  this.onlineTimeReward = [];
  this.subGameTime = [];
  this.vesion = 1;
};
var exp_KinghtFallDailyData = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ecrypt = false;
    e.aliseMap = {
      time: "1",
      signDay: "2",
      signReward: "3",
      onlineTime: "4",
      onlineTimeReward: "5",
      subGameTime: "6"
    };
    e.gameKey = $z1Config.GameConfig.AppCacheName + $z1KinghtFallConfig.KinghtFallParameter.AppCacheName + "DailyData";
    e.vesion = 2;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.createData = function () {
    this.data = new c();
    return this.data;
  };
  _ctor.prototype.initData = function () {
    var t = false;
    if (this.data.vesion < this.vesion) {
      switch (this.data.vesion) {
        case 1:
          this.data.subGameTime = [];
      }
      this.data.vesion = this.vesion;
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
    if (this.data.signReward > 0) {
      this.data.signDay++;
      this.data.signReward = 0;
    }
    this.data.onlineTime = 0;
    this.data.onlineTimeReward = [];
  };
  _ctor.prototype.getSignDay = function () {
    return this.data.signDay;
  };
  _ctor.prototype.getSignReward = function () {
    return this.data.signReward;
  };
  _ctor.prototype.sign = function (t, totalDays) {
    if (t !== 0 && t !== 1 || typeof totalDays === "number" && (this.data.signDay < 0 || this.data.signDay >= totalDays)) return false;
    var e = 1 << t;
    if ((this.data.signReward & e) !== 0 || t === 0 && this.data.signReward !== 0) return false;
    this.data.signReward |= e;
    this.saveData();
    return true;
  };
  _ctor.prototype.getOnlineTime = function () {
    return this.data.onlineTime;
  };
  _ctor.prototype.addOnlineTime = function (t) {
    undefined === t && (t = 1);
    this.data.onlineTime += t;
    this.saveData();
    return this.data.onlineTime;
  };
  _ctor.prototype.getOnlineTimeReward = function (t) {
    return this.data.onlineTimeReward[t - 1];
  };
  _ctor.prototype.setOnlineTimeReward = function (t) {
    this.data.onlineTimeReward[t - 1] = 1;
    this.saveData();
  };
  _ctor.prototype.setSubTimeByIndex = function (t, e) {
    this.data.subGameTime || (this.data.subGameTime = []);
    if (this.data.subGameTime.length < t + 1) {
      this.data.subGameTime.push(e);
    } else {
      this.data.subGameTime[t] = e;
    }
    this.saveData();
  };
  _ctor.prototype.getSubTimeByIndex = function (t) {
    if (this.data.subGameTime) {
      if (this.data.subGameTime.length < t) {
        return -1;
      } else {
        return this.data.subGameTime[t];
      }
    } else {
      return -1;
    }
  };
  return _ctor;
}($z1BaseData.BaseData);
exports.KinghtFallDailyData = exp_KinghtFallDailyData;
