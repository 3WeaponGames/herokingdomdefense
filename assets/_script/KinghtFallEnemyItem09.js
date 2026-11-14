var BattleSounds = require("BattleSounds");
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
var $z1KinghtFallModle = require("KinghtFallModle");
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
    var ui = $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame, data = game && game.gameData;
    var owner = this, node = this.node, generation = node && node._combatGeneration, epoch = game && game._combatEpoch, timers = this.time, effects = ui && ui.ctrEffect;
    function current() {
      return game && data && cc.isValid(ui, true) && $z1KinghtFallUIGame.default.instance === ui && !ui.isclose && ui.ctrGame === game && cc.isValid(effects, true) && ui.ctrEffect === effects &&
        cc.isValid(game, true) && (!game.node || cc.isValid(game.node, true) && game.node.activeInHierarchy !== false) && game.gameData === data && game._combatEpoch === epoch && game.gameStatus === $z1KinghtFallModle.KinghtFallGameStage.Fight &&
        cc.isValid(owner, true) && owner.node === node && cc.isValid(node, true) && node.activeInHierarchy !== false && node._combatGeneration === generation && owner.time === timers && !owner.isDestroy && !owner._isPooled && !owner.isDead() && owner.hp > 0;
    }
    function recipient(record) {
      var target = record.enemy;
      return cc.isValid(target, true) && target.node === record.node && cc.isValid(record.node, true) && !target.isDestroy && !target._isPooled && !target.isDead() && target.hp > 0 && record.node._combatGeneration === record.generation;
    }
    if (!current()) return;
    var strength = this.cfg.Data[0], radius = this.cfg.Data[1], limit = this.cfg.Data[2];
    if (BattleSounds.attack) BattleSounds.attack(this, "enemy");
    if (!current()) return;
    this.time[r.Attack] = 0;
    var t = data.getEnemyList();
    this.node.getPosition(this.vec2_1);
    var e = [];
    for (var n = 0; n < t.length; n++) {
      var i = t[n];
      if (i && i.uuid != this.uuid && cc.isValid(i, true) && cc.isValid(i.node, true) && !i._isPooled && !i.isDead() && i.hp > 0) {
        i.node.getPosition(this.vec2_2);
        cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
        this.vec2_2.mag() < radius && e.push({
          len: this.vec2_2.mag(),
          enemy: i,
          node: i.node,
          generation: i.node._combatGeneration
        });
      }
    }
    if (!current()) return;
    effects.onMoveTrack(this.node.getPosition(), $z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier9Attack, $z1KinghtFallConfig.KinghtFallPoolName.Soldier9Attack);
    if (!current()) return;
    e.sort(function (t, e) {
      return t.len - e.len;
    });
    var a = function (t) {
      var n = e[t];
      if (!n || !current()) {
        return "break";
      }
      if (!recipient(n)) return;
      n.enemy.addHpPro(strength);
      if (!current()) return "break";
      if (!recipient(n)) return;
      effects.onBuff($z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier9Buff, $z1KinghtFallConfig.KinghtFallPoolName.Soldier9Buff, function (t) {
        var target = n.enemy, pool = $z1KinghtFallConfig.KinghtFallPoolName.Soldier9Buff;
        if (!current() || !recipient(n) || !cc.isValid(target.ndEffect, true)) {
          $z1PoolMgr.PoolMgr.getInstance().freeNode(pool, t);
          return;
        }
        var releases = target._healingEffects || (target._healingEffects = new Set());
        var e = t.getComponentInChildren(sp.Skeleton);
        function release() {
          if (!releases.delete(release)) return;
          if (cc.isValid(e, true)) e.setCompleteListener(null);
          if (cc.isValid(t, true)) $z1PoolMgr.PoolMgr.getInstance().freeNode(pool, t);
        }
        releases.add(release);
        t.setParent(n.enemy.ndEffect);
        t.setPosition(0, 0, 0);
        e.setCompleteListener(release);
        e.setAnimation(0, "attack", true);
      });
    };
    for (n = 0; n < limit && "break" !== a(n); n++) {
      ;
    }
    if (current()) this.tagUse = e.length > 0;
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
