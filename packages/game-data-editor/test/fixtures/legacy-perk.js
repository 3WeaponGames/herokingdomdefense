var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
var cc__spreadArrays = __spreadArrays;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BasePlatform = require("BasePlatform");
var $z1BaseUI = require("BaseUI");
var $z1Appcfg = require("Appcfg");
var $z1PlatformSetting = require("PlatformSetting");
var $z1SdkMgr = require("SdkMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1UIGuide = require("UIGuide");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIBuff = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndItem = null;
    e.ndParent = null;
    e.sprfIconList = [];
    e.sprfBgList = [];
    e.ndTitle = null;
    e.btnRefresh = null;
    e.btnGetAll = null;
    e.callBack = null;
    e.ndItemList = [];
    e.canOutBuff = [];
    e.minQua = 3;
    e.selInfo = [];
    e.isAni = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t) {
    this.callBack = t;
  };
  _ctor.prototype.start = function () {
    var t = this;
    this.initData();
    this.initBtnView();
    this.onRefreshBuff();
    this.ndItem.active = false;
    var e = function (e) {
      var i = cc.instantiate(n.ndItem);
      i.parent = n.ndParent;
      i.active = true;
      i.setPosition(0, 0);
      n.ndItemList[e] = i;
      n.showItem(e);
      i.on(cc.Node.EventType.TOUCH_END, function () {
        t.clickItem(e);
      }, n);
    };
    var n = this;
    for (var i = 0; i < 3; i++) {
      e(i);
    }
    this.btnRefresh.on(cc.Node.EventType.TOUCH_END, function () {
      $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.buff_1);
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_buff_1_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
        t.onRefreshBuff(true);
        t.initBtnView();
        for (var e = 0; e < 3; e++) {
          t.showItem(e);
        }
        t.showAni();
      }, null, "battle.buff.refresh");
    }, this);
    this.btnGetAll.active = true;
    this.btnGetAll.on(cc.Node.EventType.TOUCH_END, function () {
      $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.buff_3);
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_buff_3_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
        t.isAni = true;
        for (var e = 0; e < t.ndItemList.length; e++) {
          var n = t.ndItemList[e];
          if (0 == e) {
            cc.tween(n).to(.1, {
              scale: 1.2
            }).delay(.1).call(function () {
              t.callBack(t.selInfo);
              t.closeUI();
            }).start();
          } else {
            cc.tween(n).to(.1, {
              scale: 1.2
            }).delay(.1).start();
          }
        }
      }, null, "battle.buff.takeAll");
    }, this);
    this.showAni();
    this.startGuide();
  };
  _ctor.prototype.initData = function () {
    var t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBuffCfgList();
    var e = function (t) {
      var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.buffList;
      for (var n = 0; n < e.length; n++) {
        if (e[n].id == t) {
          return true;
        }
      }
      return false;
    };
    var n = function (t) {
      var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTalent();
      for (var n = 0; n < e.length; n++) {
        var i = e[n];
        if (i.isLock && $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTalentLevelCfgById(i.id).kindID == t) {
          return true;
        }
      }
      return false;
    };
    for (var i = 0; i < t.length; i++) {
      var a = t[i];
      if (!e(a.ID)) {
        if (a.Unlock) {
          n(a.Unlock) && this.canOutBuff.push({
            id: a.ID,
            qua: a.Quality,
            weight: a.Weight
          });
        } else {
          this.canOutBuff.push({
            id: a.ID,
            qua: a.Quality,
            weight: a.Weight
          });
        }
      }
    }
  };
  _ctor.prototype.showAni = function () {
    var t = this;
    this.isAni = true;
    cc.tween(this.ndTitle).set({
      scale: 0
    }).to(.06, {
      scale: 1
    }).start();
    for (var e = 0; e < 3; e++) {
      var n = this.ndItemList[e];
      cc.tween(n).set({
        scale: 0
      }).to(.06 + .18 * e, {
        scale: 1
      }).to(.06, {
        scale: 1.2
      }).to(.06, {
        scale: 1
      }).start();
    }
    cc.tween(this.btnRefresh.parent).set({
      scale: 0
    }).delay(.53).to(.06, {
      scale: 1
    }).to(.06, {
      scale: 1.2
    }).to(.06, {
      scale: 1
    }).call(function () {
      t.isAni = false;
    }).start();
  };
  _ctor.prototype.initEvent = function () {
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, this.startGuide);
  };
  _ctor.prototype.initBtnView = function () {
    var t = this.btnRefresh.getChildByName("layout1").getChildByName("labQue").getComponent(cc.Label);
    switch (this.minQua) {
      case 2:
        t.node.color = new cc.Color().fromHEX("#1FDDFF");
        t.string = this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameBuff02);
        break;
      case 3:
        t.node.color = new cc.Color().fromHEX("#e95cff");
        t.string = this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameBuff03);
    }
  };
  _ctor.prototype.onRefreshBuff = function (t) {
    var e = this;
    undefined === t && (t = false);
    var n = cc__spreadArrays(this.canOutBuff);
    this.selInfo = [];
    var i = function (t) {
      e.selInfo.push(t);
      for (var i = 0; i < n.length; i++) {
        if (n[i].id == t) {
          n.splice(i, 1);
          break;
        }
      }
    };
    if (t) {
      var a = [];
      for (var o = 0; o < this.canOutBuff.length; o++) {
        var s = this.canOutBuff[o];
        s.qua >= this.minQua && a.push(s);
      }
      i($z1Utils.Utils.weight_rand(a).id);
    }
    for (; this.selInfo.length < 3 && n.length > 0;) {
      i($z1Utils.Utils.weight_rand(n).id);
    }
    this.selInfo.sort(function () {
      return Math.random() - .5;
    });
  };
  _ctor.prototype.showItem = function (t) {
    var e = this.ndItemList[t];
    if (this.selInfo[t]) {
      var n = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBuffCfgById(this.selInfo[t]);
      var i = e.getChildByName("spAniBg").getComponent(sp.Skeleton);
      var a = e.getChildByName("spAniIcon");
      var o = e.getChildByName("sprIcon").getComponent(cc.Sprite);
      var s = e.getChildByName("labInfo").getComponent(cc.RichText);
      e.getChildByName("sprBg").getComponent(cc.Sprite).spriteFrame = this.sprfBgList[n.Quality - 1];
      e.getChildByName("sprIocnBg").getComponent(cc.Sprite).spriteFrame = this.sprfIconList[n.Quality - 1];
      switch (n.Quality) {
        case 1:
        case 2:
          i.node.active = false;
          a.active = false;
          break;
        case 3:
          i.node.active = true;
          i.setSkin("zise");
          a.active = true;
          break;
        case 4:
          i.node.active = true;
          i.setSkin("jinse");
          a.active = true;
      }
      this.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconBuff, n.Image, function (t) {
        o.spriteFrame = t;
      });
      var l = [];
      for (var c = 0; c < n.Pamer.length; c++) {
        if (n.isPerecentage && n.isPerecentage[c]) {
          l.push(Math.ceil(1e4 * n.Pamer[c] / 100) + "%");
        } else {
          l.push("" + n.Pamer[c]);
        }
      }
      s.string = require("LanguageMgr").LanguageMgr.getInstance().format("<b><outline color=#000000 width=4>{0}</outline></b>", [$z1Utils.Utils.StringFormat.apply($z1Utils.Utils, cc__spreadArrays([n.Describe], l))]);
    } else {
      e.active = false;
    }
  };
  _ctor.prototype.clickItem = function (t) {
    var e = this;
    if (!this.isAni) {
      this.isAni = true;
      for (var n = 0; n < this.ndItemList.length; n++) {
        var i = this.ndItemList[n];
        if (t == n) {
          cc.tween(i).to(.1, {
            scale: 1.2
          }).delay(.1).call(function () {
            e.callBack([e.selInfo[t]]);
            e.closeUI();
          }).start();
        } else {
          cc.tween(i).to(.1, {
            scaleX: 0
          }).start();
        }
      }
    }
  };
  _ctor.prototype.startGuide = function () {
    if ($z1PlatformSetting.PlatformSetting.currentPlatform != $z1BasePlatform.Platform.WEB_LINK) {
      var t = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getGroupId();
      var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGuideCfgById(t);
      if (!(e.length <= 0)) {
        var n;
        var i = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getStepId();
        var a = e[i];
        switch (t) {
          case 3:
            (n = new $z1UIGuide.GuildCfg()).isWeek = !!a.Close;
            n.showHand = a.Finger;
            n.hideMask = !a.Mask;
            n.tipstring = a.Describe;
            n.showAni = !!a.ShowKing;
            switch (i) {
              case 0:
                n.distNode = this.ndParent;
                n.deviationTipsAll = cc.v2(0, a.Offset || 0);
                n.lightType = 1;
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide9);
            }
        }
        if (n) {
          this.openUICallBack($z1Config.UIID.UIGuide, function () {
            if (e[i + 1]) {
              $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().setStepId(i + 1);
            } else {
              $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().setGroupId(t + 1);
              $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().setStepId(0);
            }
          }, n);
        } else {
          this.sendEvent($z1Appcfg.BaseEventName.blocktouch, true);
        }
      }
    }
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndItem", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndParent", undefined);
  cc__decorate([ccp_property([cc.SpriteFrame])], _ctor.prototype, "sprfIconList", undefined);
  cc__decorate([ccp_property([cc.SpriteFrame])], _ctor.prototype, "sprfBgList", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndTitle", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnRefresh", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnGetAll", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIBuff;