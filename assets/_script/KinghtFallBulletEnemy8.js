var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallBulletEnemy = require("KinghtFallBulletEnemy");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_KinghtFallBulletEnemy8 = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ctrPar = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.setParent = function (t) {
    this.ctrPar = t;
    this.spAni = this.node.getComponentInChildren(sp.Skeleton);
    this.spAni.setAnimation(0, "hit", true);
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
  _ctor.prototype.onUpdate = function () {
    switch (this.state) {
      case 0:
        this.tagNode && cc.isValid(this.tagNode) && this.tagNode.getPosition(this.tagPos);
        if (!this.node || !cc.isValid(this.node)) {
          $z1KinghtFallUIGame.default.instance.ctrGame.freeEnemyBullet(this);
          return void this.destroy();
        }
        this.node.getPosition(this.vec2_1);
        cc.Vec2.subtract(this.vec2_2, this.tagPos, this.vec2_1);
        if (this.vec2_2.len() < 25) {
          return void this.onDie();
        }
        cc.Vec2.normalize(this._dir, this.vec2_2);
        var t = 180 * cc.Vec2.RIGHT.signAngle(this._dir) / Math.PI;
        this.node.angle = t;
        cc.Vec2.multiplyScalar(this.vec2_2, this._dir, .01 * this.speed);
        cc.Vec2.add(this.vec2_1, this.vec2_1, this.vec2_2);
        this.node.setPosition(this.vec2_1);
        break;
      case 1:
        this.time -= .01;
        this.time <= 0 && this.freeNode();
    }
  };
  _ctor.prototype.onDie = function () {
    this.state = 1;
    this.bullet.active = false;
    this.time = 2;
    this.callAttack && this.callAttack();
    this.spAni.setAnimation(0, "blast", false);
  };
  _ctor.prototype.freeNode = function (t) {
    undefined === t && (t = true);
    t && $z1KinghtFallUIGame.default.instance.ctrGame.freeEnemyBullet(this);
    this.state = 2;
    this.ctrPar.freeBullet(this);
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallBulletEnemy.default);
exports.default = def_KinghtFallBulletEnemy8;