var BattleSounds = require("BattleSounds");
var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1UIMgr = require("UIMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallInterface = require("KinghtFallInterface");
var $z1KinghtFallBuildBase = require("KinghtFallBuildBase");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallBuildWall = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndAniEffect = null;
    e.polyPoints = [];
    e.isOpen = false;
    e.wallFacing = "";
    e.wallOpening = "";
    e.wallRotation = 0;
    e.wallRun = "";
    e.wallFixtureTags = "";
    e.wallHasGate = true;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    // Register leaf contacts before its fixtures are created. Allies and enemies
    // share a physics group, so opening must filter contacts rather than remove
    // the body that prevents a crowd from pushing enemies through the gate.
    var body = this.node.getComponent(cc.RigidBody);
    if (body) body.enabledContactListener = true;
    t.prototype.onLoad.call(this);
  };
  _ctor.prototype.onPreSolve = function (contact, self, other) {
    if (!this.isOpen || self.node !== this.node || self.tag != this.getColliderIndex()) return;
    var node = other.body ? other.body.node : other.node;
    var enemy = node.getComponents(cc.Component).some(function (component) {
      return component.navigationTeam === "enemy";
    });
    // Re-evaluate every physics step: a friendly contact can remain alive while
    // the gate shuts. A permanently disabled contact would let it cross later.
    if (!enemy) contact.disabledOnce = true;
  };
  _ctor.prototype._openGateCollider = function () {
    var gate = this;
    this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (collider) {
      var growing = gate._colliderTweens && gate._colliderTweens.has(collider);
      gate._stopColliderTween(collider);
      collider.enabled = collider.tag == gate.getColliderIndex();
      if (growing && collider.enabled) collider.apply();
    });
  };
  _ctor.prototype.start = function () {
    t.prototype.start.call(this);
    this.ndAniEffect.node.active = false;
  };
  // The leaf remains an enemy obstacle while the visual gate admits allies.
  // Use the authored points: upgrade/shut tweens temporarily shrink physics.
  _ctor.prototype.getNavigationGateShapes = function () {
    if (!this.index || this.isDestroyed || !this.node.activeInHierarchy || this.wallHasGate === false) return [];
    var gate = this;
    return this.node.getComponents(cc.PhysicsPolygonCollider).filter(function (collider) {
      return collider.tag == gate.index;
    }).map(function (collider) {
      var offset = collider.offset || cc.Vec2.ZERO;
      return { collider: collider, points: (gate.colPoint[collider.uuid] || collider.points).map(function (point) {
        return collider.node.convertToWorldSpaceAR(cc.v2(point.x + offset.x, point.y + offset.y));
      }) };
    });
  };
  _ctor.prototype.hasFriendlyAtGate = function (game) {
    if (this.wallHasGate === false) return false;
    var trigger = this.node.getComponent(cc.PolygonCollider);
    if (!trigger || !trigger.points || trigger.points.length < 3) return false;
    var offset = trigger.offset || cc.Vec2.ZERO;
    // World positions cannot be cached at start: the map moves on resize.
    var polygon = trigger.points.map(function (point) {
      return trigger.node.convertToWorldSpaceAR(cc.v2(point.x + offset.x, point.y + offset.y));
    });
    this.polyPoints = polygon;
    function approaching(unit) {
      if (!unit || !unit.node || !unit.node.activeInHierarchy || unit.isDead && unit.isDead()) return false;
      var radius = 24;
      unit.node.getComponents(cc.PhysicsCircleCollider).forEach(function (collider) {
        radius = Math.max(radius, collider.radius + 12);
      });
      var origin = unit.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
      var edge = unit.node.convertToWorldSpaceAR(cc.v2(radius, 0));
      var top = unit.node.convertToWorldSpaceAR(cc.v2(0, radius));
      radius = Math.max(cc.Vec2.distance(origin, edge), cc.Vec2.distance(origin, top));
      return cc.Intersection.polygonCircle(polygon, { position: origin, radius: radius });
    }
    if (approaching(game.ctrPlay)) return true;
    var soldiers = game.gameData.getSoldierList();
    for (var i = 0; i < soldiers.length; i++) if (approaching(soldiers[i])) return true;
    return false;
  };
  _ctor.prototype.setLevel = function (e) {
    if (this._buildingBlockerRuntime) require("BuildingBlockerRuntime").dispose(this);
    if (this._wallRunRuntime || this.ndAniMain && this.ndAniMain.skeletonData && this.ndAniMain.skeletonData.skeletonJson && this.ndAniMain.skeletonData.skeletonJson.wallKit) require("WallRunRuntime").apply(this);
    if (this.wallFacing || this._gateFacingRuntime) require("GateFacingRuntime").apply(this);
    t.prototype.setLevel.call(this, e);
    this.ndAniEffect.node.active = false;
    this.isOpen = false;
  };
  _ctor.prototype._gateAnimation = function (component, name) {
    var json=component&&component.skeletonData&&component.skeletonData.skeletonJson;
    return require("GateFacing").animation(json,name,this.wallOpening,this.isOpen);
  };
  _ctor.prototype.setLight = function (t) {
    var e = this;
    if (this.buildCfg.enumValue != $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None) {
      this.ndLockList.forEach(function (n, i) {
        var a;
        n.active = !t && i == ((null === (a = e.buildInfo) || undefined === a ? undefined : a.cfg) ? e.buildInfo.cfg.level : 0) && e.canLock && e.buildInfo.canUpgrade;
        n.getChildByName("sprPro") && (n.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = 0);
      });
      if (this.canLock && 0 != this.index) {
        if (this.isDestroyed) {
          this.isDestroyed = false, this.doUpgreadAni();
        } else if (t) {
          if (this.isOpen) {
            this.ndAniMain.setAnimation(0, this._gateAnimation(this.ndAniMain, $z1KinghtFallBuildBase.KinghtFallBuildAniName.fade_in), false), this.ndAniMain.addAnimation(0, this._gateAnimation(this.ndAniMain, $z1KinghtFallBuildBase.KinghtFallBuildAniName.open_night), false), this.ndAniDown && (this.ndAniDown.setAnimation(0, this._gateAnimation(this.ndAniDown, $z1KinghtFallBuildBase.KinghtFallBuildAniName.fade_in), false), this.ndAniDown.addAnimation(0, this._gateAnimation(this.ndAniDown, $z1KinghtFallBuildBase.KinghtFallBuildAniName.open_night), false)), this.ndAniOther.forEach(function (t) {
              t.setAnimation(0, e._gateAnimation(t, $z1KinghtFallBuildBase.KinghtFallBuildAniName.fade_in), false);
              t.addAnimation(0, e._gateAnimation(t, $z1KinghtFallBuildBase.KinghtFallBuildAniName.open_night), false);
            });
          } else {
            this.ndAniMain.setAnimation(0, this._gateAnimation(this.ndAniMain, $z1KinghtFallBuildBase.KinghtFallBuildAniName.fade_in), false), this.ndAniMain.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle_night, true), this.ndAniDown && (this.ndAniDown.setAnimation(0, this._gateAnimation(this.ndAniDown, $z1KinghtFallBuildBase.KinghtFallBuildAniName.fade_in), false), this.ndAniDown.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle_night, true)), this.ndAniOther.forEach(function (t) {
              t.setAnimation(0, e._gateAnimation(t, $z1KinghtFallBuildBase.KinghtFallBuildAniName.fade_in), false);
              t.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle_night, true);
            });
          }
        } else if (this.isOpen) {
          this.ndAniMain.setAnimation(0, this._gateAnimation(this.ndAniMain, $z1KinghtFallBuildBase.KinghtFallBuildAniName.open), false), this.ndAniDown && this.ndAniDown.setAnimation(0, this._gateAnimation(this.ndAniDown, $z1KinghtFallBuildBase.KinghtFallBuildAniName.open), false), this.ndAniOther.forEach(function (t) {
            t.setAnimation(0, e._gateAnimation(t, $z1KinghtFallBuildBase.KinghtFallBuildAniName.open), false);
          });
        } else {
          this.ndAniMain.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, true), this.ndAniDown && this.ndAniDown.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, true), this.ndAniOther.forEach(function (t) {
            t.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, true);
          });
        }
      }
    }
  };
  _ctor.prototype.doTime = function () {
    var t;
    var e = this;
    if (!this.index || this.isDestroyed || this.wallHasGate === false) return;
    var n = this.hasFriendlyAtGate($z1KinghtFallUIGame.default.instance.ctrGame);
    if (n) this._openGateCollider();
    if (n != this.isOpen) {
      this.isOpen = n;
      if (BattleSounds.effect) BattleSounds.effect(this.isOpen ? "gate-open" : "gate-close", this);
      if (this.isOpen) {
        t = $z1KinghtFallUIGame.default.instance.ctrGame.gameStatus == $z1KinghtFallModle.KinghtFallGameStage.Prepare ? $z1KinghtFallBuildBase.KinghtFallBuildAniName.open : $z1KinghtFallBuildBase.KinghtFallBuildAniName.open_night;
      } else {
        t = $z1KinghtFallUIGame.default.instance.ctrGame.gameStatus == $z1KinghtFallModle.KinghtFallGameStage.Prepare ? $z1KinghtFallBuildBase.KinghtFallBuildAniName.shut : $z1KinghtFallBuildBase.KinghtFallBuildAniName.shut_night, this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (t) {
          e._stopColliderTween(t);
          t.enabled = t.tag == e.index;
          t.enabled && e._animateCollider(t, .1);
        });
      }
      if (this.ndAniMain.animation == $z1KinghtFallBuildBase.KinghtFallBuildAniName.create || this.ndAniMain.animation == $z1KinghtFallBuildBase.KinghtFallBuildAniName.upgrade) {
        this.ndAniMain.addAnimation(0, this._gateAnimation(this.ndAniMain, t), false), this.ndAniDown.addAnimation(0, this._gateAnimation(this.ndAniDown, t), false);
      } else {
        this.ndAniMain.setAnimation(0, this._gateAnimation(this.ndAniMain, t), false), this.ndAniDown.setAnimation(0, this._gateAnimation(this.ndAniDown, t), false);
      }
    }
  };
  _ctor.prototype.doUpgreadAni = function () {
    var t = this;
    if (1 == this.index) {
      this.ndAniMain.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.create, false);
      this.ndAniMain.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, false);
      this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
        e.enabled = e.tag == t.index;
      });
      if (this.ndAniDown) {
        this.ndAniDown.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.create, false), this.ndAniDown.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, false);
      }
      this.ndAniOther.forEach(function (e) {
        e.node.active = true;
        e.setSkin(t.buildInfo.cfg.Skin);
        e.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.create, false);
        e.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, false);
        e.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
          e.enabled = e.tag == t.index;
        });
      });
    } else {
      this.ndAniMain.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.upgrade, false);
      this.ndAniMain.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, false);
      if (this.ndAniDown) {
        this.ndAniDown.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.upgrade, false), this.ndAniDown.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, false);
      }
      this.ndAniOther.forEach(function (e) {
        e.node.active = true;
        e.setSkin(t.buildInfo.cfg.Skin);
        e.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.upgrade, false);
        e.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, false);
        e.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
          e.enabled = e.tag == t.index;
        });
      });
    }
  };
  _ctor.prototype.onAttacked = function (t) {
    var e = this;
    if (!this.isDestroyed) {
      this.buildInfo.hp -= t;
      if (BattleSounds.hit) BattleSounds.hit(this, null, t);
      if (this.buildInfo.hp <= 0) {
        this.onDead();
        this.ndAniEffect.node.active = true;
        var n = this.ndAniEffect.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.destroy, false);
        this.ndAniEffect.setTrackCompleteListener(n, function () {
          e.ndAniEffect.node.active = false;
        });
      }
      this.ctrHp && this.ctrHp.setHp(this.buildInfo.hp, this.buildInfo.hpMax);
      return t;
    }
  };
  _ctor.prototype.onDead = function () {
    t.prototype.onDead.call(this);
    var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff06);
    if (e) {
      var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getEnemyList();
      for (var i = 0; i < n.length; i++) {
        n[i].addBuff($z1KinghtFallInterface.KinghtFallEnemyBuffType.DamageCut, {
          subNum: e.Pamer[0],
          time: 3
        });
      }
    }
    $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1KinghtFallConfig.KinghtFallUIID.UIGame, $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.Game01), this.T(this.buildCfg.name)));
  };
  _ctor.prototype.onDestroy = function () {
    if (this._gateFacingRuntime) require("GateFacingRuntime").dispose(this);
    if (this._wallRunRuntime) require("WallRunRuntime").dispose(this);
    if (t.prototype.onDestroy) t.prototype.onDestroy.call(this);
  };
  _ctor.prototype.onChangeSpeed = function () {
    var t = $z1KinghtFallUIGame.default.instance.speed;
    this.ndAniMain.timeScale = t;
    this.ndAniDown && (this.ndAniDown.timeScale = t);
    this.ndAniOther.forEach(function (e) {
      e.timeScale = t;
    });
    this.ndAniEffect.timeScale = t;
  };
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "建筑其他部分"
  })], _ctor.prototype, "ndAniEffect", undefined);
  cc__decorate([ccp_property({
    tooltip: "Explicit outward gate facing. Empty preserves the authored legacy animation."
  })], _ctor.prototype, "wallFacing", undefined);
  cc__decorate([ccp_property({visible:false,tooltip:"Optional inward or outward opening. Empty retains the default animation."})], _ctor.prototype, "wallOpening", undefined);
  cc__decorate([ccp_property({
    visible: false,
    tooltip: "Fine wall-only rotation in degrees. Models and built fixtures are baked; construction fields stay fixed."
  })], _ctor.prototype, "wallRotation", undefined);
  cc__decorate([ccp_property({visible:false})], _ctor.prototype, "wallFixtureTags", undefined);
  cc__decorate([ccp_property({visible:false,tooltip:"Optional stage-authored modular wall run. Empty retains the existing layout."})], _ctor.prototype, "wallRun", undefined);
  cc__decorate([ccp_property({visible:false})], _ctor.prototype, "wallHasGate", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallBuildBase.default);
exports.default = def_KinghtFallBuildWall;
