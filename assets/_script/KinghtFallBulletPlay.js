var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallBulletBase = require("KinghtFallBulletBase");
var EquipmentTiers = require("EquipmentTiers"), warnedSkin = false;
var STRAIGHT_FLIGHT = 3;
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_KinghtFallBulletPlay = function (t) {
  function _ctor() {
    return null !== t && t.apply(this, arguments) || this;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.setTag = function (t, e, n) {
    this._dir = cc.v2(e.x - t.x, e.y - t.y).normalizeSelf();
    this.bindTarget(e, n);
    this.tagNode.getPosition(this.tagPos);
    this.bullet.active = true;
    var i = 180 * cc.Vec2.RIGHT.signAngle(this._dir) / Math.PI;
    this.node.angle = i;
    this.newAngSpeed = this.angleSpeed;
    this.state = 0;
    if (this._launchProjectileLook) this._launchProjectileLook();
  };
  _ctor.prototype.setLeft = function (t, e, n) {
    this._dir = t ? cc.v2(-Math.cos(this.angle * Math.PI / 180), Math.sin(this.angle * Math.PI / 180)) : cc.v2(Math.cos(this.angle * Math.PI / 180), Math.sin(this.angle * Math.PI / 180));
    this.bindTarget(e, n);
    this.tagNode.getPosition(this.tagPos);
    this.bullet.active = true;
    var i = 180 * cc.Vec2.RIGHT.signAngle(this._dir) / Math.PI;
    this.node.angle = i;
    this.newAngSpeed = this.angleSpeed;
    this.state = 0;
    if (this._launchProjectileLook) this._launchProjectileLook();
  };
  _ctor.prototype.beginStraightFlight = function (heading) {
    this._shot = this._shotIdentity = {};
    this.tagNode = this.targetIsLive = this.callAttack = null;
    this.bullet.active = true;
    this.node.angle = heading;
    this.state = STRAIGHT_FLIGHT;
    if (this._launchProjectileLook) this._launchProjectileLook();
  };
  _ctor.prototype.moveStraightFlight = function (position, dt) {
    var world = this.combatContext.ndMain.convertToWorldSpaceAR(cc.v2(position.x, position.y));
    this.node.setPosition(this.node.parent.convertToNodeSpaceAR(world));
    if (this._projectileVisual) this._projectileVisual.step(dt);
  };
  _ctor.prototype.onUpdate = function (dt) {
    // The skill runtime owns straight flight and advances it from the release
    // marker. The battle still owns the arrow's pool and wave cleanup.
    if (this.state !== STRAIGHT_FLIGHT) t.prototype.onUpdate.call(this, dt);
  };
  _ctor.prototype.setSkin = function (t) {
    var renderer = this.bullet && this.bullet.getComponent(sp.Skeleton), data = renderer && renderer.skeletonData, runtime, name;
    try {
      runtime = data && data.getRuntimeData && data.getRuntimeData();
      name = EquipmentTiers.legacySkin(t, function (value) {
        if (runtime && typeof runtime.findSkin === "function") return !!runtime.findSkin(value);
        var skins = data && data.skeletonJson && data.skeletonJson.skins;
        return Array.isArray(skins) ? skins.some(function (skin) { return skin.name === value; }) : !!(skins && Object.prototype.hasOwnProperty.call(skins, value));
      });
    } catch (error) { name = null; }
    if (!name) {
      if (!warnedSkin && cc.warn) cc.warn("Hero projectile skin unavailable; retaining the current authored skin.", t);
      warnedSkin = true;
      return;
    }
    renderer.setSkin(name);
  };
  _ctor.prototype.freeNode = function () {
    if (this.state === 2) return;
    var game = this.combatContext || $z1KinghtFallUIGame.default.instance.ctrGame;
    this.cancel();
    if (game && cc.isValid(game, true)) game.freeBullet(this);
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallBulletBase.default);
exports.default = def_KinghtFallBulletPlay;
