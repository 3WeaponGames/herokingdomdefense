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
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t) {
    this.call = t;
  };
  _ctor.prototype.start = function () {
    var t = this;
    this.btnBreak.on(cc.Node.EventType.TOUCH_END, function () {
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().setNewGame();
      t.call();
      t.closeUI();
    }, this);
    this.btnContinue.on(cc.Node.EventType.TOUCH_END, function () {
      t.call();
      t.closeUI();
    }, this);
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnBreak", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnContinue", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUINewGame;