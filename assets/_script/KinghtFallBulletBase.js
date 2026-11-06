var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallBulletBase = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.bullet = null;
    e.angle = 20;
    e.angleSpeed = 50;
    e.speed = 600;
    e.tagNode = null;
    e.tagPos = cc.v2(0, 0);
    e.state = 0;
    e.time = 0;
    e.newAngSpeed = 0;
    e.addAngSpeed = 100;
    e.callAttack = null;
    e._dir = cc.v2(0, 0);
    e.vec2_1 = cc.v2(0, 0);
    e.vec2_2 = cc.v2(0, 0);
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.setTag = function (t, e, n) {
    if (t.x < e.x) {
      this._dir = cc.v2(Math.cos(this.angle * Math.PI / 180), Math.sin(this.angle * Math.PI / 180));
    } else {
      this._dir = cc.v2(-Math.cos(this.angle * Math.PI / 180), Math.sin(this.angle * Math.PI / 180));
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
  _ctor.prototype.onUpdate = function (t) {
    switch (this.state) {
      case 0:
        this.tagNode && cc.isValid(this.tagNode) && this.tagNode.getPosition(this.tagPos);
        this.node.getPosition(this.vec2_1);
        cc.Vec2.subtract(this.vec2_2, this.tagPos, this.vec2_1);
        if (this.vec2_2.len() < 25) {
          return void this.onDie();
        }
        var e = this._dir.signAngle(this.vec2_2);
        var n = this.newAngSpeed * t * Math.PI / 180;
        if (Math.abs(e) > n) {
          this._dir.rotateSelf(Math.sign(e) * n);
        } else {
          this._dir.rotateSelf(e);
        }
        this.newAngSpeed += this.addAngSpeed * t;
        e = 180 * cc.Vec2.RIGHT.signAngle(this._dir) / Math.PI;
        this.node.angle = e;
        cc.Vec2.multiplyScalar(this.vec2_2, this._dir, this.speed * t);
        cc.Vec2.add(this.vec2_1, this.vec2_1, this.vec2_2);
        this.node.setPosition(this.vec2_1);
        break;
      case 1:
        this.time -= t;
        this.time <= 0 && this.freeNode();
    }
  };
  _ctor.prototype.onDie = function () {
    this.state = 1;
    this.bullet.active = false;
    this.time = 2;
    this.callAttack && this.callAttack();
  };
  _ctor.prototype.freeNode = function () {
    this.state = 2;
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "bullet", undefined);
  cc__decorate([ccp_property(cc.Integer)], _ctor.prototype, "angle", undefined);
  cc__decorate([ccp_property(cc.Integer)], _ctor.prototype, "angleSpeed", undefined);
  cc__decorate([ccp_property(cc.Integer)], _ctor.prototype, "speed", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_KinghtFallBulletBase;