var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIGM = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.btnClose = null;
    e.btnLock = null;
    e.btnCoin = null;
    e.btnDiamond = null;
    e.tagClick = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    var t = this;
    this.btnClose.on(cc.Node.EventType.TOUCH_END, function () {
      t.closeUI();
    }, this);
    this.btnLock.on(cc.Node.EventType.TOUCH_END, function () {
      var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getLevelCfgList();
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().setMaxStage(e.length);
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().setGroupId(e.length);
      t.sendEvent($z1KinghtFallConfig.KinghtFallEventName.UpBattView);
    }, this);
    this.btnCoin.on(cc.Node.EventType.TOUCH_END, function () {
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().addGoldNum(1e6);
    }, this);
    this.btnDiamond.on(cc.Node.EventType.TOUCH_END, function () {
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().addDiamondNum(1e4);
    }, this);
    this.tagClick.isChecked = 30 == $z1KinghtFallConfig.KinghtFallParameter.InitGold;
    this.tagClick.node.on("toggle", function (t) {
      $z1KinghtFallConfig.KinghtFallParameter.InitGold = t.isChecked ? 30 : 0;
    }, this);
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnClose", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "解锁关卡"
  })], _ctor.prototype, "btnLock", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "解锁关卡"
  })], _ctor.prototype, "btnCoin", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "解锁关卡"
  })], _ctor.prototype, "btnDiamond", undefined);
  cc__decorate([ccp_property({
    type: cc.Toggle,
    tooltip: "解锁关卡"
  })], _ctor.prototype, "tagClick", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIGM;