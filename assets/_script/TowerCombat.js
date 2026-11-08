"use strict";

// Per-level tower behavior. Missing settings retain the original arrow tower.
function number(value, fallback, minimum) {
  return typeof value === "number" && isFinite(value) && value >= minimum ? value : fallback;
}
function settings(cfg) {
  var raw = cfg && cfg.Tower;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  var type = ["arrow", "cannon", "sniper"].indexOf(raw.attackType) >= 0 ? raw.attackType : "arrow";
  var defaultTarget = type === "sniper" ? "highestHp" : "nearest";
  return {
    attackType: type,
    targeting: ["nearest", "highestHp", "lowestHp", "farthest"].indexOf(raw.targeting) >= 0 ? raw.targeting : defaultTarget,
    projectileSpeed: number(raw.projectileSpeed, type === "cannon" ? 300 : type === "sniper" ? 1000 : null, Number.MIN_VALUE),
    splashRadius: type === "cannon" ? number(raw.splashRadius, 90, 0) : 0,
    splashFalloff: Math.min(1, number(raw.splashFalloff, 1, 0)),
    projectileLook: typeof raw.projectileLook === "string" ? raw.projectileLook : ""
  };
}
function valid(value) {
  return value && (typeof cc === "undefined" || cc.isValid(value, true));
}
function live(actor) {
  return valid(actor) && valid(actor.node) && actor.node.activeInHierarchy !== false &&
    (!actor.isDead || !actor.isDead()) && !(typeof actor.hp === "number" && actor.hp <= 0);
}
function point(node, parent) {
  if (parent && node.parent !== parent && parent.convertToNodeSpaceAR && node.convertToWorldSpaceAR) {
    // Creator 2.4 distinguishes Vec2 instances from Vec3 inputs. A plain
    // {x,y} takes its Vec3 branch and propagates an undefined z into NaN.
    var origin = typeof cc !== "undefined" && cc.v2 ? cc.v2(0, 0) : { x: 0, y: 0, z: 0 };
    return parent.convertToNodeSpaceAR(node.convertToWorldSpaceAR(origin));
  }
  return node.getPosition();
}
function choose(enemies, origin, range, behavior, parent) {
  if (!(range > 0)) return null;
  var mode = behavior && behavior.targeting || "nearest", best = null, bestDistance = Infinity, bestHealth = 0;
  var limit = range * range;
  for (var i = 0; i < enemies.length; i++) {
    var actor = enemies[i];
    if (!live(actor)) continue;
    var position = point(actor.node, parent), dx = position.x - origin.x, dy = position.y - origin.y;
    var distance = dx * dx + dy * dy;
    // Match the original strict range boundary and stable nearest tie-break.
    if (!isFinite(distance) || distance >= limit) continue;
    var hp = number(actor.hp, number(actor.hpMax, 0, 0), 0);
    var better = !best || mode === "nearest" && distance < bestDistance || mode === "farthest" && distance > bestDistance ||
      mode === "highestHp" && (hp > bestHealth || hp === bestHealth && distance < bestDistance) ||
      mode === "lowestHp" && (hp < bestHealth || hp === bestHealth && distance < bestDistance);
    if (better) { best = actor; bestDistance = distance; bestHealth = hp; }
  }
  return best;
}
function damage(game, target, center, amount, behavior, onHit) {
  if (!(amount > 0) || !isFinite(amount)) return;
  var epoch = game._combatEpoch, data = game.gameData;
  var radius = behavior && behavior.attackType === "cannon" ? behavior.splashRadius : 0;
  var entries = [], seen = new Set();
  var actors = radius > 0 ? game.gameData.getEnemyList().slice() : [target];
  for (var i = 0; i < actors.length; i++) {
    var actor = actors[i];
    if (!live(actor) || seen.has(actor)) continue;
    seen.add(actor);
    var position = point(actor.node, game.ndUI), dx = position.x - center.x, dy = position.y - center.y;
    var distance = Math.sqrt(dx * dx + dy * dy);
    if (radius > 0 && distance > radius) continue;
    var multiplier = radius > 0 ? 1 - (1 - behavior.splashFalloff) * distance / radius : 1;
    entries.push({ actor: actor, node: actor.node, generation: actor.node._combatGeneration, position: position, amount: amount * multiplier });
  }
  // Snapshot identities before any death callback can mutate/reuse the roster.
  for (i = 0; i < entries.length; i++) {
    if (game._combatEpoch !== epoch || game.gameData !== data) break;
    var entry = entries[i];
    if (!live(entry.actor) || entry.actor.node !== entry.node || entry.node._combatGeneration !== entry.generation || entry.amount <= 0) continue;
    if (onHit) onHit(entry.actor, entry.position, entry.amount);
    if (game._combatEpoch !== epoch || game.gameData !== data) break;
    entry.actor.onAttacked(entry.amount);
  }
}
exports.settings = settings;
exports.live = live;
exports.point = point;
exports.choose = choose;
exports.damage = damage;
