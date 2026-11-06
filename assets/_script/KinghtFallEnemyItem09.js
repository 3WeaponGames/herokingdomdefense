var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var r;
var $z1PoolMgr = require("PoolMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallEnemyAuxiliary = require("KinghtFallEnemyAuxiliary");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_KinghtFallEnemyItem09 = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.tagUse = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    t.prototype.start.call(this);
    $z1KinghtFallUIGame.default.instance.ctrEffect.loadEffect($z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier9Attack);
    $z1KinghtFallUIGame.default.instance.ctrEffect.loadEffect($z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier9Buff);
  };
  _ctor.prototype.initData = function (e, n) {
    t.prototype.initData.call(this, e, n);
    this.node.getComponent(cc.CircleCollider).radius = this.cfg.Data[1];
  };
  _ctor.prototype.doAttack = function () {
    this.time[r.Attack] = 0;
    var t = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getEnemyList();
    this.node.getPosition(this.vec2_1);
    var e = [];
    for (var n = 0; n < t.length; n++) {
      var i = t[n];
      if (i.uuid != this.uuid) {
        i.node.getPosition(this.vec2_2);
        cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
        this.vec2_2.mag() < this.cfg.Data[1] && e.push({
          len: this.vec2_2.mag(),
          enemy: i
        });
      }
    }
    $z1KinghtFallUIGame.default.instance.ctrEffect.onMoveTrack(this.node.getPosition(), $z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier9Attack, $z1KinghtFallConfig.KinghtFallPoolName.Soldier9Attack);
    e.sort(function (t, e) {
      return t.len - e.len;
    });
    var a = function (t) {
      var n = e[t];
      if (!n) {
        return "break";
      }
      n.enemy.addHpPro(o.cfg.Data[0]);
      $z1KinghtFallUIGame.default.instance.ctrEffect.onBuff($z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier9Buff, $z1KinghtFallConfig.KinghtFallPoolName.Soldier9Buff, function (t) {
        t.setParent(n.enemy.ndEffect);
        t.setPosition(0, 0, 0);
        var e = t.getComponentInChildren(sp.Skeleton);
        e.setCompleteListener(function () {
          $z1PoolMgr.PoolMgr.getInstance().freeNode($z1KinghtFallConfig.KinghtFallPoolName.Soldier9Buff, t);
          e.setCompleteListener(null);
        });
        e.setAnimation(0, "attack", true);
      });
    };
    var o = this;
    for (n = 0; n < this.cfg.Data[2] && "break" !== a(n); n++) {
      ;
    }
    this.tagUse = e.length > 0;
  };
  _ctor.prototype.doAttackFinish = function () {
    if (this.tagUse) {
      this.doIdel();
    } else {
      this.doMove();
    }
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallEnemyAuxiliary.default);
exports.default = def_KinghtFallEnemyItem09;
(function (t) {
  t.Attack = "Attack";
})(r || (r = {}));