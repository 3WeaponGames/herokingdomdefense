var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallCommerceType = undefined;
var r;
var $z1Utils = require("Utils");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
(function (t) {
  t[t.Silver = 0] = "Silver";
  t[t.Weapon = 1] = "Weapon";
  t[t.Horse = 2] = "Horse";
})(r = exports.KinghtFallCommerceType || (exports.KinghtFallCommerceType = {}));
var def_KinghtFallCommerce = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndType = r.Silver;
    e.sprPro = null;
    e.spAni = null;
    e.keepTime = 0;
    e.coinNum = 0;
    e.standTimeMax = 1.5;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t) {
    this.keepTime = 0;
    this.sprPro.fillRange = 0;
    this.ndType == r.Silver && (this.coinNum = $z1Utils.Utils.randomRang(6, 13));
    switch (this.ndType) {
      case r.Weapon:
      case r.Horse:
        this.spAni.setSkin("vip" + t);
    }
  };
  _ctor.prototype.getInClick = function (t, e) {
    return 0 != this.node.active && (t.x >= this.node.x - this.node.width * this.node.anchorX && t.x <= this.node.x + this.node.width * (1 - this.node.anchorX) && t.y >= this.node.y - this.node.height * this.node.anchorY && t.y <= this.node.y + this.node.height * (1 - this.node.anchorY) ? (this.keepTime += e, this.sprPro.fillRange = this.keepTime / this.standTimeMax, this.keepTime >= this.standTimeMax && (this.keepTime = 0, this.sprPro.fillRange = 0, true)) : (this.keepTime -= e, this.keepTime < 0 && (this.keepTime = 0), this.sprPro.fillRange = this.keepTime / this.standTimeMax, false));
  };
  cc__decorate([ccp_property({
    type: cc.Enum(r),
    tooltip: "商业化类型"
  })], _ctor.prototype, "ndType", undefined);
  cc__decorate([ccp_property({
    type: cc.Sprite,
    tooltip: "商业化类型"
  })], _ctor.prototype, "sprPro", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "动画"
  })], _ctor.prototype, "spAni", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_KinghtFallCommerce;