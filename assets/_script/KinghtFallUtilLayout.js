var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallUtilLayout = undefined;
var r;
var s;
var l;
var c;
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var ccp_disallowMultiple = cc__decorator.disallowMultiple;
var ccp_menu = cc__decorator.menu;
cc__decorator.executionOrder;
var ccp_requireComponent = cc__decorator.requireComponent;
(function (t) {
  t[t.LEFT = 1] = "LEFT";
  t[t.CENTER = 2] = "CENTER";
  t[t.RIGHT = 3] = "RIGHT";
})(r || (r = {}));
(function (t) {
  t[t.Top = 1] = "Top";
  t[t.CENTER = 2] = "CENTER";
  t[t.BOTTOM = 3] = "BOTTOM";
})(s || (s = {}));
(function (t) {
  t[t.Row = 1] = "Row";
  t[t.Col = 2] = "Col";
})(l || (l = {}));
(function (t) {
  t[t.NODE = 1] = "NODE";
  t[t.Size = 2] = "Size";
})(c || (c = {}));
var exp_KinghtFallUtilLayout = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.horizontalDirection = l.Row;
    e.alignRowType = r.CENTER;
    e.alignColType = s.CENTER;
    e.templateType = c.NODE;
    e.tmpNode = null;
    e.ndSize = new cc.Size(109, 111);
    e.maxCol = 0;
    e.selectedEvent = new cc.Component.EventHandler();
    e.ctrLayout = null;
    e.itemPosArr = [];
    e.nodeList = [];
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    this.ctrLayout = this.node.getComponent(cc.Layout);
    this.ctrLayout.enabled = false;
  };
  _ctor.prototype.init = function (t) {
    if (!this.ctrLayout) {
      this.ctrLayout = this.node.getComponent(cc.Layout);
      this.ctrLayout.enabled = false;
    }
    this.layLen = t;
    switch (this.horizontalDirection) {
      case l.Row:
        this.initDataRow();
        break;
      case l.Col:
        this.initDataCol();
    }
    this.templateType == c.NODE && this.initLayout();
  };
  _ctor.prototype.initDataRow = function () {
    var t;
    var e;
    var n;
    this.itemPosArr = [];
    t = this.templateType == c.NODE ? this.tmpNode.getContentSize() : this.ndSize;
    if (0 == this.maxCol) {
      e = 1;
      n = this.layLen;
    } else {
      e = Math.ceil(this.layLen / this.maxCol);
      n = this.layLen > this.maxCol ? this.maxCol : this.layLen;
    }
    this.node.setContentSize(t.width * n + (n - 1) * this.ctrLayout.spacingX + this.ctrLayout.paddingLeft + this.ctrLayout.paddingRight, t.height * e + (e - 1) * this.ctrLayout.spacingY + this.ctrLayout.paddingTop + this.ctrLayout.paddingBottom);
    var i = cc.v2(-this.node.width * this.node.anchorX, this.node.height * (1 - this.node.anchorY));
    var a = i.y - t.height / 2 - this.ctrLayout.paddingTop;
    var o = [];
    for (var s = 0; s < e; s++) {
      switch (this.ctrLayout.verticalDirection) {
        case cc.Layout.VerticalDirection.TOP_TO_BOTTOM:
          o.push(a - t.height * s - s * this.ctrLayout.spacingY);
          break;
        case cc.Layout.VerticalDirection.BOTTOM_TO_TOP:
          o.unshift(a - t.height * s - s * this.ctrLayout.spacingY);
      }
    }
    var l = this.layLen;
    for (var h = 0; h < e; h++) {
      var g = l > n ? n : l;
      var u = undefined;
      switch (this.alignRowType) {
        case r.LEFT:
          u = i.x + this.ctrLayout.paddingLeft + t.width / 2;
          break;
        case r.CENTER:
          var d = t.width * g + (g - 1) * this.ctrLayout.spacingX;
          u = i.x + this.ctrLayout.paddingLeft + (this.node.width - this.ctrLayout.paddingLeft - this.ctrLayout.paddingRight) / 2 - d / 2 + t.width / 2;
          break;
        case r.RIGHT:
          u = i.x + this.ctrLayout.paddingLeft + t.width / 2;
          u += (this.maxCol - g) * (t.width + this.ctrLayout.spacingX);
      }
      for (var p = 0; p < g; p++) {
        switch (this.ctrLayout.horizontalDirection) {
          case cc.Layout.HorizontalDirection.LEFT_TO_RIGHT:
            this.itemPosArr.push(cc.v2(u + t.width * p + p * this.ctrLayout.spacingX, o[h]));
            break;
          case cc.Layout.HorizontalDirection.RIGHT_TO_LEFT:
            this.itemPosArr.splice(h * n, 0, cc.v2(u + t.width * p + p * this.ctrLayout.spacingX, o[h]));
        }
      }
      l -= g;
    }
  };
  _ctor.prototype.initDataCol = function () {
    var t;
    var e;
    var n;
    this.itemPosArr = [];
    t = this.templateType == c.NODE ? this.tmpNode.getContentSize() : this.ndSize;
    if (0 == this.maxCol) {
      e = this.layLen;
      n = 1;
    } else {
      e = this.layLen > this.maxCol ? this.maxCol : this.layLen;
      n = Math.ceil(this.layLen / this.maxCol);
    }
    this.node.setContentSize(t.width * n + (n - 1) * this.ctrLayout.spacingX + this.ctrLayout.paddingLeft + this.ctrLayout.paddingRight, t.height * e + (e - 1) * this.ctrLayout.spacingY + this.ctrLayout.paddingTop + this.ctrLayout.paddingBottom);
    var i = cc.v2(-this.node.width * this.node.anchorX, this.node.height * (1 - this.node.anchorY));
    var a = i.x + t.width / 2 + this.ctrLayout.paddingLeft;
    var o = [];
    for (var r = 0; r < n; r++) {
      switch (this.ctrLayout.horizontalDirection) {
        case cc.Layout.HorizontalDirection.LEFT_TO_RIGHT:
          o.push(a + t.width * r + r * this.ctrLayout.spacingX);
          break;
        case cc.Layout.HorizontalDirection.RIGHT_TO_LEFT:
          o.unshift(a + t.width * r + r * this.ctrLayout.spacingX);
      }
    }
    var l = this.layLen;
    for (var h = 0; h < n; h++) {
      var g = l > e ? e : l;
      var u = undefined;
      switch (this.alignColType) {
        case s.Top:
          u = i.y - this.ctrLayout.paddingTop - t.width / 2;
          break;
        case s.CENTER:
          var d = t.height * g + (g - 1) * this.ctrLayout.spacingY;
          u = i.y - this.ctrLayout.paddingTop - (this.node.height - this.ctrLayout.paddingTop - this.ctrLayout.paddingBottom) / 2 + d / 2 - t.height / 2;
          break;
        case s.BOTTOM:
          u = i.y - this.ctrLayout.paddingTop - t.width / 2;
          u -= (this.maxCol - g) * (t.height + this.ctrLayout.spacingY);
      }
      for (var p = 0; p < g; p++) {
        switch (this.ctrLayout.verticalDirection) {
          case cc.Layout.VerticalDirection.TOP_TO_BOTTOM:
            this.itemPosArr.push(cc.v2(o[h], u - t.height * p - p * this.ctrLayout.spacingY));
            break;
          case cc.Layout.VerticalDirection.BOTTOM_TO_TOP:
            this.itemPosArr.splice(h * e, 0, cc.v2(o[h], u - t.height * p - p * this.ctrLayout.spacingY));
        }
      }
      l -= g;
    }
  };
  _ctor.prototype.initLayout = function () {
    var t = Math.max(this.nodeList.length, this.layLen);
    for (var e = 0; e < t; e++) {
      var n = this.getItem(e);
      var i = this.getPos(e);
      if (i) {
        if (!n) {
          (n = cc.instantiate(this.tmpNode)).setParent(this.node), this.nodeList.push(n);
        }
        n.active = true;
        n.setPosition(i);
        this.selectedEvent && cc.Component.EventHandler.emitEvents([this.selectedEvent], n, e);
      } else {
        n && (n.active = false);
      }
    }
  };
  _ctor.prototype.getItem = function (t) {
    if (!this.nodeList[t] || t < 0 || t >= this.layLen) {
      return null;
    } else {
      return this.nodeList[t];
    }
  };
  _ctor.prototype.getPos = function (t) {
    if (!this.itemPosArr[t] || t < 0 || t >= this.layLen) {
      return null;
    } else {
      return this.itemPosArr[t];
    }
  };
  cc__decorate([ccp_property({
    type: cc.Enum(l),
    // tooltip: false
  })], _ctor.prototype, "horizontalDirection", undefined);
  cc__decorate([ccp_property({
    type: cc.Enum(r),
    // tooltip: false,
    visible: function () {
      return this.horizontalDirection == l.Row;
    }
  })], _ctor.prototype, "alignRowType", undefined);
  cc__decorate([ccp_property({
    type: cc.Enum(s),
    // tooltip: false,
    visible: function () {
      return this.horizontalDirection == l.Col;
    }
  })], _ctor.prototype, "alignColType", undefined);
  cc__decorate([ccp_property({
    type: cc.Enum(c),
    // tooltip: false
  })], _ctor.prototype, "templateType", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    // tooltip: false,
    visible: function () {
      return this.templateType == c.NODE;
    }
  })], _ctor.prototype, "tmpNode", undefined);
  cc__decorate([ccp_property({
    type: cc.Size,
    // tooltip: false,
    visible: function () {
      return this.templateType == c.Size;
    }
  })], _ctor.prototype, "ndSize", undefined);
  cc__decorate([ccp_property({
    type: cc.Integer,
    // tooltip: false
  })], _ctor.prototype, "maxCol", undefined);
  cc__decorate([ccp_property({
    type: cc.Component.EventHandler,
    // tooltip: false,
    visible: function () {
      return this.templateType == c.NODE;
    }
  })], _ctor.prototype, "selectedEvent", undefined);
  return cc__decorate([ccp_ccclass, ccp_disallowMultiple(), ccp_menu("自定义组件KinghtFall/UtilLayout"), ccp_requireComponent(cc.Layout)], _ctor);
}(cc.Component);
exports.KinghtFallUtilLayout = exp_KinghtFallUtilLayout;