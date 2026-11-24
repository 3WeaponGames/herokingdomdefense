"use strict";

var Rules = require("./UnitAttackRules");
var TowerCombat = require("./TowerCombat");
var FlightTargeting = require("./FlightTargeting");
var Navigation = require("KinghtFallNavigation");
var Overrides = require("GameToolsOverrides");

function battleCurrent(scope) {
  var ui = scope.ui, game = scope.game;
  return cc.isValid(ui, true) && require("KinghtFallUIGame").default.instance === ui && !ui.isclose &&
    (!ui.node || cc.isValid(ui.node, true) && ui.node.activeInHierarchy !== false) &&
    ui.ctrGame === game && cc.isValid(game, true) && cc.isValid(game.node, true) && game.node.activeInHierarchy !== false &&
    game.gameData === scope.data && game._combatEpoch === scope.epoch && game.gameStatus === scope.stage;
}
function sourceCurrent(scope) {
  var actor = scope.owner, node = scope.sourceNode;
  return cc.isValid(actor, true) && actor.node === node && cc.isValid(node, true) &&
    node._combatGeneration === scope.sourceGeneration && !actor._isPooled;
}
function attackCurrent(scope) { return battleCurrent(scope) && sourceCurrent(scope) && TowerCombat.live(scope.owner); }
function targetLive(actor) {
  return TowerCombat.live(actor) && !actor.isDestroyed && typeof actor.onAttacked === "function" &&
    (!actor.getIsWork || actor.getIsWork());
}
function targetCurrent(entry) {
  return TowerCombat.targetCurrent(entry) && targetLive(entry.actor) && entry.actor.buildInfo === entry.buildInfo;
}
function position(actor, scope, polygon) {
  return Navigation.attackPointOf(actor, scope.game, scope.side === "enemy" ? scope.origin : null, polygon);
}
function capture(actor, scope, polygon) {
  var entry = TowerCombat.capture(actor, position(actor, scope, polygon));
  entry.buildInfo = actor.buildInfo;
  return entry;
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function canTarget(scope, actor) {
  return scope.side === "enemy" || scope.rules.delivery === "ranged" || !FlightTargeting.isFlying(actor);
}
function protectedByWall(scope, actor) {
  return scope.targetingRules && scope.targetingRules.protectingWall(scope.game, scope.origin, actor);
}
function opponents(scope) {
  var data = scope.data;
  if (scope.side === "ally") return data.getEnemyList();
  var buildings = data.getAttackableBuildList ? data.getAttackableBuildList() : data.getBulidList();
  return [scope.game.ctrPlay].concat(data.getSoldierList(), buildings);
}
function candidates(scope, exclude) {
  var seen = new Set();
  return opponents(scope).filter(function (actor) {
    if (!targetLive(actor) || !canTarget(scope, actor) || seen.has(actor.node) || exclude && exclude.has(actor.node) ||
        scope.targeting && !scope.targetingRules.allows(scope.targeting, scope.game, actor, scope.breach) ||
        protectedByWall(scope, actor)) return false;
    seen.add(actor.node);
    return true;
  });
}
function nearby(scope, center, range, exclude) {
  return candidates(scope, exclude).map(function (actor) {
    var entry = capture(actor, scope);
    entry.distance = distance(center, entry.position);
    return entry;
  }).filter(function (entry) { return entry.distance <= range; }).sort(function (a, b) { return a.distance - b.distance; });
}
function deal(scope, entry, amount, impact, current) {
  if (!(amount > 0) || !isFinite(amount) || !current() || !targetCurrent(entry) || !canTarget(scope, entry.actor) ||
      protectedByWall(scope, entry.actor)) return false;
  if (Overrides.counters(scope.attacker, entry.actor)) {
    var parameter = require("KinghtFallEnum").KinghtFallEnumParameterCfg.RestrainedArms;
    amount *= Number(require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().getParamsCfgById(parameter));
  }
  var source = sourceCurrent(scope) ? scope.owner : null;
  var onHit = scope.rules.onHit;
  var hpBefore = onHit && onHit.lifeSteal && (entry.buildInfo || entry.actor).hp;
  var context = !source && scope.side === "ally" ? { barracksProjectile: true } : undefined;
  var dealt = entry.actor.onAttacked(amount, source, scope.rules.delivery === "ranged" && scope.side === "enemy", context);
  if (onHit && dealt > 0 && isFinite(dealt) && current()) {
    var slow = onHit.slow, lifeSteal = onHit.lifeSteal;
    if (slow && slow.percent > 0 && slow.duration > 0 && !entry.buildInfo && entry.actor.addBuff && targetCurrent(entry)) {
      var types = require("KinghtFallInterface").KinghtFallEnemyBuffType;
      entry.actor.addBuff(types.MoveSlow, { subNum: slow.percent, time: slow.duration }, "moveSlow");
    }
    if (lifeSteal && lifeSteal.percent > 0 && hpBefore > 0 && source && source.hpMax > 0 &&
        current() && sourceCurrent(scope) && TowerCombat.live(source)) {
      // Use the resolved damage and cap it to the HP the target had before the hit.
      require("RelicRuntime").heal(source, Math.min(dealt, hpBefore) * lifeSteal.percent / source.hpMax);
    }
  }
  var effects = scope.effects;
  if (!current() || scope.ui.ctrEffect !== effects || !cc.isValid(effects, true)) return true;
  if (cc.isValid(entry.node, true) && entry.actor.node === entry.node && entry.node._combatGeneration === entry.generation) {
    if (effects.showDamageNum) effects.showDamageNum(cc.v2(impact.x, impact.y), dealt);
  }
  if (current() && scope.ui.ctrEffect === effects && cc.isValid(effects, true) && effects.onMonsterAttack) {
    effects.onMonsterAttack(cc.v2(impact.x, impact.y), scope.rules.delivery === "ranged" ? "jian_lv1" : "xb_gj");
  }
  return true;
}
function blast(scope, primary, center, current) {
  var radius = scope.rules.splashRadius;
  if (!(radius > 0)) return deal(scope, primary, scope.amount, center, current);
  nearby(scope, center, radius).forEach(function (entry) {
    var factor = TowerCombat.splashMultiplier(entry.distance, radius, scope.rules.splashFalloff);
    deal(scope, entry, scope.amount * factor, entry.position, current);
  });
}
function draw(shot, flight, point, direction) {
  var parent = shot.node.parent, space = flight.scope.game.ndMain;
  var at = TowerCombat.convert(point, space, parent);
  if (direction) {
    var from = TowerCombat.convert(flight.position, space, parent);
    var aim = TowerCombat.convert(direction, space, parent);
    if (aim.x !== from.x || aim.y !== from.y) shot.node.angle = Math.atan2(aim.y - from.y, aim.x - from.x) * 180 / Math.PI;
  }
  shot.node.setPosition(at.x, at.y);
  flight.position = point;
}
function launch(scope, target) {
  if (!attackCurrent(scope) || !targetCurrent(target)) return;
  var shot = scope.game.onShotUnit(scope.owner, scope.side), rules = scope.rules;
  if (!shot) return;
  var start = TowerCombat.convert(shot.node.getPosition(), shot.node.parent, scope.game.ndMain);
  var flight = { scope: scope, target: target, position: start, amount: scope.amount };
  if (rules.pattern === "splash") flight.end = target.position;
  if (rules.pattern === "piercing") {
    flight.end = TowerCombat.lineEnd(scope.origin, scope.range, start, target.position);
    flight.remaining = rules.pierceTargets;
    flight.hits = new Map();
  }
  if (rules.pattern === "chain") {
    flight.remaining = rules.chainHits;
    flight.visited = new Set();
  }
  shot._unitAttackFlight = shot._shot = shot._shotIdentity = flight;
  shot.callAttack = null;
  shot.state = 0;
  if (!battleCurrent(scope)) return void shot.freeNode();
  shot.bullet.active = true;
  draw(shot, flight, start, target.position);
  if (shot._launchProjectileLook) shot._launchProjectileLook();
}
function release(owner, side) {
  var rules = Rules.settings(owner.cfg);
  if (!rules || owner._unitTestActor) return;
  var ui = require("KinghtFallUIGame").default.instance, game = ui && ui.ctrGame;
  if (!game || owner._combatGame && owner._combatGame !== game) return;
  var scope = {
    rules: rules, side: side, ui: ui, game: game, data: game.gameData, epoch: game._combatEpoch, stage: game.gameStatus,
    effects: ui.ctrEffect, owner: owner, sourceNode: owner.node, sourceGeneration: owner.node._combatGeneration,
    attacker: { cfg: owner.cfg, spIdx: owner.spIdx, navigationTeam: side === "enemy" ? "enemy" : "friendly" }
  };
  function current() { return attackCurrent(scope); }
  if (!current()) return;
  if (rules.delivery === "melee") owner.time.Attack = 0;
  var targetingRules = side === "enemy" && require("EnemyTargeting");
  scope.targetingRules = targetingRules;
  scope.targeting = targetingRules && targetingRules.settings(owner.cfg);
  var selected = side === "enemy" ? scope.targeting ? owner.getFind() : owner.getUpdateTarget() : null;
  var target = side === "ally" ? owner.releaseAttackTarget() : selected && selected.canAtt && (selected.actor || selected.building);
  scope.breach = selected && selected.breach && target;
  if (!current() || !targetLive(target) || !canTarget(scope, target)) return;
  scope.origin = Navigation.positionOf(scope.sourceNode, game);
  if (protectedByWall(scope, target)) return;
  var primary = capture(target, scope, selected && selected.polygon);
  scope.range = side === "ally" ? owner.attackRange : owner.cfg.AttackRange;
  scope.amount = owner.getAttack();
  if (!current() || !targetCurrent(primary)) return;
  owner.setLeft(primary.position.x < scope.origin.x);
  var sounds = require("BattleSounds");
  if (current() && sounds.attack) sounds.attack(owner, side);
  if (!current() || !targetCurrent(primary)) return;
  if (rules.delivery === "melee") {
    if (rules.pattern === "splash") blast(scope, primary, primary.position, current);
    else deal(scope, primary, scope.amount, primary.position, current);
    return;
  }
  var volley = rules.pattern === "volley" ? nearby(scope, scope.origin, scope.range, new Set([primary.node])).slice(0, rules.shotsPerVolley - 1) : [];
  [primary].concat(volley).forEach(function (entry) { launch(scope, entry); });
}
function move(start, end, length, budget) {
  if (length <= budget) return end;
  return { x: start.x + (end.x - start.x) * budget / length, y: start.y + (end.y - start.y) * budget / length };
}
function finish(shot, emitImpact) {
  shot._unitAttackFlight = shot._shot = null;
  shot.onDie(emitImpact);
}
function showContact(shot) {
  if (shot._projectileVisual) shot._projectileVisual.impact(true, true);
}
function pierce(shot, flight, budget, current) {
  var scope = flight.scope, start = flight.position, end = flight.end;
  var next = move(start, end, distance(start, end), budget);
  var contact = TowerCombat.sniperContacts(candidates(scope), start, next, scope.game.ndMain, flight.hits, function (actor) { return position(actor, scope); });
  contact.forEach(function (entry) { entry.buildInfo = entry.actor.buildInfo; });
  for (var index = 0; index < contact.length && current(); index++) {
    var entry = contact[index];
    var impact = { x: start.x + (next.x - start.x) * entry.fraction, y: start.y + (next.y - start.y) * entry.fraction };
    draw(shot, flight, impact);
    if (!deal(scope, entry, flight.amount, entry.position, current)) continue;
    if (!current()) return;
    flight.hits.set(entry.node, entry);
    if (--flight.remaining <= 0) return finish(shot, true);
    showContact(shot);
  }
  if (!current()) return;
  draw(shot, flight, next);
  if (next === end) finish(shot, false);
}
function seek(shot, flight, budget, current) {
  var scope = flight.scope, rules = scope.rules;
  while (current()) {
    var target = flight.target;
    if (!flight.end && !targetCurrent(target)) return void shot.freeNode();
    var start = flight.position, end = flight.end || (target.actor.getNavigationGateShapes ? target.position : position(target.actor, scope));
    var length = distance(start, end), next = move(start, end, length, budget);
    draw(shot, flight, next, end);
    if (next !== end || !current()) return;
    if (rules.pattern === "splash") blast(scope, target, end, current);
    else deal(scope, target, flight.amount, end, current);
    if (!current()) return;
    if (rules.pattern !== "chain" || --flight.remaining <= 0) return finish(shot, true);
    flight.amount *= 1 - rules.chainDamageLoss;
    flight.visited.add(target.node);
    var following = flight.amount > 0 && nearby(scope, end, rules.chainRange, flight.visited)[0];
    if (!following) return finish(shot, true);
    showContact(shot);
    flight.target = following;
    budget -= length;
    if (budget <= 0) return;
  }
}
function advance(shot, dt) {
  var flight = shot._unitAttackFlight, node = shot.node;
  if (flight.stepping) return;
  function current() {
    return shot._unitAttackFlight === flight && shot.node === node && shot.state === 0 && cc.isValid(node, true) &&
      node.activeInHierarchy !== false && battleCurrent(flight.scope);
  }
  if (!current()) return void shot.freeNode();
  if (!(dt > 0) || !isFinite(dt)) return;
  var budget = shot.speed * dt;
  if (!(budget > 0) || !isFinite(budget)) return void shot.freeNode();
  flight.stepping = true;
  try {
    if (shot._projectileVisual) shot._projectileVisual.step(dt);
    if (!current()) return;
    if (flight.scope.rules.pattern === "piercing") pierce(shot, flight, budget, current);
    else seek(shot, flight, budget, current);
  } finally { flight.stepping = false; }
}

exports.releaseEnemy = function () { release(this, "enemy"); };
exports.releaseAlly = function () { release(this, "ally"); };
exports.advance = advance;
