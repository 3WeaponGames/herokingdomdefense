var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallBulletBase = require("KinghtFallBulletBase");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_KinghtFallBulletEnemy = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ctrPar = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.setParent = function (t) {
    this.ctrPar = t;
  };
  _ctor.prototype.setTag = function (t, e, n) {
    this._dir = cc.v2(e.x - t.x, e.y - t.y).normalizeSelf();
    this.tagNode = e;
    this.tagNode.getPosition(this.tagPos);
    this.bullet.active = true;
    var i = 180 * cc.Vec2.RIGHT.signAngle(this._dir) / Math.PI;
    this.node.angle = i;
    this.newAngSpeed = this.angleSpeed;
    this.state = 0;
    this.callAttack = n;
  };
  _ctor.prototype.setLeft = function (t, e, n) {
    if (t.x > e.x) {
      this._dir = cc.v2(-Math.cos(this.angle * Math.PI / 180), Math.sin(this.angle * Math.PI / 180));
    } else {
      this._dir = cc.v2(Math.cos(this.angle * Math.PI / 180), Math.sin(this.angle * Math.PI / 180));
    }
    this.tagNode = e;
    this.tagNode.getPosition(this.tagPos);
    this.bullet.active = true;
    var i = 180 * cc.Vec2.RIGHT.signAngle(this._dir) / Math.PI;
    this.node.angle = i;
    this.newAngSpeed = this.angleSpeed;
    this.state = 0;
    this.callAttack = n;
  };
  _ctor.prototype.freeNode = function (t) {
    undefined === t && (t = true);
    t && $z1KinghtFallUIGame.default.instance.ctrGame.freeEnemyBullet(this);
    this.state = 2;
    this.ctrPar.freeBullet(this);
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallBulletBase.default);
exports.default = def_KinghtFallBulletEnemy;