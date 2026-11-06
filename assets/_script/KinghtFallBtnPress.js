var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var r;
var $z1AudioMgr = require("AudioMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var ccp_requireComponent = cc__decorator.requireComponent;
var def_KinghtFallBtnPress = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.sprNormal = null;
    e.sprPressed = null;
    e.numDev = 0;
    e.callBack = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    var t = this;
    this.node.children.forEach(function (t) {
      var e;
      t.attr(((e = {})[r.ChilidPos] = t.getPosition().clone(), e));
    });
    this.node.on(cc.Node.EventType.TOUCH_START, function () {
      $z1AudioMgr.AudioMgr.getInstance().playAudioButtonClicked();
      t.node.getComponent(cc.Sprite).spriteFrame = t.sprPressed;
      t.node.children.forEach(function (e) {
        var n = e[r.ChilidPos];
        e.setPosition(n.x, n.y + t.numDev);
      });
    }, this);
    this.node.on(cc.Node.EventType.TOUCH_CANCEL, function () {
      t.node.getComponent(cc.Sprite).spriteFrame = t.sprNormal;
      t.node.children.forEach(function (t) {
        var e = t[r.ChilidPos];
        t.setPosition(e);
      });
      t.callBack && t.callBack(false);
    }, this);
    this.node.on(cc.Node.EventType.TOUCH_END, function () {
      t.node.getComponent(cc.Sprite).spriteFrame = t.sprNormal;
      t.node.children.forEach(function (t) {
        var e = t[r.ChilidPos];
        t.setPosition(e);
      });
      t.callBack && t.callBack(true);
    }, this);
  };
  _ctor.prototype.init = function (t) {
    this.callBack = t;
  };
  cc__decorate([ccp_property(cc.SpriteFrame)], _ctor.prototype, "sprNormal", undefined);
  cc__decorate([ccp_property(cc.SpriteFrame)], _ctor.prototype, "sprPressed", undefined);
  cc__decorate([ccp_property(Number)], _ctor.prototype, "numDev", undefined);
  return cc__decorate([ccp_ccclass, ccp_requireComponent(cc.Sprite)], _ctor);
}(cc.Component);
exports.default = def_KinghtFallBtnPress;
(function (t) {
  t.ChilidPos = "ChilidPos";
})(r || (r = {}));