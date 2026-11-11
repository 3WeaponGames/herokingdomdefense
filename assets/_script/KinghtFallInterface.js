var BattleSounds = require("BattleSounds");
var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallEnemyBuffType = exports.KinghtFallEnemyBuffInfo = exports.KinghtFallInterface = undefined;
var $z1BaseCtrl = require("BaseCtrl");
var $z1PoolMgr = require("PoolMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var exp_KinghtFallInterface = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndEffect = null;
    e.debuffInfo = [];
    e.isBig = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.setBody = function (t) {
    this.body = t;
    if (this.spAni && cc.resources) require("CharacterAppearance").bind(this, this.navigationTeam === "friendly" ? "ally" : "enemy");
  };
  _ctor.prototype.playDeath = function (done) {
    var actor = this, token = this._deathAnimation = {}, generation = this.node._combatGeneration;
    if (BattleSounds.death) BattleSounds.death(this);
    require("GameToolsOverrides").cancel(this);
    var fxRenderer=this.getSpAni?this.getSpAni():this.spAni,fxJson=fxRenderer&&fxRenderer.skeletonData&&fxRenderer.skeletonData.skeletonJson;
    if(fxJson&&fxJson._fantasy&&fxJson._fantasy.effects&&fxJson._fantasy.effects.ambientAnimation)require("FantasyEffects").reset(this);
    if (cc.resources) require("UnitHitFeedback").reset(this);
    if (this.rigidBody) { this.rigidBody.linearVelocity = cc.Vec2.ZERO; this.rigidBody.active = false; }
    if (this.hpctrl && this.hpctrl.node) this.hpctrl.node.active = false;
    var finish = function () {
      if (actor._deathAnimation !== token || actor._isPooled || !cc.isValid(actor, true) || !cc.isValid(actor.node, true) || actor.node._combatGeneration !== generation || !actor.isDead()) return;
      actor._deathAnimation = null;
      done.call(actor);
    };
    var renderer = this.getSpAni ? this.getSpAni() : this.spAni;
    var name = renderer && renderer.findAnimation && ["die", "dead1", "death"].filter(function (name) { return !!renderer.findAnimation(name); })[0];
    if (name && renderer.setTrackCompleteListener) {
      var entry = renderer.setAnimation(0, name, false);
      if (entry) {
        var completionQueued = false;
        renderer.setTrackCompleteListener(entry, function () {
          if (completionQueued) return;
          // Deactivating an ally restores its prefab rig. JSB destroys the old
          // AnimationState immediately, so its completion dispatch must return
          // before that restoration can replace the skeleton underneath it.
          if (typeof CC_JSB !== "undefined" && CC_JSB || cc.sys && cc.sys.isNative) {
            completionQueued = true;
            actor.scheduleOnce(finish, 0);
          } else finish();
        });
        return;
      }
    }
    finish();
  };
  _ctor.prototype.getBuff = function (t) {
    for (var e = 0; e < this.debuffInfo.length; e++) {
      var n = this.debuffInfo[e];
      if (n.type == t) {
        return n;
      }
    }
    return null;
  };
  _ctor.prototype.getBuffList = function (t) {
    var e = [];
    for (var n = 0; n < this.debuffInfo.length; n++) {
      var i = this.debuffInfo[n];
      i.type == t && e.push(i);
    }
    return e;
  };
  _ctor.prototype.addBuff = function (t, e) {
    var n = this;
    var i = new exp_KinghtFallEnemyBuffInfo(t, e);
    if (BattleSounds.effect && t === p.MoveSpeed && e.subNum > 0) BattleSounds.effect("slow-apply", this);
    if (BattleSounds.effect && t === p.DamageCut) BattleSounds.effect("debuff-apply", this);
    var generation = this.node && this.node._combatGeneration;
    // Pool hits may complete synchronously, so register ownership first.
    this.debuffInfo.push(i);
    switch (t) {
      case p.AttackSpeed:
        this.body && (this.body.color = new cc.Color().fromHEX("#FF7676"));
        break;
      case p.DamageCut:
        $z1KinghtFallUIGame.default.instance.ctrEffect.onBuff($z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier10Buff, $z1KinghtFallConfig.KinghtFallPoolName.Soldier10Buff, function (t) {
          if (!cc.isValid(n, true) || !cc.isValid(n.node, true) || !cc.isValid(n.ndEffect, true) || n._isPooled || n.node._combatGeneration !== generation || n.debuffInfo.indexOf(i) < 0) {
            $z1PoolMgr.PoolMgr.getInstance().freeNode($z1KinghtFallConfig.KinghtFallPoolName.Soldier10Buff, t);
            return;
          }
          t.active = true;
          i.node = t;
          t.setParent(n.ndEffect);
          t.setPosition(cc.Vec2.ZERO);
          t.getComponentInChildren(sp.Skeleton).setAnimation(0, n.isBig ? "debuff_da" : "debuff_xiao", true);
        });
    }
  };
  _ctor.prototype.delBuff = function (t) {
    for (var e = 0; e < this.debuffInfo.length; e++) {
      if (this.debuffInfo[e].type == t) {
        this.delBuffIdx(e);
        e--;
      }
    }
  };
  _ctor.prototype.delBuffIdx = function (t) {
    var e = this.debuffInfo[t];
    switch (e.type) {
      case p.AttackSpeed:
        this.getBuffList(e.type).length <= 1 && this.body && (this.body.color = cc.Color.WHITE);
        break;
      case p.DamageCut:
        e.node && $z1PoolMgr.PoolMgr.getInstance().freeNode($z1KinghtFallConfig.KinghtFallPoolName.Soldier10Buff, e.node);
    }
    this.debuffInfo.splice(t, 1);
  };
  _ctor.prototype.delAllBuff = function () {
    this.releaseHealingEffects();
    this.body && (this.body.color = cc.Color.WHITE);
    for (var t = 0; t < this.debuffInfo.length; t++) {
      var e = this.debuffInfo[t];
      switch (e.type) {
        case p.AttackSpeed:
          break;
        case p.DamageCut:
          e.node && $z1PoolMgr.PoolMgr.getInstance().freeNode($z1KinghtFallConfig.KinghtFallPoolName.Soldier10Buff, e.node);
      }
    }
    this.ndEffect.removeAllChildren();
    this.debuffInfo = [];
  };
  _ctor.prototype.releaseHealingEffects = function () {
    if (this._healingEffects) this._healingEffects.forEach(function (release) { release(); });
  };
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "特效节点"
  })], _ctor.prototype, "ndEffect", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.KinghtFallInterface = exp_KinghtFallInterface;
var p;
var exp_KinghtFallEnemyBuffInfo = function (t, e) {
  this.type = t;
  this.time = 0;
  this.data = e;
  this.timeMax = e.time;
};
exports.KinghtFallEnemyBuffInfo = exp_KinghtFallEnemyBuffInfo;
(function (t) {
  t[t.AttackSpeed = 0] = "AttackSpeed";
  t[t.DamageAdd = 1] = "DamageAdd";
  t[t.DamageCut = 2] = "DamageCut";
  t[t.MoveSpeed = 3] = "MoveSpeed";
  t[t.MoveSpeedAdd = 4] = "MoveSpeedAdd";
})(p = exports.KinghtFallEnemyBuffType || (exports.KinghtFallEnemyBuffType = {}));
