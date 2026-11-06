var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var r;
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallEnemyMelee = require("KinghtFallEnemyMelee");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_KinghtFallEnemyItem07 = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.oldPos = cc.v2();
    e.moveTime = 40;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    t.prototype.start.call(this);
    $z1KinghtFallUIGame.default.instance.ctrEffect.loadEffect($z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier7Attack);
    $z1KinghtFallUIGame.default.instance.ctrEffect.loadEffect($z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier7Move);
  };
  _ctor.prototype.initData = function (e, n) {
    t.prototype.initData.call(this, e, n);
    this.node.getPosition(this.oldPos);
    this.time[r.Movetime] = this.moveTime;
  };
  _ctor.prototype.onUpdate = function (e) {
    if (!this.isDead()) {
      this.node.getPosition(this.vec2_1);
      cc.Vec2.subtract(this.vec2_2, this.vec2_1, this.oldPos);
      this.time[r.Movetime] += this.vec2_2.len();
      if (this.time[r.Movetime] >= this.moveTime) {
        this.time[r.Movetime] -= this.moveTime, $z1KinghtFallUIGame.default.instance.ctrEffect.onMoveTrack(this.vec2_1.clone(), $z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier7Move, $z1KinghtFallConfig.KinghtFallPoolName.Soldier7Move);
      }
      this.node.getPosition(this.oldPos);
      t.prototype.onUpdate.call(this, e);
    }
  };
  _ctor.prototype.doAttack = function () {
    var t = this;
    this.time[r.Attack] = 0;
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
              var p = d.tagNode.convertToWorldSpaceAR(cc.Vec2.ZERO);
              t.vec2_2 = $z1KinghtFallUIGame.default.instance.ctrGame.ndMain.convertToNodeSpaceAR(p);
              cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
              if (-1 == n || t.vec2_2.len() < n) {
                e = c;
                n = t.vec2_2.len();
              }
            }
          }
        }
      }
      return e;
    }();
    if (n) {
      n.node.getPosition(this.vec2_2);
      n.cfg && this.cfg.Suppressed == n.cfg.ID && (e *= Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.RestrainedArms)));
      $z1KinghtFallUIGame.default.instance.ctrEffect.showDamageNum(this.vec2_2.clone(), n.onAttacked(e));
      cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
      this.setLeft(this.vec2_2.x < 0);
      $z1KinghtFallUIGame.default.instance.ctrEffect.onAttack2(n.node.getPosition(), $z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier7Attack, $z1KinghtFallConfig.KinghtFallPoolName.Soldier7Attack, "xiao");
      return void this.doSplashDamage(n, 2);
    }
  };
  _ctor.prototype.doSplashDamage = function (t) {
    var e = this;
    var n = t.node.getPosition();
    var i = [];
    (function () {
      var a = $z1KinghtFallUIGame.default.instance.ctrGame.ctrPlay;
      if (!a.isDead()) {
        var o = cc.Vec2.distance(a.node.getPosition(), n);
        a.uuid != t.uuid && o <= e.cfg.Data[1] && i.push({
          len: o,
          item: a
        });
      }
    })();
    (function () {
      var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getSoldierList();
      for (var o = 0; o < a.length; o++) {
        var r = a[o];
        if (!r.isDead()) {
          var s = cc.Vec2.distance(r.node.getPosition(), n);
          r.uuid != t.uuid && s <= e.cfg.Data[1] && i.push({
            len: s,
            item: r
          });
        }
      }
    })();
    (function () {
      var a = {
        position: t.node.convertToWorldSpaceAR(cc.Vec2.ZERO),
        radius: e.cfg.Data[1]
      };
      var o = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getBulidList();
      for (var r = 0; r < o.length; r++) {
        var s = o[r];
        if (s.uuid != t.uuid && s.getIsWork()) {
          var l = s.getWposPhyCol();
          for (var c = 0; c < l.length; c++) {
            var g = l[c];
            if (cc.Intersection.polygonCircle(g, a)) {
              i.push({
                len: cc.Vec2.distance(s.node.getPosition(), n),
                item: s
              });
              break;
            }
          }
        }
      }
    })();
    i.sort(function (t, e) {
      return t.len - e.len;
    });
    var a = this.cfg.Data[0];
    for (var o = 0; o < this.cfg.Data[2]; o++) {
      var r = i[o];
      if (!r) {
        break;
      }
      r.item.node.getPosition(this.vec2_2);
      r.item.onAttacked(a);
      $z1KinghtFallUIGame.default.instance.ctrEffect.showDamageNum(this.vec2_2.clone(), a);
      $z1KinghtFallUIGame.default.instance.ctrEffect.onAttack(this.vec2_2.clone(), $z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier7Attack, $z1KinghtFallConfig.KinghtFallPoolName.Soldier7Attack);
    }
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallEnemyMelee.default);
exports.default = def_KinghtFallEnemyItem07;
(function (t) {
  t.Attack = "Attack";
  t.Movetime = "Movetime";
})(r || (r = {}));