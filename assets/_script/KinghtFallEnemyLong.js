var BattleSounds = require("BattleSounds");
var i;
var GameToolsOverrides = require("GameToolsOverrides");
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
var $z1KinghtFallBulletEnemy = require("KinghtFallBulletEnemy");
var $z1KinghtFallEnemyBase = require("KinghtFallEnemyBase");
var Navigation = require("KinghtFallNavigation");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallEnemyLong = function (t) {
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
    this.state = $z1KinghtFallEnemyBase.KinghtFallEnemyStatus.Attack;
    this.spAni.setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Attack, false);
    this.time[r.Attack] = 0;
    GameToolsOverrides.attack(this, "enemy", this.doAttack);
  };
  _ctor.prototype.doAttack = function () {
    if (BattleSounds.attack) BattleSounds.attack(this, "enemy");
    var t = this;
    this.node.getPosition(this.vec2_1);
    var e = this.getAttack();
    var n = function () {
      var e = null;
      var n = -1;
      var i = $z1KinghtFallUIGame.default.instance.ctrGame.ctrPlay;
      if (!i.isDead()) {
        i.node.getPosition(t.vec2_2);
        cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
        if (t.vec2_2.len() <= t.cfg.AttackRange) {
          e = i, n = t.vec2_2.len();
        }
      }
      var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getSoldierList();
      for (var o = 0; o < a.length; o++) {
        if (!(c = a[o]).isDead()) {
          c.node.getPosition(t.vec2_2);
          cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
          if (t.vec2_2.len() <= t.cfg.AttackRange && (-1 == n || t.vec2_2.len() < n)) {
            e = c, n = t.vec2_2.len();
          }
        }
      }
      var r = {
        position: t.node.convertToWorldSpaceAR(cc.Vec2.ZERO),
        radius: t.cfg.AttackRange
      };
      var s = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getBulidList();
      for (var l = 0; l < s.length; l++) {
        var c;
        if ((c = s[l]).getIsWork()) {
          var g = c.getWposPhyCol2();
          for (var u = 0; u < g.length; u++) {
            var d = g[u];
            if (cc.Intersection.polygonCircle(d.points, r)) {
              var targetDistance = Navigation.polygonDistance(t, d.points, $z1KinghtFallUIGame.default.instance.ctrGame);
              if (-1 == n || targetDistance < n) {
                e = c;
                n = targetDistance;
              }
            }
          }
        }
      }
      return e;
    }();
    if (n) {
      n.node.getPosition(this.vec2_2);
      cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
      this.setLeft(this.vec2_2.x < 0);
      var i = $z1KinghtFallUIGame.default.instance.ctrGame.onShotEnemy(this);
      i.ctr.setParent(this);
      var shooterGeneration = this.node._combatGeneration;
      return void i.ctr.setTag(i.pos, n.node, function () {
        if (cc.isValid(n) && cc.isValid(n.node)) {
          if (GameToolsOverrides.counters(t, n)) {
            var i = Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.RestrainedArms));
            e *= i;
          }
          var shooter = cc.isValid(t.node) && t.node._combatGeneration === shooterGeneration ? t : null;
          $z1KinghtFallUIGame.default.instance.ctrEffect.showDamageNum(n.node.getPosition(), n.onAttacked(e, shooter, true));
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
    type: $z1KinghtFallBulletEnemy.default,
    tooltip: "弓箭位置"
  })], _ctor.prototype, "ctrArr", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "弓箭回收位置"
  })], _ctor.prototype, "ndBulletPat", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallEnemyBase.default);
exports.default = def_KinghtFallEnemyLong;
(function (t) {
  t.Attack = "Attack";
})(r || (r = {}));
