var BattleSounds = require("BattleSounds");
var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var r;
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallInterface = require("KinghtFallInterface");
var $z1KinghtFallEnemyAuxiliary = require("KinghtFallEnemyAuxiliary");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_KinghtFallEnemyItem06 = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.tagUse = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.initData = function (e, n) {
    t.prototype.initData.call(this, e, n);
    this.node.getComponent(cc.CircleCollider).radius = this.cfg.Data[2];
  };
  _ctor.prototype.doAttack = function () {
    var ui = $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame, data = game && game.gameData;
    var owner = this, node = this.node, generation = node && node._combatGeneration, epoch = game && game._combatEpoch, timers = this.time;
    function current() {
      return game && data && cc.isValid(ui, true) && $z1KinghtFallUIGame.default.instance === ui && !ui.isclose && ui.ctrGame === game &&
        cc.isValid(game, true) && (!game.node || cc.isValid(game.node, true) && game.node.activeInHierarchy !== false) && game.gameData === data && game._combatEpoch === epoch && game.gameStatus === $z1KinghtFallModle.KinghtFallGameStage.Fight &&
        cc.isValid(owner, true) && owner.node === node && cc.isValid(node, true) && node.activeInHierarchy !== false && node._combatGeneration === generation && owner.time === timers && !owner.isDestroy && !owner._isPooled && !owner.isDead() && owner.hp > 0;
    }
    if (!current()) return;
    var strength = this.cfg.Data[0], duration = this.cfg.Data[1], radius = this.cfg.Data[2], limit = this.cfg.Data[3];
    if (BattleSounds.attack) BattleSounds.attack(this, "enemy");
    if (!current()) return;
    this.time[r.Attack] = 0;
    var t = data.getEnemyList();
    this.node.getPosition(this.vec2_1);
    var e = [];
    for (var n = 0; n < t.length; n++) {
      var i = t[n];
      if (i && i.uuid != this.uuid && cc.isValid(i, true) && cc.isValid(i.node, true) && !i._isPooled && !i.isDead() && i.hp > 0) {
        i.node.getPosition(this.vec2_2);
        cc.Vec2.subtract(this.vec2_2, this.vec2_2, this.vec2_1);
        this.vec2_2.mag() < radius && e.push({
          len: this.vec2_2.mag(),
          enemy: i,
          node: i.node,
          generation: i.node._combatGeneration
        });
      }
    }
    e.sort(function (t, e) {
      return t.len - e.len;
    });
    for (n = 0; n < limit; n++) {
      if (!current()) return;
      var i;
      if (!(i = e[n])) {
        break;
      }
      if (!cc.isValid(i.enemy, true) || i.enemy.node !== i.node || !cc.isValid(i.node, true) || i.node._combatGeneration !== i.generation || i.enemy._isPooled || i.enemy.isDead() || !(i.enemy.hp > 0)) continue;
      i.enemy.addBuff($z1KinghtFallInterface.KinghtFallEnemyBuffType.AttackSpeed, {
        addSpeed: strength,
        time: duration
      });
    }
    if (current()) this.tagUse = e.length > 0;
  };
  _ctor.prototype.doAttackFinish = function () {
    if (this.tagUse) {
      this.doWait();
    } else {
      this.doMove();
    }
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallEnemyAuxiliary.default);
exports.default = def_KinghtFallEnemyItem06;
(function (t) {
  t.Attack = "Attack";
})(r || (r = {}));
