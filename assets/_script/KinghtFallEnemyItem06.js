var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var r;
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallInterface = require("KinghtFallInterface");
var $z1KinghtFallEnemyAuxiliary = require("KinghtFallEnemyAuxiliary");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_KinghtFallEnemyItem06 = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.tagUse = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.initData = function (e, n) {
    t.prototype.initData.call(this, e, n);
    this.node.getComponent(cc.CircleCollider).radius = this.cfg.Data[2];
  };
  _ctor.prototype.doAttack = function () {
    this.time[r.Attack] = 0;
    var t = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getEnemyList();
    this.node.getPosition(this.vec2_1);
    var e = [];
    for (var n = 0; n < t.length; n++) {
      if ((i = t[n]).uuid != this.uuid) {
        i.node.getPosition(this.vec2_2);
        cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
        this.vec2_2.mag() < this.cfg.Data[2] && e.push({
          len: this.vec2_2.mag(),
          enemy: i
        });
      }
    }
    e.sort(function (t, e) {
      return t.len - e.len;
    });
    for (n = 0; n < this.cfg.Data[3]; n++) {
      var i;
      if (!(i = e[n])) {
        break;
      }
      i.enemy.addBuff($z1KinghtFallInterface.KinghtFallEnemyBuffType.AttackSpeed, {
        addSpeed: this.cfg.Data[0],
        time: this.cfg.Data[1]
      });
    }
    this.tagUse = e.length > 0;
  };
  _ctor.prototype.doAttackFinish = function () {
    if (this.tagUse) {
      this.doWait();
    } else {
      this.doMove();
    }
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallEnemyAuxiliary.default);
exports.default = def_KinghtFallEnemyItem06;
(function (t) {
  t.Attack = "Attack";
})(r || (r = {}));