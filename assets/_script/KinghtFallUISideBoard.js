var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1Appcfg = require("Appcfg");
var $z1PlatformSetting = require("PlatformSetting");
var $z1ResourceMgr = require("ResourceMgr");
var $z1SdkMgr = require("SdkMgr");
var $z1CacheUtils = require("CacheUtils");
var $z1Config = require("Config");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var P = $z1KinghtFallConfig.KinghtFallParameter.AppCacheName + "SIDE_BOARD_REWARD";
var def_KinghtFallUISideBoard = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.labNum = null;
    e.btnClose = null;
    e.btnGo = null;
    e.btnReward = null;
    e.bg = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    var t = this;
    this.loadLogo();
    var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.SidebarGoldSupply);
    var n = parseInt(e);
    this.labNum.string = require("LanguageMgr").LanguageMgr.getInstance().t("format.multiplier", [$z1KinghtFallModle.default.getInstance().numberFomat(n)]);
    this.btnGo.on(cc.Node.EventType.TOUCH_END, function () {
      $z1SdkMgr.SdkMgr.getInstance().checkCanOpenSideBar(function (t) {
        t && $z1SdkMgr.SdkMgr.getInstance().openSideBar();
      });
    }, this);
    this.btnClose.on(cc.Node.EventType.TOUCH_END, function () {
      t.closeUI();
    }, this);
    this.btnReward.on(cc.Node.EventType.TOUCH_END, function () {
      var e = $z1SdkMgr.SdkMgr.getInstance().isFromBroadside(t._options);
      var i = $z1CacheUtils.CacheUtils.getData($z1Config.GameConfig.AppCacheName + P);
      if (e && "1" != i) {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.add_sidebar);
        $z1CacheUtils.CacheUtils.saveData($z1Config.GameConfig.AppCacheName + P, "1");
        var a = {
          id: $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin,
          num: n
        };
        $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().addRewards([a], 1, t.labNum.node.convertToWorldSpaceAR(cc.v2()));
        t.onAppShow(null);
        t.closeUI();
      }
    }, this);
    this.addEvent($z1Appcfg.BaseEventName.onShow, this.onAppShow);
    this.onAppShow();
  };
  _ctor.prototype.onAppShow = function (t) {
    this._options = t;
    t && console.log("onShow", t);
    if ("1" == $z1CacheUtils.CacheUtils.getData($z1Config.GameConfig.AppCacheName + P)) {
      this.btnGo.active = false;
      return void (this.btnReward.active = false);
    }
    if ($z1SdkMgr.SdkMgr.getInstance().isFromBroadside(t)) {
      this.btnGo.active = false;
      this.btnReward.active = true;
    } else {
      this.btnGo.active = true;
      this.btnReward.active = false;
    }
  };
  _ctor.prototype.loadLogo = function () {
    var t = this;
    var e = "wg_cbl_cbl";
    switch ($z1PlatformSetting.PlatformSetting.currentApp) {
      case $z1PlatformSetting.AppName.Main:
        e = "wg_cbl_cbl";
        break;
      case $z1PlatformSetting.AppName.MRDYX:
        e = "wg_cbl_cbl1";
    }
    $z1ResourceMgr.ResourceMgr.getInstance().loadSpriteframe("KinghtFallUISideBoard", e, function (e) {
      e && cc.isValid(t.bg) && (t.bg.spriteFrame = e);
    });
  };
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "labNum", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnClose", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnGo", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnReward", undefined);
  cc__decorate([ccp_property(cc.Sprite)], _ctor.prototype, "bg", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUISideBoard;