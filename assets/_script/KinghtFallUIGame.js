var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BasePlatform = require("BasePlatform");
var $z1BaseUI = require("BaseUI");
var $z1Appcfg = require("Appcfg");
var $z1PlatformSetting = require("PlatformSetting");
var $z1AudioMgr = require("AudioMgr");
var $z1SdkMgr = require("SdkMgr");
var $z1UIMgr = require("UIMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1UIGuide = require("UIGuide");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallGameCtrl = require("KinghtFallGameCtrl");
var $z1KinghtFallGameCtrlData = require("KinghtFallGameCtrlData");
var $z1KinghtFallGameEffect = require("KinghtFallGameEffect");
var $z1KinghtFallGameUICtrl = require("KinghtFallGameUICtrl");
var TestMode = require("TestMode").TestMode;
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
function resolveEnemyPictogram(settings, id) {
  var number = Number(id);
  // Only the three original boss records share the transforming boss prefab.
  // Independent monster records use their own default appearance and role.
  var form = number >= 90010 && number <= 90012 ? number - 90009 : 'default';
  var key = 'enemy:' + id + ':' + form;
  var typeId = settings && settings.unitTypeAssignments && settings.unitTypeAssignments[key];
  return settings && settings.unitTypes && settings.unitTypes[typeId] || null;
}
// Keep the complete enemy indicator clear of HUD controls and earlier indicators.
// Candidate edges are bounded and deterministic; this is UI placement, not movement.
function placeEnemyIndicator(target, footprint, bounds, obstacles, gap) {
  var clamp = function (value, min, max) { return Math.max(min, Math.min(max, value)); };
  var x = clamp(target.x, bounds.minX, bounds.maxX), y = clamp(target.y, bounds.minY, bounds.maxY);
  var forbidden = obstacles.map(function (rect) { return {
    minX: rect.minX - gap - footprint.maxX, maxX: rect.maxX + gap - footprint.minX,
    minY: rect.minY - gap - footprint.maxY, maxY: rect.maxY + gap - footprint.minY
  }; });
  var xs = [x, bounds.minX, bounds.maxX], ys = [y, bounds.minY, bounds.maxY];
  forbidden.forEach(function (rect) {
    [rect.minX, rect.maxX].forEach(function (value) { if (value >= bounds.minX && value <= bounds.maxX) xs.push(value); });
    [rect.minY, rect.maxY].forEach(function (value) { if (value >= bounds.minY && value <= bounds.maxY) ys.push(value); });
  });
  var best = { x: x, y: y }, bestOverlap = Infinity, bestDistance = Infinity;
  xs.forEach(function (px) { ys.forEach(function (py) {
    var overlap = 0;
    forbidden.forEach(function (rect) {
      if (px > rect.minX + 0.001 && px < rect.maxX - 0.001 && py > rect.minY + 0.001 && py < rect.maxY - 0.001) {
        overlap += Math.min(px - rect.minX, rect.maxX - px) * Math.min(py - rect.minY, rect.maxY - py);
      }
    });
    var distance = (px - target.x) * (px - target.x) + (py - target.y) * (py - target.y);
    if (overlap < bestOverlap || overlap === bestOverlap && distance < bestDistance) {
      best = { x: px, y: py }; bestOverlap = overlap; bestDistance = distance;
    }
  }); });
  return best;
}
function enemyIndicatorBounds(node, ui, ignored) {
  var rect = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  function include(point) {
    rect.minX = Math.min(rect.minX, point.x); rect.maxX = Math.max(rect.maxX, point.x);
    rect.minY = Math.min(rect.minY, point.y); rect.maxY = Math.max(rect.maxY, point.y);
  }
  function visit(current) {
    if (!current || current === ignored) return;
    var left = -current.anchorX * current.width, bottom = -current.anchorY * current.height;
    [[left, bottom], [left + current.width, bottom], [left, bottom + current.height], [left + current.width, bottom + current.height]].forEach(function (point) {
      include(ui.convertToNodeSpaceAR(current.convertToWorldSpaceAR(cc.v2(point[0], point[1]))));
    });
    current.children.forEach(function (child) { if (child.active) visit(child); });
  }
  visit(node);
  return rect;
}
var def_KinghtFallUIGame = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndCtrGame = null;
    e.ctrEffect = null;
    e.ctrUI = null;
    e.ndEnemyIcon = null;
    e.ndCoin = null;
    e.ndBuildCoin = null;
    e.ndLevelInfo = null;
    e.btnStartFight = null;
    e.btnAddCoin = null;
    e.btnAgg = null;
    e.btnFollow = null;
    e.btnSuspend = null;
    e.btnRevive = null;
    e.btnReviveBreak = null;
    e.btnBuildInfo = null;
    e.ndTask = null;
    e.btnTest = null;
    e.speed = 1;
    e.ctrGame = null;
    e.levelId = 1;
    e.isGet = false;
    e.canStart = true;
    e.canBreak = true;
    e.spIdx = 0;
    e.isPauset = true;
    e.enemyIconInfo = {};
    return e;
  }
  var n;
  cc__extends(_ctor, t);
  n = _ctor;
  _ctor.prototype.init = function (levelId, freshEntry) {
    this.levelId = levelId;
    this._freshEntry = freshEntry || null;
  };
  _ctor.prototype.onLoad = function () {
    n.instance = this;
    if (this.btnAgg) require("FollowButtonArtwork").install(this.btnAgg);
    if (this.btnFollow) require("FollowButtonArtwork").install(this.btnFollow);
    this.ndEnemyIcon.active = false;
    this.ndBuildCoin.active = false;
    this.btnStartFight.active = false;
    this.btnAgg.active = false;
    if (this.btnFollow) this.btnFollow.active = false;
    this.btnBuildInfo.active = true;
    this.ndTask.getChildByName("ndAni").active = false;
    if (this.ctrUI && this.ctrUI.node && cc.view) require("BattleHud").install(this);
  };
  _ctor.prototype.start = function () {
    var t = this;
    TestMode.getInstance().setGameplayTarget(this);
    this.playPlanningMusic();
    var entry = this._freshEntry, levelId = this.levelId, started = false;
    if (!entry) { this.initBtnEvent(); this.initEvent(); }
    this.btnAgg.getChildByName("ndTag1").active = true;
    this.btnAgg.getChildByName("ndTag2").active = false;
    var game = this.ndCtrGame.getComponent($z1KinghtFallGameCtrl.default);
    var config = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getLevelCfgById(levelId);
    // Existing checkpoint and diagnostic entries do not purchase a new battle.
    if (!entry) { this.ctrGame = game; game.initData(levelId); this.initView(); }
    this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.IconMap, config.prefab, function (prefab) {
      if (started || t.isclose || t._freshEntry !== entry) return;
      started = true;
      function prepareMap() {
        if (entry) {
          t.ctrGame = game;
          game.initData(levelId);
          t.initBtnEvent();
          t.initEvent();
        }
        // Align the map parent before physics captures the bodies' world positions.
        var widget = t.ndCtrGame.getComponent(cc.Widget);
        if (widget) widget.updateAlignment();
        var map = cc.instantiate(prefab);
        map.setParent(t.ndCtrGame);
        game.initMap(map);
        t.ctrEffect.initData(game.ndUI);
        game.gameData.upMap();
        game.onLateUpdate(0);
        t.initBtnView();
        t.ctrUI.ndGuide.setParent(game.ndPath);
        if (!entry && game.loadGame()) t.onRestart(false);
        game.gameData.initCom();
        if (entry) t.initView();
      }
      if (entry) {
        var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
        var checkpoint = player.getGameData(), admitted = false;
        try {
          // initData credits the first wave's silver achievement. Stage that
          // credit, the stamina cost and a resumable checkpoint in one journal.
          if (checkpoint.readyForNewBattle()) admitted = player.purchase([
            { id: $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.stamina, num: entry.cost }
          ], function () {
            player.getUserData().setStage(levelId);
            prepareMap();
            return checkpoint.setCheckpoint(game.getCheckpoint());
          }, function () {
            return !t.isclose && t._freshEntry === entry && !checkpoint.hasSave(levelId) && levelId <= player.getUserData().getMaxStage();
          });
        } catch (error) { console.error('Could not start battle', error); }
        t._freshEntry = null;
        if (!admitted) {
          $z1UIMgr.UIMgr.getInstance().cancelOpenTransition(entry.transition);
          t.closeUI();
          return;
        }
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide3);
        $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.set_of);
      } else prepareMap();
      t.sendEvent($z1Appcfg.BaseEventName.ShowTransition, false, function () {
        if (t.isclose) return;
        t.isPauset = false;
        t.startGuide();
      });
    });
  };
  _ctor.prototype.playPlanningMusic = function () {
    var config = this.ctrGame && this.ctrGame.gameData && this.ctrGame.gameData.levelCfg ||
      $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getLevelCfgById(this.levelId);
    var audio = $z1KinghtFallConfig.KinghtFallAudioId;
    var id = config && (config.EnvironmentBiome === "desert" || (config.EnvironmentMapId || config.prefab) === "Map03") ? audio.desert_ready_bgm : audio.ready_bgm;
    $z1AudioMgr.AudioMgr.getInstance().playMusic(id, $z1KinghtFallConfig.KinghtFallParameter.BGMusic);
  };
  _ctor.prototype.initBtnEvent = function () {
    var t = this;
    this.ctrUI.setMoveFunc(this.moveFun.bind(this));
    this.btnStartFight.on(cc.Node.EventType.TOUCH_END, function () {
      t.sendEvent($z1KinghtFallConfig.KinghtFallEventName.PlayVideoSucc, false);
      $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide8);
      if (t.canStart && (t.startRoundGame(), !$z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getGuideTips(2))) {
        for (var e in t.enemyIconInfo) {
          if (Object.prototype.hasOwnProperty.call(t.enemyIconInfo, e)) {
            var i = t.enemyIconInfo[e];
            if (i.tagNode && i.ndItem && i.ndItem.active) {
              n.instance.ctrUI.setGuide(i.tagNode);
              break;
            }
          }
        }
      }
    });
    this.btnAddCoin.on(cc.Node.EventType.TOUCH_END, function () {
      t.onPauseGame(true);
      $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.button_coin);
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_button_coin_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
        t.ctrGame.gameData.coin += t.ctrGame.gameData.videoCoin;
        t.initView();
        t.onPauseGame(false);
        var e = cc.v2(t.ndCoin.position.x + t.ndCoin.children[0].x, t.ndCoin.position.y + t.ndCoin.children[0].y);
        var n = t.btnAddCoin.convertToWorldSpaceAR(cc.v2(0, 0));
        var i = t.ctrUI.node.convertToNodeSpaceAR(n);
        var a = function () {
          var n = cc.instantiate(t.ndCoin.children[0]);
          n.active = true;
          n.scale = .5;
          n.setParent(t.ctrUI.node);
          var a = cc.v2();
          cc.Vec2.random(a, 40);
          cc.tween(n).set({
            position: cc.v3(i.x, i.y, 0)
          }).by(.2, {
            position: cc.v3(a.x, a.y, 0)
          }).to(1, {
            position: cc.v3(e.x, e.y, 0),
            scale: 1
          }).call(function () {
            n.destroy();
          }).start();
        };
        for (var o = 0; o < 10; o++) {
          a();
        }
      }, function () {
        t.onPauseGame(false);
      }, "battle.silver.supply");
    });
    this.btnAgg.on(cc.Node.EventType.TOUCH_END, this.rallyCommand, this);
    if (this.btnFollow) this.btnFollow.on(cc.Node.EventType.TOUCH_END, this.followCommand, this);
    this.btnSuspend.on(cc.Node.EventType.TOUCH_END, this.openPause, this);
    this.btnReviveBreak.on(cc.Node.EventType.TOUCH_END, function () {
      t.btnReviveBreak.active = false;
      t.btnRevive.active = false;
    });
    this.btnBuildInfo.on(cc.Node.EventType.TOUCH_END, function () {
      t.sendEvent($z1KinghtFallConfig.KinghtFallEventName.PlayVideoSucc, false);
      t.openUI($z1KinghtFallConfig.KinghtFallUIID.UIBuildAtlas);
    });
    this.ndTask.on(cc.Node.EventType.TOUCH_END, function () {
      t.sendEvent($z1KinghtFallConfig.KinghtFallEventName.PlayVideoSucc, false);
      t.getTask();
    });
    this.btnRevive.on(cc.Node.EventType.TOUCH_END, function () {
      t.onPauseGame(true);
      $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.hero_revive);
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_hero_revive_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
        t.onReviveShow(0);
        t.ctrGame.ctrPlay.onReborn();
        t.onPauseGame(false);
      }, function () {
        t.onPauseGame(false);
      }, "battle.hero.revive");
    });
    this.btnTest.active = false;
    this.btnTest.getComponentInChildren(cc.Label).string = require("LanguageMgr").LanguageMgr.getInstance().t("format.multiplier", [1]);
    this.btnTest.on(cc.Node.EventType.TOUCH_END, function () {
      if (t.canBreak) {
        var e = [1, 1.5, 2];
        t.spIdx++;
        t.spIdx >= e.length && (t.spIdx = 0);
        t.setChangeSpeed(e[t.spIdx]);
        t.btnTest.getComponentInChildren(cc.Label).string = require("LanguageMgr").LanguageMgr.getInstance().t("format.multiplier", [e[t.spIdx]]);
      }
    });
  };
  _ctor.prototype._refreshArmyButtons = function () {
    this.btnAgg.getChildByName("labNum").getComponent(cc.Label).string = this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.Game04);
    this.btnAgg.getChildByName("ndTag1").active = true;
    this.btnAgg.getChildByName("ndTag2").active = false;
    if (!this.btnFollow) return;
    this.btnFollow.active = this.btnAgg.active;
    this.btnFollow.getChildByName("labNum").getComponent(cc.Label).string = this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.Game05);
    var active = !!this.ctrGame && this.ctrGame.isAgg;
    this.btnFollow.getChildByName("ndTag1").active = !active;
    this.btnFollow.getChildByName("ndTag2").active = active;
  };
  _ctor.prototype.rallyCommand = function () {
    this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.PlayVideoSucc, false);
    $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.set_of);
    this.ctrGame.rallyCommand();
    this._refreshArmyButtons();
  };
  _ctor.prototype.followCommand = function () {
    this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.PlayVideoSucc, false);
    this.ctrGame.followCommand();
    this._refreshArmyButtons();
  };
  _ctor.prototype.beginBattleDialog = function (kind) {
    if (this._enemyGuide) require("EnemyGuide").close(this, kind === "end");
    var ui = this, game = this.ctrGame, data = game.gameData, epoch = game._combatEpoch, round = data.round;
    if (this._battleDialog && this._battleDialog.kind === kind && this._battleDialog.isCurrent()) return null;
    this.cancelBattleDialog();
    var dialog = this._battleDialog = { kind: kind, paused: false };
    dialog.isCurrent = function () {
      return ui._battleDialog === dialog && !ui.isclose && cc.isValid(ui, true) && ui.ctrGame === game &&
        game.gameData === data && game._combatEpoch === epoch && data.round === round;
    };
    return dialog;
  };
  _ctor.prototype.finishBattleDialog = function (dialog) {
    if (!dialog || this._battleDialog !== dialog) return;
    this._battleDialog = null;
    if (dialog.paused) {
      if (!this.isclose && cc.isValid(this, true)) this.onPauseGame(false, dialog);
      else if (this._pauseOwners) this._pauseOwners.delete(dialog);
    }
  };
  _ctor.prototype.cancelBattleDialog = function () {
    var dialog = this._battleDialog;
    if (!dialog) return;
    try { this.finishBattleDialog(dialog); }
    finally {
      try { if (dialog.request) dialog.request.cancel(); }
      finally { if (dialog.node && cc.isValid(dialog.node, true)) $z1UIMgr.UIMgr.getInstance().closeUI(dialog.node); }
    }
  };
  _ctor.prototype.openBattleDialog = function (dialog, id, onOpened, first, second, third, fourth, fifth) {
    var ui = this;
    dialog.request = $z1UIMgr.UIMgr.getInstance().openUIWithOwner(id, this.uid, {
      parent: this,
      recoveryCancelAllowed: dialog.kind === 'pause',
      isCurrent: dialog.isCurrent,
      onCancel: function () { ui.finishBattleDialog(dialog); },
      onOpened: function (node) { dialog.node = node; if (onOpened) onOpened(node); }
    }, first, second, third, fourth, fifth);
  };
  _ctor.prototype.openPause = function () {
    if (!this.canBreak) return;
    var self = this, dialog = this.beginBattleDialog('pause');
    if (!dialog) return;
    dialog.paused = true;
    this.onPauseGame(true, dialog);
    this.openBattleDialog(dialog, $z1KinghtFallConfig.KinghtFallUIID.UISuspend, null, function () {
      return self.restartPausedBattle(dialog);
    }, function () {
      if (!dialog.isCurrent() || self.ctrGame.saveGame() === false) return false;
      self.closeUI();
    }, function () { self.finishBattleDialog(dialog); }, null, {
      mode: "campaign", stageTitle: function () {
        var title = self.ndLevelInfo && self.ndLevelInfo.getChildByName("labName");
        return title ? title.getComponent(cc.Label).string : self.T(self.ctrGame.gameData.levelCfg.Name);
      }
    });
  };
  _ctor.prototype.restartPausedBattle = function (dialog) {
    if (!dialog || !dialog.isCurrent()) return false;
    var record = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData();
    var stage = this.ctrGame.gameData.levelCfg.Level;
    // Retire only this stage's old checkpoint before changing the live map.
    // The paid battle stays mounted, so restarting never purchases another entry.
    if (!record.readyForNewBattle() || record.setNewGame(stage) === false) return false;
    if (this.onRestart(true) === false) return false;
    return this.ctrGame.saveGame() !== false;
  };
  _ctor.prototype.onClose = function () {
    if (this.ctrGame && this.ctrGame._unitVoices) require("UnitVoices").dispose(this.ctrGame);
    if (this._enemyGuide) require("EnemyGuide").close(this, true);
    if (this._battleHud) require("BattleHud").dispose(this);
    this.cancelBattleDialog();
    this._stopTestMovement();
    TestMode.getInstance().removeGameplayTarget(this);
    $z1UIMgr.UIMgr.getInstance().getUIById($z1KinghtFallConfig.KinghtFallUIID.UIHome).node.active = true;
  };
  _ctor.prototype.onDestroy = function () {
    if (this._enemyGuide) require("EnemyGuide").close(this, true);
    if (this._battleHud) require("BattleHud").dispose(this);
    if (this.btnAgg) require("FollowButtonArtwork").dispose(this.btnAgg);
    if (this.btnFollow) require("FollowButtonArtwork").dispose(this.btnFollow);
    try { this.cancelBattleDialog(); }
    finally { t.prototype.onDestroy.call(this); }
  };
  _ctor.prototype.onEnable = function () {
    if (this.ctrGame) TestMode.getInstance().setGameplayTarget(this);
    require("LanguageMgr").LanguageMgr.getInstance().onChange(this._refreshStartBattleCaption, this);
  };
  _ctor.prototype.onDisable = function () {
    if (this._enemyGuide) require("EnemyGuide").close(this);
    this._stopTestMovement();
    TestMode.getInstance().removeGameplayTarget(this);
    require("LanguageMgr").LanguageMgr.getInstance().offChange(this._refreshStartBattleCaption, this);
  };
  _ctor.prototype.onRestart = function (t) {
    if (!$z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().readyForNewBattle()) return false;
    if (this._enemyGuide) require("EnemyGuide").close(this, true);
    this.cancelBattleDialog();
    this.btnBuildInfo.active = true;
    this.canBreak = true;
    this.onPauseGame(false);
    this.ctrGame.onRestart(t);
    this.ctrUI.setRevive(0);
    this.initView();
    this.initBtnView();
    this.btnAgg.active = false;
    if (this.btnFollow) this.btnFollow.active = false;
    this.btnAgg.getChildByName("ndTag1").active = true;
    this.btnAgg.getChildByName("ndTag2").active = false;
    var e = this.ctrGame.gameData.getBulidList();
    for (var n = 0; n < e.length; n++) {
      var i = e[n];
      if (i.buildCfg.enumValue == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Barracks && i.getLevel() >= 1) {
        this.btnAgg.active = true;
        this._refreshArmyButtons();
        break;
      }
    }
    this.ctrGame.gameData.setLight(false);
    this.ctrUI.ndLight.active = false;
    this.ctrGame.ndBg.children.forEach(function (t) {
      t.color = cc.Color.WHITE;
    });
    this.ctrGame.gameData.obstacles.forEach(function (t) {
      t.node.color = cc.Color.WHITE;
    });
  };
  _ctor.prototype.initEvent = function () {
    var t = this;
    this.addEvent($z1Appcfg.BaseEventName.CloseUI, this.onCloseUI);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, this.startGuide);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.GamePause, this.onPauseGame);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.RoundEnd, this.endRoundGame);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.GameOver, this.onGameOver);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.GameRestart, this.onRestart);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.ReviveShow, this.onReviveShow);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.BuildingLevelUp, function () {
      t.ctrGame.gameData.upMap();
      t.initBtnView();
      if (t.ctrGame.gameData.baseBuild.getLevel() >= 1) {
        n.instance.ctrUI.setGuide(null);
        t.scheduleOnce(function () {
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide6);
          t.startGuide();
        }, 1);
      }
    });
  };
  _ctor.prototype.setChangeSpeed = function (t) {
    this.speed = t;
    this.ctrGame.onChangeSpeed();
  };
  _ctor.prototype.initBtnView = function () {
    this.btnStartFight.active = this.ctrGame.gameData.baseBuild.getLevel() >= 1;
    if (1 == this.ctrGame.gameData.levelCfg.Level && this.ctrGame.gameData.round <= 3) {
      var t = true;
      var e = this.ctrGame.gameData.getBulidList();
      for (var n = 0; n < e.length; n++) {
        if (-1 != (a = e[n].getSell()) && a <= this.ctrGame.gameData.coin) {
          t = false;
          break;
        }
      }
      this.btnStartFight.getChildByName("ndHead").active = t;
    } else {
      this.btnStartFight.getChildByName("ndHead").active = false;
    }
    this.btnAddCoin.active = !this.isGet && this.ctrGame.gameData.baseBuild.getLevel() >= 1;
    this.btnAddCoin.getChildByName("lay1").getChildByName("labNum").getComponent(cc.Label).string = "" + this.ctrGame.gameData.videoCoin;
    if (this.ctrGame.gameData.levelCfg.WaveCfg[this.ctrGame.gameData.round]) {
      this.btnStartFight.getChildByName("labNum").getComponent(cc.Label).string = "+" + this.ctrGame.gameData.levelCfg.WaveCfg[this.ctrGame.gameData.round].StartSliver;
    } else {
      this.btnStartFight.children[1].x = 0;
      this.btnStartFight.children[2].active = false;
      this.btnStartFight.children[3].active = false;
    }
    this._refreshStartBattleCaption();
    var i = this.ctrGame.gameData.getBulidList();
    this.btnAgg.active = false;
    if (this.btnFollow) this.btnFollow.active = false;
    for (n = 0; n < i.length; n++) {
      var a;
      if ((a = i[n]).buildCfg.enumValue == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Barracks && a.getLevel() >= 1) {
        this.btnAgg.active = true;
        this._refreshArmyButtons();
        break;
      }
    }
  };
  _ctor.prototype._refreshStartBattleCaption = function () {
    if (!this.ctrGame || !this.btnStartFight) return;
    var language = require("LanguageMgr").LanguageMgr.getInstance();
    var english = language.getCurrentLanguage() === "en";
    var button = this.btnStartFight, children = button.children;
    var fitter = button.getComponent("PaddedTextBackground");
    var next = this.ctrGame.gameData.levelCfg.WaveCfg[this.ctrGame.gameData.round];
    if (fitter) fitter.enabled = !english;
    children[1].active = !english;
    children[2].active = children[3].active = !english && !!next;
    if (english) {
      button.setContentSize(294, 111);
      children[0].setPosition(0, 0);
      if (!this._completionReward) {
        var node = new cc.Node("completionReward");
        node.parent = button;
        node.setAnchorPoint(.5, .5);
        node.scale = .5;
        var label = node.addComponent(cc.Label);
        label.fontSize = 52;
        label.lineHeight = 60;
        label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
        label.verticalAlign = cc.Label.VerticalAlign.CENTER;
        label.overflow = cc.Label.Overflow.RESIZE_HEIGHT;
        label.enableWrapText = true;
        node.width = 720;
        var outline = node.addComponent(cc.LabelOutline);
        outline.color = cc.Color.BLACK;
        outline.width = 3;
        this._completionReward = label;
      }
      this._completionReward.node.y = -button.height / 2 - 28;
      this._completionReward.node.active = !!next;
      if (next) this._completionReward.string = language.t("format.battle.waveCompletionSilver", [next.StartSliver]);
    } else {
      if (this._completionReward) this._completionReward.node.active = false;
      if (fitter) fitter.invalidate();
    }
  };
  _ctor.prototype.onPauseGame = function (t, owner) {
    var e = this;
    if (!this._pauseOwners) this._pauseOwners = new Set();
    if (owner) {
      if (t) this._pauseOwners.add(owner);
      else this._pauseOwners.delete(owner);
    } else this._legacyGamePause = !!t;
    t = !!this._legacyGamePause || this._pauseOwners.size > 0;
    if (t) { TestMode.getInstance().clearGameplayInput(true); this._stopTestMovement(); }
    this.isPauset = t;
    this.scheduleOnce(function () {
      if (e.isPauset !== t) return;
      if (t) {
        e.ctrGame.onPauseGame();
        e.sendEvent($z1KinghtFallConfig.KinghtFallEventName.PlayVideoSucc, false);
      } else {
        e.ctrGame.onResumeGame();
      }
    });
  };
  _ctor.prototype.onGameOver = function (t) {
    var e = this, dialog = this.beginBattleDialog('end');
    if (!dialog) return;
    this.ctrGame.gameStatus = $z1KinghtFallModle.KinghtFallGameStage.End;
    this.ctrGame.moveFun(null);
    this.ctrGame.onPauseGame();
    this.canBreak = false;
    this.ctrUI.setRevive(0);
    this.scheduleOnce(function () {
      if (!dialog.isCurrent()) return;
      if (t) {
        e.openBattleDialog(dialog, $z1KinghtFallConfig.KinghtFallUIID.UIGameEnd, null, t);
      } else {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.fail_X_Y, e.ctrGame.gameData.levelCfg.Level + "_" + e.ctrGame.gameData.round);
        e.openBattleDialog(dialog, $z1KinghtFallConfig.KinghtFallUIID.UIGameBack, null, function (n) {
          if (!dialog.isCurrent() || dialog.decided) return;
          dialog.decided = true;
          if (n) {
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.game_revive);
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_game_revive_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
            e.ctrGame.gameData.coin += n;
            $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addAchNum($z1KinghtFallEnum.KinghtFallEnumAchiEnum.GetSliver, n);
            e.onRestart(false);
          } else {
            e.openBattleDialog(dialog, $z1KinghtFallConfig.KinghtFallUIID.UIGameEnd, null, t);
          }
        });
      }
    }, 1);
  };
  _ctor.prototype.onReviveShow = function (t) {
    this.ctrGame.gameStatus != $z1KinghtFallModle.KinghtFallGameStage.End && this.ctrUI.setRevive(t);
  };
  _ctor.prototype.moveFun = function (t) {
    this.ctrGame.gameStatus != $z1KinghtFallModle.KinghtFallGameStage.End && this.ctrGame.moveFun(t);
  };
  _ctor.prototype.startRoundGame = function () {
    var t = this;
    if (this._enemyGuide) require("EnemyGuide").close(this);
    var nightStrength = $z1KinghtFallConfig.KinghtFallParameter.BattleNightStrength;
    this.btnBuildInfo.active = false;
    this.btnStartFight.active = false;
    this.btnAddCoin.active = false;
    this.ctrUI.ndLight.active = true;
    this.isGet = false;
    this.ctrGame.gameStatus = $z1KinghtFallModle.KinghtFallGameStage.Transition;
    if (this._enemyGuideMarkersBound) require("EnemyGuide").update(this);
    $z1AudioMgr.AudioMgr.getInstance().playMusic($z1KinghtFallConfig.KinghtFallAudioId.fight_bgm, $z1KinghtFallConfig.KinghtFallParameter.BGMusic);
    cc.tween(this.ctrUI.ndLight).set({
      opacity: 0
    }).to(.5, {
      opacity: Math.round(255 * nightStrength)
    }, {
      onUpdate: function (e, n) {
        var i = Math.round(255 - 99 * nightStrength * n);
        t.ctrGame.ndBg.children.forEach(function (t) {
          t.color = new cc.Color(i, i, i);
        });
        t.ctrGame.gameData.obstacles.forEach(function (t) {
          t.node.color = new cc.Color(i, i, i);
        });
      }
    }).call(function () {
      t.ctrGame.gameStatus = $z1KinghtFallModle.KinghtFallGameStage.Fight;
      t.initView();
    }).start();
    this.ctrGame.ctrPlay.ndRange.active = true;
    this.ctrGame.gameData.getBulidList().forEach(function (t) {
      t.buildInfo && t.startRoundGame();
    });
    this.ctrGame.gameData.startRoundGame();
  };
  _ctor.prototype.endRoundGame = function () {
    if (this.ctrGame.gameStatus === $z1KinghtFallModle.KinghtFallGameStage.End) return;
    var t = this;
    var dialog = this.beginBattleDialog('perk');
    if (!dialog) return;
    var nightStrength = $z1KinghtFallConfig.KinghtFallParameter.BattleNightStrength;
    this.btnBuildInfo.active = true;
    this.canBreak = false;
    this.playPlanningMusic();
    this.ctrGame.gameStatus = $z1KinghtFallModle.KinghtFallGameStage.Transition;
    this.scheduleOnce(function () {
      if (!dialog.isCurrent()) return;
      t.ctrGame.gameStatus = $z1KinghtFallModle.KinghtFallGameStage.Prepare;
      dialog.paused = true;
      t.onPauseGame(true, dialog);
      t.ctrGame.ctrPlay.endRoundGame();
      t.openBattleDialog(dialog, $z1KinghtFallConfig.KinghtFallUIID.UIBuff, function () {
        t.ctrGame.ctrPlay.ndRange.active = false;
        t.ctrGame.gameData.setLight(false);
        cc.tween(t.ctrUI.ndLight).set({
          opacity: Math.round(255 * nightStrength)
        }).to(.5, {
          opacity: 0
        }, {
          onUpdate: function (e, n) {
            var i = Math.round(255 - 99 * nightStrength * (1 - n));
            t.ctrGame.ndBg.children.forEach(function (t) {
              t.color = new cc.Color(i, i, i);
            });
            t.ctrGame.gameData.obstacles.forEach(function (t) {
              t.node.color = new cc.Color(i, i, i);
            });
          }
        }).call(function () {
          t.ctrUI.ndLight.active = false;
        }).start();
      }, function (e) {
        if (!dialog.isCurrent()) return;
        t.finishBattleDialog(dialog);
        t.canBreak = true;
        t.ctrGame.ctrPlay.ctrPlayAni.setLevelUp();
        for (var n = 0; n < e.length; n++) {
          var i = e[n];
          t.ctrGame.gameData.addGameBuff(i);
        }
        t.ctrGame.endRoundGame();
        var a = 0;
        a += t.ctrGame.gameData.addTime[$z1KinghtFallGameCtrlData.KinghtFallTimeType.KillSoldier2];
        var o = t.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff04);
        o && (a += o.Pamer[0]);
        if (a > 0) {
          t.ctrGame.gameData.coin += a;
          $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addAchNum($z1KinghtFallEnum.KinghtFallEnumAchiEnum.GetSliver, a);
        }
        t.initView();
        t.ctrGame.gameData.upMap();
        t.initBtnView();
        t.ctrGame.saveGame();
      });
    }, 1);
  };
  _ctor.prototype.initView = function () {
    var t;
    if (this.ctrGame.gameStatus == $z1KinghtFallModle.KinghtFallGameStage.Fight) {
      var e = this.ctrGame.gameData.getBulidList();
      var n = (null === (t = this.ctrGame.gameData.levelCfg.WaveCfg[this.ctrGame.gameData.round]) || undefined === t ? undefined : t.StartSliver) || 0;
      for (var i = 0; i < e.length; i++) {
        var a = e[i];
        switch (a.buildCfg.enumValue) {
          case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Mill:
            a.getIsWork() && (n += a.getGetCoin());
            break;
          case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.PrivateHouse:
            a.getIsWork() && (n += a.getGetCoin());
        }
      }
      this.ndCoin.getChildByName("labNum").getComponent(cc.Label).string = this.ctrGame.gameData.coin + "(+" + n + ")";
    } else {
      this.ndCoin.getChildByName("labNum").getComponent(cc.Label).string = "" + this.ctrGame.gameData.coin;
    }
    this.ndLevelInfo.getChildByName("labName").getComponent(cc.Label).string = this.T(this.ctrGame.gameData.levelCfg.Name);
    this.ndLevelInfo.getChildByName("labOrder").getComponent(cc.Label).string = $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeBattle02), this.ctrGame.gameData.round + "/" + this.ctrGame.gameData.levelCfg.WaveCfg.length);
    if (this.ctrGame.gameData.taskInfo.index >= this.ctrGame.gameData.taskInfo.list.length) {
      this.ndTask.active = false;
    } else {
      var o = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGameTaskEnem(this.ctrGame.gameData.taskInfo.list[this.ctrGame.gameData.taskInfo.index]);
      if (!this._battleHud) this.ndTask.active = true;
      this.ndTask.getChildByName("labName").getComponent(cc.Label).string = this.T(o.Name);
      this.ndTask.getChildByName("labGet").active = 1 == this.ctrGame.gameData.taskInfo.stage;
      this.ndTask.getChildByName("labNoFinish").active = 0 == this.ctrGame.gameData.taskInfo.stage;
    }
    if (this._battleHud) require("BattleHud").updateTasks(this,
      this.ctrGame.gameData.taskInfo.index < this.ctrGame.gameData.taskInfo.list.length, this.ctrGame.gameData.taskInfo.stage === 1);
  };
  _ctor.prototype.lateUpdate = function (t) {
    if (this._enemyGuide || this._enemyGuideMarkersBound) require("EnemyGuide").update(this);
    this.isPauset || this.ctrGame.onLateUpdate(t);
    this._fitBuildingsButton();
    if (this._battleHud) require("BattleHud").layout(this);
    this._layoutBattleFooter();
  };
  _ctor.prototype._layoutBattleFooter = function () {
    var control = this.ctrUI, root = control && control.node, rod = control && control.ndRod;
    if (!root || !rod || !this.btnStartFight || !cc.view) return;
    var visible = cc.view.getVisibleSize(), origin = cc.view.getVisibleOrigin();
    var safe = cc.sys.getSafeAreaRect ? cc.sys.getSafeAreaRect() : { x: origin.x, y: origin.y, width: visible.width, height: visible.height };
    var a = root.convertToNodeSpaceAR(cc.v2(safe.x, safe.y));
    var b = root.convertToNodeSpaceAR(cc.v2(safe.x + safe.width, safe.y + safe.height));
    var left = Math.min(a.x, b.x), right = Math.max(a.x, b.x), bottom = Math.min(a.y, b.y), center = (left + right) / 2;
    var margin = 18, gap = 18, button = this.btnStartFight, reward = this._completionReward && this._completionReward.node;
    function shown(node) { return node && node.active !== false && node.activeInHierarchy !== false; }
    function box(node, caption) {
      var sx = Math.abs(node.scaleX), sy = Math.abs(node.scaleY);
      var bounds = { minX: -node.anchorX * node.width * sx, maxX: (1 - node.anchorX) * node.width * sx,
        minY: -node.anchorY * node.height * sy, maxY: (1 - node.anchorY) * node.height * sy };
      if (shown(caption)) {
        var w = caption.width * Math.abs(caption.scaleX) * sx, h = caption.height * Math.abs(caption.scaleY) * sy;
        bounds.minX = Math.min(bounds.minX, caption.x * sx - caption.anchorX * w);
        bounds.maxX = Math.max(bounds.maxX, caption.x * sx + (1 - caption.anchorX) * w);
        bounds.minY = Math.min(bounds.minY, caption.y * sy - caption.anchorY * h);
        bounds.maxY = Math.max(bounds.maxY, caption.y * sy + (1 - caption.anchorY) * h);
      }
      return bounds;
    }
    var startBox = box(button, reward), rally = this.btnAgg, follow = this.btnFollow;
    var rallyBox = rally && box(rally, rally.getChildByName("labNum"));
    var followBox = follow && box(follow, follow.getChildByName("labNum"));
    var coin = this.btnAddCoin, coinBox = coin && box(coin);
    var signature = [left, right, bottom, shown(button), shown(coin), JSON.stringify(startBox), JSON.stringify(rallyBox), JSON.stringify(followBox),
      JSON.stringify(coinBox), rod.width, rod.height, rod.scaleX, rod.scaleY].join(":");
    if (signature === this._battleFooterSignature) return;
    this._battleFooterSignature = signature;
    if (coin && !this._footerCoinOffset) this._footerCoinOffset = { x: coin.x - button.x, y: coin.y - button.y };
    button.setPosition(center, bottom + margin - startBox.minY);
    if (coin && this._footerCoinOffset) coin.setPosition(button.x + this._footerCoinOffset.x, button.y + this._footerCoinOffset.y);
    if (rally) rally.setPosition(right - margin - rallyBox.maxX, bottom + margin - rallyBox.minY);
    if (follow) follow.setPosition(right - margin - followBox.maxX,
      rally ? rally.y + rallyBox.maxY + gap - followBox.minY : bottom + margin - followBox.minY);
    var restX = left + (right - left) / 4;
    restX = Math.max(left + margin + rod.width * Math.abs(rod.scaleX) / 2, restX);
    var restY = bottom + 180 + rod.height * Math.abs(rod.scaleY) / 2;
    if (shown(button)) {
      var top = button.y + startBox.maxY;
      if (shown(coin) && restX + rod.width * Math.abs(rod.scaleX) / 2 > coin.x + coinBox.minX) top = Math.max(top, coin.y + coinBox.maxY);
      restY = Math.max(restY, top + gap + rod.height * Math.abs(rod.scaleY) / 2);
    }
    var point = cc.v2(restX, restY);
    if (rod.parent !== root) point = rod.parent.convertToNodeSpaceAR(root.convertToWorldSpaceAR(point));
    control.setJoystickRest(point);
  };
  _ctor.prototype._bindEnemyGuide = function (record) {
    require("EnemyGuide").bind(this, record);
  };
  _ctor.prototype._loadEnemyPictogram = function (record, id) {
    var manager = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
    var cfg = manager.getSoldierCfgById(id), type = resolveEnemyPictogram(manager.data && manager.data.GameTools, id);
    if (cfg.loadIcon && cfg.loadIcon.indexOf("@icon/") === 0) type = { icon: cfg.loadIcon, tint: type && type.tint || "#ffffff" };
    var icon = record.ndItem.getChildByName("sprIcon");
    if (!icon) return;
    var sprite = icon.getComponent(cc.Sprite), request = record._iconRequest = (record._iconRequest || 0) + 1;
    if (!record._iconBox) record._iconBox = { width: icon.width, height: icon.height };
    function done(frame, custom) {
      if (!frame || record._iconRequest !== request || record.id !== id || !cc.isValid(record.ndItem)) return;
      if (cc.Sprite.SizeMode) sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
      var box = record._iconBox, rect = frame.getOriginalSize && frame.getOriginalSize();
      var ratio = custom && rect && rect.width && rect.height ? Math.min(box.width / rect.width, box.height / rect.height) : 0;
      icon.width = ratio ? rect.width * ratio : box.width;
      icon.height = ratio ? rect.height * ratio : box.height;
      if (cc.color) icon.color = cc.color(custom && type.tint || "#ffffff");
    }
    var self = this;
    function original() { self.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.Enemy, "icon/" + cfg.loadIcon, function (frame) { done(frame, false); }); }
    if (!type || !type.icon) return original();
    if (type.icon.indexOf("@icon/") === 0 && cc.resources) {
      // Use the same guarded/retrying loader as the other battle artwork. An
      // imported head has no legacy `icon/@icon/...` fallback asset.
      if (cfg.loadIcon && cfg.loadIcon.indexOf("@icon/") === 0) this.loadSpriteFrame("resources", type.icon.slice(6), function (frame) { done(frame, true); });
      else cc.resources.load(type.icon.slice(6), cc.SpriteFrame, function (error, frame) { if (record._iconRequest !== request) return; if (error || !frame) original(); else done(frame, true); });
    } else this.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.Enemy, "icon/" + type.icon, function (frame) { if (frame) done(frame, true); else original(); });
  };
  _ctor.prototype._enemyIndicatorObstacles = function () {
    var ui = this.ctrUI.node;
    var drawer = this._battleHud;
    return [this.btnBuildInfo, drawer ? drawer.handle : this.ndTask, drawer && drawer.open ? drawer.view : null, this.btnSuspend, this.ndCoin, this.ndLevelInfo,
      this.btnStartFight, this.btnAddCoin, this.btnAgg, this.btnFollow].filter(function (node) {
      return node && cc.isValid(node) && node.active && node.activeInHierarchy !== false;
    }).map(function (node) { return enemyIndicatorBounds(node, ui); });
  };
  _ctor.prototype._fitBuildingsButton = function () {
    if (this._battleHud) return;
    var button = this.btnBuildInfo;
    if (!button || !button.parent || !button.active) return;
    var caption = button.getChildByName("labNum"), label = caption && caption.getComponent(cc.Label);
    if (!caption || !label) return;
    var visible = cc.view.getVisibleSize(), origin = cc.view.getVisibleOrigin();
    var safe = cc.sys.getSafeAreaRect ? cc.sys.getSafeAreaRect() : { x: origin.x, y: origin.y, width: visible.width, height: visible.height };
    var signature = [safe.x, safe.y, safe.width, safe.height, button.parent.width, button.parent.height,
      button.scaleX, button.scaleY, caption.width, caption.height, label.string, label.fontSize].join(":");
    if (signature === this._buildCaptionBoundsSignature) return;
    if (this._buildInfoBaseX === undefined) this._buildInfoBaseX = button.x;
    if (label._forceUpdateRenderData) label._forceUpdateRenderData();
    button.x = this._buildInfoBaseX;
    var parent = button.parent, left = parent.convertToNodeSpaceAR(cc.v2(safe.x, safe.y));
    var right = parent.convertToNodeSpaceAR(cc.v2(safe.x + safe.width, safe.y + safe.height));
    var rect = enemyIndicatorBounds(button, parent), padding = 12;
    var low = Math.min(left.x, right.x) + padding - (rect.minX - button.x);
    var high = Math.max(left.x, right.x) - padding - (rect.maxX - button.x);
    button.x = low <= high ? Math.max(low, Math.min(high, this._buildInfoBaseX)) : (low + high) / 2;
    this._buildCaptionBoundsSignature = signature;
  };
  _ctor.prototype._placeEnemyIndicator = function (node, target, obstacles, viewport, placementTarget, gap) {
    var ui = this.ctrUI.node, arrow = node.getChildByName("ndArr");
    var origin = ui.convertToNodeSpaceAR(node.convertToWorldSpaceAR(cc.v2(0, 0)));
    var footprint = enemyIndicatorBounds(node, ui, arrow);
    if (arrow) {
      // Reserve every arrow rotation, including when it was hidden last frame.
      var center = ui.convertToNodeSpaceAR(arrow.convertToWorldSpaceAR(cc.v2(0, 0)));
      var ax = ui.convertToNodeSpaceAR(arrow.convertToWorldSpaceAR(cc.v2(1, 0)));
      var ay = ui.convertToNodeSpaceAR(arrow.convertToWorldSpaceAR(cc.v2(0, 1)));
      var sx = Math.hypot(ax.x - center.x, ax.y - center.y), sy = Math.hypot(ay.x - center.x, ay.y - center.y);
      var radius = Math.hypot(arrow.width * Math.max(arrow.anchorX, 1 - arrow.anchorX) * sx, arrow.height * Math.max(arrow.anchorY, 1 - arrow.anchorY) * sy);
      footprint.minX = Math.min(footprint.minX, center.x - radius); footprint.maxX = Math.max(footprint.maxX, center.x + radius);
      footprint.minY = Math.min(footprint.minY, center.y - radius); footprint.maxY = Math.max(footprint.maxY, center.y + radius);
    }
    footprint.minX -= origin.x; footprint.maxX -= origin.x; footprint.minY -= origin.y; footprint.maxY -= origin.y;
    var bounds = { minX: -246, maxX: 246, minY: -442, maxY: 442 };
    if (viewport) bounds = { minX: viewport.minX - footprint.minX + 16, maxX: viewport.maxX - footprint.maxX - 16,
      minY: viewport.minY - footprint.minY + 16, maxY: viewport.maxY - footprint.maxY - 16 };
    var position = placeEnemyIndicator(placementTarget || target, footprint, bounds, obstacles, gap === undefined ? 12 : gap);
    node.setPosition(position.x, position.y);
    obstacles.push({ minX: position.x + footprint.minX, maxX: position.x + footprint.maxX,
      minY: position.y + footprint.minY, maxY: position.y + footprint.maxY });
    if (arrow) {
      var dx = target.x - position.x, dy = target.y - position.y;
      arrow.active = dx * dx + dy * dy > 0.001;
      if (arrow.active) arrow.angle = 180 * Math.atan2(dy, dx) / Math.PI - 90;
    }
  };
  _ctor.prototype._placeUpcomingEnemyIndicators = function (markers, obstacles) {
    var ui = this.ctrUI.node, width = ui.width || 750, height = ui.height || 1334, self = this;
    var viewport = { minX: -width / 2, maxX: width / 2, minY: -height / 2, maxY: height / 2 }, groups = {};
    markers.forEach(function (marker) {
      var node = marker.record.ndItem, target = marker.target;
      if (!node._compactUpcoming) {
        node._compactUpcoming = true;
        var sprite = node.getComponent(cc.Sprite);
        if (sprite && cc.Sprite.SizeMode) sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        node.setContentSize(112, 112);
        node.getChildByName("ndArr").setContentSize(112, 112);
      }
      var x = target.x / width, y = target.y / height;
      var side = Math.abs(x) >= Math.abs(y) ? (x < 0 ? "left" : "right") : (y < 0 ? "bottom" : "top");
      var group = groups[side] || (groups[side] = { items: [], x: 0, y: 0 });
      group.items.push(marker); group.x += target.x; group.y += target.y;
    });
    Object.keys(groups).forEach(function (side) {
      var group = groups[side], anchor = { x: group.x / group.items.length, y: group.y / group.items.length };
      if (side === "left" || side === "right") anchor.x = side === "left" ? viewport.minX : viewport.maxX;
      else anchor.y = side === "bottom" ? viewport.minY : viewport.maxY;
      // Pack one compact cluster per incoming side. Arrows still point to each
      // actual spawn, and individual portraits/counts and planning clicks remain.
      group.items.forEach(function (marker) { self._placeEnemyIndicator(marker.record.ndItem, marker.target, obstacles, viewport, anchor, 6); });
    });
  };
  _ctor.prototype._updateOffscreenEnemies = function (obstacles) {
    var game = this.ctrGame, ui = this.ctrUI.node, camera = game.camera || cc.Camera.main;
    if (!camera || !game.gameData.getEnemyList) return;
    var size = cc.view.getVisibleSize(), origin = cc.view.getVisibleOrigin();
    var a = ui.convertToNodeSpaceAR(cc.v2(origin.x, origin.y));
    var b = ui.convertToNodeSpaceAR(cc.v2(origin.x + size.width, origin.y + size.height));
    var viewport = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) };
    var center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, groups = {}, self = this;
    // At the 750-unit design width, ignore enemies up to 150 units beyond the
    // edge when a visible enemy is within 225 units. Measure after projection
    // so zoom and aspect ratio follow the area the player can actually see.
    var shortSide = Math.min(viewport.maxX - viewport.minX, viewport.maxY - viewport.minY);
    var edgeRange = shortSide * .2, nearbyRange = shortSide * .3, buffer = shortSide * .04;
    var cellSize = nearbyRange + buffer, visible = {}, candidates = [];
    var suppressed = this._nearbyEnemyIndicators || (this._nearbyEnemyIndicators = new WeakMap());
    game.gameData.getEnemyList().forEach(function (enemy) {
      if (enemy._isPooled || !cc.isValid(enemy.node, true) || !enemy.node.activeInHierarchy || enemy.isDead()) { suppressed.delete(enemy.node); return; }
      var screen = camera.getWorldToScreenPoint(enemy.node.convertToWorldSpaceAR(cc.v2(0, 0)));
      var target = ui.convertToNodeSpaceAR(screen);
      if (target.x >= viewport.minX && target.x <= viewport.maxX && target.y >= viewport.minY && target.y <= viewport.maxY) {
        var key = Math.floor(target.x / cellSize) + ":" + Math.floor(target.y / cellSize);
        (visible[key] || (visible[key] = [])).push(target);
        suppressed.delete(enemy.node);
      } else candidates.push({ enemy: enemy, target: target });
    });
    candidates.forEach(function (candidate) {
      var enemy = candidate.enemy, target = candidate.target, extra = suppressed.has(enemy.node) ? buffer : 0;
      var outsideX = Math.max(viewport.minX - target.x, 0, target.x - viewport.maxX);
      var outsideY = Math.max(viewport.minY - target.y, 0, target.y - viewport.maxY);
      var nearby = false, radius = nearbyRange + extra;
      if (outsideX * outsideX + outsideY * outsideY <= (edgeRange + extra) * (edgeRange + extra)) {
        // Only visible enemies provide context; never hide a whole offscreen
        // chain. Buckets avoid comparing every pair in a large battle.
        var cellX = Math.floor(target.x / cellSize), cellY = Math.floor(target.y / cellSize);
        for (var x = cellX - 1; x <= cellX + 1 && !nearby; x++) {
          for (var y = cellY - 1; y <= cellY + 1 && !nearby; y++) {
            var neighbors = visible[x + ":" + y] || [];
            nearby = neighbors.some(function (point) {
              var dx = target.x - point.x, dy = target.y - point.y;
              return dx * dx + dy * dy <= radius * radius;
            });
          }
        }
      }
      if (nearby) { suppressed.set(enemy.node, true); return; }
      suppressed.delete(enemy.node);
      var dx = target.x - center.x, dy = target.y - center.y;
      var sector = Math.floor((Math.atan2(dy, dx) + Math.PI + Math.PI / 8) / (Math.PI / 4)) % 8;
      var group = groups[sector] || (groups[sector] = { ids: [], count: 0, x: 0, y: 0, nearest: Infinity });
      if (group.ids.indexOf(enemy.cfg.ID) < 0) group.ids.push(enemy.cfg.ID);
      group.count++; group.x += target.x; group.y += target.y;
      var distance = dx * dx + dy * dy;
      if (distance < group.nearest) { group.nearest = distance; group.id = enemy.cfg.ID; }
    });
    // Eight directional groups bound HUD work even for large waves. Counts
    // include only enemies that still need an offscreen alert.
    Object.keys(groups).forEach(function (sector) {
      var group = groups[sector], key = "live:" + sector, record = self.enemyIconInfo[key];
      if (!record) {
        record = self.enemyIconInfo[key] = { id: 0, ndItem: cc.instantiate(self.ndEnemyIcon), tag: false };
        record.ndItem.setParent(ui); record.ndItem.zIndex = 100;
      }
      if (record.id !== group.id) {
        record.id = group.id;
        var config = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById(group.id), id = group.id;
        self._loadEnemyPictogram(record, id);
      }
      record._guideLive = true; record._guideIds = group.ids;
      record.ndItem.getChildByName("labName").active = false;
      var count = record.ndItem.getChildByName("labNum").getComponent(cc.Label);
      if (record.count !== group.count) {
        record.count = group.count;
        count.string = "" + group.count;
        count.enableWrapText = false; count.overflow = cc.Label.Overflow.NONE;
        count._forceUpdateRenderData();
        record.ndItem.getChildByName("wg_zd_drsl").width = Math.max(38, count.node.width * Math.abs(count.node.scaleX) + 10);
      }
      self._placeEnemyIndicator(record.ndItem, { x: group.x / group.count, y: group.y / group.count }, obstacles, viewport);
      record.tag = true;
    });
  };
  _ctor.prototype._stopTestMovement = function () {
    if (this._testKeyboardMoving && this.ctrGame) this.ctrGame.moveFun(null);
    this._testKeyboardMoving = false;
    if (this.ctrUI && this.ctrUI.setKeyboardMoving) this.ctrUI.setKeyboardMoving(false);
  };
  _ctor.prototype._updateTestControls = function () {
    var mode = TestMode.getInstance(), input = mode.readGameplayInput(this);
    if (this._enemyGuide) {
      if (input && input.pause) require("EnemyGuide").close(this);
      this._stopTestMovement(); mode.clearGameplayInput(true); return;
    }
    if (!input || !this.ctrGame || !this.ctrGame.ctrPlay ||
        this.ctrGame.gameStatus === $z1KinghtFallModle.KinghtFallGameStage.End) {
      this._stopTestMovement(); return;
    }
    var manager = $z1UIMgr.UIMgr.getInstance(), pause = null, blocked = !!manager.isopening, guide = false;
    var self = this, layers = $z1Appcfg.OrderLayer;
    manager.uistatck.forEach(function (ui, id) {
      if (ui === self || !ui.node || !ui.node.active || !ui.node.activeInHierarchy || ui.isclose) return;
      if (id === $z1KinghtFallConfig.KinghtFallUIID.UISuspend) { pause = ui; return; }
      if (id === $z1Config.UIID.UITouch) {
        if (ui.ndMask && ui.ndMask.active || ui.ndAd && ui.ndAd.active) blocked = true;
      } else if (ui.layer === layers.guide && !self.isPauset) {
        guide = true; // Movement/build tutorials deliberately keep gameplay running.
      } else if (ui.layer === layers.pop || ui.layer === layers.pop2 || ui.layer === layers.guide || ui.layer === layers.Log) blocked = true;
    });
    if (input.pause && !blocked && !guide) {
      this._stopTestMovement();
      if (pause) pause.resumeGame();
      else if (!this.isPauset && this.canBreak) this.openPause();
      return;
    }
    if (blocked || pause || this.isPauset || this.ctrGame.ctrPlay.isDead()) {
      this._stopTestMovement(); mode.clearGameplayInput(true); return;
    }
    if (input.follow && this.btnFollow && this.btnFollow.active && this.btnFollow.activeInHierarchy) this.followCommand();
    if (input.rally && this.btnAgg.active && this.btnAgg.activeInHierarchy) this.rallyCommand();
    if (input.build) this.ctrGame.testInstantBuild();
    if (this.isPauset) { this._stopTestMovement(); return; }
    if (input.x || input.y) {
      if (this.ctrUI && this.ctrUI.setKeyboardMoving) this.ctrUI.setKeyboardMoving(true);
      this.moveFun(cc.v2(input.x, input.y)); this._testKeyboardMoving = true;
    } else this._stopTestMovement();
  };
  _ctor.prototype.update = function (t) {
    this._updateTestControls();
    if (!this.isPauset) {
      t = Math.min(t, .1);
      this.ctrUI.upGuide();
      this.ctrGame.onUpdate(t * this.speed);
      for (var e in this.enemyIconInfo) {
        Object.prototype.hasOwnProperty.call(this.enemyIconInfo, e) && ((o = this.enemyIconInfo[e]).tag = false);
      }
      var n = this.ctrGame.gameData.enemyQueue, upcomingMarkers = [];
      var indicatorObstacles = this._enemyIndicatorObstacles();
      if (this.ctrGame.gameData.baseBuild.getLevel() >= 1) {
        var i = function (t) {
          if (Object.prototype.hasOwnProperty.call(n, t)) {
            var e = n[t];
            if (!a.enemyIconInfo[t]) {
              a.enemyIconInfo[t] = {
                id: 0,
                tagNode: a.ctrGame.ndPath.getChildByName("ndEnemy" + t),
                ndItem: cc.instantiate(a.ndEnemyIcon),
                tag: true
              };
              a.enemyIconInfo[t].ndItem.setParent(a.ctrUI.node);
              a.enemyIconInfo[t].ndItem.setSiblingIndex(0);
            }
            var i = a.enemyIconInfo[t];
            if (e[0]) {
              var o = e[0];
              -1 == o.id && (o = e[1]);
              if (!o || -1 == o.id) {
                i.tag = false;
              } else {
                if (i.id != o.id) {
                  i.id = o.id;
                  var r = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById(o.id);
                  a._loadEnemyPictogram(i, o.id);
                }
                i.ndItem.getChildByName("labNum").getComponent(cc.Label).string = "" + o.num;
                i._guideLive = false;
                i._guideIds = e.filter(function (entry) { return entry.id !== -1 && entry.num > 0; }).map(function (entry) { return entry.id; });
                if (a._bindEnemyGuide) a._bindEnemyGuide(i);
                var s = a.ctrGame.ndPath.convertToWorldSpaceAR(i.tagNode.getPosition());
                var l = cc.Camera.main.getWorldToScreenPoint(s);
                var c = a.ctrUI.node.convertToNodeSpaceAR(l);
                upcomingMarkers.push({ record: i, target: c });
                i.tag = true;
              }
            }
          }
        };
        var a = this;
        for (var e in n) {
          i(e);
        }
      }
      this._placeUpcomingEnemyIndicators(upcomingMarkers, indicatorObstacles);
      this._updateOffscreenEnemies(indicatorObstacles);
      for (var e in this.enemyIconInfo) {
        var o;
        Object.prototype.hasOwnProperty.call(this.enemyIconInfo, e) && ((o = this.enemyIconInfo[e]).ndItem.active = o.tag);
      }
    }
  };
  _ctor.prototype.onCloseUI = function (t) {
    var e = this;
    if (t == $z1Config.UIID.UIGuide) {
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.PlayVideoSucc, false);
      var n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getGroupId();
      var i = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getStepId();
      var a = [2];
      var o = [2];
      for (var r = 0; r < a.length; r++) {
        if (n == a[r] && i == o[r]) {
          return;
        }
      }
      this.scheduleOnce(function () {
        e.startGuide();
      });
    }
  };
  _ctor.prototype.startGuide = function (t) {
    if (this._battleHud) require("BattleHud").layout(this);
    var e = this;
    if ($z1PlatformSetting.PlatformSetting.currentPlatform != $z1BasePlatform.Platform.WEB_LINK) {
      if (t) {
        if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getGuideTips(t)) {
          return;
        }
        var i = new $z1UIGuide.GuildCfg();
        var a = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGuideCfgById(t)[0];
        i.isWeek = !!a.Close;
        i.showHand = a.Finger;
        i.hideMask = !a.Mask;
        i.tipstring = a.Describe;
        i.showAni = !!a.ShowKing;
        i.deviationTipsAll = cc.v2(0, a.Offset || 0);
        11 == t && (i.distNode = this.btnAgg);
        switch (t) {
          case 7:
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide12);
            break;
          case 8:
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide10);
            break;
          case 9:
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide11);
            break;
          case 10:
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide13);
            break;
          case 11:
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide14);
        }
        this.openUICallBack($z1Config.UIID.UIGuide, function () {
          $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().setGuideTips(t);
        }, i);
      }
      var o = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getGroupId();
      var s = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGuideCfgById(o);
      if (!(s.length <= 0)) {
        var h;
        var g = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getStepId();
        var u = s[g];
        switch (o) {
          case 2:
            this.isPauset = true;
            (h = new $z1UIGuide.GuildCfg()).isWeek = !!u.Close;
            h.showHand = u.Finger;
            h.hideMask = !u.Mask;
            h.tipstring = u.Describe;
            h.showAni = !!u.ShowKing;
            switch (g) {
              case 0:
                h.distNode = this.ndCoin;
                h.addSize = new cc.Size(40, 0);
                h.deviationTipsAll = cc.v2(0, u.Offset || 0);
                h.lightType = 1;
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide4);
                break;
              case 1:
                h.distNode = this.ctrGame.gameData.baseBuild.ndLockList[this.ctrGame.gameData.baseBuild.getLevel()];
                h.distCamera = this.ctrGame.camera;
                h.deviationTipsAll = cc.v2(0, u.Offset || 0);
                h.callBack = function () {
                  n.instance.ctrUI.setGuide(e.ctrGame.gameData.baseBuild.ndLockList[e.ctrGame.gameData.baseBuild.getLevel()]);
                };
                this.isPauset = false;
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide5);
                break;
              case 2:
                for (var d in this.enemyIconInfo) {
                  if (Object.prototype.hasOwnProperty.call(this.enemyIconInfo, d)) {
                    var v = this.enemyIconInfo[d];
                    if (v.ndItem && v.ndItem.active) {
                      h.distNode = v.ndItem;
                      break;
                    }
                  }
                }
                h.deviationTipsAll = cc.v2(0, u.Offset || 0);
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide7);
                break;
              case 3:
                h.lightType = 1;
                h.distNode = this.btnStartFight;
                h.deviationTipsAll = cc.v2(0, u.Offset || 0);
                this.isPauset = false;
            }
        }
        if (h) {
          this.openUICallBack($z1Config.UIID.UIGuide, function () {
            if (s[g + 1]) {
              $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().setStepId(g + 1);
            } else {
              $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().setGroupId(o + 1);
              $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().setStepId(0);
            }
          }, h);
        } else {
          this.sendEvent($z1Appcfg.BaseEventName.blocktouch, true);
        }
      }
    }
  };
  _ctor.prototype.aniBtnAddCoin = function () {
    if (!this.isGet) {
      var t = this.btnAddCoin.getComponent(cc.Animation);
      t.play(t.defaultClip.name);
    }
  };
  _ctor.prototype.getTask = function () {
    if (1 == this.ctrGame.gameData.taskInfo.stage) {
      var t = this.ctrGame.gameData.taskInfo.reward[this.ctrGame.gameData.taskInfo.index];
      var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
      var checkpoint = this.ctrGame.getCheckpoint();
      var taskIndex = checkpoint.taskList.index;
      checkpoint.taskList.index++;
      checkpoint.taskList.stage = 0;
      if (t.id !== $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.SilverCoin) {
        var granted = player.claimRewards([t], this.ctrGame.gameData.levelCfg.InGameCoefficient, null, function () {
          return player.getGameData().setCheckpoint(checkpoint);
        }, function () {
          var saved = player.getGameData().data;
          return saved.levelNum === checkpoint.levelNum && saved.taskList && saved.taskList.index === taskIndex && saved.taskList.stage === 1;
        });
        var committedTask = player.getGameData().getTaskInfo();
        // A durable journal may still be retrying individual target writes. Its
        // installed checkpoint is authoritative and must not leave this task claimable.
        if (!granted && !(committedTask && committedTask.index === taskIndex + 1 && committedTask.stage === 0)) return;
      }
      switch (t.id) {
        case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.SilverCoin:
          this.ctrGame.gameData.coin += t.num;
          var e = this.ndCoin;
          var n = cc.v2(e.position.x + e.children[0].x, e.position.y + e.children[0].y);
          var i = this.ndTask.convertToWorldSpaceAR(cc.v2(0, 0));
          var a = this.ctrUI.node.convertToNodeSpaceAR(i);
          var o = function () {
            var t = cc.instantiate(e.children[0]);
            t.active = true;
            t.scale = .5;
            t.setParent(r.ctrUI.node);
            var i = cc.v2();
            cc.Vec2.random(i, 40);
            cc.tween(t).set({
              position: cc.v3(a.x, a.y, 0)
            }).by(.2, {
              position: cc.v3(i.x, i.y, 0)
            }).to(1, {
              position: cc.v3(n.x, n.y, 0),
              scale: 1
            }).call(function () {
              t.destroy();
            }).start();
          };
          var r = this;
          for (var s = 0; s < 10; s++) {
            o();
          }
          break;
      }
      var l = this._battleHud ? this._battleHud.rewardHint : this.ndTask.getChildByName("ndAni");
      var c = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(t.id);
      this.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, c.icon, function (t) {
        l.getChildByName("sprIcon").getComponent(cc.Sprite).spriteFrame = t;
      });
      l.getChildByName("labNum").getComponent(cc.Label).string = "+" + t.num * this.ctrGame.gameData.levelCfg.InGameCoefficient;
      l.active = true;
      cc.tween(l).set({
        y: 40
      }).to(.5, {
        y: 80
      }).call(function () {
        l.active = false;
      }).start();
      this.ctrGame.gameData.taskInfo.index = checkpoint.taskList.index;
      this.ctrGame.gameData.taskInfo.stage = 0;
      if (t.id === $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.SilverCoin) this.ctrGame.saveGame();
      this.initView();
    }
  };
  _ctor.prototype.addTask = function (t) {
    this.ctrGame.gameData.taskInfo.index >= this.ctrGame.gameData.taskInfo.list.length || this.ctrGame.gameData.taskInfo.list[this.ctrGame.gameData.taskInfo.index] == t && (this.ctrGame.gameData.taskInfo.stage = 1, this.initView(), this.ctrGame.saveGame());
  };
  _ctor.prototype.changeFollowMode = function (t) {
    var e = this;
    var n = function () {
      $z1KinghtFallConfig.KinghtFallParameter.FollowMode = t;
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().setFollowMode();
      switch ($z1KinghtFallConfig.KinghtFallParameter.FollowMode) {
        case 1:
          e.btnAgg.getChildByName("ndTag1").active = true;
          e.btnAgg.getChildByName("ndTag2").active = false;
          e.btnAgg.getChildByName("labNum").getComponent(cc.Label).string = e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.Game04);
          break;
        case 2:
          e.btnAgg.getChildByName("ndTag1").active = !e.ctrGame.isAgg;
          e.btnAgg.getChildByName("ndTag2").active = e.ctrGame.isAgg;
          e.btnAgg.getChildByName("labNum").getComponent(cc.Label).string = e.T($z1KinghtFallTextConfig.KinghtFallTextConfig.Game05);
      }
    };
    var changed = $z1KinghtFallConfig.KinghtFallParameter.FollowMode != t;
    if (changed) this.ctrGame.clearArmyOrder();
    n();
    if (changed && t === 2) this.ctrGame.enterSelectiveFollow();
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnFollow", undefined);
  _ctor.instance = null;
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "入口信息"
  })], _ctor.prototype, "ndCtrGame", undefined);
  cc__decorate([ccp_property({
    type: $z1KinghtFallGameEffect.default,
    tooltip: "玩家"
  })], _ctor.prototype, "ctrEffect", undefined);
  cc__decorate([ccp_property({
    type: $z1KinghtFallGameUICtrl.default,
    tooltip: "操作界面"
  })], _ctor.prototype, "ctrUI", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "入口信息"
  })], _ctor.prototype, "ndEnemyIcon", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "货币信息"
  })], _ctor.prototype, "ndCoin", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "货币信息"
  })], _ctor.prototype, "ndBuildCoin", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "关卡信息"
  })], _ctor.prototype, "ndLevelInfo", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "开始战斗"
  })], _ctor.prototype, "btnStartFight", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "加金币"
  })], _ctor.prototype, "btnAddCoin", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "集合"
  })], _ctor.prototype, "btnAgg", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "暂停"
  })], _ctor.prototype, "btnSuspend", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "复活"
  })], _ctor.prototype, "btnRevive", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "复活"
  })], _ctor.prototype, "btnReviveBreak", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "暂停"
  })], _ctor.prototype, "btnBuildInfo", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "任务"
  })], _ctor.prototype, "ndTask", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "暂停"
  })], _ctor.prototype, "btnTest", undefined);
  return n = cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIGame;
