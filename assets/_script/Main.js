var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1EventMgr = require("EventMgr");
var $z1SdkMgr = require("SdkMgr");
var $z1UIMgr = require("UIMgr");
var $z1UIUtils = require("UIUtils");
var $z1Config = require("Config");
var $z1GameTrackData = require("GameTrackData");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1GameUserData = require("GameUserData");
var $z1PlayerMgr = require("PlayerMgr");
var RenderGuard = require("KinghtFallRenderGuard");
var Startup = require("StartupPresentation"), StartupProgress = require("StartupProgress");
var onlineTimeEvents = { 60: "time_1", 180: "time_3", 300: "time_5", 420: "time_7", 600: "time_10",
  900: "time_15", 1200: "time_20", 1800: "time_30", 3600: "time_1h", 10800: "time_3h", 18000: "time_5h" };
// At most 14 credited seconds can be pending on either record in a healthy
// store. Offset the writes to avoid two routine transactions in one frame.
var onlineTimeSaveInterval = 15, onlineTimeTrackOffset = 7;
function canWriteOnlineTime(record) {
  return !record.deferSave && !record.pause && !record.saveBlockedByRecovery && !record.clearPending;
}
function canDeferOnlineTime(record) {
  return canWriteOnlineTime(record) && !record.localSavePending;
}
function sameOnlineTimeSave(entry, record) {
  return entry && entry.record === record && entry.data === record.data &&
    entry.generation === record._cloudGeneration && entry.revision === record._cloudRevision;
}
function rememberOnlineTimeSave(pending, key, record) {
  if (!sameOnlineTimeSave(pending[key], record)) pending[key] = { record: record, data: record.data,
    generation: record._cloudGeneration, revision: record._cloudRevision };
}
function flushOnlineTimeSave(pending, key, record, retryPending) {
  var entry = pending[key];
  if (!entry) return;
  if (sameOnlineTimeSave(entry, record) && canWriteOnlineTime(record) && (retryPending || !record.localSavePending)) record.saveData();
  // Other writes include the live counters. A replaced, cleared, or already
  // persisted record must never be written from an old timer callback.
  if (pending[key] === entry && !sameOnlineTimeSave(entry, record)) pending[key] = null;
}
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_Main = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.root = null;
    e.cameraNode = null;
    e.temp = null;
    e.btnChangle = null;
    e.childTouch = false;
    e.mainCam = null;
    e.isFitHeight = false;
    e.isFitWidth = false;
    return e;
  }
  var n;
  cc__extends(_ctor, t);
  n = _ctor;
  _ctor.prototype.onLoad = function () {
    RenderGuard.install(sp.Skeleton, cc);
    n.instance = this;
    this.failedSaveKeys = {};
    if (StartupProgress.phase) StartupProgress.phase("lobby");
    $z1EventMgr.EventMgr.getInstance().on("SaveFailed", this, this.onSaveFailed);
    $z1EventMgr.EventMgr.getInstance().on("SaveRecovered", this, this.onSaveRecovered);
    $z1UIMgr.UIMgr.getInstance().getChildByName("UILoading").zIndex = 9999;
    this.adapt();
    this.preloadRes();
  };
  _ctor.prototype.hideLoading = function () {
    var loading = $z1UIMgr.UIMgr.getInstance().getChildByName("UILoading");
    if (!cc.isValid(loading, true)) return;
    var owner = this, generation = this._startupGeneration, scene = cc.director.getScene(), retired = false;
    var current = function () { return !retired && cc.isValid(owner, true) && owner._startupGeneration === generation &&
      cc.director.getScene() === scene && cc.isValid(loading, true); };
    function finish() {
      if (!current()) return;
      if (Startup.finish) Startup.finish(cc, function () { if (current()) loading.destroy(); }, current);
      else loading.destroy();
    }
    if (StartupProgress.phase) StartupProgress.phase("finishing");
    if (cc.sys && cc.sys.isNative) { finish(); return; }
    require("ResourceMgr").ResourceMgr.getInstance().loadWithRecovery("Construction menu scene readiness", function (resolve) {
      require("PreparedBuildingMenus").repaintScene(function (error, sceneRetired) {
        if (sceneRetired) retired = true;
        resolve(error, true);
      }, current);
    }, finish, null, current);
  };
  _ctor.prototype.start = function () {
    var t = this;
    var generation = this._startupGeneration = (this._startupGeneration || 0) + 1;
    var isCurrent = function () { return cc.isValid(t, true) && t._startupGeneration === generation; };
    this.mainCam = cc.Camera.main;
    $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITouch, $z1Config.UIID.UINONE);
    $z1UIMgr.UIMgr.getInstance().openUIOfCallback($z1KinghtFallConfig.KinghtFallUIID.UITop, $z1Config.UIID.UINONE, function (e) {
      if (!isCurrent()) return;
      t.uiTop = e;
      $z1UIMgr.UIMgr.getInstance().openUIOfCallback($z1Config.UIID.UIReportTop, $z1Config.UIID.UINONE, function () {
        if (!isCurrent()) return;
        function openLobby() {
          if (!isCurrent()) return;
          $z1UIMgr.UIMgr.getInstance().openUIOfCallback($z1KinghtFallConfig.KinghtFallUIID.UIHome, $z1Config.UIID.UINONE, function () {
            if (!isCurrent()) return;
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide1);
            t.hideLoading();
          });
        }
        if (cc.sys && cc.sys.isNative && cc.sys.os === cc.sys.OS_ANDROID) {
          // Register the shared icons before the Relics grid requests them in parallel.
          require("ResourceMgr").ResourceMgr.getInstance().loadBundle($z1KinghtFallConfig.KinghtFallBundelName.IconGood,
            openLobby, null, isCurrent, $z1KinghtFallConfig.BattleAssetLoadOptions);
        } else {
          openLobby();
        }
      });
    });
    this.scheduleOnce(function () {
      $z1EventMgr.EventMgr.getInstance().emit("WCNGameEnd", "[[loc:system.playTimeLimit]]");
    }, 3);
    this.startOnlineTimeSaves();
    $z1UIUtils.UIUtils.schedule(this.addTime, this, 1);
    cc.game.on(cc.game.EVENT_SHOW, this.checkDailyRollover, this);
    var e = $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().getCrunetDay();
    $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.dau_day_X, e);
  };
  _ctor.prototype.onPlayVideo = function (t) {
    $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addAchNum($z1KinghtFallEnum.KinghtFallEnumAchiEnum.AdsWatch, t);
  };
  _ctor.prototype.startOnlineTimeSaves = function () {
    var game = cc.game;
    if (this._onlineTimeSaves || !cc.sys || !cc.sys.isNative || !game || typeof game.EVENT_HIDE !== "string" ||
        typeof game.on !== "function" || typeof game.off !== "function") return;
    game.on(game.EVENT_HIDE, this.flushOnlineTimeSaves, this);
    this._onlineTimeSaves = { tick: 0, track: null, daily: null };
  };
  _ctor.prototype.flushOnlineTimeSaves = function () {
    var pending = this._onlineTimeSaves;
    if (!pending) return;
    if (pending.track) flushOnlineTimeSave(pending, "track", $z1PlayerMgr.PlayerMgr.getInstance().getTrackData(), true);
    if (pending.daily) flushOnlineTimeSave(pending, "daily", $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData(), true);
  };
  _ctor.prototype.addTime = function () {
    this.checkDailyRollover();
    var pending = this._onlineTimeSaves, track = $z1PlayerMgr.PlayerMgr.getInstance().getTrackData();
    var timeKey = $z1GameTrackData.TimeByKey.ONLINE_TIME, previous = track.getTimeByKey(timeKey);
    if (previous <= 18e3) {
      var deferTrack = pending && canDeferOnlineTime(track) && !onlineTimeEvents[Number(previous) + 1];
      var elapsed = track.addTimeByKey(timeKey, !deferTrack);
      if (deferTrack) rememberOnlineTimeSave(pending, "track", track);
      var event = onlineTimeEvents[elapsed];
      if (event) track.youmengTrack($z1GameTrackDataEvent.TrackId[event]);
    }
    var daily = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData();
    var deferDaily = pending && canDeferOnlineTime(daily), revision = daily._cloudRevision;
    daily.addOnlineTime(undefined, !deferDaily);
    if (deferDaily && revision === daily._cloudRevision) rememberOnlineTimeSave(pending, "daily", daily);
    if (pending) {
      pending.tick = (pending.tick + 1) % onlineTimeSaveInterval;
      if (pending.tick === onlineTimeTrackOffset) flushOnlineTimeSave(pending, "track", track);
      if (pending.tick === 0) flushOnlineTimeSave(pending, "daily", daily);
    }
    $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.TimeUpdate);
  };
  _ctor.prototype.checkDailyRollover = function () {
    var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
    var dailyChanged = player.getDailyData().ensureCurrentDay();
    var mission = player.getMissionData();
    var previous = mission.data.time;
    mission.initData();
    if (dailyChanged || previous !== mission.data.time) {
      var events = $z1EventMgr.EventMgr.getInstance();
      events.emit($z1KinghtFallConfig.KinghtFallEventName.DailyUpdate);
      events.emit($z1KinghtFallConfig.KinghtFallEventName.TimeUpdate);
      events.emit($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 31);
    }
  };
  _ctor.prototype.onSaveFailed = function (info) {
    this.failedSaveKeys[info.key] = true;
    if (!this.saveNotice || !cc.isValid(this.saveNotice)) {
      var node = this.saveNotice = new cc.Node("SaveNotice");
      node.parent = $z1UIMgr.UIMgr.getInstance().uiRoot || this.node;
      node.zIndex = 32760;
      node.width = Math.min(cc.winSize.width - 24, 710);
      node.height = 108;
      var widget = node.addComponent(cc.Widget);
      widget.isAlignTop = true;
      widget.top = 45;
      widget.isAlignHorizontalCenter = true;
      var background = node.addComponent(cc.Graphics);
      background.fillColor = cc.color(50, 25, 10, 245);
      background.rect(-node.width / 2, -node.height / 2, node.width, node.height);
      background.fill();
      var caption = new cc.Node("Message");
      caption.parent = node;
      var label = caption.addComponent(cc.Label);
      label.fontSize = 26;
      label.lineHeight = 30;
      label.enableWrapText = true;
      label.overflow = cc.Label.Overflow.SHRINK;
      label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
      label.verticalAlign = cc.Label.VerticalAlign.CENTER;
      // Native Label creation measures its empty NONE-overflow text first.
      caption.setContentSize(node.width - 24, node.height - 12);
      label.string = "[[loc:system.saveFailed]]";
    }
    this.saveNotice.active = true;
  };
  _ctor.prototype.onSaveRecovered = function (info) {
    delete this.failedSaveKeys[info.key];
    if (this.saveNotice && !Object.keys(this.failedSaveKeys).length) this.saveNotice.active = false;
  };
  _ctor.prototype.onDestroy = function () {
    this._startupGeneration = (this._startupGeneration || 0) + 1;
    cc.director.getScheduler().unschedule(this.addTime, this);
    if (this._onlineTimeSaves) {
      cc.game.off(cc.game.EVENT_HIDE, this.flushOnlineTimeSaves, this);
      this.flushOnlineTimeSaves();
      this._onlineTimeSaves = null;
    }
    if (this.saveNotice && cc.isValid(this.saveNotice)) this.saveNotice.destroy();
    cc.game.off(cc.game.EVENT_SHOW, this.checkDailyRollover, this);
    $z1EventMgr.EventMgr.getInstance().off("SaveFailed", this, this.onSaveFailed);
    $z1EventMgr.EventMgr.getInstance().off("SaveRecovered", this, this.onSaveRecovered);
  };
  _ctor.prototype.checkUserInfo = function (t) {
    var e = $z1PlayerMgr.PlayerMgr.getInstance().getUserData();
    if (e.getPlayerName()) {
      t && t();
    } else {
      $z1SdkMgr.SdkMgr.getInstance().getUserInfo(function (n, i) {
        var a = new $z1GameUserData.ThirdUserInfo();
        if (n) {
          e.setPlayerName(n);
          a.userName = n;
        }
        i && (a.imgUrl = i);
        if (n || i) {
          e.setThirdInfo(a);
        } else {
      e.setPlayerName("[[loc:player.self]]");
        }
        t && t();
      });
    }
  };
  _ctor.prototype.preloadRes = function () {};
  _ctor.prototype.adapt = function () {
    var t = cc.winSize.width / cc.winSize.height;
    var e = cc.Canvas.instance.designResolution.width / cc.Canvas.instance.designResolution.height;
    if (t <= 1 && t <= e) {
      this.setFitWidth();
    } else {
      this.setFitHeight();
    }
  };
  _ctor.prototype.setFitHeight = function () {
    cc.Canvas.instance.fitHeight = true;
    cc.Canvas.instance.fitWidth = false;
    this.isFitHeight = true;
  };
  _ctor.prototype.setFitWidth = function () {
    cc.Canvas.instance.fitHeight = false;
    cc.Canvas.instance.fitWidth = true;
    this.isFitWidth = true;
  };
  _ctor.prototype.getFitHeight = function () {
    return this.isFitHeight;
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "root", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "cameraNode", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "temp", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnChangle", undefined);
  return n = cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_Main;
