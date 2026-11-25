var BattleSounds = require("BattleSounds");
var ProjectileLooks = require("ProjectileLooks");
var GameToolsOverrides = require("GameToolsOverrides");
var FlightTargeting = require("FlightTargeting");
var GameplayAdOwner = require("GameplayAdOwner");
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
function checkpointTasks(task, resetIndex) {
  var reset = resetIndex !== undefined;
  var saved = { index: reset ? resetIndex : task.index, list: task.list.slice(), stage: reset ? 0 : task.stage };
  if (Array.isArray(task.reward)) {
    saved.reward = task.reward.slice(0, task.list.length).map(function (reward) { return { id: reward.id, num: reward.num }; });
  }
  if (task.authored) saved.authored = true;
  if (task.rewardMultiplier !== undefined) saved.rewardMultiplier = task.rewardMultiplier;
  if (Array.isArray(task.targets)) {
    saved.targets = task.targets.slice();
    saved.progress = reset ? 0 : task.progress;
    if (!reset && typeof task.waveIntact === "boolean") saved.waveIntact = task.waveIntact;
    if (!reset && Number.isSafeInteger(task.scoredRound)) saved.scoredRound = task.scoredRound;
  }
  return saved;
}
function armyRole(unit) {
  if (Number(unit.cfg.ID) === 90004) return "flank";
  return unit.cfg.AttackType === 2 ? "rear" : "front";
}
function armyLayout(soldiers, spacing, center, forward, heroRadius, radius) {
  var groups = { front: [], rear: [], flank: [] }, preferred = new Map();
  soldiers.forEach(function (unit) { groups[armyRole(unit)].push(unit); });
  // Heavy infantry fills the leading row before the other front-line troops.
  groups.front.sort(function (a, b) { return (Number(b.cfg.ID) === 90002 ? 1 : 0) - (Number(a.cfg.ID) === 90002 ? 1 : 0); });
  var columns = Math.max(2, Math.ceil(Math.sqrt(Math.max(groups.front.length, groups.rear.length))));
  var depth = Math.max(spacing, heroRadius + radius + 6), flank = Math.max(depth, (columns + 1) * spacing / 2);
  function world(x, y) { return { x: center.x + forward.y * x + forward.x * y, y: center.y - forward.x * x + forward.y * y }; }
  ["front", "rear"].forEach(function (role) {
    var members = groups[role], ranks = Math.ceil(members.length / columns);
    members.forEach(function (unit, index) {
      var row = Math.floor(index / columns), count = Math.min(columns, members.length - row * columns);
      var column = index % columns, x = (column - (count - 1) / 2) * spacing;
      var y = depth + (role === "front" ? ranks - row - 1 : row) * spacing;
      if (!groups.front.length || !groups.rear.length) y = depth + ((ranks - 1) / 2 - row) * spacing;
      preferred.set(unit, world(x, role === "front" ? y : -y));
    });
  });
  groups.flank.forEach(function (unit, index) {
    var side = index % 2 ? 1 : -1, sideCount = Math.ceil((groups.flank.length - index % 2) / 2);
    preferred.set(unit, world(side * flank, (Math.floor(index / 2) - (sideCount - 1) / 2) * spacing));
  });
  return { preferred: preferred, groups: groups, flank: flank, spacing: spacing, forward: forward };
}
function rolePosition(layout, unit, point, center) {
  var x = point.x - center.x, y = point.y - center.y, along = x * layout.forward.x + y * layout.forward.y;
  var side = x * layout.forward.y - y * layout.forward.x, role = armyRole(unit);
  if (role === "front" && layout.groups.rear.length && along < 0) return false;
  if (role === "rear" && layout.groups.front.length && along > 0) return false;
  return role !== "flank" || !layout.groups.front.length && !layout.groups.rear.length || Math.abs(side) >= layout.flank - layout.spacing * .6;
}
var DepthRendering = require("KinghtFallDepthView");
var DepthView = DepthRendering.DepthView;
var TestMode = require("TestMode").TestMode;
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
function frameCurrent(game, ui, data, epoch, stage) {
  return cc.isValid(game, true) && (!game.node || cc.isValid(game.node, true) && game.node.activeInHierarchy !== false) &&
    game.gameData === data && game._combatEpoch === epoch && game.gameStatus === stage &&
    (!ui || $z1KinghtFallUIGame.default.instance === ui && cc.isValid(ui, true) && !ui.isclose && ui.ctrGame === game && (!ui.node || cc.isValid(ui.node, true) && ui.node.activeInHierarchy !== false));
}
function updateProjectiles(projectiles, dt, game, ui, data, epoch, stage) {
  // Returning a shot to its pool removes it from this list immediately.
  // Advance over survivors only, and leave shots appended here for the next tick.
  var index = 0;
  for (var remaining = projectiles.length; remaining > 0 && index < projectiles.length; remaining--) {
    if (!frameCurrent(game, ui, data, epoch, stage)) return;
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
    GameplayAdOwner.retire(this);
    if (this._unitTest) this._unitTest.dispose();
    if (typeof cc !== "undefined" && cc.PhysicsContact) require("PhysicsContactCompat").install();
    this._restartRetired = false;
    this._waveStartCheckpoint = null;
    require("AudioMgr").AudioMgr.getInstance().stopOwnedEffects(this);
    if (this._battleSounds && BattleSounds.dispose) BattleSounds.dispose(this);
    if (this._unitVoices) require("UnitVoices").dispose(this);
    if (this._projectileLooks) this._projectileLooks.dispose();
    this._projectileLooks = null;
    GameToolsOverrides.clear();
    this._combatEpoch++;
    this._battleSettlement = null;
    this.isAgg = false;
    this.rallyPoint = null;
    this.pathList = [];
    this._rallyMarkerRemaining = 0;
    this._armyFormation = null;
    this._followFormation = this._rallyFormation = null;
    this._armyFormationJob = this._followFormationJob = this._rallyFormationJob = null;
    this._separateArmyCommands = true;
    var saved = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData();
    var restoring = saved.hasSave(t);
    var checkpoint = restoring && saved.getCheckpoint ? saved.getCheckpoint(t) : null;
    var tasks = restoring ? (checkpoint && checkpoint.taskList || (saved.getTaskInfo && saved.getTaskInfo(t)) || null) : undefined;
    this.gameData = new $z1KinghtFallGameCtrlData.default(this, t, restoring, checkpoint && checkpoint.restartSetup, tasks);
    require("RelicRuntime").restore(this.gameData, checkpoint && checkpoint.relicState);
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
    this.ctrPlay.node.setPosition(Navigation.positionOf(this.ndPath.getChildByName("ndStar"), this));
    this.ctrPlay.ndRange.setParent(this.ndUI);
    this.ndAggFlag.setParent(this.ndMain);
    this.gameData.initMap();
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
    GameplayAdOwner.retire(this);
    if (this._unitTest) this._unitTest.dispose();
    if(this.gameData&&this.gameData.levelCfg)require("EnemyStageProfiles").clear(this.gameData.levelCfg);
    require("AudioMgr").AudioMgr.getInstance().stopOwnedEffects(this);
    if (this._battleSounds && BattleSounds.dispose) BattleSounds.dispose(this);
    if (this._unitVoices) require("UnitVoices").dispose(this);
    if (this._projectileLooks) this._projectileLooks.dispose();
    this._projectileLooks = null;
    GameToolsOverrides.clear();
    if (this._depthView) this._depthView.destroy();
    this._depthView = null;
    this._combatEpoch++;
    if (this._mapPhysicsManager) this._mapPhysicsManager.off("before-step", this._syncMapPhysics, this);
    this._mapPhysicsManager = null;
    this._mapPhysicsRoot = null;
    t.prototype.onDestroy.call(this);
  };
  _ctor.prototype.onDisable = function () {
    GameplayAdOwner.retire(this);
    if (this._unitTest) this._unitTest.dispose();
    if (t.prototype.onDisable) t.prototype.onDisable.call(this);
  };
  _ctor.prototype.onRestart = function (t) {
    if (this._battleSounds && BattleSounds.dispose) BattleSounds.dispose(this);
    this.clearArmyOrder(false);
    this._battleSettlement = null;
    t && (this.gameData.buffList = []);
    // End the previous request lifetime before buildings request their new roster.
    this.cleanMap();
    this.gameData.onRestart(t);
    this.moveDir = cc.v2(0, 0);
    this.ctrPlay.onRestart(t);
    this.ctrPlay.node.setPosition(Navigation.positionOf(this.ndPath.getChildByName("ndStar"), this));
    this.gameStatus = $z1KinghtFallModle.KinghtFallGameStage.Prepare;
    this.isAgg = false;
    this.ctrPlay.ndAgg.active = this.isAgg;
    this.ndAggFlag.active = false;
  };
  _ctor.prototype.moveFun = function (t) {
    if (t && isFinite(t.x) && isFinite(t.y) && (t.x || t.y)) {
      cc.Vec2.normalize(this.moveDir, t);
    } else {
      this.moveDir = cc.v2(0, 0);
    }
  };
  _ctor.prototype.onLateUpdate = function () {
    this.ctrPlay.node.getPosition(this.vec2_1);
    this.ctrPlay.node.getPosition(this.vec2_2);
    var depth = this._depthView;
    if (!depth || depth._destroyed || depth.main !== this.ctrPlay.node.parent) {
      this.ctrPlay.node.zIndex = Math.floor(cc.winSize.height) - Math.floor(this.vec2_1.y);
    }
    this.vec2_1.x = cc.misc.clampf(this.vec2_1.x, -this.moveSize.width / 2, this.moveSize.width / 2);
    this.vec2_1.y = cc.misc.clampf(this.vec2_1.y, -this.moveSize.height / 2, this.moveSize.height / 2);
    this.ctrPlay.node.setPosition(this.vec2_1);
    this.ctrPlay.ndRange.setPosition(this.vec2_1);
    var testTarget = this._unitTest && this._unitTest.cameraTarget();
    if (testTarget) testTarget.getPosition(this.vec2_2);
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
    var ui = $z1KinghtFallUIGame.default.instance, data = this.gameData, epoch = this._combatEpoch, stage = this.gameStatus;
    if (!frameCurrent(this, ui, data, epoch, stage)) return;
    if (this._battleSounds && BattleSounds.tick) { BattleSounds.tick(this); if (!frameCurrent(this, ui, data, epoch, stage)) return; }
    if (this._unitVoices) { require("UnitVoices").tick(this); if (!frameCurrent(this, ui, data, epoch, stage)) return; }
    var l;
    if (this._rallyMarkerRemaining > 0) {
      var markerDelta = cc.director && cc.director.getDeltaTime ? Math.min(.1, cc.director.getDeltaTime()) : t;
      this._rallyMarkerRemaining = Math.max(0, this._rallyMarkerRemaining - markerDelta);
      this.ndAggFlag.opacity = Math.round(255 * Math.min(1, this._rallyMarkerRemaining / .6));
      if (this._rallyMarkerRemaining < .000001) { this._rallyMarkerRemaining = 0; this.ndAggFlag.active = false; }
    }
    Navigation.beginFrame(this);
    if (this._projectileLooks) { this._projectileLooks.update(t); if (!frameCurrent(this, ui, data, epoch, stage)) return; }
    if (this.gameData && this.gameData._relicSavePending) {
      if (require("RelicRuntime").retry(this.gameData, t) && this.gameData._relicRoundCommitPending) this.gameData.tryEndGame();
      if (!frameCurrent(this, ui, data, epoch, stage)) return;
    }
    if (data && data._advisorFinalClaimPending && stage === $z1KinghtFallModle.KinghtFallGameStage.Fight) {
      data._advisorFinalClaimRetry -= t;
      if (data._advisorFinalClaimRetry <= 0) data.tryEndGame();
      if (!frameCurrent(this, ui, data, epoch, stage)) return;
    }
    if (this.gameStatus === $z1KinghtFallModle.KinghtFallGameStage.Fight && this.gameData) {
      this.gameData._relicCombatTime = (this.gameData._relicCombatTime || 0) + t;
      this.ctrPlay._relicMoving = !this.ctrPlay.isDead() && !!(this.moveDir && (this.moveDir.x || this.moveDir.y));
      require("RelicCombat").updateHero(this.ctrPlay, t);
      require("RelicBattle").updateHeroAura(this.gameData, this.ctrPlay, t, this.ctrPlay._relicMoving);
      if (!frameCurrent(this, ui, data, epoch, stage)) return;
    }
    if (GameToolsOverrides.tick(t, this.gameStatus === $z1KinghtFallModle.KinghtFallGameStage.Fight) && !frameCurrent(this, ui, data, epoch, stage)) return;
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
          if (!frameCurrent(this, ui, data, epoch, stage)) return;
        }
        this.onCommerce(t);
        if (!frameCurrent(this, ui, data, epoch, stage)) return;
        break;
      case $z1KinghtFallModle.KinghtFallGameStage.Fight:
        this.gameData.onUpdata(t);
        if (!frameCurrent(this, ui, data, epoch, stage)) return;
        this.ctrPlay.onUpdata(t);
        updateProjectiles(this.ndPlayArr2, t, this, ui, data, epoch, stage);
        updateProjectiles(this.ndEnemyArr, t, this, ui, data, epoch, stage);
        updateProjectiles(this.ndSoldArr, t, this, ui, data, epoch, stage);
        updateProjectiles(this.ndBuildArr2, t, this, ui, data, epoch, stage);
    }
    if (!frameCurrent(this, ui, data, epoch, stage)) return;
    this.ctrPlay.doMove(this.moveDir, t, stage === $z1KinghtFallModle.KinghtFallGameStage.Fight ? this : null);
    if (!frameCurrent(this, ui, data, epoch, stage)) return;
    // Skill geometry and world effects share the hero's final movement position
    // for this simulation step. Advancing them in the actor's stat update made
    // moving thrusts sample the previous position while the horse rendered ahead.
    if (this.gameStatus === $z1KinghtFallModle.KinghtFallGameStage.Fight && this.ctrPlay._styleRuntime) {
      this.ctrPlay._styleRuntime.update(t);
      if (!frameCurrent(this, ui, data, epoch, stage)) return;
    }
    this.collectFollowers();
    if (!frameCurrent(this, ui, data, epoch, stage)) return;
    var o = this.gameData.getBulidList();
    for (n = 0; n < o.length; n++) {
      (l = o[n]).onUpdate(t);
      if (!frameCurrent(this, ui, data, epoch, stage)) return;
    }
    var r = this.gameData.getSoldierList();
    var s = 0;
    for (var remaining = r.length; remaining > 0 && s < r.length; remaining--) {
      l = r[s];
      if (l) l.onUpdate(t);
      if (!frameCurrent(this, ui, data, epoch, stage)) return;
      if (r[s] === l) s++;
    }
    if (this._unitTest) this._unitTest.update(t);
  };
  _ctor.prototype.onCommerce = function (t) {
    var e = this;
    this.ctrPlay.node.getPosition(this.vec2_1);
    if (this.gameData.appearBusinessPoints && this.gameData.appearBusinessPoints.getInClick(this.vec2_1, t)) {
      var silverOfferPoint = this.gameData.appearBusinessPoints, silverOfferNode = silverOfferPoint.node, silverOfferGeneration = silverOfferNode._combatGeneration;
      var silverOfferWave = this.gameData.round;
      var silverOffer = GameplayAdOwner.begin(this, this, function () {
        return e.gameData.round === silverOfferWave && e.gameData.appearBusinessPoints === silverOfferPoint && cc.isValid(silverOfferPoint, true) && silverOfferPoint.node === silverOfferNode && cc.isValid(silverOfferNode, true) && silverOfferNode._combatGeneration === silverOfferGeneration;
      });
      if (!silverOffer) return;
      var n = function (t) {
        silverOffer.finish(function (current) {
          if (t) {
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.map_coin);
            if (!current()) return;
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_map_coin_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
            if (!current()) return;
            e.gameData.appearBusinessPoints.node.active = false;
            e.gameData.coin += e.gameData.appearBusinessPoints.coinNum;
            e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.SilverClaimedWave] = silverOfferWave;
            e.saveGame();
            if (!current()) return;
            $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, $z1Utils.Utils.StringFormat(e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameCom01), e.gameData.appearBusinessPoints.coinNum));
            if (!current()) return;
            $z1KinghtFallUIGame.default.instance.initView();
            if (!current()) return;
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
              if (!current()) return;
              s();
            }
            e.gameData.appearBusinessPoints = null;
          } else {
            e.gameData.appearBusinessPoints.init(1);
          }

        });
      };
      if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopOpen()) {
        silverOffer.openDialog($z1KinghtFallConfig.KinghtFallUIID.UIVideoTips, $z1Config.UIID.UINONE, 7, function (t) {
          n(t);
        });
      } else {
        $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
          n(true);
        }, function () {
          n(false);
        }, "battle.map.silver");
      }
      return;
    }
    if (!this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagWeapon] && this.gameData.weaponBusinessPoints && this.gameData.weaponBusinessPoints.getInClick(this.vec2_1, t)) {
      var weaponOfferPoint = this.gameData.weaponBusinessPoints, weaponOfferNode = weaponOfferPoint.node, weaponOfferGeneration = weaponOfferNode._combatGeneration;
      var weaponOffer = GameplayAdOwner.begin(this, this, function () {
        return e.gameData.weaponBusinessPoints === weaponOfferPoint && cc.isValid(weaponOfferPoint, true) && weaponOfferPoint.node === weaponOfferNode && cc.isValid(weaponOfferNode, true) && weaponOfferNode._combatGeneration === weaponOfferGeneration;
      });
      if (!weaponOffer) return;
      var i = function (t) {
        weaponOffer.finish(function (current) {
          if (t) {
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.map_weapon);
            if (!current()) return;
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_map_weapon_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
            if (!current()) return;
            e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagWeapon] = 1;
            e.gameData.weaponBusinessPoints.node.active = false;
            e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Attack] = .5;
            e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.AttackSpeed] = .5;
            $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameCom02));
            if (!current()) return;
            e.ctrPlay.ctrPlayAni.setBus(1);
            if (!current()) return;
            e.saveGame();
          } else {
            e.gameData.weaponBusinessPoints.init(1);
          }

        });
      };
      if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopOpen()) {
        weaponOffer.openDialog($z1KinghtFallConfig.KinghtFallUIID.UIVideoTips, $z1Config.UIID.UINONE, 6, function (t) {
          i(t);
        });
      } else {
        $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
          i(true);
        }, function () {
          i(false);
        }, "battle.map.weapon1");
      }
      return;
    }
    if (1 == this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagWeapon] && $z1KinghtFallModle.KinghtFallSwitch.isMapShopSecondOpen() && this.gameData.weaponBusinessPoints && this.gameData.weaponBusinessPoints.getInClick(this.vec2_1, t)) {
      var weaponUpgradeOfferPoint = this.gameData.weaponBusinessPoints, weaponUpgradeOfferNode = weaponUpgradeOfferPoint.node, weaponUpgradeOfferGeneration = weaponUpgradeOfferNode._combatGeneration;
      var weaponUpgradeOffer = GameplayAdOwner.begin(this, this, function () {
        return e.gameData.weaponBusinessPoints === weaponUpgradeOfferPoint && cc.isValid(weaponUpgradeOfferPoint, true) && weaponUpgradeOfferPoint.node === weaponUpgradeOfferNode && cc.isValid(weaponUpgradeOfferNode, true) && weaponUpgradeOfferNode._combatGeneration === weaponUpgradeOfferGeneration;
      });
      if (!weaponUpgradeOffer) return;
      var a = function (t) {
        weaponUpgradeOffer.finish(function (current) {
          if (t) {
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.arrow2);
            if (!current()) return;
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_arrow2_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
            if (!current()) return;
            e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagWeapon] = 2;
            e.gameData.weaponBusinessPoints.node.active = false;
            e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Attack] = 1;
            e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.AttackSpeed] = 1;
            $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameCom02));
            if (!current()) return;
            e.ctrPlay.ctrPlayAni.setBus(3);
            if (!current()) return;
            e.saveGame();
          } else {
            e.gameData.weaponBusinessPoints.init(2);
          }

        });
      };
      if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopOpen()) {
        weaponUpgradeOffer.openDialog($z1KinghtFallConfig.KinghtFallUIID.UIVideoTips, $z1Config.UIID.UINONE, 9, function (t) {
          a(t);
        });
      } else {
        $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
          a(true);
        }, function () {
          a(false);
        }, "battle.map.weapon2");
      }
      return;
    }
    if (!this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagHorse] && this.gameData.horseBusinessPoints && this.gameData.horseBusinessPoints.getInClick(this.vec2_1, t)) {
      var horseOfferPoint = this.gameData.horseBusinessPoints, horseOfferNode = horseOfferPoint.node, horseOfferGeneration = horseOfferNode._combatGeneration;
      var horseOffer = GameplayAdOwner.begin(this, this, function () {
        return e.gameData.horseBusinessPoints === horseOfferPoint && cc.isValid(horseOfferPoint, true) && horseOfferPoint.node === horseOfferNode && cc.isValid(horseOfferNode, true) && horseOfferNode._combatGeneration === horseOfferGeneration;
      });
      if (!horseOffer) return;
      var o = function (t) {
        horseOffer.finish(function (current) {
          if (t) {
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.map_horse);
            if (!current()) return;
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_map_horse_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
            if (!current()) return;
            e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagHorse] = 1;
            e.gameData.horseBusinessPoints.node.active = false;
            e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Speed] = .5;
            $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameCom03));
            if (!current()) return;
            e.ctrPlay.ctrPlayAni.setBus(2);
            if (!current()) return;
            e.saveGame();
          } else {
            e.gameData.horseBusinessPoints.init(1);
          }

        });
      };
      if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopOpen()) {
        horseOffer.openDialog($z1KinghtFallConfig.KinghtFallUIID.UIVideoTips, $z1Config.UIID.UINONE, 5, function (t) {
          o(t);
        });
      } else {
        $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
          o(true);
        }, function () {
          o(false);
        }, "battle.map.horse1");
      }
      return;
    }
    if (1 == this.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagHorse] && $z1KinghtFallModle.KinghtFallSwitch.isMapShopSecondOpen() && this.gameData.horseBusinessPoints && this.gameData.horseBusinessPoints.getInClick(this.vec2_1, t)) {
      var horseUpgradeOfferPoint = this.gameData.horseBusinessPoints, horseUpgradeOfferNode = horseUpgradeOfferPoint.node, horseUpgradeOfferGeneration = horseUpgradeOfferNode._combatGeneration;
      var horseUpgradeOffer = GameplayAdOwner.begin(this, this, function () {
        return e.gameData.horseBusinessPoints === horseUpgradeOfferPoint && cc.isValid(horseUpgradeOfferPoint, true) && horseUpgradeOfferPoint.node === horseUpgradeOfferNode && cc.isValid(horseUpgradeOfferNode, true) && horseUpgradeOfferNode._combatGeneration === horseUpgradeOfferGeneration;
      });
      if (!horseUpgradeOffer) return;
      var r = function (t) {
        horseUpgradeOffer.finish(function (current) {
          if (t) {
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.horse2);
            if (!current()) return;
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_horse2_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
            if (!current()) return;
            e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.FlagHorse] = 2;
            e.gameData.horseBusinessPoints.node.active = false;
            e.gameData.businessAdd[$z1KinghtFallGameCtrlData.KinghtFallCommerceKeyType.Speed] = 1;
            $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameCom03));
            if (!current()) return;
            e.ctrPlay.ctrPlayAni.setBus(4);
            if (!current()) return;
            e.saveGame();
          } else {
            e.gameData.horseBusinessPoints.init(2);
          }

        });
      };
      if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopOpen()) {
        horseUpgradeOffer.openDialog($z1KinghtFallConfig.KinghtFallUIID.UIVideoTips, $z1Config.UIID.UINONE, 8, function (t) {
          r(t);
        });
      } else {
        $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
          r(true);
        }, function () {
          r(false);
        }, "battle.map.horse2");
      }
      return;
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
      this.ndAggFlag.opacity = 255; this._rallyMarkerRemaining = 3;
      this.ndAggFlag.setPosition(this.rallyPoint.pos);
      this.ndAggFlag.zIndex = Math.floor(cc.winSize.height) - Math.floor(this.rallyPoint.pos.y);
      var animation = this.ndAggFlag.getComponent(sp.Skeleton);
      if (animation) {
        animation.setAnimation(0, "click", false);
        animation.addAnimation(0, "idle", true);
      }
    } else {
      if (this.isAgg) this.holdSelectedFollowers(Navigation.positionOf(this.ctrPlay.node, this));
      this.isAgg = !this.isAgg;
      this.rallyPoint = null;
      this.pathList = [];
      this.ndAggFlag.Flag = 0;
      this.ndAggFlag.active = false;
      this._rallyMarkerRemaining = 0;
    }
    this.ctrPlay.ndAgg.active = this.isAgg;
    this.applyArmyOrder();
    this.collectFollowers();
  };
  _ctor.prototype._usesSelectiveFollow = function () {
    return this._separateArmyCommands || $z1KinghtFallConfig.KinghtFallParameter.FollowMode === 2;
  };
  _ctor.prototype.followCommand = function () {
    if (BattleSounds.effect) BattleSounds.effect(this.isAgg ? "order-hold" : "order-follow", null, { game: this });
    if (this.isAgg) this.holdSelectedFollowers(Navigation.positionOf(this.ctrPlay.node, this));
    this.isAgg = !this.isAgg;
    if (this.isAgg) this.gameData.getSoldierList().forEach(function (unit) { unit._followPickupBlocked = false; });
    this.ctrPlay.ndAgg.active = this.isAgg;
    this.applyArmyOrder();
    this.collectFollowers();
    if (cc.resources && this.isAgg && !this._usesSelectiveFollow()) require("UnitVoices").follow(this, this.gameData.getSoldierList());
  };
  _ctor.prototype.rallyCommand = function () {
    this.rallyPoint = { index: this.pathIndex++, pos: Navigation.positionOf(this.ctrPlay.node, this) };
    this.pathList = [this.rallyPoint];
    this.ndAggFlag.Flag = 1; this.ndAggFlag.active = true;
    this.ndAggFlag.opacity = 255; this._rallyMarkerRemaining = 3;
    this.ndAggFlag.setPosition(this.rallyPoint.pos);
    this.ndAggFlag.zIndex = Math.floor(cc.winSize.height) - Math.floor(this.rallyPoint.pos.y);
    var animation = this.ndAggFlag.getComponent(sp.Skeleton);
    if (animation) { animation.setAnimation(0, "click", false); animation.addAnimation(0, "idle", true); }
    var game = this, responders = [];
    this.gameData.getSoldierList().forEach(function (unit) {
      if (unit.isDead() || unit._isPooled || !unit.node.activeInHierarchy) return;
      if (unit._followSelected && game.isAgg) return;
      unit._followPickupBlocked = false;
      unit.setPersonalRallyPoint(game.rallyPoint.pos, true);
      unit._rallyOrder = game.rallyPoint;
      responders.push(unit);
    });
    this.applyArmyOrder();
    if (this.gameData.levelCfg) this.saveGame();
    if (cc.resources) require("UnitVoices").rally(this, responders);
  };
  _ctor.prototype.collectFollowers = function () {
    if (!this._usesSelectiveFollow() || !this.isAgg || this.ctrPlay.isDead()) return;
    var units = this.gameData.getSoldierList(), added = [];
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
      added.push(unit);
    }
    if (added.length) {
      this._armyFormation = null;
      if (cc.resources) require("UnitVoices").follow(this, added);
    }
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
    if (BattleSounds.effect) BattleSounds.effect("unit-select", unit);
    unit._followSelected = true;
    unit._followPickupBlocked = false;
    unit._rallyOrder = null;
    unit.rallyPoint = null; unit.pathList = null; unit._orderTarget = null; unit._targetRefresh = 0;
    unit.applyArmyOrder(this);
    this._armyFormation = null;
    this._followFormation = this._rallyFormation = null;
    this._armyFormationJob = this._followFormationJob = this._rallyFormationJob = null;
    if (cc.resources) require("UnitVoices").follow(this, [unit]);
    return true;
  };
  _ctor.prototype.holdSelectedFollowers = function (destination) {
    var changed = false, game = this;
    this.gameData.getSoldierList().forEach(function (unit) {
      if (!unit._followSelected) return;
      unit._followSelected = false;
      if (!unit.isDead() && !unit._isPooled && unit.node.activeInHierarchy) {
        unit.setPersonalRallyPoint(destination || Navigation.positionOf(unit.node, game), true);
        changed = true;
      }
      unit.applyArmyOrder(game);
    });
    this._armyFormation = null;
    this._followFormation = this._rallyFormation = null;
    this._armyFormationJob = this._followFormationJob = this._rallyFormationJob = null;
    if (changed && BattleSounds.effect) BattleSounds.effect("order-hold", null, { game: this });
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
    this._armyFormationJob = this._followFormationJob = this._rallyFormationJob = null;
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
    var jobKey=cache+'Job',job=this[jobKey];
    if (job && (job.revision!==navigation.revision || job.order!==this.rallyPoint || job.following!==this.isAgg || job.members.length!==soldiers.length || job.members.some(function(member,i){return member!==soldiers[i] || member.node!==job.nodes[i] || member.node._combatGeneration!==job.generations[i];}))) job=this[jobKey]=null;
    // Share each group's layout across its callers and yield after roughly two
    // milliseconds per managed frame. A moving hero cannot restart unfinished
    // work; geometry, orders, roster changes and pooled reuse invalidate it.
    function advance(owner,work){
      if(work.frame!==navigation._frameId){work.frame=navigation._frameId;var started=Date.now(),step;
        do{step=work.iterator.next();}while(!step.done&&(!navigation._frameManaged||Date.now()-started<2));
        if(step.done){owner[jobKey]=null;return true;}
      }
      return false;
    }
    if(job){if(advance(this,job))return this[cache].slots.get(unit)||{pending:true};return previous&&previous.revision===navigation.revision&&previous.order===this.rallyPoint&&previous.following===this.isAgg?previous.slots.get(unit)||{pending:true}:{pending:true};}
    if (previous && previous.frame === navigation._frameId) return previous.slots.get(unit) || { pending: true };
    var moved = !previous || cc.Vec2.distance(previous.anchor, anchor) > 20 || !navigation.grid.segmentClear(previous.anchor, anchor, 0);
    var changed = !previous || previous.order !== this.rallyPoint || previous.following !== this.isAgg || moved || previous.revision !== navigation.revision || previous.members.length !== soldiers.length;
    if (!changed) for (var i = 0; i < soldiers.length; i++) if (previous.members[i] !== soldiers[i] || previous.nodes[i] !== soldiers[i].node || previous.generations[i] !== soldiers[i].node._combatGeneration) { changed = true; break; }
    if (!changed) {
      previous.frame = navigation._frameId;
      return previous.slots.get(unit) || { pending: true };
    }
    // A point inside a wall/open leaf retains normal projected-goal handling.
    // Formation points must be on the command's side of every intact gate.
    if (!navigation.grid.isWalkable(anchor, 0)) return null;
    var order=this.rallyPoint,following=this.isAgg;
    var iterator=(function*(){
    var center = !moved && previous ? previous.anchor : { x: anchor.x, y: anchor.y };
    var heroRadius = navigation.radius(this.ctrPlay), radius = 8, radii = new Map();
    for(var radiusIndex=0;radiusIndex<soldiers.length;radiusIndex++){
      yield;var soldier=soldiers[radiusIndex],r = soldier.isDead() ? soldier._armyBodyRadius || 20 : navigation.radius(soldier);
      soldier._armyBodyRadius = r;
      radii.set(soldier, r);
      radius = Math.max(radius, r);
    }
    // Add modest space between ranks. Tight terrain can use body-clear
    // fallback cells while retaining the same front/rear/flank preferences.
    var spacing = radius * 2 + 6, candidates = [], reserved = [], slots = new Map();
    var forward = previous && previous.forward || { x: 0, y: 1 }, headingAnchor = previous && previous.headingAnchor || center;
    var travel = previous ? { x: center.x - headingAnchor.x, y: center.y - headingAnchor.y } : null;
    if (!previous || previous.order !== this.rallyPoint) {
      var average = soldiers.reduce(function (sum, soldier) { var p = Navigation.positionOf(soldier.node, navigation.game); sum.x += p.x / soldiers.length; sum.y += p.y / soldiers.length; return sum; }, { x: 0, y: 0 });
      travel = { x: center.x - average.x, y: center.y - average.y };
    }
    if (travel && Math.hypot(travel.x, travel.y) >= spacing) {
      var length = Math.hypot(travel.x, travel.y);
      forward = { x: travel.x / length, y: travel.y / length }; headingAnchor = center;
    }
    var layout = armyLayout(soldiers, spacing, center, forward, heroRadius, radius);
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
    // Use the full rank spacing when the whole planned formation fits. A
    // constrained area keeps the denser fallback lattice so no member is
    // stranded merely because the decorative spacing cannot fit the terrain.
    var preferExact=true;
    for(var soldierIndex=0;soldierIndex<soldiers.length;soldierIndex++){
      yield;var soldier=soldiers[soldierIndex],desired=layout.preferred.get(soldier);
      if(!(cc.Vec2.distance(desired,center)<=limit&&valid(desired,radii.get(soldier)))){preferExact=false;break;}
    }
    if (previous) for(var soldierIndex=0;soldierIndex<soldiers.length;soldierIndex++){
      yield;var soldier=soldiers[soldierIndex];
      var old = previous.slots.get(soldier);
      if (!old || !old.pos) continue;
      var dx = old.pos.x - previous.anchor.x, dy = old.pos.y - previous.anchor.y, oldForward = previous.forward || forward;
      var side = dx * oldForward.y - dy * oldForward.x, along = dx * oldForward.x + dy * oldForward.y;
      var point = { x: center.x + forward.y * side + forward.x * along, y: center.y - forward.x * side + forward.y * along };
      if (cc.Vec2.distance(point, center) <= limit && rolePosition(layout, soldier, point, center) && valid(point, radii.get(soldier))) reserve(soldier, point);
    }
    var candidatesBuilt=false;
    var assignment=layout.groups.front.concat(layout.groups.rear,layout.groups.flank);
    for(var soldierIndex=0;soldierIndex<assignment.length;soldierIndex++){
      var soldier=assignment[soldierIndex];if(slots.has(soldier))continue;
      // Terrain and gate-side checks are shared at the largest body radius.
      // Evaluate only candidates reached by this layout, at most once each;
      // reservations alone change while assigning the remaining bodies.
      var desired = layout.preferred.get(soldier), best = null, bestScore = Infinity;
      if (preferExact && valid(desired, radii.get(soldier))) { reserve(soldier, desired); yield;continue; }
    // A hexagonal lattice packs the actual body clearance into narrow outdoor
    // approaches without letting the larger hero inflate every soldier slot.
    if (!candidatesBuilt) {
      candidatesBuilt=true;
      // Keep body-clear fallback cells available in tight terrain; preferred
      // role positions use the wider spacing above in open ground.
      var lattice = radius * 2 - 2, rowHeight = lattice * Math.sqrt(3) / 2, rows = Math.ceil(limit / rowHeight), columns = Math.ceil(limit / lattice);
      for (var row = -rows; row <= rows; row++) for (var column = -columns; column <= columns; column++) {
        yield;var candidate = { x: center.x + (column + (row % 2) / 2) * lattice, y: center.y + row * rowHeight };
        var distance = cc.Vec2.distance(candidate, center);
        if (distance <= limit) candidates.push({ pos: candidate, distance: distance });
      }
      candidates.sort(function (a, b) { return a.distance - b.distance || a.pos.y - b.pos.y || a.pos.x - b.pos.x; });
    }
      for (var j = 0; j < candidates.length; j++) {
        yield;var candidate = candidates[j];
        if (candidate.clear === false) continue;
        var dx = candidate.pos.x - desired.x, dy = candidate.pos.y - desired.y;
        var score = dx * dx + dy * dy + (rolePosition(layout, soldier, candidate.pos, center) ? 0 : limit * limit * 4);
        if (score >= bestScore) continue;
        // Most lattice cells cannot improve this unit's current best slot.
        // Reject those before walking every reserved body, keeping the same
        // scores, tie order and final collision-safe destinations.
        if (!available(candidate.pos, radii.get(soldier))) continue;
        if (candidate.clear === undefined) candidate.clear = clearGateApproach(candidate.pos, radius) && navigation.grid.isWalkable(candidate.pos, radius) && navigation.grid.segmentClear(center, candidate.pos, 0);
        if (!candidate.clear) continue;
        best = candidate; bestScore = score;
      }
      if (best) reserve(soldier, best.pos);
      if (!slots.has(soldier)) slots.set(soldier, { pending: true });
    }
    this[cache] = { frame: navigation._frameId, order: order, following: following, anchor: center,
      revision: navigation.revision, members: soldiers.slice(), nodes: soldiers.map(function(soldier){return soldier.node;}), generations: soldiers.map(function(soldier){return soldier.node._combatGeneration;}), slots: slots, forward: forward, headingAnchor: headingAnchor, layout: layout };
    }).call(this);
    job=this[jobKey]={iterator:iterator,frame:-1,revision:navigation.revision,order:order,following:following,members:soldiers.slice(),nodes:soldiers.map(function(soldier){return soldier.node;}),generations:soldiers.map(function(soldier){return soldier.node._combatGeneration;})};
    if(advance(this,job))return this[cache].slots.get(unit)||{pending:true};
    return previous&&previous.revision===navigation.revision&&previous.order===this.rallyPoint&&previous.following===this.isAgg?previous.slots.get(unit)||{pending:true}:{pending:true};
  };
  _ctor.prototype.settleArmyCrowd = function (unit, position) {
    var formation = this._separateArmyCommands ? (unit.isAgg ? this._followFormation : this._rallyFormation) : this._armyFormation;
    if (!formation || !formation.slots.has(unit)) return false;
    if (formation.layout && !rolePosition(formation.layout, unit, position, formation.anchor)) return false;
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
    this._armyFormationJob = this._followFormationJob = this._rallyFormationJob = null;
    if (savePosts !== false && this._usesSelectiveFollow()) this.holdSelectedFollowers();
    this.isAgg = false;
    this.rallyPoint = null;
    this.pathList = [];
    this.ndAggFlag.Flag = 0;
    this.ndAggFlag.active = false;
    this._rallyMarkerRemaining = 0;
    this.ctrPlay.ndAgg.active = false;
    this.gameData.getSoldierList().forEach(function (unit) { unit._followSelected = false; unit._rallyOrder = null; });
    this.applyArmyOrder();
  };
  _ctor.prototype.addPathNode = function () {
    // Compatibility for callers issuing a fresh rally: followers read the
    // live hero position and never accumulate or replay movement history.
    this.pathList = [{ index: this.pathIndex++, pos: Navigation.positionOf(this.ctrPlay.node, this) }];
  };
  _ctor.prototype.setAudioPaused = function (paused) {
    // UI pauses precede the scheduled physics step. Repeating that step must
    // preserve new construction feedback requested while already paused.
    if (this._audioPaused === paused) return;
    this._audioPaused = paused;
    if (paused) {
      this._audioPauseEpoch = (this._audioPauseEpoch || 0) + 1;
      require("AudioMgr").AudioMgr.getInstance().stopOwnedEffects(this);
    }
    if (BattleSounds.suspend) BattleSounds.suspend(this, paused);
    if (this._unitVoices && require("UnitVoices").suspend) require("UnitVoices").suspend(this, paused);
  };
  _ctor.prototype.onPauseGame = function () {
    this.setAudioPaused(true);
    if (this._unitTest) this._unitTest.setPause(true);
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
    this.setAudioPaused(false);
    if (this._unitTest) this._unitTest.setPause(false);
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
    // Wave cleanup retires transient combat channels; the planning phase and
    // next wave need a fresh session tied to the new combat epoch.
    if (BattleSounds.start) BattleSounds.start(this);
  };
  _ctor.prototype.cleanMap = function () {
    GameplayAdOwner.retire(this);
    if (this._unitTest) this._unitTest.dispose();
    require("AudioMgr").AudioMgr.getInstance().stopOwnedEffects(this);
    if (this._battleSounds && BattleSounds.dispose) BattleSounds.dispose(this);
    if (this._unitVoices) require("UnitVoices").dispose(this);
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
  _ctor.prototype.transformEnemy = function (enemy) {
    var config = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data;
    var skill = enemy.cfg.TransformSkill;
    if (!enemy.bornInfo || !skill || require("EnemyTransform").issue(enemy.cfg, skill, config.SoldierCfg, config.GameTools)) return;
    this.addEnemy(skill.unitId, enemy.bornInfo.bornIndex, null, null, enemy);
  };
  _ctor.prototype.addEnemy = function (t, e, authoredRoute, preview, transformSource) {
    var announceSound = !!this._battleSounds;
    var n = this;
    var epoch = this._combatEpoch, data = this.gameData, main = this.ndMain, ui = $z1KinghtFallUIGame.default.instance;
    var sourceNode = transformSource && transformSource.node, sourceGeneration = sourceNode && sourceNode._combatGeneration;
    function sourceCurrent() {
      return !transformSource || n.gameStatus === $z1KinghtFallModle.KinghtFallGameStage.Fight &&
        cc.isValid(transformSource, true) && !transformSource._isPooled && transformSource.bornInfo &&
        transformSource.node === sourceNode && cc.isValid(sourceNode, true) && sourceNode._combatGeneration === sourceGeneration &&
        sourceNode.activeInHierarchy !== false && !transformSource.isDead() && transformSource.hp > 0;
    }
    if (!sourceCurrent()) return;
    if (-1 != t) {
      var i = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById(t);
      var a = $z1KinghtFallConfig.KinghtFallPoolName.Enemy + "_" + i.ID;
      var overrides = preview && preview.overrides;
      var movement = overrides && overrides.movement, targeting = overrides && overrides.targeting;
      var overrideMovement = movement === "ground" || movement === "flight";
      var overrideTargeting = targeting === "castle" || targeting === "hero";
      var previewCfg;
      if (overrideMovement || overrideTargeting) {
        previewCfg = Object.assign({}, i);
        if (overrideMovement) previewCfg.BuildingCross = movement === "ground" ? 1 : 0;
        if (overrideTargeting) previewCfg.EnemyTargeting = { mode: targeting };
      }
      var areaCollides = !!(previewCfg || i).BuildingCross;
      var o = function (i) {
        var generation = i._combatGeneration, actor = null;
        function current() { return cc.isValid(n, true) && cc.isValid(n.node, true) && n._combatEpoch === epoch && n.gameData === data && n.ndMain === main && $z1KinghtFallUIGame.default.instance === ui && !ui.isclose && ui.ctrGame === n && cc.isValid(i, true) && i._combatGeneration === generation && (!preview || preview.current()) && sourceCurrent(); }
        function abandon() {
          if (!cc.isValid(i, true) || i._combatGeneration !== generation) return;
          if (preview) { i.active = false; i.destroy(); }
          else if (actor && !actor._isPooled && actor._combatData === data) actor.freeNode();
          else $z1PoolMgr.PoolMgr.getInstance().freeNode(a, i);
        }
        i.setParent(main);
        if (!current()) { abandon(); return; }
        i.active = true;
        if (!current()) { abandon(); return; }
        var spawnNode = sourceNode || n.ndPath.getChildByName("ndEnemy" + e);
        if (!spawnNode) { abandon(); cc.warn('Missing authored spawn ' + e); return; }
        var o = actor = i.getComponent($z1KinghtFallEnemyBase.default);
        var previousRoute = n._authoredRouteOverride;
        var route = authoredRoute || null;
        try {
          i.setPosition(Navigation.positionOf(spawnNode, n));
          if (!current()) { abandon(); return; }
          var spawnArea = !transformSource && require('SpawnArea').prepare(o, n, e, areaCollides);
          if (spawnArea === null) { cc.warn('Spawn circle '+e+' has no walkable position for enemy '+t);abandon();return; }
          n._authoredRouteOverride = route;
          var lease = { generation: generation, previewCfg: previewCfg };
          if (transformSource) {
            lease.bornInfo = Object.assign({}, transformSource.bornInfo);
            lease.routeInterrupted = transformSource._routeInterrupted;
            lease.faceLeft = transformSource._visualLeft;
          }
          var initialized = o.initData(t, e, lease);
          generation = lease.generation;
          if (initialized === false || !current()) { abandon(); return; }
          if (transformSource) Navigation.prepareTerrainExit(o, n);
          else if (!require('SpawnArea').apply(o, n, e, spawnArea)) { abandon(); return; }
          if (!current()) { abandon(); return; }
          if (preview) {
            // Private actors use the same terrain clearance without contacts
            // against the hero, structures, or ordinary combat actors.
            o._unitTestActor = true;
            o._unitTestTargeting = overrideTargeting;
            o._unitTestRadius = areaCollides ? Navigation.get(n).radius(o, true) : 0;
            o.rigidBody.active = false;
            return o;
          }
        } catch (error) {
          if (lease) generation = lease.generation;
          abandon();
          throw error;
        } finally { if (n._combatEpoch === epoch && n.gameData === data && n._authoredRouteOverride === route) n._authoredRouteOverride = previousRoute; }
        if (transformSource && data.getEnemyList().indexOf(transformSource) < 0) { abandon(); return; }
        data.addEnemy(o);
        if (transformSource) {
          // The next form counts as the same living enemy. Retire the old
          // actor through the pool so attacks and effects lose its lease.
          transformSource.freeNode(true);
          if (n._stageAssets && n._stageAssets.options && frameCurrent(n, ui, data, epoch, $z1KinghtFallModle.KinghtFallGameStage.Fight) &&
              cc.isValid(i, true) && i._combatGeneration === generation && !o._isPooled) {
            var visuals = require("EnemySkillVisuals");
            visuals.show(o, n, visuals.fromGame(n, "transform"));
          }
        } else if (BattleSounds.spawnEnemy) BattleSounds.spawnEnemy(o, announceSound);
      };
      if (preview) return preview.current() && o(cc.instantiate(preview.prefab));
      var r = $z1PoolMgr.PoolMgr.getInstance().getNode(a);
      if (r) {
        o(r);
      } else {
        var bundle = $z1KinghtFallConfig.KinghtFallBundelName.Enemy;
        var prepared = transformSource && this._stageAssets && this._stageAssets.assets[bundle + "/" + i.prefab + ":prefab"];
        if (prepared) return o($z1PoolMgr.PoolMgr.getInstance().getNodeFromPrefab(a, prepared, 0));
        var pendingData = this.gameData;
        if (!transformSource) pendingData.pendingEnemySpawns = (pendingData.pendingEnemySpawns || 0) + 1;
        this.loadPrefab(bundle, i.prefab, function (t) {
          if (!cc.isValid(n, true) || !cc.isValid(n.node, true) || n._combatEpoch !== epoch || !sourceCurrent()) return;
          try {
            // Grow on demand; warming unused rigs stalls the first live spawn.
            r = $z1PoolMgr.PoolMgr.getInstance().getNodeFromPrefab(a, t, 0);
            o(r);
          } finally { if (!transformSource) pendingData.pendingEnemySpawns--; }
        });
      }
    }
  };
  _ctor.prototype.addSoldier = function (t, e) {
    var n = this;
    var epoch = this._combatEpoch, data = this.gameData, main = this.ndMain, ui = $z1KinghtFallUIGame.default.instance;
    var i = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById(t, "ally");
    var a = $z1KinghtFallConfig.KinghtFallPoolName.Soldier + "_" + i.ID;
    var o = function (i) {
      var generation = i._combatGeneration;
      function current() { return cc.isValid(n, true) && cc.isValid(n.node, true) && n._combatEpoch === epoch && n.gameData === data && n.ndMain === main && $z1KinghtFallUIGame.default.instance === ui && !ui.isclose && ui.ctrGame === n && cc.isValid(i, true) && i._combatGeneration === generation; }
      function abandon() { if (cc.isValid(i, true) && i._combatGeneration === generation) $z1PoolMgr.PoolMgr.getInstance().freeNode(a, i); }
      i.setParent(main);
      if (!current()) { abandon(); return; }
      i.active = true;
      if (!current()) { abandon(); return; }
      var actor = i.getComponent($z1KinghtFallSoldierBase.default), lease = { generation: generation };
      var initialized = actor.initData(t, lease);
      // The initializer records only its own claim, even if cleanup reenters initData.
      generation = lease.generation;
      if (initialized === false || !current()) {
        if (cc.isValid(i, true) && i._combatGeneration === generation && !actor._isPooled && actor._combatData === data) actor.freeNode();
        else abandon();
        return;
      }
      data.addSoldier(actor);
      e(actor);
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
    if (s.length) (e = n.pathList).push.apply(e, s[$z1Utils.Utils.randomRang(0, s.length)].children);
    return n;
  };
  _ctor.prototype.takeHeroArrow = function (position, speedMultiplier) {
    var n = this.ndPlayArr1.shift();
    n || (n = cc.instantiate(this.ctrPlay.ctrArr.node)).setParent(this.ndUI);
    n.setSiblingIndex(0);
    n.active = true;
    n.setPosition(position);
    var o = n.getComponent($z1KinghtFallBulletPlay.default);
    if (o._heroBaseSpeed === undefined) o._heroBaseSpeed = o.speed;
    o.speed = GameToolsOverrides.projectileSpeed(this.ctrPlay, 'hero', o._heroBaseSpeed) * speedMultiplier;
    o.setSkin(this.ctrPlay.ctrPlayAni.arrName);
    this.ndPlayArr2.push(o);
    o.combatContext = this;
    ProjectileLooks.prepare(o, this, "hero");
    return o;
  };
  _ctor.prototype.launchVolleyArrow = function (origin, direction) {
    var at = this.ndUI.convertToNodeSpaceAR(this.ndMain.convertToWorldSpaceAR(cc.v2(origin.x, origin.y)));
    var ahead = this.ndUI.convertToNodeSpaceAR(this.ndMain.convertToWorldSpaceAR(cc.v2(origin.x + direction.x, origin.y + direction.y)));
    var arrow = this.takeHeroArrow(at, 1);
    arrow.beginStraightFlight(Math.atan2(ahead.y - at.y, ahead.x - at.x) * 180 / Math.PI);
    return arrow;
  };
  _ctor.prototype.onPlayAttack = function (t, release) {
    var hero = this.ctrPlay;
    if (!FlightTargeting.heroCanTarget(hero, t)) return;
    if (require("HeroWeaponCombat").melee(this, t, release)) return;
    var a = this.ndUI.convertToNodeSpaceAR(this.ctrPlay.getAttWpos());
    var o = this.takeHeroArrow(a, this.ctrPlay._styleProjectileSpeed || 1), n = o.node;
    var r = this.ctrPlay.getAttack(t);
    var s = this.ctrPlay.crit > Math.random();
    var context = require("RelicCombat").primaryContext(hero, t, r, s, release);
    // The hero starts drawing again while this arrow flies. Its impact sound
    // belongs to the released shot, never to the hero's later live charge.
    context.heroStyle = hero.heroStyle;
    context.styleShotCharge = hero._styleShotCharge || 0;
    s && (r *= this.ctrPlay.getCriticalDamage ? this.ctrPlay.getCriticalDamage() : this.ctrPlay.critDam);
    o.setTag(a, t.node, function () {
      if (cc.isValid(t) && cc.isValid(t.node) && FlightTargeting.heroCanTarget(hero, t) &&
          require("RelicCombat").primaryCurrent(context, t, hero) && !context.used) {
        var impactPosition = t.node.getPosition();
        n.active = false;
        $z1KinghtFallUIGame.default.instance.ctrEffect.onMonsterAttack(impactPosition, "jian_" + hero.ctrPlayAni.arrName);
        if (!require("RelicCombat").primaryCurrent(context, t, hero) || context.used) return;
        var soundDamage = t.onAttacked(r, hero, false, context);
        if (!require("RelicCombat").primaryCurrent(context, t, hero) || t._isPooled) return;
        if (soundDamage > 0) $z1KinghtFallUIGame.default.instance.ctrEffect.showDamageNum(impactPosition, soundDamage, s);
      }
    });
  };
  _ctor.prototype.freeBullet = function (t) {
    var e = this.ndPlayArr2.indexOf(t);
    if (e < 0) return;
    this.ndPlayArr2.splice(e, 1);
    if (!cc.isValid(t.node, true)) return;
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
    if(a._enemyBaseSpeed===undefined)a._enemyBaseSpeed=a.speed;
    a.speed=GameToolsOverrides.projectileSpeed(t,'enemy',a._enemyBaseSpeed);
    ProjectileLooks.prepare(a, this, "enemy:" + t.cfg.ID, t);
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
  _ctor.prototype.takeBuildProjectile = function (position) {
    var node = this.ndBuildArr1.shift();
    if (!node) (node = cc.instantiate(this.buildBullet.node)).setParent(this.ndUI);
    node.setSiblingIndex(0);
    node.active = true;
    node.setPosition(position);
    var shot = node.getComponent($z1KinghtFallBulletBuild.default);
    shot.combatContext = this;
    if (shot._towerBaseSpeed === undefined) shot._towerBaseSpeed = shot.speed;
    this.ndBuildArr2.push(shot);
    return shot;
  };
  _ctor.prototype.onShotUnit = function (owner, side) {
    if (owner.ctrArr && owner.ctrArr.node && owner.getBullet && owner.getAttWpos) {
      var nativeShot = side === "enemy" ? this.onShotEnemy(owner) : this.onShotSoldier(owner);
      nativeShot.ctr.setParent(owner);
      return nativeShot.ctr;
    }
    if (!this.buildBullet && !this.ndBuildArr1.length) return null;
    var origin = this.ndUI.convertToNodeSpaceAR(owner.node.convertToWorldSpaceAR(cc.v2(0, 20)));
    var shot = this.takeBuildProjectile(origin);
    shot.speed = GameToolsOverrides.projectileSpeed(owner, side, 500);
    ProjectileLooks.prepare(shot, this, side + ":" + owner.cfg.ID, owner);
    return shot;
  };
  _ctor.prototype.onShotBuild = function (t, e, released) {
    var game = this;
    var towerCombat = require("TowerCombat");
    var behavior = t.getTowerSettings ? t.getTowerSettings() : null;
    var shotData = this.gameData, shotEpoch = this._combatEpoch, shotStage = this.gameStatus;
    var targetNode = e && e.node, targetGeneration = targetNode && targetNode._combatGeneration;
    function releaseCurrent() {
      return game.gameData === shotData && game._combatEpoch === shotEpoch && game.gameStatus === shotStage &&
        !t.isDestroyed && towerCombat.live(e) && towerCombat.canTarget(e, behavior) &&
        e.node === targetNode && targetNode._combatGeneration === targetGeneration;
    }
    if (!releaseCurrent()) return;
    var towerKey=t.buildInfo&&t.buildInfo.cfg&&t.buildInfo.cfg.ID&&t.buildInfo.cfg.index?'tower:'+t.buildInfo.cfg.ID+':'+t.buildInfo.cfg.index:'tower';
    if (!released && ProjectileLooks.launchDelay(towerKey) > 0) {
      return ProjectileLooks.queueLaunch(this, towerKey, t, function () {
        _ctor.prototype.onShotBuild.call(game, t, e, true);
      }, function () {
        return game.gameStatus === $z1KinghtFallModle.KinghtFallGameStage.Fight && releaseCurrent();
      });
    }
    var appearance = t.buildInfo && t.buildInfo.cfg && t.buildInfo.cfg.Appearance;
    var layered = appearance && appearance.weapon && appearance.weapon.sprite;
    if (layered) {
      var artwork = require("BuildingAppearance");
      if (artwork.ready && !artwork.ready(t)) return;
    }
    if (BattleSounds.attack) BattleSounds.attack(t, "tower", behavior);
    if (!releaseCurrent()) return;
    if (layered && !behavior) behavior = towerCombat.settings({ Tower: {} });
    var hasMuzzle = behavior && (behavior.attackType !== "arrow" || layered);
    var modern = behavior && (hasMuzzle || behavior.fieldProjectile || behavior.shotsPerVolley);
    if (layered && released && behavior.pierceTargets && artwork.aim) artwork.aim(t, e);
    var i = hasMuzzle && !behavior.fieldProjectile ? require("BuildingAppearance").muzzle(t, this) : t.getAttPos();
    var o = t.getAttack();
    if (!releaseCurrent()) return;
    var a = this.takeBuildProjectile(i), n = a.node;
    a.speed = behavior && behavior.projectileSpeed || a._towerBaseSpeed;
    if (modern) {
      var effects = $z1KinghtFallUIGame.default.instance.ctrEffect;
      ProjectileLooks.prepare(a, this, behavior.projectileLook || towerKey);
      function feedback(actor, position, damage) {
        if (effects && cc.isValid(effects, true)) {
          effects.showDamageNum(position, GameToolsOverrides.damageTaken(actor, "enemy", damage));
          if (behavior.attackType !== "cannon") effects.onMonsterAttack(position, "jian_lv1");
        }
      }
      if (behavior.pierceTargets) {
        var end = towerCombat.sniperEnd(t, e.node, i, this.ndUI);
        a.setSniperFlight(i, end, behavior, function (entry, current) {
          if (!towerCombat.hit(entry, o, t, feedback, current)) return false;
          if (current()) require("RelicBattle").towerImpact(shotData, t, entry.actor, entry.position, game.ndUI);
          return true;
        });
        return;
      }
      a.setTowerTag(i, e.node, function () {
        if (game.gameData !== shotData || game._combatEpoch !== shotEpoch) return;
        var center = behavior.attackType === "cannon" ? a._towerImpactPoint : towerCombat.point(e.node, game.ndUI);
        if (behavior.attackType === "cannon" && BattleSounds.effect) BattleSounds.effect("cannon-impact-explosion", null, { game: game, point: center });
        towerCombat.damage(game, e, center, o, behavior, feedback, t);
        if (game.gameData === shotData && game._combatEpoch === shotEpoch) require("RelicBattle").towerImpact(shotData, t, e, center, game.ndUI);
      }, behavior);
      return;
    }
    ProjectileLooks.prepare(a, this, behavior && behavior.projectileLook || towerKey);
    a.setTag(i, e.node, function () {
      if (game.gameData !== shotData || game._combatEpoch !== shotEpoch) return;
      if (cc.isValid(e) && cc.isValid(e.node)) {
        $z1KinghtFallUIGame.default.instance.ctrEffect.showDamageNum(e.node.getPosition(), GameToolsOverrides.damageTaken(e, "enemy", o));
        $z1KinghtFallUIGame.default.instance.ctrEffect.onMonsterAttack(e.node.getPosition(), "jian_lv1");
        n.active = false;
        e.onAttacked(o, t);
        if (game.gameData === shotData && game._combatEpoch === shotEpoch) require("RelicBattle").towerImpact(shotData, t, e, null, game.ndUI);
      }
    });
  };
  _ctor.prototype.freeBuildBullet = function (t) {
    var e = this.ndBuildArr2.indexOf(t);
    if (e < 0) return;
    this.ndBuildArr2.splice(e, 1);
    if (!cc.isValid(t.node, true)) return;
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
    if(a._allyBaseSpeed===undefined)a._allyBaseSpeed=a.speed;
    a.speed=GameToolsOverrides.projectileSpeed(t,'ally',a._allyBaseSpeed);
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
    if (this._unitTest) this._unitTest.actors.forEach(function (actor) { if (cc.isValid(actor, true)) actor.onChangeSpeed(); });
  };
  _ctor.prototype.loadGame = function () {
    var t = this;
    var record = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData(), stage = this.gameData.levelCfg.Level;
    if (record.hasSave(stage)) {
      var issue = record.getResumeIssue && record.getResumeIssue(stage, $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data);
      if (issue) throw new Error(issue);
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
      if (s) this.gameData.taskInfo = this.gameData.createTaskInfo(s);
      return true;
    }
    return false;
  };
  _ctor.prototype.captureWaveStart = function () {
    var data = this.gameData;
    if (this._restartRetired || !data || !data.levelCfg || !Number.isInteger(data.round) || data.round < 1 ||
        !Array.isArray(data.levelCfg.WaveCfg) || data.round > data.levelCfg.WaveCfg.length) return false;
    var checkpoint = JSON.parse(JSON.stringify(this.getCheckpoint()));
    // Missing legacy state must clear any relic charges saved later in combat.
    if (checkpoint.relicState === undefined) checkpoint.relicState = null;
    checkpoint.restartSetup = { treasureAddTime: JSON.parse(JSON.stringify(data.treasureAddTime || {})) };
    this._waveStartCheckpoint = { data: data, stage: data.levelCfg.Level, round: data.round, checkpoint: checkpoint };
    return true;
  };
  _ctor.prototype.getRestartCheckpoint = function (mode) {
    var data = this.gameData;
    if (this._restartRetired || !data || !data.levelCfg) return null;
    var stage = data.levelCfg.Level;
    function preservePermanentTaskClaims(checkpoint) {
      var task = data.taskInfo;
      var committed = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().getTaskInfo(stage);
      if (!task || !committed || !Array.isArray(task.list) || !Array.isArray(committed.list) ||
          JSON.stringify(task.list) !== JSON.stringify(committed.list) || !Array.isArray(task.reward)) return checkpoint;
      var claimed = Math.min(task.list.length, task.reward.length, Math.max(task.index, committed.index));
      var floor = 0;
      for (var index = 0; index < claimed; index++) {
        var reward = task.reward[index];
        if (reward && Number.isInteger(reward.id) && reward.id > 0 && reward.id !== $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.SilverCoin &&
            typeof reward.num === "number" && isFinite(reward.num) && reward.num > 0) floor = index + 1;
      }
      if (checkpoint.taskList && floor > checkpoint.taskList.index) {
        // Gold and other permanent rewards remain owned after a retry. Preserve
        // their claimed index so the same paid attempt cannot award them twice.
        checkpoint.taskList = checkpointTasks(task, floor);
      }
      return checkpoint;
    }
    if (mode === "wave") {
      if (!Number.isInteger(data.round) || data.round < 1 || !Array.isArray(data.levelCfg.WaveCfg) || data.round > data.levelCfg.WaveCfg.length) return null;
      var saved = this._waveStartCheckpoint;
      if (!saved || saved.data !== data || saved.stage !== stage || saved.round !== data.round) return null;
      return preservePermanentTaskClaims(JSON.parse(JSON.stringify(saved.checkpoint)));
    }
    if (mode !== "stage") return null;
    // Construct fresh battle data without granting the first wave's permanent
    // silver achievement again. Restarts reuse an already-paid stage entry.
    var latest = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getLevelCfgById(stage);
    var keepTasks = data.taskInfo && (data.taskInfo.authored || latest && Array.isArray(latest.BattleTasks));
    var resetTasks = keepTasks ? checkpointTasks(data.taskInfo, 0) : undefined;
    var fresh = new $z1KinghtFallGameCtrlData.default(this, stage, true, null, resetTasks);
    fresh.coin += fresh.levelCfg.WaveCfg[0].StartSliver;
    var checkpoint = {
      levelNum: stage, roundNum: 1, coin: fresh.coin, buffList: [],
      buildingLevel: data.getBulidList().map(function (building) { return { point: building.ID, level: 0 }; }),
      businessList: {}, taskList: checkpointTasks(fresh.taskInfo),
      relicState: null, restartSetup: { treasureAddTime: fresh.treasureAddTime }
    };
    return preservePermanentTaskClaims(JSON.parse(JSON.stringify(checkpoint)));
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
    var n = checkpointTasks(this.gameData.taskInfo);
    var checkpoint = { levelNum: this.gameData.levelCfg.Level, roundNum: this.gameData.round,
      coin: this.gameData.coin, buffList: t, buildingLevel: e,
      businessList: this.gameData.businessAdd, taskList: n,
      restartSetup: { treasureAddTime: JSON.parse(JSON.stringify(this.gameData.treasureAddTime || {})) } };
    var relicState = require("RelicRuntime").snapshot(this.gameData);
    if (relicState !== undefined) checkpoint.relicState = relicState;
    return checkpoint;
  };
  _ctor.prototype.saveGame = function () {
    if (this._restartRetired) return false;
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
