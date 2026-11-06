var i;
var a;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Direction = undefined;
(function (t) {
  t[t.Horizontal = 0] = "Horizontal";
  t[t.Vertical = 1] = "Vertical";
})(a = exports.Direction || (exports.Direction = {}));
cc.Enum(a);
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_ScrollCard = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.Direction = a.Horizontal;
    e.itemOffset = 0;
    e.speed = 500;
    e.rub = 1;
    e.scaleMin = .5;
    e.scaleMax = 1;
    e.item = [];
    e.itemSize = 5;
    e.itemNode = null;
    e._startTime = 0;
    e._moveSpeed = 0;
    e.uiTransform = null;
    e.itemList = [];
    e.canTouch = true;
    e.invert = 0;
    e.speedTime = 0;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    var t = this;
    this.uiTransform = this.node;
    this.node.on(cc.Node.EventType.TOUCH_START, function () {
      if (t.canTouch) {
        t._moveSpeed = 0;
        t._startTime = new Date().getTime();
      }
    });
    this.node.on(cc.Node.EventType.TOUCH_MOVE, function (e) {
      if (t.canTouch) {
        var n = e.getDelta();
        t.itemMoveBy(n);
      }
    });
    this.node.on(cc.Node.EventType.TOUCH_END, function (e) {
      t.canTouch && t.touchEnd(e);
    });
    this.node.on(cc.Node.EventType.TOUCH_CANCEL, function (e) {
      t.canTouch && t.touchEnd(e);
    });
  };
  _ctor.prototype.init = function () {
    for (var t = 0; t < this.itemSize; t++) {
      var e = cc.instantiate(this.itemNode);
      e.active = true;
      e.parent = this.node;
      this.item.push(e);
    }
    this._initItemPos();
    this.updateScale();
  };
  _ctor.prototype.autoScroll = function (t, e) {
    var n = this;
    this.canTouch = false;
    this.speedTime = t;
    this.offset = e;
    this.schedule(function () {
      n.invert += .01;
      if (n.invert >= n.speedTime) {
        n.invert = 0;
        n.scrollOffset(n.offset);
      }
    }, 0);
  };
  _ctor.prototype.changleScrollSpeed = function (t, e) {
    this.speedTime = t;
    this.offset = e;
  };
  _ctor.prototype.stopAutoScroll = function () {
    this.unscheduleAllCallbacks();
  };
  _ctor.prototype.scrollOffset = function (t) {
    this.itemMoveBy(t);
  };
  _ctor.prototype.touchEnd = function (t) {
    var e;
    var n = t.getLocation();
    var i = t.getStartLocation();
    e = 0 == this.Direction ? i.x - n.x : i.y - n.y;
    var a = new Date().getTime() - this._startTime;
    this._moveSpeed = e / a;
  };
  _ctor.prototype._initItemPos = function () {
    this.uiTransform.anchorY = .5;
    this.uiTransform.anchorX = .5;
    this._maxSize = new cc.Size(0, 0);
    for (var t = 0; t < this.item.length; t++) {
      this._maxSize.width += this.item[t].width;
      this._maxSize.height += this.item[t].height;
      this._maxSize.width += this.itemOffset;
      this._maxSize.height += this.itemOffset;
    }
    var e;
    e = 0 == this.Direction ? new cc.Vec2(-this._maxSize.width * this.uiTransform.anchorX, -this._maxSize.height * this.uiTransform.anchorY) : new cc.Vec2(this._maxSize.width * this.uiTransform.anchorX, this._maxSize.height * this.uiTransform.anchorY);
    this._screenRect = new cc.Rect(e.x, e.y, this._maxSize.width, this._maxSize.height);
    this.itemList = [];
    for (t = 0; t < this.item.length; t++) {
      var n = this.item[t].getAnchorPoint();
      var i = this.item[t].getContentSize();
      if (0 == this.Direction) {
        e = e.add(new cc.Vec2(i.width * n.x, i.height * n.y));
        this.item[t].position = new cc.Vec3(e.x, 0, 0);
        e = (e = e.add(new cc.Vec2(i.width * n.x, i.height * n.y))).add(new cc.Vec2(this.itemOffset, this.itemOffset));
      } else {
        e = e.subtract(new cc.Vec2(i.width * n.x, i.height * n.y));
        this.item[t].position = new cc.Vec3(0, e.y, 0);
        e = (e = e.subtract(new cc.Vec2(i.width * n.x, i.height * n.y))).subtract(new cc.Vec2(this.itemOffset, this.itemOffset));
      }
      this.itemList[t] = this.item[t];
    }
  };
  _ctor.prototype.updateScale = function () {
    if (!(this.scaleMax < this.scaleMin || 0 == this.scaleMax)) {
      for (var t = 0; t < this.item.length; t++) {
        var e;
        if (0 == this.Direction) {
          var n = this.item[t].position.x + this._maxSize.width / 2;
          e = this.item[t].position.x < 0 ? n / this._maxSize.width : 1 - n / this._maxSize.width;
        } else {
          var i = this.item[t].position.y + this._maxSize.height / 2;
          e = this.item[t].position.y < 0 ? i / this._maxSize.height : 1 - i / this._maxSize.height;
        }
        e *= 2;
        var a = this.scaleMax - this.scaleMin;
        a *= e;
        a += this.scaleMin;
        a = Math.abs(a);
        this.item[t].scale = a;
      }
    }
  };
  _ctor.prototype.itemMoveBy = function (t) {
    for (var e = 0; e < this.item.length; e++) {
      var n = this.item[e].position;
      if (0 == this.Direction) {
        var i = new cc.Vec3(n.x + t.x, n.y, 0);
        this.item[e].position = i;
      } else {
        i = new cc.Vec3(n.x, n.y + t.y, 0);
        this.item[e].position = i;
      }
    }
    this.updatePos();
  };
  _ctor.prototype.updatePos = function () {
    var t = this.itemList[0];
    var e = this.itemList[this.itemList.length - 1];
    var n = false;
    if (0 == this.Direction) {
      t.position.x < -this._maxSize.width / 2 && (n = true);
    } else {
      t.position.y > this._maxSize.width / 2 && (n = true);
    }
    if (n) {
      var i = this.itemList.shift();
      this.itemList.push(i);
      var a = i.position;
      if (0 == this.Direction) {
        var o = e.position.x + e.width + this.itemOffset;
        i.position = new cc.Vec3(o, a.y, 0);
      } else {
        var r = e.position.y - e.height - this.itemOffset;
        i.position = new cc.Vec3(a.x, r, 0);
      }
    }
    var s = false;
    if (0 == this.Direction) {
      e.position.x > this._maxSize.width / 2 && (s = true);
    } else {
      e.position.y < -this._maxSize.height / 2 && (s = true);
    }
    if (s) {
      i = this.itemList.pop();
      this.itemList.unshift(i);
      a = i.position;
      if (0 == this.Direction) {
        o = t.position.x - t.width - this.itemOffset, i.position = new cc.Vec3(o, a.y, 0);
      } else {
        r = t.position.y + t.height + this.itemOffset, i.position = new cc.Vec3(a.x, r, 0);
      }
    }
    this.updateScale();
  };
  _ctor.prototype.update = function (t) {
    if (0 != this._moveSpeed) {
      for (var e = 0; e < this.item.length; e++) {
        var n = this.item[e].position;
        if (0 == this.Direction) {
          var i = this._moveSpeed * t * this.speed;
          this.item[e].position = new cc.Vec3(n.x - i, n.y, 0);
        } else {
          var a = this._moveSpeed * t * this.speed;
          this.item[e].position = new cc.Vec3(n.x, n.y - a, 0);
        }
      }
      if (this._moveSpeed > 0) {
        this._moveSpeed -= t * this.rub;
        this._moveSpeed < 0 && (this._moveSpeed = 0);
      } else {
        this._moveSpeed += t * this.rub;
        this._moveSpeed > 0 && (this._moveSpeed = 0);
      }
      var o = -this._moveSpeed * t * this.speed;
      this.itemMoveBy(new cc.Vec2(o, o));
      this.updatePos();
    }
  };
  cc__decorate([ccp_property({
    type: a,
    tooltip: "滑动方向"
  })], _ctor.prototype, "Direction", undefined);
  cc__decorate([ccp_property({
    type: cc.Integer,
    tooltip: "node 间隔"
  })], _ctor.prototype, "itemOffset", undefined);
  cc__decorate([ccp_property({
    type: cc.Integer,
    tooltip: "移动速度"
  })], _ctor.prototype, "speed", undefined);
  cc__decorate([ccp_property({
    type: cc.Float,
    tooltip: "减速频率"
  })], _ctor.prototype, "rub", undefined);
  cc__decorate([ccp_property({
    type: cc.Float,
    tooltip: "缩放最小值"
  })], _ctor.prototype, "scaleMin", undefined);
  cc__decorate([ccp_property({
    type: cc.Float,
    tooltip: "缩放最大值"
  })], _ctor.prototype, "scaleMax", undefined);
  cc__decorate([ccp_property({
    type: [cc.Node],
    tooltip: "滚动item"
  })], _ctor.prototype, "item", undefined);
  cc__decorate([ccp_property({
    type: cc.Integer
  })], _ctor.prototype, "itemSize", undefined);
  cc__decorate([ccp_property({
    type: cc.Node
  })], _ctor.prototype, "itemNode", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_ScrollCard;