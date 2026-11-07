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
      switch (t.animation.name) {
        case $z1KinghtFallModle.KinghtFallSoldierAniEnum.Attack:
          e.doAttackFinish();
          break;
        case $z1KinghtFallModle.KinghtFallSoldierAniEnum.Die:
          e.freeNode();
      }
    });
    this.spAni3.setCompleteListener(function (t) {
      switch (t.animation.name) {
        case $z1KinghtFallModle.KinghtFallSoldierAniEnum.Attack:
          e.doAttackFinish();
          break;
        case $z1KinghtFallModle.KinghtFallSoldierAniEnum.Die:
          e.freeNode();
      }
    });
  };
  _ctor.prototype.start = function () {
    t.prototype.start.call(this);
    $z1KinghtFallUIGame.default.instance.ctrEffect.loadEffect($z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier10Attack);
    $z1KinghtFallUIGame.default.instance.ctrEffect.loadEffect($z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier10Buff);
  };
  _ctor.prototype.doAttackStart = function () {
    if (GameToolsOverrides.isPending(this)) return;
    this.state = $z1KinghtFallEnemyBase.KinghtFallEnemyStatus.Attack;
    this.getSpAni().setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Attack, false);
    this.time[r.Attack] = -1;
    GameToolsOverrides.attack(this, "enemy", this.doAttack);
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
          var h = c.getWposPhyCol2();
          for (var u = 0; u < h.length; u++) {
            var d = h[u];
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
      n.cfg && this.cfg.Suppressed == n.cfg.ID && (e *= Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.RestrainedArms)));
      $z1KinghtFallUIGame.default.instance.ctrEffect.showDamageNum(this.vec2_2.clone(), n.onAttacked(e, t));
      switch (this.cfg.ID) {
        case 90010:
          $z1KinghtFallUIGame.default.instance.ctrEffect.onMonsterAttack(this.vec2_2.clone(), "xb_gj");
          break;
        case 90011:
          $z1KinghtFallUIGame.default.instance.ctrEffect.onMonsterAttack(this.vec2_2.clone(), "bz2_zh");
          break;
        case 90012:
          $z1KinghtFallUIGame.default.instance.ctrEffect.onMonsterAttack(this.vec2_2.clone(), "boss_gj");
      }
      cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
      return void this.setLeft(this.vec2_2.x < 0);
    }
  };
  _ctor.prototype.initData = function (e, n) {
    this._transform = null;
    t.prototype.initData.call(this, e, n);
    this.spIdx = 0;
    this.spAni.node.active = true;
    this.spAni2.node.active = false;
    this.spAni3.node.active = false;
    this.spAniUp.node.active = false;
    this.time[r.Spell] = 0;
    this.time[r.SpellMax] = this.cfg.Data[1];
    this.setBody(this.getSpAni().node);
  };
  _ctor.prototype.upData = function (t) {
    var boss = this, transform = this._transform = {};
    GameToolsOverrides.cancel(this);
    this.state = $z1KinghtFallEnemyBase.KinghtFallEnemyStatus.Wait;
    this.rigidBody.linearVelocity = cc.Vec2.ZERO;
    this.getSpAni().node.active = false;
    this.spIdx++;
    this.setBody(this.getSpAni().node);
    this.spAniUp.node.active = true;
    var entry = this.spAniUp.setAnimation(0, this.spAniUp.defaultAnimation, false);
    this.spAniUp.setTrackCompleteListener(entry, function () {
      if (boss._transform !== transform || boss._isPooled || !cc.isValid(boss, true) || !cc.isValid(boss.node, true) || boss.isDead()) return;
      boss._transform = null;
      boss.spAniUp.node.active = false;
      boss.getSpAni().node.active = true;
      boss.doMove();
    });
    this.cfg = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById(t);
    this.attack = Math.round(this.cfg.AttackDamage * $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getAttAdd(this.cfg.ID));
    this.time = {};
    this.time[r.Attack] = 0;
    this.time[r.Spell] = 0;
    this.time[r.SpellMax] = this.cfg.Data[1];
    this.hpMax = this.cfg.Health * $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getHpAdd(this.cfg.ID);
    this.hp = this.hpMax;
    this.hpctrl && this.hpctrl.setHp(this.hp, this.hpMax);
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
  };
  _ctor.prototype.onUpdate = function (e) {
    if (!this.isDead()) {
      this.time[r.Spell] += e;
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
    if (1 == this.cfg.Data[0]) {
      this.upData(this.cfg.Data[2]);
    } else {
      this.time[r.Spell] = 0;
      var t = [];
      this.node.getPosition(this.vec2_1);
      var e = $z1KinghtFallUIGame.default.instance.ctrGame.ctrPlay;
      if (!e.isDead()) {
        e.node.getPosition(this.vec2_2);
        (a = this.vec2_1.sub(this.vec2_2).mag()) <= this.cfg.Data[3] && t.push({
          len: a,
          item: e
        });
      }
      var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getSoldierList();
      for (var i = 0; i < n.length; i++) {
        var a;
        if (!(f = n[i]).isDead()) {
          f.node.getPosition(this.vec2_2);
          (a = this.vec2_1.sub(this.vec2_2).mag()) <= this.cfg.Data[3] && t.push({
            len: a,
            item: f
          });
        }
      }
      var o = {
        position: this.node.convertToWorldSpaceAR(cc.Vec2.ZERO),
        radius: this.cfg.Data[3]
      };
      var l = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getBulidList();
      for (i = 0; i < l.length; i++) {
        if ((f = l[i]).getIsWork()) {
          var c = f.getWposPhyCol();
          for (var h = 0; h < c.length; h++) {
            var d = c[h];
            if (cc.Intersection.polygonCircle(d, o)) {
              t.push({
                len: cc.Vec2.distance(f.node.getPosition(), this.vec2_1),
                item: f
              });
              break;
            }
          }
        }
      }
      $z1KinghtFallUIGame.default.instance.ctrEffect.onMoveTrack(this.node.getPosition(), $z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier10Attack, $z1KinghtFallConfig.KinghtFallPoolName.Soldier10Attack);
      t.sort(function (t, e) {
        return t.len - e.len;
      });
      for (var p = 0; p < this.cfg.Data[4]; p++) {
        var f;
        if (!(f = t[p])) {
          break;
        }
        f.item.addBuff($z1KinghtFallInterface.KinghtFallEnemyBuffType.DamageCut, {
          subNum: this.cfg.Data[2],
          time: this.cfg.Data[5]
        });
      }
    }
  };
  _ctor.prototype.setLeft = function (t) {
    this.getSpAni().node.scaleX = t ? -this.getSpAni().node.scaleY : this.getSpAni().node.scaleY;
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
