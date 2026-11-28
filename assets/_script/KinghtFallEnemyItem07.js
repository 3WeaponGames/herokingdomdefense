function millAttackTargets(data) { return data.getAttackableBuildList ? data.getAttackableBuildList() : data.getBulidList(); }
function skillScope(owner) {
  var ui = $z1KinghtFallUIGame.default.instance, game = ui && ui.ctrGame, node = owner.node;
  return { ui: ui, game: game, data: game && game.gameData, effects: ui && ui.ctrEffect, hero: game && game.ctrPlay,
    epoch: game && game._combatEpoch, stage: game && game.gameStatus, node: node, generation: node && node._combatGeneration, timers: owner.time };
}
function skillCurrent(owner, scope, released) {
  return scope && scope.ui && scope.game && scope.data && cc.isValid(scope.ui, true) && cc.isValid(scope.effects, true) &&
    $z1KinghtFallUIGame.default.instance === scope.ui && !scope.ui.isclose && scope.ui.ctrGame === scope.game && scope.ui.ctrEffect === scope.effects && cc.isValid(scope.game, true) &&
    (!scope.game.node || cc.isValid(scope.game.node, true) && scope.game.node.activeInHierarchy !== false) &&
    scope.game.gameData === scope.data && scope.game.ctrPlay === scope.hero && scope.game._combatEpoch === scope.epoch && scope.game.gameStatus === scope.stage &&
    cc.isValid(owner, true) && owner.node === scope.node && cc.isValid(scope.node, true) && scope.node.activeInHierarchy !== false &&
    scope.node._combatGeneration === scope.generation && owner.time === scope.timers && !owner._isPooled && (released || !owner.isDead() && owner.hp > 0);
}
function skillTarget(actor) { return { item: actor, node: actor.node, generation: actor.node && actor.node._combatGeneration }; }
function targetCurrent(record, live) {
  var actor = record.item;
  return cc.isValid(actor, true) && actor.node === record.node && cc.isValid(record.node, true) && record.node._combatGeneration === record.generation && !actor._isPooled &&
    (!live || (!actor.isDead || !actor.isDead()) && !(typeof actor.hp === "number" && actor.hp <= 0) && (!actor.getIsWork || actor.getIsWork()));
}
function splashSnapshot(owner, primary, scope, wallImpact) {
  var center = wallImpact || primary.node.getPosition();
  var world = wallImpact ? scope.game.ndMain.convertToWorldSpaceAR(wallImpact) : primary.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
  var radius = owner.cfg.Data[1], records = [], origin = Navigation.positionOf(owner.node, scope.game);
  var targeting = require("EnemyTargeting"), rule = targeting.settings(owner.cfg);
  if (rule && !targeting.allows(rule, scope.game, primary)) return { scope: scope, records: records, damage: owner.cfg.Data[0], limit: 0 };
  function include(actor) {
    if (!actor || actor.uuid === primary.uuid || rule && !targeting.allows(rule, scope.game, actor)) return;
    var record = skillTarget(actor);if (!targetCurrent(record, true)) return;
    record.position = actor.node.getPosition();record.len = cc.Vec2.distance(record.position, center);
    if (record.len <= radius) records.push(record);
  }
  include(scope.hero);scope.data.getSoldierList().forEach(include);
  var buildings = millAttackTargets(scope.data), circle = { position: world, radius: radius };
  for (var index = 0; index < buildings.length; index++) {
    var building = buildings[index], record = skillTarget(building);
    if (building.uuid === primary.uuid || !targetCurrent(record, true) || rule && !targeting.allows(rule, scope.game, building) ||
        targeting.protectingWall(scope.game, origin, building)) continue;
    var polygons = building.getWposPhyCol();
    for (var part = 0; part < polygons.length; part++) if (cc.Intersection.polygonCircle(polygons[part], circle)) {
      record.position = building.node.getPosition();record.len = cc.Vec2.distance(record.position, center);records.push(record);break;
    }
  }
  records.sort(function (a, b) { return a.len - b.len; });
  return { scope: scope, records: records, damage: owner.cfg.Data[0], limit: owner.cfg.Data[2], origin: origin };
}
var BattleSounds = require("BattleSounds");
var i;
var GameToolsOverrides = require("GameToolsOverrides");
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var r;
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallEnemyMelee = require("KinghtFallEnemyMelee");
var Navigation = require("KinghtFallNavigation");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_KinghtFallEnemyItem07 = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.oldPos = cc.v2();
    e.moveTime = 40;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    t.prototype.start.call(this);
    $z1KinghtFallUIGame.default.instance.ctrEffect.loadEffect($z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier7Attack);
    $z1KinghtFallUIGame.default.instance.ctrEffect.loadEffect($z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier7Move);
  };
  _ctor.prototype.initData = function (e, n, lease) {
    if (t.prototype.initData.call(this, e, n, lease) === false) return false;
    this.node.getPosition(this.oldPos);
    this.time[r.Movetime] = this.moveTime;
  };
  _ctor.prototype.onUpdate = function (e) {
    if (!this.isDead()) {
      this.node.getPosition(this.vec2_1);
      cc.Vec2.subtract(this.vec2_2, this.vec2_1, this.oldPos);
      this.time[r.Movetime] += this.vec2_2.len();
      if (this.time[r.Movetime] >= this.moveTime) {
        var scope = skillScope(this);
        this.time[r.Movetime] -= this.moveTime;
        scope.effects.onMoveTrack(this.vec2_1.clone(), $z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier7Move, $z1KinghtFallConfig.KinghtFallPoolName.Soldier7Move);
        if (!skillCurrent(this, scope, false)) return;
      }
      this.node.getPosition(this.oldPos);
      t.prototype.onUpdate.call(this, e);
    }
  };
  _ctor.prototype.doAttack = function () {
    var scope = skillScope(this);
    if (!skillCurrent(this, scope, false)) return;
    if (BattleSounds.attack) BattleSounds.attack(this, "enemy");
    if (!skillCurrent(this, scope, false)) return;
    var t = this;
    this.time[r.Attack] = 0;
    this.node.getPosition(this.vec2_1);
    var e = this.getAttack();
    var selected = this.pickAttackTarget(scope.game), n = selected && (selected.actor || selected.building);
    if (n) {
      var victim = skillTarget(n);
      if (!skillCurrent(this, scope, false) || !targetCurrent(victim, true)) return;
      var impact = cc.v2(Navigation.attackPointOf(n, scope.game, Navigation.positionOf(this.node, scope.game), selected.polygon, selected.wallPoint));
      var release = splashSnapshot(this, n, scope, n.getNavigationGateShapes ? impact : null), origin = this.vec2_1.clone();
      GameToolsOverrides.counters(this, n) && (e *= Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.RestrainedArms)));
      var dealt = n.onAttacked(e, t);
      if (!skillCurrent(this, scope, true)) return;
      if (targetCurrent(victim, false)) scope.effects.showDamageNum(impact, dealt);
      if (!skillCurrent(this, scope, true)) return;
      this.setLeft(impact.x - origin.x < 0);
      if (!skillCurrent(this, scope, true)) return;
      scope.effects.onAttack2(impact, $z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier7Attack, $z1KinghtFallConfig.KinghtFallPoolName.Soldier7Attack, "xiao");
      if (skillCurrent(this, scope, true)) this.doSplashDamage(n, release);
    }
  };
  _ctor.prototype.doSplashDamage = function (target, release) {
    if (!release || !release.scope) {
      var scope = skillScope(this);
      if (!skillCurrent(this, scope, false) || !target || !targetCurrent(skillTarget(target), false)) return;
      release = splashSnapshot(this, target, scope);
    }
    for (var index = 0; index < release.limit; index++) {
      if (!skillCurrent(this, release.scope, true)) return;
      var record = release.records[index];if (!record) break;
      if (!targetCurrent(record, true) || require("EnemyTargeting").protectingWall(release.scope.game, release.origin, record.item)) continue;
      var damage = GameToolsOverrides.typeCounterDamage(this, record.item, release.damage);
      var received = record.item.onAttacked(damage, this);
      if (!skillCurrent(this, release.scope, true)) return;
      if (!targetCurrent(record, false)) continue;
      release.scope.effects.showDamageNum(record.position, received);
      if (!skillCurrent(this, release.scope, true)) return;
      release.scope.effects.onAttack(record.position, $z1KinghtFallConfig.KinghtFallPrefabName.EffectSoldier7Attack, $z1KinghtFallConfig.KinghtFallPoolName.Soldier7Attack);
    }
  };
  return cc__decorate([ccp_ccclass], _ctor);
}($z1KinghtFallEnemyMelee.default);
exports.default = def_KinghtFallEnemyItem07;
(function (t) {
  t.Attack = "Attack";
  t.Movetime = "Movetime";
})(r || (r = {}));
