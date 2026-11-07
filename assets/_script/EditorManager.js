Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EditorManager = undefined;
var $z1UIUtils = require("UIUtils");
var $z1Utils = require("Utils");
var exp_EditorManager = function () {
  function _ctor() {
    this.enableUMAlret = false;
    this.enableRemoteCfg = false;
    this.infostr = [];
  }
  _ctor.prototype.initSdk = function (t, e) {
    var n = $z1Utils.Utils.getWebUrlParams(window.location.href);
    var i = n.enableUM;
    var o = n.cfg;
    i && "1" == i && (this.enableUMAlret = true);
    o && "1" == o && (this.enableRemoteCfg = true);
    e && e();
  };
  _ctor.prototype.getEnableRemoteCfg = function () {
    return this.enableRemoteCfg;
  };
  _ctor.prototype.getLaunchOptionsSync = function (callback) { callback && callback(null); };
  _ctor.prototype.getCode = function () {
    return "";
  };
  _ctor.prototype.pauseRecord = function () {};
  _ctor.prototype.resumeRecord = function () {};
  _ctor.prototype.verifyKey = function () {};
  _ctor.prototype.toAppStore = function () {};
  _ctor.prototype.openNotify = function () {};
  _ctor.prototype.shareImg = function () {};
  _ctor.prototype.getUserInfo = function (callback) { callback && callback(null, null); };
  _ctor.prototype.getIsZhiTouUser = function () {
    return false;
  };
  _ctor.prototype.checkCanOpenSideBar = function (callback) { callback && callback(false); };
  _ctor.prototype.openSideBar = function (callback) { callback && callback(false); };
  _ctor.prototype.isFromBroadside = function () {
    return true;
  };
  _ctor.prototype.playMultitonVideo = function (t, e, n, success, failure) { failure && failure(); return false; };
  _ctor.prototype.checkShortcut = function (t, e) {
    e && e(false);
  };
  _ctor.prototype.addShortcut = function (t, e) {
    e && e("桌面图标添加成功");
  };
  _ctor.prototype.hasVerify = function () {
    return true;
  };
  _ctor.prototype.canShare = function () {
    return true;
  };
  _ctor.prototype.youmengTrack = function (t, e, n, i) {
    var a = "事件id：" + t + "\n";
    a += "事件值：" + n + "\n";
    a += "AB用户：" + e + "\n";
    a += "说明：" + i + "\n";
    console.log(a);
  };
  _ctor.prototype.login = function (t, e) {
    e && e();
  };
  _ctor.prototype.pay = function (t, e) {
    e && e();
  };
  _ctor.prototype.share = function (t, e) {
    e && e();
  };
  _ctor.prototype.showBanner = function (t, e) {
    e && e();
  };
  _ctor.prototype.hideBanner = function (t, e) {
    e && e();
  };
  _ctor.prototype.showInsertAd = function (t, e) {
    e && e();
  };
  _ctor.prototype.showVideoAd = function (t, e) {
    e && $z1UIUtils.UIUtils.scheduleOnce(function () {
      e();
    }, this, 1);
  };
  _ctor.prototype.otherFun = function (t, e) {
    e && e();
  };
  _ctor.prototype.shark = function (t, e) {
    e && e();
  };
  _ctor.prototype.recordVideo = function (t, e) {
    e && e();
  };
  _ctor.prototype.shareVideo = function (t, e) {
    e && e();
  };
  _ctor.prototype.stopRecorderManager = function (t, e) {
    e && e();
  };
  _ctor.prototype.setLanguage = function (t, e) {
    e && e();
    return "zh";
  };
  return _ctor;
}();
exports.EditorManager = exp_EditorManager;
