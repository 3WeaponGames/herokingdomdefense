var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1AudioMgr = require("AudioMgr");
var $z1PoolMgr = require("PoolMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallUtilLayout = require("KinghtFallUtilLayout");
var $z1KinghtFallItemGood = require("KinghtFallItemGood");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIGoldReward = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndCtr = null;
    e.spAni = null;
    e.ndLight = null;
    e.btnClose = null;
    e.getSkillList = [];
    e.index = 0;
    e.canAni = false;
    e.time = 0;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (e, n) {
    t.prototype.init.call(this);
    this.getSkillList = e;
    this.callBack = n;
  };
  _ctor.prototype.start = function () {
    var t = this;
    this.ndCtr.init(this.getSkillList.length);
    this.ndLight.x = this.ndLight.width + cc.winSize.width;
    this.spAni.setAnimation(0, "start", false);
    this.spAni.addAnimation(0, "idle", true);
    $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.item_reward);
    this.spAni.setCompleteListener(function () {
      "start" == t.spAni.animation && (t.canAni = true);
    });
    this.btnClose.active = false;
    this.node.on(cc.Node.EventType.TOUCH_END, function () {
      if (!t.canAni) {
        t.callBack && t.callBack(true);
        t.closeUI();
      }
    }, this);
  };
  _ctor.prototype.update = function (t) {
    var e = this;
    if (this.canAni && (this.time -= t, this.time <= 0)) {
      if (this.index == this.getSkillList.length) {
        this.canAni = false;
        return void (this.btnClose.active = true);
      }
      var n = this.getSkillList[this.index];
      this.time = this.aniNormal(n, this.index);
      this.index++;
      if (this.index == this.getSkillList.length) {
        this.time = 1;
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
  _ctor.prototype.aniNormal = function (t, e) {
    var n = this;
    var i = function (i) {
      i.setParent(n.ndCtr.node);
      var a = n.ndCtr.getPos(e);
      i.setPosition(a);
      i.active = true;
      i.setScale(1);
      i.getComponent($z1KinghtFallItemGood.default).initView(t);
      cc.tween(i).set({
        opacity: 0
      }).to(.3, {
        opacity: 255
      }).start();
    };
    var a = $z1PoolMgr.PoolMgr.getInstance().getNode($z1KinghtFallConfig.KinghtFallPoolName.ItemGood);
    if (a) {
      i(a);
    } else {
      this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.IconGood, $z1KinghtFallConfig.KinghtFallPrefabName.ItemGood, function (t) {
        a = $z1PoolMgr.PoolMgr.getInstance().getNodeFromPrefab($z1KinghtFallConfig.KinghtFallPoolName.ItemGood, t, 10);
        i(a);
      });
    }
    return .1;
  };
  cc__decorate([ccp_property($z1KinghtFallUtilLayout.KinghtFallUtilLayout)], _ctor.prototype, "ndCtr", undefined);
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
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIGoldReward;
