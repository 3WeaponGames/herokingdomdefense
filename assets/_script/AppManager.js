Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IAppManager = exports.AppManager = undefined;
var $z1BasePlatform = require("BasePlatform");
var $z1Appcfg = require("Appcfg");
var $z1PlatformConfig = require("PlatformConfig");
var $z1PlatformSetting = require("PlatformSetting");
var exp_AppManager = function () {
  function _ctor() {
    this._switchsMap = new Map();
  }
  _ctor.prototype.getABDConf = function () {
    if ($z1PlatformConfig.ABCF[$z1PlatformSetting.PlatformSetting.currentApp]) {
      if (this.getCheckVersion($z1PlatformSetting.SwitchID.ShenHe_ABD)) {
        return $z1PlatformConfig.ABCF[$z1PlatformSetting.PlatformSetting.currentApp][$z1Appcfg.ABD_ENV.DEV];
      } else {
        return $z1PlatformConfig.ABCF[$z1PlatformSetting.PlatformSetting.currentApp][$z1Appcfg.ABD_ENV.PRO];
      }
    } else {
      return console.error("没有配置当前应用名"), null;
    }
  };
  _ctor.prototype.getAdConf = function () {
    if ($z1PlatformConfig.ABCF[$z1PlatformSetting.PlatformSetting.currentApp]) {
      return $z1PlatformConfig.AdConfig[$z1PlatformSetting.PlatformSetting.currentApp];
    } else {
      return console.error("没有配置当前应用名"), null;
    }
  };
  _ctor.prototype.getUMConf = function () {
    if ($z1PlatformConfig.UM_VERSION[$z1PlatformSetting.PlatformSetting.currentApp]) {
      return $z1PlatformConfig.UM_VERSION[$z1PlatformSetting.PlatformSetting.currentApp];
    } else {
      return console.error("没有配置当前应用名"), null;
    }
  };
  _ctor.prototype.requestCheckVersion = function (t) {
    t();
  };
  _ctor.prototype.getCheckVersion = function (t) {
    if ($z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.EDITOR) {
      return false;
    }
    if ($z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.ANDROID_4399) {
      $z1PlatformSetting.SwitchID.ShenHe_ABD;
      return false;
    }
    if ($z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.ANDROID_233) {
      $z1PlatformSetting.SwitchID.ShenHe_ABD;
      return false;
    }
    if ($z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.VIVO) {
      $z1PlatformSetting.SwitchID.ShenHe_ABD;
      return false;
    }
    if ($z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.WEB_LINK) {
      return false;
    }
    var e = $z1PlatformConfig.SWCF[$z1PlatformSetting.PlatformSetting.currentApp];
    if (!e) {
      console.error("没有配置当前应用名");
      return false;
    }
    var n = e[t];
    if (!n) {
      console.error("没有配置当应用的开关");
      return false;
    }
    var a = this._switchsMap.get(n.appId);
    if (a) {
      return this.getSwitchVersion(n) == this.getSwitchVersion(a);
    } else {
      return console.error("后台没配置"), false;
    }
  };
  _ctor.prototype.getABVersion = function () {
    return null;
  };
  _ctor.prototype.getABTestType = function () {
    var t = $z1PlatformConfig.ABSettingCF[$z1PlatformSetting.PlatformSetting.currentApp];
    if (t && t[$z1PlatformSetting.PlatformSetting.currentPlatform]) {
      return t[$z1PlatformSetting.PlatformSetting.currentPlatform].type;
    } else {
      return $z1Appcfg.ABTestType.NO_AB;
    }
  };
  _ctor.prototype._getSwitchIds = function () {
    return $z1PlatformConfig.SWCF[$z1PlatformSetting.PlatformSetting.currentApp] || (console.error("没有配置当前应用名"), null);
  };
  _ctor.prototype._getABSwitchIds = function () {
    return $z1PlatformConfig.ABCF[$z1PlatformSetting.PlatformSetting.currentApp] || (console.error("没有配置当前应用名"), null);
  };
  _ctor.prototype.getSwitchVersion = function (t) {
    if (!t) {
      cc.error("开关没有配置,请到在PlatformManager.ts上进行配置");
      return 0;
    }
    switch ($z1PlatformSetting.PlatformSetting.currentPlatform) {
      case $z1BasePlatform.Platform.WECHAT:
        return t.h5_wechat;
      case $z1BasePlatform.Platform.BYTEDANCE:
        return t.h5_bytedance;
      case $z1BasePlatform.Platform.KUAIKAN:
        return t.h5_kuaikan;
      case $z1BasePlatform.Platform.OPPO:
        return t.h5_oppo;
      case $z1BasePlatform.Platform.VIVO:
        return t.h5_vivo;
      case $z1BasePlatform.Platform.QQ:
        return t.h5_qq;
      case $z1BasePlatform.Platform.ANDROID_233:
        return t.android_233;
      case $z1BasePlatform.Platform.ANDROID_4399:
        return t.android_4399;
      case $z1BasePlatform.Platform.ANDROID_VIVO:
        return t.android_vivo;
      case $z1BasePlatform.Platform.ANDROID_XIAOMI:
        return t.android_xiaomi;
      case $z1BasePlatform.Platform.GOOGLE:
        return t.android_google;
      case $z1BasePlatform.Platform.Ios:
        return t.ios;
      default:
        return t.h5_baidu;
    }
  };
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new _ctor());
    return this.instance;
  };
  return _ctor;
}();
exports.AppManager = exp_AppManager;
exports.IAppManager = exp_AppManager.getInstance();