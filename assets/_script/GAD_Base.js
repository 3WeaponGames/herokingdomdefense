var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseCtrl = require("BaseCtrl");
var $z1GAD_Configs = require("GAD_Configs");
var $z1GADGameEnumData = require("GADGameEnumData");
var $z1GAD_DataMgr = require("GAD_DataMgr");
var $z1GAD_PlayerMgr = require("GAD_PlayerMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_GAD_Base = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e._colliderGroups = [];
    e._groupID = 0;
    e._moveSpeed = 100;
    e._maxSpeed = 100;
    e._va = 0;
    e._state = $z1GAD_Configs.emGADRoleState.None;
    e._tagID = 0;
    e._colliderTags = [];
    return e;
  }
  cc__extends(_ctor, t);
  Object.defineProperty(_ctor.prototype, "isDie", {
    get: function () {
      return this._state == $z1GAD_Configs.emGADRoleState.Die;
    },
    enumerable: false,
    configurable: true
  });
  Object.defineProperty(_ctor.prototype, "isIdle", {
    get: function () {
      return this._state == $z1GAD_Configs.emGADRoleState.Idle;
    },
    enumerable: false,
    configurable: true
  });
  Object.defineProperty(_ctor.prototype, "isMove", {
    get: function () {
      return this._state == $z1GAD_Configs.emGADRoleState.Move;
    },
    enumerable: false,
    configurable: true
  });
  Object.defineProperty(_ctor.prototype, "isAttack", {
    get: function () {
      return this._state == $z1GAD_Configs.emGADRoleState.Attack;
    },
    enumerable: false,
    configurable: true
  });
  Object.defineProperty(_ctor.prototype, "isUseful", {
    get: function () {
      return this._state != $z1GAD_Configs.emGADRoleState.None && this._state != $z1GAD_Configs.emGADRoleState.Die;
    },
    enumerable: false,
    configurable: true
  });
  _ctor.prototype.initTagID = function () {
    this._tagID = $z1GAD_PlayerMgr.default.getInstance().getTagID();
  };
  _ctor.prototype.getGroupID = function () {
    return this._groupID;
  };
  _ctor.prototype.getTagID = function () {
    return this._tagID;
  };
  _ctor.prototype.setGroupID = function (t) {
    this._groupID = t;
  };
  _ctor.prototype.addColliderTagID = function (t) {
    this._colliderTags.push(t);
  };
  _ctor.prototype.hasColliderTagID = function (t) {
    return -1 != this._colliderTags.indexOf(t);
  };
  _ctor.prototype.addColliderGroupID = function (t) {
    this._colliderGroups.push(t);
  };
  _ctor.prototype.getRoleType = function () {
    return this._roleType;
  };
  _ctor.prototype.hasColliderGroupID = function (t) {
    return -1 != this._colliderGroups.indexOf(t);
  };
  _ctor.prototype.updatePos = function (t) {
    this.node.y -= t * this._moveSpeed;
    this.node.zIndex = 2e3 - this.node.y;
  };
  _ctor.prototype.changeSpeed = function () {
    var t = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.SpeedAdditionSegs, []);
    if (t && 0 != t.length) {
      var e = Math.abs(this.node.y - .5 * cc.winSize.height) / cc.winSize.height;
      for (var n = t.length - 1; n >= 0; n--) {
        if (e >= t[n][0]) {
          this._maxSpeed = t[n][1];
          this._va = t[n][2];
          break;
        }
      }
    }
  };
  _ctor.prototype.canRemoveScreen = function () {
    return this.node.y < .5 * -cc.winSize.height - this.node.height * this.node.scaleY - 20;
  };
  _ctor.prototype.getSize = function () {
    return this.node.getContentSize();
  };
  _ctor.prototype.getScaleSize = function () {
    var t = this.getSize();
    return cc.size(t.width * this.node.scaleX, t.height * this.node.scaleY);
  };
  _ctor.prototype.getWorldColldierRect = function (t, e) {
    undefined === t && (t = 0);
    undefined === e && (e = 0);
    var n = this.node.getAnchorPoint();
    var i = this.node.parent.convertToWorldSpaceAR(this.node.position);
    var a = (this.node.width + t) * this.node.scaleX;
    var o = (this.node.height + e) * this.node.scaleY;
    return cc.rect(i.x - n.x * a, i.y - n.y * o, a, o);
  };
  _ctor.prototype.getWorldColliderRectWithFixed = function (t, e) {
    var n = this.node.getAnchorPoint();
    var i = this.node.parent.convertToWorldSpaceAR(this.node.position);
    t = t || this.node.width * this.node.scaleX;
    e = e || this.node.height * this.node.scaleY;
    return cc.rect(i.x - n.x * t, i.y - n.y * e, t, e);
  };
  _ctor.prototype.setRoleState = function (t) {
    this._state = t;
  };
  _ctor.prototype.bulletHited = function () {
    return 0;
  };
  _ctor.prototype.removeFromScreen = function () {};
  _ctor.prototype.getWorldPos = function (t) {
    return this.node.convertToWorldSpaceAR(t);
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.default = def_GAD_Base;