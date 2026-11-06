var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
var cc__spreadArrays = __spreadArrays;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1AudioMgr = require("AudioMgr");
var $z1SdkMgr = require("SdkMgr");
var TestMode = require("TestMode").TestMode;
var $z1Utils = require("Utils");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallMissionData = require("KinghtFallMissionData");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUITalentInfo = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.labName = null;
    e.btnClose = null;
    e.labInfo = null;
    e.btnVideo = null;
    e.ndLock = null;
    e.btnGold = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t, e) {
    this.cfg = t;
    this.nodeInfo = e;
  };
  _ctor.prototype.start = function () {
    var t;
    this.cfgInfo = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTalentCfg(this.cfg.kindID);
    this.goldNum = this.cfg.GoldCost;
    var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTreasureLevel($z1KinghtFallEnum.KinghtFallEnumTreasureEnum.EconomyBook);
    if (e) {
      var n = null === (t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfgById($z1KinghtFallEnum.KinghtFallEnumTreasureEnum.EconomyBook).levelInfo[e.level - 1]) || undefined === t ? undefined : t.param;
      n && (this.goldNum -= Math.floor(this.goldNum * n[0]));
    }
    this.initView();
    this.initBtnListener();
    this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 6, this.btnGold);
  };
  _ctor.prototype.initBtnListener = function () {
    this.btnClose.on(cc.Node.EventType.TOUCH_END, this.closeUI, this);
    this.node.getChildByName("bg").on(cc.Node.EventType.TOUCH_END, this.closeUI, this);
    var t = 4;
    for (var e = 0; e < this.nodeInfo[this.cfg.Level - 1].tag.length; e++) {
      this.nodeInfo[this.cfg.Level - 1].cfgList[e].ID == this.cfg.ID && (t = this.nodeInfo[this.cfg.Level - 1].tag[e]);
    }
    switch (t) {
      case 1:
        this.btnVideo.active = false;
        this.ndLock.active = false;
        this.btnGold.active = false;
        break;
      case 2:
        this.btnVideo.active = false;
        this.ndLock.active = false;
        this.btnGold.active = true;
        this.btnGold.getChildByName("Layout").getChildByName("labNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(this.goldNum);
        break;
      case 3:
        this.btnVideo.active = true;
        this.refreshVideoCount();
        this.ndLock.active = false;
        this.btnGold.active = false;
        break;
      case 4:
        this.btnVideo.active = false;
        this.ndLock.active = true;
        this.btnGold.active = false;
    }
    this.btnVideo.on(cc.Node.EventType.TOUCH_END, this.onVideoBtnClick, this);
    this.btnGold.on(cc.Node.EventType.TOUCH_END, this.onGoldBtnClick, this);
  };
  _ctor.prototype.update = function () {
    var bypassAdLimits = TestMode.getInstance().shouldBypassAdLimits();
    if (this._testAdLimitBypass !== bypassAdLimits && this.cfg) {
      this._testAdLimitBypass = bypassAdLimits;
      if (this.btnVideo.active) this.refreshVideoCount();
    }
  };
  _ctor.prototype.refreshVideoCount = function () {
    var progress = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTalentLevel(this.cfg.ID);
    var label = this.btnVideo.getChildByName("Layout").getChildByName("labNum").getComponent(cc.Label);
    if (this.cfg.vedioCount > 1 && !TestMode.getInstance().shouldBypassAdLimits()) {
      label.string = (progress ? progress.video : 0) + "/" + this.cfg.vedioCount;
    } else {
      label.string = this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTalent01);
    }
  };
  _ctor.prototype.initView = function () {
    this.labName.string = this.T(this.cfgInfo.Name);
    var t = [];
    if (this.cfg.EffectNumber) {
      for (var e = 0; e < this.cfg.EffectNumber.length; e++) {
        var n = this.cfg.EffectNumber[e];
        if (this.cfg.vaulePercentage[e]) {
          t.push("<color=#43a926>" + (100 * n).toFixed(0) + "%</c>");
        } else {
          t.push("<color=#43a926>" + n + "</c>");
        }
      }
    }
    this.labInfo.string = require("LanguageMgr").LanguageMgr.getInstance().format("<b>{0}</b>", [$z1Utils.Utils.StringFormat.apply($z1Utils.Utils, cc__spreadArrays([this.T(this.cfgInfo.Describe)], t))]);
  };
  _ctor.prototype.onVideoBtnClick = function () {
    var t = this;
    var owned = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTalentLevel(this.cfg.ID);
    if (owned && owned.isLock) return;
    $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
      $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.talent);
      $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_talent_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
      var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTalentLevel(t.cfg.ID);
      if (e) {
        e.video = e.video + 1;
      } else {
        e = {
          id: t.cfg.ID,
          isLock: false,
          video: 1
        };
      }
      if (e.video >= t.cfg.vedioCount || TestMode.getInstance().shouldBypassAdLimits()) {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.talent_unlock_X, t.cfg.ID);
        $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.TalentUp, 1);
        $z1AudioMgr.AudioMgr.getInstance().playEffect($z1KinghtFallConfig.KinghtFallAudioId.unlock);
        e.isLock = true;
        t.closeUI();
      } else {
        t.btnVideo.getChildByName("Layout").getChildByName("labNum").getComponent(cc.Label).string = e.video + "/" + t.cfg.vedioCount;
      }
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().setTalentLevel(e);
      t.sendEvent($z1KinghtFallConfig.KinghtFallEventName.TalentUpdate);
    }, null, "home.talent.unlock");
  };
  _ctor.prototype.onGoldBtnClick = function () {
    if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().subGoldNum(this.goldNum)) {
      $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide17);
      var t = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTalentLevel(this.cfg.ID);
      if (t) {
        t.isLock = true;
      } else {
        t = {
          id: this.cfg.ID,
          isLock: true,
          video: 0
        };
      }
      $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.talent_unlock_X, this.cfg.ID);
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.TalentUp, 1);
      $z1AudioMgr.AudioMgr.getInstance().playEffect($z1KinghtFallConfig.KinghtFallAudioId.unlock);
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().setTalentLevel(t);
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.TalentUpdate);
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 2);
      this.closeUI();
    } else {
      this.openUI($z1KinghtFallConfig.KinghtFallUIID.UIAddCurrency, $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin);
    }
  };
  cc__decorate([ccp_property({
    type: cc.Label,
    tooltip: "天赋名称"
  })], _ctor.prototype, "labName", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "关闭"
  })], _ctor.prototype, "btnClose", undefined);
  cc__decorate([ccp_property({
    type: cc.RichText,
    tooltip: "天赋名称"
  })], _ctor.prototype, "labInfo", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "视频签到按钮"
  })], _ctor.prototype, "btnVideo", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "双倍签到按钮"
  })], _ctor.prototype, "ndLock", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "已签到"
  })], _ctor.prototype, "btnGold", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUITalentInfo;
