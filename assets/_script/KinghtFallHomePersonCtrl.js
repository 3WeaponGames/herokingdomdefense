var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseCtrl = require("BaseCtrl");
var $z1BaseButton = require("BaseButton");
var $z1AudioMgr = require("AudioMgr");
var $z1UIMgr = require("UIMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallMissionData = require("KinghtFallMissionData");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallPlayAniCtrl = require("KinghtFallPlayAniCtrl");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallHomePersonCtrl = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ctrPlayAni = null;
    e.labPower = null;
    e.spPower = null;
    e.ndItemTop = [];
    e.labNum = [];
    e.scrView = null;
    e.ndItemDown = [];
    e.nodeInfo = [];
    e.levelLimit = 0;
    e.nextLevel = 0;
    e.subNum = 1;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    var t;
    var e = this;
    var n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTreasureLevel($z1KinghtFallEnum.KinghtFallEnumTreasureEnum.ForgeAmulet);
    if (n) {
      var i = null === (t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfgById($z1KinghtFallEnum.KinghtFallEnumTreasureEnum.ForgeAmulet).levelInfo[n.level - 1]) || undefined === t ? undefined : t.param;
      i && (this.subNum = 1 - i[0]);
    }
    this.cfgEquip = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getEquipCfgList();
    var a = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage();
    var o = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getLevelCfgById2(a);
    this.levelLimit = o.EquipLevelCap;
    this.nextLevel = 5 * ((a - 1) / 5 + 1);
    this.spPower.node.active = false;
    var r = function (t) {
      var n = s.cfgEquip[t];
      s.nodeInfo[n.id - 1] = {
        type: n.id,
        cfg: n,
        ndItem: s.ndItemTop[t],
        labNum: s.labNum[t],
        ndInfo: s.ndItemDown[t]
      };
      s.ndItemTop[t].getChildByName("spAni").active = false;
      s.ndItemDown[t].getChildByName("btnUpgeade").on(cc.Node.EventType.TOUCH_END, function () {
        e.onUpgeade(n.id);
      }, s);
      s.ndItemDown[t].getChildByName("btnLock").on(cc.Node.EventType.TOUCH_END, function () {
        e.onUpgeade(n.id);
      }, s);
      s.ndItemDown[t].getChildByName("btnLock").getChildByName("labNum").getComponent(cc.Label).string = $z1Utils.Utils.StringFormat(s.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomePerson03), s.nextLevel);
    };
    var s = this;
    for (var l = 0; l < this.cfgEquip.length; l++) {
      r(l);
    }
    this.scrView.node.height = cc.winSize.height / 2 + this.scrView.node.y - 120;
    this.scrView.node.children[0].getComponent(cc.Widget).updateAlignment();
    this.initView();
    this.initEventListener();
    this.scheduleOnce(function () {
      e.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 4, e.nodeInfo[0].ndInfo.getChildByName("btnUpgeade"));
    }, .5);
  };
  _ctor.prototype.initEventListener = function () {
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.RefreshGold, this.initBtnView);
  };
  _ctor.prototype.initView = function () {
    var t = 0;
    var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getGoldNum();
    var n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage();
    var i = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxOrder();
    var a = function (a) {
      var r = o.nodeInfo[a];
      var l = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getPersonLevel(r.type);
      var c = true;
      r.cfg.Unlock && (c = r.cfg.Unlock[0] < n || !(r.cfg.Unlock[0] > n) && r.cfg.Unlock[1] < i);
      o.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconCharacter, r.cfg.levelInfo[l - 1].Image, function (t) {
        r.ndItem.getChildByName("sprIcon").getComponent(cc.Sprite).spriteFrame = t;
        r.ndInfo.getChildByName("ndItem").getChildByName("sprIcon").getComponent(cc.Sprite).spriteFrame = t;
      });
      o.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, r.cfg.levelInfo[l - 1].EquipBottom, function (t) {
        r.ndItem.getComponent(cc.Sprite).spriteFrame = t;
        r.ndInfo.getChildByName("ndItem").getComponent(cc.Sprite).spriteFrame = t;
      });
      r.ndItem.getChildByName("labPower").getComponent(cc.Label).string = $z1Utils.Utils.StringFormat(o.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTrea02), l);
      r.ndInfo.getChildByName("ndItem").getChildByName("labPower").getComponent(cc.Label).string = $z1Utils.Utils.StringFormat(o.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTrea02), l);
      var g = r.ndInfo.getChildByName("ndLay");
      r.labNum.string = $z1Utils.Utils.StringFormat(o.T(r.cfg.Describe), r.cfg.levelInfo[l - 1].Parameters);
      g.getChildByName("labNum1").getComponent(cc.Label).string = $z1Utils.Utils.StringFormat(o.T(r.cfg.Describe), r.cfg.levelInfo[l - 1].Parameters);
      r.ndInfo.getChildByName("labName").getComponent(cc.Label).string = o.T(r.cfg.levelInfo[l - 1].EquipName);
      if (c) {
        g.active = true;
        r.ndInfo.getChildByName("ndLock").active = false;
        if (l >= o.levelLimit) {
          r.ndInfo.getChildByName("btnUpgeade").active = false;
          r.ndInfo.getChildByName("btnLock").active = l < r.cfg.levelInfo.length;
        } else {
          r.ndInfo.getChildByName("btnLock").active = false;
          if (l >= r.cfg.levelInfo.length) {
            g.getChildByName("ndArr").active = false;
            g.getChildByName("labNum2").active = false;
            r.ndInfo.getChildByName("btnUpgeade").active = false;
          } else {
            g.getChildByName("ndArr").active = true;
            g.getChildByName("labNum2").active = true;
            r.ndInfo.getChildByName("btnUpgeade").active = true;
            g.getChildByName("labNum2").getComponent(cc.Label).string = "" + r.cfg.levelInfo[l].Parameters;
            var u = Math.floor(r.cfg.levelInfo[l - 1].GoldCost * o.subNum);
            r.ndInfo.getChildByName("btnUpgeade").getChildByName("Layout").getChildByName("labNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(u);
            r.ndInfo.getChildByName("btnUpgeade").getComponent($z1BaseButton.BaseButton).interactable = e >= u;
          }
        }
        switch (r.type) {
          case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Body:
            t += r.cfg.levelInfo[l - 1].Parameters;
            break;
          case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Head:
          case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Arrow:
            t += 5 * r.cfg.levelInfo[l - 1].Parameters;
            break;
          case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Bow:
            t += r.cfg.levelInfo[l - 1].Parameters;
            break;
          case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Gloves:
            t += 400 * r.cfg.levelInfo[l - 1].Parameters;
            break;
          case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.horse:
            t += 2 * r.cfg.levelInfo[l - 1].Parameters;
        }
      } else {
        g.active = false;
        r.ndInfo.getChildByName("ndLock").active = true;
        r.ndInfo.getChildByName("ndLock").getComponentInChildren(cc.Label).string = $z1Utils.Utils.StringFormat(o.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomePerson04), r.cfg.Unlock[0], r.cfg.Unlock[1]);
        r.ndInfo.getChildByName("btnUpgeade").active = false;
        r.ndInfo.getChildByName("btnLock").active = false;
      }
    };
    var o = this;
    for (var r = 0; r < this.nodeInfo.length; r++) {
      a(r);
    }
    this.labPower.string = $z1KinghtFallModle.default.getInstance().numberFomat(Math.floor(t));
    this.ctrPlayAni.initView();
  };
  _ctor.prototype.initBtnView = function () {
    var t = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getGoldNum();
    for (var e = 0; e < this.nodeInfo.length; e++) {
      var n = this.nodeInfo[e];
      var i = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getPersonLevel(n.type);
      if (i >= n.cfg.levelInfo.length) {
        ;
      } else {
        var a = Math.floor(n.cfg.levelInfo[i - 1].GoldCost * this.subNum);
        n.ndInfo.getChildByName("btnUpgeade").getComponent($z1BaseButton.BaseButton).interactable = t >= a;
      }
    }
  };
  _ctor.prototype.onUpgeade = function (t) {
    var e = this;
    var n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getPersonLevel(t);
    if (n >= this.levelLimit) {
      $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UIHome, $z1KinghtFallTextConfig.KinghtFallTextConfig.HomePerson02);
    } else {
      var i = Math.floor(this.cfgEquip[t - 1].levelInfo[n - 1].GoldCost * this.subNum);
      if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().subGoldNum(i)) {
        $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.EquipUp, 1);
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.equip_X, t);
        $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.level_up);
        $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().setPersonLevel(t, n + 1);
        this.initView();
        this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 1);
        var a = this.nodeInfo[t - 1].ndItem.getChildByName("spAni").getComponent(sp.Skeleton);
        a.node.active = true;
        var o = a.setAnimation(0, "animation", false);
        a.setTrackCompleteListener(o, function () {
          a.node.active = false;
        });
        this.spPower.node.active = true;
        var r = this.spPower.setAnimation(0, "animation", false);
        this.spPower.setTrackCompleteListener(r, function () {
          e.spPower.node.active = false;
        });
      } else {
        $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIAddCurrency, $z1Config.UIID.UIHome, $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin);
      }
    }
  };
  cc__decorate([ccp_property({
    type: $z1KinghtFallPlayAniCtrl.default,
    tooltip: "玩家动画"
  })], _ctor.prototype, "ctrPlayAni", undefined);
  cc__decorate([ccp_property({
    type: cc.Label,
    tooltip: "战力"
  })], _ctor.prototype, "labPower", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "战力"
  })], _ctor.prototype, "spPower", undefined);
  cc__decorate([ccp_property({
    type: [cc.Node],
    tooltip: "战力"
  })], _ctor.prototype, "ndItemTop", undefined);
  cc__decorate([ccp_property({
    type: [cc.Label],
    tooltip: "数值"
  })], _ctor.prototype, "labNum", undefined);
  cc__decorate([ccp_property({
    type: cc.ScrollView,
    tooltip: "具体信息"
  })], _ctor.prototype, "scrView", undefined);
  cc__decorate([ccp_property({
    type: [cc.Node],
    tooltip: "等级"
  })], _ctor.prototype, "ndItemDown", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.default = def_KinghtFallHomePersonCtrl;