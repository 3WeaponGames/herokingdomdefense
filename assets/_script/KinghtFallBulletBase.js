var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var impactRadius = 25;
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
    e.combatContext = null;
    e._dir = cc.v2(0, 0);
    e.vec2_1 = cc.v2(0, 0);
    e.vec2_2 = cc.v2(0, 0);
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.bindTarget = function (target, attack) {
    var bullet = this;
    var generation = target._combatGeneration;
    var actor = target._combatActor;
    var game = this.combatContext;
    var epoch = game && game._combatEpoch;
    this.tagNode = target;
    this.targetIsLive = function () {
      return cc.isValid(target, true) && target.activeInHierarchy !== false &&
        target._combatGeneration === generation &&
        (!actor || cc.isValid(actor, true) && !actor.isDead()) &&
        (!game || cc.isValid(game, true) && cc.isValid(game.node, true) && game._combatEpoch === epoch);
    };
    var isLive = this.targetIsLive;
    // Keep an immutable shot identity even if the projectile itself is reused.
    var shot = {};
    this._shot = shot;
    this.callAttack = function () {
      if (bullet._shot !== shot) return;
      bullet._shot = null;
      if (!isLive()) return;
      if (attack) attack();
    };
  };
  _ctor.prototype.cancel = function () {
    this.state = 2;
    this._shot = null;
    this.callAttack = null;
    this.targetIsLive = null;
    this.tagNode = null;
    this.combatContext = null;
    this.bullet.active = false;
  };
  _ctor.prototype.setTag = function (t, e, n) {
    if (t.x < e.x) {
      this._dir = cc.v2(Math.cos(this.angle * Math.PI / 180), Math.sin(this.angle * Math.PI / 180));
    } else {
      this._dir = cc.v2(-Math.cos(this.angle * Math.PI / 180), Math.sin(this.angle * Math.PI / 180));
    }
    this.bindTarget(e, n);
    this.tagNode.getPosition(this.tagPos);
    this.bullet.active = true;
    var i = 180 * cc.Vec2.RIGHT.signAngle(this._dir) / Math.PI;
    this.node.angle = i;
    this.newAngSpeed = this.angleSpeed;
    this.state = 0;
  };
  _ctor.prototype.onUpdate = function (t) {
    switch (this.state) {
      case 0:
        if (!this.targetIsLive || !this.targetIsLive()) return void this.freeNode();
        this.tagNode.getPosition(this.tagPos);
        this.node.getPosition(this.vec2_1);
        cc.Vec2.subtract(this.vec2_2, this.tagPos, this.vec2_1);
        if (this.vec2_2.len() < impactRadius) {
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
        var travel = this.speed * t;
        var along = this.vec2_2.x * this._dir.x + this.vec2_2.y * this._dir.y;
        var crossed = false;
        // A long step can enter and leave the impact circle between samples.
        // Keep the normal next-tick impact when the endpoint is still inside.
        if (along > 0 && along < travel) {
          var offsetX = this.vec2_2.x - along * this._dir.x;
          var offsetY = this.vec2_2.y - along * this._dir.y;
          var closestSq = offsetX * offsetX + offsetY * offsetY;
          var beyond = travel - along;
          var radiusSq = impactRadius * impactRadius;
          if (closestSq < radiusSq && closestSq + beyond * beyond >= radiusSq) {
            travel = along;
            crossed = true;
          }
        }
        cc.Vec2.multiplyScalar(this.vec2_2, this._dir, travel);
        cc.Vec2.add(this.vec2_1, this.vec2_1, this.vec2_2);
        this.node.setPosition(this.vec2_1);
        if (crossed) this.onDie();
        break;
      case 1:
        this.time -= t;
        this.time <= 0 && this.freeNode();
    }
  };
  _ctor.prototype.onDie = function () {
    if (this.state !== 0) return;
    this.state = 1;
    this.bullet.active = false;
    this.time = 2;
    var attack = this.callAttack;
    this.callAttack = null;
    if (attack) attack();
    this.tagNode = null;
    this.targetIsLive = null;
  };
  _ctor.prototype.freeNode = function () {
    this.cancel();
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "bullet", undefined);
  cc__decorate([ccp_property(cc.Integer)], _ctor.prototype, "angle", undefined);
  cc__decorate([ccp_property(cc.Integer)], _ctor.prototype, "angleSpeed", undefined);
  cc__decorate([ccp_property(cc.Integer)], _ctor.prototype, "speed", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_KinghtFallBulletBase;
