var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1List = require("List");
var $z1PoolMgr = require("PoolMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallMissionData = require("KinghtFallMissionData");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallItemGood = require("KinghtFallItemGood");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIAchievement = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.btnClose = null;
    e.ctrList = null;
    e.acheData = [];
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    this.cfgList = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getAchievementCfg();
    this.ctrList.tmpNode.active = false;
    this.initView();
    this.btnClose.on(cc.Node.EventType.TOUCH_END, this.closeUI, this);
  };
  _ctor.prototype.initView = function () {
    this.initData();
    this.ctrList.numItems = this.acheData.length;
  };
  _ctor.prototype.initData = function () {
    this.acheData = [];
    for (var t = 0; t < this.cfgList.length; t++) {
      var e = this.cfgList[t];
      var n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getAchInfoByType(e.Type);
      var i = {
        cfg: e,
        num: n ? n.num : 0,
        tag: 1
      };
      switch (e.Type) {
        case $z1KinghtFallEnum.KinghtFallEnumAchiEnum.LevelProgress:
          i.num = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage() - 1;
          break;
        case $z1KinghtFallEnum.KinghtFallEnumAchiEnum.TreasureNumber:
          var a = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfg();
          for (var o = 0; o < a.length; o++) {
            var r = a[o];
            $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTreasureLevel(r.ID) && i.num++;
          }
          break;
        case $z1KinghtFallEnum.KinghtFallEnumAchiEnum.TreasureLevel:
          i.num = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.TreasureUp);
          break;
        case $z1KinghtFallEnum.KinghtFallEnumAchiEnum.TalentUnlock:
          i.num = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.TalentUp);
          break;
        case $z1KinghtFallEnum.KinghtFallEnumAchiEnum.EquipLevel:
          i.num = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.EquipUp);
          break;
        case $z1KinghtFallEnum.KinghtFallEnumAchiEnum.EnemyKill:
          i.num = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().getTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.Kill);
      }
      if (n && n.reward.includes(e.ID)) {
        i.tag = 3;
      } else if (i.num >= e.Argument) {
        i.tag = 2;
      } else {
        i.tag = 1;
      }
      this.acheData.push(i);
    }
    this.acheData.sort(function (t, e) {
      switch (t.tag) {
        case 1:
          switch (e.tag) {
            case 1:
              return t.cfg.ID - e.cfg.ID;
            case 2:
              return 1;
            case 3:
              return -1;
          }
        case 2:
          switch (e.tag) {
            case 1:
              return -1;
            case 2:
              return t.cfg.ID - e.cfg.ID;
            case 3:
              return -1;
          }
        case 3:
          switch (e.tag) {
            case 1:
            case 2:
              return 1;
            case 3:
              return t.cfg.ID - e.cfg.ID;
          }
      }
    });
  };
  _ctor.prototype.initTaskView = function (t, e) {
    var n = this;
    t.active = true;
    t.opacity = 255;
    var i = this.acheData[e];
    var a = t.getChildByName("ndItem");
    var o = a.ItemGood;
    var r = {
      id: i.cfg.Item[0],
      num: i.cfg.Item[1]
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
      var h = $z1PoolMgr.PoolMgr.getInstance().getNode($z1KinghtFallConfig.KinghtFallPoolName.ItemGood);
      if (h) {
        s(h);
      } else {
        this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.IconGood, $z1KinghtFallConfig.KinghtFallPrefabName.ItemGood, function (t) {
          h = cc.instantiate(t);
          $z1PoolMgr.PoolMgr.getInstance().creatrePool($z1KinghtFallConfig.KinghtFallPoolName.ItemGood, cc.instantiate(t), 10);
          s(h);
        });
      }
    }
    t.getChildByName("labInfo").getComponent(cc.RichText).string = "<b>" + i.cfg.Describe + "</b>";
    var g = t.getChildByName("ndPro");
    g.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = Math.min(1, Math.max(0, i.num / i.cfg.Argument));
    g.getChildByName("labPro").getComponent(cc.Label).string = Math.min(i.num, i.cfg.Argument) + "/" + i.cfg.Argument;
    var u = t.getChildByName("ndFinish");
    u.getChildByName("mask").active = 2 == i.tag;
    var f = u.getChildByName("btnGet");
    var m = u.getChildByName("btnFinish");
    switch (i.tag) {
      case 1:
        u.active = false;
        break;
      case 2:
        u.active = true;
        f.active = true;
        m.active = false;
        f.off(cc.Node.EventType.TOUCH_END);
        f.on(cc.Node.EventType.TOUCH_END, function () {
          var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
          player.claimRewards([r], 1, t.convertToWorldSpaceAR(a.position), function () {
            player.getMissionData().getAchRew(i.cfg.Type, i.cfg.ID);
          }, function () {
            n.initData();
            return n.acheData.some(function (row) { return row.cfg.ID === i.cfg.ID && row.tag === 2; });
          });
          n.initView();
          n.sendEvent($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 4);
        }, this);
        break;
      case 3:
        u.active = true;
        t.opacity = 102;
        f.active = false;
        m.active = true;
    }
  };
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "关闭"
  })], _ctor.prototype, "btnClose", undefined);
  cc__decorate([ccp_property({
    type: $z1List.default,
    tooltip: "关闭"
  })], _ctor.prototype, "ctrList", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIAchievement;
