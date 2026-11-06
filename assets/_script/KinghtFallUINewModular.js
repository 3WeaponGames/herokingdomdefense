var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1AudioMgr = require("AudioMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallUtilLayout = require("KinghtFallUtilLayout");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUINewModular = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndCtr = null;
    e.spAni = null;
    e.ndLight = null;
    e.sprfIconList = [];
    e.btnClose = null;
    e.getSkillList = [];
    e.index = 0;
    e.skillNameList = ["[[loc:ui.kinghtfalluihome.labname.30]]", "[[loc:ui.kinghtfalluihome.labname.65]]", "[[loc:ui.kinghtfalluihome.labname.100]]", "[[loc:ui.kinghtfalluihome.labname.135]]", "[[loc:ui.kinghtfalluihome.labname.170]]"];
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
    this.spAni.setCompleteListener(function () {
      if ("start" == t.spAni.animation) {
        t.canAni = true;
        $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.item_reward);
      }
    });
    this.btnClose.active = false;
    this.node.on(cc.Node.EventType.TOUCH_END, function () {
      if (!t.canAni) {
        t.callBack && t.callBack(true);
        t.closeUI();
      }
    }, this);
  };
  _ctor.prototype.initItemView = function (t, e) {
    t.active = false;
    t.getComponent(cc.Sprite).spriteFrame = this.sprfIconList[this.getSkillList[e]];
    t.getChildByName("labName").getComponent(cc.Label).string = this.T(this.skillNameList[this.getSkillList[e]]);
  };
  _ctor.prototype.update = function (t) {
    var e = this;
    if (this.canAni && (this.time -= t, this.time <= 0)) {
      if (this.index == this.getSkillList.length) {
        this.canAni = false;
        return void (this.btnClose.active = true);
      }
      this.time = this.aniNormal(this.index);
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
  _ctor.prototype.aniNormal = function (t) {
    var e = this.ndCtr.getItem(t);
    e.active = true;
    cc.tween(e).set({
      opacity: 0
    }).to(.3, {
      opacity: 255
    }).start();
    return .15;
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
    type: [cc.SpriteFrame],
    tooltip: "图标"
  })], _ctor.prototype, "sprfIconList", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "关闭"
  })], _ctor.prototype, "btnClose", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUINewModular;