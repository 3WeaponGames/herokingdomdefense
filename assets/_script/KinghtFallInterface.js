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
function releaseBuffEffect(record) {
  var node = record.node;record.node = null;
  if (!cc.isValid(node, true) || node._statusBuffOwner && node._statusBuffOwner !== record) return;
  if (node._statusBuffOwner === record) delete node._statusBuffOwner;
  $z1PoolMgr.PoolMgr.getInstance().freeNode($z1KinghtFallConfig.KinghtFallPoolName.Soldier10Buff, node);
}
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
    var actor = this, token = this._deathAnimation = {}, node = this.node, generation = node._combatGeneration;
    var ui = $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame, data = game && game.gameData, epoch = game && game._combatEpoch;
    function current() { return actor._deathAnimation === token && !actor._isPooled && actor.node === node && cc.isValid(actor, true) && cc.isValid(node, true) && node._combatGeneration === generation &&
      $z1KinghtFallUIGame.default.instance === ui && (!ui || cc.isValid(ui, true) && !ui.isclose && ui.ctrGame === game) && (!game || cc.isValid(game, true) && game.gameData === data && game._combatEpoch === epoch); }
    if (BattleSounds.death) BattleSounds.death(this);
    if (!current()) return;
    require("GameToolsOverrides").cancel(this);
    var fxRenderer=this.getSpAni?this.getSpAni():this.spAni,fxJson=fxRenderer&&fxRenderer.skeletonData&&fxRenderer.skeletonData.skeletonJson;
    if(fxJson&&fxJson._fantasy&&fxJson._fantasy.effects&&fxJson._fantasy.effects.ambientAnimation)require("FantasyEffects").reset(this);
    if (!current()) return;
    if (cc.resources) require("UnitHitFeedback").reset(this);
    if (!current()) return;
    if (this.rigidBody) { this.rigidBody.linearVelocity = cc.Vec2.ZERO; this.rigidBody.active = false; }
    if (this.hpctrl && this.hpctrl.node) this.hpctrl.node.active = false;
    var finish = function () {
      if (!current() || !actor.isDead()) return;
      actor._deathAnimation = null;
      done.call(actor);
    };
    var renderer = this.getSpAni ? this.getSpAni() : this.spAni;
    var name = renderer && renderer.findAnimation && ["die", "dead1", "death"].filter(function (name) { return !!renderer.findAnimation(name); })[0];
    if (name && renderer.setTrackCompleteListener) {
      var entry = renderer.setAnimation(0, name, false);
      if (!current() || !cc.isValid(renderer, true)) return;
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
    var n = this, node = this.node, generation = node && node._combatGeneration, buffs = this.debuffInfo;
    var ui = $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame, data = game && game.gameData, epoch = game && game._combatEpoch, stage = game && game.gameStatus, effects = ui && ui.ctrEffect;
    function current() {
      return cc.isValid(n, true) && !n.isDestroy && !n.isDestroyed && !n._isPooled && n.node === node && cc.isValid(node, true) && node.activeInHierarchy !== false && node._combatGeneration === generation && n.debuffInfo === buffs &&
        (!n.isDead || !n.isDead()) && !(typeof n.hp === "number" && n.hp <= 0) &&
        $z1KinghtFallUIGame.default.instance === ui && (!ui || cc.isValid(ui, true) && !ui.isclose && ui.ctrGame === game) &&
        (!game || cc.isValid(game, true) && (!game.node || cc.isValid(game.node, true)) && game.gameData === data && game._combatEpoch === epoch && game.gameStatus === stage);
    }
    if (!current()) return;
    var i = new exp_KinghtFallEnemyBuffInfo(t, e);
    if (BattleSounds.effect && t === p.MoveSpeed && e.subNum > 0) BattleSounds.effect("slow-apply", this);
    if (BattleSounds.effect && t === p.DamageCut) BattleSounds.effect("debuff-apply", this);
    if (!current()) return;
    // Pool hits may complete synchronously, so register ownership first.
    this.debuffInfo.push(i);
    switch (t) {
      case p.AttackSpeed:
        this.body && (this.body.color = new cc.Color().fromHEX("#FF7676"));
        break;
      case p.DamageCut:
        if (!current() || !cc.isValid(effects, true) || ui.ctrEffect !== effects) break;
        effects.onBuff($z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier10Buff, $z1KinghtFallConfig.KinghtFallPoolName.Soldier10Buff, function (t) {
          if (!current() || !cc.isValid(effects, true) || ui.ctrEffect !== effects || !cc.isValid(n.ndEffect, true) || buffs.indexOf(i) < 0) {
            $z1PoolMgr.PoolMgr.getInstance().freeNode($z1KinghtFallConfig.KinghtFallPoolName.Soldier10Buff, t);
            return;
          }
          i.node = t;
          t._statusBuffOwner = i;
          var parent = n.ndEffect;
          function attached() {
            if (i.node !== t || t._statusBuffOwner !== i) return false;
            if (!cc.isValid(t, true) || !current() || n.ndEffect !== parent || !cc.isValid(parent, true) || buffs.indexOf(i) < 0) { releaseBuffEffect(i); return false; }
            return true;
          }
          t.active = true;
          if (!attached()) return;
          t.setParent(parent);
          if (!attached()) return;
          t.setPosition(cc.Vec2.ZERO);
          if (!attached()) return;
          t.getComponentInChildren(sp.Skeleton).setAnimation(0, n.isBig ? "debuff_da" : "debuff_xiao", true);
        });
    }
  };
  _ctor.prototype.delBuff = function (t) {
    var buffs = this.debuffInfo, node = this.node, generation = node && node._combatGeneration;
    var records = buffs.filter(function (record) { return record.type == t; });
    for (var e = 0; e < records.length; e++) {
      if (this.debuffInfo !== buffs || this.node !== node || node && node._combatGeneration !== generation) return;
      var index = buffs.indexOf(records[e]);
      if (index >= 0) this.delBuffIdx(index);
    }
  };
  _ctor.prototype.delBuffIdx = function (t) {
    var buffs = this.debuffInfo, e = buffs[t];
    if (!e) return;
    buffs.splice(t, 1);
    switch (e.type) {
      case p.AttackSpeed:
        this.getBuffList(e.type).length === 0 && this.body && (this.body.color = cc.Color.WHITE);
        break;
      case p.DamageCut:
        releaseBuffEffect(e);
    }
  };
  _ctor.prototype.delAllBuff = function () {
    var owner = this, buffs = this.debuffInfo, next = [], node = this.node, generation = node && node._combatGeneration, body = this.body, effects = this.ndEffect;
    var children = effects && Array.isArray(effects.children) ? effects.children.slice() : null, healing = !!(this._healingEffects && this._healingEffects.size), owned = new Set(buffs.map(function (record) { return record.node; }));
    function current() { return cc.isValid(owner, true) && owner.node === node && cc.isValid(node, true) && node._combatGeneration === generation && owner.debuffInfo === next; }
    this.debuffInfo = next;
    this.releaseHealingEffects();
    if (current() && this.body === body && body && cc.isValid(body, true)) body.color = cc.Color.WHITE;
    for (var t = 0; t < buffs.length; t++) {
      var e = buffs[t];
      switch (e.type) {
        case p.AttackSpeed:
          break;
        case p.DamageCut:
          releaseBuffEffect(e);
      }
    }
    if (!current() || this.ndEffect !== effects || !cc.isValid(effects, true)) return;
    // Known status/healing nodes were returned above. Remove only old unowned
    // children; a pool callback may have attached replacement artwork already.
    if (children) children.forEach(function (child) {
      if (!healing && !(owner._healingEffects && owner._healingEffects.size) && !owned.has(child) && cc.isValid(child, true) && child.parent === effects && !child._statusBuffOwner) child.removeFromParent();
    });
    else if (!next.length && !(this._healingEffects && this._healingEffects.size)) effects.removeAllChildren();
  };
  _ctor.prototype.releaseHealingEffects = function () {
    if (this._healingEffects) Array.from(this._healingEffects).forEach(function (release) { release(); });
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
