var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1EventMgr = require("EventMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallGameUICtrl = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndRod = null;
    e.ndConter = null;
    e.numRange = 100;
    e.ndAround = [];
    e.ndReview = null;
    e.ndCoin = null;
    e.ndLight = null;
    e.ndGuide = null;
    e.statePos = new cc.Vec2();
    e.moveFunc = null;
    e.touchID = false;
    e._joystickRestReady = false;
    e.vec2_1 = new cc.Vec2();
    e.guideTag = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    this.ndRod.getPosition(this.statePos);
    this._joystickRestReady = true;
    this.ndConter.setPosition(0, 0, 0);
    this.ndAround.forEach(function (t) {
      t.active = false;
    });
    this.ndReview.active = false;
    this.ndCoin.active = false;
    this.ndLight.active = false;
    this.ndGuide.active = false;
    this.node.on(cc.Node.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.on(cc.Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.on(cc.Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.on(cc.Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    $z1EventMgr.EventMgr.getInstance().on($z1KinghtFallConfig.KinghtFallEventName.PlayVideoSucc, this, this.onBlockTouch);
  };
  _ctor.prototype.setMoveFunc = function (t) {
    this.moveFunc = t;
  };
  _ctor.prototype.onTouchStart = function (t) {
    if (this.touchID !== false && this.touchID !== t.touch.getID()) return;
    this.touchID = t.touch.getID();
    var e = t.touch.getLocation();
    var n = this.node.convertToNodeSpaceAR(e);
    this.ndRod.setPosition(n);
    this.ndConter.setPosition(0, 0, 0);
    this.ndAround.forEach(function (t) {
      t.active = false;
    });
    $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.GamePause, false);
  };
  _ctor.prototype.onTouchMove = function (t) {
    if (this.touchID === t.touch.getID()) {
      cc.Vec2.subtract(this.vec2_1, t.touch.getLocation(), t.touch.getStartLocation());
      if (this.vec2_1.len() >= this.numRange) {
        cc.Vec2.normalize(this.vec2_1, this.vec2_1), cc.Vec2.multiplyScalar(this.vec2_1, this.vec2_1, this.numRange);
      }
      this.ndConter.setPosition(this.vec2_1);
      this.ndAround[0].active = this.vec2_1.x < 0 && this.vec2_1.y > 0;
      this.ndAround[1].active = this.vec2_1.x > 0 && this.vec2_1.y > 0;
      this.ndAround[2].active = this.vec2_1.x < 0 && this.vec2_1.y < 0;
      this.ndAround[3].active = this.vec2_1.x > 0 && this.vec2_1.y < 0;
      this.moveFunc && this.moveFunc(this.vec2_1.clone());
    }
  };
  _ctor.prototype.onTouchEnd = function (t) {
    if (!(t && this.touchID !== t.touch.getID())) {
      this._resetJoystick(!t);
    }
  };
  _ctor.prototype._resetJoystick = function (forceStop) {
    var hadTouch = this.touchID !== false;
    this.touchID = false;
    if (this._joystickRestReady) {
      this.ndRod.setPosition(this.statePos);
      this.ndConter.setPosition(0, 0, 0);
      this.ndAround.forEach(function (t) {
        t.active = false;
      });
    }
    if ((hadTouch || forceStop) && this.moveFunc) this.moveFunc(null);
  };
  _ctor.prototype.onDisable = function () {
    // A hidden/closed UI may never receive its final touch event.
    this._resetJoystick(false);
  };
  _ctor.prototype.setRevive = function (t) {
    if (t <= 0) {
      this.ndReview.active = false;
      $z1KinghtFallUIGame.default.instance.btnRevive.active = true;
      $z1KinghtFallUIGame.default.instance.btnReviveBreak.active = true;
    } else {
      this.ndReview.active = true;
      this.ndReview.getChildByName("labTime").getComponent(cc.Label).string = "" + Math.floor(t);
    }
  };
  _ctor.prototype.onBlockTouch = function () {
    this.onTouchEnd(null);
  };
  _ctor.prototype.onDestroy = function () {
    $z1EventMgr.EventMgr.getInstance().off($z1KinghtFallConfig.KinghtFallEventName.PlayVideoSucc, this, this.onBlockTouch);
  };
  _ctor.prototype.setGuide = function (t) {
    this.guideTag = t;
    this.ndGuide.active = !!t;
  };
  _ctor.prototype.upGuide = function () {
    if (this.guideTag) {
      var t = $z1KinghtFallUIGame.default.instance.ctrGame.ctrPlay.node.getPosition();
      this.ndGuide.setPosition(t);
      var e = this.guideTag.convertToWorldSpaceAR(cc.Vec3.ZERO);
      var n = $z1KinghtFallUIGame.default.instance.ctrGame.ndPath.convertToNodeSpaceAR(e);
      var i = cc.v2(n.x - t.x, n.y - t.y);
      if (i.mag() <= 40) {
        this.ndGuide.active = false;
      } else {
        this.ndGuide.active = true;
        var a = Math.atan2(i.y, i.x) * (180 / Math.PI);
        this.ndGuide.angle = a;
        this.ndGuide.width = i.mag() - 40;
        this.ndGuide.children[0].x = i.mag() - 40;
      }
    }
  };
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "杆子"
  })], _ctor.prototype, "ndRod", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "浮标"
  })], _ctor.prototype, "ndConter", undefined);
  cc__decorate([ccp_property({
    type: Number,
    tooltip: "浮标范围"
  })], _ctor.prototype, "numRange", undefined);
  cc__decorate([ccp_property({
    type: [cc.Node],
    tooltip: "杆子周围高光"
  })], _ctor.prototype, "ndAround", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "浮标"
  })], _ctor.prototype, "ndReview", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "货币信息"
  })], _ctor.prototype, "ndCoin", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "货币信息"
  })], _ctor.prototype, "ndLight", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "引导路径"
  })], _ctor.prototype, "ndGuide", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_KinghtFallGameUICtrl;
