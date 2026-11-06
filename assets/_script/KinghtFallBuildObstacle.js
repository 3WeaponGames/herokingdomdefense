var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallBuildObstacle = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndMove = [];
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    var t;
    var e = this;
    null === (t = this.ndMove) || undefined === t || t.forEach(function (t, n) {
      t.active = false;
      t.name = e.node.name + "_" + n;
    });
  };
  _ctor.prototype.getWposPhyCol = function () {
    var t = [];
    var e = this.node.getComponents(cc.PhysicsPolygonCollider);
    for (var n = 0; n < e.length; n++) {
      var i = e[n];
      var a = [];
      for (var o = 0; o < i.points.length; o++) {
        var r = i.points[o];
        a.push(this.node.convertToWorldSpaceAR(r));
      }
      t.push(a);
    }
    return t;
  };
  _ctor.prototype.getMoveToPos = function (t, e) {
    if (!this.ndMove || 0 == this.ndMove.length) {
      return null;
    }
    var n = -1;
    var i = null;
    var a = null;
    for (var o = 0; o < this.ndMove.length; o++) {
      var r = this.ndMove[o];
      if (r) {
        var s = false;
        for (var l = 0; l < e.length; l++) {
          if (e[l].uuid == r.uuid) {
            s = true;
            break;
          }
        }
        if (!s) {
          var c = this.node.convertToWorldSpaceAR(r.getPosition());
          var h = cc.Vec2.distance(t, c);
          if (-1 == n || h < n) {
            n = h;
            a = c;
            i = r;
          }
        }
      }
    }
    if (i) {
      return {
        node: i,
        pos: a
      };
    } else {
      return null;
    }
  };
  cc__decorate([ccp_property({
    type: [cc.Node],
    tooltip: "碰到就要移动的点"
  })], _ctor.prototype, "ndMove", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_KinghtFallBuildObstacle;