var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1List = require("List");
var $z1PoolMgr = require("PoolMgr");
var $z1Utils = require("Utils");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallItemGood = require("KinghtFallItemGood");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIOnlineReward = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.btnClose = null;
    e.btnClaimAll = null;
    e.ctrList = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    this.cfgList = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getOnlineRewardCfg();
    this.ctrList.tmpNode.active = false;
    this.initEventListener();
    this.initBtnListener();
    this.initView();
  };
  _ctor.prototype.initEventListener = function () {
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.TimeUpdate, this.initView);
  };
  _ctor.prototype.initBtnListener = function () {
    this.btnClose.on(cc.Node.EventType.TOUCH_END, this.closeUI, this);
    this.btnClaimAll.on(cc.Node.EventType.TOUCH_END, this.onClaimAll, this);
  };
  _ctor.prototype.initView = function () {
    this.onLineTime = Math.floor($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().getOnlineTime() / 60);
    this.ctrList.numItems = this.cfgList.length;
    var available = this.getClaimableRewards().length > 0;
    this.btnClaimAll.getComponent(cc.Button).interactable = available;
    this.btnClaimAll.getChildByName("bgDisabled").active = !available;
  };
  _ctor.prototype.getClaimableRewards = function (rows) {
    var daily = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData();
    var minutes = Math.floor(daily.getOnlineTime() / 60);
    return (rows || this.cfgList).filter(function (row) {
      return minutes >= row.condition && !daily.getOnlineTimeReward(row.id);
    });
  };
  _ctor.prototype.onClaimAll = function () {
    this.claimRewards(this.cfgList, this.btnClaimAll.convertToWorldSpaceAR(cc.v2(0, 0)));
  };
  _ctor.prototype.claimRewards = function (rows, position) {
    if (this.claimingRewards) return;
    var available = this.getClaimableRewards(rows);
    if (!available.length) return;
    var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
    var rewards = [];
    available.forEach(function (row) {
      var reward = rewards.filter(function (item) { return item.id === row.reward[0]; })[0];
      if (reward) reward.num += row.reward[1];
      else rewards.push({ id: row.reward[0], num: row.reward[1] });
    });
    this.claimingRewards = true;
    try {
      var self = this;
      var granted = player.claimRewards(rewards, 1, position, function () {
        available.forEach(function (row) { player.getDailyData().setOnlineTimeReward(row.id); });
      }, function () { return self.getClaimableRewards(available).length === available.length; });
      if (!granted) return;
      this.initView();
      this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 4);
    } finally {
      this.claimingRewards = false;
    }
  };
  _ctor.prototype.initListItem = function (t, e) {
    var n = this;
    t.active = true;
    var i = this.cfgList[e];
    var a = t.getChildByName("ndItem");
    var o = a.ItemGood;
    var r = {
      id: i.reward[0],
      num: i.reward[1]
    };
    if (o) {
      o.initView(r);
    } else {
      var s = function (t) {
        t.setParent(a);
        t.active = true;
        t.setScale(1);
        o = t.getComponent($z1KinghtFallItemGood.default);
        a.ItemGood = o;
        o.initView(r);
      };
      var u = $z1PoolMgr.PoolMgr.getInstance().getNode($z1KinghtFallConfig.KinghtFallPoolName.ItemGood);
      if (u) {
        s(u);
      } else {
        this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.IconGood, $z1KinghtFallConfig.KinghtFallPrefabName.ItemGood, function (t) {
          u = cc.instantiate(t);
          $z1PoolMgr.PoolMgr.getInstance().creatrePool($z1KinghtFallConfig.KinghtFallPoolName.ItemGood, cc.instantiate(t), 10);
          s(u);
        });
      }
    }
    t.getChildByName("labInfo").getComponent(cc.RichText).string = $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeBattle10), i.condition);
    var f = t.getChildByName("ndPro");
    f.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = Math.min(1, Math.max(0, this.onLineTime / i.condition));
    f.getChildByName("labPro").getComponent(cc.Label).string = Math.min(this.onLineTime, i.condition) + "/" + i.condition;
    var m = t.getChildByName("ndFinish");
    var y = t.getChildByName("btnLock");
    var v = m.getChildByName("btnGet");
    var _ = m.getChildByName("btnFinish");
    t.opacity = 255;
    if (this.onLineTime >= i.condition) {
      y.active = false;
      m.active = true;
      if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getDailyData().getOnlineTimeReward(i.id)) {
        m.getChildByName("mask").active = false, t.opacity = 102, v.active = false, _.active = true;
      } else {
        m.getChildByName("mask").active = true, v.active = true, _.active = false, v.off(cc.Node.EventType.TOUCH_END), v.on(cc.Node.EventType.TOUCH_END, function () {
          n.claimRewards([i], t.convertToWorldSpaceAR(a.position));
        }, this);
      }
    } else {
      m.active = false;
      y.active = true;
    }
  };
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
exports.default = def_KinghtFallUIOnlineReward;
