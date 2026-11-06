var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1GAD_Configs = require("GAD_Configs");
var $z1GADGameEnumData = require("GADGameEnumData");
var $z1GAD_DataMgr = require("GAD_DataMgr");
var $z1GAD_PlayerMgr = require("GAD_PlayerMgr");
var $z1GAD_Base = require("GAD_Base");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_GAD_Bullet = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.skeArrow = null;
    e._flyDis = 0;
    e._hideDis = 0;
    e._atkDamage = 0;
    e._cfg = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    this.skeArrow.setAnimation(0, this._cfg.resName, true);
    this.setRoleState($z1GAD_Configs.emGADRoleState.Move);
  };
  _ctor.prototype.getHitEffectName = function () {
    return this._cfg.arrowhit;
  };
  _ctor.prototype.init = function (t, e) {
    this.initTagID();
    this._atkDamage = e;
    this._roleType = $z1GAD_Configs.emGADRoleType.Bullet;
    this._cfg = t;
    this._moveSpeed = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.swordFlySpeed, 300);
    this._maxSpeed = this._moveSpeed;
    this._hideDis = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.swordFLlyDistance, 300);
    this._flyDis = 0;
  };
  _ctor.prototype.checkAutoDie = function () {
    return this._flyDis >= this._hideDis;
  };
  _ctor.prototype.update = function (t) {
    if (this.isUseful && $z1GAD_PlayerMgr.default.getInstance().getState() == $z1GAD_Configs.emGADGameState.Game) {
      t = Math.min(t, .02);
      this.node.y += this._moveSpeed * t;
      this._flyDis += this._moveSpeed * t;
    }
  };
  _ctor.prototype.onDie = function () {
    var t = this;
    this.setRoleState($z1GAD_Configs.emGADRoleState.Die);
    cc.tween(this.node).to(.1, {
      opacity: 0
    }).call(function () {
      t.node.destroy();
    }).start();
  };
  _ctor.prototype.removeFromScreen = function () {
    this.setRoleState($z1GAD_Configs.emGADRoleState.Die);
    this.node.destroy();
  };
  _ctor.prototype.getAtkDamage = function () {
    return this._atkDamage;
  };
  cc__decorate([ccp_property(sp.Skeleton)], _ctor.prototype, "skeArrow", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1GAD_Base.default);
exports.default = def_GAD_Bullet;