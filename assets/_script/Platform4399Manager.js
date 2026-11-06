Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Platform4399Manager = undefined;
var exp_Platform4399Manager = function () {
  function _ctor() {}
  _ctor.prototype.checkShortcut = function () {};
  _ctor.prototype.addShortcut = function () {};
  _ctor.prototype.setCharts = function () {};
  _ctor.prototype.getCharts = function () {};
  _ctor.prototype.getLaunchOptionsSync = function () {};
  _ctor.prototype.canShare = function () {
    return false;
  };
  _ctor.prototype.pauseRecord = function () {};
  _ctor.prototype.resumeRecord = function () {};
  _ctor.prototype.hasVerify = function () {
    return false;
  };
  _ctor.prototype.verifyKey = function () {};
  _ctor.prototype.getCode = function () {
    return "";
  };
  _ctor.prototype.toAppStore = function () {};
  _ctor.prototype.openNotify = function () {};
  _ctor.prototype.shareImg = function () {};
  _ctor.prototype.getUserInfo = function () {};
  _ctor.prototype.hdieBlockAd = function () {};
  _ctor.prototype.androidAdCallBack = function () {};
  _ctor.prototype.initNativeAd = function () {};
  _ctor.prototype.showNativeAd = function () {};
  _ctor.prototype.getTouchModeVersion = function () {};
  _ctor.prototype.hasShare = function () {
    return false;
  };
  _ctor.prototype.showGamePortalAd = function () {};
  _ctor.prototype.showBlockAd = function () {};
  _ctor.prototype.hideBlockAd = function () {};
  _ctor.prototype.versionName = function () {
    return "1.1.221";
  };
  _ctor.prototype.initSdk = function (t, e) {
    e && e();
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
  _ctor.prototype.showVideoAd = function (t, e, n) {
    if ("h5api" in window) {
      h5api.playAd(function (t) {
        if (!(1e4 === t.code)) {
          if (10001 === t.code) {
            e && e();
          } else {
            n && n();
          }
        }
      });
    } else {
      console.log("找不到 4399HTML5 API");
      n && n();
    }
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
  _ctor.prototype.youmengTrack = function () {};
  return _ctor;
}();
exports.Platform4399Manager = exp_Platform4399Manager;