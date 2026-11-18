function millAttackTargets(data) { return data.getAttackableBuildList ? data.getAttackableBuildList() : data.getBulidList(); }
function incomingCurrent(owner, life, pooled) {
  return cc.isValid(owner, true) && owner.node === life.node && cc.isValid(life.node, true) && owner.cfg === life.cfg && owner.time === life.timers &&
    (life.node._combatGeneration === life.generation && !owner._isPooled || pooled && owner._isPooled && life.node._combatGeneration === (life.generation || 0) + 1) &&
    $z1KinghtFallUIGame.default.instance === life.ui && (!life.ui || cc.isValid(life.ui, true) && !life.ui.isclose && life.ui.ctrGame === life.game) &&
    (!life.game || cc.isValid(life.game, true) && life.game.gameData === life.data && life.game._combatEpoch === life.epoch && (!owner._combatGame || owner._combatGame === life.game));
}
function attackCurrent(owner, record, released) {
  return record && cc.isValid(record.ui, true) && cc.isValid(record.game, true) && $z1KinghtFallUIGame.default.instance === record.ui &&
    !record.ui.isclose && record.ui.ctrGame === record.game && record.game.gameData === record.data && record.game._combatEpoch === record.epoch && record.game.gameStatus === record.stage &&
    (!record.game.node || cc.isValid(record.game.node, true) && record.game.node.activeInHierarchy !== false) && cc.isValid(owner, true) &&
    owner.node === record.node && cc.isValid(record.node, true) && record.node.activeInHierarchy !== false && record.node._combatGeneration === record.generation &&
    owner.time === record.timers && !owner._isPooled && (!owner._combatGame || owner._combatGame === record.game) && (released || !owner.isDead() && owner.hp > 0) &&
    (!record.renderer || cc.isValid(record.renderer, true) && (!record.renderer.node || cc.isValid(record.renderer.node, true)));
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
var BattleSounds = require("BattleSounds");
var i;
var GameToolsOverrides = require("GameToolsOverrides");
var RelicCombat = require("RelicCombat");
var RelicRuntime = require("RelicRuntime");
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallEnemyStatus = undefined;
var r;
var s;
var $z1PoolMgr = require("PoolMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallMissionData = require("KinghtFallMissionData");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallItemHp = require("KinghtFallItemHp");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallInterface = require("KinghtFallInterface");
var Navigation = require("KinghtFallNavigation");
var targetSearchPhase = 0;
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallEnemyBase = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.spAni = null;
    e.ndHp = null;
    e.rigidBody = null;
    e.time = {};
    e.vec2_1 = new cc.Vec2();
    e.vec2_2 = new cc.Vec2();
    e.finIndex = 0;
    e.lastFind = false;
    e._routeInterrupted = false;
    e._targetSearchElapsed = 0;
    e._targetSearchCache = null;
    e.navigationTeam = "enemy";
    e._unreachableTargets = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    var t = this;
    this.rigidBody = this.node.getComponent(cc.RigidBody);
    Navigation.enableTerrainContacts(this);
    this.spAni.setCompleteListener(function (e) {
      t._completeAttackAnimation(t.spAni, e);
    });
  };
  _ctor.prototype.start = function () {
    this.setBody(this.spAni.node);
  };
  _ctor.prototype.onPreSolve = function (contact, self, other) {
    Navigation.allowBlockedExit(this, contact, other);
  };
  _ctor.prototype.initData = function (t, e, lease) {
    var life = setupLife(this);
    if (lease) lease.generation = life.generation;
    this._combatGame = life.game;
    this._combatData = life.data;
    this._attackAnimation = null;
    this._poolCfgID = t;
    if (cc.resources) { require("UnitHitFeedback").reset(this); if (!setupCurrent(this, life)) return false; }
    GameToolsOverrides.cancel(this);
    RelicCombat.releaseControl(this);
    RelicRuntime.clearControl(this);
    this.releaseHealingEffects();
    if (!setupCurrent(this, life)) return false;
    var n = this;
    this.node._combatGeneration = (this.node._combatGeneration || 0) + 1;
    life.generation = this.node._combatGeneration;
    if (lease) lease.generation = life.generation;
    this.node._combatActor = this;
    this._isPooled = false; life.pooled = false;
    this._deathAnimation = null;
    Navigation.reset(this);
    this._routeInterrupted = false;
    this._targetSearchElapsed = 0;
    this._targetSearchCache = null;
    this._unreachableTargets = null;
    this.cfg = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById(t);
    life.cfg = this.cfg;
    if (this.spAni) this.setLeft(false);
    this.bornInfo = $z1KinghtFallUIGame.default.instance.ctrGame.setPath(e);
    var i = this.node.getComponents(cc.CircleCollider);
    if (i[0]) {
      i[0].radius = this.cfg.AttackRange;
    } else {
      this.node.addComponent(cc.CircleCollider).radius = this.cfg.AttackRange;
    }
    if (i[1]) {
      i[1].radius = this.cfg.AttackRange + this.cfg.SearchRange;
    } else {
      this.node.addComponent(cc.CircleCollider).radius = this.cfg.AttackRange + this.cfg.SearchRange;
    }
    this.hpMax = this.cfg.Health * $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getHpAdd(this.cfg.ID);
    this.hp = this.hpMax;
    if (this.hpctrl) {
      this.hpctrl.setType($z1KinghtFallModle.KinghtFallGameArmy.Enemy, this);
      if (!setupCurrent(this, life)) return false;
      this.hpctrl.setHp(this.hp, this.hpMax);
    } else if (!this._hpLoadPending) {
      this._hpLoadPending = true;
      this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Enemy, $z1KinghtFallConfig.KinghtFallPrefabName.ItemHp, function (t) {
        n._hpLoadPending = false;
        if (!cc.isValid(n, true) || !cc.isValid(n.node, true) || !cc.isValid(n.ndHp, true) || n.hpctrl) return;
        var e;
        (e = cc.instantiate(t)).setParent(n.ndHp);
        e.setPosition(0, 0, 0);
        n.hpctrl = e.getComponent($z1KinghtFallItemHp.default);
        n.hpctrl.setType($z1KinghtFallModle.KinghtFallGameArmy.Enemy, n);
        n.hpctrl.setHp(n.hp, n.hpMax);
        n.ndHp.childrenCount > 1 && console.error("节点下有多个子节点");
      });
    }
    if (!setupCurrent(this, life)) return false;
    this.attack = Math.round(this.cfg.AttackDamage * $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getAttAdd(this.cfg.ID));
    this.time = {}; life.timers = this.time;
    this.time[s.Attack] = 0;
    this.node.getPosition(this.vec2_1);
    this.node.zIndex = Math.floor(cc.winSize.height) - Math.floor(this.vec2_1.y);
    this.doMove();
    if (!setupCurrent(this, life)) return false;
    this.rigidBody.active = !!this.cfg.BuildingCross;
    this.onChangeSpeed();
  };
  _ctor.prototype.updateCombatTimers = function (t) {
    var ui = $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame;
    var frame = { ui: ui, game: game, data: game && game.gameData, epoch: game && game._combatEpoch, stage: game && game.gameStatus,
      node: this.node, generation: this.node && this.node._combatGeneration, timers: this.time }, buffs = this.debuffInfo;
    if (!attackCurrent(this, frame)) return false;
    // Observe the next frame's physical position, after contacts have resolved.
    // Attack, stun and support waits are intentional and do not count as stalls.
    if (this.state === r.Move && !this._hitReactionPlaying && !this._heroKnockback) Navigation.recoverStranded(this, $z1KinghtFallUIGame.default.instance.ctrGame, t);
    else this._enemyStall = null;
    if (!attackCurrent(this, frame)) return false;
    this._targetSearchElapsed += t;
    this.node.getPosition(this.vec2_1);
    this.node.zIndex = Math.floor(cc.winSize.height) - Math.floor(this.vec2_1.y);
    for (var n = 0; n < buffs.length; n++) {
      var i = buffs[n];
      if (-1 != i.timeMax) {
        i.time += t;
        if (i.time >= i.timeMax) this.delBuffIdx(n--);
        if (!attackCurrent(this, frame) || this.debuffInfo !== buffs) return false;
      }
    }
    if (-1 != frame.timers[s.Attack]) {
      var rate = this.getAttSpeed();
      if (!attackCurrent(this, frame)) return false;
      frame.timers[s.Attack] += t * rate;
    }
    if(this._heroKnockback){var push=this._heroKnockback;if(push.owner&&push.owner.knockbackCurrent(push)){this.rigidBody.linearVelocity=cc.Vec2.ZERO;return false;}delete this._heroKnockback;}
  };
  _ctor.prototype.onUpdate = function (t) {
    if (!this.isDead()) {
      if (this.updateCombatTimers(t) === false) return;
      if (this._hitReactionPlaying) { this.rigidBody.linearVelocity = cc.Vec2.ZERO; return; }
      switch (this.state) {
        case r.Idle:
          var a = this.getUpdateTarget();
          this.lastFind = !!a;
          if (a) {
            if (a && a.tag) this.interruptRoute();
            if (a && a.canAtt) {
              this.time[s.Attack] >= 1 && this.onFindList();
            } else {
              this.doMove();
            }
          } else {
            this.doMove();
          }
          break;
        case r.Wait:
          var waitingTarget = this.getUpdateTarget();
          if (waitingTarget && waitingTarget.canAtt) {
            this.time[s.Attack] >= 1 && this.onFindList();
          } else if (waitingTarget && waitingTarget.tag) {
            this.interruptRoute();
            this.doMove();
          }
          break;
        case r.Move:
          var o = this.getUpdateTarget();
          if (o && o.tag) this.interruptRoute();
          if (o && o.canAtt) {
            this.rigidBody.linearVelocity = cc.Vec2.ZERO;
            this.time[s.Attack] >= 1 && this.onFindList();
          } else {
            var game = $z1KinghtFallUIGame.default.instance.ctrGame;
            var targetNode = o && o.tag;
            if (!targetNode) {
              targetNode = this.getRouteWaypoint(game);
              if (!targetNode) { this.doWait(); break; }
            }
            var destination = o && o.tag ? Navigation.attackPositionOf(o, this, game) : Navigation.positionOf(targetNode, game);
            var movement = Navigation.moveTo(this, game, destination, t);
            if (movement.directionX) this.setLeft(movement.directionX < 0);
            // Authored waypoints on a collider edge resolve to a safe nearby point.
            if (!o && movement.arrived && !movement.partial) { this.bornInfo.nodeIndex++; Navigation.reset(this); }
            // A rejected/finished approach must not pin acquisition forever to
            // a closer hero behind a wall or an inaccessible building face.
            if (o && (movement.blocked || movement.arrived && !movement.distance)) this.rejectNavigationTarget(o, game);
          }
      }
    }
  };
  _ctor.prototype.interruptRoute = function () {
    if (!this._routeInterrupted) Navigation.reset(this);
    this._routeInterrupted = true;
  };
  _ctor.prototype.getRouteWaypoint = function (game) {
    if (this._routeInterrupted) {
      Navigation.resumeEnemyRoute(this, game);
      this._routeInterrupted = false;
    }
    return this.bornInfo.pathList[this.bornInfo.nodeIndex];
  };
  _ctor.prototype.setLeft = function (t) {
    this._visualLeft = !!t;
    GameToolsOverrides.applyModel(this, "enemy", this.spAni.node, t);
  };
  _ctor.prototype.doWait = function () {
    this.state = r.Wait;
    this.rigidBody.linearVelocity = cc.Vec2.ZERO;
    this.spAni.setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Idle, true);
  };
  _ctor.prototype.doIdel = function () {
    this.state = r.Idle;
    this.rigidBody.linearVelocity = cc.Vec2.ZERO;
    this.spAni.setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Idle, true);
  };
  _ctor.prototype.doMove = function () {
    this.state = r.Move;
    if (this.bornInfo.nodeIndex > this.bornInfo.pathList.length) {
      this.doWait();
    } else {
      this.spAni.setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Move, true);
    }
  };
  _ctor.prototype.isFind = function () {
    var t;
    var e = this;
    this.finIndex++;
    if (this.finIndex % 3 != 0) {
      return this.lastFind;
    } else {
      return this.finIndex = 0, this.node.getPosition(this.vec2_1), !!function () {
        var t = {
          position: e.node.convertToWorldSpaceAR(cc.Vec2.ZERO),
          radius: e.cfg.AttackRange + e.cfg.SearchRange
        };
        var n = millAttackTargets($z1KinghtFallUIGame.default.instance.ctrGame.gameData);
        for (var i = 0; i < n.length; i++) {
          var a = n[i];
          if (a.getIsWork()) {
            var o = Navigation.attackPartsOf(a).map(function(part){return part.points;});
            for (var r = 0; r < o.length; r++) {
              var s = o[r];
              if (cc.Intersection.polygonCircle(s, t)) {
                return true;
              }
            }
          }
        }
        return false;
      }() || !(t = $z1KinghtFallUIGame.default.instance.ctrGame.ctrPlay).isDead() && (t.node.getPosition(e.vec2_2), cc.Vec2.subtract(e.vec2_2, e.vec2_2, e.vec2_1), e.vec2_2.len() <= e.cfg.AttackRange + e.cfg.SearchRange) || !!function () {
        var t = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getSoldierList();
        for (var n = 0; n < t.length; n++) {
          var i = t[n];
          if (!i.isDead() && (i.node.getPosition(e.vec2_2), cc.Vec2.subtract(e.vec2_2, e.vec2_2, e.vec2_1), e.vec2_2.len() <= e.cfg.AttackRange + e.cfg.SearchRange)) {
            return true;
          }
        }
        return false;
      }();
    }
  };
  _ctor.prototype.getFind = function () {
    var t = this;
    var game = $z1KinghtFallUIGame.default.instance.ctrGame;
    this.node.getPosition(this.vec2_1);
    return function () {
      var e = null;
      var n = -1;
      var i = -1;
      var targetPolygon = null;
      var targetActor = null;
      var targetBuilding = null;
      var a = $z1KinghtFallUIGame.default.instance.ctrGame.ctrPlay;
      if (!a.isDead() && t.canPursueTarget(a.node, game)) {
        a.node.getPosition(t.vec2_2);
        cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
        if (t.vec2_2.len() <= t.cfg.AttackRange + t.cfg.SearchRange) {
          e = a.node, n = t.vec2_2.len(), targetActor = a;
        }
      }
      var o = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getSoldierList();
      for (var r = 0; r < o.length; r++) {
        if (!(g = o[r]).isDead() && t.canPursueTarget(g.node, game)) {
          g.node.getPosition(t.vec2_2);
          cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
          if (t.vec2_2.len() <= t.cfg.AttackRange + t.cfg.SearchRange && (-1 == n || t.vec2_2.len() < n)) {
            e = g.node, n = t.vec2_2.len(), targetActor = g;
          }
        }
      }
      var s = {
        position: t.node.convertToWorldSpaceAR(cc.Vec2.ZERO),
        radius: t.cfg.AttackRange + t.cfg.SearchRange
      };
      var l = {
        position: t.node.convertToWorldSpaceAR(cc.Vec2.ZERO),
        radius: t.cfg.AttackRange
      };
      var c = millAttackTargets($z1KinghtFallUIGame.default.instance.ctrGame.gameData);
      for (var h = 0; h < c.length; h++) {
        var g;
        if ((g = c[h]).getIsWork()) {
          var u = Navigation.attackPartsOf(g);
          for (var d = 0; d < u.length; d++) {
            var p = u[d];
            if (t.canPursueTarget(p.tagNode, game) && cc.Intersection.polygonCircle(p.points, s)) {
              var targetDistance = Navigation.polygonDistance(t, p.points, $z1KinghtFallUIGame.default.instance.ctrGame);
              if (-1 == n || targetDistance < n) {
                i = cc.Intersection.polygonCircle(p.points, l);
                e = p.tagNode;
                targetPolygon = p.points;
                targetActor = null;
                targetBuilding = g;
                n = targetDistance;
              }
            }
          }
        }
      }
      if (e) {
        return {
          tag: e,
          canAtt: -1 == i ? n <= t.cfg.AttackRange : i,
          polygon: targetPolygon,
          actor: targetActor,
          building: targetBuilding
        };
      } else {
        return null;
      }
    }() || null;
  };
  _ctor.prototype.canPursueTarget = function (node, game) {
    var failures = this._unreachableTargets, failure = failures && failures.get(node);
    if (!failure) return true;
    var navigation = Navigation.get(game); navigation.refresh();
    var start = Navigation.positionOf(this.node, game), target = Navigation.positionOf(node, game);
    if (failure.revision !== navigation.revision || failure.generation !== node._combatGeneration ||
        cc.Vec2.distance(failure.target, target) > 20 ||
        cc.Vec2.distance(failure.start, start) > 20 && (!failure.partial || navigation.grid.segmentClear(start, target, failure.radius))) {
      failures.delete(node);
      return true;
    }
    return false;
  };
  _ctor.prototype.rejectNavigationTarget = function (target, game) {
    var failures = this._unreachableTargets || (this._unreachableTargets = new Map());
    if (failures.size >= 16) failures.delete(failures.keys().next().value);
    failures.set(target.tag, { revision: Navigation.get(game).revision, generation: target.tag._combatGeneration,
      target: Navigation.positionOf(target.tag, game), start: Navigation.positionOf(this.node, game),
      partial: !!(this._navigationState && this._navigationState.partial), radius: this._navigationState && this._navigationState.radius || 0 });
    this._targetSearchCache = null;
    Navigation.reset(this);
  };
  _ctor.prototype.getUpdateTarget = function () {
    var forced=RelicCombat.tauntedTarget(this);
    if(forced)return {tag:forced.node,actor:forced,canAtt:cc.Vec2.distance(this.node.getPosition(),forced.node.getPosition())<=this.cfg.AttackRange};
    var game = $z1KinghtFallUIGame.default.instance.ctrGame;
    var cached = this._targetSearchCache;
    if (cached && cached.game === game && cached.cfg === this.cfg && this._targetSearchElapsed < .2) {
      var target = cached.target;
      if (!target) return null;
      var node = target.tag;
      var valid = node && node.activeInHierarchy !== false && this.canPursueTarget(node, game);
      if (valid && target.actor) {
        valid = !target.actor._isPooled && !target.actor.isDead() && node._combatGeneration === cached.generation;
        if (valid) {
          this.node.getPosition(this.vec2_1);
          node.getPosition(this.vec2_2);
          cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
          var distance = this.vec2_2.len();
          valid = distance <= this.cfg.AttackRange + this.cfg.SearchRange;
          target.canAtt = distance <= this.cfg.AttackRange;
        }
      } else if (valid && target.building) {
        valid = target.building.getIsWork();
        if (valid) {
          var parts = Navigation.attackPartsOf(target.building), polygon = null;
          for (var i = 0; i < parts.length; i++) if (parts[i].tagNode === node) { polygon = parts[i].points; break; }
          var circle = { position: this.node.convertToWorldSpaceAR(cc.Vec2.ZERO), radius: this.cfg.AttackRange + this.cfg.SearchRange };
          valid = !!polygon && cc.Intersection.polygonCircle(polygon, circle);
          if (valid) {
            target.polygon = polygon;
            circle.radius = this.cfg.AttackRange;
            target.canAtt = cc.Intersection.polygonCircle(polygon, circle);
          }
        }
      } else {
        // Unknown/custom target records cannot be validated safely.
        valid = false;
      }
      if (valid) return target;
    }
    // Refresh nearest-target choice at 5Hz; validate its current range and
    // lifetime every update, including while waiting. Attack execution still
    // performs its own fresh range check before applying damage.
    var found = this.getFind();
    // Offset the first repeat so a wave does not rescan every unit together.
    this._targetSearchElapsed = cached ? 0 : (targetSearchPhase++ % 10) * .02;
    this._targetSearchCache = { game: game, cfg: this.cfg, target: found, generation: found && found.tag && found.tag._combatGeneration };
    return found;
  };
  _ctor.prototype.onFindList = function () {
    var forced=RelicCombat.tauntedTarget(this);
    if(forced){if(cc.Vec2.distance(this.node.getPosition(),forced.node.getPosition())>this.cfg.AttackRange)return false;this.doAttackStart();return true;}
    var t = this;
    this.node.getPosition(this.vec2_1);
    return !!function () {
      var e = null;
      var n = -1;
      var i = -1;
      var a = $z1KinghtFallUIGame.default.instance.ctrGame.ctrPlay;
      if (!a.isDead()) {
        a.node.getPosition(t.vec2_2);
        cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
        if (t.vec2_2.len() <= t.cfg.AttackRange) {
          e = a.node, n = t.vec2_2.len();
        }
      }
      var o = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getSoldierList();
      for (var r = 0; r < o.length; r++) {
        if (!(h = o[r]).isDead()) {
          h.node.getPosition(t.vec2_2);
          cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
          if (t.vec2_2.len() <= t.cfg.AttackRange && (-1 == n || t.vec2_2.len() < n)) {
            e = h.node, n = t.vec2_2.len();
          }
        }
      }
      var s = {
        position: t.node.convertToWorldSpaceAR(cc.Vec2.ZERO),
        radius: t.cfg.AttackRange
      };
      var l = millAttackTargets($z1KinghtFallUIGame.default.instance.ctrGame.gameData);
      for (var c = 0; c < l.length; c++) {
        var h;
        if ((h = l[c]).getIsWork()) {
          var g = Navigation.attackPartsOf(h);
          for (var u = 0; u < g.length; u++) {
            var d = g[u];
            if (cc.Intersection.polygonCircle(d.points, s)) {
              var targetDistance = Navigation.polygonDistance(t, d.points, $z1KinghtFallUIGame.default.instance.ctrGame);
              if (-1 == n || targetDistance < n) {
                i = true;
                e = d.tagNode;
                n = targetDistance;
              }
            }
          }
        }
      }
      if (e) {
        return {
          tag: e,
          canAtt: -1 == i ? n <= t.cfg.AttackRange : i
        };
      } else {
        return null;
      }
    }() && (this.doAttackStart(), true);
  };
  _ctor.prototype.doAttackStart = function (startCooldown) {
    if (GameToolsOverrides.isPending(this)) return;
    var ui = $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame, node = this.node;
    var renderer = this.getSpAni ? this.getSpAni() : this.spAni;
    if (!cc.isValid(renderer, true) || renderer.node && !cc.isValid(renderer.node, true)) return;
    var record = { ui: ui, game: game, data: game && game.gameData, epoch: game && game._combatEpoch, stage: game && game.gameStatus,
      node: node, generation: node && node._combatGeneration, timers: this.time, renderer: renderer };
    if (!attackCurrent(this, record)) return;
    this._attackAnimation = record;
    this.state = r.Attack;
    record.entry = renderer.setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Attack, false);
    if (this._attackAnimation !== record || !attackCurrent(this, record)) return;
    // Ranged attacks count their cooldown from animation start; melee waits
    // for its damage release. Both must register the same owned TrackEntry.
    this.time[s.Attack] = startCooldown === 0 ? 0 : -1;
    GameToolsOverrides.attack(this, "enemy", this.doAttack);
  };
  _ctor.prototype._completeAttackAnimation = function (renderer, entry) {
    var record = this._attackAnimation;
    if (!record || record.renderer !== renderer || record.entry !== entry || !attackCurrent(this, record)) return;
    this._attackAnimation = null;
    this.doAttackFinish();
  };
  _ctor.prototype.doAttack = function () {
    var ui = $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame;
    if (!game) return;
    var node = this.node, effects = ui.ctrEffect, record = { ui: ui, game: game, data: game.gameData, epoch: game._combatEpoch, stage: game.gameStatus,
      node: node, generation: node && node._combatGeneration, timers: this.time, renderer: this.spAni };
    if (!attackCurrent(this, record)) return;
    if (BattleSounds.attack) BattleSounds.attack(this, "enemy");
    if (!attackCurrent(this, record)) return;
    var t = this;
    this.time[s.Attack] = 0;
    this.node.getPosition(this.vec2_1);
    var e = this.getAttack();
    if (!attackCurrent(this, record)) return;
    var n = function () {
      var forced=RelicCombat.tauntedTarget(t);
      if(forced)return cc.Vec2.distance(t.node.getPosition(),forced.node.getPosition())<=t.cfg.AttackRange?forced:null;
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
      var s = millAttackTargets($z1KinghtFallUIGame.default.instance.ctrGame.gameData);
      for (var l = 0; l < s.length; l++) {
        var c;
        if ((c = s[l]).getIsWork()) {
          var h = Navigation.attackPartsOf(c).map(function(part){return part.points;});
          for (var g = 0; g < h.length; g++) {
            var u = h[g];
            if (cc.Intersection.polygonCircle(u, r)) {
              var targetDistance = Navigation.polygonDistance(t, u, $z1KinghtFallUIGame.default.instance.ctrGame);
              if (-1 == n || targetDistance < n) {
                e = c, n = targetDistance;
              }
            }
          }
        }
      }
      return e;
    }();
    if (n) {
      if (!attackCurrent(this, record)) return;
      var targetNode = n.node, targetGeneration = targetNode && targetNode._combatGeneration;
      var impactPoint=Navigation.attackPointOf(n,$z1KinghtFallUIGame.default.instance.ctrGame);this.vec2_2.x=impactPoint.x;this.vec2_2.y=impactPoint.y;
      GameToolsOverrides.counters(this, n) && (e *= Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.RestrainedArms)));
      var impact = this.vec2_2.clone(), origin = this.vec2_1.clone(), dealt = n.onAttacked(e, t);
      if (!attackCurrent(this, record, true) || ui.ctrEffect !== effects || !cc.isValid(effects, true)) return;
      if (cc.isValid(n, true) && n.node === targetNode && cc.isValid(targetNode, true) && targetNode._combatGeneration === targetGeneration && !n._isPooled) effects.showDamageNum(impact, dealt);
      if (!attackCurrent(this, record, true) || ui.ctrEffect !== effects || !cc.isValid(effects, true)) return;
      effects.onMonsterAttack(impact, "xb_gj");
      if (!attackCurrent(this, record, true)) return;
      this.vec2_1.x = origin.x; this.vec2_1.y = origin.y; this.vec2_2.x = impact.x; this.vec2_2.y = impact.y;
      cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
      return void this.setLeft(this.vec2_2.x < 0);
    }
  };
  _ctor.prototype.doAttackFinish = function () {
    this.doIdel();
  };
  _ctor.prototype.onAttacked = function (t, source, secondary, context) {
    var e;
    if (!this.isDead()) {
      var ui = $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame;
      var life = { node: this.node, generation: this.node._combatGeneration, timers: this.time, cfg: this.cfg, ui: ui, game: game, data: game && game.gameData, epoch: game && game._combatEpoch };
      t = RelicCombat.enemyDamage(this, t, source, secondary, context);
      t = GameToolsOverrides.damageTaken(this, "enemy", t);
      this.hp -= t;
      if (BattleSounds.hit) { BattleSounds.hit(this, source, t, { magic: !!secondary, context: context }); if (!incomingCurrent(this, life)) return t; }
      if (t > 0 && this.hp > 0 && cc.resources && !(source && source._styleRuntime && source._styleRuntime.deferHitReaction && source._styleRuntime.deferHitReaction(this, context))) {
        require("UnitHitFeedback").play(this);
        if (!incomingCurrent(this, life)) return t;
      }
      if (this.hp <= 0) {
        Navigation.reset(this);
        this.state = r.Dead;
        RelicCombat.releaseControl(this);
        RelicRuntime.clearControl(this);
        RelicCombat.enemyKilled(this, source, secondary, context);
        if (!incomingCurrent(this, life)) return t;
        this.delAllBuff();
        if (!incomingCurrent(this, life)) return t;
        if (!secondary) { RelicCombat.primaryImpact(this, source, context, t); if (!incomingCurrent(this, life)) return t; }
        this.playDeath(function () {
          this.freeNode();
        });
        // An ordinary missing/finished death animation may synchronously pool
        // this corpse. Its one retirement still owns the kill; a fresh init does not.
        if (!incomingCurrent(this, life, true)) return t;
        var missions = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData();
        if (missions.recordQuestEvent) {
          var data = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data;
          var profileId=life.cfg.ProfileBaseID||life.cfg.ID,form=profileId>=90010&&profileId<=90012?String(profileId-90009):"default";
          var role = life.cfg.FightingType || data && data.GameTools && data.GameTools.unitTypeAssignments && data.GameTools.unitTypeAssignments["enemy:" + profileId + ":" + form];
          missions.recordQuestEvent($z1KinghtFallEnum.KinghtFallEnumTaskEnum.SoldierDefeated, 1, false, role);
        }
        else {
        var n = missions.getTaskInfo();
        if (n.type == $z1KinghtFallEnum.KinghtFallEnumTaskEnum.SoldierDefeated) {
          n.num++;
          $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().setTaskInfo(n);
        }
        }
        if (!incomingCurrent(this, life, true)) return t;
        $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.Kill, 1);
        if (!incomingCurrent(this, life, true)) return t;
      }
      null === (e = this.hpctrl) || undefined === e || e.setHp(this.hp, this.hpMax);
      if (!secondary && this.hp > 0 && incomingCurrent(this, life)) RelicCombat.primaryImpact(this, source, context, t);
      return t;
    }
  };
  _ctor.prototype.freeNode = function () {
    if (this._isPooled) return;
    var owner = this, node = this.node, data = this._combatData || setupLife(this).data;
    var key = $z1KinghtFallConfig.KinghtFallPoolName.Enemy + "_" + (this._poolCfgID || this.cfg.ID);
    this._isPooled = true;
    var generation = node._combatGeneration = (node._combatGeneration || 0) + 1;
    function retired() { return cc.isValid(owner, true) && owner.node === node && cc.isValid(node, true) && node._combatGeneration === generation && owner._isPooled; }
    // Unlink this lease before cleanup can initialize the same component again.
    if (data) data.delEnemy(this);
    if (!retired()) return;
    this._attackAnimation = null;
    Navigation.reset(this);
    this.bornInfo = null;
    this._routeInterrupted = false;
    RelicCombat.releaseControl(this);
    RelicRuntime.clearControl(this);
    this._deathAnimation = null;
    if (cc.resources) { require("UnitHitFeedback").reset(this); if (!retired()) return; }
    if (this.hpctrl) { this.hpctrl.setHp(0, this.hpMax); if (!retired()) return; }
    this.releaseHealingEffects();
    if (!retired()) return;
    GameToolsOverrides.cancel(this);
    this._targetSearchCache = null;
    this._unreachableTargets = null;
    $z1PoolMgr.PoolMgr.getInstance().freeNode(key, node);
  };
  _ctor.prototype.onDestroy = function () {
    this.releaseHealingEffects();
    if (t.prototype.onDestroy) t.prototype.onDestroy.call(this);
  };
  _ctor.prototype.isDead = function () {
    return this.state == r.Dead;
  };
  _ctor.prototype.setPause = function (t) {
    this.rigidBody.linearVelocity = cc.Vec2.ZERO;
    this.spAni.paused = t;
  };
  _ctor.prototype.getAttack = function () {
    var t = this.attack;
    var e = 1;
    var n = this.getBuffList($z1KinghtFallInterface.KinghtFallEnemyBuffType.DamageCut);
    for (var i = 0; i < n.length; i++) {
      e -= n[i].data.subNum;
    }
    if (2 == this.cfg.AttackType) {
      var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff33);
      a && (e -= a.Pamer[0]);
      var o = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff56);
      o && (e -= o.Pamer[0]);
    }
    e < 0 && (e = 0);
    return t * e;
  };
  _ctor.prototype.getAttSpeed = function () {
    var t = this.cfg.AttackInterval;
    var e = 1;
    var n = this.getBuffList($z1KinghtFallInterface.KinghtFallEnemyBuffType.AttackSpeed);
    for (var i = 0; i < n.length; i++) {
      e += n[i].data.addSpeed;
    }
    return t * e;
  };
  _ctor.prototype.getSpeed = function () {
    var t = this.cfg.Speed;
    var e = 1;
    var n = this.getBuffList($z1KinghtFallInterface.KinghtFallEnemyBuffType.MoveSpeed);
    for (var i = 0; i < n.length; i++) {
      e -= n[i].data.subNum;
    }
    $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.SlowSpell] && (e -= $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.SlowSpell][0]);
    e < 0 && (e = .01);
    return t * e;
  };
  _ctor.prototype.addHpPro = function (t) {
    var e;
    var n;
    if (!this.isDead()) {
      var soundHp = this.hp;
      this.hp += t * this.hpMax;
      this.hp > this.hpMax && (this.hp = this.hpMax);
      if (this.hp > soundHp && BattleSounds.effect) BattleSounds.effect("healing-receive", this);
      null === (e = this.hpctrl) || undefined === e || e.setHp(this.hp, this.hpMax);
      null === (n = this.hpctrl) || undefined === n || n.showAni();
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
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallInterface.KinghtFallInterface);
exports.default = def_KinghtFallEnemyBase;
(function (t) {
  t[t.Idle = 0] = "Idle";
  t[t.Move = 1] = "Move";
  t[t.Attack = 2] = "Attack";
  t[t.Wait = 3] = "Wait";
  t[t.Dead = 4] = "Dead";
})(r = exports.KinghtFallEnemyStatus || (exports.KinghtFallEnemyStatus = {}));
(function (t) {
  t.Attack = "Attack";
})(s || (s = {}));
