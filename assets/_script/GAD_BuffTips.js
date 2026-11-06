var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseCtrl = require("BaseCtrl");
var $z1PoolMgr = require("PoolMgr");
var $z1GAD_DataMgr = require("GAD_DataMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_GAD_BuffTips = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.buffImgs = [];
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {};
  _ctor.prototype.getImg = function (t) {
    for (var e = 0; e < this.buffImgs.length; e++) {
      if (this.buffImgs[e].name == t) {
        return this.buffImgs[e];
      }
    }
    return null;
  };
  _ctor.prototype.show = function (t) {
    var e = this;
    var n = $z1GAD_DataMgr.default.getInstance().getBuffTypeCfg(t);
    this.node.getComponent(cc.Sprite).spriteFrame = this.getImg(n.buffImage);
    this.node.opacity = 0;
    this.node.active = true;
    this.node.runAction(cc.sequence(cc.fadeIn(.2), cc.delayTime(1), cc.fadeOut(.2), cc.callFunc(function () {
      e.node.active = false;
      $z1PoolMgr.PoolMgr.getInstance().freeNode("pbt_buff_img", e.node);
    })));
  };
  cc__decorate([ccp_property([cc.SpriteFrame])], _ctor.prototype, "buffImgs", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.default = def_GAD_BuffTips;