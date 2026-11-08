var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUINewGame = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.btnBreak = null;
    e.btnContinue = null;
    e.btnClose = null;
    e.labInfo = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t, stage) {
    this.call = t;
    var record = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData();
    this.stage = stage === undefined ? record.data.levelNum : stage;
    this.finished = false;
    if (this.labInfo) require("LanguageMgr").LanguageMgr.getInstance().bindLabel(this.labInfo, "ui.layout.kinghtfalluinewgame.13", [this.stage, record.getRoundNum(this.stage)]);
  };
  _ctor.prototype.start = function () {
    var t = this;
    this.btnBreak.on(cc.Node.EventType.TOUCH_END, function () {
      if (t.finished || $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().setNewGame(t.stage) === false) return;
      t.finished = true;
      t.closeUI();
      t.call();
    }, this);
    this.btnContinue.on(cc.Node.EventType.TOUCH_END, function () {
      if (t.finished || !$z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().readyForNewBattle()) return;
      t.finished = true;
      t.closeUI();
      t.call();
    }, this);
    if (this.btnClose) this.btnClose.on(cc.Node.EventType.TOUCH_END, function () {
      if (t.finished) return;
      t.finished = true;
      t.closeUI();
    }, this);
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnBreak", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnContinue", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnClose", undefined);
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "labInfo", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUINewGame;
