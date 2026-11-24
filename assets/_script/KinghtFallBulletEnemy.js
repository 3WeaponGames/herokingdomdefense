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
  _ctor.prototype.setTag = function (t, e, n, offset) {
    this.bindTarget(e, n, offset);
    this.readTargetPosition();
    this._dir = cc.v2(this.tagPos.x - t.x, this.tagPos.y - t.y).normalizeSelf();
    this.bullet.active = true;
    var i = 180 * cc.Vec2.RIGHT.signAngle(this._dir) / Math.PI;
    this.node.angle = i;
    this.newAngSpeed = this.angleSpeed;
    this.state = 0;
    if (this._launchProjectileLook) this._launchProjectileLook();
  };
  _ctor.prototype.setLeft = function (t, e, n) {
    if (t.x > e.x) {
      this._dir = cc.v2(-Math.cos(this.angle * Math.PI / 180), Math.sin(this.angle * Math.PI / 180));
    } else {
      this._dir = cc.v2(Math.cos(this.angle * Math.PI / 180), Math.sin(this.angle * Math.PI / 180));
    }
    this.bindTarget(e, n);
    this.readTargetPosition();
    this.bullet.active = true;
    var i = 180 * cc.Vec2.RIGHT.signAngle(this._dir) / Math.PI;
    this.node.angle = i;
    this.newAngSpeed = this.angleSpeed;
    this.state = 0;
    if (this._launchProjectileLook) this._launchProjectileLook();
  };
  _ctor.prototype.freeNode = function (t) {
    if (this.state === 2) return;
    undefined === t && (t = true);
    var game = this.combatContext || $z1KinghtFallUIGame.default.instance.ctrGame, owner = this.ctrPar;
    t && game && cc.isValid(game, true) && game.freeEnemyBullet(this);
    this.cancel();
    if (owner && cc.isValid(owner, true) && (!owner.node || cc.isValid(owner.node, true)) && (!owner.ndBulletPat || cc.isValid(owner.ndBulletPat, true))) owner.freeBullet(this);
    else if (cc.isValid(this.node, true) && this.node.destroy) this.node.destroy();
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallBulletBase.default);
exports.default = def_KinghtFallBulletEnemy;
