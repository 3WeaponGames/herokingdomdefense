var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1GAD_UIGame = require("GAD_UIGame");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_GAD_UIPause = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.btnBackHome = null;
    e.btnPlay = null;
    e.gmNode = null;
    e._callFunc = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t) {
    this._callFunc = t;
  };
  _ctor.prototype.bindEvent = function () {
    var t = this;
    this.btnBackHome.on(cc.Node.EventType.TOUCH_END, function () {
      t._callFunc && t._callFunc(false);
      t.closeUI();
    });
    this.btnPlay.on(cc.Node.EventType.TOUCH_END, function () {
      console.log("true");
      t._callFunc && t._callFunc(true);
      t.closeUI();
    });
    this.gmNode.on(cc.Node.EventType.TOUCH_END, function () {
      $z1GAD_UIGame.default.script.setGmNode();
    });
  };
  _ctor.prototype.onLoad = function () {};
  _ctor.prototype.start = function () {
    this.bindEvent();
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnBackHome", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnPlay", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "gmNode", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_GAD_UIPause;