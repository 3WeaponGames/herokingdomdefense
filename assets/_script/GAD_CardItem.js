var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1GAD_Configs = require("GAD_Configs");
var $z1GAD_Base = require("GAD_Base");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_GAD_CardItem = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndHead1 = null;
    e.addBuffAnimation = null;
    e._cfg = null;
    e._atkDamage = 0;
    e._lv = 1;
    e.OFF_Y = 30;
    e.SPEED = 500;
    e._isAni = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t) {
    this.initTagID();
    this._cfg = t;
    this.initView();
    this._lv = 1;
    this._atkDamage = this._cfg.basicATK;
    this.addEvent($z1GAD_Configs.emGADEventName.GAD_BuffAnimation, this.showBuffAnimation);
    this.updateLv();
  };
  _ctor.prototype.showBuffAnimation = function () {
    this.addBuffAnimation.setAnimation(0, "emission", false);
  };
  _ctor.prototype.hideView = function () {
    this.node.active = false;
  };
  _ctor.prototype.getCardCfg = function () {
    return this._cfg;
  };
  _ctor.prototype.initView = function () {};
  _ctor.prototype.refreshHpBar = function () {};
  _ctor.prototype.playAttack = function (t, e, n) {
    if (this.node.active && !this._isAni) {
      this._isAni = true;
      Math.max(.05, .1 * e);
    }
    this.sendEvent($z1GAD_Configs.emGADEventName.GAD_Shoot_Bullet, t, n || this.node.convertToWorldSpaceAR(cc.v2(0, .35 * this.node.height)), this);
  };
  _ctor.prototype.start = function () {};
  _ctor.prototype.updateLv = function () {};
  _ctor.prototype.addLev = function (t) {
    if (this._lv >= this._cfg.cardLevel) {
      return false;
    }
    this._lv += t;
    this._atkDamage += this._cfg.cardATK;
    this.updateLv();
  };
  _ctor.prototype.getAtkDamage = function (t) {
    var e = t + this._atkDamage;
    if (e < 0) {
      return 0;
    } else {
      return e;
    }
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndHead1", undefined);
  cc__decorate([ccp_property(sp.Skeleton)], _ctor.prototype, "addBuffAnimation", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1GAD_Base.default);
exports.default = def_GAD_CardItem;