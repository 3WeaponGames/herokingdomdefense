var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1List = require("List");
var $z1PoolMgr = require("PoolMgr");
var $z1SdkMgr = require("SdkMgr");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallItemGood = require("KinghtFallItemGood");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIPassport = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndTop = null;
    e.btnClose = null;
    e.btnClaimAll = null;
    e.ctrList = null;
    e.bpLevel = 0;
    e.bpExp = 0;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    this.cfgList = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getPassCfg();
    this.ctrList.tmpNode.active = false;
    this.initView();
    this.btnClose.on(cc.Node.EventType.TOUCH_END, this.closeUI, this);
    this.btnClaimAll.on(cc.Node.EventType.TOUCH_END, this.onClaimAll, this);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.TimeUpdate, this.refreshRewardAvailability);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, this.refreshRewardAvailability);
  };
  _ctor.prototype.initView = function () {
    this.initData();
    this.ctrList.numItems = this.cfgList.length + 1;
    this.refreshClaimAllButton();
  };
  _ctor.prototype.initData = function () {
    this.bpLevel = 0;
    this.bpExp = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getAchPoint();
    while (this.cfgList[this.bpLevel] && this.bpExp >= this.cfgList[this.bpLevel].LevelCost) {
      this.bpExp -= this.cfgList[this.bpLevel].LevelCost;
      this.bpLevel++;
    }
    this.ndTop.getChildByName("labLevel").getComponent(cc.Label).string = "" + this.bpLevel;
    if (this.cfgList[this.bpLevel]) {
      this.ndTop.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = this.bpExp / this.cfgList[this.bpLevel].LevelCost;
      this.ndTop.getChildByName("labPro").getComponent(cc.Label).string = this.bpExp + "/" + this.cfgList[this.bpLevel].LevelCost;
    } else {
      this.ndTop.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = 1;
      this.ndTop.getChildByName("labPro").getComponent(cc.Label).string = "" + this.bpExp;
    }
  };
  _ctor.prototype.refreshRewardAvailability = function () {
    var previousLevel = this.bpLevel;
    this.initData();
    if (previousLevel !== this.bpLevel) this.ctrList.numItems = this.cfgList.length + 1;
    this.refreshClaimAllButton();
  };
  _ctor.prototype.getClaimableFreeRewards = function (rows) {
    var level = this.bpLevel;
    var mission = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData();
    return (rows || this.cfgList).filter(function (row) {
      return level >= row.ID && !(mission.getAchReward(row.ID) & 1);
    });
  };
  _ctor.prototype.refreshClaimAllButton = function () {
    var available = !this.claimingRewards && this.getClaimableFreeRewards().length > 0;
    this.btnClaimAll.getComponent(cc.Button).interactable = available;
    this.btnClaimAll.getChildByName("bgDisabled").active = !available;
  };
  _ctor.prototype.onClaimAll = function () {
    this.claimFreeRewards(this.cfgList, this.btnClaimAll.convertToWorldSpaceAR(cc.v2(0, 0)), true);
  };
  _ctor.prototype.claimFreeRewards = function (rows, position, showRewards) {
    if (this.claimingRewards) return;
    this.initData();
    var available = this.getClaimableFreeRewards(rows);
    if (!available.length) return void this.refreshClaimAllButton();
    var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
    var rewards = [];
    available.forEach(function (row) {
      var reward = rewards.filter(function (item) { return item.id === row.Reward1[0]; })[0];
      if (reward) reward.num += row.Reward1[1];
      else rewards.push({ id: row.Reward1[0], num: row.Reward1[1] });
    });
    this.claimingRewards = true;
    try {
      var granted = player.claimRewards(rewards, 1, position, function () {
        available.forEach(function (row) { player.getMissionData().setAchReward(row.ID, 1); });
      }, function () { return available.every(function (row) { return !(player.getMissionData().getAchReward(row.ID) & 1); }); });
      if (!granted) return;
      available.forEach(function (row) {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.token_normal_X, row.ID);
      });
      if (showRewards) this.openUI($z1KinghtFallConfig.KinghtFallUIID.UIGoldReward, rewards);
    } finally {
      this.claimingRewards = false;
      this.initView();
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 31);
    }
  };
  _ctor.prototype.initItemView = function (t, e) {
    var n = this;
    t.active = true;
    var i = t.getChildByName("ndLeft");
    var a = t.getChildByName("ndRight");
    var o = t.getChildByName("ndPro");
    if (0 == e) {
      i.children.forEach(function (t) {
        t.active = false;
      });
      a.children.forEach(function (t) {
        t.active = false;
      });
      o.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = 1;
      return void (o.getChildByName("labLevel").getComponent(cc.Label).string = "0");
    }
    var r = this.cfgList[e - 1];
    var s = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getAchReward(r.ID);
    var d = i.getChildByName("ndItem");
    d.active = true;
    var y = d.ItemGood;
    var v = {
      id: r.Reward1[0],
      num: r.Reward1[1]
    };
    if (y) {
      y.initView(v);
    } else {
      var _ = function (t) {
        t.setParent(d);
        t.active = true;
        t.setScale(1);
        y = t.getComponent($z1KinghtFallItemGood.default);
        d.ItemGood = y;
        y.initView(v);
      };
      var I = $z1PoolMgr.PoolMgr.getInstance().getNode($z1KinghtFallConfig.KinghtFallPoolName.ItemGood);
      if (I) {
        _(I);
      } else {
        this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.IconGood, $z1KinghtFallConfig.KinghtFallPrefabName.ItemGood, function (t) {
          I = cc.instantiate(t);
          $z1PoolMgr.PoolMgr.getInstance().creatrePool($z1KinghtFallConfig.KinghtFallPoolName.ItemGood, cc.instantiate(t), 10);
          _(I);
        });
      }
    }
    i.off(cc.Node.EventType.TOUCH_END);
    var b = i.getChildByName("ndGet");
    var F = i.getChildByName("ndFinish");
    var P = i.getChildByName("ndMask");
    if (this.bpLevel >= r.ID) {
      if ((1 & s) > 0) {
        b.active = false, F.active = true;
      } else {
        b.active = true, $z1KinghtFallModle.default.getInstance().twBreatheRedPoint(b), F.active = false, i.on(cc.Node.EventType.TOUCH_END, function () {
          n.claimFreeRewards([r], i.convertToWorldSpaceAR(d.position), false);
        });
      }
      P.active = false;
    } else {
      b.active = false;
      F.active = false;
      P.active = true;
    }
    var C = a.getChildByName("ndItem");
    C.active = true;
    var A = C.ItemGood;
    var D = {
      id: r.Reward2[0],
      num: r.Reward2[1]
    };
    if (A) {
      A.initView(D);
    } else {
      var M = function (t) {
        t.setParent(C);
        t.active = true;
        t.setScale(1);
        A = t.getComponent($z1KinghtFallItemGood.default);
        C.ItemGood = A;
        A.initView(D);
      };
      var T = $z1PoolMgr.PoolMgr.getInstance().getNode($z1KinghtFallConfig.KinghtFallPoolName.ItemGood);
      if (T) {
        M(T);
      } else {
        this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.IconGood, $z1KinghtFallConfig.KinghtFallPrefabName.ItemGood, function (t) {
          T = cc.instantiate(t);
          $z1PoolMgr.PoolMgr.getInstance().creatrePool($z1KinghtFallConfig.KinghtFallPoolName.ItemGood, cc.instantiate(t), 10);
          M(T);
        });
      }
    }
    a.off(cc.Node.EventType.TOUCH_END);
    b = a.getChildByName("ndGet");
    F = a.getChildByName("ndFinish");
    P = a.getChildByName("ndMask");
    a.getChildByName("sprVideo").active = true;
    if (this.bpLevel >= r.ID) {
      if ((2 & s) > 0) {
        b.active = false, F.active = true;
      } else {
        b.active = true, F.active = false, a.on(cc.Node.EventType.TOUCH_END, function () {
          if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getAchReward(r.ID) & 2) return;
          var granted = false;
          $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
            if (granted || $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getAchReward(r.ID) & 2) return;
            granted = true;
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.token_better_X, r.ID);
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.token);
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_talent_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
            var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
            player.claimRewards([D], 1, a.convertToWorldSpaceAR(C.position), function () {
              player.getMissionData().setAchReward(r.ID, 2);
            }, function () { return !(player.getMissionData().getAchReward(r.ID) & 2); });
            n.initView();
          }, null, "home.pass.premium");
        });
      }
      P.active = false;
    } else {
      b.active = false;
      F.active = false;
      P.active = true;
    }
    o.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = this.bpLevel > r.ID ? 1 : this.bpLevel == r.ID ? .5 : 0;
    o.getChildByName("labLevel").getComponent(cc.Label).string = "" + r.ID;
  };
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "通行证等级"
  })], _ctor.prototype, "ndTop", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "关闭"
  })], _ctor.prototype, "btnClose", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnClaimAll", undefined);
  cc__decorate([ccp_property({
    type: $z1List.default,
    tooltip: "关闭"
  })], _ctor.prototype, "ctrList", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIPassport;
