"use strict";

// Per-level tower behavior. Missing settings retain the original arrow tower.
function number(value, fallback, minimum) {
  return typeof value === "number" && isFinite(value) && value >= minimum ? value : fallback;
}
function validCount(value) {
  return Number.isSafeInteger(value) && value >= 1;
}
function settings(cfg) {
  var raw = cfg && cfg.Tower;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  var type = ["arrow", "cannon", "sniper"].indexOf(raw.attackType) >= 0 ? raw.attackType : "arrow";
  var defaultTarget = type === "sniper" ? "highestHp" : "nearest";
  var behavior = {
    attackType: type,
    targeting: ["nearest", "highestHp", "lowestHp", "farthest"].indexOf(raw.targeting) >= 0 ? raw.targeting : defaultTarget,
    projectileSpeed: number(raw.projectileSpeed, type === "cannon" ? 300 : type === "sniper" ? 1000 : null, Number.MIN_VALUE),
    splashRadius: type === "cannon" ? number(raw.splashRadius, 90, 0) : 0,
    splashFalloff: Math.min(1, number(raw.splashFalloff, 1, 0)),
    projectileLook: typeof raw.projectileLook === "string" ? raw.projectileLook : ""
  };
  if (type === "arrow" && validCount(raw.shotsPerVolley)) behavior.shotsPerVolley = raw.shotsPerVolley;
  // Only authored limits opt existing sniper configurations into straight flight.
  if (type === "sniper" && validCount(raw.pierceTargets)) behavior.pierceTargets = raw.pierceTargets;
  return behavior;
}
function valid(value) {
  return value && (typeof cc === "undefined" || cc.isValid(value, true));
}
function live(actor) {
  return valid(actor) && !actor._isPooled && valid(actor.node) && actor.node.activeInHierarchy !== false &&
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
function chooseTargets(enemies, origin, range, behavior, parent, count) {
  if (!(range > 0)) return [];
  var mode = behavior && behavior.targeting || "nearest", best = null, bestRank = Infinity, bestDistance = Infinity;
  var multiple = count > 1, ranked = [], seen = multiple ? new Set() : null;
  var limit = range * range;
  for (var i = 0; i < enemies.length; i++) {
    var actor = enemies[i];
    if (!live(actor) || seen && seen.has(actor.node)) continue;
    var position = point(actor.node, parent), dx = position.x - origin.x, dy = position.y - origin.y;
    var distance = dx * dx + dy * dy;
    // Match the original strict range boundary and stable nearest tie-break.
    if (!isFinite(distance) || distance >= limit) continue;
    var hp = number(actor.hp, number(actor.hpMax, 0, 0), 0);
    var rank = mode === "highestHp" ? -hp : mode === "lowestHp" ? hp : mode === "farthest" ? -distance : distance;
    if (multiple) {
      seen.add(actor.node);
      ranked.push({ actor: actor, rank: rank, distance: distance, order: i });
    } else if (rank < bestRank || rank === bestRank && distance < bestDistance) {
      best = actor; bestRank = rank; bestDistance = distance;
    }
  }
  if (!multiple) return best ? [best] : [];
  ranked.sort(function (a, b) { return a.rank - b.rank || a.distance - b.distance || a.order - b.order; });
  return ranked.slice(0, count).map(function (entry) { return entry.actor; });
}
function choose(enemies, origin, range, behavior, parent) {
  return chooseTargets(enemies, origin, range, behavior, parent, 1)[0] || null;
}
function capture(actor, position) {
  return { actor: actor, node: actor.node, generation: actor.node._combatGeneration, position: position };
}
function targetCurrent(entry) {
  return live(entry.actor) && entry.actor.node === entry.node && entry.node._combatGeneration === entry.generation;
}
function convert(position, from, to) {
  if (from === to) return position;
  var local = cc.v2(position.x, position.y);
  var world = from ? from.convertToWorldSpaceAR(local) : local;
  return to ? to.convertToNodeSpaceAR(world) : world;
}
function sniperEnd(tower, target, origin, parent) {
  var space = tower.node.parent, center = tower.node.getPosition();
  var start = convert(origin, parent, space), aim = convert(point(target, parent), parent, space);
  return convert(lineEnd(center, tower.attRange, start, aim), space, parent);
}
function lineEnd(center, range, start, aim) {
  var direction = require("./HeroSkillProjectile").unit({ x: aim.x - start.x, y: aim.y - start.y });
  var x = start.x - center.x, y = start.y - center.y;
  var along = x * direction.x + y * direction.y, across = x * direction.y - y * direction.x;
  // Intersect the firing line with the same range circle used to select a target.
  var inside = range * range - across * across;
  var travel = inside >= 0 ? Math.max(0, Math.sqrt(inside) - along) : 0;
  return cc.v2(start.x + direction.x * travel, start.y + direction.y * travel);
}
function sniperContacts(enemies, start, end, parent, hits, positionOf) {
  var projectile = require("./HeroSkillProjectile"), contacts = [], seen = new Set();
  for (var i = 0; i < enemies.length; i++) {
    var actor = enemies[i];
    if (!live(actor) || seen.has(actor.node)) continue;
    seen.add(actor.node);
    var previous = hits.get(actor.node);
    if (previous && previous.generation === actor.node._combatGeneration) continue;
    var position = positionOf ? positionOf(actor) : point(actor.node, parent);
    var fraction = projectile.segmentEntry(position, start, end, projectile.arrowHitRadius);
    if (fraction === null) continue;
    var entry = capture(actor, position);
    entry.fraction = fraction;
    entry.order = i;
    contacts.push(entry);
  }
  return contacts.sort(function (a, b) { return a.fraction - b.fraction || a.order - b.order; });
}
function splashMultiplier(distance, radius, edge) {
  if (radius <= 0) return 1;
  return distance > radius ? 0 : 1 - (1 - edge) * distance / radius;
}
function hit(entry, amount, source, onHit, current) {
  if (!(amount > 0) || !isFinite(amount) || !current() || !targetCurrent(entry)) return false;
  if (onHit) onHit(entry.actor, entry.position, amount);
  // Presentation can retire the shot or recycle a victim before damage commits.
  if (!current() || !targetCurrent(entry)) return false;
  entry.actor.onAttacked(amount, source);
  return true;
}
function damage(game, target, center, amount, behavior, onHit, source) {
  if (!(amount > 0) || !isFinite(amount)) return;
  var epoch = game._combatEpoch, data = game.gameData;
  function current() { return game._combatEpoch === epoch && game.gameData === data; }
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
    var multiplier = splashMultiplier(distance, radius, behavior && behavior.splashFalloff);
    var entry = capture(actor, position);
    entry.amount = amount * multiplier;
    entries.push(entry);
  }
  // Snapshot identities before any death callback can mutate/reuse the roster.
  for (i = 0; i < entries.length; i++) {
    if (!current()) break;
    hit(entries[i], entries[i].amount, source, onHit, current);
  }
}
exports.validCount = validCount;
exports.settings = settings;
exports.live = live;
exports.point = point;
exports.convert = convert;
exports.choose = choose;
exports.chooseTargets = chooseTargets;
exports.capture = capture;
exports.targetCurrent = targetCurrent;
exports.sniperEnd = sniperEnd;
exports.lineEnd = lineEnd;
exports.sniperContacts = sniperContacts;
exports.splashMultiplier = splashMultiplier;
exports.hit = hit;
exports.damage = damage;
