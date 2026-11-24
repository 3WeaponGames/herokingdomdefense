var BattleSounds = require("BattleSounds");
var i;
var GameToolsOverrides = require("GameToolsOverrides");
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallBulletEnemy = require("KinghtFallBulletEnemy");
var $z1KinghtFallEnemyBase = require("KinghtFallEnemyBase");
var Navigation = require("KinghtFallNavigation");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallEnemyLong = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ctrArr = null;
    e.ndBulletPat = null;
    e.ndBullet = [];
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    t.prototype.start.call(this);
    this.ctrArr.node.active = false;
    this.ndBulletPat.active = false;
  };
  _ctor.prototype.doAttackStart = function () {
    t.prototype.doAttackStart.call(this, 0);
  };
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
    var e = this.getAttack();
    var selected = this.pickAttackTarget(game), n = selected && (selected.actor || selected.building);
    if (n) {
      targetNode = n.node; targetGeneration = targetNode._combatGeneration;
      // Counter bonuses belong to the released shot, not a later pooled life.
      if (GameToolsOverrides.counters(this, n)) e *= Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.RestrainedArms));
      var origin = Navigation.positionOf(sourceNode, game);
      var impact = Navigation.attackPointOf(n, game, origin, selected.polygon);
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
        var position = offset ? cc.v2(impact) : targetNode.getPosition(), received = n.onAttacked(e, shooter, true);
        if (currentShot() && ui.ctrEffect === effects && cc.isValid(effects, true) && effects.showDamageNum) effects.showDamageNum(position, received);
        if (currentShot() && ui.ctrEffect === effects && cc.isValid(effects, true) && effects.onMonsterAttack) effects.onMonsterAttack(position, "jian_lv1");
      }, offset);
    }
  };
  _ctor.prototype.getAttWpos = function () {
    var muzzle = this.ctrArr.node;
    return (muzzle.parent || this.node).convertToWorldSpaceAR(muzzle.getPosition());
  };
  _ctor.prototype.getBullet = function () {
    return this.ndBullet.shift() || cc.instantiate(this.ctrArr.node);
  };
  _ctor.prototype.freeBullet = function (t) {
    t.node.active = false;
    t.node.setParent(this.ndBulletPat);
    this.ndBullet.push(t.node);
  };
  cc__decorate([ccp_property({
    type: $z1KinghtFallBulletEnemy.default,
    tooltip: "弓箭位置"
  })], _ctor.prototype, "ctrArr", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "弓箭回收位置"
  })], _ctor.prototype, "ndBulletPat", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallEnemyBase.default);
exports.default = def_KinghtFallEnemyLong;
