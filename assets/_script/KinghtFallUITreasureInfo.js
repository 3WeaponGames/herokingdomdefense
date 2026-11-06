var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
var cc__spreadArrays = __spreadArrays;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1AudioMgr = require("AudioMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallMissionData = require("KinghtFallMissionData");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUITreasureInfo = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.labName = null;
    e.btnClose = null;
    e.ndItem = null;
    e.labInfo = null;
    e.ndPro = null;
    e.ndLock = null;
    e.btnGold = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t) {
    this.cfg = t;
    this.cfgGoods = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(this.cfg.goodID);
  };
  _ctor.prototype.start = function () {
    this.info = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTreasureLevel(this.cfg.ID);
    this.initView();
    this.initBtnListener();
  };
  _ctor.prototype.initBtnListener = function () {
    this.btnClose.on(cc.Node.EventType.TOUCH_END, this.closeUI, this);
    this.node.getChildByName("bg").on(cc.Node.EventType.TOUCH_END, this.closeUI, this);
    this.btnGold.on(cc.Node.EventType.TOUCH_END, this.onGoldBtnClick, this);
  };
  _ctor.prototype.initView = function () {
    var t = this;
    this.labName.string = this.T(this.cfgGoods.name);
    this.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, this.cfgGoods.sprBg, function (e) {
      t.ndItem.getChildByName("sprBg").getComponent(cc.Sprite).spriteFrame = e;
    });
    this.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, this.cfgGoods.icon, function (e) {
      t.ndItem.getChildByName("sprIcon").getComponent(cc.Sprite).spriteFrame = e;
    });
    var e = this.info ? this.info.level : 1;
    this.ndItem.getChildByName("labNum").getComponent(cc.Label).string = $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTrea02), e);
    var n = [];
    for (var i = 0; i < this.cfg.levelInfo[e - 1].param.length; i++) {
      var a = this.cfg.levelInfo[e - 1].param[i];
      if (this.cfg.levelInfo[e - 1].vaulePercentage[i]) {
        n.push("<color=#43a926>" + (100 * a).toFixed(0) + "%</c>");
      } else {
        n.push("<color=#43a926>" + a + "</c>");
      }
    }
    this.labInfo.string = require("LanguageMgr").LanguageMgr.getInstance().format("<b>{0}</b>", [$z1Utils.Utils.StringFormat.apply($z1Utils.Utils, cc__spreadArrays([this.T(this.cfg.Describe)], n))]);
    if (!this.info || this.info.level >= this.cfg.levelInfo.length) {
      this.ndLock.active = !this.info;
      this.ndPro.active = false;
      this.btnGold.active = false;
    } else {
      this.ndLock.active = false;
      this.ndPro.getChildByName("labPro").getComponent(cc.Label).string = this.info.frame + "/" + this.cfg.levelInfo[this.info.level - 1].PieceCost;
      this.ndPro.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = this.info.frame / this.cfg.levelInfo[this.info.level - 1].PieceCost;
      this.btnGold.getChildByName("Layout").getChildByName("labNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(this.cfg.levelInfo[this.info.level - 1].GoldCost);
    }
  };
  _ctor.prototype.onGoldBtnClick = function () {
    if (this.info.frame < this.cfg.levelInfo[this.info.level - 1].PieceCost) {
      this.openUI($z1Config.UIID.UITips, $z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTips05);
    } else if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().subGoldNum(this.cfg.levelInfo[this.info.level - 1].GoldCost)) {
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.TreasureUp, 1);
      $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.level_up);
      this.info.frame -= this.cfg.levelInfo[this.info.level - 1].PieceCost;
      this.info.level += 1;
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().setTreasureLevel(this.info);
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.TreasureUpdate);
      this.initView();
    } else {
      this.openUI($z1KinghtFallConfig.KinghtFallUIID.UIAddCurrency, $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin);
    }
  };
  cc__decorate([ccp_property({
    type: cc.Label,
    tooltip: "天赋名称"
  })], _ctor.prototype, "labName", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "关闭"
  })], _ctor.prototype, "btnClose", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "关闭"
  })], _ctor.prototype, "ndItem", undefined);
  cc__decorate([ccp_property({
    type: cc.RichText,
    tooltip: "天赋名称"
  })], _ctor.prototype, "labInfo", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "关闭"
  })], _ctor.prototype, "ndPro", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "已签到"
  })], _ctor.prototype, "ndLock", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "已签到"
  })], _ctor.prototype, "btnGold", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUITreasureInfo;