var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1AudioMgr = require("AudioMgr");
var $z1LogMgr = require("LogMgr");
var $z1PoolMgr = require("PoolMgr");
var $z1SdkMgr = require("SdkMgr");
var $z1Utils = require("Utils");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallUtilLayout = require("KinghtFallUtilLayout");
var $z1KinghtFallItemGood = require("KinghtFallItemGood");
var $z1KinghtFallItemTreasure = require("KinghtFallItemTreasure");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUITreasureReward = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndCtr = null;
    e.labTime = null;
    e.spAni = null;
    e.ndLight = null;
    e.btnClose = null;
    e.btnOne = null;
    e.btnVideo = null;
    e.btnTen = null;
    e.bgOpacity = 230;
    e.getSkillList = [];
    e.type = 0;
    e.cfgBox = null;
    e.index = 0;
    e.canAni = false;
    e.time = 0;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (e, n) {
    t.prototype.init.call(this);
    this.getSkillList = e;
    this.type = n;
  };
  _ctor.prototype.onLoad = function () {
    var t = this;
    this.spAni.setCompleteListener(function () {
      "start" == t.spAni.animation && (t.canAni = true);
    });
  };
  _ctor.prototype.start = function () {
    var t = this;
    this.ndCtr.init(this.getSkillList.length);
    this.ndLight.x = this.ndLight.width + cc.winSize.width;
    this.stareAni();
    this.cfgBox = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBoxCfgById($z1KinghtFallEnum.KinghtFallEnumShopEnum.Treasure);
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
  };
  _ctor.prototype.initBtnListener = function () {
    var t = this;
    this.btnClose.on(cc.Node.EventType.TOUCH_END, function () {
      t.closeUI();
    }, this);
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
      }, null, "home.treasure.repeatDraw");
    }, this);
  };
  _ctor.prototype.upView = function () {
    var t = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getShopInfo($z1KinghtFallEnum.KinghtFallEnumShopEnum.Treasure);
    t || (t = {
      id: $z1KinghtFallEnum.KinghtFallEnumShopEnum.Treasure,
      time: 0,
      video: 0
    });
    this.labTime.string = $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTrea05), this.cfgBox.GuarantNumber - t.time);
    this.btnVideo.getChildByName("Layout").getChildByName("labNum").getComponent(cc.Label).string = t.video + "/" + this.cfgBox.VedioCount;
    this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.TreasureUpdate2);
  };
  _ctor.prototype.update = function (t) {
    var e = this;
    if (this.canAni && (this.time -= t, this.time <= 0)) {
      if (this.index == this.getSkillList.length) {
        this.canAni = false;
        this.btnClose.active = true;
        this.btnOne.active = 1 == this.type;
        this.btnTen.active = 2 == this.type;
        this.btnVideo.active = 3 == this.type;
        return void (this.labTime.node.active = true);
      }
      this.time = this.aniNormal(this.index);
      this.index++;
      if (this.index == this.getSkillList.length) {
        this.time = 1;
        this.ndLight.active = true;
        cc.tween(this.ndLight).set({
          position: cc.v3((this.ndLight.width + cc.winSize.width) / 2)
        }).to(1, {
          position: cc.v3(-(this.ndLight.width + cc.winSize.width) / 2)
        }).call(function () {
          e.canAni = false;
          e.ndLight.active = false;
        }).start();
      }
    }
  };
  _ctor.prototype.aniNormal = function (t) {
    switch ($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(this.getSkillList[this.index].item.id).type) {
      case $z1KinghtFallEnum.KinghtFallEnumGoodType.Type01:
        return this.aniNormal1(t);
      case $z1KinghtFallEnum.KinghtFallEnumGoodType.Type02:
        return this.aniNormal2(t);
    }
  };
  _ctor.prototype.aniNormal1 = function (t) {
    var e = this;
    var n = function (n) {
      n.setParent(e.ndCtr.node);
      var i = e.ndCtr.getPos(t);
      n.setPosition(i);
      n.active = true;
      n.setScale(1.5);
      n.getComponent($z1KinghtFallItemGood.default).initView(e.getSkillList[t].item);
      cc.tween(n).set({
        opacity: 0
      }).to(.3, {
        opacity: 255
      }).start();
    };
    var i = $z1PoolMgr.PoolMgr.getInstance().getNode($z1KinghtFallConfig.KinghtFallPoolName.ItemGood);
    if (i) {
      n(i);
    } else {
      this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.IconGood, $z1KinghtFallConfig.KinghtFallPrefabName.ItemGood, function (t) {
        i = cc.instantiate(t);
        $z1PoolMgr.PoolMgr.getInstance().creatrePool($z1KinghtFallConfig.KinghtFallPoolName.ItemGood, cc.instantiate(t), 10);
        n(i);
      });
    }
    return .1;
  };
  _ctor.prototype.aniNormal2 = function (t) {
    var e = this;
    var n = function (n) {
      n.setParent(e.ndCtr.node);
      var i = e.ndCtr.getPos(t);
      n.setPosition(i);
      n.active = true;
      n.setScale(1);
      n.getComponent($z1KinghtFallItemTreasure.default).initView(e.getSkillList[t].item);
      n.getComponent($z1KinghtFallItemTreasure.default).setNew(e.getSkillList[t].isNew);
      cc.tween(n).set({
        opacity: 0
      }).to(.3, {
        opacity: 255
      }).start();
    };
    this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.IconGood, $z1KinghtFallConfig.KinghtFallPrefabName.ItemTreasure, function (t) {
      n(cc.instantiate(t));
    });
    return .1;
  };
  _ctor.prototype.getReward = function (t) {
    var e = this;
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
      var c = undefined;
      n.time++;
      if (n.time >= this.cfgBox.GuarantNumber) {
        n.time -= this.cfgBox.GuarantNumber;
        c = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBannerCfg(this.cfgBox.GuarantBanner);
      } else {
        c = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBannerCfg(this.cfgBox.Banner);
      }
      var h = [];
      for (var u = 0; u < c.length; u++) {
        var d = c[u];
        h.push({
          id: d.RewardID,
          weight: d.Weight
        });
      }
      var f = $z1Utils.Utils.weight_rand(h);
      $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfgById(f.id).Quality <= 2 && (n.time = 0);
      o(f.id);
      r() && o(f.id);
    }
    $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().setShopInfo(n);
    this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 8);
    this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.TreasureUpdate);
    this.upView();
    this.getSkillList = a;
    this.ndCtr.init(this.getSkillList.length);
    this.ndCtr.node.removeAllChildren();
    this.scheduleOnce(function () {
      e.stareAni();
    });
  };
  _ctor.prototype.stareAni = function () {
    this.spAni.setAnimation(0, "start", false);
    this.spAni.addAnimation(0, "idle", true);
    $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.item_reward);
    this.index = 0;
    this.ndCtr.node.y = 0;
    this.btnClose.active = false;
    this.btnOne.active = false;
    this.btnVideo.active = false;
    this.btnTen.active = false;
    this.labTime.node.active = false;
  };
  cc__decorate([ccp_property($z1KinghtFallUtilLayout.KinghtFallUtilLayout)], _ctor.prototype, "ndCtr", undefined);
  cc__decorate([ccp_property({
    type: cc.RichText,
    tooltip: "保底次数"
  })], _ctor.prototype, "labTime", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "关闭"
  })], _ctor.prototype, "spAni", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "关闭"
  })], _ctor.prototype, "ndLight", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "关闭"
  })], _ctor.prototype, "btnClose", undefined);
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
}($z1BaseUI.default);
exports.default = def_KinghtFallUITreasureReward;