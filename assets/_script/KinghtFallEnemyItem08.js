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
    this.rigidBody.active = !this._unitTestActor && (this.cfg.BuildingCross === undefined || !!this.cfg.BuildingCross);
    var e = this.getAttack();
    var selected = this.pickAttackTarget(game), n = selected && (selected.actor || selected.building);
    if (n) {
      targetNode = n.node; targetGeneration = targetNode._combatGeneration;
      e = GameToolsOverrides.typeCounterDamage(this, n, e);
      var origin = Navigation.positionOf(sourceNode, game);
      var impact = Navigation.attackPointOf(n, game, origin, selected.polygon, selected.wallPoint);
      var offset = n.getNavigationGateShapes && targetNode.convertToNodeSpaceAR(game.ndMain.convertToWorldSpaceAR(cc.v2(impact)));
      this.vec2_2.x = impact.x; this.vec2_2.y = impact.y;
      cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
      this.setLeft(this.vec2_2.x < 0);
      var i = $z1KinghtFallUIGame.default.instance.ctrGame.onShotEnemy(this);
      i.ctr.setParent(this);
      return void i.ctr.setTag(i.pos, n.node, function () {
        if (!currentShot() || n.isDead && n.isDead()) return;
        if (require("EnemyTargeting").protectingWall(game, origin, n)) return;
        var shooter = cc.isValid(t, true) && t.node === sourceNode && cc.isValid(sourceNode, true) && sourceNode._combatGeneration === sourceGeneration && !t._isPooled ? t : null;
        var received = n.onAttacked(e, shooter, true);
        if (currentShot() && ui.ctrEffect === effects && cc.isValid(effects, true) && effects.showDamageNum) effects.showDamageNum(offset ? cc.v2(impact) : targetNode.getPosition(), received);
      }, offset);
    }
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallEnemyLong.default);
exports.default = def_KinghtFallEnemyItem08;
