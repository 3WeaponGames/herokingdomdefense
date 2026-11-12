var BattleSounds = require("BattleSounds");
var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallBuildAniName = undefined;
var r;
var $z1AudioMgr = require("AudioMgr");
var $z1EventMgr = require("EventMgr");
var $z1UIMgr = require("UIMgr");
var $z1Config = require("Config");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallItemHp = require("KinghtFallItemHp");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallInterface = require("KinghtFallInterface");
var $z1KinghtFallBuildInfo = require("KinghtFallBuildInfo");
var RelicBattle = require("RelicBattle");
var RelicRuntime = require("RelicRuntime");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallBuildBase = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ID = 0;
    e.ndMove = [];
    e.ndHp = null;
    e.ndLockList = [null];
    e.purchaseSide = "";
    e.purchaseOffset = null;
    e.purchaseOverride = false;
    e.placementVariant = "";
    e.renderAfter = "top";
    e.renderLayerOrder = -1;
    e.ndAniMain = null;
    e.ndAniDown = null;
    e.ndAniOther = [];
    e.isBig = true;
    e.canLock = false;
    e.buildInfo = null;
    e.isDestroyed = false;
    e.ctrHp = null;
    e.ndCoin = null;
    e.colPoint = {};
    e.standTimeMax = 1.5;
    e.showAni = false;
    e._freeInitialBuild = false;
    e.vec2_1 = new cc.Vec2();
    e.vec2_2 = new cc.Vec2();
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    var t = this;
    this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
      var n = [];
      e.points.forEach(function (t) {
        n.push(t.clone());
      });
      t.colPoint[e.uuid] = n;
    });
    this.ndAniOther.forEach(function (e) {
      e.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
        var n = [];
        e.points.forEach(function (t) {
          n.push(t.clone());
        });
        t.colPoint[e.uuid] = n;
      });
    });
  };
  _ctor.prototype.start = function () {
    this.standTimeMax = require("GameToolsOverrides").parameter("buildStandTime", this.standTimeMax);
    var t;
    var e = this;
    null === (t = this.ndMove) || undefined === t || t.forEach(function (t, n) {
      t.active = false;
      t.name = e.node.name + "_" + n;
    });
  };
  _ctor.prototype.initData = function (t) {
    var e = this;
    1 == this.ID && (t = $z1KinghtFallEnum.KinghtFallEnumBuildEnum.CastleCenter);
    this.buildCfg = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBuildCfgById(t);
    if (this.buildCfg.enumValue == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None) {
      return this.hide(), false;
    } else {
      return this.index = 0, this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.IconMap, $z1KinghtFallConfig.KinghtFallPrefabName.ItemHp, function (t) {
        var n = cc.instantiate(t);
        n.parent = $z1KinghtFallUIGame.default.instance.ctrGame.ndUI;
        var i = e.node.convertToWorldSpaceAR(e.ndHp.position);
        var a = $z1KinghtFallUIGame.default.instance.ctrGame.ndUI.convertToNodeSpaceAR(i);
        n.setPosition(a);
        n.setScale(e.ndHp.scale);
        n.active = true;
        e.ctrHp = n.getComponent($z1KinghtFallItemHp.default);
        e.ctrHp.setType($z1KinghtFallModle.KinghtFallGameArmy.Friend);
        e.upHpView();
      }), this.ndCoin = cc.instantiate($z1KinghtFallUIGame.default.instance.ndBuildCoin), true;
    }
  };
  _ctor.prototype.upData = function () {
    if (this.buildCfg.enumValue != $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None) {
      this.canLock = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.canLock(this.ID);
      if (this.canLock) {
        // A free typed building remains an unbuilt, zero-cost choice until the
        // player selects its squad/tower. Direct construction keeps auto-build.
        $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAddTime[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.CovenantOfPatriarchs] == this.ID &&
          0 == this.getLevel() && !Array.isArray(this.buildCfg.InitialChoices) && (this.index = this.buildCfg.levelList[0].index);
        this.setLevel(this.index);
      } else {
        this.hide();
      }
      this.upHpView();
    }
  };
  _ctor.prototype.hide = function () {
    this._stopColliderTweens();
    this.ndLockList.forEach(function (t) {
      t.active = false;
      t.getChildByName("sprPro") && (t.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = 0);
    });
    this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (t) {
      t.enabled = false;
    });
    this.ndAniMain.node.active = false;
    this.ndAniDown && (this.ndAniDown.node.active = false);
    this.ndAniOther.forEach(function (t) {
      t.node.active = false;
      t.getComponents(cc.PhysicsPolygonCollider).forEach(function (t) {
        t.enabled = false;
      });
    });
    require("BuildingAppearance").hide(this);
    if (this._buildingShadowRuntime) require("BuildingShadowRuntime").hide(this);
  };
  _ctor.prototype.getLevel = function () {
    if (this.buildInfo && this.buildInfo.cfg) {
      return this.buildInfo.cfg.level;
    } else {
      return 0;
    }
  };
  _ctor.prototype.getPurchaseField = function () {
    var level = this.getLevel(), fields = this.ndLockList || [];
    if (fields[level]) return fields[level];
    // Older maps have pads only for levels 0–2. A newly eligible higher tier
    // reuses the last authored pad, including its saved placement and trigger.
    // Do not add nodes or rewrite the scene's selector list.
    if (level >= fields.length && this.buildInfo && this.buildInfo.canUpgrade) {
      for (var index = fields.length - 1; index >= 0; index--) if (fields[index]) return fields[index];
    }
    return null;
  };
  _ctor.prototype.getColliderIndex = function () {
    var value = this.buildInfo && this.buildInfo.cfg && this.buildInfo.cfg.ColliderIndex;
    return typeof value === "number" && isFinite(value) && value > 0 && Math.floor(value) === value ? value : this.index;
  };
  _ctor.prototype.getBranchCfg = function (index) {
    if (typeof index !== "number" || !isFinite(index) || index <= 0 || Math.floor(index) !== index) return undefined;
    return this.buildCfg.levelList.find(function (row) { return row.index === index; });
  };
  _ctor.prototype.getUpgradeChoices = function () {
    var configured = this.buildInfo && this.buildInfo.cfg ? this.buildInfo.cfg.BranchBuild : this.buildCfg.InitialChoices;
    if (!Array.isArray(configured)) {
      var first = this.buildCfg.levelList[0];
      return this.buildInfo && this.buildInfo.cfg || !first ? [] : [first.index];
    }
    var build = this;
    return configured.filter(function (index, position) {
      var row = build.getBranchCfg(index);
      return typeof index === "number" && Math.floor(index) === index && index > 0 && row &&
        (build.buildInfo && build.buildInfo.cfg || row.level === 1) && configured.indexOf(index) === position;
    });
  };
  _ctor.prototype.hasFreeInitialChoice = function () {
    if (this.getLevel() !== 0 || !Array.isArray(this.buildCfg.InitialChoices) || !this.getUpgradeChoices().length) return false;
    var data = $z1KinghtFallUIGame.default.instance.ctrGame.gameData;
    return this._freeInitialBuild || !!data.treasureAddTime && data.treasureAddTime[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.CovenantOfPatriarchs] == this.ID;
  };
  _ctor.prototype.setLevel = function (t) {
    if (this._buildingWorldScaleRuntime) require("BuildingWorldScale").restore(this);
    this.cancelUpgrade();
    var e;
    var n = this;
    this._stopColliderTweens();
    var cfg = this.getBranchCfg(t);
    this.index = cfg ? cfg.index : 0;
    if (this.index > 0) this._freeInitialBuild = false;
    this.buildInfo = new $z1KinghtFallBuildInfo.KinghtFallBuildInfo(this.buildCfg.enumValue, cfg, this.ID);
    if (this.buildCfg.levelList.some(function (row) {return !!row.PurchaseField;}) || this._purchaseFieldRuntime) require("BuildingPurchaseFieldRuntime").apply(this);
    if (cfg && cfg.Blocker || this._buildingBlockerRuntime) require("BuildingBlockerRuntime").apply(this);
    if (0 == this.index) {
      this.hide();
    } else {
      this.ndAniMain.node.active = true;
      this.ndAniMain.setSkin(this.buildInfo.cfg.Skin);
      this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (t) {
        t.enabled = t.tag == n.getColliderIndex();
        t.enabled && (e = t);
      });
      if (e) {
        this._animateCollider(e, .2);
      }
      if (this.ndAniDown) {
        this.ndAniDown.node.active = true, this.ndAniDown.setSkin(this.buildInfo.cfg.Skin);
      }
      this.ndAniOther.forEach(function (t) {
        var e;
        t.node.active = true;
        t.setSkin(n.buildInfo.cfg.Skin);
        t.getComponents(cc.PhysicsPolygonCollider).forEach(function (t) {
          t.enabled = t.tag == n.getColliderIndex();
          t.enabled && (e = t);
        });
        if (e) n._animateCollider(e, .2);
      });
    }
    this.ndCoin.active = false;
    this.ndCoin.getChildByName("labNum").getComponent(cc.Label).string = "" + this.getSell();
    this.ndLockList.forEach(function (t) {
      t.getChildByName("sprPro") && (t.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = 0);
      if (t === n.getPurchaseField() && n.buildInfo.canUpgrade) {
        t.active = true;
        if (!(t.show || n.buildCfg.enumValue == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.CastleCenter)) {
          t.show = true, cc.tween(t).set({
            scale: .01
          }).to(.2, {
            scale: 1.2
          }).to(.05, {
            scale: 1
          }).start();
        }
        n.ndCoin.setParent(t);
        n.ndCoin.setPosition(cc.Vec2.ZERO);
        if (n.purchaseSide === "default" || n.purchaseSide === "flip") n._alignPurchaseCost(t);
        else n.ndCoin.scaleX = t.parent.scaleX;
        n.ndCoin.active = true;
      } else {
        t.show = false;
        t.active = false;
      }
    });
    require("BuildingAppearance").apply(this);
    if (cfg && cfg.WorldScale !== undefined) require("BuildingWorldScale").apply(this);
    if (cfg && cfg.Shadow || this._buildingShadowRuntime) require("BuildingShadowRuntime").apply(this, $z1KinghtFallUIGame.default.instance.ctrGame);
  };
  _ctor.prototype._alignPurchaseCost = function (field) {
    var origin = field.convertToWorldSpaceAR(cc.v2(0, 0));
    var x = field.convertToWorldSpaceAR(cc.v2(1, 0)), y = field.convertToWorldSpaceAR(cc.v2(0, 1));
    var sx = Math.hypot(x.x - origin.x, x.y - origin.y), sy = Math.hypot(y.x - origin.x, y.y - origin.y);
    if (sx < 1e-8 || sy < 1e-8) return;
    var a = (x.x - origin.x) / sx, b = (x.y - origin.y) / sx;
    var c = (y.x - origin.x) / sy, d = (y.y - origin.y) / sy, determinant = a * d - b * c;
    if (Math.abs(determinant) < 1e-8) return;
    this.ndCoin.angle = Math.atan2(-b / determinant, d / determinant) * 180 / Math.PI;
    this.ndCoin.scaleX = 1;
    this.ndCoin.scaleY = determinant < 0 ? -1 : 1;
  };
  _ctor.prototype._stopColliderTween = function (collider) {
    var owned = this._colliderTweens && this._colliderTweens.get(collider);
    if (!owned) return;
    this._colliderTweens.delete(collider);
    owned.tween && owned.tween.stop();
    // The next map refresh may enable this shape as soon as its node becomes
    // active, before a new tween can run. Always leave complete authored points.
    var points = this.colPoint[collider.uuid];
    if (points && cc.isValid(collider, true)) collider.points = points.map(function (point) { return cc.v2(point.x, point.y); });
  };
  _ctor.prototype._stopColliderTweens = function () {
    if (!this._colliderTweens) return;
    var owner = this;
    Array.from(this._colliderTweens.keys()).forEach(function (collider) { owner._stopColliderTween(collider); });
  };
  _ctor.prototype._animateCollider = function (collider, duration) {
    var owner = this;
    this._stopColliderTween(collider);
    // Independently scaling the pieces of an erased mask closes its holes and
    // opens seams. Keep authored blockers whole throughout the visual upgrade.
    if (collider._buildingBlocker) return;
    if (!this._colliderTweens) this._colliderTweens = new Map();
    var operation = { level: this.index, tween: null };
    this._colliderTweens.set(collider, operation);
    operation.tween = cc.tween(collider).to(duration, {}, {
      onUpdate: function (target, progress) {
        // Creator apply() can recreate fixtures even when a collider is disabled.
        // A retired growth/close callback must never revive an old gate variant.
        if (owner._colliderTweens.get(collider) !== operation || owner.index !== operation.level ||
            owner.enabled === false || owner.isDestroyed || !cc.isValid(owner.node, true) ||
            !cc.isValid(target, true) || target.enabled === false || target.enabledInHierarchy === false ||
            !target.node || target.node.activeInHierarchy === false || target.tag != owner.getColliderIndex()) return;
        // Creator's polygon builder mutates coincident first/last vertices.
        // A zero-sized tween frame can lose vertices on repeated apply/enable,
        // then crash its Area/Right triangulation on the next building refresh.
        // Retain a valid minimum footprint throughout the visual growth tween.
        var scale = Math.max(.1, Math.min(1, progress));
        target.points = owner.colPoint[target.uuid].map(function (point) { return cc.v2(point.x * scale, point.y * scale); });
        target.apply();
        if (progress >= 1 && owner._colliderTweens.get(collider) === operation) owner._colliderTweens.delete(collider);
      }
    }).start();
  };
  _ctor.prototype.onEnable = function () {
    if (t.prototype.onEnable) t.prototype.onEnable.call(this);
    // Destroyed buildings do not run their normal work update. Resume a paused
    // visual collapse here without replaying the native destruction effects.
    var artwork = this._buildingAppearance;
    if (artwork && artwork.destruction && artwork.destruction.paused) require("BuildingAppearance").apply(this);
  };
  _ctor.prototype.onDisable = function () {
    this.cancelUpgrade();
    var artwork = require("BuildingAppearance");
    if (artwork.cancelPlacement) artwork.cancelPlacement(this);
    if (this._buildingAppearance && this._buildingAppearance._buildingLighting) require("BuildingLighting").hide(this, this._buildingAppearance);
    var owner = this, interrupted = this._colliderTweens ? Array.from(this._colliderTweens.keys()) : [];
    this._stopColliderTweens();
    // A disabled component may be enabled again without setLevel. Retain its
    // authored footprint rather than leaving a cancelled half-grown shape.
    interrupted.forEach(function (collider) {
      if (!cc.isValid(collider, true) || !owner.colPoint[collider.uuid]) return;
      collider.points = owner.colPoint[collider.uuid].map(function (point) { return cc.v2(point.x, point.y); });
      if (collider.enabled && collider.enabledInHierarchy !== false && collider.node && collider.node.activeInHierarchy !== false && collider._inited !== false) collider.apply();
    });
    if (t.prototype.onDisable) t.prototype.onDisable.call(this);
  };
  _ctor.prototype.onDestroy = function () {
    if (this._buildingWorldScaleRuntime) require("BuildingWorldScale").restore(this);
    this.cancelUpgrade();
    this._stopColliderTweens();
    if (this._buildingBlockerRuntime) require("BuildingBlockerRuntime").dispose(this);
    if (this._buildingShadowRuntime) require("BuildingShadowRuntime").dispose(this);
    require("BuildingAppearance").dispose(this);
    if (t.prototype.onDestroy) t.prototype.onDestroy.call(this);
  };
  _ctor.prototype.doUpgreadAni = function () {
    if (this._buildingWorldScaleRuntime) require("BuildingWorldScale").restore(this);
    var t = this;
    if (this.buildCfg.levelList.some(function (row) {return !!row.PurchaseField;}) || this._purchaseFieldRuntime) require("BuildingPurchaseFieldRuntime").apply(this);
    if (this.buildInfo && this.buildInfo.cfg && this.buildInfo.cfg.Blocker || this._buildingBlockerRuntime) require("BuildingBlockerRuntime").apply(this);
    if (1 == this.getLevel()) {
      this.ndAniMain.setAnimation(0, r.create, false);
      this.ndAniMain.addAnimation(0, r.idle, true);
      this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
        e.enabled = e.tag == t.getColliderIndex();
      });
      if (this.ndAniDown) {
        this.ndAniDown.setAnimation(0, r.create, false), this.ndAniDown.addAnimation(0, r.idle, true);
      }
      this.ndAniOther.forEach(function (e) {
        e.node.active = true;
        e.setAnimation(0, r.create, false);
        e.addAnimation(0, r.idle, true);
        e.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
          e.enabled = e.tag == t.getColliderIndex();
        });
      });
    } else {
      this.ndAniMain.setAnimation(0, r.upgrade, false);
      this.ndAniMain.addAnimation(0, r.idle, true);
      if (this.ndAniDown) {
        this.ndAniDown.setAnimation(0, r.upgrade, false), this.ndAniDown.addAnimation(0, r.idle, true);
      }
      this.ndAniOther.forEach(function (e) {
        e.node.active = true;
        e.setAnimation(0, r.upgrade, false);
        e.addAnimation(0, r.idle, true);
        e.getComponents(cc.PhysicsPolygonCollider).forEach(function (e) {
          e.enabled = e.tag == t.getColliderIndex();
        });
      });
    }
    var artwork = require("BuildingAppearance");
    artwork.apply(this);
    if (artwork.place) artwork.place(this, this.getLevel() === 1 ? "create" : "upgrade");
    if (this.buildInfo && this.buildInfo.cfg && this.buildInfo.cfg.WorldScale !== undefined) require("BuildingWorldScale").apply(this);
  };
  _ctor.prototype.getWposPhyCol = function () {
    return this.getWposPhyCol2().map(function (part) { return part.points; });
  };
  _ctor.prototype.getWposPhyCol2 = function () {
    if (this.isDestroyed) {
      this._combatFootprints = null;
      return [];
    }
    // Every enemy observes the same geometry during one game update. Avoid
    // transforming every building vertex again for every target/attack scan.
    // Standalone callers have no managed frame and always get fresh geometry.
    var ui = $z1KinghtFallUIGame.default.instance;
    var game = ui && ui.ctrGame;
    var navigation = game && game._navigation;
    var frame = navigation && navigation._frameManaged ? navigation._frameId : null;
    var cached = this._combatFootprints;
    if (frame !== null && cached && cached.navigation === navigation && cached.frame === frame && cached.level === this.index) return cached.parts;
    var t = [];
    var e = this.node.getComponents(cc.PhysicsPolygonCollider);
    for (var n = 0; n < e.length; n++) {
      if ((s = e[n]).tag == this.getColliderIndex()) {
        var i = [];
        for (var a = 0; a < s.points.length; a++) {
          var o = s.points[a];
          i.push(this.node.convertToWorldSpaceAR(o));
        }
        t.push({
          tagNode: this.node,
          points: i
        });
      }
    }
    for (var r = 0; r < this.ndAniOther.length; r++) {
      var s;
      e = (s = this.ndAniOther[r].node).getComponents(cc.PhysicsPolygonCollider);
      for (n = 0; n < e.length; n++) {
        var l = e[n];
        if (l.tag == this.getColliderIndex()) {
          i = [];
          for (a = 0; a < l.points.length; a++) {
            o = l.points[a];
            i.push(s.convertToWorldSpaceAR(o));
          }
          t.push({
            tagNode: s,
            points: i
          });
        }
      }
    }
    if (frame !== null) this._combatFootprints = { navigation: navigation, frame: frame, level: this.index, parts: t };
    return t;
  };
  _ctor.prototype.setLight = function (t) {
    require("BuildingLighting").setNight(this, t);
    var e = this;
    if (this.buildCfg.enumValue != $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None) {
      this.ndLockList.forEach(function (n) {
        n.active = !t && n === e.getPurchaseField() && e.canLock && e.buildInfo.canUpgrade;
        n.getChildByName("sprPro") && (n.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = 0);
      });
      if (this.canLock && 0 != this.index) {
        if (this.isDestroyed) {
          this.doUpgreadAni();
        } else if (t) {
          this.ndAniMain.setAnimation(0, r.fade_in, false), this.ndAniMain.addAnimation(0, r.idle_night, true), this.ndAniDown && (this.ndAniDown.setAnimation(0, r.fade_in, false), this.ndAniDown.addAnimation(0, r.idle_night, true)), this.ndAniOther.forEach(function (t) {
            t.setAnimation(0, r.fade_in, false);
            t.addAnimation(0, r.idle_night, true);
          });
        } else {
          this.ndAniMain.setAnimation(0, r.idle, true), this.ndAniDown && this.ndAniDown.setAnimation(0, r.idle, true), this.ndAniOther.forEach(function (t) {
            t.setAnimation(0, r.idle, true);
          });
        }
      }
    }
    require("BuildingAppearance").apply(this);
  };
  _ctor.prototype.getLockPoint = function () {
    if (this.buildCfg.enumValue == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None) {
      return null;
    }
    if (!this.isDestroyed && this.canLock && this.buildInfo.canUpgrade) {
      var t = this.getPurchaseField();
      if (!t) return null;
      var e = t.getComponent(cc.PolygonCollider);
      if (!e) { console.error("### 未找到锁定点", this.ID, this.ndLockList, this.index); return null; }
      var n = [];
      for (var i = 0; i < e.points.length; i++) {
        n.push(t.convertToWorldSpaceAR(cc.v2(e.points[i].x / t.scaleX, e.points[i].y / t.scaleY)));
      }
      return n;
    }
    return null;
  };
  _ctor.prototype.startRoundGame = function () {
    this.buildInfo.initBuffData();
  };
  _ctor.prototype.cancelUpgrade = function () {
    if (this._upgradeOperation) this._upgradeOperation.cancel();
  };
  _ctor.prototype.doUpgrade = function (t, e) {
    var n;
    var i = this;
    if (this._upgradeOperation) return false;
    if (this.buildCfg.enumValue == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None || !this.buildInfo) {
      return false;
    }
    if (this.buildInfo.canUpgrade === false) {
      this.buildInfo.standTime = 0;
      return false;
    }
    var upgradeInfo = this.buildInfo;
    if (e) {
      this.buildInfo.standTime += t;
      if (this.buildInfo.standTime >= this.standTimeMax) {
        this.buildInfo.standTime = this.standTimeMax;
        $z1KinghtFallUIGame.default.instance.ctrGame.upBulid = this;
        var ui = $z1KinghtFallUIGame.default.instance;
        var game = ui.ctrGame, data = game.gameData, epoch = game._combatEpoch;
        var choices = this.getUpgradeChoices();
        var operation;
        var a = function (t) {
          if (!operation || operation.done) return;
          if (!operation.isCurrent()) { operation.cancel(); return; }
          if (choices.indexOf(t) < 0 || !i.getBranchCfg(t)) { operation.cancel(); return; }
          var chosenCost = i.getSell(t);
          if (chosenCost < 0 || !isFinite(chosenCost) || data.coin + cost < chosenCost) { i.showBuildCostError(); return false; }
          data.coin += cost - chosenCost;
          cost = chosenCost;
          operation.reservedCost = cost;
          operation.done = true;
          i._upgradeOperation = null;
          i._freeInitialBuild = false;
          $z1KinghtFallUIGame.default.instance.initView();
          i.index = t;
          i.buildInfo = new $z1KinghtFallBuildInfo.KinghtFallBuildInfo(i.buildCfg.enumValue, i.getBranchCfg(i.index), i.ID);
          $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.BuildingLevelUp);
          i.doUpgreadAni();
          i.scheduleOnce(function () {
            if ($z1KinghtFallUIGame.default.instance === ui && !ui.isclose && game.gameData === data && game._combatEpoch === epoch && !i._upgradeOperation) ui.canStart = true;
          }, .5);
          var missions = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData();
          if (missions.recordQuestEvent) missions.recordQuestEvent($z1KinghtFallEnum.KinghtFallEnumTaskEnum.BuildLevel, i.buildInfo.cfg.level, true);
          else {
          var e = missions.getTaskInfo();
          if (e.type == $z1KinghtFallEnum.KinghtFallEnumTaskEnum.BuildLevel) {
            e.num = Math.max(e.num, i.buildInfo.cfg.level);
            $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().setTaskInfo(e);
          }
          }
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.lv_building_X_Y, $z1KinghtFallUIGame.default.instance.ctrGame.gameData.levelCfg.Level + "_" + i.buildCfg.enumValue);
          ui.onPauseGame(false, operation);
          i._playUpgradeAudio();
          if (1 == i.getLevel()) {
            switch (i.buildCfg.enumValue) {
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.PrivateHouse:
                i.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 7);
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.BuildHome);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.ArrowTower:
                i.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 8);
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.BuildTower);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Wall:
                i.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 9);
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.BuildWall);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Mill:
                i.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 10);
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.BuildMill);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Barracks:
                i.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 11);
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.BuildBarracks);
            }
          } else {
            switch (i.buildCfg.enumValue) {
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.PrivateHouse:
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.UpgradeHome);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.ArrowTower:
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.UpgradeTower);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Wall:
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.UpgradeWall);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Mill:
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.UpgradeMill);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Barracks:
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.UpgradeBarracks);
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.CastleCenter:
                $z1KinghtFallUIGame.default.instance.addTask($z1KinghtFallEnum.KinghtFallEnumInGameTaskEnum.UpgradeCastle);
            }
          }
          switch (i.buildCfg.enumValue) {
            case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.PrivateHouse:
              $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_X, "house");
              break;
            case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.ArrowTower:
              $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_X, "arrwo");
              break;
            case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Wall:
              $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_X, "wall");
              break;
            case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Mill:
              $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_X, "mill");
              break;
            case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Barracks:
              $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_X, "camp");
              break;
            case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.CastleCenter:
              $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_X, "home");
          }
        };
        if ($z1KinghtFallUIGame.default.instance.ctrGame.gameData.coin >= this.getSell()) {
          var info = this.buildInfo, cost = this.getSell(), canStart = ui.canStart;
          operation = { done: false, request: null, node: null, reservedCost: cost };
          this._upgradeOperation = operation;
          operation.isCurrent = function () {
            return i._upgradeOperation === operation && !operation.done && cc.isValid(i, true) && cc.isValid(i.node, true) && !i.isDestroyed &&
              i.buildInfo === info && $z1KinghtFallUIGame.default.instance === ui && !ui.isclose && ui.ctrGame === game && game.gameData === data && game._combatEpoch === epoch;
          };
          operation.cancel = function () {
            if (operation.done) return;
            operation.done = true;
            if (i._upgradeOperation === operation) i._upgradeOperation = null;
            if (game.upBulid === i) game.upBulid = null;
            if (game.gameData === data && game._combatEpoch === epoch) {
              data.coin += cost;
              if (i.buildInfo === info) info.standTime = 0;
              if ($z1KinghtFallUIGame.default.instance === ui && !ui.isclose) { ui.canStart = canStart; ui.initView(); }
            }
            if ($z1KinghtFallUIGame.default.instance === ui && !ui.isclose) ui.onPauseGame(false, operation);
            if (operation.request) operation.request.cancel();
            if (operation.node && cc.isValid(operation.node, true)) $z1UIMgr.UIMgr.getInstance().closeUI(operation.node);
          };
          ui.canStart = false;
          ui.onPauseGame(true, operation);
          data.coin -= cost;
          if (choices.length > 1) {
            operation.request = $z1UIMgr.UIMgr.getInstance().openUIWithOwner($z1KinghtFallConfig.KinghtFallUIID.UIBuildSel, $z1KinghtFallConfig.KinghtFallUIID.UIGame,
              { isCurrent: operation.isCurrent, onCancel: operation.cancel, onOpened: function (node) { operation.node = node; } }, this, a, operation.cancel, choices);
          } else {
            a(choices[0]);
          }
        } else {
          this.buildInfo.standTime = 0;
          this.showBuildCostError();
        }
      }
    } else {
      if (0 == this.buildInfo.standTime) {
        return;
      }
      this.buildInfo.standTime -= t;
      this.buildInfo.standTime < 0 && (this.buildInfo.standTime = 0);
    }
    // A one-choice upgrade commits synchronously and replaces BuildInfo. The
    // completed frame belongs to the old tier; terminal tiers have no marker.
    if (this.buildInfo !== upgradeInfo) return false;
    var o = this.getPurchaseField();
    if (!o) return false;
    o.getChildByName("sprPro") && (o.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = this.buildInfo.standTime / this.standTimeMax);
    var r = null === (n = o.getChildByName("spAni")) || undefined === n ? undefined : n.getComponent(sp.Skeleton);
    if (r) {
      if (this.showAni) {
        if (!e) {
          this.showAni = false, r.node.active = false;
        }
      } else if (e) {
        this.showAni = true, r.node.active = true, r.setAnimation(0, r.defaultAnimation, false), r.setCompleteListener(function () {
          r.setCompleteListener(null);
          r.node.active = false;
        });
      }
    }
  };
  _ctor.prototype.upSellView = function () {
    if (this.buildCfg.enumValue != $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None && this.buildInfo) {
      var t = this.getPurchaseField();
      if (!t) return;
      if ($z1KinghtFallUIGame.default.instance.ctrGame.gameData.coin < this.getSell()) {
        t.color = new cc.Color().fromHEX("#db0000");
      } else {
        t.color = cc.Color.WHITE;
      }
    }
  };
  _ctor.prototype._playUpgradeAudio = function () {
    var game = $z1KinghtFallUIGame.default.instance.ctrGame;
    // Wave perks present their construction cues after retiring combat audio.
    if (game._upgradeAudioQueue) { game._upgradeAudioQueue.add(this); return; }
    if (this.onUpgradeCommitted) this.onUpgradeCommitted();
    $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.buliding, undefined, undefined, { owner: this, game: game });
  };
  _ctor.prototype.onBuffUpgrade = function () {
    var choices = this.getUpgradeChoices();
    if (!choices.length) return false;
    if (this.getLevel() === 0 && choices.length > 1) {
      // Construction perks grant the building, not a preselected tower/squad.
      // Keep that entitlement on the plot through cancellation and checkpoints.
      this._freeInitialBuild = true;
      $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.BuildingLevelUp);
      return true;
    }
    this.index = choices[0];
    $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.BuildingLevelUp);
    this.doUpgreadAni();
    this._playUpgradeAudio();
    return true;
  };
  _ctor.prototype.canAffordChoice = function (index) {
    var cost = this.getSell(index), operation = this._upgradeOperation;
    var reserved = operation && !operation.done ? operation.reservedCost || 0 : 0;
    return cost >= 0 && isFinite(cost) && $z1KinghtFallUIGame.default.instance.ctrGame.gameData.coin + reserved >= cost;
  };
  _ctor.prototype.showBuildCostError = function () {
    var ui = $z1KinghtFallUIGame.default.instance;
    $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.cuo, undefined, undefined, { owner: this, game: ui.ctrGame });
    $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1KinghtFallConfig.KinghtFallUIID.UIGame, $z1KinghtFallTextConfig.KinghtFallTextConfig.Game03);
    ui.aniBtnAddCoin();
  };
  _ctor.prototype.getSell = function (targetIndex) {
    if (this.buildCfg.enumValue == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None || !this.canLock) {
      return -1;
    }
    if (!this.buildInfo || !this.buildInfo.canUpgrade) {
      return -1;
    }
    if (this.hasFreeInitialChoice()) return 0;
    var costModel = require("BuildingCost"), owner = this, choices = this.getUpgradeChoices();
    if (targetIndex !== undefined && choices.indexOf(targetIndex) < 0 || !choices.length) return -1;
    var selected = targetIndex !== undefined ? [targetIndex] : choices;
    var t = Math.min.apply(Math, selected.map(function (index) { return costModel.value(owner.buildCfg, owner.buildInfo.cfg, owner.getBranchCfg(index)); }));
    var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff09);
    e && (t -= e.Pamer[0]);
    var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff47);
    if (n) {
      switch (this.buildCfg.enumValue) {
        case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.PrivateHouse:
          t -= n.Pamer[0];
          break;
        case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Barracks:
          t += n.Pamer[1];
      }
    }
    $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.SaveToken] && $z1KinghtFallUIGame.default.instance.ctrGame.gameData.round <= $z1KinghtFallUIGame.default.instance.ctrGame.gameData.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.SaveToken][0] && t--;
    return Math.max(t, 0);
  };
  _ctor.prototype.upHpView = function () {
    if (this.ctrHp) {
      if (this.canLock && this.buildInfo.cfg) {
        this.ctrHp.setHp(this.buildInfo.hp, this.buildInfo.hpMax);
      } else {
        this.ctrHp.setHp(0, 1);
      }
    }
  };
  _ctor.prototype.getIsLock = function () {
    return this.buildCfg.enumValue != $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None && 0 != this.index;
  };
  _ctor.prototype.getIsWork = function () {
    return this.buildCfg.enumValue != $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None && 0 != this.index && !this.isDestroyed;
  };
  _ctor.prototype.onAttacked = function (t) {
    if (!this.isDestroyed) {
      var castle = this.buildInfo.BuildID === 1 || this.buildCfg && this.buildCfg.enumValue === 1;
      var data = castle ? RelicRuntime.current() : null;
      var damage = castle ? RelicBattle.castleIncomingDamage(data, this, t) : t;
      this.buildInfo.hp -= damage;
      if (BattleSounds.hit) BattleSounds.hit(this, null, damage);
      if (castle) RelicBattle.afterCastleDamage(data, this);
      this.buildInfo.hp <= 0 && this.onDead();
      this.ctrHp && this.ctrHp.setHp(this.buildInfo.hp, this.buildInfo.hpMax);
      return damage;
    }
  };
  _ctor.prototype.onDead = function () {
    this.cancelUpgrade();
    this._stopColliderTweens();
    $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.destory, undefined, undefined, { owner: this, game: $z1KinghtFallUIGame.default.instance.ctrGame });
    this.delAllBuff();
    this.isDestroyed = true;
    require("BuildingAppearance").onDead(this);
    this.ndAniMain.setAnimation(0, r.destroy, false);
    this.node.getComponents(cc.PhysicsPolygonCollider).forEach(function (t) {
      t.enabled = false;
    });
    this.ndAniDown && this.ndAniDown.setAnimation(0, r.destroy, false);
    this.ndAniOther.forEach(function (t) {
      t.node.active = true;
      t.setAnimation(0, r.destroy, false);
      t.getComponents(cc.PhysicsPolygonCollider).forEach(function (t) {
        t.enabled = false;
      });
    });
    this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.MapUpdate);
  };
  _ctor.prototype.onUpdate = function (t) {
    if (this.getIsWork()) {
      for (var e = 0; e < this.debuffInfo.length; e++) {
        var n = this.debuffInfo[e];
        if (-1 != n.timeMax) {
          n.time += t;
          if (n.time >= n.timeMax) {
            this.delBuffIdx(e), e--;
          }
        }
      }
      this.doTime(t);
    }
  };
  _ctor.prototype.doTime = function () {};
  _ctor.prototype.getAttPos = function () {
    return this.node.getPosition();
  };
  _ctor.prototype.getAttack = function () {
    return 0;
  };
  _ctor.prototype.reset = function (t) {
    this.cancelUpgrade();
    if (t) {
      this._freeInitialBuild = false;
      this.index = 0;
      this.setLevel(this.index);
    }
    this.isDestroyed = false;
    this.delAllBuff();
  };
  _ctor.prototype.initBuffData = function () {
    this.ndCoin.getChildByName("labNum").getComponent(cc.Label).string = "" + this.getSell();
  };
  _ctor.prototype.onChangeSpeed = function () {
    var t = $z1KinghtFallUIGame.default.instance.speed;
    this.ndAniMain.timeScale = t;
    this.ndAniDown && (this.ndAniDown.timeScale = t);
    this.ndAniOther.forEach(function (e) {
      e.timeScale = t;
    });
    var artwork = require("BuildingAppearance");
    if (artwork.placementSpeed) artwork.placementSpeed(this);
  };
  _ctor.prototype.endRoundGame = function () {
    this.isDestroyed = false;
    require("BuildingAppearance").apply(this);
  };
  _ctor.prototype.getSave = function () {
    var save = {
      point: this.ID,
      level: this.index
    };
    if (this._freeInitialBuild && this.index === 0) save.freeInitialBuild = true;
    return save;
  };
  _ctor.prototype.setSave = function (t) {
    var level = t && t.level;
    level = typeof level === "number" && isFinite(level) ? Math.floor(level) : 0;
    level = this.getBranchCfg(level) ? level : 0;
    this._freeInitialBuild = level === 0 && !!t && t.freeInitialBuild === true;
    this.setLevel(level);
  };
  _ctor.prototype.getMoveToPos = function (t, e) {
    if (!this.ndMove || 0 == this.ndMove.length) {
      return null;
    }
    var n = -1;
    var i = null;
    var a = null;
    for (var o = 0; o < this.ndMove.length; o++) {
      var r = this.ndMove[o];
      if (r) {
        var s = false;
        for (var l = 0; l < e.length; l++) {
          if (e[l].uuid == r.uuid) {
            s = true;
            break;
          }
        }
        if (!s) {
          var c = this.node.convertToWorldSpaceAR(r.getPosition());
          var h = cc.Vec2.distance(t, c);
          if (-1 == n || h < n) {
            n = h;
            a = c;
            i = r;
          }
        }
      }
    }
    if (i) {
      return {
        node: i,
        pos: a
      };
    } else {
      return null;
    }
  };
  cc__decorate([ccp_property({
    type: cc.Integer,
    tooltip: "点位id"
  })], _ctor.prototype, "ID", undefined);
  cc__decorate([ccp_property({
    type: [cc.Node],
    tooltip: "碰到就要移动的点"
  })], _ctor.prototype, "ndMove", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "血条"
  })], _ctor.prototype, "ndHp", undefined);
  cc__decorate([ccp_property({
    type: [cc.Node],
    tooltip: "解锁/升级"
  })], _ctor.prototype, "ndLockList", undefined);
  cc__decorate([ccp_property({
    visible: false,
    tooltip: "Purchase field: default southeast or flipped southwest"
  })], _ctor.prototype, "purchaseSide", undefined);
  cc__decorate([ccp_property({tooltip: "Object layer behind the whole building"})], _ctor.prototype, "renderAfter", undefined);
  cc__decorate([ccp_property({tooltip: "Generated building layer order"})], _ctor.prototype, "renderLayerOrder", undefined);
  cc__decorate([ccp_property({ type: cc.Vec2, tooltip: "Manual purchase field offset" })], _ctor.prototype, "purchaseOffset", undefined);
  cc__decorate([ccp_property({visible:false})], _ctor.prototype, "purchaseOverride", undefined);
  cc__decorate([ccp_property({visible:false})], _ctor.prototype, "placementVariant", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "建筑主体"
  })], _ctor.prototype, "ndAniMain", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "建筑地板部分"
  })], _ctor.prototype, "ndAniDown", undefined);
  cc__decorate([ccp_property({
    type: [sp.Skeleton],
    tooltip: "建筑其他部分"
  })], _ctor.prototype, "ndAniOther", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallInterface.KinghtFallInterface);
exports.default = def_KinghtFallBuildBase;
(function (t) {
  t.create = "create";
  t.destroy = "destroy";
  t.idle = "idle";
  t.idle_night = "idle_night";
  t.fade_in = "Fade_in";
  t.upgrade = "upgrade";
  t.open = "open";
  t.open_night = "open_night";
  t.shut = "shut";
  t.shut_night = "shut_night";
})(r = exports.KinghtFallBuildAniName || (exports.KinghtFallBuildAniName = {}));
