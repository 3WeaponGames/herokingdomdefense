var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1KinghtFallModle = require("KinghtFallModle");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallItemHp = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.sprPro1 = null;
    e.sprPro2 = null;
    e.labPro = null;
    e.spAni = null;
    e.sprPro = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    var t = this;
    if (this.spAni) {
      this.spAni.node.active = false;
      this.spAni.setCompleteListener(function () {
        t.spAni.node.active = false;
      });
    }
    this.labPro && (this.labPro.node.active = false);
  };
  _ctor.prototype.setType = function (t) {
    switch (t) {
      case $z1KinghtFallModle.KinghtFallGameArmy.None:
        this.sprPro = null;
        this.sprPro1 && (this.sprPro1.node.active = false);
        this.sprPro2 && (this.sprPro2.node.active = false);
        break;
      case $z1KinghtFallModle.KinghtFallGameArmy.Friend:
        this.sprPro = this.sprPro1;
        this.sprPro1 && (this.sprPro1.node.active = true);
        this.sprPro2 && (this.sprPro2.node.active = false);
        break;
      case $z1KinghtFallModle.KinghtFallGameArmy.Enemy:
        this.sprPro = this.sprPro2;
        this.sprPro1 && (this.sprPro1.node.active = false);
        this.sprPro2 && (this.sprPro2.node.active = true);
    }
  };
  _ctor.prototype.setProgress = function (t) {
    if (this.sprPro) {
      if (t >= 1 || t <= 0) {
        this.node.active = false;
      } else {
        this.node.active = true;
        this.sprPro.fillRange = t;
      }
    }
  };
  _ctor.prototype.setHp = function (t, e) {
    if (this.sprPro) {
      if (t >= e || t <= 0) {
        this.node.active = false;
      } else {
        this.node.active = true;
        this.sprPro.fillRange = t / e;
        this.labPro && (this.labPro.string = t.toFixed(2) + "/" + e.toFixed(2));
      }
    }
  };
  _ctor.prototype.showAni = function () {
    if (this.spAni) {
      this.spAni.node.active = true;
      this.spAni.setAnimation(0, this.spAni.defaultAnimation, false);
    }
  };
  cc__decorate([ccp_property({
    type: cc.Sprite,
    tooltip: "我方血条"
  })], _ctor.prototype, "sprPro1", undefined);
  cc__decorate([ccp_property({
    type: cc.Sprite,
    tooltip: "敌方血条"
  })], _ctor.prototype, "sprPro2", undefined);
  cc__decorate([ccp_property({
    type: cc.Label,
    tooltip: "敌方血条"
  })], _ctor.prototype, "labPro", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "敌方血条"
  })], _ctor.prototype, "spAni", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_KinghtFallItemHp;