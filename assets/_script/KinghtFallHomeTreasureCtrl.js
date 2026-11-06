var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseCtrl = require("BaseCtrl");
var $z1Appcfg = require("Appcfg");
var $z1AudioMgr = require("AudioMgr");
var $z1LogMgr = require("LogMgr");
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
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallHomeTreasureCtrl = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.labNum = null;
    e.ndParent = null;
    e.ndItem = null;
    e.labBox = null;
    e.labTime = null;
    e.btnOne = null;
    e.btnVideo = null;
    e.btnTen = null;
    e.cfgBox = null;
    e.ndInfo = [];
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    var t = this;
    this.ndItem.active = false;
    this.initEventListener();
    this.initData();
    this.initView();
    this.cfgBox = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBoxCfgById($z1KinghtFallEnum.KinghtFallEnumShopEnum.Treasure);
    this.labBox.string = this.T(this.cfgBox.Name);
    this.initBtnListener();
    var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(this.cfgBox.Cost[0]);
    this.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, e.icon, function (e) {
      t.btnOne.getChildByName("Layout").getChildByName("sprIcon").getComponent(cc.Sprite).spriteFrame = e;
    });
    this.btnOne.getChildByName("Layout").getChildByName("labNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(this.cfgBox.Cost[1]);
    var n = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(this.cfgBox.Cost10[0]);
    this.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, n.icon, function (e) {
      t.btnTen.getChildByName("Layout").getChildByName("sprIcon").getComponent(cc.Sprite).spriteFrame = e;
    });
    this.btnTen.getChildByName("Layout").getChildByName("labNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(this.cfgBox.Cost10[1]);
    this.upView();
    this.scheduleOnce(function () {
      t.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 5, t.btnOne, function () {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.box_draw1);
        t.getReward(1, 1);
      });
    }, .5);
  };
  _ctor.prototype.initEventListener = function () {
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.TreasureUpdate, this.initView);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.TreasureUpdate2, this.upView);
    this.addEvent($z1Appcfg.BaseEventName.CloseUI, this.onCloseUI);
  };
  _ctor.prototype.initData = function () {
    var t = this;
    var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfg();
    var n = function (n) {
      var a = e[n];
      var o = cc.instantiate(i.ndItem);
      o.parent = i.ndParent;
      o.active = true;
      o.on(cc.Node.EventType.TOUCH_END, function () {
        t.onClick(a);
      }, i);
      var r = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(a.goodID);
      i.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, r.sprBg, function (t) {
        o.getChildByName("sprBg").getComponent(cc.Sprite).spriteFrame = t;
      });
      i.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, r.icon, function (t) {
        o.getChildByName("sprIcon").getComponent(cc.Sprite).spriteFrame = t;
      });
      o.name = "treasure_" + a.ID;
      cc.tween(o.getChildByName("ndArr")).set({
        y: 40
      }).to(.2, {
        y: 45
      }).to(.4, {
        y: 35
      }).to(.2, {
        y: 40
      }).union().repeatForever().start();
      i.ndInfo.push({
        cfg: a,
        node: o,
        info: $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTreasureLevel(a.ID)
      });
    };
    var i = this;
    for (var a = 0; a < e.length; a++) {
      n(a);
    }
  };
  _ctor.prototype.initView = function () {
    var t = 0;
    for (var e = 0; e < this.ndInfo.length; e++) {
      (i = this.ndInfo[e]).info = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTreasureLevel(i.cfg.ID);
      i.info && t++;
    }
    this.ndInfo.sort(function (t, e) {
      if (t.info && e.info) {
        if (t.cfg.Quality == e.cfg.Quality) {
          return t.cfg.ID - e.cfg.ID;
        } else {
          return t.cfg.Quality - e.cfg.Quality;
        }
      } else {
        if (t.info) {
          return -1;
        } else {
          if (e.info) {
            return 1;
          } else {
            if (t.cfg.Quality == e.cfg.Quality) {
              return t.cfg.ID - e.cfg.ID;
            } else {
              return t.cfg.Quality - e.cfg.Quality;
            }
          }
        }
      }
    });
    var n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getGoldNum();
    for (e = 0; e < this.ndInfo.length; e++) {
      var i;
      (i = this.ndInfo[e]).node.zIndex = e;
      if (i.info) {
        i.node.getChildByName("labNum").getComponent(cc.Label).string = $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTrea02), i.info.level);
        i.node.getChildByName("ndMask").active = false;
        var a = false;
        i.info.level < i.cfg.levelInfo.length && i.cfg.levelInfo[i.info.level - 1].GoldCost <= n && i.cfg.levelInfo[i.info.level - 1].PieceCost <= i.info.frame && (a = true);
        i.node.getChildByName("ndArr").active = a;
        var o = i.node.getChildByName("ndPro");
        if (i.info.level >= i.cfg.levelInfo.length) {
          o.active = false;
        } else {
          o.active = true;
          o.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = i.info.frame / i.cfg.levelInfo[i.info.level - 1].PieceCost;
          o.getChildByName("labPro").getComponent(cc.Label).string = i.info.frame + "/" + i.cfg.levelInfo[i.info.level - 1].PieceCost;
        }
      } else {
        i.node.getChildByName("labNum").getComponent(cc.Label).string = this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTrea01);
        i.node.getChildByName("ndMask").active = true;
        i.node.getChildByName("ndArr").active = false;
        i.node.getChildByName("ndPro").active = false;
      }
    }
    this.labNum.string = t + "/" + this.ndInfo.length;
  };
  _ctor.prototype.onClick = function (t) {
    $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UITreasureInfo, $z1Config.UIID.UINONE, t);
  };
  _ctor.prototype.initBtnListener = function () {
    var t = this;
    this.btnOne.on(cc.Node.EventType.TOUCH_END, function () {
      var e = {
        id: t.cfgBox.Cost[0],
        num: t.cfgBox.Cost[1]
      };
      if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().trySub([e], true)) {
        $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().SubGood([e]);
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.box_draw1);
        t.getReward(1, 1);
      }
    }, this);
    this.btnTen.on(cc.Node.EventType.TOUCH_END, function () {
      var e = {
        id: t.cfgBox.Cost10[0],
        num: t.cfgBox.Cost10[1]
      };
      if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().trySub([e], true)) {
        $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().SubGood([e]);
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.box_draw10);
        t.getReward(10, 2);
      }
    }, this);
    this.btnVideo.on(cc.Node.EventType.TOUCH_END, function () {
      $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.box_1);
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_box_1_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
        var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getShopInfo($z1KinghtFallEnum.KinghtFallEnumShopEnum.Treasure);
        e || (e = {
          id: $z1KinghtFallEnum.KinghtFallEnumShopEnum.Treasure,
          time: 0,
          video: 0
        });
        e.video++;
        if (e.video >= t.cfgBox.VedioCount) {
          e.video -= t.cfgBox.VedioCount;
          t.getReward(1, 3);
        } else {
          $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().setShopInfo(e);
          t.upView();
        }
      });
    }, this);
  };
  _ctor.prototype.getReward = function (t, e) {
    $z1AudioMgr.AudioMgr.getInstance().playEffect($z1KinghtFallConfig.KinghtFallAudioId.box_treasure);
    var n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getShopInfo($z1KinghtFallEnum.KinghtFallEnumShopEnum.Treasure);
    n || (n = {
      id: $z1KinghtFallEnum.KinghtFallEnumShopEnum.Treasure,
      time: 0,
      video: 0
    });
    var i = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getTaskInfo();
    if (i.type == $z1KinghtFallEnum.KinghtFallEnumTaskEnum.TreasureCount) {
      i.num += t;
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().setTaskInfo(i);
    }
    var a = [];
    var o = function (t) {
      var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTreasureLevel(t);
      var n = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfgById(t);
      var i = 0;
      for (var o = e ? e.level : 1; o <= n.levelInfo.length; o++) {
        i += n.levelInfo[o - 1].PieceCost;
      }
      if (e) {
        if (e.frame >= i) {
          a.push({
            item: {
              id: n.Conversion[0],
              num: n.Conversion[1]
            },
            isNew: false
          });
          $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().addRewards([{
            id: n.Conversion[0],
            num: n.Conversion[1]
          }]);
        } else {
          e.frame++;
          a.push({
            item: {
              id: n.goodID,
              num: 1
            },
            isNew: false
          });
          $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().setTreasureLevel(e);
        }
      } else {
        e = {
          id: t,
          level: 1,
          frame: 0
        };
        a.push({
          item: {
            id: n.goodID,
            num: 1
          },
          isNew: true
        });
        $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().setTreasureLevel(e);
      }
    };
    var r = function () {
      var t;
      var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTreasureLevel($z1KinghtFallEnum.KinghtFallEnumTreasureEnum.SignOfMultiplication);
      if (e) {
        var n = null === (t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfgById($z1KinghtFallEnum.KinghtFallEnumTreasureEnum.SignOfMultiplication).levelInfo[e.level - 1]) || undefined === t ? undefined : t.param;
        if (n && Math.random() <= n[0]) {
          $z1LogMgr.LogMgr.getInstance().info("***倍增之符");
          return true;
        }
      }
      return false;
    };
    for (var s = 0; s < t; s++) {
      var h = undefined;
      n.time++;
      if (n.time >= this.cfgBox.GuarantNumber) {
        n.time -= this.cfgBox.GuarantNumber;
        h = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBannerCfg(this.cfgBox.GuarantBanner);
      } else {
        h = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBannerCfg(this.cfgBox.Banner);
      }
      var p = [];
      for (var f = 0; f < h.length; f++) {
        var y = h[f];
        p.push({
          id: y.RewardID,
          weight: y.Weight
        });
      }
      var b = $z1Utils.Utils.weight_rand(p);
      $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfgById(b.id).Quality <= 2 && (n.time = 0);
      o(b.id);
      r() && o(b.id);
    }
    $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UITreasureReward, $z1Config.UIID.UINONE, a, e);
    $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().setShopInfo(n);
    this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 8);
    this.initView();
    this.upView();
  };
  _ctor.prototype.upView = function () {
    var t = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getShopInfo($z1KinghtFallEnum.KinghtFallEnumShopEnum.Treasure);
    t || (t = {
      id: $z1KinghtFallEnum.KinghtFallEnumShopEnum.Treasure,
      time: 0,
      video: 0
    });
    this.labTime.string = $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTrea03), this.cfgBox.GuarantNumber - t.time);
    this.btnVideo.getChildByName("Layout").getChildByName("labNum").getComponent(cc.Label).string = t.video + "/" + this.cfgBox.VedioCount;
  };
  _ctor.prototype.onCloseUI = function (t) {
    t == $z1KinghtFallConfig.KinghtFallUIID.UITreasureReward && this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 5, this.ndInfo[0].node);
  };
  cc__decorate([ccp_property({
    type: cc.Label,
    tooltip: "盒子"
  })], _ctor.prototype, "labNum", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "节点信息"
  })], _ctor.prototype, "ndParent", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "节点信息"
  })], _ctor.prototype, "ndItem", undefined);
  cc__decorate([ccp_property({
    type: cc.Label,
    tooltip: "盒子"
  })], _ctor.prototype, "labBox", undefined);
  cc__decorate([ccp_property({
    type: cc.RichText,
    tooltip: "保底次数"
  })], _ctor.prototype, "labTime", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "抽一次"
  })], _ctor.prototype, "btnOne", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "抽一次"
  })], _ctor.prototype, "btnVideo", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "抽一次"
  })], _ctor.prototype, "btnTen", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.default = def_KinghtFallHomeTreasureCtrl;