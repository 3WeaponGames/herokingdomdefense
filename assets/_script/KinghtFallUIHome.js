var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
var cc__spreadArrays = __spreadArrays;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BasePlatform = require("BasePlatform");
var $z1BaseUI = require("BaseUI");
var $z1BaseCtrl = require("BaseCtrl");
var $z1EventMgr = require("EventMgr");
var $z1Appcfg = require("Appcfg");
var $z1PlatformSetting = require("PlatformSetting");
var $z1AudioMgr = require("AudioMgr");
var $z1FeedCardMgr = require("FeedCardMgr");
var $z1PoolMgr = require("PoolMgr");
var $z1UIMgr = require("UIMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1UIGuide = require("UIGuide");
var $z1Main = require("Main");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallHomeBattleCtrl = require("KinghtFallHomeBattleCtrl");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIHome = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.togCon = null;
    e.ndMain = null;
    e.preWeap = null;
    e.preTalent = null;
    e.preBattle = null;
    e.preTreasure = null;
    e.preShop = null;
    e.canGuide = true;
    e.tag = "";
    e.tagNode = null;
    e._tabPages = Object.create(null);
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onEnable = function () {
    $z1Main.default.instance.uiTop.active = true;
    $z1AudioMgr.AudioMgr.getInstance().playMusic($z1KinghtFallConfig.KinghtFallAudioId.menu_bgm, $z1KinghtFallConfig.KinghtFallParameter.BGMusic);
    $z1PoolMgr.PoolMgr.getInstance().clearPool();
    this.initViewTogg();
    if (this.tagNode && cc.isValid(this.tagNode, true)) this.setTabEvents(this.tagNode, true);
    this.showRed(31);
  };
  _ctor.prototype.onDisable = function () {
    $z1Main.default.instance.uiTop.active = false;
    if (this.tagNode && cc.isValid(this.tagNode, true)) this.setTabEvents(this.tagNode, false);
  };
  _ctor.prototype.start = function () {
    this.initEventListener();
    this.initBtnListener();
    for (var t = 0; t < this.togCon.toggleItems.length; t++) {
      var e = this.togCon.toggleItems[t];
      $z1KinghtFallModle.default.getInstance().twBreatheRedPoint(e.node.getChildByName("Background").getChildByName("ndRed"));
      $z1KinghtFallModle.default.getInstance().twBreatheRedPoint(e.node.getChildByName("checkmark").getChildByName("ndRed"));
    }
    this.tag1 = this.togCon.toggleItems[2];
    this.tag1.isChecked = true;
    this.showView(this.tag1);
    var n = true;
    if ($z1FeedCardMgr.FeedCardMgr.instance.getLaunchFromFeedcard()) {
      var i = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getCodeJoin(1);
      if (i) {
        var a = "gift_" + i.gift_num.toLocaleLowerCase();
        if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getTimeByKey(a) < i.exchange_time) {
          this.openUI($z1KinghtFallConfig.KinghtFallUIID.UIExchangeCode, i.gift_num);
          n = false;
        }
      }
    }
    n && this.startGuide();
  };
  _ctor.prototype.initEventListener = function () {
    var t = this;
    this.addEvent($z1Appcfg.BaseEventName.CloseUI, this.onCloseUI);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, this.startGuide);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, this.showRed);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.RefreshGold, function () {
      t.showRed(11);
    });
  };
  _ctor.prototype.initViewTogg = function () {
    var t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.ButtonUnlock);
    this.lockList = t.split(";").map(function (t) {
      return t.split(",").map(Number);
    });
    var e = [];
    for (var n = 0; n < this.togCon.toggleItems.length; n++) {
      var i = this.togCon.toggleItems[n];
      var a = this.isLock(n);
      if (!(a || n === 4 || -1 == this.lockList[n][0] || $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getFunctionUnlockInfo(n))) {
        e.push(n);
      }
      i.node.getChildByName("ndLock").active = a;
    }
    if (!e.length || this._unlockNotice) return;
    var home = this, notice = this._unlockNotice = {};
    this.canGuide = false;
    $z1UIMgr.UIMgr.getInstance().openUIWithOwner($z1KinghtFallConfig.KinghtFallUIID.UINewModular, this.uid, {
      parent: this,
      isCurrent: function () { return home._unlockNotice === notice && cc.isValid(home, true) && !home.isclose && home.node.activeInHierarchy; },
      onOpened: function () {
        var user = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData();
        e.forEach(function (index) { user.setFunctionUnlockInfo(index); });
      },
      onCancel: function () {
        if (home._unlockNotice !== notice) return;
        home._unlockNotice = null;
        home.canGuide = true;
        if (cc.isValid(home, true) && !home.isclose && home.node.activeInHierarchy) home.scheduleOnce(function () { home.startGuide(); });
      }
    }, e);
  };
  _ctor.prototype.isLock = function (t) {
    // The storefront is available as soon as its page is installed. The old
    // placeholder threshold was beyond the authored campaign's final stage.
    if (t === 4) return !this.preShop;
    if (-1 == this.lockList[t][0]) {
      return false;
    }
    var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage();
    if (this.lockList[t][0] < e) {
      return false;
    }
    if (this.lockList[t][0] > e) {
      return true;
    }
    var n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxOrder();
    return this.lockList[t][1] > n;
  };
  _ctor.prototype.initBtnListener = function () {
    for (var t = 0; t < this.togCon.toggleItems.length; t++) {
      this.togCon.toggleItems[t].node.on("toggle", this.showView, this);
    }
  };
  _ctor.prototype.showView = function (t) {
    $z1AudioMgr.AudioMgr.getInstance().playAudioButtonClicked();
    if (t.isChecked && this.tag != t.node.name) {
      var e = null;
      switch (t.node.name) {
        case "Toggle1":
          if (this.isLock(0)) {
            this.openUI($z1Config.UIID.UITips, $z1Utils.Utils.StringFormat.apply($z1Utils.Utils, cc__spreadArrays([this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTips06)], this.lockList[0])));
          } else {
            e = this.preWeap;
          }
          break;
        case "Toggle2":
          if (this.isLock(1)) {
            this.openUI($z1Config.UIID.UITips, $z1Utils.Utils.StringFormat.apply($z1Utils.Utils, cc__spreadArrays([this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTips06)], this.lockList[1])));
          } else {
            e = this.preTalent;
          }
          break;
        case "Toggle3":
          if (this.isLock(2)) {
            this.openUI($z1Config.UIID.UITips, $z1Utils.Utils.StringFormat.apply($z1Utils.Utils, cc__spreadArrays([this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTips06)], this.lockList[2])));
          } else {
            e = this.preBattle;
          }
          break;
        case "Toggle4":
          if (this.isLock(3)) {
            this.openUI($z1Config.UIID.UITips, $z1Utils.Utils.StringFormat.apply($z1Utils.Utils, cc__spreadArrays([this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTips06)], this.lockList[3])));
          } else {
            e = this.preTreasure;
          }
          break;
        case "Toggle5":
          if (this.isLock(4)) {
            this.openUI($z1Config.UIID.UITips, this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTips07));
          } else {
            e = this.preShop;
          }
      }
      if (e) {
        var page = this._tabPages[t.node.name];
        if (!page || !cc.isValid(page, true)) {
          page = cc.instantiate(e);
          page.active = false;
          page.parent = this.ndMain;
          this._tabPages[t.node.name] = page;
        }
        if (this.tagNode && cc.isValid(this.tagNode, true)) {
          this.setTabEvents(this.tagNode, false);
          this.tagNode.active = false;
        }
        this.tagNode = page;
        this.setTabEvents(page, true);
        page.active = true;
        this.showTag(this.tag1, false);
        this.showTag(t, true);
        this.tag = t.node.name;
        this.tag1 = t;
      } else {
        this.tag1.isChecked = true;
      }
      if (this.tagNode && cc.isValid(this.tagNode, true)) this.tagNode.active = true;
    }
  };
  _ctor.prototype.setTabEvents = function (page, active) {
    var events = $z1EventMgr.EventMgr.getInstance();
    page.getComponentsInChildren($z1BaseCtrl.default).forEach(function (controller) {
      if (active ? !controller._homeTabEventsPaused : controller._homeTabEventsPaused) return;
      (controller.eventList || []).forEach(function (bindings) {
        bindings.forEach(function (callback, name) {
          if (active) events.on(name, controller, callback);
          else events.off(name, controller, callback);
        });
      });
      controller._homeTabEventsPaused = !active;
    });
  };
  _ctor.prototype.showTag = function (t, e) {
    if (e) {
      var n = t.node.getChildByName("checkmark");
      cc.Tween.stopAllByTarget(n);
      cc.tween(n).set({
        y: -n.height
      }).to(.12, {
        y: 0
      }, {
        easing: "quadOut"
      }).start();
    }
  };
  _ctor.prototype.showRed = function (t) {
    if (1 & t) {
      var e = !this.isLock(0) && $z1KinghtFallModle.default.getInstance().showRedPerson();
      this.togCon.node.getChildByName("Toggle1").getChildByName("Background").getChildByName("ndRed").active = e;
      this.togCon.node.getChildByName("Toggle1").getChildByName("checkmark").getChildByName("ndRed").active = e;
    }
    if (2 & t) {
      e = !this.isLock(1) && $z1KinghtFallModle.default.getInstance().showRedTanlent();
      this.togCon.node.getChildByName("Toggle2").getChildByName("Background").getChildByName("ndRed").active = e;
      this.togCon.node.getChildByName("Toggle2").getChildByName("checkmark").getChildByName("ndRed").active = e;
    }
    if (4 & t) {
      e = !this.isLock(2) && $z1KinghtFallModle.default.getInstance().showRedFight();
      this.togCon.node.getChildByName("Toggle3").getChildByName("Background").getChildByName("ndRed").active = e;
      this.togCon.node.getChildByName("Toggle3").getChildByName("checkmark").getChildByName("ndRed").active = e;
    }
    if (8 & t) {
      e = !this.isLock(3) && $z1KinghtFallModle.default.getInstance().showRedTreasure();
      this.togCon.node.getChildByName("Toggle4").getChildByName("Background").getChildByName("ndRed").active = e;
      this.togCon.node.getChildByName("Toggle4").getChildByName("checkmark").getChildByName("ndRed").active = e;
    }
    if (16 & t) {
      e = false;
      this.togCon.node.getChildByName("Toggle5").getChildByName("Background").getChildByName("ndRed").active = e;
      this.togCon.node.getChildByName("Toggle5").getChildByName("checkmark").getChildByName("ndRed").active = e;
    }
  };
  _ctor.prototype.onCloseUI = function (t) {
    var e = this;
    if (t == $z1Config.UIID.UIGuide) {
      var n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getGroupId();
      if (5 == n && !this.isLock(2)) {
        return void (0 == $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getStepId() && this.scheduleOnce(function () {
          e.startGuide();
        }));
      }
      if (1 != n) {
        return;
      }
      this.scheduleOnce(function () {
        e.startGuide();
      });
    }
    if (t == $z1KinghtFallConfig.KinghtFallUIID.UINewModular) {
      this._unlockNotice = null;
      this.canGuide = true;
      this.scheduleOnce(function () {
        e.startGuide();
      });
    }
    if (t == $z1KinghtFallConfig.KinghtFallUIID.UIExchangeCode) {
      this.canGuide = true;
      this.startGuide();
    }
  };
  _ctor.prototype.startGuide = function (t, e, n) {
    var i = this;
    if ($z1PlatformSetting.PlatformSetting.currentPlatform != $z1BasePlatform.Platform.WEB_LINK && this.canGuide) {
      var a = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getGroupId();
      if (!t || a == t) {
        var o = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGuideCfgById(a);
        if (!(o.length <= 0)) {
          var r;
          var l = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getStepId();
          var g = o[l];
          switch (a) {
            case 1:
              (r = new $z1UIGuide.GuildCfg()).isWeek = !!g.Close;
              r.showHand = g.Finger;
              r.hideMask = !g.Mask;
              r.tipstring = g.Describe;
              r.showAni = !!g.ShowKing;
              switch (l) {
                case 0:
                  r.deviationTipsAll = cc.v2(0, g.Offset || 0);
                  $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide2);
                  break;
                case 1:
                  var u = this.tagNode.getComponent($z1KinghtFallHomeBattleCtrl.default);
                  r.lightType = 1;
                  r.addSize = new cc.Size(0, 0);
                  r.distNode = u.btnBattle;
                  r.deviationTipsAll = cc.v2(0, g.Offset || 0);
              }
              break;
            case 4:
              if (this.isLock(0)) {
                return;
              }
              (r = new $z1UIGuide.GuildCfg()).isWeek = !!g.Close;
              r.showHand = g.Finger;
              r.hideMask = !g.Mask;
              r.tipstring = g.Describe;
              r.showAni = !!g.ShowKing;
              switch (l) {
                case 0:
                  r.lightType = 1;
                  r.addSize = new cc.Size(0, 0);
                  r.distNode = this.togCon.toggleItems[0].node;
                  r.deviationTipsAll = cc.v2(0, g.Offset || 0);
                  r.callBack = function () {
                    i.togCon.toggleItems[0].isChecked = true;
                    i.showView(i.togCon.toggleItems[0]);
                  };
                  $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide18);
                  break;
                case 1:
                  if (e) {
                    r.lightType = 1;
                    r.addSize = new cc.Size(0, 0);
                    r.distNode = e;
                    r.deviationTipsAll = cc.v2(0, g.Offset || 0);
                    $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide19);
                  } else {
                    r = null;
                  }
              }
              break;
            case 5:
              if (this.isLock(3)) {
                return;
              }
              (r = new $z1UIGuide.GuildCfg()).isWeek = !!g.Close;
              r.showHand = g.Finger;
              r.hideMask = !g.Mask;
              r.tipstring = g.Describe;
              r.showAni = !!g.ShowKing;
              switch (l) {
                case 0:
                  r.lightType = 1;
                  r.addSize = new cc.Size(0, 0);
                  r.distNode = this.togCon.toggleItems[3].node;
                  r.deviationTipsAll = cc.v2(0, g.Offset || 0);
                  r.callBack = function () {
                    i.togCon.toggleItems[3].isChecked = true;
                    i.showView(i.togCon.toggleItems[3]);
                  };
                  $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide20);
                  break;
                case 1:
                case 2:
                  if (e) {
                    r.lightType = 1;
                    r.addSize = new cc.Size(0, 0);
                    r.distNode = e;
                    r.deviationTipsAll = cc.v2(0, g.Offset || 0);
                    n && (r.callBack = n);
                    $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide22);
                    $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide21);
                  } else {
                    r = null;
                  }
              }
              break;
            case 6:
              if (this.isLock(1)) {
                return;
              }
              (r = new $z1UIGuide.GuildCfg()).isWeek = !!g.Close;
              r.showHand = g.Finger;
              r.hideMask = !g.Mask;
              r.tipstring = g.Describe;
              r.showAni = !!g.ShowKing;
              switch (l) {
                case 0:
                  r.lightType = 1;
                  r.addSize = new cc.Size(0, 0);
                  r.distNode = this.togCon.toggleItems[1].node;
                  r.deviationTipsAll = cc.v2(0, g.Offset || 0);
                  r.callBack = function () {
                    i.togCon.toggleItems[1].isChecked = true;
                    i.showView(i.togCon.toggleItems[1]);
                  };
                  $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide15);
                  break;
                case 1:
                case 2:
                  if (e) {
                    r.lightType = 1;
                    r.addSize = new cc.Size(0, 0);
                    r.distNode = e;
                    r.deviationTipsAll = cc.v2(0, g.Offset || 0);
                    n && (r.callBack = n);
                    $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide16);
                  } else {
                    r = null;
                  }
              }
          }
          if (r) {
            this.openUICallBack($z1Config.UIID.UIGuide, function () {
              if (o[l + 1]) {
                $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().setStepId(l + 1);
              } else {
                $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().setGroupId(a + 1);
                $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().setStepId(0);
              }
            }, r);
          } else {
            this.sendEvent($z1Appcfg.BaseEventName.blocktouch, true);
          }
        }
      }
    }
  };
  cc__decorate([ccp_property({
    type: cc.ToggleContainer,
    tooltip: "切换按钮组"
  })], _ctor.prototype, "togCon", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "界面显示"
  })], _ctor.prototype, "ndMain", undefined);
  cc__decorate([ccp_property({
    type: cc.Prefab,
    tooltip: "装备"
  })], _ctor.prototype, "preWeap", undefined);
  cc__decorate([ccp_property({
    type: cc.Prefab,
    tooltip: "天赋"
  })], _ctor.prototype, "preTalent", undefined);
  cc__decorate([ccp_property({
    type: cc.Prefab,
    tooltip: "战斗"
  })], _ctor.prototype, "preBattle", undefined);
  cc__decorate([ccp_property({
    type: cc.Prefab,
    tooltip: "至宝"
  })], _ctor.prototype, "preTreasure", undefined);
  cc__decorate([ccp_property({
    type: cc.Prefab,
    tooltip: "商城"
  })], _ctor.prototype, "preShop", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIHome;
