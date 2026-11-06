var i;
var cc__extends = __extends;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallGuideData = undefined;
var $z1BaseData = require("BaseData");
var $z1Config = require("Config");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var l = function () {
  this.GroupId = 1;
  this.stepId = 0;
  this.tips = [];
  this.listTime = {};
};
var exp_KinghtFallGuideData = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.aliseMap = {
      GroupId: "1",
      stepId: "2",
      tips: "3",
      listTime: "4"
    };
    e.protoId = 2;
    e.ecrypt = false;
    e.gameKey = $z1Config.GameConfig.AppCacheName + $z1KinghtFallConfig.KinghtFallParameter.AppCacheName + "GuideData";
    e.endId = 4;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.createData = function () {
    this.data = new l();
    return this.data;
  };
  _ctor.prototype.initData = function () {
    this.data.stepId = 0;
  };
  _ctor.prototype.getGroupId = function () {
    return this.data.GroupId;
  };
  _ctor.prototype.setGroupId = function (t) {
    this.data.GroupId = t;
    this.saveData();
  };
  _ctor.prototype.getStepId = function () {
    return this.data.stepId;
  };
  _ctor.prototype.setStepId = function (t) {
    this.data.stepId = t;
    this.saveData();
  };
  _ctor.prototype.addCurrentId = function (t) {
    undefined === t && (t = true);
    this.data.GroupId += 1;
    t && this.saveData();
  };
  _ctor.prototype.getGuideEnd = function () {
    return this.data.GroupId >= this.endId;
  };
  _ctor.prototype.getGuideTips = function (t) {
    return this.data.tips[t] || 0;
  };
  _ctor.prototype.setGuideTips = function (t, e) {
    undefined === e && (e = 1);
    this.data.tips[t] = e;
    this.saveData();
  };
  _ctor.prototype.getTimeByKey = function (t) {
    this.data.listTime[t] || (this.data.listTime[t] = 0);
    return this.data.listTime[t];
  };
  _ctor.prototype.setTimeByKey = function (t, e) {
    this.data.listTime[t] = e;
    this.saveData();
  };
  _ctor.prototype.addTimeByKey = function (t) {
    this.data.listTime[t] || (this.data.listTime[t] = 0);
    this.data.listTime[t]++;
    this.saveData();
    return this.data.listTime[t];
  };
  return _ctor;
}($z1BaseData.BaseData);
exports.KinghtFallGuideData = exp_KinghtFallGuideData;