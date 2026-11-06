var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_GAD_BulletEffect = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndBullet = null;
    e.ndMotionList = [null];
    e.ndParticleList = [null];
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    this.ndBullet.active = true;
    this.ndMotionList.forEach(function (t) {
      t.node.active = true;
    });
    this.ndParticleList.forEach(function (t) {
      t.node.active = true;
      t.resetSystem();
    });
  };
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "子弹头"
  })], _ctor.prototype, "ndBullet", undefined);
  cc__decorate([ccp_property({
    type: [cc.MotionStreak],
    tooltip: "拖尾"
  })], _ctor.prototype, "ndMotionList", undefined);
  cc__decorate([ccp_property({
    type: [cc.ParticleSystem],
    tooltip: "粒子"
  })], _ctor.prototype, "ndParticleList", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_GAD_BulletEffect;