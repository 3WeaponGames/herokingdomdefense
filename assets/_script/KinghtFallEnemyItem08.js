var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallEnemyLong = require("KinghtFallEnemyLong");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_KinghtFallEnemyItem08 = function (t) {
  function _ctor() {
    return null !== t && t.apply(this, arguments) || this;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.doAttack = function () {
    var t = this;
    this.node.getPosition(this.vec2_1);
    this.rigidBody.active = true;
    var e = this.getAttack();
    var n = function () {
      var e = null;
      var n = -1;
      var i = $z1KinghtFallUIGame.default.instance.ctrGame.ctrPlay;
      if (!i.isDead()) {
        i.node.getPosition(t.vec2_2);
        cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
        if (t.vec2_2.len() <= t.cfg.AttackRange) {
          e = i, n = t.vec2_2.len();
        }
      }
      var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getSoldierList();
      for (var o = 0; o < a.length; o++) {
        if (!(h = a[o]).isDead()) {
          h.node.getPosition(t.vec2_2);
          cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
          if (t.vec2_2.len() <= t.cfg.AttackRange && (-1 == n || t.vec2_2.len() < n)) {
            e = h, n = t.vec2_2.len();
          }
        }
      }
      var s = {
        position: t.node.convertToWorldSpaceAR(cc.Vec2.ZERO),
        radius: t.cfg.AttackRange
      };
      var l = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getBulidList();
      for (var c = 0; c < l.length; c++) {
        var h;
        if ((h = l[c]).getIsWork()) {
          var g = h.getWposPhyCol2();
          for (var u = 0; u < g.length; u++) {
            var d = g[u];
            if (cc.Intersection.polygonCircle(d.points, s)) {
              var p = d.tagNode.convertToWorldSpaceAR(cc.Vec2.ZERO);
              t.vec2_2 = $z1KinghtFallUIGame.default.instance.ctrGame.ndMain.convertToNodeSpaceAR(p);
              cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
              if (-1 == n || t.vec2_2.len() < n) {
                e = h;
                n = t.vec2_2.len();
              }
            }
          }
        }
      }
      return e;
    }();
    if (n) {
      n.node.getPosition(this.vec2_2);
      cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
      this.setLeft(this.vec2_2.x < 0);
      var i = $z1KinghtFallUIGame.default.instance.ctrGame.onShotEnemy(this);
      i.ctr.setParent(this);
      return void i.ctr.setTag(i.pos, n.node, function () {
        $z1KinghtFallUIGame.default.instance.ctrEffect.showDamageNum(n.node.getPosition(), e);
        n.onAttacked(e);
      });
    }
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallEnemyLong.default);
exports.default = def_KinghtFallEnemyItem08;