var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
var cc__spreadArrays = __spreadArrays;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1GAD_App = require("GAD_App");
var $z1BaseCtrl = require("BaseCtrl");
var $z1BasePlatform = require("BasePlatform");
var $z1Appcfg = require("Appcfg");
var $z1PlatformSetting = require("PlatformSetting");
var $z1AudioMgr = require("AudioMgr");
var $z1PlatformManager = require("PlatformManager");
var $z1PoolMgr = require("PoolMgr");
var $z1ResourceMgr = require("ResourceMgr");
var $z1SdkMgr = require("SdkMgr");
var TestMode = require("TestMode").TestMode;
var $z1UIMgr = require("UIMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1TextConfig = require("TextConfig");
var $z1GameTrackData = require("GameTrackData");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallMissionData = require("KinghtFallMissionData");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallItemGood = require("KinghtFallItemGood");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallHomeBattleCtrl = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndLevelInfo = null;
    e.btnLeft = null;
    e.btnRight = null;
    e.ndBoxShow = null;
    e.btnBattle = null;
    e.wallDefenseButtonFrame = null;
    e.ndTaskInfo = null;
    e.ndBtnLeft = null;
    e.btnAchieve = null;
    e.btnPassport = null;
    e.btnOnline = null;
    e.btnSign = null;
    e.btnAddDesktop = null;
    e.btnSideBoard = null;
    e.btnSubEnter = null;
    e.btnSubBg = null;
    e.costEnergy = 5;
    e.isLeftUp = true;
    e.isEnter = false;
    e.haveArrow = false;
    e.subPlayTime = [];
    e.subPlayStage = [];
    e._missionDrawerOpen = false;
    e._missionRewardReady = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    this.cfgList = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getLevelCfgList();
    this.costEnergy = parseInt($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.StaminaCost));
    this.btnBattle.getChildByName("Layout").getChildByName("labNum").getComponent(cc.Label).string = "" + this.costEnergy;
    require("HomeLobbyLayout").install(this);
  };
  _ctor.prototype.onEnable = function () {
    var t = this;
    this.bindBoxRewardDismissal();
    this.newSel();
    this.onUpdateTask();
    if (this._lobby) require("HomeLobbyLayout").layout(this); else this.layoutMissionDrawer(false);
    this.scheduleOnce(function () {
      if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getGuideEnd()) {
        t.sendEvent($z1Appcfg.BaseEventName.RefreshReport, false);
      } else {
        t.sendEvent($z1Appcfg.BaseEventName.RefreshReport, true, t.btnReport.convertToWorldSpaceAR(cc.Vec2.ZERO));
      }
    }, .1);
  };
  _ctor.prototype.start = function () {
    this.initEventListener();
    this.initBtnListener();
    this.initSubView();
    this.showRed();
    $z1KinghtFallModle.default.getInstance().twBreatheRedPoint(this.btnAchieve.getChildByName("ndRed"));
    $z1KinghtFallModle.default.getInstance().twBreatheRedPoint(this.btnPassport.getChildByName("ndRed"));
    $z1KinghtFallModle.default.getInstance().twBreatheRedPoint(this.btnOnline.getChildByName("ndRed"));
    $z1KinghtFallModle.default.getInstance().twBreatheRedPoint(this.btnSign.getChildByName("ndRed"));
    if (this._lobby) $z1KinghtFallModle.default.getInstance().twBreatheRedPoint(this._lobby.quest.getChildByName("ndRed"));
  };
  _ctor.prototype.initEventListener = function () {
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.TimeUpdate, this.showRed);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.UpBattView, this.newSel);
    var home = this;
    this.addEvent("SaveRecovered", function () { if (home.subPlayTime.length) home.refreshSubView(); });
  };
  _ctor.prototype.update = function () {
    var bypassAdLimits = TestMode.getInstance().shouldBypassAdLimits();
    if (this._testAdLimitBypass !== bypassAdLimits && this.subPlayTime.length) {
      this._testAdLimitBypass = bypassAdLimits;
      this.refreshSubView();
    }
  };
  _ctor.prototype.initMissionDrawer = function () {
    if (this._missionHandle || !this.ndTaskInfo || !this.btnBattle) return;
    var panel = this.ndTaskInfo;
    // The drawer handle owns the closed-state badge. The old ready-panel dot
    // otherwise appears over the mission title when the drawer opens.
    var finish = panel.getChildByName("ndFinish");
    var readyDot = finish && finish.getChildByName("wg_ty_hd");
    if (readyDot) readyDot.active = false;
    var widget = panel.getComponent(cc.Widget);
    if (widget) {
      widget.isAlignLeft = widget.isAlignRight = widget.isAlignHorizontalCenter = false;
      widget.updateAlignment();
    }
    this._missionScaleX = panel.scaleX;
    this._missionScaleY = panel.scaleY;
    var handle = this._missionHandle = new cc.Node("MissionDrawerHandle");
    handle.parent = panel;
    handle.setContentSize(56, 88);
    var background = handle.addComponent(cc.Graphics);
    background.fillColor = new cc.Color(239, 227, 204);
    background.strokeColor = cc.Color.BLACK;
    background.lineWidth = 4;
    background.roundRect(-28, -44, 56, 88, 12);
    background.fill();
    background.stroke();
    var arrow = new cc.Node("Arrow");
    arrow.parent = handle;
    this._missionArrow = arrow.addComponent(cc.Graphics);
    var badge = this._missionBadge = new cc.Node("ndRed");
    badge.parent = handle;
    badge.setPosition(23, 39);
    var dot = badge.addComponent(cc.Graphics);
    dot.fillColor = new cc.Color(234, 28, 49);
    dot.strokeColor = new cc.Color(63, 10, 20);
    dot.lineWidth = 4;
    dot.circle(0, 0, 12);
    dot.fill();
    dot.stroke();
    handle.addComponent(cc.Button).transition = cc.Button.Transition.NONE;
    handle.on(cc.Node.EventType.TOUCH_END, this.onMissionDrawerToggle, this);
    this.refreshMissionDrawerBadge();
    this.layoutMissionDrawer(false);
  };
  _ctor.prototype.refreshMissionDrawerBadge = function () {
    if (!this._missionHandle) return;
    this._missionBadge.active = !this._missionDrawerOpen && this._missionRewardReady;
    var arrow = this._missionArrow, direction = this._missionDrawerOpen ? -1 : 1;
    arrow.clear();
    arrow.fillColor = cc.Color.WHITE;
    arrow.strokeColor = cc.Color.BLACK;
    arrow.lineWidth = 4;
    arrow.moveTo(direction * 11, 0);
    arrow.lineTo(-direction * 8, 17);
    arrow.lineTo(-direction * 8, -17);
    arrow.close();
    arrow.fill();
    arrow.stroke();
  };
  _ctor.prototype.onMissionDrawerToggle = function (event) {
    // The handle is inside the reward panel, so keep its tap out of claiming.
    if (event) event.stopPropagation();
    this._missionDrawerOpen = !this._missionDrawerOpen;
    this.refreshMissionDrawerBadge();
    this.layoutMissionDrawer(true);
  };
  _ctor.prototype.stopMissionDrawerTweens = function () {
    if (this._missionDrawerTween) this._missionDrawerTween.stop();
    if (this._missionPlayTween) this._missionPlayTween.stop();
    this._missionDrawerTween = this._missionPlayTween = null;
  };
  _ctor.prototype.layoutMissionDrawer = function (animate) {
    if (!this._missionHandle) return;
    var panel = this.ndTaskInfo, play = this.btnBattle;
    var origin = cc.view.getVisibleOrigin(), visible = cc.view.getVisibleSize();
    var left = this.node.convertToNodeSpaceAR(cc.v2(origin.x, origin.y));
    var right = this.node.convertToNodeSpaceAR(cc.v2(origin.x + visible.width, origin.y));
    var width = Math.abs(right.x - left.x);
    var fit = Math.min(1, width / ((panel.width + 56) * Math.abs(this._missionScaleX)));
    panel.scaleX = this._missionScaleX * fit;
    panel.scaleY = this._missionScaleY * fit;
    this._missionHandle.setPosition(panel.width * (1 - panel.anchorX) + 28, 0);
    var half = panel.width * Math.abs(panel.scaleX) / 2;
    var x = Math.min(left.x, right.x) + (this._missionDrawerOpen ? half : -half);
    var y = panel.y + 124;
    if (this._missionDrawerOpen && panel.active) {
      y = panel.y + panel.height * (1 - panel.anchorY) * Math.abs(panel.scaleY) + 14 + play.height * play.anchorY * Math.abs(play.scaleY);
    }
    var signature = [left.x, right.x, panel.y, panel.width, panel.height, play.height, play.scaleY, panel.active, this._missionDrawerOpen].join(":");
    if (!animate && signature === this._missionDrawerLayout) return;
    this._missionDrawerLayout = signature;
    this.stopMissionDrawerTweens();
    if (animate) {
      this._missionDrawerTween = cc.tween(panel).to(.16, { x: x }, { easing: "quadOut" }).start();
      this._missionPlayTween = cc.tween(play).to(.16, { y: y }, { easing: "quadOut" }).start();
    } else {
      panel.x = x;
      play.y = y;
    }
  };
  _ctor.prototype.lateUpdate = function () {
    if (this._lobby) require("HomeLobbyLayout").layout(this); else this.layoutMissionDrawer(false);
  };
  _ctor.prototype.initBtnListener = function () {
    var t = this;
    var stagePreview = this._lobby && this._lobby.stagePreview || this.ndLevelInfo;
    stagePreview.getChildByName("ndAniClick").on(cc.Node.EventType.TOUCH_END, function () {
      var e = stagePreview.getChildByName("spAni").getComponent(sp.Skeleton);
      if (e.skeletonData && "idle" == e.animation) {
        e.setAnimation(0, "attack", false);
        if (t._stageMonsterId) require("GameToolsOverrides").applyAttackPlayback({ cfg: { ID: t._stageMonsterId }, spAni: e }, "enemy");
        e.addAnimation(0, "idle", true);
      }
    }, this);
    this.btnLeft.on(cc.Node.EventType.TOUCH_END, function () {
      $z1AudioMgr.AudioMgr.getInstance().playEffect($z1KinghtFallConfig.KinghtFallAudioId.Scroll_down);
      t.selectStage--;
      t.initMapView();
      t.initBtnView();
    }, this);
    this.btnRight.on(cc.Node.EventType.TOUCH_END, function () {
      $z1AudioMgr.AudioMgr.getInstance().playEffect($z1KinghtFallConfig.KinghtFallAudioId.Scroll_down);
      t.selectStage++;
      t.initMapView();
      t.initBtnView();
    }, this);
    var e = function (e) {
      n.ndBoxShow.getChildByName("ndTag" + (e + 1)).on(cc.Node.EventType.TOUCH_END, function () {
        t.onBoxClick(e);
      }, n);
    };
    var n = this;
    for (var i = 0; i < 3; i++) {
      e(i);
    }
    this.ndTaskInfo.on(cc.Node.EventType.TOUCH_END, this.onTaskClick, this);
    this.initMorePlay();
    this.ndBtnLeft.getChildByName("btnMove").on(cc.Node.EventType.TOUCH_END, function (e) {
      e.stopPropagation();
      t.isLeftUp = !t.isLeftUp;
      t.initMorePlay();
    }, this);
    this.btnAchieve.on(cc.Node.EventType.TOUCH_END, function () {
      $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIAchievement, $z1Config.UIID.UIHome);
    }, this);
    this.btnPassport.on(cc.Node.EventType.TOUCH_END, function () {
      $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIPassport, $z1Config.UIID.UIHome);
    }, this);
    this.btnOnline.on(cc.Node.EventType.TOUCH_END, function () {
      $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIOnlineReward, $z1Config.UIID.UIHome);
    }, this);
    this.btnSign.on(cc.Node.EventType.TOUCH_END, function () {
      $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UISignIn, $z1Config.UIID.UIHome);
    }, this);
    var a = $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE || $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.KuaiShou || $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.EDITOR;
    this.btnSideBoard.active = a;
    this.btnAddDesktop.active = a;
    this.btnAddDesktop.on(cc.Node.EventType.TOUCH_END, function () {
      t.onClickShortCut();
    }, this);
    this.btnSideBoard.on(cc.Node.EventType.TOUCH_END, function () {
      $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UISideBoard, $z1Config.UIID.UIHome);
    }, this);
    this.btnReport.active = !$z1SdkMgr.SdkMgr.getInstance().getCheckVersion($z1PlatformSetting.SwitchID.ShenHe) && ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WECHAT || $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE || $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.EDITOR || $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.KuaiShou);
    this.btnReport.on(cc.Node.EventType.TOUCH_END, function () {
      $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UIReport, $z1Config.UIID.UIHome);
    });
    if ($z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.VIVO) {
      this.scheduleOnce(function () {
        t.btnBattle.on(cc.Node.EventType.TOUCH_END, t.onStartGame, t);
      }, 1);
    } else {
      this.btnBattle.on(cc.Node.EventType.TOUCH_END, this.onStartGame, this);
    }
  };
  _ctor.prototype.newSel = function () {
    this.selectStage = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getStage();
    this.selectStage > this.cfgList.length && (this.selectStage = this.cfgList.length);
    this.initMapView();
    this.initBtnView();
  };
  _ctor.prototype.initMapView = function () {
    var t = this;
    var selected = this.selectStage;
    var e = this.cfgList[this.selectStage - 1];
    require("LobbyBackground").showForStage(this.node, e.EnvironmentBiome || e.EnvironmentMapId || e.prefab);
    var n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage();
    this.ndLevelInfo.getChildByName("labName").getComponent(cc.Label).string = this.T(e.Name);
    this.ndLevelInfo.getChildByName("labOrder").getComponent(cc.Label).string = $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeBattle01), e.Level < n ? e.WaveCfg.length : $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxOrder(), e.WaveCfg.length);
    if (cc.view) require("StageStarPresentation").showLobby(this, e, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getStageInfo(e.Level), n);
    this.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconMap, e.Map, function (e) {
      if (!cc.isValid(t, true) || t.selectStage !== selected) return;
      (t._lobby && t._lobby.stagePreview || t.ndLevelInfo).getChildByName("sprIcon").getComponent(cc.Sprite).spriteFrame = e;
    });
    this.loadStageMonster(e);
    this.hideBoxReward();
    var i = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getStageInfo(this.selectStage);
    for (var a = 0; a < e.Challenge.length; a++) {
      var o = this.ndBoxShow.getChildByName("ndTag" + (a + 1));
      var r = o.getChildByName("spAni").getComponent(sp.Skeleton);
      if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getStageReward(this.selectStage, a + 1)) {
        "open" != r.animation && r.setAnimation(0, "open_idle", true);
        o.getChildByName("ndRed").active = false;
      } else {
        var s = (i & 1 << e.Challenge[a] - 1) > 0;
        o.getChildByName("ndRed").active = false;
        if (s) {
          r.setAnimation(0, "idle", true);
        } else {
          r.setAnimation(0, "static", true);
        }
      }
      var l = undefined;
      switch (e.Challenge[a]) {
        case $z1KinghtFallEnum.KinghtFallEnumLevelChalType.Pass:
          l = $z1KinghtFallTextConfig.KinghtFallTextConfig.HomeBattle05;
          break;
        case $z1KinghtFallEnum.KinghtFallEnumLevelChalType.NoDie:
          l = $z1KinghtFallTextConfig.KinghtFallTextConfig.HomeBattle06;
          break;
        case $z1KinghtFallEnum.KinghtFallEnumLevelChalType.NoAttack:
          l = $z1KinghtFallTextConfig.KinghtFallTextConfig.HomeBattle07;
      }
      o.getChildByName("labName").getComponent(cc.Label).string = this.T(l);
    }
  };
  _ctor.prototype.loadStageMonster = function (stage) {
    var self = this, request = this._stageMonsterRequest = (this._stageMonsterRequest || 0) + 1;
    var unitId = { wqyl_bb: 90001, wqyl_zbb: 90002, wqyl_gb: 90003, wqyl_qb: 90004 }[stage.EnemyAni] || 90001;
    var cfg = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById(unitId);
    var node = (this._lobby && this._lobby.stagePreview || this.ndLevelInfo).getChildByName("spAni"), renderer = node.getComponent(sp.Skeleton);
    if (!this._stageModelOrigin) this._stageModelOrigin = { x: node.x, y: node.y };
    node.active = false;
    // Read the renderer from the same prefab used by battle. Loading its asset
    // never instantiates an actor or starts gameplay in the lobby.
    this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.Enemy, cfg.prefab, function (prefab) {
      if (!cc.isValid(self, true) || self._stageMonsterRequest !== request || !cc.isValid(node, true)) return;
      var source = prefab.data.getComponentInChildren(sp.Skeleton);
      if (!source || !source.skeletonData) return;
      var target = source.skeletonData, skin = source.defaultSkin || "default";
      var json = target.skeletonJson, skins = json && json.skins, names = null;
      if (json) names = Array.isArray(skins) ? skins.map(function (entry) { return entry.name; }) : Object.keys(skins || {});
      else if (typeof target.getSkinsEnum === "function") {
        var enumeration = target.getSkinsEnum();
        names = Object.keys(enumeration).filter(function (name) { return name !== "<None>" && typeof enumeration[name] === "number"; });
      }
      if (names) {
        names = names.filter(function (name) { return typeof name === "string" && name.length > 0; });
        if (names.indexOf(skin) < 0) skin = names.indexOf("default") >= 0 ? "default" : names[0] || "";
      }
      // Creator resets defaultSkin when skeletonData changes. Keep the target
      // skin locally and restore it afterwards; setSkin("") asserts in JSB.
      renderer.skeletonData = target;
      renderer.defaultSkin = skin;
      if (skin) renderer.setSkin(skin);
      var metadata = source.skeletonData.skeletonJson && source.skeletonData.skeletonJson.skeleton;
      var scale = 90 / Math.max(1, metadata && metadata.height || 120);
      var data = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data;
      var visual = data.GameTools && data.GameTools.visuals && data.GameTools.visuals["enemy:" + unitId + ":default"] || {};
      node.x = self._stageModelOrigin.x + (visual.x || 0); node.y = self._stageModelOrigin.y + (visual.y || 0);
      node.scaleX = scale * (visual.scaleX === undefined ? 1 : visual.scaleX) * (visual.mirrorX ? 1 : -1);
      node.scaleY = scale * (visual.scaleY === undefined ? 1 : visual.scaleY); node.angle = visual.rotation || 0;
      node.color = visual.tint ? cc.color(visual.tint) : cc.Color.WHITE;
      renderer.setAnimation(0, "idle", true); node.active = true;
      self._stageMonsterId = unitId;
    });
  };
  _ctor.prototype.initBtnView = function () {
    var t = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage();
    t = Math.min(t, this.cfgList.length);
    this.btnLeft.active = this.selectStage > 1;
    this.btnRight.active = this.selectStage < this.cfgList.length && this.selectStage < t;
    var e = false;
    var n = false;
    for (var i = this.selectStage - 1; i > 0; i--) {
      if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().hasGetLevelReward(i)) {
        e = true;
        break;
      }
    }
    for (i = this.selectStage + 1; i <= t; i++) {
      if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().hasGetLevelReward(i)) {
        n = true;
        break;
      }
    }
    this.btnLeft.getChildByName("ndRed").active = e;
    this.btnRight.getChildByName("ndRed").active = n;
  };
  _ctor.prototype.showRed = function () {
    var t = false;
    var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getAchievementCfg();
    for (var n = 0; n < e.length; n++) {
      var i = e[n];
      if (r = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getAchInfoByType(i.Type)) {
        if (r.reward.includes(i.ID)) {
          ;
        } else if (r.num >= i.Argument) {
          t = true;
          break;
        }
      }
    }
    this.btnAchieve.getChildByName("ndRed").active = t;
    t = false;
    e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getPassCfg();
    var a = 0;
    for (var o = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getAchPoint(); o >= e[a].LevelCost && (o -= e[a].LevelCost, e[++a]);) {
      ;
    }
    for (n = 0; n < e.length; n++) {
      i = e[n];
      var r = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getAchReward(i.ID);
      if (a >= i.ID && !((1 & r) > 0)) {
        t = true;
        break;
      }
    }
    this.btnPassport.getChildByName("ndRed").active = t;
    t = false;
    e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getOnlineRewardCfg();
    var s = Math.floor($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().getOnlineTime() / 60);
    for (n = 0; n < e.length; n++) {
      if (s >= e[n].condition && !$z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().getOnlineTimeReward(e[n].id)) {
        t = true;
        break;
      }
    }
    this.btnOnline.getChildByName("ndRed").active = t;
    t = false;
    switch ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().getSignReward()) {
      case 0:
        t = true;
    }
    var signDay = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().getSignDay();
    this.btnSign.getChildByName("ndRed").active = t && !!$z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSignCfg()[signDay];
    if (this._lobby) { this.onUpdateTask(); require("HomeLobbyLayout").refresh(this); }
    this.refreshSubView();
  };
  _ctor.prototype.onUpdateTask = function () {
    var mission = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData();
    if (mission.hasQuestReward) {
      this._missionRewardReady = mission.hasQuestReward();
      if (this._lobby) this._lobby.quest.getChildByName("ndRed").active = this._missionRewardReady;
      this.ndTaskInfo.active = false; return;
    }
    var t = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getTaskInfo();
    if (2 != t.stage) {
      var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTaskCfgById(t.id);
      var n = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(e.Award[0]);
      var i = this.ndTaskInfo.getChildByName("ndItem");
      this.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, n.icon, function (t) {
        i.getChildByName("sprIcon").getComponent(cc.Sprite).spriteFrame = t;
      });
      i.getChildByName("labNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(e.Award[1]);
      var a = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage();
      // maxStage is the next unlocked chapter, including the sentinel after
      // the final chapter has been cleared.
      a = Math.min(a, this.cfgList.length + 1);
      var o = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxOrder();
      var s = 0;
      var l = 1;
      switch (e.MissionType) {
        case $z1KinghtFallEnum.KinghtFallEnumTaskEnum.LevelComplete:
          a > e.Argument[0] && (t.stage = 1);
          s = a - 1;
          l = e.Argument[0];
          break;
        case $z1KinghtFallEnum.KinghtFallEnumTaskEnum.LevelWaveComplete:
          if (a > e.Argument[0] || a == e.Argument[0] && o >= e.Argument[1]) {
            s = 1;
            t.stage = 1;
          }
          break;
        case $z1KinghtFallEnum.KinghtFallEnumTaskEnum.EquipUpCount:
          t.num = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.EquipUp);
          t.num >= e.Argument[0] && (t.stage = 1);
          s = t.num;
          l = e.Argument[0];
          break;
        case $z1KinghtFallEnum.KinghtFallEnumTaskEnum.EquipLevel:
          var c = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getEquipCfgList();
          for (var h = 0; h < c.length; h++) {
            var g = c[h];
            var u = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getPersonLevel(g.id);
            s = Math.max(s, u);
          }
          s >= e.Argument[0] && (t.stage = 1);
          l = e.Argument[0];
          break;
        case $z1KinghtFallEnum.KinghtFallEnumTaskEnum.UnlockTalentCount:
          t.num = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.TalentUp);
          t.num >= e.Argument[0] && (t.stage = 1);
          s = t.num;
          l = e.Argument[0];
          break;
        case $z1KinghtFallEnum.KinghtFallEnumTaskEnum.UnlockBuffTalent:
          var d = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBuffCfgList();
          var p = function (t) {
            var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTalent();
            for (var n = 0; n < e.length; n++) {
              var i = e[n];
              if (i.isLock && $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTalentLevelCfgById(i.id).kindID == t) {
                return true;
              }
            }
            return false;
          };
          for (h = 0; h < d.length; h++) {
            d[h].Unlock && p(d[h].Unlock) && s++;
          }
          s >= e.Argument[0] && (t.stage = 1);
          l = e.Argument[0];
          break;
        case $z1KinghtFallEnum.KinghtFallEnumTaskEnum.TreasureLevel:
          t.num = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.TreasureUp);
          t.num >= e.Argument[0] && (t.stage = 1);
          s = t.num;
          l = e.Argument[0];
          break;
        default:
          s = t.num;
          t.num >= e.Argument[0] && (t.stage = 1);
          l = e.Argument[0];
      }
      this.ndTaskInfo.getChildByName("ndFinish").active = 1 == t.stage;
      this.ndTaskInfo.getChildByName("labName").getComponent(cc.Label).string = $z1Utils.Utils.StringFormat.apply($z1Utils.Utils, cc__spreadArrays([this.T(e.MissionDescribe)], e.Argument));
      var f = this.ndTaskInfo.getChildByName("ndPro");
      f.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = s / l;
      f.getChildByName("labPro").getComponent(cc.Label).string = s + "/" + l;
    } else {
      this.ndTaskInfo.active = false;
    }
    this._missionRewardReady = 1 == t.stage;
    this.refreshMissionDrawerBadge();
  };
  _ctor.prototype.bindBoxRewardDismissal = function () {
    var root = $z1UIMgr.UIMgr.getInstance().uiRoot;
    if (this._boxRewardInputRoot === root) return;
    if (this._boxRewardInputRoot) this._boxRewardInputRoot.off(cc.Node.EventType.TOUCH_END, this.onBoxRewardTouchEnd, this, true);
    this._boxRewardInputRoot = root;
    // Capture also sees taps on sibling controls before their Button handlers
    // stop propagation. Blank-screen touches are handled by this root as well.
    if (root) root.on(cc.Node.EventType.TOUCH_END, this.onBoxRewardTouchEnd, this, true);
  };
  _ctor.prototype.onBoxRewardTouchEnd = function (event) {
    var popup = this.ndBoxShow.getChildByName("ndTips");
    if (!popup.active) return;
    var location = event.getLocation();
    for (var index = 1; index <= 3; index++) {
      var chest = this.ndBoxShow.getChildByName("ndTag" + index);
      if (!chest.activeInHierarchy) continue;
      var point = chest.convertToNodeSpaceAR(location);
      var left = -chest.width * chest.anchorX, bottom = -chest.height * chest.anchorY;
      // Non-swallowing overlays dispatch the same touch first. Use coordinates,
      // not event.target, so the chest can still toggle/switch the preview once.
      if (point.x >= left && point.x <= left + chest.width && point.y >= bottom && point.y <= bottom + chest.height) return;
    }
    this.hideBoxReward();
  };
  _ctor.prototype.hideBoxReward = function () {
    this._boxRewardRequest = (this._boxRewardRequest || 0) + 1;
    var popup = cc.isValid(this.ndBoxShow, true) && this.ndBoxShow.getChildByName("ndTips");
    if (!popup) return;
    cc.Tween.stopAllByTarget(popup);
    popup.active = false;
    popup.tagUUID = null;
    popup.scale = 1;
  };
  _ctor.prototype.onDisable = function () {
    this.stopMissionDrawerTweens();
    this._missionDrawerLayout = null;
    if (this._boxRewardInputRoot) this._boxRewardInputRoot.off(cc.Node.EventType.TOUCH_END, this.onBoxRewardTouchEnd, this, true);
    this._boxRewardInputRoot = null;
    this.hideBoxReward();
  };
  _ctor.prototype.onDestroy = function () {
    // Creator destroys child nodes before this component's onDestroy. Do not
    // run onDisable's popup traversal again after those children are released.
    this._boxRewardRequest = (this._boxRewardRequest || 0) + 1;
    if (cc.isValid(this._boxRewardInputRoot, true)) this._boxRewardInputRoot.off(cc.Node.EventType.TOUCH_END, this.onBoxRewardTouchEnd, this, true);
    this._boxRewardInputRoot = null;
    t.prototype.onDestroy.call(this);
  };
  _ctor.prototype.onBoxClick = function (t) {
    var e = this.ndBoxShow.getChildByName("ndTag" + (t + 1));
    var popup = this.ndBoxShow.getChildByName("ndTips");
    if (popup.active && popup.tagUUID === e.uuid) return this.hideBoxReward();
    var challenge = this.cfgList[this.selectStage - 1].Challenge[t];
    var n = ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getStageInfo(this.selectStage) & 1 << challenge - 1) > 0;
    var i = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getStageReward(this.selectStage, t + 1);
    if (n) {
      this.hideBoxReward();
      if (i) {
        $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, $z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTips04);
      } else {
        var a = e.getChildByName("spAni").getComponent(sp.Skeleton);
        var o = this.cfgList[this.selectStage - 1].ChallengeReward[t];
        var r = [];
        for (var s = 0; s < o.length; s++) {
          var l = o[s];
          r.push({
            id: l[0],
            num: l[1]
          });
        }
        var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
        var stage = this.selectStage;
        var granted = player.claimRewards(r, 1, e.convertToWorldSpaceAR(cc.v2(0, 0)), function () {
          player.getUserData().setStageReward(stage, t + 1);
        }, function () { return (player.getUserData().getStageInfo(stage) & 1 << challenge - 1) > 0 && !player.getUserData().getStageReward(stage, t + 1); });
        if (!granted) return;
        a.setAnimation(0, "open", false);
        a.addAnimation(0, "open_idle", false);
        $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIGoldReward, $z1KinghtFallConfig.KinghtFallUIID.UIHome, r);
        this.initMapView();
      }
    } else {
      this.showBoxReward(t);
    }
  };
  _ctor.prototype.showBoxReward = function (t) {
    var e = this.ndBoxShow.getChildByName("ndTag" + (t + 1));
    var n = this.cfgList[this.selectStage - 1].ChallengeReward[t];
    var i = this.ndBoxShow.getChildByName("ndTips");
    cc.Tween.stopAllByTarget(i);
    if (i.active && i.tagUUID == e.uuid) {
      this.hideBoxReward();
    } else {
      var request = this._boxRewardRequest = (this._boxRewardRequest || 0) + 1;
      i.active = true;
      i.x = e.x;
      i.attr({
        tagUUID: e.uuid
      });
      cc.tween(i).set({
        scale: .95
      }).to(.1, {
        scale: 1
      }, {
        easing: "quintOut"
      }).start();
      var a = i.getChildByName("ndLayout");
      var o = Math.max(n.length, a.childrenCount);
      var r = function (t) {
        if (n[t]) {
          var e = a.children[t];
          var i = {
            id: n[t][0],
            num: n[t][1]
          };
          if (e) {
            e.active = true;
            e.getComponent($z1KinghtFallItemGood.default).initView(i);
          } else {
            var o = function (t) {
              t.setParent(a);
              t.active = true;
              t.setScale(.8);
              t.getComponent($z1KinghtFallItemGood.default).initView(i);
            };
            var r = $z1PoolMgr.PoolMgr.getInstance().getNode($z1KinghtFallConfig.KinghtFallPoolName.ItemGood);
            if (r) {
              o(r);
            } else {
              s.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.IconGood, $z1KinghtFallConfig.KinghtFallPrefabName.ItemGood, function (t) {
                if (s._boxRewardRequest !== request) return;
                r = $z1PoolMgr.PoolMgr.getInstance().getNodeFromPrefab($z1KinghtFallConfig.KinghtFallPoolName.ItemGood, t, 10);
                o(r);
              });
            }
          }
        } else {
          a.children[t] && (a.children[t].active = false);
        }
      };
      var s = this;
      for (var l = 0; l < o; l++) {
        r(l);
      }
      a.getComponent(cc.Layout).updateLayout();
      var c = i.convertToWorldSpaceAR(cc.v2(-a.width / 2, 0));
      if (c.x < 50) {
        a.x = 50 - c.x;
      } else {
        var h = i.convertToWorldSpaceAR(cc.v2(a.width / 2, 0));
        if (h.x > cc.winSize.width - 50) {
          a.x = cc.winSize.width - 50 - h.x;
        } else {
          a.x = 0;
        }
      }
    }
  };
  _ctor.prototype.onTaskClick = function () {
    var t = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getTaskInfo();
    if (1 == t.stage) {
      var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTaskCfgById(t.id);
      var n = {
        id: e.Award[0],
        num: e.Award[1]
      };
      var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
      var taskId = t.id;
      var granted = player.claimRewards([n], 1, this.ndTaskInfo.convertToWorldSpaceAR(this.ndTaskInfo.getChildByName("ndItem").position), function () {
        var task = player.getMissionData().getTaskInfo();
        task.stage = 2;
        player.getMissionData().setTaskInfo(task);
      }, function () { var task = player.getMissionData().getTaskInfo(); return task.id === taskId && task.stage === 1; });
      if (!granted) return;
      this.onUpdateTask();
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 4);
    }
  };
  _ctor.prototype.initMorePlay = function () {
    if (this._lobby) return;
    var t = this;
    this.ndBtnLeft.getChildByName("btnMove").scaleY = this.isLeftUp ? 1 : -1;
    var e = this.ndBtnLeft.getChildByName("Layout");
    e.children.forEach(function (e, n) {
      e.active = t.isLeftUp || n < 2;
    });
    e.getComponent(cc.Layout).updateLayout();
    this.ndBtnLeft.height = e.height + 50;
    this.ndBtnLeft.getChildByName("btnMove").getComponent(cc.Widget).updateAlignment();
  };
  _ctor.prototype.onClickShortCut = function () {
    $z1PlatformManager.PlatformManager.getInstance().addShortcut(null, function (t) {
      if ("桌面图标添加成功" == t && ($z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, "[[loc:script.kinghtfallhomebattlectrl.trackid.509]]"), $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.add_desktop), 0 == $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getTimeByKey($z1GameTrackData.TimeByKey.ADD_DESKTOP))) {
        var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.AddDesktop).split(",");
        var n = {
          id: parseInt(e[0]),
          num: parseInt(e[1])
        };
        var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
        var i = player.claimRewards([n], 1, null, function () {
          player.getGuideData().setTimeByKey($z1GameTrackData.TimeByKey.ADD_DESKTOP, 1);
        }, function () { return !player.getGuideData().getTimeByKey($z1GameTrackData.TimeByKey.ADD_DESKTOP); });
        if (i) $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIGoldReward, $z1Config.UIID.UINONE, i);
      }
    });
  };
  _ctor.prototype.onStartGame = function () {
    var t = this;
    var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
    var stage = this.selectStage, cost = this.costEnergy;
    if (!player.getGameData().readyForNewBattle()) return;
    if (player.getGameData().hasSave(stage)) {
      $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UINewGame, $z1Config.UIID.UINONE, function () {
        t.sendEvent($z1Appcfg.BaseEventName.ShowTransition, true, function () {
          $z1UIMgr.UIMgr.getInstance().openUIOfCallback($z1KinghtFallConfig.KinghtFallUIID.UIGame, $z1Config.UIID.UINONE, function () {
            $z1UIMgr.UIMgr.getInstance().getUIById($z1KinghtFallConfig.KinghtFallUIID.UIHome).node.active = false;
          }, stage);
        });
      }, stage);
    } else if (player.getUserData().getPowerNum() >= cost) {
      this.sendEvent($z1Appcfg.BaseEventName.ShowTransition, true, function () {
        var manager = $z1UIMgr.UIMgr.getInstance(), ids = $z1KinghtFallConfig.KinghtFallUIID;
        var entry = { cost: cost, transition: manager.captureOpenTransition() };
        manager.openUIWithOwner(ids.UIGame, $z1Config.UIID.UINONE, {
          parent: manager.getUIById(ids.UIHome),
          isCurrent: function () { return cc.isValid(t, true) && t.node.activeInHierarchy && t.selectStage === stage; },
          onCancel: function () { manager.cancelOpenTransition(entry.transition); },
          onOpened: function () { manager.getUIById(ids.UIHome).node.active = false; }
        }, stage, entry);
      });
    } else {
      $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIAddStrength, $z1Config.UIID.UINONE);
    }
  };
  _ctor.prototype.initSubView = function () {
    var t = this;
    this.btnSubEnter.active = this.haveArrow;
    this.initSubTime();
    this.initSubStage();
    this.refreshSubView();
    if (this.haveArrow) {
      this.updateEnter(false);
      this.isEnter = false;
      this.btnSubEnter.scaleY *= -1;
      this.btnSubEnter.on(cc.Node.EventType.TOUCH_END, function () {
        if (t.isEnter) {
          t.updateEnter(false);
        } else {
          t.updateEnter(true);
        }
      });
    } else {
      var e = this.btnSubBg.children.length;
      var n = this.btnSubBg.children;
      for (var i = 0; i < e; i++) {
        if (this.checkISHideInSdk(i) || this.checkISHideInWebLink(i)) {
          n[i].active = false;
        } else {
          n[i].active = true;
        }
      }
    }
    this.initSubButton();
  };
  _ctor.prototype.initSubButton = function () {
    var t = this;
    var e = function (e) {
      var i = n.btnSubBg.children[e];
      var a = Number(e);
      i.on(cc.Node.EventType.TOUCH_END, function () {
        t.EnterSubPlay(a);
      });
    };
    var n = this;
    for (var i in this.btnSubBg.children) {
      e(i);
    }
  };
  _ctor.prototype.initSubTime = function () {
    this.subPlayTime = [];
    var t = Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.cdTimeDefense));
    this.subPlayTime.push(t);
  };
  _ctor.prototype.initSubStage = function () {
    this.subPlayStage = [];
    var t = Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.unlockDefense));
    this.subPlayStage.push(t);
  };
  _ctor.prototype.updateEnter = function (t) {
    var e = this.btnSubBg.children.length;
    var n = this.btnSubBg.children;
    var i = -1;
    for (var a = e - 1; a >= 0; a--) {
      this.checkISHideInSdk(a) || this.checkISHideInWebLink(a) || -1 != i || (i = a);
      if (this.checkISHideInSdk(a) || this.checkISHideInWebLink(a)) {
        n[a].active = false;
      } else {
        n[a].active = true;
      }
    }
    t || (n[i].active = true);
    this.btnSubBg.getComponent(cc.Layout).updateLayout();
    this.btnSubEnter.y = this.btnSubBg.height - 100;
    this.btnSubEnter.scaleY *= -1;
    this.isEnter = !this.isEnter;
  };
  _ctor.prototype.checkISHideInSdk = function (t) {
    return !!$z1SdkMgr.SdkMgr.getInstance().getCheckVersion($z1PlatformSetting.SwitchID.ShenHe) && -1 != [].indexOf(t);
  };
  _ctor.prototype.checkISHideInWebLink = function (t) {
    return $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.WEB_LINK && -1 != [].indexOf(t);
  };
  _ctor.prototype.getYoumengTrack = function (t) {
    if (0 == t) {
      return $z1GameTrackDataEvent.TrackId.defend_wall;
    }
  };
  _ctor.prototype.EnterSubPlay = function (t) {
    var e = this;
    if (this._wallDefenseEntering) return;
    if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage() <= this.subPlayStage[t]) {
      $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, $z1Utils.Utils.StringFormat(this.T($z1TextConfig.TextConfig.Tips19), this.subPlayStage[t] + 1));
    } else {
      var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance(), user = player.getUserData();
      var reserved = user.data && user.data.wallDefenseAdmission;
      var cost = require("GAD_Configs").GADConfig.EnergyCost;
      if (user.getPowerNum && user.getPowerNum() < cost && !(reserved && !reserved.used)) {
        $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIAddStrength, $z1Config.UIID.UINONE); return;
      }
      var n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().getSubTimeByIndex(t);
      var i = (Date.now() - n) / 1e3;
      if (0 == t) {
        this._wallDefenseEntering = true;
        var launched = false;
        var a = function () {
          if (launched) return; launched = true;
          $z1GAD_App.default.instance.enter_App(function () {
            e._wallDefenseEntering = false;
            $z1UIMgr.UIMgr.getInstance().getUIById($z1KinghtFallConfig.KinghtFallUIID.UIHome).node.active = false;
          }, function () {
            $z1UIMgr.UIMgr.getInstance().getUIById($z1KinghtFallConfig.KinghtFallUIID.UIHome).node.active = true;
            $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().setSubTimeByIndex(t, Date.now());
            e.refreshSubView();
          }, { cost: cost, unlockStage: e.subPlayStage[t] + 1, onCancel: function () { e._wallDefenseEntering = false; } });
        };
        if (i < this.subPlayTime[t] && !TestMode.getInstance().shouldBypassAdLimits()) {
          $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack(e.getYoumengTrack(t));
            a();
          }, function () { e._wallDefenseEntering = false; }, "home.defendWall.cooldown");
        } else {
          a();
        }
      }
    }
  };
  _ctor.prototype.refreshSubView = function () {
    var t = Date.now();
    var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage();
    for (var n in this.btnSubBg.children) {
      var i = Number(n);
      var a = this.btnSubBg.children[n];
      var o = this.subPlayStage[i];
      var r = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().getSubTimeByIndex(i);
      var s = this.subPlayTime[i];
      this.onSubView(a, e, o, t, r, s);
    }
  };
  _ctor.prototype.onSubView = function (t, e, n, i, a, o) {
    var unlocked = e > n;
    if (t._isLobbyMode) {
      var user = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData();
      require("HomeLobbyLayout").modeState(this, unlocked, user.data.wallDefenseBestWave || 0, n + 1);
      return;
    }
    var name = t.getChildByName("labName"), best = t.getChildByName("labBestWave");
    if (name) name.active = !unlocked;
    if (best) {
      best.active = unlocked;
      if (unlocked) {
        var score = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().data.wallDefenseBestWave || 0;
        require("LanguageMgr").LanguageMgr.getInstance().bindLabel(best.getComponent(cc.Label), "wallDefense.bestWave", [score]);
      }
    }
    if (unlocked) {
      var r = Math.floor((i - a) / 1e3);
      var waiting = r < o && !TestMode.getInstance().shouldBypassAdLimits();
      t.getChildByName("ndMask").active = waiting;
      t.getChildByName("Layout").active = waiting;
      t.getChildByName("labInfo").active = false;
      waiting && (t.getChildByName("Layout").getChildByName("labTime").getComponent(cc.Label).string = require("LanguageMgr").LanguageMgr.getInstance().t("format.seconds", [o - r]));
    } else {
      t.getChildByName("ndMask").active = true;
      t.getChildByName("Layout").active = false;
      t.getChildByName("labInfo").active = true;
    }
  };
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "关卡信息"
  })], _ctor.prototype, "ndLevelInfo", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "左侧按钮"
  })], _ctor.prototype, "btnLeft", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "右侧按钮"
  })], _ctor.prototype, "btnRight", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "宝箱展示"
  })], _ctor.prototype, "ndBoxShow", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "战斗按钮"
  })], _ctor.prototype, "btnBattle", undefined);
  cc__decorate([ccp_property(cc.SpriteFrame)], _ctor.prototype, "wallDefenseButtonFrame", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "任务信息"
  })], _ctor.prototype, "ndTaskInfo", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "伸缩节点"
  })], _ctor.prototype, "ndBtnLeft", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "成就按钮"
  })], _ctor.prototype, "btnAchieve", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "通行证按钮"
  })], _ctor.prototype, "btnPassport", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "在线奖励"
  })], _ctor.prototype, "btnOnline", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "签到"
  })], _ctor.prototype, "btnSign", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "添加桌面"
  })], _ctor.prototype, "btnAddDesktop", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "侧边栏按钮"
  })], _ctor.prototype, "btnSideBoard", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "反馈"
  })], _ctor.prototype, "btnReport", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "副玩法扩展按钮"
  })], _ctor.prototype, "btnSubEnter", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "副玩法背景"
  })], _ctor.prototype, "btnSubBg", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.default = def_KinghtFallHomeBattleCtrl;
