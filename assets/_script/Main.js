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
    n.instance = this;
    $z1UIMgr.UIMgr.getInstance().getChildByName("UILoading").zIndex = 9999;
    this.adapt();
    this.preloadRes();
  };
  _ctor.prototype.hideLoading = function () {
    $z1UIMgr.UIMgr.getInstance().getChildByName("UILoading").destroy();
  };
  _ctor.prototype.start = function () {
    var t = this;
    this.mainCam = cc.Camera.main;
    $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITouch, $z1Config.UIID.UINONE);
    $z1UIMgr.UIMgr.getInstance().openUIOfCallback($z1KinghtFallConfig.KinghtFallUIID.UITop, $z1Config.UIID.UINONE, function (e) {
      t.uiTop = e;
      $z1UIMgr.UIMgr.getInstance().openUIOfCallback($z1Config.UIID.UIReportTop, $z1Config.UIID.UINONE, function () {
        $z1UIMgr.UIMgr.getInstance().openUIOfCallback($z1KinghtFallConfig.KinghtFallUIID.UIHome, $z1Config.UIID.UINONE, function () {
          $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide1);
          t.hideLoading();
        });
      });
    });
    this.scheduleOnce(function () {
      $z1EventMgr.EventMgr.getInstance().emit("WCNGameEnd", "[[loc:system.playTimeLimit]]");
    }, 3);
    $z1UIUtils.UIUtils.schedule(this.addTime, this, 1);
    var e = $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().getCrunetDay();
    $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.dau_day_X, e);
  };
  _ctor.prototype.onPlayVideo = function (t) {
    $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addAchNum($z1KinghtFallEnum.KinghtFallEnumAchiEnum.AdsWatch, t);
  };
  _ctor.prototype.addTime = function () {
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
