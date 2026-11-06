var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1AudioMgr = require("AudioMgr");
var $z1Utils = require("Utils");
var $z1GAD_Configs = require("GAD_Configs");
var $z1GADGameEnumData = require("GADGameEnumData");
var $z1GAD_DataMgr = require("GAD_DataMgr");
var $z1GAD_Base = require("GAD_Base");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_GAD_Door = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.text = null;
    e.door = null;
    e.ndLeft = null;
    e.ndRight = null;
    e.doorSp = [];
    e.poleSp = [];
    e._hitEffectValue = 0;
    e._maxWidth = 500;
    e._minWidth = 100;
    e._DoorEdge = 0;
    e._DoorSize = 300;
    e._coolTime = -1;
    e._targetWidth = 300;
    e._step = 0;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    this._roleType = $z1GAD_Configs.emGADRoleType.Door;
  };
  _ctor.prototype.getBufType = function () {
    return this._bufType;
  };
  _ctor.prototype.getValue = function () {
    return this._value;
  };
  _ctor.prototype.start = function () {
    this.setRoleState($z1GAD_Configs.emGADRoleState.Move);
  };
  _ctor.prototype.init = function (t, e) {
    this.initTagID();
    this._moveSpeed = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.moveSpeed);
    this._maxSpeed = this._moveSpeed;
    this._roleType = $z1GAD_Configs.emGADRoleType.Door;
    this._originPos = this.node.position.clone();
    this.setRoleState($z1GAD_Configs.emGADRoleState.Move);
    this._bufType = t;
    this._initBuffCfg(e);
    this._targetWidth = 300;
    this._step = 0;
    this._minWidth = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.minimumWidth, 100);
    this._maxWidth = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.maxWidth, 500);
    if (this.node.x > 0) {
      this._DoorEdge = this.node.x + .5 * this._targetWidth;
    } else {
      this.node.x < 0 && (this._DoorEdge = this.node.x - .5 * this._targetWidth);
    }
  };
  _ctor.prototype.resetSize = function (t) {
    this._DoorSize = t;
    this._targetWidth = t;
    this._step = 0;
    this.node.width = t;
    this.door.node.width = this.node.width - 50;
    if (this.node.x > 0) {
      this._DoorEdge = this.node.x + .5 * this._targetWidth;
    } else {
      this.node.x < 0 && (this._DoorEdge = this.node.x - .5 * this._targetWidth);
    }
    this.ndLeft.x = .5 * -this.node.width + .5 * this.ndLeft.width;
    this.ndRight.x = .5 * this.node.width - .5 * this.ndRight.width;
  };
  _ctor.prototype._initBuffCfg = function (t) {
    var e;
    var n;
    var i;
    var a;
    var o;
    var r;
    this._value = t;
    this._cfg = $z1GAD_DataMgr.default.getInstance().getBuffTypeCfg(this._bufType);
    0 == this._hitEffectValue && (this._hitEffectValue = (null === (e = this._cfg) || undefined === e ? undefined : e.hitEffect) || 0);
    if (this._cfg) {
      this.text.node.color = "red" == (null === (n = this._cfg) || undefined === n ? undefined : n.color) ? cc.color().fromHEX("#ff5353") : cc.color().fromHEX("#ffffff");
      this.door.spriteFrame = this.doorSp["red" == (null === (i = this._cfg) || undefined === i ? undefined : i.color) ? 1 : 0];
      this.door.node.width = this._targetWidth - 50;
      this.ndLeft.getComponent(cc.Sprite).spriteFrame = this.poleSp["red" == (null === (a = this._cfg) || undefined === a ? undefined : a.color) ? 1 : 0];
      this.ndRight.getComponent(cc.Sprite).spriteFrame = this.poleSp["red" == (null === (o = this._cfg) || undefined === o ? undefined : o.color) ? 1 : 0];
      this.text.string = $z1Utils.Utils.StringFormat((null === (r = this._cfg) || undefined === r ? undefined : r.buffWord) || "", this.accurateNum(this._value, 1));
      this._bufType != $z1GADGameEnumData.enumGADBuffTypeCfg.HPsub && this._bufType != $z1GADGameEnumData.enumGADBuffTypeCfg.HPplus || console.log("this._value = " + this._value + ", v = " + this.accurateNum(this._value, 1));
    }
  };
  _ctor.prototype.accurateNum = function (t, e) {
    return t.toFixed(e) - 0;
  };
  _ctor.prototype.update = function (t) {
    this._coolTime -= t;
    0 != this._step && this.updateWidth(this._step);
  };
  _ctor.prototype.bulletHited = function (t) {
    if (this._coolTime > 0) {
      return $z1GAD_Configs.emGADHitState.NoHurt;
    }
    if (!this.isUseful || !this.node.active || this.hasColliderGroupID(t.getGroupID())) {
      return $z1GAD_Configs.emGADHitState.None;
    }
    $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1GAD_Configs.GAD_AudioId.strike);
    this._coolTime = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.IntervalTime, .1);
    this.addColliderTagID(t.getTagID());
    this.addColliderGroupID(t.getGroupID());
    if ([$z1GADGameEnumData.enumGADBuffTypeCfg.SpeedPlus, $z1GADGameEnumData.enumGADBuffTypeCfg.ATKplus, $z1GADGameEnumData.enumGADBuffTypeCfg.HPplus, $z1GADGameEnumData.enumGADBuffTypeCfg.memberPlus, $z1GADGameEnumData.enumGADBuffTypeCfg.levelPlus, $z1GADGameEnumData.enumGADBuffTypeCfg.speedMultiply, $z1GADGameEnumData.enumGADBuffTypeCfg.ATKMultiply].indexOf(this._bufType) >= 0) {
      this._value = this._value + this._hitEffectValue;
      if ($z1GADGameEnumData.enumGADBuffTypeCfg.memberPlus == this._bufType) {
        var e = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.bulletChange);
        this._value > e && (this._value = e);
      } else if (!($z1GADGameEnumData.enumGADBuffTypeCfg.speedMultiply != this._bufType && $z1GADGameEnumData.enumGADBuffTypeCfg.SpeedPlus != this._bufType)) {
        e = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.speedLimit);
        this._value > e && (this._value = e);
      }
    } else {
      this._value = this._value - this._hitEffectValue;
      switch (this._bufType) {
        case $z1GADGameEnumData.enumGADBuffTypeCfg.SpeedSub:
          if (this._value <= 0) {
            this._value = Math.abs(this._value);
            this._bufType = $z1GADGameEnumData.enumGADBuffTypeCfg.SpeedPlus;
          }
          break;
        case $z1GADGameEnumData.enumGADBuffTypeCfg.ATKsub:
          if (this._value <= 0) {
            this._value = Math.abs(this._value);
            this._bufType = $z1GADGameEnumData.enumGADBuffTypeCfg.ATKplus;
          }
          break;
        case $z1GADGameEnumData.enumGADBuffTypeCfg.HPsub:
          if (this._value <= 0) {
            this._value = Math.abs(this._value);
            this._bufType = $z1GADGameEnumData.enumGADBuffTypeCfg.HPplus;
          }
          break;
        case $z1GADGameEnumData.enumGADBuffTypeCfg.memberSub:
          if (this._value <= 0) {
            this._value = Math.abs(this._value);
            this._bufType = $z1GADGameEnumData.enumGADBuffTypeCfg.memberPlus;
          }
          break;
        case $z1GADGameEnumData.enumGADBuffTypeCfg.levelSub:
          if (this._value <= 0) {
            this._value = Math.abs(this._value);
            this._bufType = $z1GADGameEnumData.enumGADBuffTypeCfg.levelPlus;
          }
          break;
        case $z1GADGameEnumData.enumGADBuffTypeCfg.speedDivision:
          if (this._value <= 0) {
            this._value = this._hitEffectValue;
            this._value = Math.abs(this._value);
            this._bufType = $z1GADGameEnumData.enumGADBuffTypeCfg.speedMultiply;
          }
          break;
        case $z1GADGameEnumData.enumGADBuffTypeCfg.ATKDivision:
          if (this._value <= 0) {
            this._value = this._hitEffectValue;
            this._value = Math.abs(this._value);
            this._bufType = $z1GADGameEnumData.enumGADBuffTypeCfg.ATKMultiply;
          }
      }
    }
    this._initBuffCfg(this._value);
    return $z1GAD_Configs.emGADHitState.HitHurt;
  };
  _ctor.prototype.removeFromScreen = function () {
    this.node.destroy();
  };
  _ctor.prototype.onDie = function () {
    var t = this;
    this.node.stopAllActions();
    this.node.runAction(cc.sequence(cc.fadeOut(.2), cc.callFunc(function () {
      t.removeFromScreen();
    })));
  };
  _ctor.prototype.scaleWidth = function (t) {
    this._targetWidth += t;
    if (this._targetWidth > this._maxWidth) {
      this._targetWidth = this._maxWidth;
    } else {
      this._targetWidth < this._minWidth && (this._targetWidth = this._minWidth);
    }
    this._step = (this._targetWidth - this.node.width) / 10;
  };
  _ctor.prototype.getScaleWidth = function (t) {
    if (t > 0) {
      if (this._targetWidth >= this._maxWidth) {
        return 0;
      } else {
        return Math.min(t, this._maxWidth - this._targetWidth);
      }
    } else {
      if (t < 0) {
        if (this._targetWidth <= this._minWidth) {
          return 0;
        } else {
          return Math.max(Math.abs(t), this._targetWidth - this._minWidth);
        }
      } else {
        return 0;
      }
    }
  };
  _ctor.prototype.updateWidth = function (t) {
    var e = this.node.width;
    this.node.width += t;
    if (this._step < 0) {
      if (this.node.width <= this._targetWidth) {
        this.node.width = this._targetWidth, this._step = 0, t = -Math.abs(e - this._targetWidth);
      }
    } else if (this._step > 0 && this.node.width >= this._targetWidth) {
      this.node.width = this._targetWidth, this._step = 0, t = Math.abs(e - this._targetWidth);
    }
    this.ndLeft.x = .5 * -this.node.width + .5 * this.ndLeft.width;
    this.ndRight.x = .5 * this.node.width - .5 * this.ndRight.width;
    this.door.node.width = this.node.width - 50;
    if (this._DoorEdge < 0) {
      this.node.x = this._DoorEdge + .5 * this.node.width;
    } else {
      this._DoorEdge > 0 && (this.node.x = this._DoorEdge - .5 * this.node.width);
    }
  };
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "text", undefined);
  cc__decorate([ccp_property(cc.Sprite)], _ctor.prototype, "door", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndLeft", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndRight", undefined);
  cc__decorate([ccp_property(cc.SpriteFrame)], _ctor.prototype, "doorSp", undefined);
  cc__decorate([ccp_property(cc.SpriteFrame)], _ctor.prototype, "poleSp", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1GAD_Base.default);
exports.default = def_GAD_Door;