var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BasePlatform = require("BasePlatform");
var $z1BaseUI = require("BaseUI");
var $z1PlatformConfig = require("PlatformConfig");
var $z1PlatformSetting = require("PlatformSetting");
var $z1SdkMgr = require("SdkMgr");
var $z1ServerDataMgr = require("ServerDataMgr");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1Appcfg = require("Appcfg");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUISetting = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndTitle = null;
    e.musicSlider = null;
    e.effectSlider = null;
    e.btnClose = null;
    e.version = null;
    e.btnCleardata = null;
    e.btnExchangeCode = null;
    e.index = 0;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (context) {
    this._pauseParent = context && context.pauseParent || null;
    this._battleChildren = [];
    if (t.prototype.init) t.prototype.init.call(this);
  };
  _ctor.prototype.onOpen = function () {
    if (this._pauseParent && cc.isValid(this._pauseParent, true)) this.node.zIndex = Math.max(this.node.zIndex, this._pauseParent.node.zIndex + 1);
  };
  _ctor.prototype.onEnable = function () {
    this.btnExchangeCode.active = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().hasActiveGiftCode();
    require("AudioOptions").refresh(this);
  };
  _ctor.prototype.start = function () {
    var n = this;
    var i = $z1PlayerMgr.PlayerMgr.getInstance();
    this.version.string = require("LanguageMgr").LanguageMgr.getInstance().t("settings.version", [i.getTrackData().getVersionConf(), i.getTrackData().getVersionName(), i.getAbType()]);
    this.bindEvent();
    this.addEvent($z1Appcfg.BaseEventName.OpenUI, this.raiseBattleChild);
    require("SettingsPanelLayout").settings(this);
    this.btnExchangeCode.on(cc.Node.EventType.TOUCH_END, function () {
      n.openUI($z1KinghtFallConfig.KinghtFallUIID.UIExchangeCode);
    }, this);
    ($z1SdkMgr.SdkMgr.getInstance().getCheckVersion($z1PlatformSetting.SwitchID.ShenHe_ABD) || $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.EDITOR || $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.WEB_LINK) && this.ndTitle.on(cc.Node.EventType.TOUCH_END, function () {
      n.clickGM();
    }, this);
  };
  _ctor.prototype.raiseBattleChild = function (id, node) {
    if (!this._pauseParent || !node || node === this.node || this.isclose) return;
    var child = node.getComponent($z1BaseUI.default);
    if (child && child.fromId === this.uid) {
      node.zIndex = Math.max(node.zIndex, this.node.zIndex + 1);
      this._battleChildren.push(child);
    }
  };
  _ctor.prototype.onClose = function () {
    (this._battleChildren || []).forEach(function (child) { if (cc.isValid(child, true) && !child.isclose) child.closeUI(); });
    this._battleChildren = [];
    this._pauseParent = null;
  };
  _ctor.prototype.bindEvent = function () {
    var t = this;
    require("AudioOptions").bind(this);
    this.btnClose.on(cc.Node.EventType.TOUCH_END, function () {
      t.closeUI();
    }, this);
    var e = $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.WECHAT && $z1PlatformConfig.ServerDataCfg[$z1PlatformSetting.PlatformSetting.currentApp].wechatOpened;
    var n = $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE && $z1PlatformConfig.ServerDataCfg[$z1PlatformSetting.PlatformSetting.currentApp].douyinOpened;
    var i = $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.WEB_LINK || $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.EDITOR;
    this.btnCleardata.node.active = e || n || i;
    this.btnCleardata.node.on(cc.Node.EventType.TOUCH_END, function () {
      $z1ServerDataMgr.ServerdataMgr.clearAllData(function () {});
    }, this);
  };
  _ctor.prototype.lateUpdate = function () { require("SettingsPanelLayout").settings(this); };
  _ctor.prototype.clickGM = function () {
    this.index++;
    if (!(this.index < 5)) {
      this.index = 0;
      this.openUI($z1KinghtFallConfig.KinghtFallUIID.UIGM);
    }
  };
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "标题"
  })], _ctor.prototype, "ndTitle", undefined);
  cc__decorate([ccp_property(cc.Slider)], _ctor.prototype, "musicSlider", undefined);
  cc__decorate([ccp_property(cc.Slider)], _ctor.prototype, "effectSlider", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnClose", undefined);
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "version", undefined);
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "btnCleardata", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "兑换码"
  })], _ctor.prototype, "btnExchangeCode", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUISetting;
