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
      var building = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBuildCfgById(e);
      var choices = Array.isArray(building.InitialChoices) && building.InitialChoices.length ? building.InitialChoices : [1];
      choices.filter(function (index, at) { return Number.isInteger(index) && building.levelList[index - 1] && choices.indexOf(index) === at; }).forEach(function (index) {
      var n = building.levelList[index - 1];
      var i = cc.instantiate(t.ndItem);
      i.parent = t.ndParent;
      i.active = true;
      i.x = 0;
      var artwork = n.Appearance && n.Appearance.sprite;
      t.loadSpriteFrame(artwork ? "resources" : $z1KinghtFallConfig.KinghtFallBundelName.IconBuild, artwork || n.Icon, function (t) {
        var e = i.getChildByName("sprIcon");
        e.getComponent(cc.Sprite).spriteFrame = t;
        e.scale = n.Zoom;
        e.setPosition(n.Excursion ? cc.v2(n.Excursion[0] || 0, n.Excursion[1] || 0) : cc.v2(0, 0));
        if (artwork) {
          var size = t.getOriginalSize ? t.getOriginalSize() : e.getContentSize();
          e.scale = Math.min(170 / Math.max(1, size.width), 170 / Math.max(1, size.height));
          e.setPosition(-202, 31);
        }
      });
      i.getChildByName("labName").getComponent(cc.Label).string = t.T(n.Name);
      i.getChildByName("labInfo").getComponent(cc.RichText).string = require("LanguageMgr").LanguageMgr.getInstance().format("{0}", [t.T(n.LevelUpDescribe)]);
      });
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
