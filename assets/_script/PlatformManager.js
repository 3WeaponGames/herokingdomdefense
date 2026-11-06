Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PlatformManager = undefined;
var $z1BasePlatform = require("BasePlatform");
var $z1EditorManager = require("EditorManager");
var $z1Config = require("Config");
var $z1PlatformSetting = require("PlatformSetting");
var $z1Platform4399Manager = require("Platform4399Manager");
var exp_PlatformManager = function () {
  function _ctor() {}
  _ctor.getInstance = function () {
    null == this._instance && (this._instance = new _ctor());
    return this._instance;
  };
  _ctor.prototype.init = function () {
    if (_ctor.currentPlatform == $z1BasePlatform.Platform.ANDROID_4399) {
      this.currentPaltform = new $z1Platform4399Manager.Platform4399Manager();
    } else {
      this.currentPaltform = new $z1EditorManager.EditorManager();
    }
    this.initSdk();
  };
  _ctor.prototype.initSdk = function () {
    this.currentPaltform || (this.currentPaltform = new $z1EditorManager.EditorManager());
    this.currentPaltform.initSdk();
  };
  _ctor.prototype.getIsZhiTou = function () {
    return _ctor.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE && this.currentPaltform.getIsZhiTouUser();
  };
  _ctor.prototype.getEnableRemoteCfg = function () {
    return _ctor.currentPlatform == $z1BasePlatform.Platform.EDITOR && this.currentPaltform.getEnableRemoteCfg();
  };
  _ctor.prototype.showBanner = function (t, e) {
    this.currentPaltform.showBanner(t, e);
  };
  _ctor.prototype.shark = function (t, e) {
    this.currentPaltform.shark(t, e);
  };
  _ctor.prototype.hideBanner = function (t, e) {
    this.currentPaltform.hideBanner(t, e);
  };
  _ctor.prototype.showInsertAd = function (t, e) {
    this.currentPaltform.showInsertAd(t, e);
  };
  _ctor.prototype.getLaunchOptionsSync = function (t) {
    if (this.currentPaltform.getLaunchOptionsSync) {
      this.currentPaltform.getLaunchOptionsSync(t);
    } else {
      t && t();
    }
  };
  _ctor.prototype.getUserInfo = function (t) {
    if (this.currentPaltform.getUserInfo) {
      this.currentPaltform.getUserInfo(t);
    } else {
      t && t(null, null);
    }
  };
  _ctor.prototype.showVideoAd = function (t, e, n, i) {
    this.currentPaltform.showVideoAd(t, n, i, e);
  };
  _ctor.prototype.playMultitonVideo = function (t, e, n, i, a, o) {
    this.currentPaltform.playMultitonVideo && this.currentPaltform.playMultitonVideo(t, e, n, i, a, o);
  };
  _ctor.prototype.checkShortcut = function (t, e) {
    this.currentPaltform.checkShortcut && this.currentPaltform.checkShortcut(t, e);
  };
  _ctor.prototype.addShortcut = function (t, e) {
    this.currentPaltform.addShortcut && this.currentPaltform.addShortcut(t, e);
  };
  _ctor.prototype.otherFun = function (t, e) {
    this.currentPaltform.otherFun(t, e);
  };
  _ctor.prototype.recordVideo = function (t, e) {
    this.currentPaltform.recordVideo(t, e);
  };
  _ctor.prototype.stopRecorderManager = function (t, e, n) {
    this.currentPaltform.stopRecorderManager(t, e, n);
  };
  _ctor.prototype.youmengTrack = function (t, e, n, i) {
    this.currentPaltform.youmengTrack(t, e, n, i);
  };
  _ctor.prototype.hasVerify = function () {
    return this.currentPaltform.hasVerify();
  };
  _ctor.prototype.getNativeCode = function (t) {
    this.currentPaltform.getCode && this.currentPaltform.getCode(t);
  };
  _ctor.prototype.canShare = function () {
    return !!this.currentPaltform.canShare && this.currentPaltform.canShare();
  };
  _ctor.prototype.pauseRecord = function () {
    this.currentPaltform.pauseRecord && this.currentPaltform.pauseRecord();
  };
  _ctor.prototype.resumeRecord = function () {
    this.currentPaltform.resumeRecord && this.currentPaltform.resumeRecord();
  };
  _ctor.prototype.shareVideo = function (t, e) {
    this.currentPaltform.shareVideo && this.currentPaltform.shareVideo(t, e);
  };
  _ctor.prototype.toAppStore = function (t) {
    this.currentPaltform.toAppStore && this.currentPaltform.toAppStore(t);
  };
  _ctor.prototype.openNotify = function () {
    this.currentPaltform.openNotify && this.currentPaltform.openNotify();
  };
  _ctor.prototype.shareImg = function (t, e) {
    this.currentPaltform.shareImg && this.currentPaltform.shareImg(t, e);
  };
  _ctor.prototype.getSystem = function () {
    if (this.currentPaltform.getSystem) {
      return this.currentPaltform.getSystem();
    } else {
      return $z1Config.SystemPlatform.UNKNOWN;
    }
  };
  _ctor.prototype.checkCanOpenSideBar = function (e) {
    if (this.currentPaltform.checkCanOpenSideBar) {
      this.currentPaltform.checkCanOpenSideBar(e);
    } else if (_ctor.currentPlatform == $z1BasePlatform.Platform.EDITOR) {
      e(true);
    } else {
      e(false);
    }
  };
  _ctor.prototype.openSideBar = function (t) {
    if (this.currentPaltform.openSideBar) {
      this.currentPaltform.openSideBar(t);
    } else {
      t(true);
    }
  };
  _ctor.prototype.isFromBroadside = function (t) {
    return !this.currentPaltform.isFromBroadside || this.currentPaltform.isFromBroadside(t);
  };
  _ctor.currentPlatform = $z1PlatformSetting.PlatformSetting.currentPlatform;
  return _ctor;
}();
exports.PlatformManager = exp_PlatformManager;