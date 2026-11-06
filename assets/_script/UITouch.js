var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1Appcfg = require("Appcfg");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_UITouch = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.touchNode = null;
    e.needEffect = true;
    e.ndMask = null;
    e.ndAd = null;
    e.touchNodes = [];
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    var t = this;
    this.addEvent($z1Appcfg.BaseEventName.blocktouch, this.onBlockTouch);
    this.node.on(cc.Node.EventType.TOUCH_START, function (e) {
      if (t.needEffect) {
        var n;
        if (t.touchNodes.length > 0) {
          (n = t.touchNodes.pop()).active = true;
          n.getComponent(cc.Animation).play();
        } else {
          (n = cc.instantiate(t.touchNode)).active = true;
          n.parent = t.node;
        }
        var i = t.node.convertToNodeSpaceAR(e.getLocation());
        n.setPosition(i);
        t.scheduleOnce(function () {
          n.active = false;
          t.touchNodes.push(n);
        }, .5);
      }
    });
    this.node._touchListener.setSwallowTouches(false);
    this.ndMask.active = false;
    this.ndAd.active = false;
    this.addEvent($z1Appcfg.BaseEventName.ShowTransition, this.onShowTransition);
  };
  _ctor.prototype.onBlockTouch = function (t) {
    this.node._touchListener.setSwallowTouches(!t);
  };
  _ctor.prototype.onShowTransition = function (t, e) {
    var n = this;
    this.ndMask.active = true;
    var i = this.ndMask.getComponent(cc.Mask).spriteFrame.getOriginalSize();
    this.onBlockTouch(false);
    var a = 2 * Math.max(cc.winSize.height, cc.winSize.width) / Math.min(i.height, i.width);
    if (t) {
      this.ndMask.setContentSize(i.width * a, i.height * a);
      cc.tween(this.ndMask).to(1, {
        width: 0,
        height: 0
      }).call(function () {
        e && e();
      }).start();
    } else {
      cc.tween(this.ndMask).set({
        width: 0,
        height: 0
      }).to(1, {
        width: i.width * a,
        height: i.height * a
      }).call(function () {
        n.ndMask.active = false;
        e && e();
        n.onBlockTouch(true);
      }).start();
    }
  };
  _ctor.prototype.onAdStart = function (t) {
    this.ndAd.active = t;
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "touchNode", undefined);
  cc__decorate([ccp_property({
    displayName: "是否需要点击特效"
  })], _ctor.prototype, "needEffect", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndMask", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndAd", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_UITouch;