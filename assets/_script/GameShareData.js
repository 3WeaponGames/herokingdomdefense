var i;
var cc__extends = __extends;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ShareData = undefined;
var $z1BaseData = require("BaseData");
var $z1LogMgr = require("LogMgr");
var $z1SdkMgr = require("SdkMgr");
var $z1TimeUtils = require("TimeUtils");
var $z1UIUtils = require("UIUtils");
var $z1Config = require("Config");
var g = function () {
  this.path = "";
  this.dayShareNum = 0;
  this.daylastShareTime = -1;
};
var exp_ShareData = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.aliseMap = {
      path: "1",
      dayShareNum: "2",
      daylastShareTime: "3"
    };
    e.protoId = 3;
    e.gameKey = $z1Config.GameConfig.AppCacheName + "shareData";
    e.timeTotalStop = 15;
    e.needRecordVideo = true;
    e.recordTime = 0;
    e.canShare = false;
    e.isStart = false;
    e.isPause = false;
    e.isStop = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.createData = function () {
    this.data = new g();
    return this.data;
  };
  _ctor.prototype.initData = function (t) {
    t || -1 != this.data.daylastShareTime && ($z1TimeUtils.TimeUtils.compareIsToday(this.data.daylastShareTime) || (this.data.daylastShareTime = -1, this.data.dayShareNum = 0, this.saveData()));
  };
  _ctor.prototype.startRecord = function () {
    if (this.needRecordVideo) {
      $z1LogMgr.LogMgr.getInstance().debug("开始录屏");
      this.isStart = true;
      this.isPause = false;
      $z1SdkMgr.SdkMgr.getInstance().recordScreen();
      this.needRecordVideo = false;
      this.canShare = false;
      $z1UIUtils.UIUtils.schedule(this.secondUpdate, this, 1);
      this.data.path = "";
      this.saveData();
    }
  };
  _ctor.prototype.playRecord = function () {
    if (this.isStart) {
      if (this.isPause) {
        this.restartRecord();
      } else {
        this.pauseRecord();
      }
    } else {
      this.startRecord();
    }
  };
  _ctor.prototype.pauseRecord = function () {
    if (this.isStart) {
      $z1SdkMgr.SdkMgr.getInstance().pauseRecord();
      this.isPause = true;
      $z1LogMgr.LogMgr.getInstance().debug("暂停录屏");
    }
  };
  _ctor.prototype.restartRecord = function () {
    if (this.isPause) {
      this.isPause = false;
      $z1SdkMgr.SdkMgr.getInstance().restartRecord();
      $z1LogMgr.LogMgr.getInstance().debug("重新录屏");
    }
  };
  _ctor.prototype.stopRecord = function (t, e) {
    var n = this;
    if (!(this.recordTime <= 0)) {
      $z1UIUtils.UIUtils.unSchedule(this.secondUpdate, this);
      this.isStart = false;
      this.isPause = false;
      $z1SdkMgr.SdkMgr.getInstance().stopRecord(t, function (t) {
        n.data.path = t;
        n.recordTime >= 15 && (n.canShare = true);
        n.isStop = true;
        n.recordTime = 0;
        n.saveData();
        e && e();
      });
    }
  };
  _ctor.prototype.getSharePath = function () {
    return this.data.path;
  };
  _ctor.prototype.getCanShare = function () {
    return this.recordTime >= 15 || this.canShare;
  };
  _ctor.prototype.getRecordTime = function () {
    return this.recordTime;
  };
  _ctor.prototype.toShare = function (t, e) {
    var n = this;
    $z1SdkMgr.SdkMgr.getInstance().share(this.data.path, function () {
      n.data.path = "";
      t && n.data.dayShareNum++;
      n.needRecordVideo = true;
      n.canShare = false;
      n.isStop = false;
      n.clearData();
      n.saveData();
      e && e();
    });
  };
  _ctor.prototype.getTodayCanShare = function () {
    return true;
  };
  _ctor.prototype.secondUpdate = function () {
    if (!this.isPause) {
      this.recordTime++;
      this.recordTime >= 290 && this.stopRecord(false);
    }
  };
  _ctor.prototype.checkStop = function (t) {
    if (this.isStop) {
      return t && t(), true;
    } else {
      return (this.recordTime >= this.timeTotalStop || this.recordTime >= 290) && (this.stopRecord(false, t), true);
    }
  };
  _ctor.prototype.clearData = function () {
    this.isStop = false;
    this.isStart = false;
    this.needRecordVideo = true;
    this.data.path = "";
    this.recordTime = 0;
    this.saveData();
  };
  return _ctor;
}($z1BaseData.BaseData);
exports.ShareData = exp_ShareData;