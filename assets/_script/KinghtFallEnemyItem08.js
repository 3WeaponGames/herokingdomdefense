function millAttackTargets(data) { return data.getAttackableBuildList ? data.getAttackableBuildList() : data.getBulidList(); }
var BattleSounds = require("BattleSounds");
var GameToolsOverrides = require("GameToolsOverrides");
var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallEnemyLong = require("KinghtFallEnemyLong");
var Navigation = require("KinghtFallNavigation");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_KinghtFallEnemyItem08 = function (t) {
  function _ctor() {
    return null !== t && t.apply(this, arguments) || this;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.doAttack = function () {
    var t = this, ui = $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame;
    if (!game) return;
    var data = game.gameData, epoch = game._combatEpoch, stage = game.gameStatus, effects = ui.ctrEffect;
    var sourceNode = this.node, sourceGeneration = sourceNode && sourceNode._combatGeneration, targetNode = null, targetGeneration;
    function currentShot() {
      return $z1KinghtFallUIGame.default.instance === ui && cc.isValid(ui, true) && !ui.isclose &&
        (!ui.node || cc.isValid(ui.node, true) && ui.node.activeInHierarchy !== false) && ui.ctrGame === game && cc.isValid(game, true) &&
        (!game.node || cc.isValid(game.node, true) && game.node.activeInHierarchy !== false) && game.gameData === data && game._combatEpoch === epoch && game.gameStatus === stage &&
        (!targetNode || cc.isValid(n, true) && n.node === targetNode && cc.isValid(targetNode, true) && targetNode._combatGeneration === targetGeneration && targetNode.activeInHierarchy !== false && !n._isPooled && !n.isDestroyed);
    }
    if (BattleSounds.attack) BattleSounds.attack(this, "enemy");
    if (!currentShot() || !cc.isValid(this, true) || this.node !== sourceNode || !cc.isValid(sourceNode, true) || sourceNode._combatGeneration !== sourceGeneration || this._isPooled || this.isDead && this.isDead()) return;
    this.node.getPosition(this.vec2_1);
    this.rigidBody.active = true;
    var e = this.getAttack();
    var n = function () {
      var forced = require("RelicCombat").tauntedTarget(t);
      if (forced) {
        forced.node.getPosition(t.vec2_2);
        cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
        return t.vec2_2.len() <= t.cfg.AttackRange ? forced : null;
      }
      var e = null;
      var n = -1;
      var i = $z1KinghtFallUIGame.default.instance.ctrGame.ctrPlay;
      if (!i.isDead()) {
        i.node.getPosition(t.vec2_2);
        cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
        if (t.vec2_2.len() <= t.cfg.AttackRange) {
          e = i, n = t.vec2_2.len();
        }
      }
      var a = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getSoldierList();
      for (var o = 0; o < a.length; o++) {
        if (!(h = a[o]).isDead()) {
          h.node.getPosition(t.vec2_2);
          cc.Vec2.subtract(t.vec2_2, t.vec2_2, t.vec2_1);
          if (t.vec2_2.len() <= t.cfg.AttackRange && (-1 == n || t.vec2_2.len() < n)) {
            e = h, n = t.vec2_2.len();
          }
        }
      }
      var s = {
        position: t.node.convertToWorldSpaceAR(cc.Vec2.ZERO),
        radius: t.cfg.AttackRange
      };
      var l = millAttackTargets($z1KinghtFallUIGame.default.instance.ctrGame.gameData);
      for (var c = 0; c < l.length; c++) {
        var h;
        if ((h = l[c]).getIsWork()) {
          var g = Navigation.attackPartsOf(h);
          for (var u = 0; u < g.length; u++) {
            var d = g[u];
            if (cc.Intersection.polygonCircle(d.points, s)) {
              var targetDistance = Navigation.polygonDistance(t, d.points, $z1KinghtFallUIGame.default.instance.ctrGame);
              if (-1 == n || targetDistance < n) {
                e = h;
                n = targetDistance;
              }
            }
          }
        }
      }
      return e;
    }();
    if (n) {
      targetNode = n.node; targetGeneration = targetNode._combatGeneration;
      e = GameToolsOverrides.typeCounterDamage(this, n, e);
      var impactPoint=Navigation.attackPointOf(n,$z1KinghtFallUIGame.default.instance.ctrGame);this.vec2_2.x=impactPoint.x;this.vec2_2.y=impactPoint.y;
      cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
      this.setLeft(this.vec2_2.x < 0);
      var i = $z1KinghtFallUIGame.default.instance.ctrGame.onShotEnemy(this);
      i.ctr.setParent(this);
      return void i.ctr.setTag(i.pos, n.node, function () {
        if (!currentShot() || n.isDead && n.isDead()) return;
        var shooter = cc.isValid(t, true) && t.node === sourceNode && cc.isValid(sourceNode, true) && sourceNode._combatGeneration === sourceGeneration && !t._isPooled ? t : null;
        var received = n.onAttacked(e, shooter, true);
        if (currentShot() && ui.ctrEffect === effects && cc.isValid(effects, true) && effects.showDamageNum) effects.showDamageNum(targetNode.getPosition(), received);
      });
    }
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallEnemyLong.default);
exports.default = def_KinghtFallEnemyItem08;
