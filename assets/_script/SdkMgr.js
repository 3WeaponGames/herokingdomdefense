Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SdkMgr = exports.AdType = undefined;
var $z1Config = require("Config");
var $z1AudioMgr = require("AudioMgr");
var $z1BasePlatform = require("BasePlatform");
var $z1LogMgr = require("LogMgr");
var $z1PlatformManager = require("PlatformManager");
var $z1UIMgr = require("UIMgr");
var $z1PlayerMgr = require("PlayerMgr");
var $z1EventMgr = require("EventMgr");
var $z1Appcfg = require("Appcfg");
var $z1AppManager = require("AppManager");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1Main = require("Main");
(function (t) {
  t[t.ReissueSign = 0] = "ReissueSign";
  t[t.FreeLotty = 1] = "FreeLotty";
  t[t.Collection = 2] = "Collection";
  t[t.AdFreeTime = 3] = "AdFreeTime";
})(exports.AdType || (exports.AdType = {}));
var exp_SdkMgr = function () {
  function _ctor() {}
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new _ctor());
    return this.instance;
  };
  _ctor.prototype.playVideo = function (t, e, n) {
    $z1AudioMgr.AudioMgr.getInstance().pauseAllMusic();
    $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.blocktouch, false);
    $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.AdStart, true);
    $z1PlatformManager.PlatformManager.getInstance().showVideoAd("", t, function () {
      $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.AdStart, false);
      $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.PlayVideoSucc, true);
      $z1Main.default.instance.onPlayVideo(1);
      $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.blocktouch, true);
      $z1AudioMgr.AudioMgr.getInstance().resumeAllMusic();
      e && e();
    }, function (t) {
      $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.AdStart, false);
      $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.PlayVideoSucc, false);
      $z1AudioMgr.AudioMgr.getInstance().resumeAllMusic();
      $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.blocktouch, true);
      $z1LogMgr.LogMgr.getInstance().debug("播放广告失败");
      t && t.length && $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, -1, t);
      n && n();
    });
  };
  _ctor.prototype.playMultitonVideo = function (t, e, n, o, c, u) {
    $z1AudioMgr.AudioMgr.getInstance().pauseAllMusic();
    $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.blocktouch, false);
    $z1PlatformManager.PlatformManager.getInstance().playMultitonVideo(t, e, n, function (t) {
      $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.blocktouch, true);
      $z1AudioMgr.AudioMgr.getInstance().resumeAllMusic();
      o && o(t);
    }, function (t) {
      $z1AudioMgr.AudioMgr.getInstance().resumeAllMusic();
      $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.blocktouch, true);
      $z1LogMgr.LogMgr.getInstance().debug("播放广告失败");
      t && t.length && $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, -1, t);
      c && c();
    }, u);
  };
  _ctor.prototype.showInsert = function (t) {
    $z1AudioMgr.AudioMgr.getInstance().pauseAllMusic();
    $z1PlatformManager.PlatformManager.getInstance().showInsertAd(t, function () {
      $z1AudioMgr.AudioMgr.getInstance().resumeAllMusic();
    });
  };
  _ctor.prototype.showBanner = function (t) {
    $z1PlatformManager.PlatformManager.getInstance().showBanner(t);
  };
  _ctor.prototype.hideBanner = function () {
    $z1PlatformManager.PlatformManager.getInstance().hideBanner();
  };
  _ctor.prototype.getNeedOpenSubGame = function () {
    if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE) {
      var t = tt.getLaunchOptionsSync().query.guanka;
      if (t) {
        return t;
      }
    }
    return -1;
  };
  _ctor.prototype.getUserInfo = function (t) {
    $z1PlatformManager.PlatformManager.getInstance().getUserInfo(t);
  };
  _ctor.prototype.requestCheckVersion = function (t) {
    $z1AppManager.IAppManager.requestCheckVersion(t);
  };
  _ctor.prototype.getCheckVersion = function (t) {
    return $z1AppManager.IAppManager.getCheckVersion(t);
  };
  _ctor.prototype.hasVerify = function () {
    return $z1PlatformManager.PlatformManager.getInstance().hasVerify();
  };
  _ctor.prototype.recordScreen = function () {
    $z1PlatformManager.PlatformManager.getInstance().recordVideo();
  };
  _ctor.prototype.pauseRecord = function () {
    $z1PlatformManager.PlatformManager.getInstance().pauseRecord();
  };
  _ctor.prototype.restartRecord = function () {
    $z1PlatformManager.PlatformManager.getInstance().resumeRecord();
  };
  _ctor.prototype.resumeRecord = function () {
    $z1PlatformManager.PlatformManager.getInstance().resumeRecord();
  };
  _ctor.prototype.shareImg = function (t, e) {
    $z1PlatformManager.PlatformManager.getInstance().shareImg(t, e);
  };
  _ctor.prototype.share = function (t, e) {
    $z1PlatformManager.PlatformManager.getInstance().shareVideo(t, e);
  };
  _ctor.prototype.getShare = function () {
    return $z1PlatformManager.PlatformManager.getInstance().canShare();
  };
  _ctor.prototype.stopRecord = function (t, e) {
    $z1PlatformManager.PlatformManager.getInstance().stopRecorderManager(t, e);
  };
  _ctor.prototype.openNotify = function () {
    $z1PlatformManager.PlatformManager.getInstance().openNotify();
  };
  _ctor.prototype.toAppStore = function () {
    $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().getToAppStore() || $z1PlatformManager.PlatformManager.getInstance().toAppStore(function (t) {
      1 == t && $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().setToAppStore();
    });
  };
  _ctor.prototype.getSystem = function () {
    return $z1PlatformManager.PlatformManager.getInstance().getSystem();
  };
  _ctor.prototype.getIsIos = function () {
    return $z1PlatformManager.PlatformManager.getInstance().getSystem() == $z1Config.SystemPlatform.IOS;
  };
  _ctor.prototype.getIsAndroid = function () {
    return $z1PlatformManager.PlatformManager.getInstance().getSystem() == $z1Config.SystemPlatform.ANDROID;
  };
  _ctor.prototype.shark = function (t) {
    undefined === t && (t = 0);
    $z1PlatformManager.PlatformManager.getInstance().shark(t);
  };
  _ctor.prototype.checkShortcut = function (t, e) {
    $z1PlatformManager.PlatformManager.getInstance().checkShortcut(t, e);
  };
  _ctor.prototype.addShortcut = function (t, e) {
    $z1PlatformManager.PlatformManager.getInstance().addShortcut(t, e);
  };
  _ctor.prototype.checkCanOpenSideBar = function (t) {
    $z1PlatformManager.PlatformManager.getInstance().checkCanOpenSideBar(t);
  };
  _ctor.prototype.openSideBar = function (t) {
    $z1PlatformManager.PlatformManager.getInstance().openSideBar(t);
  };
  _ctor.prototype.isFromBroadside = function (t) {
    return $z1PlatformManager.PlatformManager.getInstance().isFromBroadside(t);
  };
  return _ctor;
}();
exports.SdkMgr = exp_SdkMgr;