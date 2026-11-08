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
var def_KinghtFallBulletBuild = function (t) {
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
  };
  _ctor.prototype.setTowerTag = function (origin, target, attack, behavior) {
    this.setTag(origin, target, attack);
    this._towerBehavior = behavior;
    if (behavior.attackType === "cannon") {
      // Artillery commits to a ground location. A killed/pool-reused primary
      // target must not cancel a blast that can still hit nearby enemies.
      var bullet = this, game = this.combatContext, epoch = game && game._combatEpoch, shot = this._shot;
      this._towerImpactPoint = require("TowerCombat").point(target, this.node.parent);
      var center = this._towerImpactPoint;
      this.tagNode = { getPosition: function (out) { out.x = center.x; out.y = center.y; return out; } };
      this.targetIsLive = function () {
        return cc.isValid(bullet.node, true) && (!game || cc.isValid(game, true) && cc.isValid(game.node, true) && game._combatEpoch === epoch);
      };
      var isCurrent = this.targetIsLive;
      this.callAttack = function () {
        if (bullet._shot !== shot) return;
        bullet._shot = null;
        if (isCurrent() && attack) attack();
      };
      this.tagNode.getPosition(this.tagPos);
      this._dir = cc.v2(center.x - origin.x, center.y - origin.y).normalizeSelf();
      this.node.angle = 180 * cc.Vec2.RIGHT.signAngle(this._dir) / Math.PI;
    } else {
      // Keep the target's original life guard, but read movement in the shot
      // parent's space instead of assuming world and effects nodes coincide.
      var projectile = this;
      this.tagNode = { getPosition: function (out) {
        var position = require("TowerCombat").point(target, projectile.node.parent);
        out.x = position.x; out.y = position.y; return out;
      } };
      this.tagNode.getPosition(this.tagPos);
      this._dir = cc.v2(this.tagPos.x - origin.x, this.tagPos.y - origin.y).normalizeSelf();
      this.node.angle = 180 * cc.Vec2.RIGHT.signAngle(this._dir) / Math.PI;
    }
    if (!behavior.projectileLook && behavior.attackType !== "arrow") this._showTowerFlight(behavior.attackType);
  };
  _ctor.prototype._showTowerFlight = function (type) {
    if (!cc.Graphics) return;
    var node = this._towerFlightNode;
    if (!node || !cc.isValid(node, true)) {
      node = this._towerFlightNode = new cc.Node("Tower projectile");
      node.setParent(this.node);
      node.group = this.node.group;
      node.addComponent(cc.Graphics);
    }
    node.active = true;
    node.setPosition(0, 0);
    var graphics = node.getComponent(cc.Graphics);
    graphics.clear();
    if (type === "cannon") {
      graphics.fillColor = cc.color("#414754"); graphics.strokeColor = cc.color("#171c24"); graphics.lineWidth = 2;
      graphics.circle(0, 0, 8); graphics.fill(); graphics.stroke();
      graphics.fillColor = cc.color("#a4b0bd"); graphics.circle(-2, 3, 2); graphics.fill();
    } else {
      graphics.strokeColor = cc.color("#402c16"); graphics.lineWidth = 5;
      graphics.moveTo(-17, 0); graphics.lineTo(12, 0); graphics.stroke();
      graphics.strokeColor = cc.color("#ffe58b"); graphics.lineWidth = 2;
      graphics.moveTo(-18, 0); graphics.lineTo(13, 0); graphics.stroke();
      graphics.fillColor = cc.color("#fff9da"); graphics.moveTo(18, 0); graphics.lineTo(8, 5); graphics.lineTo(8, -5); graphics.close(); graphics.fill();
    }
    this._towerOriginalRenderers = [];
    this.node.getComponentsInChildren(cc.RenderComponent).forEach(function (renderer) {
      if (renderer === graphics || renderer.node === this._towerImpactNode) return;
      this._towerOriginalRenderers.push({ renderer: renderer, enabled: renderer.enabled }); renderer.enabled = false;
    }, this);
  };
  _ctor.prototype._showTowerImpact = function () {
    if (!cc.Graphics || !this._towerBehavior || this._towerBehavior.attackType !== "cannon") return;
    var node = this._towerImpactNode;
    if (!node || !cc.isValid(node, true)) {
      node = this._towerImpactNode = new cc.Node("Cannon blast"); node.setParent(this.node); node.group = this.node.group; node.addComponent(cc.Graphics);
    }
    node.active = true; node.opacity = 220; node.setPosition(0, 0); node.setScale(.3);
    var graphics = node.getComponent(cc.Graphics), radius = Math.max(12, this._towerBehavior.splashRadius);
    graphics.clear(); graphics.fillColor = cc.color(255, 183, 53, 80); graphics.strokeColor = cc.color("#ffd777"); graphics.lineWidth = 4;
    graphics.circle(0, 0, radius); graphics.fill(); graphics.stroke();
    graphics.strokeColor = cc.color("#fff0b0"); graphics.lineWidth = 3;
    for (var i = 0; i < 8; i++) { var angle = i * Math.PI / 4; graphics.moveTo(Math.cos(angle) * radius * .35, Math.sin(angle) * radius * .35); graphics.lineTo(Math.cos(angle) * radius * .75, Math.sin(angle) * radius * .75); }
    graphics.stroke(); this._towerImpactAge = 0;
  };
  _ctor.prototype.onDie = function () {
    if (this.state !== 0) return;
    if (this._towerFlightNode && cc.isValid(this._towerFlightNode, true)) this._towerFlightNode.active = false;
    if (this._towerBehavior && this._towerBehavior.attackType === "cannon" && this._towerImpactPoint) this.node.setPosition(this._towerImpactPoint);
    this._showTowerImpact();
    t.prototype.onDie.call(this);
  };
  _ctor.prototype.onUpdate = function (dt) {
    t.prototype.onUpdate.call(this, dt);
    if (this._towerImpactNode && this._towerImpactNode.active) {
      this._towerImpactAge += dt;
      var progress = Math.min(1, this._towerImpactAge / .24);
      this._towerImpactNode.setScale(.3 + .7 * progress); this._towerImpactNode.opacity = 220 * (1 - progress);
      if (progress >= 1) this._towerImpactNode.active = false;
    }
  };
  _ctor.prototype.cancel = function () {
    (this._towerOriginalRenderers || []).forEach(function (entry) { if (cc.isValid(entry.renderer, true)) entry.renderer.enabled = entry.enabled; });
    this._towerOriginalRenderers = null;
    if (this._towerFlightNode && cc.isValid(this._towerFlightNode, true)) this._towerFlightNode.active = false;
    if (this._towerImpactNode && cc.isValid(this._towerImpactNode, true)) this._towerImpactNode.active = false;
    this._towerBehavior = null; this._towerImpactPoint = null;
    t.prototype.cancel.call(this);
  };
  _ctor.prototype.freeNode = function () {
    if (this.state === 2) return;
    this.cancel();
    $z1KinghtFallUIGame.default.instance.ctrGame.freeBuildBullet(this);
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallBulletBase.default);
exports.default = def_KinghtFallBulletBuild;
