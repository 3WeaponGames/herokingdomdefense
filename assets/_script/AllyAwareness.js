"use strict";
// Event-driven friendly assistance. No scene-wide searches run on idle frames.
var DEFAULT_SIGHT = 240;
function valid(value) { return !!value && (typeof cc === "undefined" || !cc.isValid || cc.isValid(value, true)); }
function alive(actor) { return valid(actor) && valid(actor.node) && actor.node.activeInHierarchy !== false && !actor._isPooled && !(typeof actor.hp === "number" && actor.hp <= 0) && (!actor.isDead || !actor.isDead()); }
function generation(actor) { return actor && actor.node && actor.node._combatGeneration; }
function soldiers(game) { return game.gameData.getSoldierList ? game.gameData.getSoldierList() : game.gameData.soldiers || []; }
function enemies(game) { return game.gameData.getEnemyList ? game.gameData.getEnemyList() : game.gameData.enemyList || game.gameData.enemies || []; }
function enemy(game, actor, expectedGeneration, list) { return !!game && !!game.gameData && alive(actor) && (expectedGeneration === undefined || generation(actor) === expectedGeneration) && (list || enemies(game)).indexOf(actor) >= 0; }
function sightFromConfig(cfg) { var value = cfg && cfg.SightRange; return typeof value === "number" && isFinite(value) && value >= 0 ? value : DEFAULT_SIGHT; }
function point(actor, game) { var node = actor.node; return game.ndMain && node.convertToWorldSpaceAR ? game.ndMain.convertToNodeSpaceAR(node.convertToWorldSpaceAR({ x: 0, y: 0 })) : node.getPosition(); }
function currentGame(game) {
  var ui = require("KinghtFallUIGame").default.instance;
  return valid(game) && game.gameData && ui && ui.ctrGame === game && !ui.isclose && !ui.isPauset && (!ui.node || ui.node.activeInHierarchy !== false) && game.gameStatus === require("KinghtFallModle").KinghtFallGameStage.Fight;
}
function capture(victim, attacker, game) {
  if (!currentGame(game) || !alive(victim) || !enemy(game, attacker) || victim !== game.ctrPlay && soldiers(game).indexOf(victim) < 0) return null;
  var p = point(victim, game);
  return { game: game, data: game.gameData, epoch: game._combatEpoch, hero: game.ctrPlay, heroGeneration: generation(game.ctrPlay), victim: victim, victimGeneration: generation(victim), attacker: attacker, attackerGeneration: generation(attacker), position: { x: p.x, y: p.y } };
}
function current(event, checkMembership) {
  var game = event.game;
  return currentGame(game) && game.gameData === event.data && game._combatEpoch === event.epoch && game.ctrPlay === event.hero && generation(event.hero) === event.heroGeneration && valid(event.victim) && valid(event.victim.node) && generation(event.victim) === event.victimGeneration && alive(event.attacker) && generation(event.attacker) === event.attackerGeneration && (checkMembership === false || (event.victim === game.ctrPlay || soldiers(game).indexOf(event.victim) >= 0) && enemies(game).indexOf(event.attacker) >= 0);
}
function frameBucket(event) {
  var frame = typeof cc !== "undefined" && cc.director && cc.director.getTotalFrames && cc.director.getTotalFrames();
  if (typeof frame !== "number" || !isFinite(frame)) return null;
  var game = event.game, cache = game._allyAwarenessNotifications;
  if (!cache || cache.frame !== frame || cache.epoch !== event.epoch) cache = game._allyAwarenessNotifications = { frame: frame, epoch: event.epoch, data: new WeakMap() };
  // Weak keys do not keep retired actors or game-data snapshots alive.
  var bucket = cache.data.get(event.data);
  if (!bucket) { bucket = { victims: new WeakMap(), helpers: null, guards: [], guardKeys: new WeakMap() }; cache.data.set(event.data, bucket); }
  var rawRoster = event.data.soldierList || event.data.soldiers;
  if (bucket.helpers && (bucket.length !== bucket.roster.length || rawRoster && rawRoster !== bucket.roster || !bucket.guards.every(function (record) { return alive(record.target) && generation(record.target) === record.generation; }))) {
    bucket.helpers = null; bucket.victims = new WeakMap(); bucket.guards = []; bucket.guardKeys = new WeakMap();
  }
  return bucket;
}
function duplicate(event, bucket) {
  if (!bucket) return false;
  var record = bucket.victims.get(event.victim);
  if (!record || record.generation !== event.victimGeneration) { record = { generation: event.victimGeneration, attackers: new WeakMap() }; bucket.victims.set(event.victim, record); }
  if (record.attackers.has(event.attacker) && record.attackers.get(event.attacker) === event.attackerGeneration) return true;
  record.attackers.set(event.attacker, event.attackerGeneration); return false;
}
function blockingTarget(ally) {
  if (alive(ally._orderTarget) && generation(ally._orderTarget) === ally._orderTargetGeneration) return ally._orderTarget;
  if (ally._retaliationTime > 0 && alive(ally._retaliationTarget) && generation(ally._retaliationTarget) === ally._retaliationGeneration) return ally._retaliationTarget;
  return alive(ally.tagEnemy) ? ally.tagEnemy : null;
}
function guardTarget(bucket, target) {
  if (!bucket || !target || bucket.guardKeys.has(target) && bucket.guardKeys.get(target) === generation(target)) return;
  bucket.guardKeys.set(target, generation(target)); bucket.guards.push({ target: target, generation: generation(target) });
}
function candidates(bucket, list) {
  if (bucket && bucket.helpers && bucket.roster === list && bucket.length === list.length) return bucket.helpers;
  var records = list.map(function (actor) { return { actor: actor, generation: generation(actor) }; });
  if (bucket) { bucket.roster = list; bucket.length = list.length; bucket.helpers = records; bucket.guards = []; bucket.guardKeys = new WeakMap(); }
  return records;
}
function notify(event, damage) {
  if (!event || !(damage > 0) || !current(event)) return 0;
  var bucket = frameBucket(event); if (duplicate(event, bucket)) return 0;
  var game = event.game, roster = candidates(bucket, soldiers(game)), remaining = [], count = 0;
  for (var i = 0; i < roster.length; i++) {
    if (!current(event, false)) break;
    var record = roster[i], ally = record.actor;
    if (!alive(ally) || generation(ally) !== record.generation || !ally.canAssist) continue;
    if (!ally.canAssist(game)) { var blocked = blockingTarget(ally); guardTarget(bucket, blocked); if (!blocked) remaining.push(record); continue; }
    if (ally === event.victim) { remaining.push(record); continue; }
    var p = point(ally, game), range = sightFromConfig(ally.cfg), dx = p.x - event.position.x, dy = p.y - event.position.y;
    if (dx * dx + dy * dy > range * range) { remaining.push(record); continue; }
    ally.assistAttacker(event.attacker, game); guardTarget(bucket, blockingTarget(ally)); count++;
  }
  if (bucket) bucket.helpers = remaining;
  return count;
}
exports.defaultSightRange = DEFAULT_SIGHT;
exports.sightFromConfig = sightFromConfig;
exports.alive = alive;
exports.enemy = enemy;
exports.capture = capture;
exports.notify = notify;
exports.invalidate = function (game) { if (game) delete game._allyAwarenessNotifications; };
