function timerCurrent(owner, node, generation, timers, game, data, epoch) {
  var ui = $z1KinghtFallUIGame.default.instance;
  return cc.isValid(owner, true) && owner.node === node && cc.isValid(node, true) && node._combatGeneration === generation && owner.time === timers && !owner._isPooled && !owner.isDead() &&
    (!game || cc.isValid(game, true) && game.gameData === data && game._combatEpoch === epoch && ui && cc.isValid(ui, true) && !ui.isclose && ui.ctrGame === game);
}
function incomingCurrent(owner, life, pooled) {
  return cc.isValid(owner, true) && owner.node === life.node && cc.isValid(life.node, true) && owner.cfg === life.cfg && owner.time === life.timers &&
    (life.node._combatGeneration === life.generation && !owner._isPooled || pooled && owner._isPooled && life.node._combatGeneration === (life.generation || 0) + 1) &&
    $z1KinghtFallUIGame.default.instance === life.ui && (!life.ui || cc.isValid(life.ui, true) && !life.ui.isclose && life.ui.ctrGame === life.game) &&
    (!life.game || cc.isValid(life.game, true) && life.game.gameData === life.data && life.game._combatEpoch === life.epoch && (!owner._combatGame || owner._combatGame === life.game));
}
// Setup runs on pooled/dead actors too; compare the captured lease, not alive state.
function setupLife(owner) {
  var ui = $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame;
  return { node: owner.node, generation: owner.node && owner.node._combatGeneration, cfg: owner.cfg, timers: owner.time, pooled: owner._isPooled,
    ui: ui, game: game, data: game && game.gameData, epoch: game && game._combatEpoch };
}
function setupCurrent(owner, life) {
  return cc.isValid(owner, true) && owner.node === life.node && cc.isValid(life.node, true) && life.node._combatGeneration === life.generation &&
    owner.cfg === life.cfg && owner.time === life.timers && owner._isPooled === life.pooled &&
    $z1KinghtFallUIGame.default.instance === life.ui && (!life.ui || cc.isValid(life.ui, true) && !life.ui.isclose && life.ui.ctrGame === life.game) &&
    (!life.game || cc.isValid(life.game, true) && life.game.gameData === life.data && life.game._combatEpoch === life.epoch);
}
function invalidateFormationFrame(game) {
  if (!game) return;
  if (game._armyFormation) game._armyFormation.frame = -1;
  if (game._followFormation) game._followFormation.frame = -1;
  if (game._rallyFormation) game._rallyFormation.frame = -1;
}
var BattleSounds = require("BattleSounds");
var i;
var GameToolsOverrides = require("GameToolsOverrides");
var UnitLevelStats = require("UnitLevelStats");
var AllyAwareness = require("AllyAwareness");
var cc__extends = __extends;
var cc__decorate = __decorate;
var cc__spreadArrays = __spreadArrays;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallSoldierStatus = undefined;
var s;
var l;
var $z1PoolMgr = require("PoolMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallItemHp = require("KinghtFallItemHp");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallGameCtrlData = require("KinghtFallGameCtrlData");
var $z1KinghtFallInterface = require("KinghtFallInterface");
var Navigation = require("KinghtFallNavigation");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallSoldierBase = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.spAni = null;
    e.ndHp = null;
    e.ndVideo = null;
    e.rigidBody = null;
    e.isVideo = false;
    e.time = {};
    e.vec2_1 = new cc.Vec2();
    e.vec2_2 = new cc.Vec2();
    e.finIndex = 0;
    e.lastFind = false;
    e.isAgg = false;
    e.navigationTeam = "friendly";
    e.rallyPoint = null;
    e._personalRallyPoint = null;
    e._followSelected = false;
    e._targetRefresh = 0;
    e._orderTarget = null;
    e._continuationTarget = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    var t = this;
    this.rigidBody = this.node.getComponent(cc.RigidBody);
    Navigation.enableTerrainContacts(this);
    this.spAni.setCompleteListener(function (e) {
      switch (e.animation.name) {
        case $z1KinghtFallModle.KinghtFallSoldierAniEnum.Attack:
          if (!t.isDead() && !t._isPooled) t.doAttackFinish();
      }
    });
  };
  _ctor.prototype.start = function () {
    this.setBody(this.spAni.node);
  };
  _ctor.prototype.onPreSolve = function (contact, self, other) {
    Navigation.allowBlockedExit(this, contact, other);
  };
  _ctor.prototype.setParent = function (t) {
    this.outBuild = t;
  };
  _ctor.prototype.initData = function (t, lease) {
    var life = setupLife(this);
    if (lease) lease.generation = life.generation;
    this.clearOpposingSkills();
    if (!setupCurrent(this, life)) return false;
    this._combatGame = life.game;
    this._combatData = life.data;
    AllyAwareness.invalidate($z1KinghtFallUIGame.default.instance.ctrGame);
    this._relicSoldier = true;
    this._attackIntent = null;
    if (cc.resources) { require("UnitHitFeedback").reset(this); if (!setupCurrent(this, life)) return false; }
    GameToolsOverrides.cancel(this);
    var e = this;
    this.node._combatGeneration = (this.node._combatGeneration || 0) + 1;
    life.generation = this.node._combatGeneration;
    if (lease) lease.generation = life.generation;
    invalidateFormationFrame(life.game);
    this.node._combatActor = this;
    this._isPooled = false; life.pooled = false;
    this._spawnPending = false;
    this._deathAnimation = null;
    Navigation.reset(this);
    this.rallyPoint = null;
    this._personalRallyPoint = null;
    this._rallyOrder = null;
    this._separateArmyCommands = false;
    this._followSelected = false;
    this._followPickupBlocked = false;
    this._syncFollowMarker();
    if (!setupCurrent(this, life)) return false;
    this.pathList = null;
    this.isAgg = false;
    this._orderTarget = null;
    this._continuationTarget = null;
    this._attackIntent = null;
    this._targetRefresh = 0;
    this._settledPoint = null;
    this._standingGoal = null;
    this._retaliationTarget = null;
    this._retaliationTime = 0;
    this._retaliationPosition = null;
    this._retaliationScope = null;
    this.cfg = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById(t, "ally");
    if (this.cfg.UnitAttack) this.cfg = require("UnitAttackRules").runtimeCfg(this.cfg);
    life.cfg = this.cfg;
    this._unitBaseCfg = this.cfg;
    if (this.spAni) this.setLeft(false);
    this.attackRange = this.cfg.AttackRange;
    var n = this.node.getComponents(cc.CircleCollider);
    if (n[0]) {
      n[0].radius = this.attackRange;
    } else {
      this.node.addComponent(cc.CircleCollider).radius = this.attackRange;
    }
    if (n[1]) {
      n[1].radius = this.getAcquireRange();
    } else {
      this.node.addComponent(cc.CircleCollider).radius = this.getAcquireRange();
    }
    var i = 1;
    var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.talentAdd[$z1KinghtFallEnum.KinghtFallEnumTalentCfg.TalenType02];
    if (a) {
      for (var o = 0; o < a.length; o++) {
        i += a[o][0];
      }
    }
    this.attSpeed = this.cfg.AttackInterval * i;
    var r = 1;
    var s = 1;
    this.hpMax = this.cfg.Health * r;
    this.hp = this.hpMax;
    if (this.hpctrl) {
      this.hpctrl.setType($z1KinghtFallModle.KinghtFallGameArmy.Friend, this);
      if (!setupCurrent(this, life)) return false;
      this.hpctrl.setHp(this.hp, this.hpMax);
    } else if (!this._hpLoadPending) {
      this._hpLoadPending = true;
      this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Enemy, $z1KinghtFallConfig.KinghtFallPrefabName.ItemHp, function (t) {
        e._hpLoadPending = false;
        if (!cc.isValid(e, true) || !cc.isValid(e.node, true) || !cc.isValid(e.ndHp, true) || e.hpctrl) return;
        var n;
        (n = cc.instantiate(t)).setParent(e.ndHp);
        n.setPosition(0, 0, 0);
        e.hpctrl = n.getComponent($z1KinghtFallItemHp.default);
        e.hpctrl.setType($z1KinghtFallModle.KinghtFallGameArmy.Friend, e);
        e.hpctrl.setHp(e.hp, e.hpMax);
      });
    }
    if (!setupCurrent(this, life)) return false;
    this.attack = this.cfg.AttackDamage * s;
    this.time = {}; life.timers = this.time;
    this.time[l.Attack] = 0;
    this.node.getPosition(this.vec2_1);
    this.node.zIndex = Math.floor(cc.winSize.height) - Math.floor(this.vec2_1.y);
    this.doIdel();
    if (!setupCurrent(this, life)) return false;
    this.rigidBody.active = true;
    this.onChangeSpeed();
  };
  _ctor.prototype.onUpdate = function (t) {
    if (!this.isDead()) {
      this.node.getPosition(this.vec2_1);
      this.node.zIndex = Math.floor(cc.winSize.height) - Math.floor(this.vec2_1.y);
      for (var n = 0; n < this.debuffInfo.length; n++) {
        var i = this.debuffInfo[n];
        if (-1 != i.timeMax) {
          i.time += t;
          if (i.time >= i.timeMax) {
            var node = this.node, generation = node._combatGeneration, timers = this.time, game = $z1KinghtFallUIGame.default.instance.ctrGame, data = game.gameData, epoch = game._combatEpoch;
            this.delBuffIdx(n);
            if (!timerCurrent(this, node, generation, timers, game, data, epoch)) return;
            n--;
          }
        }
      }
      -1 != this.time[l.Attack] && (this.time[l.Attack] += t * this.getAttSpeed());
      if (this._hitReactionPlaying) { this.rigidBody.linearVelocity = cc.Vec2.ZERO; return; }
      if (this.state == s.Attack) return;
      var game = $z1KinghtFallUIGame.default.instance.ctrGame;
      var recovery = Navigation.recoverBlocked(this, game, t);
      if (recovery) {
        if (recovery.distance > 0) { if (this.state != s.Move) this.doMove(); }
        else if (this.state != s.Idle) this.doIdel();
        if (recovery.directionX) this.setLeft(recovery.directionX < 0);
        return;
      }
      var position = Navigation.positionOf(this.node, game);
      this._validateRetaliation(game);
      var transformed = !!this._opposingForm, target = transformed ? null : this._orderTarget;
      var continueCombat = !!target && this._continuationTarget === target;
      this._retaliationTime = Math.max(0, (this._retaliationTime || 0) - t);
      // Allow a slow unit or a gate detour to finish the response. The timeout
      // abandons stalled pursuit, rather than expiring while it makes progress.
      if (this._retaliationTime > 0 && target === this._retaliationTarget && this._retaliationPosition && cc.Vec2.distance(position, this._retaliationPosition) > .1) {
        this._retaliationTime = 3;
        this._retaliationPosition = position;
      }
      var searchRange = this.getAcquireRange();
      if (target && target === this._retaliationTarget && this._retaliationTime > 0) searchRange += target.attackRange || target.cfg && target.cfg.AttackRange || 0;
      var targetEnded = !!target && (!AllyAwareness.alive(target) || target.node._combatGeneration !== this._orderTargetGeneration);
      if (target && (targetEnded || cc.Vec2.distance(position, Navigation.positionOf(target.node, game)) > searchRange)) {
        // A defeated target ends the old engagement, not the response to nearby
        // enemies. Search from here before choosing any return-to-post movement.
        continueCombat = continueCombat || targetEnded;
        AllyAwareness.invalidate(game);
        target = this._orderTarget = null;
        this._continuationTarget = null;
        this._targetRefresh = 0;
      }
      // Combat can interrupt either order, but never consumes its destination.
      // Bound acquisition work instead of scanning every enemy every frame.
      this._targetRefresh -= t;
      if (!transformed && this._targetRefresh <= 0) {
        var found = this.getFind(continueCombat);
        target = this._orderTarget = found && found.tag;
        this._orderTargetGeneration = target && target.node._combatGeneration;
        this._continuationTarget = continueCombat && target || null;
        this._targetRefresh = .2;
      }
      if (target && this._continuationTarget !== target && this.isHoldingPosition() && this.rallyPoint && !(target === this._retaliationTarget && this._retaliationTime > 0 && target.node._combatGeneration === this._retaliationGeneration) &&
          cc.Vec2.distance(this.rallyPoint.pos, Navigation.positionOf(target.node, game)) > this.getAcquireRange()) { AllyAwareness.invalidate(game); target = this._orderTarget = null; }
      var goal = null, formation = null;
      if (target) {
        goal = Navigation.positionOf(target.node, game);
        this._settledPoint = null;
        this._standingGoal = null;
        this._armyProgressPoint = null;
        this._armyStalledTime = 0;
        if (cc.Vec2.distance(position, goal) <= this.attackRange) {
          if (this.time[l.Attack] >= 1) this.onFindList();
          else if (this.state != s.Idle) this.doIdel();
          return;
        }
      } else if (this.isAgg) {
        goal = Navigation.positionOf(game.ctrPlay.node, game);
        formation = game.getArmyOrderGoal && game.getArmyOrderGoal(this, goal);
        if (!formation && cc.Vec2.distance(position, goal) <= $z1KinghtFallConfig.KinghtFallParameter.FollowRange / 2 && Navigation.canStopFollowing(this, game, goal)) {
          if (this.state != s.Idle) this.doIdel();
          return;
        }
      } else if (this.rallyPoint) {
        goal = this.rallyPoint.pos;
        var recoveredPost = this._standingGoal && this._standingGoal.terrainRecovery && this._standingGoal.order === this.rallyPoint;
        if (recoveredPost) goal = this._standingGoal.pos;
        else formation = game.getArmyOrderGoal && game.getArmyOrderGoal(this, goal);
        if (!formation && this.isHoldingPosition()) {
          if (!this._standingGoal && cc.Vec2.distance(position, goal) <= 64) {
            var standing = Navigation.findStandingPoint(this, game, goal, goal);
            if (standing) this._standingGoal = { pos: standing };
          }
          if (this._standingGoal) goal = this._standingGoal.pos;
        }
        if (!formation && (this._settledPoint || recoveredPost) && cc.Vec2.distance(position, this._settledPoint || goal) <= 12 && Navigation.canStopFollowing(this, game, goal)) {
          if (this.state != s.Idle) this.doIdel();
          return;
        }
      } else if (this.pathList && this.pathList.pathInfoList[this.pathList.nodeIndex]) {
        goal = this.pathList.pathInfoList[this.pathList.nodeIndex].pos;
      }
      if (formation) {
        if (formation.pending) {
          if (this.state != s.Idle) this.doIdel();
          return;
        }
        goal = formation.pos;
        // Contact oscillation of a few pixels is not meaningful travel. A
        // normal walk clears this window quickly; a jostled crowd can rest.
        if (!this._armyProgressPoint || !this._armyProgressGoal || cc.Vec2.distance(this._armyProgressGoal, goal) > 1 || cc.Vec2.distance(position, this._armyProgressPoint) > 8) {
          this._armyProgressPoint = position;
          this._armyProgressGoal = { x: goal.x, y: goal.y };
          this._armyStalledTime = 0;
        } else this._armyStalledTime = (this._armyStalledTime || 0) + t;
        if (this.state == s.Move && cc.Vec2.distance(position, goal) > 4 && this._armyStalledTime >= .75 && game.settleArmyCrowd) {
          this._armyStalledTime = .5;
          if (game.settleArmyCrowd(this, position)) {
            this._settledPoint = position;
            this._armyStalledTime = 0;
            this.doIdel();
            return;
          }
        }
        // Solid army bodies need distinct destinations and room to rest after
        // tiny contact corrections. Do not demand an occupied exact endpoint.
        if (cc.Vec2.distance(position, goal) <= (this._settledPoint ? 12 : 4) && Navigation.canStopFollowing(this, game, goal)) {
          this._settledPoint = position;
          if (this.state != s.Idle) this.doIdel();
          return;
        }
        this._settledPoint = null;
      }
      if (!goal) {
        if (this.state != s.Idle) this.doIdel();
        return;
      }
      if (this.state != s.Move) this.doMove();
      var movement = Navigation.moveTo(this, game, goal, t);
      if (movement.directionX) this.setLeft(movement.directionX < 0);
      // A projected endpoint on the wrong side of a wall is not arrival.
      var nearRally = !target && this.rallyPoint && movement.arrived && cc.Vec2.distance(Navigation.positionOf(this.node, game), goal) <= 48 && Navigation.canStopFollowing(this, game, goal);
      if (!nearRally && !target && !this.isAgg && this.rallyPoint && movement.arrived && !movement.reached) {
        var projectedPost = Navigation.projectedStandingPoint(this, game, this.rallyPoint.pos);
        if (projectedPost) {
          this._standingGoal = { pos: projectedPost, terrainRecovery: true, order: this.rallyPoint };
          this.doIdel();
          return;
        }
      }
      if (!target && !this.isAgg && movement.arrived && (movement.reached || nearRally)) {
        if (this.rallyPoint) this._settledPoint = Navigation.positionOf(this.node, game);
        else if (this.pathList) {
          this.pathList.nodeIndex++;
          if (this.pathList.nodeIndex >= this.pathList.pathInfoList.length) this.pathList = null;
          else this.pathList.pathIndex = this.pathList.pathInfoList[this.pathList.nodeIndex].index;
        }
        this.doIdel();
      }
    }
  };
  _ctor.prototype.setLeft = function (t) {
    this._visualLeft = !!t;
    GameToolsOverrides.applyModel(this, "ally", this.spAni.node, t);
    if (this._opposingForm) require("EnemyPolymorph").pose(this);
  };
  _ctor.prototype.doWait = function () {
    this.state = s.Wait;
    this.rigidBody.linearVelocity = cc.Vec2.ZERO;
    this.spAni.setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Idle, true);
    if (this._opposingForm) require("EnemyPolymorph").pose(this, false);
  };
  _ctor.prototype.doIdel = function () {
    this.state = s.Idle;
    this.rigidBody.linearVelocity = cc.Vec2.ZERO;
    this.spAni.setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Idle, true);
    if (this._opposingForm) require("EnemyPolymorph").pose(this, false);
  };
  _ctor.prototype.doMove = function () {
    this.state = s.Move;
    this.spAni.setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Move, true);
    if (this._opposingForm) require("EnemyPolymorph").pose(this, true);
  };
  _ctor.prototype.isFind = function () {
    var t = this;
    return !!this.isAgg || (this.finIndex++, this.finIndex % 3 != 0 ? this.lastFind : (this.finIndex = 0, this.node.getPosition(this.vec2_1), !!function () {
      var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getEnemyList();
      for (var n = 0; n < e.length; n++) {
        var i = e[n];
        if (!i.isDead() && (i.node.getPosition(t.vec2_2), cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1), t.vec2_2.len() <= t.getAcquireRange())) {
          return true;
        }
      }
      return false;
    }()));
  };
  _ctor.prototype.getSightRange = function () {
    return AllyAwareness.sightFromConfig(this.cfg);
  };
  _ctor.prototype.getAcquireRange = function () {
    return Math.max(this.attackRange || 0, this.getSightRange());
  };
  _ctor.prototype.canAssist = function (game) {
    this._validateRetaliation(game);
    if (this.state === s.Attack || GameToolsOverrides.isPending(this)) return false;
    if (AllyAwareness.alive(this._orderTarget) && this._orderTarget.node._combatGeneration === this._orderTargetGeneration) return false;
    if (AllyAwareness.alive(this.tagEnemy)) return false;
    if (this._retaliationTime > 0 && AllyAwareness.alive(this._retaliationTarget) && this._retaliationTarget.node._combatGeneration === this._retaliationGeneration) return false;
    return true;
  };
  _ctor.prototype.assistAttacker = function (attacker, game) {
    this._continuationTarget = null;
    this._retaliationTarget = this._orderTarget = attacker;
    this._retaliationGeneration = this._orderTargetGeneration = attacker.node._combatGeneration;
    this._retaliationTime = 3;
    this._retaliationPosition = Navigation.positionOf(this.node, game);
    this._retaliationScope = { game: game, data: game.gameData, epoch: game._combatEpoch, owner: this.node._combatGeneration };
    this._targetRefresh = 0;
    this._settledPoint = null;
  };
  _ctor.prototype.getAttackTarget = function () {
    var game = $z1KinghtFallUIGame.default.instance.ctrGame, target = this._orderTarget;
    this._validateRetaliation(game);
    target = this._orderTarget;
    if (AllyAwareness.enemy(game, target, this._orderTargetGeneration)) return cc.Vec2.distance(Navigation.positionOf(this.node, game), Navigation.positionOf(target.node, game)) <= this.attackRange ? target : null;
    var found = this.getFind();
    return found && found.canAtt ? found.tag : null;
  };
  _ctor.prototype.captureAttackTarget = function () {
    if (this._opposingForm || !this.slowMultiplier($z1KinghtFallInterface.KinghtFallEnemyBuffType.AttackSlow)) return false;
    var game = $z1KinghtFallUIGame.default.instance.ctrGame, target = this.getAttackTarget();
    this._attackIntent = target ? { target: target, targetGeneration: target.node._combatGeneration, ownerGeneration: this.node._combatGeneration, game: game, data: game.gameData, epoch: game._combatEpoch } : null;
    return !!target;
  };
  _ctor.prototype.releaseAttackTarget = function () {
    var intent = this._attackIntent, game = $z1KinghtFallUIGame.default.instance.ctrGame;
    this._attackIntent = null;
    if (!intent || intent.game !== game || intent.data !== game.gameData || intent.epoch !== game._combatEpoch || intent.ownerGeneration !== this.node._combatGeneration || !AllyAwareness.enemy(game, intent.target, intent.targetGeneration)) return null;
    return cc.Vec2.distance(Navigation.positionOf(this.node, game), Navigation.positionOf(intent.target.node, game)) <= this.attackRange ? intent.target : null;
  };
  _ctor.prototype._validateRetaliation = function (game) {
    var scope = this._retaliationScope;
    if (scope && (scope.game !== game || scope.data !== game.gameData || scope.epoch !== game._combatEpoch || scope.owner !== this.node._combatGeneration)) {
      AllyAwareness.invalidate(game);
      if (this._orderTarget === this._retaliationTarget || this._orderTarget === this._continuationTarget) this._orderTarget = null;
      this._continuationTarget = null;
      this._retaliationTarget = null; this._retaliationTime = 0; this._retaliationScope = null;
    }
  };
  _ctor.prototype.getFind = function (continueCombat) {
    var game = $z1KinghtFallUIGame.default.instance.ctrGame;
    this._validateRetaliation(game);
    var attacker = this._retaliationTarget;
    if (this._retaliationTime > 0 && AllyAwareness.enemy(game, attacker, this._retaliationGeneration)) {
      attacker.node.getPosition(this.vec2_2);
      var retaliationDistance = cc.Vec2.distance(this.vec2_1, this.vec2_2);
      var attackerRange = attacker.attackRange || attacker.cfg && attacker.cfg.AttackRange || 0;
      if (retaliationDistance <= this.getAcquireRange() + attackerRange) return { tag: attacker, canAtt: retaliationDistance <= this.attackRange };
    }
    var t = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getEnemyList();
    var e = null;
    var n = -1;
    var scanRange = this.getAcquireRange();
    var retained = this._orderTarget;
    if (AllyAwareness.enemy(game, retained, this._orderTargetGeneration)) {
      var retainedDistance = cc.Vec2.distance(Navigation.positionOf(this.node, game), Navigation.positionOf(retained.node, game));
      if (retainedDistance <= scanRange) return { tag: retained, canAtt: retainedDistance <= this.attackRange };
    }
    var post = !continueCombat && this.isHoldingPosition() && this.rallyPoint && this.rallyPoint.pos;
    for (var i = 0; i < t.length; i++) {
      var a = t[i];
      if (AllyAwareness.alive(a)) {
        if (post && cc.Vec2.distance(post, Navigation.positionOf(a.node, game)) > scanRange) continue;
        a.node.getPosition(this.vec2_2);
        cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
        if (this.vec2_2.len() <= scanRange && (-1 == n || this.vec2_2.len() < n)) {
          e = a, n = this.vec2_2.len();
        }
      }
    }
    if (e) {
      return {
        tag: e,
        canAtt: n <= this.attackRange
      };
    } else {
      return null;
    }
  };
  _ctor.prototype.onFindList = function () {
    this.node.getPosition(this.vec2_1);
    var target = this.getAttackTarget();
    if (!target) return false;
    this._orderTarget = target;
    this._orderTargetGeneration = target.node._combatGeneration;
    this.doAttackStart();
    return true;
  };
  _ctor.prototype.doAttackStart = function () {
    if (GameToolsOverrides.isPending(this)) return;
    if (!this.captureAttackTarget()) return;
    var configured = this.cfg && this.cfg.UnitAttack && require("UnitAttackRules").active(this.cfg);
    this.state = s.Attack;
    this.spAni.setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Attack, false);
    this.time[l.Attack] = configured && configured.delivery === "ranged" ? 0 : -1;
    GameToolsOverrides.attack(this, "ally", configured ? require("UnitAttackCombat").releaseAlly : this.doAttack);
  };
  _ctor.prototype.doAttack = function () {
    if (this._opposingForm) return;
    var owner = this, ui = $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame, node = this.node, generation = node && node._combatGeneration, timers = this.time;
    if (!game || this._combatGame && this._combatGame !== game) return;
    var data = game.gameData, epoch = game._combatEpoch, stage = game.gameStatus, effects = ui.ctrEffect;
    function current(released) { return cc.isValid(owner, true) && owner.node === node && cc.isValid(node, true) && node.activeInHierarchy !== false && node._combatGeneration === generation && owner.time === timers && !owner._isPooled &&
      (released || !owner.isDead() && owner.hp > 0) && $z1KinghtFallUIGame.default.instance === ui && cc.isValid(ui, true) && !ui.isclose && ui.ctrGame === game && cc.isValid(game, true) &&
      (!game.node || cc.isValid(game.node, true) && game.node.activeInHierarchy !== false) && game.gameData === data && game._combatEpoch === epoch && game.gameStatus === stage; }
    if (!current()) return;
    if (BattleSounds.attack) BattleSounds.attack(this, "ally");
    if (!current()) return;
    var t = this;
    this.time[l.Attack] = 0;
    this.node.getPosition(this.vec2_1);
    var e = this.getAttack();
    if (!current()) return;
    var n = this.releaseAttackTarget();
    if (n) {
      var targetNode = n.node, targetGeneration = targetNode && targetNode._combatGeneration;
      n.node.getPosition(this.vec2_2);
      GameToolsOverrides.counters(this, n) && (e *= Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.RestrainedArms)));
      var impact = this.vec2_2.clone(), origin = this.vec2_1.clone(), dealt = n.onAttacked(e, this);
      if (!current(true) || ui.ctrEffect !== effects || !cc.isValid(effects, true)) return;
      if (cc.isValid(n, true) && n.node === targetNode && cc.isValid(targetNode, true) && targetNode._combatGeneration === targetGeneration && !n._isPooled) effects.showDamageNum(impact, dealt);
      if (!current(true) || ui.ctrEffect !== effects || !cc.isValid(effects, true)) return;
      effects.onMonsterAttack(impact, "xb_gj");
      if (!current(true)) return;
      this.vec2_1.x = origin.x; this.vec2_1.y = origin.y; this.vec2_2.x = impact.x; this.vec2_2.y = impact.y;
      cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
      this.setLeft(this.vec2_2.x < 0);
    }
  };
  _ctor.prototype.doAttackFinish = function () {
    AllyAwareness.invalidate($z1KinghtFallUIGame.default.instance.ctrGame);
    this.doIdel();
  };
  _ctor.prototype.interruptAttackForTransform = function () {
    this._attackIntent = null;
    this.time[l.Attack] = 0;
    if (this.state === s.Attack) this.doIdel();
    require("EnemyPolymorph").pose(this, this.state === s.Move);
  };
  _ctor.prototype.onAttacked = function (t, attacker) {
    if (!this.isDead()) {
      var ui = $z1KinghtFallUIGame.default.instance, game = ui.ctrGame, notice = AllyAwareness.capture(this, attacker, game), hpBefore = this.hp;
      var life = { node: this.node, generation: this.node._combatGeneration, timers: this.time, cfg: this.cfg, ui: ui, game: game, data: game.gameData, epoch: game._combatEpoch };
      t=GameToolsOverrides.damageTaken(this,"ally",t);
      t=require("RelicCombat").allyIncoming(this,t);
      if (attacker && attacker.node && attacker.isDead && !attacker.isDead()) {
        this._retaliationScope = null;
        this._retaliationTarget = attacker;
        this._retaliationGeneration = attacker.node._combatGeneration;
        this._retaliationTime = 3;
        this._retaliationPosition = Navigation.positionOf(this.node, $z1KinghtFallUIGame.default.instance.ctrGame);
        this._targetRefresh = 0;
        this._settledPoint = null;
      }
      var e = 1;
      if (1 == this.cfg.AttackType) {
        var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.talentAdd[$z1KinghtFallEnum.KinghtFallEnumTalentCfg.TalenType04];
        if (n) {
          for (var i = 0; i < n.length; i++) {
            e -= n[i][0];
          }
        }
      }
      this.hp -= t * e;
      AllyAwareness.notify(notice, Math.max(0, Math.min(hpBefore, t * e)));
      if (!incomingCurrent(this, life)) return t * e;
      if (BattleSounds.hit) { BattleSounds.hit(this, attacker, t * e); if (!incomingCurrent(this, life)) return t * e; }
      if (t * e > 0 && this.hp > 0 && cc.resources) { require("UnitHitFeedback").play(this); if (!incomingCurrent(this, life)) return t * e; }
      if (this.hp <= 0) {
        Navigation.reset(this);
        this.state = s.Dead;
        this._followSelected = false;
        this.isAgg = false;
        this._syncFollowMarker();
        this.delAllBuff();
        if (!incomingCurrent(this, life)) return t * e;
        if (cc.resources) { require("UnitVoices").death(this); if (!incomingCurrent(this, life)) return t * e; }
        this.playDeath(function () {
          this.node.active = false;
          if (!incomingCurrent(this, life)) return;
          if (this.outBuild && this.outBuild.addDie) this.outBuild.addDie(this);
          else this.freeNode();
        });
        if (!incomingCurrent(this, life, true)) return t * e;
        var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff16);
        a && $z1KinghtFallUIGame.default.instance.ctrGame.ctrPlay.addHpPro(a.Pamer[0]);
        if (a && !incomingCurrent(this, life, true)) return t * e;
      } else {
        var retaliation = game.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.VengefulRage];
        if (retaliation) {
          this.addBuff($z1KinghtFallInterface.KinghtFallEnemyBuffType.DamageAdd, { addNum: retaliation[0], time: 2 });
          if (!incomingCurrent(this, life)) return t * e;
        }
      }
      this.hpctrl && this.hpctrl.setHp(this.hp, this.hpMax);
      return t * e;
    }
  };
  _ctor.prototype.freeNode = function () {
    if (this._isPooled) return;
    var owner = this, node = this.node, data = this._combatData || setupLife(this).data;
    var key = $z1KinghtFallConfig.KinghtFallPoolName.Soldier + "_" + this.cfg.ID;
    this._isPooled = true;
    var generation = node._combatGeneration = (node._combatGeneration || 0) + 1;
    invalidateFormationFrame(this._combatGame || $z1KinghtFallUIGame.default.instance.ctrGame);
    function retired() { return cc.isValid(owner, true) && owner.node === node && cc.isValid(node, true) && node._combatGeneration === generation && owner._isPooled; }
    // Unlink this lease before cleanup can initialize the same component again.
    if (data) data.delSoldier(this, true);
    if (!retired()) return;
    AllyAwareness.invalidate($z1KinghtFallUIGame.default.instance.ctrGame);
    this._attackIntent = null;
    this._spawnPending = false;
    Navigation.reset(this);
    this.pathList = null;
    this.rallyPoint = null;
    this._rallyOrder = null;
    this._standingGoal = null;
    this._settledPoint = null;
    this._orderTarget = null;
    this._continuationTarget = null;
    this._retaliationTarget = null;
    this._retaliationPosition = null;
    this._retaliationScope = null;
    this.outBuild = null;
    this._deathAnimation = null;
    if (cc.resources) { require("UnitHitFeedback").reset(this); if (!retired()) return; }
    this._followSelected = false;
    this.isAgg = false;
    this._personalRallyPoint = null;
    this._syncFollowMarker();
    if (!retired()) return;
    if (this.hpctrl) { this.hpctrl.setHp(0, this.hpMax); if (!retired()) return; }
    GameToolsOverrides.cancel(this);
    this.clearOpposingSkills();
    if (!retired()) return;
    $z1PoolMgr.PoolMgr.getInstance().freeNode(key, node);
  };
  _ctor.prototype.isDead = function () {
    return this.state == s.Dead;
  };
  _ctor.prototype.setPause = function (t) {
    this.rigidBody.linearVelocity = cc.Vec2.ZERO;
    this.spAni.paused = t;
    if (this._opposingForm) this._opposingForm.renderer.paused = t;
  };
  _ctor.prototype.getAttack = function () {
    var t = this.attack;
    var conditional = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.addTime || {};
    t += this.cfg.AttackDamage * ((conditional[$z1KinghtFallGameCtrlData.KinghtFallTimeType.SoldierDamage1] || 0) +
      (conditional[$z1KinghtFallGameCtrlData.KinghtFallTimeType.SoldierDamage2] || 0));
    var e = 1;
    var n = this.getBuffList($z1KinghtFallInterface.KinghtFallEnemyBuffType.DamageCut);
    for (var i = 0; i < n.length; i++) {
      e -= n[i].data.subNum;
    }
    var a = this.getBuffList($z1KinghtFallInterface.KinghtFallEnemyBuffType.DamageAdd);
    for (i = 0; i < a.length; i++) {
      e += a[i].data.addNum;
    }
    // The wave's army bonus also applies to replacements born after a pulse.
    e += require("RelicBattle").armyBannerBonus($z1KinghtFallUIGame.default.instance.ctrGame.gameData);
    e < 0 && (e = 0);
    return t * e;
  };
  _ctor.prototype.getAttSpeed = function () {
    if (this._opposingForm) return 0;
    var t = this.attSpeed;
    var e = 1;
    var n = this.getBuffList($z1KinghtFallInterface.KinghtFallEnemyBuffType.AttackSpeed);
    for (var i = 0; i < n.length; i++) {
      e += n[i].data.addSpeed;
    }
    var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff44);
    a && (e += a.Pamer[0]);
    switch (this.cfg.AttackType) {
      case 2:
        $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.DartingTalisman] && (e += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.DartingTalisman][0]);
    }
    return t * e * this.slowMultiplier($z1KinghtFallInterface.KinghtFallEnemyBuffType.AttackSlow);
  };
  _ctor.prototype.getSpeed = function () {
    var t = this.cfg.Speed;
    var e = 1;
    var n = this.getBuffList($z1KinghtFallInterface.KinghtFallEnemyBuffType.MoveSpeed);
    for (var i = 0; i < n.length; i++) {
      e -= n[i].data.subNum;
    }
    var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff31);
    a && (e += a.Pamer[0]);
    var o = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff44);
    o && (e -= o.Pamer[1]);
    var r = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff52);
    r && (e += r.Pamer[0]);
    $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.WindstormBoots] && (e += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.WindstormBoots][0]);
    return t * e * this.slowMultiplier($z1KinghtFallInterface.KinghtFallEnemyBuffType.MoveSlow);
  };
  _ctor.prototype.addHpPro = function (t) {
    if (!this.isDead()) {
      var soundHp = this.hp;
      this.hp += t * this.hpMax;
      this.hp > this.hpMax && (this.hp = this.hpMax);
      if (this.hp > soundHp && BattleSounds.effect) BattleSounds.effect("healing-receive", this);
      this.hpctrl && this.hpctrl.setHp(this.hp, this.hpMax);
    }
  };
  _ctor.prototype.setNew = function (lease) {
    var life = setupLife(this);
    if (lease) lease.generation = life.generation;
    this.clearOpposingSkills();
    if (!setupCurrent(this, life)) return false;
    AllyAwareness.invalidate($z1KinghtFallUIGame.default.instance.ctrGame);
    this._attackIntent = null;
    this._spawnPending = false;
    this._deathAnimation = null;
    if (cc.resources) { require("UnitHitFeedback").reset(this); if (!setupCurrent(this, life)) return false; }
    if (this.rigidBody) this.rigidBody.active = true;
    var respawning = this.isDead() || !this.node.activeInHierarchy;
    // Capture the casualty state before new tier HP heals this actor. A
    // retained soldier may now belong to the next barracks tier.
    var statsChanged = this._refreshLevelStats();
    life.cfg = this.cfg;
    if (statsChanged) {
      if (this.initBuffData() === false) return false;
      life.cfg = this.cfg;
      if (!setupCurrent(this, life)) return false;
    }
    if (respawning) {
      if (BattleSounds.effect) BattleSounds.effect("barracks-squad-spawn", this, { allowDead: true });
      if (!setupCurrent(this, life)) return false;
      this._followSelected = false;
      // Returning casualties keep their saved post. A stationary ring along
      // that return route must not immediately recruit them again.
      this._followPickupBlocked = !!this._personalRallyPoint;
    }
    GameToolsOverrides.cancel(this);
    var t;
    this.node._combatGeneration = (this.node._combatGeneration || 0) + 1;
    life.generation = this.node._combatGeneration;
    if (lease) lease.generation = life.generation;
    invalidateFormationFrame(life.game);
    Navigation.reset(this);
    this.hp = this.hpMax;
    null === (t = this.hpctrl) || undefined === t || t.setHp(this.hp, this.hpMax);
    if (!setupCurrent(this, life)) return false;
    this.node.active = true;
    if (!setupCurrent(this, life)) return false;
    this.pathList = null;
    this.isAgg = false;
    this.time[l.Attack] = 0;
    this.doIdel();
    if (!setupCurrent(this, life)) return false;
    this._orderTarget = null;
    this._continuationTarget = null;
    this._targetRefresh = 0;
    this._retaliationTarget = null;
    this._retaliationTime = 0;
    this._retaliationPosition = null;
    this._retaliationScope = null;
    this.applyArmyOrder(life.game);
    if (!setupCurrent(this, life)) return false;
  };
  _ctor.prototype.getWpos = function () {
    return this.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
  };
  _ctor.prototype.applyArmyOrder = function (game) {
    this._continuationTarget = null;
    Navigation.reset(this);
    this._separateArmyCommands = !!game._separateArmyCommands;
    if (this._separateArmyCommands || $z1KinghtFallConfig.KinghtFallParameter.FollowMode === 2) {
      var saved = this.outBuild && this.outBuild.getSoldierRallyPoint && this.outBuild.getSoldierRallyPoint(this);
      var order = this._rallyOrder;
      if (saved) this.setPersonalRallyPoint(saved, false);
      this._rallyOrder = order;
      if (!this._personalRallyPoint) {
        // A Rally click orders the current roster once. New troops keep their
        // own spawn/post until explicitly rallied or recruited into Follow.
        this.setPersonalRallyPoint(!game._separateArmyCommands && game.rallyPoint ? game.rallyPoint.pos : Navigation.positionOf(this.node, game), false);
      }
      this.isAgg = !!game.isAgg && !!this._followSelected && !this.isDead() && this.node.activeInHierarchy;
      this.rallyPoint = this.isAgg ? null : this._personalRallyPoint;
    } else {
      this.rallyPoint = game.rallyPoint || null;
      this.isAgg = !this.rallyPoint && !!game.isAgg;
    }
    this.pathList = null;
    this._settledPoint = null;
    this._standingGoal = null;
    this._armyProgressPoint = null;
    this._armyStalledTime = 0;
    this._syncFollowMarker();
    var holdingHere = this.isHoldingPosition() && this.rallyPoint && cc.Vec2.distance(Navigation.positionOf(this.node, game), this.rallyPoint.pos) < 3;
    if (holdingHere) this._settledPoint = Navigation.positionOf(this.node, game);
    if (!this.isDead() && this.state != s.Attack) {
      if (!holdingHere && (this.rallyPoint || this.isAgg)) this.doMove();
      else this.doIdel();
    }
  };
  _ctor.prototype.isHoldingPosition = function () {
    return (this._separateArmyCommands || $z1KinghtFallConfig.KinghtFallParameter.FollowMode === 2) && !this.isAgg;
  };
  _ctor.prototype.setPersonalRallyPoint = function (position, remember) {
    this._rallyOrder = null;
    this._standingGoal = null;
    this._personalRallyPoint = { pos: { x: position.x, y: position.y } };
    if (remember && this.outBuild && this.outBuild.setSoldierRallyPoint) this.outBuild.setSoldierRallyPoint(this, position);
  };
  _ctor.prototype._syncFollowMarker = function () {
    var selected = this._followSelected && this.isAgg && !this.isDead();
    if (selected && !this._followMarker && cc.Graphics) {
      var node = this._followMarker = new cc.Node("FollowSelection");
      node.parent = this.node; node.zIndex = -1;
      var graphics = node.addComponent(cc.Graphics);
      graphics.lineWidth = 3;
      graphics.strokeColor = cc.color(100, 240, 255, 255);
      graphics.ellipse(0, 0, 18, 8); graphics.stroke();
    }
    if (this._followMarker) this._followMarker.active = !!selected;
  };
  _ctor.prototype.setPath = function (t, e) {
    this.isAgg = !!e;
    this.rallyPoint = null;
    this._settledPoint = null;
    Navigation.reset(this);
    var point = t && t[t.length - 1];
    this.pathList = point ? { nodeIndex: 0, pathIndex: point.index, pathInfoList: [{ index: point.index, pos: cc.v2(point.pos.x, point.pos.y) }] } : null;
  };
  _ctor.prototype.startAgg = function (t) {
    if (this.isDead() || !t || !t.pos) {
      return false;
    }
    Navigation.reset(this);
    this.isAgg = $z1KinghtFallConfig.KinghtFallParameter.FollowMode == 2;
    this.rallyPoint = null;
    this._settledPoint = null;
    this.pathList = {
      nodeIndex: 0,
      pathIndex: t.index,
      pathInfoList: [{ index: t.index, pos: cc.v2(t.pos.x, t.pos.y) }]
    };
    this.doMove();
    return true;
  };
  _ctor.prototype.upPath = function () {
    this.setPath($z1KinghtFallUIGame.default.instance.ctrGame.pathList, this.isAgg);
    this.doMove();
  };
  _ctor.prototype._refreshLevelStats = function () {
    if (!this.cfg) return false;
    var previous = this.cfg, base = this._unitBaseCfg || (this._unitBaseCfg = previous);
    var data = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data;
    var next = UnitLevelStats.resolve(base, data && data.GameTools, UnitLevelStats.level(this));
    this.cfg = next;
    if (previous.AttackInterval !== next.AttackInterval) {
      var multiplier = 1;
      var talents = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.talentAdd[$z1KinghtFallEnum.KinghtFallEnumTalentCfg.TalenType02];
      if (talents) for (var i = 0; i < talents.length; i++) multiplier += talents[i][0];
      this.attSpeed = next.AttackInterval * multiplier;
    }
    return UnitLevelStats.FIELDS.some(function (field) { return previous[field] !== next[field]; });
  };
  _ctor.prototype.initBuffData = function () {
    this._refreshLevelStats();
    var life = setupLife(this);
    var t = 1;
    this.hpMax = this.cfg.Health;
    var e = 1;
    e += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.addTime[$z1KinghtFallGameCtrlData.KinghtFallTimeType.SoldierMaxHp] || 0;
    var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff32);
    n && (e += n.Pamer[0]);
    var i = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff53);
    i && (e += i.Pamer[0]);
    if (2 == this.cfg.AttackType) {
      var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff45);
      if (a) {
        t += a.Pamer[0];
        e -= a.Pamer[1];
      }
    }
    var o = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.talentAdd[$z1KinghtFallEnum.KinghtFallEnumTalentCfg.TalenType03];
    if (o) {
      for (var r = 0; r < o.length; r++) {
        e += o[r][0];
      }
    }
    this.hpMax *= e;
    this.hp = this.hpMax;
    this.hpctrl && this.hpctrl.setHp(this.hp, this.hpMax);
    if (!setupCurrent(this, life)) return false;
    this.attack = this.cfg.AttackDamage;
    var s = 1;
    s += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.addTime[$z1KinghtFallGameCtrlData.KinghtFallTimeType.SoldierDamage] || 0;
    var l = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff43);
    l && (s += l.Pamer[0]);
    var c = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.talentAdd[$z1KinghtFallEnum.KinghtFallEnumTalentCfg.TalenType01];
    if (c) {
      for (r = 0; r < c.length; r++) {
        s += c[r][0];
      }
    }
    this.attack *= s;
    if (2 == this.cfg.AttackType) {
      var h = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.talentAdd[$z1KinghtFallEnum.KinghtFallEnumTalentCfg.TalenType05];
      if (h) {
        for (r = 0; r < h.length; r++) {
          t += h[r][0];
        }
      }
    }
    this.attackRange = this.cfg.AttackRange * t;
    var u = this.node.getComponents(cc.CircleCollider);
    if (u[0]) {
      u[0].radius = this.attackRange;
    } else {
      this.node.addComponent(cc.CircleCollider).radius = this.attackRange;
    }
    if (u[1]) {
      u[1].radius = this.getAcquireRange();
    } else {
      this.node.addComponent(cc.CircleCollider).radius = this.getAcquireRange();
    }
  };
  _ctor.prototype.onChangeSpeed = function () {
    var t = $z1KinghtFallUIGame.default.instance.speed;
    this.spAni.timeScale = t;
  };
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "身体部分"
  })], _ctor.prototype, "spAni", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "血条节点"
  })], _ctor.prototype, "ndHp", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "血条节点"
  })], _ctor.prototype, "ndVideo", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallInterface.KinghtFallInterface);
exports.default = def_KinghtFallSoldierBase;
(function (t) {
  t[t.Idle = 0] = "Idle";
  t[t.Move = 1] = "Move";
  t[t.Attack = 2] = "Attack";
  t[t.Wait = 3] = "Wait";
  t[t.Dead = 4] = "Dead";
})(s = exports.KinghtFallSoldierStatus || (exports.KinghtFallSoldierStatus = {}));
(function (t) {
  t.Attack = "Attack";
})(l || (l = {}));
