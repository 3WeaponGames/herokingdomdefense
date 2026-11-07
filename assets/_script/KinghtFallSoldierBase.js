var i;
var GameToolsOverrides = require("GameToolsOverrides");
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
    e.findInx = 0;
    e.findMin = .2;
    e.findLen = 10;
    e.obsObj = [];
    e.nextFind = false;
    e.finIndex = 0;
    e.lastFind = false;
    e.isAgg = false;
    e.navigationTeam = "friendly";
    e.rallyPoint = null;
    e._targetRefresh = 0;
    e._orderTarget = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    var t = this;
    this.rigidBody = this.node.getComponent(cc.RigidBody);
    this.spAni.setCompleteListener(function (e) {
      switch (e.animation.name) {
        case $z1KinghtFallModle.KinghtFallSoldierAniEnum.Attack:
          t.doAttackFinish();
      }
    });
  };
  _ctor.prototype.start = function () {
    this.setBody(this.spAni.node);
  };
  _ctor.prototype.setParent = function (t) {
    this.outBuild = t;
  };
  _ctor.prototype.initData = function (t) {
    GameToolsOverrides.cancel(this);
    var e = this;
    this.node._combatGeneration = (this.node._combatGeneration || 0) + 1;
    this.node._combatActor = this;
    this._isPooled = false;
    Navigation.reset(this);
    this.rallyPoint = null;
    this.pathList = null;
    this.isAgg = false;
    this._orderTarget = null;
    this._targetRefresh = 0;
    this._settledPoint = null;
    this._retaliationTarget = null;
    this._retaliationTime = 0;
    this._retaliationPosition = null;
    this.cfg = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById(t);
    this.attackRange = this.cfg.AttackRange;
    var n = this.node.getComponents(cc.CircleCollider);
    if (n[0]) {
      n[0].radius = this.attackRange;
    } else {
      this.node.addComponent(cc.CircleCollider).radius = this.attackRange;
    }
    if (n[1]) {
      n[1].radius = this.attackRange + this.cfg.SearchRange;
    } else {
      this.node.addComponent(cc.CircleCollider).radius = this.attackRange + this.cfg.SearchRange;
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
    switch (this.cfg.ID) {
      case 90001:
        if ($z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.PerseveranceSymbol]) {
          s += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.PerseveranceSymbol][0];
          r += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.PerseveranceSymbol][1];
        }
        break;
      case 90002:
        if ($z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.TurtlePower]) {
          s += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.TurtlePower][0];
          r += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.TurtlePower][1];
        }
        break;
      case 90003:
        if ($z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.BowmanStrike]) {
          s += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.BowmanStrike][0];
          r += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.BowmanStrike][1];
        }
        break;
      case 90004:
        if ($z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.knightHood]) {
          s += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.knightHood][0];
          r += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.knightHood][1];
        }
    }
    this.hpMax = this.cfg.Health * r;
    this.hp = this.hpMax;
    if (this.hpctrl) {
      this.hpctrl.setType($z1KinghtFallModle.KinghtFallGameArmy.Friend);
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
        e.hpctrl.setType($z1KinghtFallModle.KinghtFallGameArmy.Friend);
        e.hpctrl.setHp(e.hp, e.hpMax);
      });
    }
    this.attack = this.cfg.AttackDamage * s;
    this.time = {};
    this.time[l.Attack] = 0;
    this.node.getPosition(this.vec2_1);
    this.node.zIndex = Math.floor(cc.winSize.height) - Math.floor(this.vec2_1.y);
    this.doIdel();
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
            this.delBuffIdx(n), n--;
          }
        }
      }
      -1 != this.time[l.Attack] && (this.time[l.Attack] += t * this.getAttSpeed());
      if (this.state == s.Attack) return;
      var game = $z1KinghtFallUIGame.default.instance.ctrGame;
      var position = Navigation.positionOf(this.node, game);
      var target = this._orderTarget;
      this._retaliationTime = Math.max(0, (this._retaliationTime || 0) - t);
      // Allow a slow unit or a gate detour to finish the response. The timeout
      // abandons stalled pursuit, rather than expiring while it makes progress.
      if (this._retaliationTime > 0 && target === this._retaliationTarget && this._retaliationPosition && cc.Vec2.distance(position, this._retaliationPosition) > .1) {
        this._retaliationTime = 3;
        this._retaliationPosition = position;
      }
      var searchRange = this.attackRange + this.cfg.SearchRange;
      if (target && target === this._retaliationTarget && this._retaliationTime > 0) searchRange += target.attackRange || target.cfg && target.cfg.AttackRange || 0;
      if (target && (target.isDead() || !target.node.activeInHierarchy || target.node._combatGeneration !== this._orderTargetGeneration || cc.Vec2.distance(position, Navigation.positionOf(target.node, game)) > searchRange)) {
        target = this._orderTarget = null;
        this._targetRefresh = 0;
      }
      // Combat can interrupt either order, but never consumes its destination.
      // Bound acquisition work instead of scanning every enemy every frame.
      this._targetRefresh -= t;
      if (this._targetRefresh <= 0) {
        var found = this.getFind();
        target = this._orderTarget = found && found.tag;
        this._orderTargetGeneration = target && target.node._combatGeneration;
        this._targetRefresh = .2;
      }
      var goal = null, formation = null;
      if (target) {
        goal = Navigation.positionOf(target.node, game);
        this._settledPoint = null;
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
        formation = game.getArmyOrderGoal && game.getArmyOrderGoal(this, goal);
        if (!formation && this._settledPoint && cc.Vec2.distance(position, this._settledPoint) < 3) {
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
  _ctor.prototype.findObg = function (t) {
    if (!this.lastPos) {
      this.lastPos = this.node.getPosition();
      this.findInx = 0;
    }
    this.node.getPosition(this.vec2_1);
    if (!(cc.Vec2.distance(this.vec2_1, this.lastPos) <= this.findLen)) {
      this.lastPos = this.node.getPosition();
      return void (this.findInx = 0);
    }
    this.findInx += t;
    if (this.findInx >= this.findMin) {
      this.lastPos = null;
      this.findObg2();
    }
  };
  _ctor.prototype.findObg2 = function () {
    var t = {
      position: this.getWpos(),
      radius: 30
    };
    var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getBulidList();
    for (var n = 0; n < e.length; n++) {
      if ((l = e[n]).getIsWork()) {
        var i = l.getWposPhyCol();
        for (var a = 0; a < i.length; a++) {
          var o = i[a];
          if (cc.Intersection.polygonCircle(o, t)) {
            return void ((g = l.getMoveToPos(this.getWpos(), this.obsObj)) && (this.obsPos = g.pos, this.obsObj.push(g.node), this.nextFind = false));
          }
        }
      }
    }
    var r = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.obstacles;
    for (var s = 0; s < r.length; s++) {
      var l;
      var c = (l = r[s]).getWposPhyCol();
      for (var h = 0; h < c.length; h++) {
        var g;
        if (cc.Intersection.polygonCircle(c[h], t)) {
          return void ((g = l.getMoveToPos(this.getWpos(), this.obsObj)) && (this.obsPos = g.pos, this.obsObj.push(g.node), this.nextFind = true));
        }
      }
    }
  };
  _ctor.prototype.setLeft = function (t) {
    this.spAni.node.scaleX = t ? -this.spAni.node.scaleY : this.spAni.node.scaleY;
  };
  _ctor.prototype.doWait = function () {
    this.state = s.Wait;
    this.rigidBody.linearVelocity = cc.Vec2.ZERO;
    this.spAni.setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Idle, true);
  };
  _ctor.prototype.doIdel = function () {
    this.state = s.Idle;
    this.rigidBody.linearVelocity = cc.Vec2.ZERO;
    this.spAni.setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Idle, true);
  };
  _ctor.prototype.doMove = function () {
    this.state = s.Move;
    this.spAni.setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Move, true);
  };
  _ctor.prototype.isFind = function () {
    var t = this;
    return !!this.isAgg || (this.finIndex++, this.finIndex % 3 != 0 ? this.lastFind : (this.finIndex = 0, this.node.getPosition(this.vec2_1), !!function () {
      var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getEnemyList();
      for (var n = 0; n < e.length; n++) {
        var i = e[n];
        if (!i.isDead() && (i.node.getPosition(t.vec2_2), cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1), t.vec2_2.len() <= t.attackRange + t.cfg.SearchRange)) {
          return true;
        }
      }
      return false;
    }()));
  };
  _ctor.prototype.getFind = function () {
    var attacker = this._retaliationTarget;
    if (this._retaliationTime > 0 && attacker && !attacker.isDead() && attacker.node.activeInHierarchy && attacker.node._combatGeneration === this._retaliationGeneration) {
      attacker.node.getPosition(this.vec2_2);
      var retaliationDistance = cc.Vec2.distance(this.vec2_1, this.vec2_2);
      var attackerRange = attacker.attackRange || attacker.cfg && attacker.cfg.AttackRange || 0;
      if (retaliationDistance <= this.attackRange + this.cfg.SearchRange + attackerRange) return { tag: attacker, canAtt: retaliationDistance <= this.attackRange };
    }
    var t = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getEnemyList();
    var e = null;
    var n = -1;
    for (var i = 0; i < t.length; i++) {
      var a = t[i];
      if (!a.isDead()) {
        a.node.getPosition(this.vec2_2);
        cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
        if (this.vec2_2.len() <= this.attackRange + this.cfg.SearchRange && (-1 == n || this.vec2_2.len() < n)) {
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
    var t = this;
    this.node.getPosition(this.vec2_1);
    return !!function () {
      var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getEnemyList();
      var n = null;
      var i = -1;
      for (var a = 0; a < e.length; a++) {
        var o = e[a];
        if (!o.isDead()) {
          o.node.getPosition(t.vec2_2);
          cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
          if (t.vec2_2.len() <= t.attackRange && (-1 == i || t.vec2_2.len() < i)) {
            i = t.vec2_2.len(), n = o;
          }
        }
      }
      return n;
    }() && (this.doAttackStart(), true);
  };
  _ctor.prototype.doAttackStart = function () {
    if (GameToolsOverrides.isPending(this)) return;
    this.state = s.Attack;
    this.spAni.setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Attack, false);
    this.time[l.Attack] = -1;
    GameToolsOverrides.attack(this, "ally", this.doAttack);
  };
  _ctor.prototype.doAttack = function () {
    var t = this;
    this.time[l.Attack] = 0;
    this.node.getPosition(this.vec2_1);
    var e = this.getAttack();
    var n = function () {
      var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getEnemyList();
      var n = null;
      var i = -1;
      for (var a = 0; a < e.length; a++) {
        var o = e[a];
        if (!o.isDead()) {
          o.node.getPosition(t.vec2_2);
          cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
          if (t.vec2_2.len() <= t.attackRange && (-1 == i || t.vec2_2.len() < i)) {
            n = o, i = t.vec2_2.len();
          }
        }
      }
      return n;
    }();
    if (n) {
      n.node.getPosition(this.vec2_2);
      this.cfg.Suppressed == n.cfg.ID && (e *= Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.RestrainedArms)));
      n.onAttacked(e);
      $z1KinghtFallUIGame.default.instance.ctrEffect.showDamageNum(n.node.getPosition(), e);
      $z1KinghtFallUIGame.default.instance.ctrEffect.onMonsterAttack(n.node.getPosition(), "xb_gj");
      cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
      this.setLeft(this.vec2_2.x < 0);
    }
  };
  _ctor.prototype.doAttackFinish = function () {
    this.doIdel();
  };
  _ctor.prototype.onAttacked = function (t, attacker) {
    if (!this.isDead()) {
      if (attacker && attacker.node && attacker.isDead && !attacker.isDead()) {
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
      if (this.hp <= 0) {
        this.state = s.Dead;
        $z1KinghtFallUIGame.default.instance.ctrEffect.onSoldierDead(this.node.getPosition(), .25);
        this.delAllBuff();
        this.node.active = false;
        this.outBuild.addDie(this);
        var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff16);
        a && $z1KinghtFallUIGame.default.instance.ctrGame.ctrPlay.addHpPro(a.Pamer[0]);
      } else {
        $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.VengefulRage] && this.addBuff($z1KinghtFallInterface.KinghtFallEnemyBuffType.DamageAdd, {
          addNum: $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.VengefulRage][0],
          time: 2
        });
      }
      this.hpctrl && this.hpctrl.setHp(this.hp, this.hpMax);
      return t * e;
    }
  };
  _ctor.prototype.freeNode = function () {
    if (this._isPooled) return;
    if (this.hpctrl) this.hpctrl.setHp(0, this.hpMax);
    GameToolsOverrides.cancel(this);
    this._isPooled = true;
    this.node._combatGeneration = (this.node._combatGeneration || 0) + 1;
    var t = $z1KinghtFallConfig.KinghtFallPoolName.Soldier + "_" + this.cfg.ID;
    $z1PoolMgr.PoolMgr.getInstance().freeNode(t, this.node);
    $z1KinghtFallUIGame.default.instance.ctrGame.gameData.delSoldier(this);
  };
  _ctor.prototype.isDead = function () {
    return this.state == s.Dead;
  };
  _ctor.prototype.setPause = function (t) {
    this.rigidBody.linearVelocity = cc.Vec2.ZERO;
    this.spAni.paused = t;
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
    e < 0 && (e = 0);
    return t * e;
  };
  _ctor.prototype.getAttSpeed = function () {
    var t = this.attSpeed;
    var e = 1;
    var n = this.getBuffList($z1KinghtFallInterface.KinghtFallEnemyBuffType.AttackSpeed);
    for (var i = 0; i < n.length; i++) {
      e += n[i].data.addSpeed;
    }
    var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff44);
    a && (e += a.Pamer[0]);
    switch (this.cfg.AttackType) {
      case 1:
        $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.StrikeSword] && (e += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.StrikeSword][0]);
        break;
      case 2:
        $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.DartingTalisman] && (e += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.DartingTalisman][0]);
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
    var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff31);
    a && (e += a.Pamer[0]);
    var o = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff44);
    o && (e -= o.Pamer[1]);
    var r = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff52);
    r && (e += r.Pamer[0]);
    $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.WindstormBoots] && (e += $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.WindstormBoots][0]);
    return t * e;
  };
  _ctor.prototype.addHpPro = function (t) {
    if (!this.isDead()) {
      this.hp += t * this.hpMax;
      this.hp > this.hpMax && (this.hp = this.hpMax);
      this.hpctrl && this.hpctrl.setHp(this.hp, this.hpMax);
    }
  };
  _ctor.prototype.setNew = function () {
    GameToolsOverrides.cancel(this);
    var t;
    this.node._combatGeneration = (this.node._combatGeneration || 0) + 1;
    Navigation.reset(this);
    this.hp = this.hpMax;
    null === (t = this.hpctrl) || undefined === t || t.setHp(this.hp, this.hpMax);
    this.node.active = true;
    this.pathList = null;
    this.isAgg = false;
    this.time[l.Attack] = 0;
    this.doIdel();
    this._orderTarget = null;
    this._targetRefresh = 0;
    this._retaliationTarget = null;
    this._retaliationTime = 0;
    this._retaliationPosition = null;
    this.applyArmyOrder($z1KinghtFallUIGame.default.instance.ctrGame);
  };
  _ctor.prototype.getWpos = function () {
    return this.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
  };
  _ctor.prototype.applyArmyOrder = function (game) {
    Navigation.reset(this);
    this.rallyPoint = game.rallyPoint || null;
    this.isAgg = !this.rallyPoint && !!game.isAgg;
    this.pathList = null;
    this._settledPoint = null;
    this._armyProgressPoint = null;
    this._armyStalledTime = 0;
    if (!this.isDead() && this.state != s.Attack) {
      if (this.rallyPoint || this.isAgg) this.doMove();
      else this.doIdel();
    }
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
    this.obsPos = null;
    this.obsObj = [];
    this.lastPos = null;
    this.doMove();
    return true;
  };
  _ctor.prototype.upPath = function () {
    this.setPath($z1KinghtFallUIGame.default.instance.ctrGame.pathList, this.isAgg);
    this.doMove();
  };
  _ctor.prototype.initBuffData = function () {
    var t = 1;
    this.hpMax = this.cfg.Health;
    var e = 1;
    var treasureNames = { 90001: "PerseveranceSymbol", 90002: "TurtlePower", 90003: "BowmanStrike", 90004: "knightHood" };
    var treasureId = $z1KinghtFallEnum.KinghtFallEnumTreasureEnum[treasureNames[this.cfg.ID]];
    var treasure = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[treasureId];
    if (treasure) e += treasure[1];
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
    this.attack = this.cfg.AttackDamage;
    var s = 1;
    if (treasure) s += treasure[0];
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
      u[1].radius = this.attackRange + this.cfg.SearchRange;
    } else {
      this.node.addComponent(cc.CircleCollider).radius = this.attackRange + this.cfg.SearchRange;
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
