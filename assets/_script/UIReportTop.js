var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BasePlatform = require("BasePlatform");
var $z1BaseUI = require("BaseUI");
var $z1Appcfg = require("Appcfg");
var $z1PlatformSetting = require("PlatformSetting");
var $z1PlatformManager = require("PlatformManager");
var $z1SdkMgr = require("SdkMgr");
var $z1Config = require("Config");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_UIReportTop = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.btn_Report = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    var t = this;
    this.addEvent($z1Appcfg.BaseEventName.RefreshReport, function (e, n) {
      t.btn_Report.active = e && !$z1SdkMgr.SdkMgr.getInstance().getCheckVersion($z1PlatformSetting.SwitchID.ShenHe) && $z1PlatformManager.PlatformManager.currentPlatform != $z1BasePlatform.Platform.WEB_LINK && $z1PlatformManager.PlatformManager.currentPlatform != $z1BasePlatform.Platform.ANDROID_233 && $z1PlatformManager.PlatformManager.currentPlatform != $z1BasePlatform.Platform.ANDROID_4399;
      if (e) {
        var i = t.btn_Report.parent.convertToNodeSpaceAR(n);
        t.btn_Report.setPosition(i);
      }
    });
  };
  _ctor.prototype.start = function () {
    var t = this;
    ($z1SdkMgr.SdkMgr.getInstance().getCheckVersion($z1PlatformSetting.SwitchID.ShenHe) || $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WEB_LINK || $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.ANDROID_233 || $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.ANDROID_4399) && (this.btn_Report.active = false);
    this.btn_Report.on(cc.Node.EventType.TOUCH_END, function () {
      t.openUI($z1Config.UIID.UIReport);
    });
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btn_Report", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_UIReportTop;