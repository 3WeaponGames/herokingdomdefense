var BattleSounds = require("BattleSounds");
var GameToolsOverrides = require("GameToolsOverrides");
var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var r;
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallBulletSoldier = require("KinghtFallBulletSoldier");
var $z1KinghtFallSoldierBase = require("KinghtFallSoldierBase");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallSoldierItem03 = function (t) {
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
    if (GameToolsOverrides.isPending(this)) return;
    if (!this.captureAttackTarget()) return;
    this.state = $z1KinghtFallSoldierBase.KinghtFallSoldierStatus.Attack;
    this.spAni.setAnimation(0, $z1KinghtFallModle.KinghtFallSoldierAniEnum.Attack, false);
    this.time[r.Attack] = 0;
    GameToolsOverrides.attack(this, "ally", this.doAttack);
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
    if (BattleSounds.attack) BattleSounds.attack(this, "ally");
    if (!currentShot() || !cc.isValid(this, true) || this.node !== sourceNode || !cc.isValid(sourceNode, true) || sourceNode._combatGeneration !== sourceGeneration || this._isPooled || this.isDead && this.isDead()) return;
    this.node.getPosition(this.vec2_1);
    var e = this.getAttack();
    var n = this.releaseAttackTarget();
    if (n) {
      targetNode = n.node; targetGeneration = targetNode._combatGeneration;
      if (GameToolsOverrides.counters(this, n)) e *= Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.RestrainedArms));
      n.node.getPosition(this.vec2_2);
      cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
      this.setLeft(this.vec2_2.x < 0);
      var i = $z1KinghtFallUIGame.default.instance.ctrGame.onShotSoldier(this);
      i.ctr.setParent(this);
      return void i.ctr.setTag(i.pos, n.node, function () {
        if (!currentShot() || n.isDead && n.isDead()) return;
        var shooter = cc.isValid(t, true) && t.node === sourceNode && cc.isValid(sourceNode, true) && sourceNode._combatGeneration === sourceGeneration && !t._isPooled ? t : null;
        var received = n.onAttacked(e, shooter);
        if (currentShot() && ui.ctrEffect === effects && cc.isValid(effects, true) && effects.showDamageNum) effects.showDamageNum(targetNode.getPosition(), received);
        if (currentShot() && ui.ctrEffect === effects && cc.isValid(effects, true) && effects.onMonsterAttack) effects.onMonsterAttack(targetNode.getPosition(), "jian_lv1");
      });
    }
  };
  _ctor.prototype.getAttWpos = function () {
    return this.node.convertToWorldSpaceAR(this.ctrArr.node.getPosition());
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
    type: $z1KinghtFallBulletSoldier.default,
    tooltip: "弓箭位置"
  })], _ctor.prototype, "ctrArr", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "弓箭回收位置"
  })], _ctor.prototype, "ndBulletPat", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallSoldierBase.default);
exports.default = def_KinghtFallSoldierItem03;
(function (t) {
  t.Attack = "Attack";
})(r || (r = {}));
