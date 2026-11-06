Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PlayerMgr = undefined;
var $z1Appcfg = require("Appcfg");
var $z1EventMgr = require("EventMgr");
var $z1LogMgr = require("LogMgr");
var $z1Config = require("Config");
var $z1GameGuideData = require("GameGuideData");
var $z1GameTestSegData = require("GameTestSegData");
var $z1GameTrackData = require("GameTrackData");
var $z1GameUserData = require("GameUserData");
var $z1DataMgr = require("DataMgr");
var exp_PlayerMgr = function () {
  function _ctor() {
    this.isLoaded = false;
  }
  _ctor.getInstance = function () {
    if (null == this.instance) {
      this.instance = new _ctor();
      this.instance.initData();
    }
    return this.instance;
  };
  _ctor.prototype.initData = function () {};
  _ctor.prototype.preload = function () {
    if (!this.isLoaded) {
      this.isLoaded = true;
      this.udata = new $z1GameUserData.UserData();
      this.udata.getData();
      this.testData = new $z1GameTestSegData.TestData();
      this.testData.getData();
      this.guideData = new $z1GameGuideData.GuideData();
      this.guideData.getData();
      this.trackData = new $z1GameTrackData.TrackData();
      this.trackData.getData();
      this.trackData.getSdkAbName(function (t) {
        $z1LogMgr.LogMgr.getInstance().debug("用户类型：" + t, "");
        $z1DataMgr.DataMgr.getInstance().reloadConfig(t, function () {
          $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.Loading, $z1Appcfg.LoadingProcess.PlayerCfg);
        });
      });
    }
  };
  _ctor.prototype.getTestData = function () {
    return this.testData;
  };
  _ctor.prototype.getServerData = function () {
    return this.data;
  };
  _ctor.prototype.setServerData = function (t) {
    this.data = t;
  };
  _ctor.prototype.getAbType = function () {
    return this.trackData.getAbType();
  };
  _ctor.prototype.getDynamicAbType = function () {
    return this.trackData.getDynamicAbType();
  };
  _ctor.prototype.getGuideData = function () {
    return this.guideData;
  };
  _ctor.prototype.getUserData = function () {
    return this.udata;
  };
  _ctor.prototype.getTrackData = function () {
    return this.trackData;
  };
  _ctor.prototype.addRewards = function (t, e) {
    undefined === e && (e = 1);
    var n = t.split($z1Config.GameConfig.splitCount);
    for (var i = 0; i < n.length; i++) {
      if (!(n[i].length <= 0)) {
        var a = n[i].split($z1Config.GameConfig.splitNum);
        Number(a[0]);
        Number(a[1]);
      }
    }
  };
  _ctor.prototype.addComReward = function (t, e) {
    undefined === e && (e = 1);
    var n = t.split($z1Config.GameConfig.splitCount);
    for (var i = 0; i < n.length; i++) {
      if (!(n[i].length <= 0)) {
        var a = n[i].split($z1Config.GameConfig.splitNum);
        Number(a[0]);
        Number(a[1]);
      }
    }
  };
  _ctor.prototype.subGoodsNum = function (e, n) {
    var i = _ctor.getInstance().getUserData();
    if (1 == e) {
      return i.subGoldNum(n);
    }
  };
  return _ctor;
}();
exports.PlayerMgr = exp_PlayerMgr;