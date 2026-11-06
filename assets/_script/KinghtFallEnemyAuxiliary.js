var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var r;
var $z1KinghtFallEnemyBase = require("KinghtFallEnemyBase");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_KinghtFallEnemyAuxiliary = function (t) {
  function _ctor() {
    return null !== t && t.apply(this, arguments) || this;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onUpdate = function (t) {
    this.node.getPosition(this.vec2_1);
    this.node.zIndex = Math.floor(cc.winSize.height) - Math.floor(this.vec2_1.y);
    for (var e = 0; e < this.debuffInfo.length; e++) {
      var n = this.debuffInfo[e];
      if (-1 != n.time) {
        n.time += t;
        if (n.time >= n.timeMax) {
          this.delBuffIdx(e), e--;
        }
      }
    }
    -1 != this.time[r.Attack] && (this.time[r.Attack] += t * this.getAttSpeed());
    this.time[r.Attack] >= 1 && this.doAttackStart();
    switch (this.state) {
      case $z1KinghtFallEnemyBase.KinghtFallEnemyStatus.Idle:
      case $z1KinghtFallEnemyBase.KinghtFallEnemyStatus.Move:
        if (this.bornInfo.nodeIndex > this.bornInfo.pathList.length) {
          this.doWait();
        } else if (this.bornInfo.nodeIndex == this.bornInfo.pathList.length) {
          this.doWait();
          this.bornInfo.nodeIndex++;
        } else {
          this.bornInfo.pathList[this.bornInfo.nodeIndex].getPosition(this.vec2_2);
          cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
          this.setLeft(this.vec2_2.x < 0);
          this.vec2_2.len() <= 15 && this.bornInfo.nodeIndex++;
          cc.Vec2.normalize(this.vec2_2, this.vec2_2);
          cc.Vec2.scaleAndAdd(this.vec2_1, this.vec2_1, this.vec2_2, this.getSpeed() * t);
          this.node.setPosition(this.vec2_1);
        }
    }
  };
  _ctor.prototype.doAttackFinish = function () {
    this.doMove();
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallEnemyBase.default);
exports.default = def_KinghtFallEnemyAuxiliary;
(function (t) {
  t.Attack = "Attack";
})(r || (r = {}));