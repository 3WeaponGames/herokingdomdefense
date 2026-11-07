var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1SdkMgr = require("SdkMgr");
var $z1Utils = require("Utils");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallItemGood = require("KinghtFallItemGood");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIGameBack = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.itemGood = null;
    e.labInfo = null;
    e.btnBreak = null;
    e.btnNewGame = null;
    e.breakCall = null;
    e.addCoin = 10;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t) {
    this.breakCall = t;
  };
  _ctor.prototype.start = function () {
    this.addCoin = parseInt($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.BackToReady));
    this.itemGood.initView({
      id: $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.SilverCoin,
      num: this.addCoin
    });
    this.labInfo.string = $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameEnd01), this.addCoin);
    this.initBtnEvent();
  };
  _ctor.prototype.initBtnEvent = function () {
    var t = this;
    this.btnBreak.on(cc.Node.EventType.TOUCH_END, function () {
      t.finishDecision(t.breakCall, 0);
    }, this);
    this.btnNewGame.on(cc.Node.EventType.TOUCH_END, function () {
      if (t.isclose || t._decisionCompleted || t._decisionPending) return;
      t._decisionPending = true;
      var generation = t._resourceGeneration;
      $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
        if (generation === t._resourceGeneration) t._decisionPending = false;
        t.finishDecision(t.breakCall, t.addCoin, generation);
      }, function () {
        if (generation === t._resourceGeneration) t._decisionPending = false;
      }, "battle.retry");
    }, this);
  };
  cc__decorate([ccp_property({
    type: $z1KinghtFallItemGood.default,
    tooltip: "放弃"
  })], _ctor.prototype, "itemGood", undefined);
  cc__decorate([ccp_property({
    type: cc.Label,
    tooltip: "放弃"
  })], _ctor.prototype, "labInfo", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "放弃"
  })], _ctor.prototype, "btnBreak", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "回溯"
  })], _ctor.prototype, "btnNewGame", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIGameBack;
