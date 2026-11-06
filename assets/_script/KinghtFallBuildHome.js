var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1UIMgr = require("UIMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallGameCtrlData = require("KinghtFallGameCtrlData");
var $z1KinghtFallBuildBase = require("KinghtFallBuildBase");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_KinghtFallBuildHome = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndAddCoin = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.hide = function () {
    t.prototype.hide.call(this);
    this.ndAddCoin && (this.ndAddCoin.active = false);
  };
  _ctor.prototype.startRoundGame = function () {
    t.prototype.startRoundGame.call(this);
    this.ndAddCoin && (this.ndAddCoin.active = false);
  };
  _ctor.prototype.setLevel = function (e) {
    t.prototype.setLevel.call(this, e);
    if (this.buildInfo.cfg) {
      if (!this.ndAddCoin) {
        this.ndAddCoin = cc.instantiate($z1KinghtFallUIGame.default.instance.ctrUI.ndCoin), this.ndAddCoin.setParent(this.ndHp), this.ndAddCoin.setPosition(0, 20);
      }
      this.ndAddCoin.active = true;
      this.ndAddCoin.getComponentInChildren(cc.Label).string = "+" + this.getGetCoin();
    } else {
      this.ndAddCoin && (this.ndAddCoin.active = false);
    }
  };
  _ctor.prototype.onDead = function () {
    t.prototype.onDead.call(this);
    var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff20);
    e && ($z1KinghtFallUIGame.default.instance.ctrGame.gameData.addTime[$z1KinghtFallGameCtrlData.KinghtFallTimeType.SoldierDamage2] = e.Pamer[0]);
    $z1KinghtFallUIGame.default.instance.initView();
    $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1KinghtFallConfig.KinghtFallUIID.UIGame, $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.Game02), this.T(this.buildCfg.name)));
  };
  _ctor.prototype.getGetCoin = function () {
    if (!this.buildInfo || !this.buildInfo.cfg) {
      return 0;
    }
    var t = this.buildInfo.cfg.Data[0];
    var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff07);
    e && (t += e.Pamer[0]);
    var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff26);
    n && (t += n.Pamer[0]);
    return t;
  };
  _ctor.prototype.initBuffData = function () {
    t.prototype.initBuffData.call(this);
    this.ndAddCoin && (this.ndAddCoin.getComponentInChildren(cc.Label).string = "+" + this.getGetCoin());
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallBuildBase.default);
exports.default = def_KinghtFallBuildHome;