var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var r;
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var ccp_disallowMultiple = cc__decorator.disallowMultiple;
var ccp_menu = cc__decorator.menu;
var ccp_executionOrder = cc__decorator.executionOrder;
(function (t) {
  t[t.NONE = 0] = "NONE";
  t[t.TOGGLE = 1] = "TOGGLE";
  t[t.SWITCH = 2] = "SWITCH";
})(r || (r = {}));
var def_ListItem = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.icon = null;
    e.title = null;
    e.selectedMode = r.NONE;
    e.selectedFlag = null;
    e.selectedSpriteFrame = null;
    e._unselectedSpriteFrame = null;
    e.adaptiveSize = false;
    e._selected = false;
    e._eventReg = false;
    return e;
  }
  cc__extends(_ctor, t);
  Object.defineProperty(_ctor.prototype, "selected", {
    get: function () {
      return this._selected;
    },
    set: function (t) {
      this._selected = t;
      if (this.selectedFlag) {
        switch (this.selectedMode) {
          case r.TOGGLE:
            this.selectedFlag.active = t;
            break;
          case r.SWITCH:
            var e = this.selectedFlag.getComponent(cc.Sprite);
            e && (e.spriteFrame = t ? this.selectedSpriteFrame : this._unselectedSpriteFrame);
        }
      }
    },
    enumerable: false,
    configurable: true
  });
  Object.defineProperty(_ctor.prototype, "btnCom", {
    get: function () {
      this._btnCom || (this._btnCom = this.node.getComponent(cc.Button));
      return this._btnCom;
    },
    enumerable: false,
    configurable: true
  });
  _ctor.prototype.onLoad = function () {
    if (this.selectedMode == r.SWITCH) {
      var t = this.selectedFlag.getComponent(cc.Sprite);
      this._unselectedSpriteFrame = t.spriteFrame;
    }
  };
  _ctor.prototype.onDestroy = function () {
    this.node.off(cc.Node.EventType.SIZE_CHANGED, this._onSizeChange, this);
  };
  _ctor.prototype._registerEvent = function () {
    if (!this._eventReg) {
      this.btnCom && this.list.selectedMode > 0 && this.btnCom.clickEvents.unshift(this.createEvt(this, "onClickThis"));
      this.adaptiveSize && this.node.on(cc.Node.EventType.SIZE_CHANGED, this._onSizeChange, this);
      this._eventReg = true;
    }
  };
  _ctor.prototype._onSizeChange = function () {
    this.list._onItemAdaptive(this.node);
  };
  _ctor.prototype.createEvt = function (t, e, n) {
    undefined === n && (n = null);
    if (t.isValid) {
      t.comName = t.comName || t.name.match(/\<(.*?)\>/g).pop().replace(/\<|>/g, "");
      var i = new cc.Component.EventHandler();
      i.target = n || t.node;
      i.component = t.comName;
      i.handler = e;
      return i;
    }
  };
  _ctor.prototype.showAni = function (t, e, n) {
    var i;
    var a = this;
    switch (t) {
      case 0:
        i = cc.tween(a.node).to(.2, {
          scale: .7
        }).by(.3, {
          y: 2 * a.node.height
        });
        break;
      case 1:
        i = cc.tween(a.node).to(.2, {
          scale: .7
        }).by(.3, {
          x: 2 * a.node.width
        });
        break;
      case 2:
        i = cc.tween(a.node).to(.2, {
          scale: .7
        }).by(.3, {
          y: -2 * a.node.height
        });
        break;
      case 3:
        i = cc.tween(a.node).to(.2, {
          scale: .7
        }).by(.3, {
          x: -2 * a.node.width
        });
        break;
      default:
        i = cc.tween(a.node).to(.3, {
          scale: .1
        });
    }
    (e || n) && i.call(function () {
      if (n) {
        a.list._delSingleItem(a.node);
        for (var t = a.list.displayData.length - 1; t >= 0; t--) {
          if (a.list.displayData[t].id == a.listId) {
            a.list.displayData.splice(t, 1);
            break;
          }
        }
      }
      e();
    });
    return i.start();
  };
  _ctor.prototype.onClickThis = function () {
    this.list.selectedId = this.listId;
  };
  cc__decorate([ccp_property({
    type: cc.Sprite,
    // tooltip: false
  })], _ctor.prototype, "icon", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    // tooltip: false
  })], _ctor.prototype, "title", undefined);
  cc__decorate([ccp_property({
    type: cc.Enum(r),
    // tooltip: false
  })], _ctor.prototype, "selectedMode", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    // tooltip: false,
    visible: function () {
      return this.selectedMode > r.NONE;
    }
  })], _ctor.prototype, "selectedFlag", undefined);
  cc__decorate([ccp_property({
    type: cc.SpriteFrame,
    // tooltip: false,
    visible: function () {
      return this.selectedMode == r.SWITCH;
    }
  })], _ctor.prototype, "selectedSpriteFrame", undefined);
  cc__decorate([ccp_property({
    // tooltip: false
  })], _ctor.prototype, "adaptiveSize", undefined);
  return cc__decorate([ccp_ccclass, ccp_disallowMultiple(), ccp_menu("自定义组件/List Item"), ccp_executionOrder(-5001)], _ctor);
}(cc.Component);
exports.default = def_ListItem;
