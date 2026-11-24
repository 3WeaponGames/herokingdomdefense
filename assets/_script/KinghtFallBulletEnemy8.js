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
  _ctor.prototype.onUpdate = function (dt) {
    if (this._unitAttackFlight) return require("UnitAttackCombat").advance(this, dt);
    if (!(dt > 0) || !isFinite(dt)) return;
    if (this._projectileVisual) this._projectileVisual.step(dt);
    switch (this.state) {
      case 0:
        if (!this.targetIsLive || !this.targetIsLive()) return void this.freeNode();
        this.readTargetPosition();
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
        cc.Vec2.multiplyScalar(this.vec2_2, this._dir, Math.min(this.vec2_2.len(), dt * this.speed));
        cc.Vec2.add(this.vec2_1, this.vec2_1, this.vec2_2);
        this.node.setPosition(this.vec2_1);
        break;
      case 1:
        this.time -= dt;
        this.time <= 0 && this.freeNode();
    }
  };
  _ctor.prototype.onDie = function () {
    if (this.state !== 0) return;
    var shot = this._shotIdentity, renderer = this.spAni;
    t.prototype.onDie.call(this);
    // Damage may return/rebind this slot or tear its native rig down. Never
    // replace the next shot's flight animation with the previous shot's blast.
    if (this.state === 1 && this._shotIdentity === shot && this.spAni === renderer && cc.isValid(this.node, true) && cc.isValid(renderer, true)) renderer.setAnimation(0, "blast", false);
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
}($z1KinghtFallBulletEnemy.default);
exports.default = def_KinghtFallBulletEnemy8;
