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
    $z1EventMgr.EventMgr.getInstance().on("SaveFailed", this, this.onSaveFailed);
    $z1EventMgr.EventMgr.getInstance().on("SaveRecovered", this, this.onSaveRecovered);
    $z1UIMgr.UIMgr.getInstance().getChildByName("UILoading").zIndex = 9999;
    this.adapt();
    this.preloadRes();
  };
  _ctor.prototype.hideLoading = function () {
    var loading = $z1UIMgr.UIMgr.getInstance().getChildByName("UILoading");
    if (cc.isValid(loading, true)) loading.destroy();
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
        $z1UIMgr.UIMgr.getInstance().openUIOfCallback($z1KinghtFallConfig.KinghtFallUIID.UIHome, $z1Config.UIID.UINONE, function () {
          if (!isCurrent()) return;
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide1);
          t.hideLoading();
        });
      });
    });
    this.scheduleOnce(function () {
      $z1EventMgr.EventMgr.getInstance().emit("WCNGameEnd", "[[loc:system.playTimeLimit]]");
    }, 3);
    $z1UIUtils.UIUtils.schedule(this.addTime, this, 1);
    cc.game.on(cc.game.EVENT_SHOW, this.checkDailyRollover, this);
    var e = $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().getCrunetDay();
    $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.dau_day_X, e);
  };
  _ctor.prototype.onPlayVideo = function (t) {
    $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addAchNum($z1KinghtFallEnum.KinghtFallEnumAchiEnum.AdsWatch, t);
  };
  _ctor.prototype.addTime = function () {
    this.checkDailyRollover();
    if ($z1PlayerMgr.PlayerMgr.getInstance().getTrackData().getTimeByKey($z1GameTrackData.TimeByKey.ONLINE_TIME) <= 18e3) {
      switch ($z1PlayerMgr.PlayerMgr.getInstance().getTrackData().addTimeByKey($z1GameTrackData.TimeByKey.ONLINE_TIME)) {
        case 60:
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.time_1);
          break;
        case 180:
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.time_3);
          break;
        case 300:
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.time_5);
          break;
        case 420:
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.time_7);
          break;
        case 600:
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.time_10);
          break;
        case 900:
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.time_15);
          break;
        case 1200:
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.time_20);
          break;
        case 1800:
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.time_30);
          break;
        case 3600:
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.time_1h);
          break;
        case 10800:
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.time_3h);
          break;
        case 18e3:
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.time_5h);
      }
    }
    $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().addOnlineTime();
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
      caption.width = node.width - 24;
      caption.height = node.height - 12;
      var label = caption.addComponent(cc.Label);
      label.fontSize = 26;
      label.lineHeight = 30;
      label.enableWrapText = true;
      label.overflow = cc.Label.Overflow.SHRINK;
      label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
      label.verticalAlign = cc.Label.VerticalAlign.CENTER;
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
    if (this.saveNotice && cc.isValid(this.saveNotice)) this.saveNotice.destroy();
    cc.game.off(cc.game.EVENT_SHOW, this.checkDailyRollover, this);
    cc.director.getScheduler().unschedule(this.addTime, this);
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
