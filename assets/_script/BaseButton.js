var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.BaseButton = undefined;
var $z1AudioMgr = require("AudioMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var ccp_menu = cc__decorator.menu;
var exp_BaseButton = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.invertTime = 1;
    e.touched = false;
    e.touchmil = 0;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype._onTouchBegan = function (e) {
    if (this.interactable && this.enabledInHierarchy) {
      if (this.touched) {
        return this.node.pauseSystemEvents(true), void this._resetState();
      } else {
        return void t.prototype._onTouchBegan.call(this, e);
      }
    }
  };
  _ctor.prototype._onTouchEnded = function (e) {
    if (this.interactable && this.enabledInHierarchy) {
      if (this.touched) {
        this.node.pauseSystemEvents(true);
        return void this._resetState();
      }
      $z1AudioMgr.AudioMgr.getInstance().playAudioButtonClicked();
      this.touched = true;
      this.touchmil = 0;
      t.prototype._onTouchEnded.call(this, e);
    }
  };
  _ctor.prototype.update = function (e) {
    t.prototype.update.call(this, e);
    if (this.touched) {
      this.touchmil = this.touchmil + e;
      if (this.touchmil > this.invertTime) {
        this.touchmil = 0, this.touched = false, this.node.resumeSystemEvents(true);
      }
    }
  };
  _ctor.prototype.onDestroy = function () {
    this.touched = false;
  };
  _ctor.prototype.onDisable = function () {
    t.prototype.onDisable.call(this);
    this.touched = false;
  };
  _ctor.prototype.onEnable = function () {
    t.prototype.onEnable.call(this);
    this.touched = false;
  };
  cc__decorate([ccp_property], _ctor.prototype, "invertTime", undefined);
  return cc__decorate([ccp_ccclass, ccp_menu("自定义组件/BaseButton")], _ctor);
}(cc.Button);
exports.BaseButton = exp_BaseButton;
cc.Class.Attr.setClassAttr(exp_BaseButton, "normalColor", "visible", function () {
  return this.transition === cc.Button.Transition.COLOR;
});
cc.Class.Attr.setClassAttr(exp_BaseButton, "pressedColor", "visible", function () {
  return this.transition === cc.Button.Transition.COLOR;
});
cc.Class.Attr.setClassAttr(exp_BaseButton, "hoverColor", "visible", function () {
  return this.transition === cc.Button.Transition.COLOR;
});
cc.Class.Attr.setClassAttr(exp_BaseButton, "disabledColor", "visible", function () {
  return this.transition === cc.Button.Transition.COLOR;
});
cc.Class.Attr.setClassAttr(exp_BaseButton, "duration", "visible", function () {
  return this.transition === cc.Button.Transition.COLOR || this.transition === cc.Button.Transition.SPRITE || this.transition === cc.Button.Transition.SCALE;
});
cc.Class.Attr.setClassAttr(exp_BaseButton, "normalSprite", "visible", function () {
  return this.transition === cc.Button.Transition.SPRITE;
});
cc.Class.Attr.setClassAttr(exp_BaseButton, "pressedSprite", "visible", function () {
  return this.transition === cc.Button.Transition.SPRITE;
});
cc.Class.Attr.setClassAttr(exp_BaseButton, "hoverSprite", "visible", function () {
  return this.transition === cc.Button.Transition.SPRITE;
});
cc.Class.Attr.setClassAttr(exp_BaseButton, "disabledSprite", "visible", function () {
  return this.transition === cc.Button.Transition.SPRITE;
});
cc.Class.Attr.setClassAttr(exp_BaseButton, "zoomScale", "visible", function () {
  return this.transition === cc.Button.Transition.SCALE;
});
cc.Class.Attr.setClassAttr(exp_BaseButton, "normalMaterial", "visible", function () {
  return true === this.enableAutoGrayEffect;
});
cc.Class.Attr.setClassAttr(exp_BaseButton, "grayMaterial", "visible", function () {
  return true === this.enableAutoGrayEffect;
});