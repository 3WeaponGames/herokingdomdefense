var ProjectileLooks = require("ProjectileLooks");
var GameToolsOverrides = require("GameToolsOverrides");
var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseCtrl = require("BaseCtrl");
var $z1PoolMgr = require("PoolMgr");
var $z1SdkMgr = require("SdkMgr");
var $z1UIMgr = require("UIMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallPathInfo = require("KinghtFallPathInfo");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallBulletBuild = require("KinghtFallBulletBuild");
var $z1KinghtFallBulletEnemy = require("KinghtFallBulletEnemy");
var $z1KinghtFallBulletPlay = require("KinghtFallBulletPlay");
var $z1KinghtFallBulletSoldier = require("KinghtFallBulletSoldier");
var $z1KinghtFallEnemyBase = require("KinghtFallEnemyBase");
var $z1KinghtFallGameCtrlData = require("KinghtFallGameCtrlData");
var $z1KinghtFallGamePlayCtrl = require("KinghtFallGamePlayCtrl");
var $z1KinghtFallInterface = require("KinghtFallInterface");
var $z1KinghtFallSoldierBase = require("KinghtFallSoldierBase");
var Navigation = require("KinghtFallNavigation");
var DepthRendering = require("KinghtFallDepthView");
var DepthView = DepthRendering.DepthView;
var TestMode = require("TestMode").TestMode;
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
function updateProjectiles(projectiles, dt) {
  // Returning a shot to its pool removes it from this list immediately.
  // Advance over survivors only, and leave shots appended here for the next tick.
  var index = 0;
  for (var remaining = projectiles.length; remaining > 0 && index < projectiles.length; remaining--) {
    var shot = projectiles[index];
    if (shot) shot.onUpdate(dt);
    if (projectiles[index] === shot) index++;
  }
}
var def_KinghtFallGameCtrl = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.camera = null;
    e.ctrPlay = null;
    e.buildBullet = null;
    e.ndAggFlag = null;
    e.gameData = null;
    e._combatEpoch = 0;
    e.mapSize = cc.size(1500, 2668);
    e.moveSize = cc.size(1500, 2668);
    e.ndBg = null;
    e.ndDown = null;
    e.ndPath = null;
    e.ndTrack = null;
    e.ndMain = null;
    e.ndUI = null;
    e.gameStatus = $z1KinghtFallModle.KinghtFallGameStage.Prepare;
    e.gameTag = [];
    e.moveDir = cc.v2(0, 0);
    e.vec2_1 = new cc.Vec2();
    e.vec2_2 = new cc.Vec2();
    e.isAgg = false;
    e.rallyPoint = null;
    e.pathList = [];
    e.pathIndex = 0;
    e.ndPlayArr1 = [];
    e.ndPlayArr2 = [];
    e.ndEnemyArr = [];
    e.ndBuildArr1 = [];
    e.ndBuildArr2 = [];
    e.ndSoldArr = [];
    e.dropList = [];
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.initData = function (t) {
    if (this._projectileLooks) this._projectileLooks.dispose();
    this._projectileLooks = null;
    GameToolsOverrides.clear();
    this._combatEpoch++;
    this._battleSettlement = null;
    this.isAgg = false;
    this.rallyPoint = null;
    this.pathList = [];
    this._armyFormation = null;
    this._followFormation = this._rallyFormation = null;
    this._separateArmyCommands = true;
    var restoring = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().hasSave(t);
    this.gameData = new $z1KinghtFallGameCtrlData.default(this, t, restoring);
    this.ctrPlay.initData();
    this.ctrPlay.ndAgg.active = false;
    this.buildBullet.node.active = false;
    this.ndAggFlag.active = false;
  };
  _ctor.prototype.initMap = function (t) {
    if (this._depthView) this._depthView.destroy();
    this._navigation = null;
    this.moveSize = t.getContentSize();
    this.ndBg = t.getChildByName("ndBg");
    this.mapSize = this.ndBg.getContentSize();
    this.ndDown = t.getChildByName("ndDown");
    this.ndPath = t.getChildByName("ndPath");
    this.ndTrack = t.getChildByName("ndTrack");
    this.ndMain = t.getChildByName("ndMain");
    this.ndUI = t.getChildByName("ndUI");
    this.ctrPlay.node.setParent(this.ndMain);
    this.ctrPlay.node.setPosition(this.ndPath.getChildByName("ndStar").position);
    this.ctrPlay.ndRange.setParent(this.ndUI);
    this.ndAggFlag.setParent(this.ndMain);
    this.gameData.initMap();
    var timelineUnits = [];
    (this.gameData.levelCfg && this.gameData.levelCfg.WaveCfg || []).forEach(function (wave) { (wave.SpawnTimeline || []).forEach(function (entry) { if (timelineUnits.indexOf(entry.unitId) < 0) timelineUnits.push(entry.unitId); }); });
    if (timelineUnits.length) {
      var unitConfig = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
      require("ResourceMgr").ResourceMgr.getInstance().preload($z1KinghtFallConfig.KinghtFallBundelName.Enemy, timelineUnits.map(function (id) { return unitConfig.getSoldierCfgById(id).prefab; }));
    }
    if (cc.Camera && cc.RenderTexture) this._depthView = new DepthView(this);
    this._bindMapPhysics(t);
  };
  _ctor.prototype._bindMapPhysics = function (map) {
    if (this._mapPhysicsManager) this._mapPhysicsManager.off("before-step", this._syncMapPhysics, this);
    this._mapPhysicsRoot = map;
    this._mapPhysicsTransform = null;
    this._mapPhysicsManager = cc.director.getPhysicsManager();
    this._mapPhysicsManager.on("before-step", this._syncMapPhysics, this);
    this._syncMapPhysics();
  };
  _ctor.prototype._syncMapPhysics = function () {
    var map = this._mapPhysicsRoot;
    if (!map || !map.activeInHierarchy) return;
    var origin = map.convertToWorldSpaceAR(cc.v2(0, 0));
    var xAxis = map.convertToWorldSpaceAR(cc.v2(1, 0));
    var yAxis = map.convertToWorldSpaceAR(cc.v2(0, 1));
    var transform = [origin.x, origin.y, xAxis.x - origin.x, xAxis.y - origin.y, yAxis.x - origin.x, yAxis.y - origin.y];
    var previous = this._mapPhysicsTransform;
    var changed = !previous || transform.some(function (value, index) { return Math.abs(value - previous[index]) > 0.0001; });
    if (!changed) return;
    var scaled = previous && (Math.abs(Math.hypot(transform[2], transform[3]) - Math.hypot(previous[2], previous[3])) > 0.0001 || Math.abs(Math.hypot(transform[4], transform[5]) - Math.hypot(previous[4], previous[5])) > 0.0001);
    this._mapPhysicsTransform = transform;
    // Creator 2.4 observes each body's own transform, not ancestor transforms.
    // A screen/Widget shift would otherwise be written back into local map
    // coordinates on the next physics tick. Preserve the authored map layout.
    map.getComponentsInChildren(cc.RigidBody).forEach(function (body) {
      if (!body.node.activeInHierarchy) return;
      body.syncPosition();
      body.syncRotation();
      if (scaled) body.getComponents(cc.PhysicsCollider).forEach(function (collider) {
        // Creator's apply() recreates fixtures even for disabled components.
        // Only resize live shapes; a pending onEnable/init reads the new scale
        // itself. Otherwise an open gate or an unused upgrade can turn solid.
        if (collider.enabled && collider.enabledInHierarchy && collider._inited) collider.apply();
      });
    });
  };
  _ctor.prototype.onDestroy = function () {
    GameToolsOverrides.clear();
    if (this._depthView) this._depthView.destroy();
    this._depthView = null;
    this._combatEpoch++;
    if (this._mapPhysicsManager) this._mapPhysicsManager.off("before-step", this._syncMapPhysics, this);
    this._mapPhysicsManager = null;
    this._mapPhysicsRoot = null;
    t.prototype.onDestroy.call(this);
  };
  _ctor.prototype.onRestart = function (t) {
    this.clearArmyOrder(false);
    this._battleSettlement = null;
    t && (this.gameData.buffList = []);
    // End the previous request lifetime before buildings request their new roster.
    this.cleanMap();
    this.gameData.onRestart(t);
    this.moveDir = cc.v2(0, 0);
    this.ctrPlay.onRestart(t);
    this.ctrPlay.node.setPosition(this.ndPath.getChildByName("ndStar").position);
    this.gameStatus = $z1KinghtFallModle.KinghtFallGameStage.Prepare;
    this.isAgg = false;
    this.ctrPlay.ndAgg.active = this.isAgg;
    this.ndAggFlag.active = false;
  };
  _ctor.prototype.moveFun = function (t) {
    if (t) {
      cc.Vec2.normalize(this.moveDir, t);
    } else {
      this.moveDir = cc.v2(0, 0);
    }
  };
  _ctor.prototype.onLateUpdate = function () {
    this.ctrPlay.node.getPosition(this.vec2_1);
    this.ctrPlay.node.getPosition(this.vec2_2);
    this.ctrPlay.node.zIndex = Math.floor(cc.winSize.height) - Math.floor(this.vec2_1.y);
    this.vec2_1.x = cc.misc.clampf(this.vec2_1.x, -this.moveSize.width / 2, this.moveSize.width / 2);
    this.vec2_1.y = cc.misc.clampf(this.vec2_1.y, -this.moveSize.height / 2, this.moveSize.height / 2);
    this.ctrPlay.node.setPosition(this.vec2_1);
    this.ctrPlay.ndRange.setPosition(this.vec2_1);
    this.vec2_2.x = cc.misc.clampf(this.vec2_2.x, -this.mapSize.width / 2 + cc.winSize.width / 2, this.mapSize.width / 2 - cc.winSize.width / 2);
    this.vec2_2.y = cc.misc.clampf(this.vec2_2.y, -this.mapSize.height / 2 + cc.winSize.height / 2, this.mapSize.height / 2 - cc.winSize.height / 2);
    this.camera.node.setPosition(this.vec2_2);
  };
  _ctor.prototype.testInstantBuild = function () {
    if (!TestMode.getInstance().isEnabled() || this.gameStatus !== $z1KinghtFallModle.KinghtFallGameStage.Prepare ||
        !this.ctrPlay || this.ctrPlay.isDead()) return false;
    var position = this.ctrPlay.getWpos(), buildings = this.gameData.getBulidList();
    for (var index = 0; index < buildings.length; index++) {
      var build = buildings[index];
      if (build.getSell() === -1 || this.upBulid && build.uuid === this.upBulid.uuid) continue;
      var polygon = build.getLockPoint();
      if (polygon && cc.Intersection.pointInPolygon(position, polygon)) {
        // The normal path retains prices, branch choices, unlocks and save events.
        build.doUpgrade(build.standTimeMax, true);
        return true;
      }
    }
    return false;
  };
  _ctor.prototype.onUpdate = function (t) {
    var l;
    Navigation.beginFrame(this);
    if (this._projectileLooks) this._projectileLooks.update(t);
    GameToolsOverrides.tick(t, this.gameStatus === $z1KinghtFallModle.KinghtFallGameStage.Fight);
    switch (this.gameStatus) {
      case $z1KinghtFallModle.KinghtFallGameStage.Prepare:
        var e = this.gameData.getBulidList();
        for (var n = 0; n < e.length; n++) {
          if (-1 != (l = e[n]).getSell()) {
            var i = l.getLockPoint();
            if (i) {
              var a = cc.Intersection.pointInPolygon(this.ctrPlay.getWpos(), i);
              if (a) {
                if (this.upBulid && l.uuid == this.upBulid.uuid) {
                  l.doUpgrade(t, false);
                } else {
                  l.doUpgrade(t, a);
                }
              } else {
                this.upBulid && l.uuid == this.upBulid.uuid && (this.upBulid = null);
                l.doUpgrade(t, a);
              }
            } else {
              l.doUpgrade(t, false);
            }
          } else {
            l.doUpgrade(t, false);
          }
        }
        this.onCommerce(t);
        break;
      case $z1KinghtFallModle.KinghtFallGameStage.Fight:
        this.gameData.onUpdata(t);
        this.ctrPlay.onUpdata(t);
        updateProjectiles(this.ndPlayArr2, t);
        updateProjectiles(this.ndEnemyArr, t);
        updateProjectiles(this.ndSoldArr, t);
        updateProjectiles(this.ndBuildArr2, t);
    }
    this.ctrPlay.doMove(this.moveDir, t);
    this.collectFollowers();
    var o = this.gameData.getBulidList();
    for (n = 0; n < o.length; n++) {
      (l = o[n]).onUpdate(t);
    }
    var r = this.gameData.getSoldierList();
    for (var s = 0; s < r.length; s++) {
      (l = r[s]).onUpdate(t);
    }
  };
  _ctor.prototype.onCommerce = function (t) {
    var e = this;
    this.ctrPlay.node.getPosition(this.vec2_1);
    if (this.gameData.appearBusinessPoints && this.gameData.appearBusinessPoints.getInClick(this.vec2_1, t)) {
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, true);
      var n = function (t) {
        e.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, false);
        if (t) {
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.map_coin);
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_map_coin_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
          e.gameData.appearBusinessPoints.node.active = false;
          e.gameData.coin += e.gameData.appearBusinessPoints.coinNum;
          $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, $z1Utils.Utils.StringFormat(e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameCom01), e.gameData.appearBusinessPoints.coinNum));
          $z1KinghtFallUIGame.default.instance.initView();
          var n = $z1KinghtFallUIGame.default.instance.ndCoin;
          var i = cc.v2(n.position.x + n.children[0].x, n.position.y + n.children[0].y);
          var a = e.gameData.appearBusinessPoints.node.convertToWorldSpaceAR(cc.v2(0, 0));
          var o = e.camera.getWorldToScreenPoint(a);
          var r = $z1KinghtFallUIGame.default.instance.ctrUI.node.convertToNodeSpaceAR(o);
          var s = function () {
            var t = cc.instantiate(n.children[0]);
            t.active = true;
            t.scale = .5;
            t.setParent($z1KinghtFallUIGame.default.instance.ctrUI.node);
            var e = cc.v2();
            cc.Vec2.random(e, 40);
            cc.tween(t).set({
              position: cc.v3(r.x, r.y, 0)
            }).by(.2, {
              position: cc.v3(e.x, e.y, 0)
            }).to(1, {
              position: cc.v3(i.x, i.y, 0),
              scale: 1
            }).call(function () {
              t.destroy();
            }).start();
          };
          for (var l = 0; l < 10; l++) {
            s();
          }
          e.gameData.appearBusinessPoints = null;
        } else {
          e.gameData.appearBusinessPoints.init(1);
        }
      };
      if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopOpen()) {
        $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIVideoTips, $z1Config.UIID.UINONE, 7, function (t) {
          n(t);
        });
      } else {
        $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
          n(true);
        }, function () {
          n(false);
        }, "battle.map.silver");
      }
    }
    if (!this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagWeapon] && this.gameData.weaponBusinessPoints && this.gameData.weaponBusinessPoints.getInClick(this.vec2_1, t)) {
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, true);
      var i = function (t) {
        e.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, false);
        if (t) {
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.map_weapon);
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_map_weapon_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagWeapon] = 1;
          e.gameData.weaponBusinessPoints.node.active = false;
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Attack] = .5;
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.AttackSpeed] = .5;
          $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameCom02));
          e.ctrPlay.ctrPlayAni.setBus(1);
          e.saveGame();
        } else {
          e.gameData.weaponBusinessPoints.init(1);
        }
      };
      if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopOpen()) {
        $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIVideoTips, $z1Config.UIID.UINONE, 6, function (t) {
          i(t);
        });
      } else {
        $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
          i(true);
        }, function () {
          i(false);
        }, "battle.map.weapon1");
      }
    }
    if (1 == this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagWeapon] && $z1KinghtFallModle.KinghtFallSwitch.isMapShopSecondOpen() && this.gameData.weaponBusinessPoints && this.gameData.weaponBusinessPoints.getInClick(this.vec2_1, t)) {
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, true);
      var a = function (t) {
        e.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, false);
        if (t) {
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.arrow2);
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_arrow2_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagWeapon] = 2;
          e.gameData.weaponBusinessPoints.node.active = false;
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Attack] = 1;
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.AttackSpeed] = 1;
          $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameCom02));
          e.ctrPlay.ctrPlayAni.setBus(3);
          e.saveGame();
        } else {
          e.gameData.weaponBusinessPoints.init(2);
        }
      };
      if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopOpen()) {
        $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIVideoTips, $z1Config.UIID.UINONE, 9, function (t) {
          a(t);
        });
      } else {
        $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
          a(true);
        }, function () {
          a(false);
        }, "battle.map.weapon2");
      }
    }
    if (!this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagHorse] && this.gameData.horseBusinessPoints && this.gameData.horseBusinessPoints.getInClick(this.vec2_1, t)) {
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, true);
      var o = function (t) {
        e.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, false);
        if (t) {
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.map_horse);
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_map_horse_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagHorse] = 1;
          e.gameData.horseBusinessPoints.node.active = false;
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Speed] = .5;
          $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameCom03));
          e.ctrPlay.ctrPlayAni.setBus(2);
          e.saveGame();
        } else {
          e.gameData.horseBusinessPoints.init(1);
        }
      };
      if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopOpen()) {
        $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIVideoTips, $z1Config.UIID.UINONE, 5, function (t) {
          o(t);
        });
      } else {
        $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
          o(true);
        }, function () {
          o(false);
        }, "battle.map.horse1");
      }
    }
    if (1 == this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagHorse] && $z1KinghtFallModle.KinghtFallSwitch.isMapShopSecondOpen() && this.gameData.horseBusinessPoints && this.gameData.horseBusinessPoints.getInClick(this.vec2_1, t)) {
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, true);
      var r = function (t) {
        e.sendEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, false);
        if (t) {
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.horse2);
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_horse2_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagHorse] = 2;
          e.gameData.horseBusinessPoints.node.active = false;
          e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Speed] = 1;
          $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameCom03));
          e.ctrPlay.ctrPlayAni.setBus(4);
          e.saveGame();
        } else {
          e.gameData.horseBusinessPoints.init(2);
        }
      };
      if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopOpen()) {
        $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIVideoTips, $z1Config.UIID.UINONE, 8, function (t) {
          r(t);
        });
      } else {
        $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
          r(true);
        }, function () {
          r(false);
        }, "battle.map.horse2");
      }
    }
  };
  _ctor.prototype.changeAge = function () {
    if (this._separateArmyCommands) return this.rallyCommand();
    if ($z1KinghtFallConfig.KinghtFallParameter.FollowMode == 1) {
      this.isAgg = false;
      this.rallyPoint = { index: this.pathIndex++, pos: Navigation.positionOf(this.ctrPlay.node, this) };
      this.pathList = [this.rallyPoint];
      this.ndAggFlag.Flag = 1;
      this.ndAggFlag.active = true;
      this.ndAggFlag.setPosition(this.rallyPoint.pos);
      this.ndAggFlag.zIndex = Math.floor(cc.winSize.height) - Math.floor(this.rallyPoint.pos.y);
      var animation = this.ndAggFlag.getComponent(sp.Skeleton);
      if (animation) {
        animation.setAnimation(0, "click", false);
        animation.addAnimation(0, "idle", true);
      }
    } else {
      if (this.isAgg) this.holdSelectedFollowers();
      this.isAgg = !this.isAgg;
      this.rallyPoint = null;
      this.pathList = [];
      this.ndAggFlag.Flag = 0;
      this.ndAggFlag.active = false;
    }
    this.ctrPlay.ndAgg.active = this.isAgg;
    this.applyArmyOrder();
    this.collectFollowers();
  };
  _ctor.prototype._usesSelectiveFollow = function () {
    return this._separateArmyCommands || $z1KinghtFallConfig.KinghtFallParameter.FollowMode === 2;
  };
  _ctor.prototype.followCommand = function () {
    if (this.isAgg) this.holdSelectedFollowers();
    this.isAgg = !this.isAgg;
    if (this.isAgg) this.gameData.getSoldierList().forEach(function (unit) { unit._followPickupBlocked = false; });
    this.ctrPlay.ndAgg.active = this.isAgg;
    this.applyArmyOrder();
    this.collectFollowers();
  };
  _ctor.prototype.rallyCommand = function () {
    this.rallyPoint = { index: this.pathIndex++, pos: Navigation.positionOf(this.ctrPlay.node, this) };
    this.pathList = [this.rallyPoint];
    this.ndAggFlag.Flag = 1; this.ndAggFlag.active = true;
    this.ndAggFlag.setPosition(this.rallyPoint.pos);
    this.ndAggFlag.zIndex = Math.floor(cc.winSize.height) - Math.floor(this.rallyPoint.pos.y);
    var animation = this.ndAggFlag.getComponent(sp.Skeleton);
    if (animation) { animation.setAnimation(0, "click", false); animation.addAnimation(0, "idle", true); }
    var game = this;
    this.gameData.getSoldierList().forEach(function (unit) {
      if (unit.isDead() || unit._isPooled || !unit.node.activeInHierarchy) return;
      if (unit._followSelected && game.isAgg) return;
      unit._followPickupBlocked = false;
      unit.setPersonalRallyPoint(game.rallyPoint.pos, true);
      unit._rallyOrder = game.rallyPoint;
    });
    this.applyArmyOrder();
    if (this.gameData.levelCfg) this.saveGame();
  };
  _ctor.prototype.collectFollowers = function () {
    if (!this._usesSelectiveFollow() || !this.isAgg || this.ctrPlay.isDead()) return;
    var units = this.gameData.getSoldierList(), added = false;
    for (var i = 0; i < units.length; i++) {
      var unit = units[i];
      if (unit._followPickupBlocked) {
        if (unit.rallyPoint && cc.Vec2.distance(Navigation.positionOf(unit.node, this), unit.rallyPoint.pos) <= 4 && !this.isUnitInFollowRing(unit)) unit._followPickupBlocked = false;
        continue;
      }
      if (unit._followSelected || !this.isUnitInFollowRing(unit)) continue;
      unit._followSelected = true;
      unit._followPickupBlocked = false;
      unit._rallyOrder = null;
      unit.rallyPoint = null; unit.pathList = null; unit._orderTarget = null; unit._targetRefresh = 0;
      unit.applyArmyOrder(this);
      added = true;
    }
    if (added) this._armyFormation = null;
  };
  _ctor.prototype.isUnitInFollowRing = function (unit) {
    if (!this._usesSelectiveFollow() || !this.isAgg || !unit || unit._isPooled ||
        unit.isDead() || unit.hp <= 0 || !unit.node.activeInHierarchy || this.ctrPlay.isDead()) return false;
    var ring = this.ctrPlay.ndAgg;
    var local = ring.convertToNodeSpaceAR(unit.node.convertToWorldSpaceAR(cc.v2(0, 0)));
    var x = (local.x - (.5 - ring.anchorX) * ring.width) / (ring.width / 2);
    var y = (local.y - (.5 - ring.anchorY) * ring.height) / (ring.height / 2);
    return x * x + y * y <= 1.0001;
  };
  _ctor.prototype.findFollowUnitAtScreen = function (screen) {
    if (!this._usesSelectiveFollow() || !this.isAgg) return null;
    var camera = this.camera || cc.Camera.main;
    if (!camera) return null;
    var point = this.ndMain.convertToNodeSpaceAR(camera.getScreenToWorldPoint(screen));
    var units = this.gameData.getSoldierList(), best = null, score = Infinity;
    for (var i = 0; i < units.length; i++) {
      var unit = units[i];
      if (!this.isUnitInFollowRing(unit)) continue;
      var rect = unit.spAni && unit.spAni.node.parent && DepthRendering.bounds && DepthRendering.bounds(unit.spAni, this.ndMain);
      if (!rect) {
        var foot = Navigation.positionOf(unit.node, this);
        rect = { minX: foot.x - 28, maxX: foot.x + 28, minY: foot.y - 12, maxY: foot.y + 80 };
      }
      if (point.x < rect.minX - 8 || point.x > rect.maxX + 8 || point.y < rect.minY - 8 || point.y > rect.maxY + 8) continue;
      var dx = point.x - (rect.minX + rect.maxX) / 2, dy = point.y - (rect.minY + rect.maxY) / 2;
      // Repeated taps can pick separate overlapping soldiers; tapping an
      // already selected soldier never accidentally releases the group.
      var candidate = dx * dx + dy * dy + (unit._followSelected ? 1e9 : 0);
      if (candidate < score) { score = candidate; best = unit; }
    }
    return best;
  };
  _ctor.prototype.selectFollower = function (unit) {
    if (this.gameData.getSoldierList().indexOf(unit) < 0 || !this.isUnitInFollowRing(unit)) return false;
    if (unit._followSelected) return true;
    unit._followSelected = true;
    unit._followPickupBlocked = false;
    unit._rallyOrder = null;
    unit.rallyPoint = null; unit.pathList = null; unit._orderTarget = null; unit._targetRefresh = 0;
    unit.applyArmyOrder(this);
    this._armyFormation = null;
    this._followFormation = this._rallyFormation = null;
    return true;
  };
  _ctor.prototype.holdSelectedFollowers = function () {
    var changed = false, game = this;
    this.gameData.getSoldierList().forEach(function (unit) {
      if (!unit._followSelected) return;
      unit._followSelected = false;
      if (!unit.isDead() && unit.node.activeInHierarchy) {
        unit.setPersonalRallyPoint(Navigation.positionOf(unit.node, game), true);
        changed = true;
      }
      unit.applyArmyOrder(game);
    });
    this._armyFormation = null;
    this._followFormation = this._rallyFormation = null;
    if (changed && this.gameData.levelCfg) this.saveGame();
  };
  _ctor.prototype.enterSelectiveFollow = function () {
    var game = this;
    this.gameData.getSoldierList().forEach(function (unit) {
      unit._followSelected = false;
      if (!unit.isDead() && unit.node.activeInHierarchy) unit.setPersonalRallyPoint(Navigation.positionOf(unit.node, game), true);
    });
    this.applyArmyOrder();
    if (this.gameData.levelCfg) this.saveGame();
  };
  _ctor.prototype.applyArmyOrder = function () {
    this._armyFormation = null;
    this._followFormation = this._rallyFormation = null;
    var soldiers = this.gameData.getSoldierList();
    for (var i = 0; i < soldiers.length; i++) soldiers[i].applyArmyOrder(this);
  };
  _ctor.prototype.getArmyOrderGoal = function (unit, anchor) {
    var allSoldiers = this.gameData.getSoldierList();
    var selective = this._usesSelectiveFollow();
    var rallyGroup = this._separateArmyCommands && !unit.isAgg && unit._rallyOrder && unit._rallyOrder === this.rallyPoint;
    if (selective && !unit.isAgg && !rallyGroup) return null;
    var soldiers = selective ? allSoldiers.filter(function (soldier) { return (rallyGroup ? !soldier.isAgg && soldier._rallyOrder === unit._rallyOrder : soldier.isAgg) && !soldier.isDead() && soldier.node.activeInHierarchy; }) : allSoldiers;
    // Preserve the exact destination and follow distance for a lone soldier.
    if (soldiers.length < 2) return null;
    var navigation = Navigation.get(this);
    navigation.refresh();
    var cache = this._separateArmyCommands ? (rallyGroup ? '_rallyFormation' : '_followFormation') : '_armyFormation';
    var previous = this[cache];
    if (previous && previous.frame === navigation._frameId) return previous.slots.get(unit) || { pending: true };
    var moved = !previous || cc.Vec2.distance(previous.anchor, anchor) > 20 || !navigation.grid.segmentClear(previous.anchor, anchor, 0);
    var changed = !previous || previous.order !== this.rallyPoint || previous.following !== this.isAgg || moved || previous.revision !== navigation.revision || previous.members.length !== soldiers.length;
    if (!changed) for (var i = 0; i < soldiers.length; i++) if (previous.members[i] !== soldiers[i]) { changed = true; break; }
    if (!changed) {
      previous.frame = navigation._frameId;
      return previous.slots.get(unit) || { pending: true };
    }
    // A point inside a wall/open leaf retains normal projected-goal handling.
    // Formation points must be on the command's side of every intact gate.
    if (!navigation.grid.isWalkable(anchor, 0)) return null;
    var center = !moved && previous ? previous.anchor : { x: anchor.x, y: anchor.y };
    var heroRadius = navigation.radius(this.ctrPlay), radius = 8, radii = new Map();
    soldiers.forEach(function (soldier) {
      var r = soldier.isDead() ? soldier._armyBodyRadius || 20 : navigation.radius(soldier);
      soldier._armyBodyRadius = r;
      radii.set(soldier, r);
      radius = Math.max(radius, r);
    });
    // Navigation adds at least two pixels to each body's enclosing radius.
    // Share that clearance between neighbours while retaining a two-pixel gap;
    // terrain checks below still use the full navigation radius.
    var spacing = radius * 2 - 2, candidates = [], reserved = [], slots = new Map();
    var limit = Math.min(480, Math.max(spacing * 3, spacing * (Math.ceil(Math.sqrt(soldiers.length)) + 2)));
    var gatePolygons = [], main = this.ndMain;
    this.gameData.getBulidList().forEach(function (building) {
      var shapes = building.getNavigationGateShapes && building.getNavigationGateShapes();
      if (shapes) shapes.forEach(function (shape) {
        gatePolygons.push(shape.points.map(function (point) { return main.convertToNodeSpaceAR(cc.v2(point)); }));
      });
    });
    function clearGateApproach(point, r) {
      // Match settleArmyCrowd's protected gate approach. A destination here
      // would park a body in the passage while nearby units cannot settle.
      var clearance = r * 2 + 8, squared = clearance * clearance;
      for (var g = 0; g < gatePolygons.length; g++) {
        var polygon = gatePolygons[g];
        for (var j = 0; j < polygon.length; j++) {
          var a = polygon[j], b = polygon[(j + 1) % polygon.length];
          var dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
          var along = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
          var x = point.x - a.x - along * dx, y = point.y - a.y - along * dy;
          if (x * x + y * y < squared) return false;
        }
      }
      return true;
    }
    function available(point, r) {
      for (var j = 0; j < reserved.length; j++) {
        var other = reserved[j], clearance = r + other.radius - 2 - .01;
        var dx = point.x - other.pos.x, dy = point.y - other.pos.y;
        if (clearance > 0 && dx * dx + dy * dy < clearance * clearance) return false;
      }
      return true;
    }
    function valid(point, r) {
      return available(point, r) && clearGateApproach(point, r) && navigation.grid.isWalkable(point, r) && navigation.grid.segmentClear(center, point, 0);
    }
    function reserve(soldier, point) {
      var slot = { pos: point, radius: radii.get(soldier) };
      slots.set(soldier, slot);
      reserved.push(slot);
    }
    // Reserve the hero/flag center, then retain each unit's own slot through
    // deaths, revival and roster changes. No path searches run during layout.
    reserved.push({ pos: center, radius: heroRadius });
    if (selective) allSoldiers.forEach(function (soldier) {
      if (soldiers.indexOf(soldier) < 0 && !soldier.isDead() && soldier.node.activeInHierarchy) reserved.push({ pos: Navigation.positionOf(soldier.node, navigation.game), radius: navigation.radius(soldier) });
    });
    if (previous) soldiers.forEach(function (soldier) {
      var old = previous.slots.get(soldier);
      if (!old || !old.pos) return;
      var point = { x: center.x + old.pos.x - previous.anchor.x, y: center.y + old.pos.y - previous.anchor.y };
      if (cc.Vec2.distance(point, center) <= limit && valid(point, radii.get(soldier))) reserve(soldier, point);
    });
    // A hexagonal lattice packs the actual body clearance into narrow outdoor
    // approaches without letting the larger hero inflate every soldier slot.
    if (slots.size < soldiers.length) {
      var rowHeight = spacing * Math.sqrt(3) / 2, rows = Math.ceil(limit / rowHeight), columns = Math.ceil(limit / spacing);
      for (var row = -rows; row <= rows; row++) for (var column = -columns; column <= columns; column++) {
        var candidate = { x: center.x + (column + (row % 2) / 2) * spacing, y: center.y + row * rowHeight };
        var distance = cc.Vec2.distance(candidate, center);
        if (distance <= limit) candidates.push({ pos: candidate, distance: distance });
      }
      candidates.sort(function (a, b) { return a.distance - b.distance || a.pos.y - b.pos.y || a.pos.x - b.pos.x; });
    }
    soldiers.forEach(function (soldier) {
      if (slots.has(soldier)) return;
      // Terrain and gate-side checks are shared at the largest body radius.
      // Evaluate only candidates reached by this layout, at most once each;
      // reservations alone change while assigning the remaining bodies.
      for (var j = 0; j < candidates.length; j++) {
        var candidate = candidates[j];
        if (candidate.clear === false || !available(candidate.pos, radii.get(soldier))) continue;
        if (candidate.clear === undefined) candidate.clear = clearGateApproach(candidate.pos, radius) && navigation.grid.isWalkable(candidate.pos, radius) && navigation.grid.segmentClear(center, candidate.pos, 0);
        if (!candidate.clear) continue;
        reserve(soldier, candidate.pos);
        break;
      }
      if (!slots.has(soldier)) slots.set(soldier, { pending: true });
    });
    this[cache] = { frame: navigation._frameId, order: this.rallyPoint, following: this.isAgg, anchor: center,
      revision: navigation.revision, members: soldiers.slice(), slots: slots };
    return slots.get(unit);
  };
  _ctor.prototype.settleArmyCrowd = function (unit, position) {
    var formation = this._separateArmyCommands ? (unit.isAgg ? this._followFormation : this._rallyFormation) : this._armyFormation;
    if (!formation || !formation.slots.has(unit)) return false;
    var navigation = Navigation.get(this), radius = navigation.radius(unit);
    navigation.refresh();
    if (!navigation.grid.isWalkable(position, radius) || !navigation.grid.segmentClear(formation.anchor, position, 0)) return false;
    var extent = 0;
    formation.slots.forEach(function (slot) { if (slot.pos) extent = Math.max(extent, cc.Vec2.distance(slot.pos, formation.anchor)); });
    if (cc.Vec2.distance(position, formation.anchor) > extent + radius) return false;
    // A rally is an area. A body already resting safely against its allies
    // need not push through them to reach an arbitrary numbered slot.
    // Keep the gate throat clear and never accept arrival on its wrong side.
    var buildings = this.gameData.getBulidList();
    for (var i = 0; i < buildings.length; i++) {
      var shapes = buildings[i].getNavigationGateShapes && buildings[i].getNavigationGateShapes();
      if (shapes) for (var j = 0; j < shapes.length; j++) if (Navigation.polygonDistance(unit, shapes[j].points, this) < radius * 2 + 8) return false;
    }
    var neighbours = this.gameData.getSoldierList().concat([this.ctrPlay]);
    for (i = 0; i < neighbours.length; i++) {
      var other = neighbours[i];
      if (other === unit || other.isDead() || !other.node.activeInHierarchy) continue;
      var otherRadius = other._armyBodyRadius || navigation.radius(other);
      if (cc.Vec2.distance(position, Navigation.positionOf(other.node, this)) <= radius + otherRadius + 8) {
        formation.slots.set(unit, { pos: { x: position.x, y: position.y }, radius: radius, resting: true });
        Navigation.reset(unit);
        return true;
      }
    }
    return false;
  };
  _ctor.prototype.clearArmyOrder = function (savePosts) {
    if (savePosts !== false && this._usesSelectiveFollow()) this.holdSelectedFollowers();
    this.isAgg = false;
    this.rallyPoint = null;
    this.pathList = [];
    this.ndAggFlag.Flag = 0;
    this.ndAggFlag.active = false;
    this.ctrPlay.ndAgg.active = false;
    this.gameData.getSoldierList().forEach(function (unit) { unit._followSelected = false; unit._rallyOrder = null; });
    this.applyArmyOrder();
  };
  _ctor.prototype.addPathNode = function () {
    // Compatibility for callers issuing a fresh rally: followers read the
    // live hero position and never accumulate or replay movement history.
    this.pathList = [{ index: this.pathIndex++, pos: Navigation.positionOf(this.ctrPlay.node, this) }];
  };
  _ctor.prototype.onPauseGame = function () {
    this.ctrPlay.setPause(true);
    var t = this.gameData.getEnemyList();
    for (var e = 0; e < t.length; e++) {
      t[e].setPause(true);
    }
    var n = this.gameData.getSoldierList();
    for (e = 0; e < n.length; e++) {
      n[e].setPause(true);
    }
  };
  _ctor.prototype.onResumeGame = function () {
    this.ctrPlay.setPause(false);
    var t = this.gameData.getEnemyList();
    for (var e = 0; e < t.length; e++) {
      t[e].setPause(false);
    }
    var n = this.gameData.getSoldierList();
    for (e = 0; e < n.length; e++) {
      n[e].setPause(false);
    }
  };
  _ctor.prototype.endRoundGame = function () {
    this.moveDir = cc.v2(0, 0);
    var t = this.gameData.endRoundGame();
    var e = $z1KinghtFallUIGame.default.instance.ndCoin;
    var n = cc.v2(e.position.x + e.children[0].x, e.position.y + e.children[0].y);
    var i = t[0].node.convertToWorldSpaceAR(t[0].ndHp.getPosition());
    var a = this.camera.getWorldToScreenPoint(i);
    var o = $z1KinghtFallUIGame.default.instance.ctrUI.node.convertToNodeSpaceAR(a);
    var r = function () {
      var t = cc.instantiate(e.children[0]);
      t.active = true;
      t.scale = .5;
      t.setParent($z1KinghtFallUIGame.default.instance.ctrUI.node);
      var i = cc.v2();
      cc.Vec2.random(i, 40);
      cc.tween(t).set({
        position: cc.v3(o.x, o.y, 0)
      }).by(.2, {
        position: cc.v3(i.x, i.y, 0)
      }).to(1, {
        position: cc.v3(n.x, n.y, 0),
        scale: 1
      }).call(function () {
        t.destroy();
      }).start();
    };
    for (var s = 0; s < 10; s++) {
      r();
    }
    var l = function (i) {
      var a = t[i];
      var o = a.node.convertToWorldSpaceAR(a.ndHp.getPosition());
      var r = c.camera.getWorldToScreenPoint(o);
      var s = $z1KinghtFallUIGame.default.instance.ctrUI.node.convertToNodeSpaceAR(r);
      var l = cc.instantiate(e.children[0]);
      l.active = true;
      l.scale = .5;
      l.setParent($z1KinghtFallUIGame.default.instance.ctrUI.node);
      cc.tween(l).set({
        position: cc.v3(s.x, s.y, 0)
      }).to(1, {
        position: cc.v3(n.x, n.y, 0),
        scale: 1
      }).call(function () {
        l.destroy();
      }).start();
    };
    var c = this;
    for (s = 1; s < t.length; s++) {
      l(s);
    }
    this.cleanMap();
  };
  _ctor.prototype.cleanMap = function () {
    if (this.upBulid && this.upBulid.cancelUpgrade) this.upBulid.cancelUpgrade();
    this._combatEpoch++;
    for (var t = 0; t < this.ndPlayArr2.length; t++) {
      this.ndPlayArr2[t].cancel();
      this.ndPlayArr2[t].node.active = false;
      this.ndPlayArr1.push(this.ndPlayArr2[t].node);
    }
    this.ndPlayArr2 = [];
    this.ndEnemyArr.forEach(function (t) {
      t.freeNode(false);
    });
    this.ndEnemyArr = [];
    this.ndSoldArr.forEach(function (t) {
      t.freeNode(false);
    });
    this.ndSoldArr = [];
    for (t = 0; t < this.ndBuildArr2.length; t++) {
      this.ndBuildArr2[t].cancel();
      this.ndBuildArr2[t].node.active = false;
      this.ndBuildArr1.push(this.ndBuildArr2[t].node);
    }
    this.ndBuildArr2 = [];
  };
  _ctor.prototype.addEnemy = function (t, e, authoredRoute) {
    var n = this;
    var epoch = this._combatEpoch;
    if (-1 != t) {
      var i = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById(t);
      var a = $z1KinghtFallConfig.KinghtFallPoolName.Enemy + "_" + i.ID;
      var o = function (i) {
        i.setParent(n.ndMain);
        i.active = true;
        var a = n.ndPath.getChildByName("ndEnemy" + e);
        if (!a) { i.active = false; cc.warn('Missing authored spawn ' + e); return; }
        i.setPosition(a.position);
        var o = i.getComponent($z1KinghtFallEnemyBase.default);
        n._authoredRouteOverride = authoredRoute || null;
        try { o.initData(t, e); } finally { n._authoredRouteOverride = null; }
        n.gameData.addEnemy(o);
      };
      var r = $z1PoolMgr.PoolMgr.getInstance().getNode(a);
      if (r) {
        o(r);
      } else {
        var pendingData = this.gameData;
        pendingData.pendingEnemySpawns = (pendingData.pendingEnemySpawns || 0) + 1;
        this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Enemy, i.prefab, function (t) {
          if (!cc.isValid(n, true) || !cc.isValid(n.node, true) || n._combatEpoch !== epoch) return;
          r = $z1PoolMgr.PoolMgr.getInstance().getNodeFromPrefab(a, t, 10);
          o(r);
          pendingData.pendingEnemySpawns--;
        });
      }
    }
  };
  _ctor.prototype.addSoldier = function (t, e) {
    var n = this;
    var epoch = this._combatEpoch;
    var i = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById(t, "ally");
    var a = $z1KinghtFallConfig.KinghtFallPoolName.Soldier + "_" + i.ID;
    var o = function (i) {
      i.setParent(n.ndMain);
      i.active = true;
      var a = i.getComponent($z1KinghtFallSoldierBase.default);
      a.initData(t);
      n.gameData.addSoldier(a);
      e(a);
    };
    var r = $z1PoolMgr.PoolMgr.getInstance().getNode(a);
    if (r) {
      o(r);
    } else {
      this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Enemy, "Play" + i.prefab, function (t) {
        if (!cc.isValid(n, true) || !cc.isValid(n.node, true) || n._combatEpoch !== epoch) return;
        r = $z1PoolMgr.PoolMgr.getInstance().getNodeFromPrefab(a, t, 1);
        o(r);
      });
    }
  };
  _ctor.prototype.setPath = function (t) {
    var e;
    var n = {
      bornIndex: t,
      pathList: [],
      nodeIndex: 0
    };
    var i = [];
    var a = this.gameData.getBulidList();
    for (var o = 0; o < a.length; o++) {
      (l = a[o]).getIsLock() && i.push(l.ID);
    }
    var authoredHolder = this.ndPath.getChildByName('Authored routes');
    var authoredPaths = authoredHolder && authoredHolder.getComponent('AuthoredStagePaths');
    if (authoredPaths) {
      n.pathList = authoredPaths.resolve(t, i, this._authoredRouteOverride);
      return n;
    }
    var r = this.ndPath.getComponentsInChildren($z1KinghtFallPathInfo.default);
    var s = [];
    for (o = 0; o < r.length; o++) {
      var l;
      if ((l = r[o]).ndLockList.includes(t)) {
        if (0 == l.ndBuildList.length) {
          s.push(l.node);
        } else {
          for (var c = 0; c < i.length; c++) {
            if (l.ndBuildList.includes(i[c])) {
              s.push(l.node);
              break;
            }
          }
        }
      }
    }
    (e = n.pathList).push.apply(e, s[$z1Utils.Utils.randomRang(0, s.length)].children);
    return n;
  };
  _ctor.prototype.onPlayAttack = function (t) {
    var e = this;
    var n = this.ndPlayArr1.shift();
    n || (n = cc.instantiate(this.ctrPlay.ctrArr.node)).setParent(this.ndUI);
    n.setSiblingIndex(0);
    n.active = true;
    var i = this.ctrPlay.getAttWpos();
    var a = this.ndUI.convertToNodeSpaceAR(i);
    n.setPosition(a);
    var o = n.getComponent($z1KinghtFallBulletPlay.default);
    o.setSkin(this.ctrPlay.ctrPlayAni.arrName);
    this.ndPlayArr2.push(o);
    var r = this.ctrPlay.getAttack(t);
    var s = this.ctrPlay.crit >= Math.random();
    s && (r *= this.ctrPlay.critDam);
    o.combatContext = this;
    ProjectileLooks.prepare(o, this, "hero");
    o.setTag(a, t.node, function () {
      if (cc.isValid(t) && cc.isValid(t.node)) {
        if (!$z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getGuideTips(2)) {
          $z1KinghtFallUIGame.default.instance.ctrUI.setGuide(null);
          $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().setGuideTips(2);
        }
        $z1KinghtFallUIGame.default.instance.ctrEffect.showDamageNum(t.node.getPosition(), r, s);
        $z1KinghtFallUIGame.default.instance.ctrEffect.onMonsterAttack(t.node.getPosition(), "jian_" + e.ctrPlay.ctrPlayAni.arrName);
        n.active = false;
        t.onAttacked(r);
        var i = e.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff08);
        i && t.isDead() && e.ctrPlay.addHpPro(i.Pamer[0]);
        var a = e.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff15);
        a && !t.isDead() && t.addBuff($z1KinghtFallInterface.KinghtFallEnemyBuffType.MoveSpeed, {
          subNum: a.Pamer[0],
          time: 1
        });
      }
    });
  };
  _ctor.prototype.freeBullet = function (t) {
    for (var e = 0; e < this.ndPlayArr2.length; e++) {
      if (this.ndPlayArr2[e].uuid == t.uuid) {
        this.ndPlayArr2.splice(e, 1);
        break;
      }
    }
    t.node.active = false;
    this.ndPlayArr1.push(t.node);
  };
  _ctor.prototype.onShotEnemy = function (t) {
    var e = t.getBullet();
    e.setParent(this.ndUI);
    e.setSiblingIndex(0);
    e.active = true;
    var n = t.getAttWpos();
    var i = this.ndUI.convertToNodeSpaceAR(n);
    e.setPosition(i);
    var a = e.getComponent($z1KinghtFallBulletEnemy.default);
    a.combatContext = this;
    ProjectileLooks.prepare(a, this, "enemy:" + t.cfg.ID);
    this.ndEnemyArr.push(a);
    return {
      ctr: a,
      pos: i
    };
  };
  _ctor.prototype.freeEnemyBullet = function (t) {
    for (var e = 0; e < this.ndEnemyArr.length; e++) {
      if (this.ndEnemyArr[e].uuid == t.uuid) {
        this.ndEnemyArr.splice(e, 1);
        break;
      }
    }
  };
  _ctor.prototype.onShotBuild = function (t, e) {
    var appearance = t.buildInfo && t.buildInfo.cfg && t.buildInfo.cfg.Appearance;
    var layered = appearance && appearance.weapon && appearance.weapon.sprite;
    if (layered) {
      var artwork = require("BuildingAppearance");
      if (artwork.ready && !artwork.ready(t)) return;
    }
    var n = this.ndBuildArr1.shift();
    n || (n = cc.instantiate(this.buildBullet.node)).setParent(this.ndUI);
    n.setSiblingIndex(0);
    n.active = true;
    var behavior = t.getTowerSettings ? t.getTowerSettings() : null;
    if (layered && !behavior) behavior = require("TowerCombat").settings({ Tower: {} });
    var modern = behavior && (behavior.attackType !== "arrow" || layered);
    var i = modern ? require("BuildingAppearance").muzzle(t, this) : t.getAttPos();
    n.setPosition(i);
    var a = n.getComponent($z1KinghtFallBulletBuild.default);
    this.ndBuildArr2.push(a);
    var o = t.getAttack();
    if (a._towerBaseSpeed === undefined) a._towerBaseSpeed = a.speed;
    a.speed = behavior && behavior.projectileSpeed || a._towerBaseSpeed;
    a.combatContext = this;
    if (modern) {
      var game = this, effects = $z1KinghtFallUIGame.default.instance.ctrEffect;
      if (behavior.projectileLook || behavior.attackType === "arrow") ProjectileLooks.prepare(a, this, behavior.projectileLook || "tower");
      else ProjectileLooks.release(a);
      a.setTowerTag(i, e.node, function () {
        var center = behavior.attackType === "cannon" ? a._towerImpactPoint : require("TowerCombat").point(e.node, game.ndUI);
        require("TowerCombat").damage(game, e, center, o, behavior, function (actor, position, damage) {
          if (effects && cc.isValid(effects, true)) {
            effects.showDamageNum(position, damage);
            if (behavior.attackType !== "cannon") effects.onMonsterAttack(position, "jian_lv1");
          }
        });
      }, behavior);
      return;
    }
    ProjectileLooks.prepare(a, this, behavior && behavior.projectileLook || "tower");
    a.setTag(i, e.node, function () {
      if (cc.isValid(e) && cc.isValid(e.node)) {
        $z1KinghtFallUIGame.default.instance.ctrEffect.showDamageNum(e.node.getPosition(), o);
        $z1KinghtFallUIGame.default.instance.ctrEffect.onMonsterAttack(e.node.getPosition(), "jian_lv1");
        n.active = false;
        e.onAttacked(o);
      }
    });
  };
  _ctor.prototype.freeBuildBullet = function (t) {
    for (var e = 0; e < this.ndBuildArr2.length; e++) {
      if (this.ndBuildArr2[e].uuid == t.uuid) {
        this.ndBuildArr2.splice(e, 1);
        break;
      }
    }
    t.node.active = false;
    this.ndBuildArr1.push(t.node);
  };
  _ctor.prototype.onShotSoldier = function (t) {
    var e = t.getBullet();
    e.setParent(this.ndUI);
    e.setSiblingIndex(0);
    e.active = true;
    var n = t.getAttWpos();
    var i = this.ndUI.convertToNodeSpaceAR(n);
    e.setPosition(i);
    var a = e.getComponent($z1KinghtFallBulletSoldier.default);
    a.combatContext = this;
    ProjectileLooks.prepare(a, this, "ally:" + t.cfg.ID);
    this.ndSoldArr.push(a);
    return {
      ctr: a,
      pos: i
    };
  };
  _ctor.prototype.freeSoldierBullet = function (t) {
    for (var e = 0; e < this.ndSoldArr.length; e++) {
      if (this.ndSoldArr[e].uuid == t.uuid) {
        this.ndSoldArr.splice(e, 1);
        break;
      }
    }
  };
  _ctor.prototype.onDropItem = function (t) {
    this.dropList.push({
      ndItem: null,
      type: t
    });
  };
  _ctor.prototype.onChangeSpeed = function () {
    this.ctrPlay.ctrPlayAni.onChangeSpeed();
    this.gameData.onChangeSpeed();
  };
  _ctor.prototype.loadGame = function () {
    var t = this;
    var record = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData(), stage = this.gameData.levelCfg.Level;
    if (record.hasSave(stage)) {
      record.activateStage(stage);
      this.gameData.setRound();
      record.getBuffList(stage).forEach(function (e) {
        t.gameData.addGameBuff(e, true);
      });
      var e = record.getBuildInfoList(stage);
      var n = this.gameData.getBulidList();
      for (var i = 0; i < n.length; i++) {
        var a = n[i];
        for (var o = 0; o < e.length; o++) {
          var r = e[o];
          a.ID == r.point && a.setSave(r);
        }
      }
      this.gameData.businessAdd = Object.assign({}, record.getBusinessList(stage));
      if (1 == this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagWeapon]) {
        this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Attack] = .5;
        this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.AttackSpeed] = .5;
        this.ctrPlay.ctrPlayAni.setBus(1);
      }
      if (2 == this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagWeapon] && $z1KinghtFallModle.KinghtFallSwitch.isMapShopSecondOpen()) {
        this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Attack] = 1;
        this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.AttackSpeed] = 1;
        this.ctrPlay.ctrPlayAni.setBus(3);
      }
      if (1 == this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagHorse]) {
        this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Speed] = .5;
        this.ctrPlay.ctrPlayAni.setBus(2);
      }
      if (2 == this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagHorse] && $z1KinghtFallModle.KinghtFallSwitch.isMapShopSecondOpen()) {
        this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Speed] = 1;
        this.ctrPlay.ctrPlayAni.setBus(4);
      }
      var s = record.getTaskInfo(stage);
      if (s) {
        this.gameData.taskInfo.index = s.index;
        this.gameData.taskInfo.list = s.list.slice();
        this.gameData.taskInfo.stage = s.stage;
      }
      return true;
    }
    return false;
  };
  _ctor.prototype.getCheckpoint = function () {
    var t = [];
    this.gameData.buffList.forEach(function (e) {
      t.push(e.id);
    });
    var e = [];
    this.gameData.getBulidList().forEach(function (t) {
      e.push(t.getSave());
    });
    var n = {
      index: this.gameData.taskInfo.index,
      list: this.gameData.taskInfo.list,
      stage: this.gameData.taskInfo.stage
    };
    return { levelNum: this.gameData.levelCfg.Level, roundNum: this.gameData.round,
      coin: this.gameData.coin, buffList: t, buildingLevel: e,
      businessList: this.gameData.businessAdd, taskList: n };
  };
  _ctor.prototype.saveGame = function () {
    return $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().setCheckpoint(this.getCheckpoint());
  };
  cc__decorate([ccp_property({
    type: cc.Camera,
    tooltip: "摄像机"
  })], _ctor.prototype, "camera", undefined);
  cc__decorate([ccp_property({
    type: $z1KinghtFallGamePlayCtrl.default,
    tooltip: "玩家"
  })], _ctor.prototype, "ctrPlay", undefined);
  cc__decorate([ccp_property({
    type: $z1KinghtFallBulletBuild.default,
    tooltip: "建筑箭头"
  })], _ctor.prototype, "buildBullet", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "召唤棋子"
  })], _ctor.prototype, "ndAggFlag", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.default = def_KinghtFallGameCtrl;
