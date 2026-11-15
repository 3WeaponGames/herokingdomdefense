function millAttackTargets(data) { return data.getAttackableBuildList ? data.getAttackableBuildList() : data.getBulidList(); }
function skillScope(owner) {
  var ui = $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame, node = owner.node;
  return { ui: ui, game: game, data: game && game.gameData, effects: ui && ui.ctrEffect, hero: game && game.ctrPlay,
    epoch: game && game._combatEpoch, stage: game && game.gameStatus, node: node, generation: node && node._combatGeneration, timers: owner.time };
}
function skillCurrent(owner, scope, released) {
  return scope && scope.ui && scope.game && scope.data && cc.isValid(scope.ui, true) && cc.isValid(scope.effects, true) &&
    $z1KinghtFallUIGame.default.instance === scope.ui && !scope.ui.isclose && scope.ui.ctrGame === scope.game && scope.ui.ctrEffect === scope.effects && cc.isValid(scope.game, true) &&
    (!scope.game.node || cc.isValid(scope.game.node, true) && scope.game.node.activeInHierarchy !== false) &&
    scope.game.gameData === scope.data && scope.game.ctrPlay === scope.hero && scope.game._combatEpoch === scope.epoch && scope.game.gameStatus === scope.stage &&
    cc.isValid(owner, true) && owner.node === scope.node && cc.isValid(scope.node, true) && scope.node.activeInHierarchy !== false &&
    scope.node._combatGeneration === scope.generation && owner.time === scope.timers && !owner._isPooled && (released || !owner.isDead() && owner.hp > 0);
}
function skillTarget(actor) { return { item: actor, node: actor.node, generation: actor.node && actor.node._combatGeneration }; }
function targetCurrent(record, live) {
  var actor = record.item;
  return cc.isValid(actor, true) && actor.node === record.node && cc.isValid(record.node, true) && record.node._combatGeneration === record.generation && !actor._isPooled &&
    (!live || (!actor.isDead || !actor.isDead()) && !(typeof actor.hp === "number" && actor.hp <= 0) && (!actor.getIsWork || actor.getIsWork()));
}
function transformCurrent(owner, scope, transform) {
  return skillCurrent(owner, scope, false) && owner._transform === transform && owner.spAniUp === transform.renderer &&
    cc.isValid(transform.renderer, true) && cc.isValid(transform.renderer.node, true) && cc.isValid(transform.source, true) && cc.isValid(transform.source.node, true) &&
    (!("form" in transform) || cc.isValid(transform.form, true) && owner.getSpAni() === transform.form && cc.isValid(transform.form.node, true));
}
var BattleSounds = require("BattleSounds");
var i;
var GameToolsOverrides = require("GameToolsOverrides");
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var r;
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallInterface = require("KinghtFallInterface");
var $z1KinghtFallEnemyBase = require("KinghtFallEnemyBase");
var $z1KinghtFallEnemyMelee = require("KinghtFallEnemyMelee");
var Navigation = require("KinghtFallNavigation");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallEnemyItem10 = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.spAni2 = null;
    e.spAni3 = null;
    e.spAniUp = null;
    e.spIdx = 0;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    var e = this;
    t.prototype.onLoad.call(this);
    this.spAni2.setCompleteListener(function (t) {
      e._completeAttackAnimation(e.spAni2, t);
    });
    this.spAni3.setCompleteListener(function (t) {
      e._completeAttackAnimation(e.spAni3, t);
    });
  };
  _ctor.prototype.start = function () {
    t.prototype.start.call(this);
    $z1KinghtFallUIGame.default.instance.ctrEffect.loadEffect($z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier10Attack);
    $z1KinghtFallUIGame.default.instance.ctrEffect.loadEffect($z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier10Buff);
  };
  _ctor.prototype.doAttackStart = function () {
    t.prototype.doAttackStart.call(this);
  };
  _ctor.prototype.doAttack = function () {
    var scope = skillScope(this);
    if (!skillCurrent(this, scope, false)) return;
    if (BattleSounds.attack) BattleSounds.attack(this, "enemy");
    if (!skillCurrent(this, scope, false)) return;
    var t = this;
    this.time[r.Attack] = 0;
    this.node.getPosition(this.vec2_1);
    var e = this.getAttack();
    var n = function () {
      var forced = require("RelicCombat").tauntedTarget(t);
      if (forced) {
        forced.node.getPosition(t.vec2_2);
        cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
        return t.vec2_2.len() <= t.cfg.AttackRange ? forced : null;
      }
      var e = null;
      var n = -1;
      var i = scope.hero;
      if (!i.isDead()) {
        i.node.getPosition(t.vec2_2);
        cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
        if (t.vec2_2.len() <= t.cfg.AttackRange) {
          e = i, n = t.vec2_2.len();
        }
      }
      var a = scope.data.getSoldierList();
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
      var s = millAttackTargets(scope.data);
      for (var l = 0; l < s.length; l++) {
        var c;
        if ((c = s[l]).getIsWork()) {
          var h = Navigation.attackPartsOf(c);
          for (var u = 0; u < h.length; u++) {
            var d = h[u];
            if (cc.Intersection.polygonCircle(d.points, r)) {
              var targetDistance = Navigation.polygonDistance(t, d.points, scope.game);
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
      var victim = skillTarget(n);
      if (!skillCurrent(this, scope, false) || !targetCurrent(victim, true)) return;
      var impact = cc.v2(Navigation.attackPointOf(n,scope.game)), origin = this.vec2_1.clone(), form = this.cfg.BehaviorTemplate || this.cfg.ProfileBaseID || this.cfg.ID;
      GameToolsOverrides.counters(this, n) && (e *= Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.RestrainedArms)));
      var dealt = n.onAttacked(e, t);
      if (!skillCurrent(this, scope, true)) return;
      if (targetCurrent(victim, false)) scope.effects.showDamageNum(impact, dealt);
      if (!skillCurrent(this, scope, true)) return;
      switch (form) {
        case 90010:
          scope.effects.onMonsterAttack(impact, "xb_gj");
          break;
        case 90011:
          scope.effects.onMonsterAttack(impact, "bz2_zh");
          break;
        case 90012:
          scope.effects.onMonsterAttack(impact, "boss_gj");
      }
      if (skillCurrent(this, scope, true)) this.setLeft(impact.x - origin.x < 0);
    }
  };
  _ctor.prototype.initData = function (e, n) {
    this._transform = null;
    this._attackAnimation = null;
    this.spIdx = 0;
    this.spAni.node.active = true;
    this.spAni2.node.active = false;
    this.spAni3.node.active = false;
    this.spAniUp.node.active = false;
    t.prototype.initData.call(this, e, n);
    this.time[r.Spell] = 0;
    this.time[r.SpellMax] = this.cfg.Data[1];
    this.setBody(this.getSpAni().node);
  };
  _ctor.prototype.upData = function (t) {
    var scope = skillScope(this);
    if (!skillCurrent(this, scope, false)) return;
    var source = this.getSpAni(), transition = this.spAniUp;
    if (!cc.isValid(source, true) || !cc.isValid(source.node, true) || !cc.isValid(transition, true) || !cc.isValid(transition.node, true)) return;
    var boss = this, transform = this._transform = { source: source, renderer: transition };
    if (BattleSounds.effect) BattleSounds.effect("boss-transformation", this);
    if (!transformCurrent(this, scope, transform)) return;
    GameToolsOverrides.cancel(this);
    this._attackAnimation = null;
    this.state = $z1KinghtFallEnemyBase.KinghtFallEnemyStatus.Wait;
    this.rigidBody.linearVelocity = cc.Vec2.ZERO;
    source.node.active = false;
    this.spIdx++;
    transform.form = this.getSpAni();
    if (!transformCurrent(this, scope, transform)) return;
    this.setBody(transform.form.node);
    if (!transformCurrent(this, scope, transform)) return;
    transition.node.active = true;
    var entry = transition.setAnimation(0, transition.defaultAnimation, false);
    if (!transformCurrent(this, scope, transform)) return;
    this.cfg = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById(t);
    this.attack = Math.round(this.cfg.AttackDamage * scope.data.getAttAdd(this.cfg.ID));
    this.time = {};
    scope.timers = this.time;
    this.time[r.Attack] = 0;
    this.time[r.Spell] = 0;
    this.time[r.SpellMax] = this.cfg.Data[1];
    this.hpMax = this.cfg.Health * scope.data.getHpAdd(this.cfg.ID);
    this.hp = this.hpMax;
    this.hpctrl && this.hpctrl.setHp(this.hp, this.hpMax);
    if (!transformCurrent(this, scope, transform)) return;
    var e = this.node.getComponents(cc.CircleCollider);
    if (e[0]) {
      e[0].radius = this.cfg.AttackRange;
    } else {
      this.node.addComponent(cc.CircleCollider).radius = this.cfg.AttackRange;
    }
    if (e[1]) {
      e[1].radius = this.cfg.AttackRange + this.cfg.SearchRange;
    } else {
      this.node.addComponent(cc.CircleCollider).radius = this.cfg.AttackRange + this.cfg.SearchRange;
    }
    transition.setTrackCompleteListener(entry, function () {
      if (!transformCurrent(boss, scope, transform)) return;
      boss._transform = null;
      transition.node.active = false;
      transform.form.node.active = true;
      boss.doMove();
    });
  };
  _ctor.prototype.onUpdate = function (e) {
    if (!this.isDead()) {
      this.time[r.Spell] += e;
      if (this._hitReactionPlaying) { if (this.updateCombatTimers(e) === false) return; this.rigidBody.linearVelocity = cc.Vec2.ZERO; return; }
      // The transform owns this Wait state until its animation completes.
      // Ordinary enemies that reach the end of their route still reacquire targets.
      if (this._transform) {
        this.updateCombatTimers(e);
        return;
      }
      if (this.time[r.Spell] >= this.time[r.SpellMax]) {
        this.doBuff();
      } else {
        t.prototype.onUpdate.call(this, e);
      }
    }
  };
  _ctor.prototype.doBuff = function () {
    var scope = skillScope(this);
    if (!skillCurrent(this, scope, false)) return;
    if (1 == this.cfg.Data[0]) {
      this.upData(this.cfg.Data[2]);
    } else {
      var strength = this.cfg.Data[2], radius = this.cfg.Data[3], limit = this.cfg.Data[4], duration = this.cfg.Data[5];
      this.time[r.Spell] = 0;
      if (BattleSounds.effect) BattleSounds.effect("boss-special-cast", this);
      if (!skillCurrent(this, scope, false)) return;
      var t = [];
      this.node.getPosition(this.vec2_1);
      var e = scope.hero;
      if (e && targetCurrent(skillTarget(e), true)) {
        e.node.getPosition(this.vec2_2);
        (a = this.vec2_1.sub(this.vec2_2).mag()) <= radius && t.push({
          len: a,
          item: e, node: e.node, generation: e.node._combatGeneration
        });
      }
      var n = scope.data.getSoldierList();
      for (var i = 0; i < n.length; i++) {
        var a;
        if ((f = n[i]) && targetCurrent(skillTarget(f), true)) {
          f.node.getPosition(this.vec2_2);
          (a = this.vec2_1.sub(this.vec2_2).mag()) <= radius && t.push({
            len: a,
            item: f, node: f.node, generation: f.node._combatGeneration
          });
        }
      }
      var o = {
        position: this.node.convertToWorldSpaceAR(cc.Vec2.ZERO),
        radius: radius
      };
      var l = millAttackTargets(scope.data);
      for (i = 0; i < l.length; i++) {
        if ((f = l[i]) && targetCurrent(skillTarget(f), true)) {
          var c = f.getWposPhyCol();
          for (var h = 0; h < c.length; h++) {
            var d = c[h];
            if (cc.Intersection.polygonCircle(d, o)) {
              t.push({
                len: cc.Vec2.distance(f.node.getPosition(), this.vec2_1),
                item: f, node: f.node, generation: f.node._combatGeneration
              });
              break;
            }
          }
        }
      }
      if (!skillCurrent(this, scope, false)) return;
      scope.effects.onMoveTrack(this.node.getPosition(), $z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier10Attack, $z1KinghtFallConfig.KinghtFallPoolName.Soldier10Attack);
      if (!skillCurrent(this, scope, false)) return;
      t.sort(function (t, e) {
        return t.len - e.len;
      });
      for (var p = 0; p < limit; p++) {
        if (!skillCurrent(this, scope, false)) return;
        var f;
        if (!(f = t[p])) {
          break;
        }
        if (!targetCurrent(f, true)) continue;
        f.item.addBuff($z1KinghtFallInterface.KinghtFallEnemyBuffType.DamageCut, {
          subNum: strength,
          time: duration
        });
      }
    }
  };
  _ctor.prototype.setLeft = function (t) {
    this._visualLeft = !!t;
    GameToolsOverrides.applyModel(this, "enemy", this.getSpAni().node, t);
  };
  _ctor.prototype.doWait = function () {
    this.state = $z1KinghtFallEnemyBase.KinghtFallEnemyStatus.Wait;
    this.rigidBody.linearVelocity = cc.Vec2.ZERO;
    this.getSpAni().setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Idle, true);
  };
  _ctor.prototype.doIdel = function () {
    this.state = $z1KinghtFallEnemyBase.KinghtFallEnemyStatus.Idle;
    this.rigidBody.linearVelocity = cc.Vec2.ZERO;
    this.getSpAni().setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Idle, true);
  };
  _ctor.prototype.doMove = function () {
    this.state = $z1KinghtFallEnemyBase.KinghtFallEnemyStatus.Move;
    if (this.bornInfo.nodeIndex > this.bornInfo.pathList.length) {
      this.doWait();
    } else {
      this.getSpAni().setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Move, true);
    }
  };
  _ctor.prototype.setPause = function (t) {
    this.rigidBody.linearVelocity = cc.Vec2.ZERO;
    [this.spAni, this.spAni2, this.spAni3, this.spAniUp].forEach(function (skeleton) {
      if (skeleton) skeleton.paused = t;
    });
  };
  _ctor.prototype.getSpAni = function () {
    switch (this.spIdx) {
      case 0:
        return this.spAni;
      case 1:
        return this.spAni2;
      case 2:
        return this.spAni3;
    }
  };
  _ctor.prototype.playDeath = function (done) {
    this._transform = null;
    this.spAniUp.node.active = false;
    this.getSpAni().node.active = true;
    t.prototype.playDeath.call(this, done);
  };
  _ctor.prototype.onChangeSpeed = function () {
    var t = $z1KinghtFallUIGame.default.instance.speed;
    this.spAni.timeScale = t;
    this.spAni2.timeScale = t;
    this.spAni3.timeScale = t;
    this.spAniUp.timeScale = t;
  };
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "身体部分"
  })], _ctor.prototype, "spAni2", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "身体部分"
  })], _ctor.prototype, "spAni3", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "身体部分"
  })], _ctor.prototype, "spAniUp", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallEnemyMelee.default);
exports.default = def_KinghtFallEnemyItem10;
(function (t) {
  t.Attack = "Attack";
  t.Spell = "Spell";
  t.SpellMax = "SpellMax";
})(r || (r = {}));
