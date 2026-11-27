var BattleSounds = require("BattleSounds");
var Navigation = require("KinghtFallNavigation");
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
    if (!this.isOpen || this.isDestroyed || !self || self.node !== this.node || self.tag != this.getColliderIndex()) return;
    if (!cc.isValid(other, true)) return;
    var node = other.body ? other.body.node : other.node;
    // A contact can outlive the unit that created it. Keep the gate solid if
    // the other side of the contact no longer has a live node.
    if (!cc.isValid(node, true) || !node.activeInHierarchy) return;
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
  _ctor.prototype.getIsWork = function () {
    return !this._unitTestBreach && t.prototype.getIsWork.call(this);
  };
  _ctor.prototype.getLockPoint = function () {
    return this._unitTestBreach ? null : t.prototype.getLockPoint.call(this);
  };
  _ctor.prototype.openUnitTestBreach = function (game) {
    if (this._unitTestBreach) return this._unitTestBreach;
    var wall = this, disabled = [];
    function disable(item, property) {
      if (!cc.isValid(item, true) || !item[property]) return;
      disabled.push({ item: item, property: property });
      item[property] = false;
    }
    function restore() {
      if (wall._unitTestBreach !== restore) return;
      wall._unitTestBreach = null;
      disabled.forEach(function (entry) {
        if (cc.isValid(entry.item, true)) entry.item[entry.property] = true;
      });
      Navigation.invalidate(game);
    }
    this._unitTestBreach = restore;
    // Leave the building component active so its disable hook does not cancel
    // live upgrades and tweens. Only the wall's scenery and fixtures change.
    var wings = this.ndAniOther || [];
    [this.node].concat(wings.map(function (part) { return part && part.node; })).forEach(function (node) {
      if (!cc.isValid(node, true)) return;
      node.getComponentsInChildren(cc.PhysicsCollider).forEach(function (collider) { disable(collider, "enabled"); });
    });
    [this.ndAniMain, this.ndAniDown].concat(wings).forEach(function (part) {
      if (!part) return;
      if (part.node === wall.node) disable(part, "enabled");
      else disable(part.node, "active");
    });
    var art = this._buildingAppearance;
    if (art) disable(art.presentation || art.node, "active");
    (this.ndLockList || []).forEach(function (node) { disable(node, "active"); });
    if (this._buildingShadowTransition) require("BuildingShadowTransition").nodes(this).forEach(function (node) { disable(node, "active"); });
    require("BuildingLighting").hideOwner(this);
    Navigation.invalidate(game);
    return restore;
  };
  // The leaf remains an enemy obstacle while the visual gate admits allies.
  // Use the authored points while construction or upgrade grows the fixture.
  _ctor.prototype.getNavigationGateShapes = function (useLocalPoints) {
    if (this._unitTestBreach || !this.index || this.isDestroyed || !this.node.activeInHierarchy || this.wallHasGate === false) return [];
    var gate = this;
    return this.node.getComponents(cc.PhysicsPolygonCollider).filter(function (collider) {
      return collider.tag == gate.getColliderIndex();
    }).map(function (collider) {
      var points = gate.colPoint[collider.uuid] || collider.points;
      if (useLocalPoints) return { collider: collider, localPoints: points };
      var offset = collider.offset || cc.Vec2.ZERO;
      return { collider: collider, points: points.map(function (point) {
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
  _ctor.prototype.getAttackTargetParts = function () {
    return this._unitTestBreach ? [] : this.getWposPhyCol2();
  };
  _ctor.prototype.setLevel = function (e) {
    if (this._unitTestBreach) this._unitTestBreach();
    // Restore the facing/run data before refitting it. The night presentation
    // wraps that data; treating its wrapper as a new rig reverses north gates
    // again on repeated tier selections and disagrees with prepared shadows.
    require("BuildingNightlightRuntime").dispose(this);
    if (this._buildingWorldScaleRuntime) require("BuildingWorldScale").restore(this);
    if (this._buildingBlockerRuntime) require("BuildingBlockerRuntime").dispose(this);
    if (this._wallRunRuntime || this.ndAniMain && this.ndAniMain.skeletonData && this.ndAniMain.skeletonData.skeletonJson && this.ndAniMain.skeletonData.skeletonJson.wallKit) require("WallRunRuntime").apply(this, e);
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
    require("BuildingLighting").setNight(this,t);
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
    if (this._unitTestBreach || !this.index || this.isDestroyed || this.wallHasGate === false) return;
    var ui = $z1KinghtFallUIGame.default.instance;
    var game = ui && ui.ctrGame;
    if (!game || ui.isclose) return;
    var open = this.hasFriendlyAtGate(game);
    if (open === this.isOpen) return;
    // An opening can interrupt construction. After that, the same full-size
    // fixture blocks enemies in both states. Closing only ends friendly passage.
    if (open) this._openGateCollider();
    this.isOpen = open;
    if (BattleSounds.effect) BattleSounds.effect(open ? "gate-open" : "gate-close", this);
    var day = game.gameStatus === $z1KinghtFallModle.KinghtFallGameStage.Prepare;
    var names = $z1KinghtFallBuildBase.KinghtFallBuildAniName;
    var animation = open ? (day ? names.open : names.open_night) : (day ? names.shut : names.shut_night);
    var main = this.ndAniMain;
    var method = main.animation === names.create || main.animation === names.upgrade ? "addAnimation" : "setAnimation";
    main[method](0, this._gateAnimation(main, animation), false);
    if (cc.isValid(this.ndAniDown, true)) this.ndAniDown[method](0, this._gateAnimation(this.ndAniDown, animation), false);
  };
  _ctor.prototype.doUpgreadAni = function () {
    if (this._buildingWorldScaleRuntime) require("BuildingWorldScale").restore(this);
    var t = this;
    if (this.buildCfg.levelList.some(function (row) {return !!row.PurchaseField;}) || this._purchaseFieldRuntime) require("BuildingPurchaseFieldRuntime").apply(this);
    if (this.buildInfo && this.buildInfo.cfg && this.buildInfo.cfg.Blocker || this._buildingBlockerRuntime) require("BuildingBlockerRuntime").apply(this);
    if (1 == this.index) {
      this.ndAniMain.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.create, false);
      this.ndAniMain.addAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.idle, false);
      this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
        e.enabled = e.tag == t.getColliderIndex();
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
          e.enabled = e.tag == t.getColliderIndex();
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
          e.enabled = e.tag == t.getColliderIndex();
        });
      });
    }
    if (this.buildInfo && this.buildInfo.cfg && this.buildInfo.cfg.WorldScale !== undefined) require("BuildingWorldScale").apply(this);
  };
  _ctor.prototype.onAttacked = function (t, attacker) {
    if (!this.isDestroyed) {
      var wall = this, info = this.buildInfo, node = this.node, generation = node && node._combatGeneration, hp = this.ctrHp;
      var effect = this.ndAniEffect, effectNode = effect && effect.node, valid = cc.isValid;
      var ui = $z1KinghtFallUIGame.default && $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame;
      var data = game && game.gameData, epoch = game && game._combatEpoch, round = data && data.round, uiGeneration = ui && ui._resourceGeneration;
      function current() { return wall.node === node && (!node || node._combatGeneration === generation && node.activeInHierarchy !== false) && wall.buildInfo === info && wall.ctrHp === hp &&
        wall.ndAniEffect === effect && (!effect || effect.node === effectNode && (!valid || valid(effect, true) && valid(effectNode, true))) && !wall._isPooled &&
        (!valid || valid(wall, true) && (!node || valid(node, true))) && (!data || data.round === round) &&
        (!game || game.gameData === data && game._combatEpoch === epoch && (!valid || valid(game, true))) &&
        (!ui || $z1KinghtFallUIGame.default.instance === ui && !ui.isclose && ui._resourceGeneration === uiGeneration && ui.ctrGame === game && (!valid || valid(ui, true))); }
      if (!info || !current()) return 0;
      this._applyBuildingDamage(t, attacker, game);
      if (!current()) return t;
      if (BattleSounds.hit) BattleSounds.hit(this, null, t);
      if (!current()) return t;
      if (info.hp <= 0 && !this.isDestroyed) {
        var destruction = this._wallDestruction = (this._wallDestruction || 0) + 1;
        this.onDead();
        if (!current()) return t;
        if (effect) {
          effectNode.active = true;
          var n = effect.setAnimation(0, $z1KinghtFallBuildBase.KinghtFallBuildAniName.destroy, false);
          if (!current()) return t;
          effect.setTrackCompleteListener(n, function () {
            if (current() && wall._wallDestruction === destruction && wall.isDestroyed && info.hp <= 0) effectNode.active = false;
          });
        }
      }
      if (current() && hp && (!valid || valid(hp, true) && (!hp.node || valid(hp.node, true)))) hp.setHp(info.hp, info.hpMax);
      return t;
    }
  };
  _ctor.prototype.onDead = function () {
    var wall = this, info = this.buildInfo, node = this.node, generation = node && node._combatGeneration;
    var ui = $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame, data = game && game.gameData;
    var epoch = game && game._combatEpoch, round = data && data.round, uiGeneration = ui && ui._resourceGeneration, valid = cc.isValid;
    function current() { return wall.node === node && wall.buildInfo === info && !wall._isPooled && (!node || node._combatGeneration === generation && node.activeInHierarchy !== false) &&
      (!valid || valid(wall, true) && (!node || valid(node, true))) && $z1KinghtFallUIGame.default.instance === ui && ui && !ui.isclose && ui._resourceGeneration === uiGeneration && ui.ctrGame === game &&
      (!valid || valid(ui, true) && (!game || valid(game, true))) && game && game.gameData === data && game._combatEpoch === epoch && data && data.round === round; }
    if (!current()) return;
    t.prototype.onDead.call(this);
    if (!current()) return;
    var e = data.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff06);
    if (!current()) return;
    if (e) {
      var n = data.getEnemyList();
      if (!current()) return;
      for (var i = 0; i < n.length; i++) {
        n[i].addBuff($z1KinghtFallInterface.KinghtFallEnemyBuffType.DamageCut, {
          subNum: e.Pamer[0],
          time: 3
        });
        if (!current()) return;
      }
    }
    $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1KinghtFallConfig.KinghtFallUIID.UIGame, $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.Game01), this.T(this.buildCfg.name)));
  };
  _ctor.prototype.onDestroy = function () {
    if (this._unitTestBreach) this._unitTestBreach();
    if (this._buildingWorldScaleRuntime) require("BuildingWorldScale").restore(this);
    if (this._buildingBlockerRuntime) require("BuildingBlockerRuntime").dispose(this);
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
