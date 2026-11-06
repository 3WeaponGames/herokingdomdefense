var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1AudioMgr = require("AudioMgr");
var $z1SdkMgr = require("SdkMgr");
var $z1Utils = require("Utils");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIAddStrength = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.labTitle1 = null;
    e.ndLeft = null;
    e.ndRight = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t) {
    this.call = t;
  };
  _ctor.prototype.start = function () {
    var t = this;
    var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById($z1KinghtFallEnum.KinghtFallEnumGoodsCfg.stamina);
    this.labTitle1.string = $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.CommerName01), this.T(e.name));
    var n = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.StaminaSupply);
    this.goldNum = n.split(",").map(Number);
    var i;
    var a = parseInt($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.StaminaBuy));
    this.ndLeft.getChildByName("LabNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(this.goldNum[0]);
    (i = this.ndLeft.getChildByName("ndBtn")).on(cc.Node.EventType.TOUCH_END, function () {
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().subDiamondNum(a) && t.onBtnBuy(t.goldNum[0]);
    }, this);
    i.getChildByName("Layout").getChildByName("LabNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(a);
    this.ndRight.getChildByName("LabNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(this.goldNum[1]);
    (i = this.ndRight.getChildByName("ndBtn")).on(cc.Node.EventType.TOUCH_END, function () {
      $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.power);
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_power_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
        t.onBtnBuy(t.goldNum[1]);
      }, null, "home.energy.refill");
    }, this);
    this.node.getChildByName("bg").on(cc.Node.EventType.TOUCH_END, this.closeUI, this);
  };
  _ctor.prototype.onBtnBuy = function (t) {
    $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().addPowerNum(t);
    $z1AudioMgr.AudioMgr.getInstance().playEffect($z1KinghtFallConfig.KinghtFallAudioId.gold_reward);
    this.call && this.call();
    this.closeUI();
  };
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "labTitle1", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndLeft", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndRight", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIAddStrength;