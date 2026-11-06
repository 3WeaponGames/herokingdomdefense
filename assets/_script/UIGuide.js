var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GuildCfg = exports.DirPos = undefined;
var r;
var $z1BaseUI = require("BaseUI");
var $z1Appcfg = require("Appcfg");
var $z1EventMgr = require("EventMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
(function (t) {
  t[t.TopRight = 0] = "TopRight";
  t[t.TopLeft = 1] = "TopLeft";
  t[t.BottomLeft = 2] = "BottomLeft";
  t[t.BottomRight = 3] = "BottomRight";
})(r = exports.DirPos || (exports.DirPos = {}));
exports.GuildCfg = function () {
  this.clickType = 0;
  this.distNode = null;
  this.distCamera = null;
  this.tipstring = null;
  this.deviationTips = new cc.Vec2(0, 0);
  this.deviationTipsAll = null;
  this.showAni = false;
  this.dir = r.TopRight;
  this.isWeek = false;
  this.lightType = 0;
  this.showHand = 0;
  this.deviationHead = new cc.Vec2(0, 0);
  this.delay = .1;
  this.startNode = null;
  this.deviationStart = new cc.Vec2(0, 0);
  this.deviationEnd = new cc.Vec2(0, 0);
  this.endNode = null;
  this.moveTime = 1;
  this.hideMask = false;
  this.addSize = new cc.Size(0, 0);
  this.callBack = null;
  this.finishMoveEnd = false;
  $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.blocktouch, false);
};
var def_UIGuide = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.mask = null;
    e.hand = null;
    e.ndArr = null;
    e.tipBg = null;
    e.tipText = null;
    e.spAni = null;
    e.distNode = null;
    e.dirPos = r.TopRight;
    e.canClose = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t) {
    this.cfg = t;
  };
  _ctor.prototype.clickTouch = function (t) {
    var e;
    var n = this;
    this.hand.active = false;
    this.tipBg.active = false;
    this.cfg = t;
    t.dir && (this.dirPos = t.dir);
    this.distNode = t.distNode;
    if (t.distNode) {
      var i = this.distNode.convertToWorldSpaceAR(cc.Vec3.ZERO);
      t.distCamera && (i = t.distCamera.getWorldToScreenPoint(i));
      var a = this.mask.node.parent.convertToNodeSpaceAR(i);
      this.mask.node.setPosition(a);
      this.mask.node.setContentSize(900, 900);
      e = t.distNode.getContentSize();
    } else {
      e = new cc.Size(0, 0);
      this.mask.node.setPosition(cc.Vec3.ZERO);
      this.mask.node.setContentSize(0, 0);
    }
    this.mask.node.active = true;
    this.scheduleOnce(function () {
      if (0 == t.lightType) {
        n.mask.type = cc.Mask.Type.ELLIPSE;
      } else {
        n.mask.type = cc.Mask.Type.RECT;
      }
    }, .01);
    if (t.isWeek && t.hideMask) {
      this.mask.node.active = false;
      this.scheduleOnce(function () {
        n.canClose = true;
        $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.blocktouch, true);
      }, .1);
      this.showHand();
      this.showTip(t.tipstring);
    } else if (t.distNode) {
      cc.tween(this.mask.node).to(.7, {
        width: e.width + this.cfg.addSize.width,
        height: e.height + this.cfg.addSize.height
      }).call(function () {
        n.showHand();
        n.showTip(t.tipstring);
      }).delay(.1).call(function () {
        n.canClose = true;
        $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.blocktouch, true);
      }).start();
    } else {
      this.showHand();
      this.showTip(t.tipstring);
      $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.blocktouch, true);
      this.scheduleOnce(function () {
        n.canClose = true;
      }, .7);
    }
  };
  _ctor.prototype.moveTouch = function (t) {
    var e = this;
    if (t.startNode && t.endNode) {
      this.schedule(function () {
        if (e.cfg.finishMoveEnd) {
          e.unscheduleAllCallbacks();
          e.closeUI();
        }
      });
      if (t.hideMask) {
        this.mask.node.active = false;
      } else {
        this.mask.node.active = true;
      }
      var n = t.startNode.convertToWorldSpaceAR(t.deviationStart);
      var i = t.endNode.convertToWorldSpaceAR(t.deviationEnd);
      var a = this.hand.parent.convertToNodeSpaceAR(n);
      var o = this.hand.parent.convertToNodeSpaceAR(i);
      this.hand.setPosition(a);
      this.hand.active = true;
      this.moveTween = cc.tween(this.hand).set({
        position: cc.v3(a)
      }).to(t.moveTime, {
        position: new cc.Vec3(o.x, o.y)
      }).delay(.5).union().repeatForever();
      this.moveTween.start();
      if (t.hideMask) {
        this.showHand();
        this.showTip(t.tipstring);
      } else {
        var r;
        var s;
        var h;
        var g;
        if (0 == t.lightType) {
          this.mask.type = cc.Mask.Type.ELLIPSE;
        } else {
          this.mask.type = cc.Mask.Type.RECT;
        }
        r = Math.min(a.x - t.startNode.width / 2, o.x - t.endNode.width / 2);
        s = Math.max(a.x + t.startNode.width / 2, o.x + t.endNode.width / 2);
        h = Math.min(a.y - t.startNode.height / 2, o.y - t.endNode.height / 2);
        g = Math.max(a.y + t.startNode.height / 2, o.y + t.endNode.height / 2);
        var u = cc.v2((r + s) / 2, (h + g) / 2);
        this.mask.node.setPosition(u);
        var d = new cc.Size(Math.abs(s - r), Math.abs(g - h));
        cc.tween(this.mask.node).to(.7, {
          width: d.width + this.cfg.addSize.width,
          height: d.height + this.cfg.addSize.height
        }).call(function () {
          e.showHand();
          e.showTip(t.tipstring);
        }).delay(.1).call(function () {
          $z1EventMgr.EventMgr.getInstance().emit($z1Appcfg.BaseEventName.blocktouch, true);
        }).start();
      }
    } else {
      this.closeUI();
    }
  };
  _ctor.prototype.start = function () {
    var t = this;
    (!this.cfg.delay || this.cfg.delay < .1) && (this.cfg.delay = .1);
    this.scheduleOnce(function () {
      if (0 == t.cfg.clickType) {
        t.clickTouch(t.cfg);
      } else {
        t.moveTouch(t.cfg);
      }
    }, this.cfg.delay);
    this.node.on(cc.Node.EventType.TOUCH_START, function (e) {
      if (t.canClose) {
        if (t.cfg.isWeek || !t.mask.node.active) {
          if (t.cfg.callBack) {
            t.cfg.callBack();
          } else {
            t.node._touchListener.setSwallowTouches(false);
          }
          return void t.closeUI();
        }
        if ((t.distNode || t.cfg.startNode) && (0 != t.cfg.clickType ? t.cfg.startNode.getBoundingBoxToWorld() : t.distNode.getBoundingBoxToWorld()).contains(e.getLocation())) {
          if (t.cfg.callBack) {
            t.cfg.callBack();
          } else {
            t.node._touchListener.setSwallowTouches(false);
          }
          0 == t.cfg.clickType && t.closeUI();
        }
      }
    }, this);
    this.mask.node.getChildByName("bg").on(cc.Node.EventType.TOUCH_START, function (e) {
      if (t.canClose) {
        if (t.cfg.isWeek || !t.mask.node.active) {
          if (t.cfg.callBack) {
            t.cfg.callBack();
          } else {
            t.node._touchListener.setSwallowTouches(false);
          }
          return void t.closeUI();
        }
        if (t.distNode && t.distNode.getBoundingBoxToWorld().contains(e.getLocation())) {
          if (t.cfg.callBack) {
            t.cfg.callBack();
          } else {
            t.node._touchListener.setSwallowTouches(false);
          }
          t.closeUI();
        }
      }
    }, this);
  };
  _ctor.prototype.showHand = function () {
    var t = this.mask.node.getPosition();
    t.addSelf(this.cfg.deviationHead);
    switch (this.cfg.showHand) {
      case 1:
        this.hand.active = true;
        this.ndArr.active = false;
        this.hand.setPosition(t);
        break;
      case 2:
        this.hand.active = false;
        this.ndArr.active = true;
        this.ndArr.setPosition(t);
    }
  };
  _ctor.prototype.showTip = function (t) {
    if (t && t.length > 0) {
      this.tipBg.active = true;
      if (this.cfg.deviationTipsAll) {
        this.tipBg.setPosition(this.cfg.deviationTipsAll);
      } else {
        var e = this.mask.node.getPosition();
        e.addSelf(this.cfg.deviationTips);
        this.tipBg.setPosition(e);
      }
      this.tipText.string = t;
      if (this.cfg.showAni) {
        this.spAni.node.active = true;
        this.spAni.setAnimation(0, "speak", true);
        this.spAni.addAnimation(0, "idle", true, 2);
      } else {
        this.spAni.node.active = false;
      }
    } else {
      this.tipBg.active = false;
    }
  };
  _ctor.prototype.update = function () {};
  cc__decorate([ccp_property(cc.Mask)], _ctor.prototype, "mask", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "hand", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndArr", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "tipBg", undefined);
  cc__decorate([ccp_property(cc.RichText)], _ctor.prototype, "tipText", undefined);
  cc__decorate([ccp_property(sp.Skeleton)], _ctor.prototype, "spAni", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_UIGuide;