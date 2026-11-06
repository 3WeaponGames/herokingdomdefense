var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1SdkMgr = require("SdkMgr");
var $z1Utils = require("Utils");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUISignIn = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndDayList = [null];
    e.btnSign = null;
    e.btnVide = null;
    e.btnDouble = null;
    e.btnGet = null;
    e.btnClose = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    this.cfgList = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSignCfg();
    this.initView();
    this.initBtnListener();
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.DailyUpdate, this.initView);
  };
  _ctor.prototype.initData = function () {};
  _ctor.prototype.canClaim = function (multiplier, claim, day, date) {
    var daily = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData();
    daily.ensureCurrentDay();
    if (date !== undefined && date !== new Date().toDateString()) return false;
    var currentDay = daily.getSignDay();
    if (!this.cfgList[currentDay] || day !== undefined && day !== currentDay) return false;
    var expected = claim === 1 && multiplier === 1 ? 1 : 0;
    return daily.getSignReward() === expected;
  };
  _ctor.prototype.initBtnListener = function () {
    var t = this;
    var e = function (e, n, day, date) {
      if (!t.canClaim(e, n, day, date)) return;
      var i = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().getSignDay();
      var a = t.cfgList[i];
      var o = {
        id: a.Item[0],
        num: a.Item[1]
      };
      var r = t.ndDayList[i].convertToWorldSpaceAR(t.ndDayList[i].getChildByName("sprIcon").position);
      var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
      var rewards = player.claimRewards([o], e, r, function () { return player.getDailyData().sign(n, t.cfgList.length); }, function () { return t.canClaim(e, n, day, date); });
      if (!rewards || !rewards.length) return;
      t.initView();
      t.sendEvent($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 4);
    };
    this.btnSign.on(cc.Node.EventType.TOUCH_END, function () {
      e(1, 0);
    }, this);
    this.btnVide.on(cc.Node.EventType.TOUCH_END, function () {
      if (!t.canClaim(1, 1)) return;
      var day = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().getSignDay();
      var date = new Date().toDateString();
      $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.day7_once);
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_day7_once_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
        e(1, 1, day, date);
      }, null, "home.signIn.extra");
    }, this);
    this.btnDouble.on(cc.Node.EventType.TOUCH_END, function () {
      if (!t.canClaim(2, 1)) return;
      var day = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().getSignDay();
      var date = new Date().toDateString();
      $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.day7_double);
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_day7_double_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
        e(2, 1, day, date);
      }, null, "home.signIn.double");
    }, this);
    this.btnClose.on(cc.Node.EventType.TOUCH_END, function () {
      t.closeUI();
    }, this);
  };
  _ctor.prototype.initView = function () {
    var t = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().getSignReward();
    var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().getSignDay();
    if (!this.cfgList[e]) t = 3;
    switch (t) {
      case 0:
        this.btnSign.active = true;
        this.btnVide.active = false;
        this.btnDouble.active = true;
        this.btnGet.active = false;
        break;
      case 1:
        this.btnSign.active = false;
        this.btnVide.active = true;
        this.btnDouble.active = false;
        this.btnGet.active = false;
        break;
      default:
        this.btnSign.active = false;
        this.btnVide.active = false;
        this.btnDouble.active = false;
        this.btnGet.active = true;
    }
    var n = function (n) {
      var a = i.ndDayList[n];
      var o = i.cfgList[n];
      a.getChildByName("labDay").getComponent(cc.Label).string = $z1Utils.Utils.StringFormat(i.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeBattle11), n + 1);
      var r = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(o.Item[0]);
      i.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, r.sprBg, function (t) {
        a.getChildByName("ndBg").getComponent(cc.Sprite).spriteFrame = t;
      });
      i.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, r.icon, function (t) {
        a.getChildByName("sprIcon").getComponent(cc.Sprite).spriteFrame = t;
      });
      a.getChildByName("labNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(o.Item[1]);
      a.getChildByName("labName").getComponent(cc.Label).string = i.T(r.name);
      var s = false;
      if (n < e) {
        s = true;
      } else {
        n == e && t > 0 && (s = true);
      }
      a.getChildByName("ndFinish").active = s;
    };
    var i = this;
    for (var a = 0; a < this.ndDayList.length; a++) {
      n(a);
    }
  };
  cc__decorate([ccp_property({
    type: [cc.Node],
    tooltip: "签到列表"
  })], _ctor.prototype, "ndDayList", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "签到按钮"
  })], _ctor.prototype, "btnSign", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "视频签到按钮"
  })], _ctor.prototype, "btnVide", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "双倍签到按钮"
  })], _ctor.prototype, "btnDouble", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "已签到"
  })], _ctor.prototype, "btnGet", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "关闭"
  })], _ctor.prototype, "btnClose", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUISignIn;
