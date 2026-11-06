var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIBuildAtlas = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndItem = null;
    e.ndParent = null;
    e.btnClose = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    var t = this;
    this.ndItem.active = false;
    this.btnClose.on(cc.Node.EventType.TOUCH_END, function () {
      t.closeUI();
    }, this);
    var e = function (e) {
      var n = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBuildCfgById(e).levelList[0];
      var i = cc.instantiate(t.ndItem);
      i.parent = t.ndParent;
      i.active = true;
      i.x = 0;
      t.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconBuild, n.Icon, function (t) {
        var e = i.getChildByName("sprIcon");
        e.getComponent(cc.Sprite).spriteFrame = t;
        e.scale = n.Zoom;
        e.setPosition(n.Excursion ? cc.v2(n.Excursion[0] || 0, n.Excursion[1] || 0) : cc.v2(0, 0));
      });
      i.getChildByName("labName").getComponent(cc.Label).string = t.T(n.Name);
      i.getChildByName("labInfo").getComponent(cc.RichText).string = require("LanguageMgr").LanguageMgr.getInstance().format("<b><outline color=#000000 width=4>{0}</outline></b>", [t.T(n.LevelUpDescribe)]);
    };
    e($z1KinghtFallEnum.KinghtFallEnumBuildEnum.CastleCenter);
    e($z1KinghtFallEnum.KinghtFallEnumBuildEnum.ArrowTower);
    e($z1KinghtFallEnum.KinghtFallEnumBuildEnum.Barracks);
    e($z1KinghtFallEnum.KinghtFallEnumBuildEnum.PrivateHouse);
    e($z1KinghtFallEnum.KinghtFallEnumBuildEnum.Mill);
    e($z1KinghtFallEnum.KinghtFallEnumBuildEnum.Wall);
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndItem", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndParent", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnClose", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIBuildAtlas;