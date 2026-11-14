var BattleSounds = require("BattleSounds");
var GameToolsOverrides = require("GameToolsOverrides");
var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var r;
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallBulletSoldier = require("KinghtFallBulletSoldier");
var $z1KinghtFallSoldierBase = require("KinghtFallSoldierBase");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallSoldierItem03 = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ctrArr = null;
    e.ndBulletPat = null;
    e.ndBullet = [];
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    t.prototype.start.call(this);
    this.ctrArr.node.active = false;
    this.ndBulletPat.active = false;
  };
  _ctor.prototype.doAttackStart = function () {
    if (GameToolsOverrides.isPending(this)) return;
    if (!this.captureAttackTarget()) return;
    this.state = $z1KinghtFallSoldierBase.KinghtFallSoldierStatus.Attack;
    this.spAni.setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Attack, false);
    this.time[r.Attack] = 0;
    GameToolsOverrides.attack(this, "ally", this.doAttack);
  };
  _ctor.prototype.doAttack = function () {
    if (BattleSounds.attack) BattleSounds.attack(this, "ally");
    var t = this;
    this.node.getPosition(this.vec2_1);
    var e = this.getAttack();
    var n = this.releaseAttackTarget();
    if (n) {
      n.node.getPosition(this.vec2_2);
      cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
      this.setLeft(this.vec2_2.x < 0);
      var i = $z1KinghtFallUIGame.default.instance.ctrGame.onShotSoldier(this);
      var sourceGeneration = this.node._combatGeneration;
      i.ctr.setParent(this);
      return void i.ctr.setTag(i.pos, n.node, function () {
        var i;
        if (cc.isValid(n) && cc.isValid(n.node)) {
          if (GameToolsOverrides.counters(t, n)) {
            var a = Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.RestrainedArms));
            e *= a;
          }
          n.onAttacked(e, t.node && t.node._combatGeneration === sourceGeneration ? t : null);
          $z1KinghtFallUIGame.default.instance.ctrEffect.showDamageNum(n.node.getPosition(), e);
          $z1KinghtFallUIGame.default.instance.ctrEffect.onMonsterAttack(n.node.getPosition(), "jian_lv1");
        }
      });
    }
  };
  _ctor.prototype.getAttWpos = function () {
    return this.node.convertToWorldSpaceAR(this.ctrArr.node.getPosition());
  };
  _ctor.prototype.getBullet = function () {
    return this.ndBullet.shift() || cc.instantiate(this.ctrArr.node);
  };
  _ctor.prototype.freeBullet = function (t) {
    t.node.active = false;
    t.node.setParent(this.ndBulletPat);
    this.ndBullet.push(t.node);
  };
  cc__decorate([ccp_property({
    type: $z1KinghtFallBulletSoldier.default,
    tooltip: "弓箭位置"
  })], _ctor.prototype, "ctrArr", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "弓箭回收位置"
  })], _ctor.prototype, "ndBulletPat", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallSoldierBase.default);
exports.default = def_KinghtFallSoldierItem03;
(function (t) {
  t.Attack = "Attack";
})(r || (r = {}));
