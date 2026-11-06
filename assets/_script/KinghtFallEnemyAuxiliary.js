var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var r;
var $z1KinghtFallEnemyBase = require("KinghtFallEnemyBase");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var Navigation = require("KinghtFallNavigation");
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
          var game = $z1KinghtFallUIGame.default.instance.ctrGame;
          var waypoint = this.getRouteWaypoint(game);
          if (!waypoint) { this.doWait(); break; }
          var goal = Navigation.positionOf(waypoint, game);
          var movement = Navigation.moveTo(this, game, goal, t);
          if (movement.directionX) this.setLeft(movement.directionX < 0);
          if (movement.arrived) { this.bornInfo.nodeIndex++; Navigation.reset(this); }
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
