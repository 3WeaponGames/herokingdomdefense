var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseCtrl = require("BaseCtrl");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallItemGood = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.sprBg = null;
    e.sprIcon = null;
    e.labNum = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.initView = function (t, size) {
    var e = this;
    var n = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(t.id);
    this.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, n.sprBg, function (t) {
      e.sprBg.spriteFrame = t;
      if (size) {
        var bounds = t.getOriginalSize(), scale = size / Math.max(bounds.width, bounds.height);
        e.sprBg.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        e.sprBg.node.setContentSize(bounds.width * scale, bounds.height * scale);
      }
    });
    this.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, n.icon, function (t) {
      e.sprIcon.spriteFrame = t;
      if (size) {
        var bounds = t.getOriginalSize(), scale = size / Math.max(bounds.width, bounds.height);
        e.sprIcon.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        e.sprIcon.node.setContentSize(bounds.width * scale, bounds.height * scale);
      }
    });
    this.labNum.string = $z1KinghtFallModle.default.getInstance().numberFomat(t.num);
  };
  cc__decorate([ccp_property({
    type: cc.Sprite,
    tooltip: "底图"
  })], _ctor.prototype, "sprBg", undefined);
  cc__decorate([ccp_property({
    type: cc.Sprite,
    tooltip: "图标"
  })], _ctor.prototype, "sprIcon", undefined);
  cc__decorate([ccp_property({
    type: cc.Label,
    tooltip: "数量"
  })], _ctor.prototype, "labNum", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.default = def_KinghtFallItemGood;
