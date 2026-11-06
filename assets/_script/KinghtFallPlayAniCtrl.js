var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallPlayAniCtrl = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.spAniMa = null;
    e.spAniBody = null;
    e.spAniDrap = null;
    e.spAniHead = null;
    e.spAniBow = null;
    e.spAniArrow = null;
    e.spAniHand = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.initView = function () {
    var t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getEquipCfgList();
    for (var e = 0; e < t.length; e++) {
      var n = t[e];
      var i = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getPersonLevel(n.id);
      switch (n.id) {
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Body:
          this.spAniDrap.setSkin(n.levelInfo[i - 1].EquipSkin);
          break;
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Head:
          this.spAniHead.setSkin(n.levelInfo[i - 1].EquipSkin);
          break;
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Arrow:
          this.spAniArrow.setSkin(n.levelInfo[i - 1].EquipSkin);
          break;
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Bow:
          this.spAniBow.setSkin(n.levelInfo[i - 1].EquipSkin);
          break;
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.Gloves:
          this.spAniHand.setSkin(n.levelInfo[i - 1].EquipSkin);
          break;
        case $z1KinghtFallEnum.KinghtFallEnumEquipEnum.horse:
          this.spAniMa.setSkin(n.levelInfo[i - 1].EquipSkin);
      }
    }
  };
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "马"
  })], _ctor.prototype, "spAniMa", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "身体"
  })], _ctor.prototype, "spAniBody", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "斗篷"
  })], _ctor.prototype, "spAniDrap", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "头"
  })], _ctor.prototype, "spAniHead", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "弓"
  })], _ctor.prototype, "spAniBow", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "箭"
  })], _ctor.prototype, "spAniArrow", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "手"
  })], _ctor.prototype, "spAniHand", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_KinghtFallPlayAniCtrl;