"use strict";

var footprintBounds = new WeakMap();

var targets = [
  { value: "hero", label: "Hero" },
  { value: "troops", label: "Allied troops" },
  { value: "tower", label: "Towers" },
  { value: "castle", label: "Castle" },
  { value: "wall", label: "Walls and gates" },
  { value: "building", label: "Other buildings" }
];
var modes = [
  { value: "nearest", label: "Nearest target (default)" },
  { value: "priority", label: "Custom priority order" },
  { value: "castle", label: "Castle only" },
  { value: "hero", label: "Hero only" }
];
var targetIds = targets.map(function (entry) { return entry.value; });

function validOrder(order) {
  return Array.isArray(order) && order.length > 0 && order.length <= targets.length &&
    new Set(order).size === order.length && order.every(function (id) { return targetIds.indexOf(id) >= 0; });
}
function issue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !modes.some(function (entry) { return entry.value === value.mode; })) return "Choose an enemy targeting rule.";
  if ((value.mode === "priority" || value.order !== undefined) && !validOrder(value.order)) {
    return "Choose one or more different target groups in priority order.";
  }
  return null;
}
function settings(cfg) {
  var value = cfg && cfg.EnemyTargeting;
  return value && value.mode !== "nearest" && !issue(value) ? value : null;
}

function kind(game, actor) {
  if (actor === game.ctrPlay) return "hero";
  if (actor === game.gameData.baseBuild) return "castle";
  var types = require("KinghtFallEnum").KinghtFallEnumBuildEnum;
  var id = actor.buildInfo && actor.buildInfo.BuildID || actor.buildCfg && actor.buildCfg.enumValue;
  if (id !== undefined && types) {
    if (id === types.CastleCenter) return "castle";
    if (id === types.ArrowTower) return "tower";
    if (id === types.Wall) return "wall";
  }
  return actor.getIsWork ? "building" : "troops";
}
function allows(rule, game, actor, breach) {
  if (!rule) return true;
  if (breach) return actor === breach;
  var type = kind(game, actor);
  return rule.mode === "priority" ? rule.order.indexOf(type) >= 0 : rule.mode === type;
}
function live(actor) {
  return !!(actor && cc.isValid(actor, true) && cc.isValid(actor.node, true) && actor.node.activeInHierarchy !== false &&
    !actor._isPooled && !actor.isDestroyed && (!actor.isDead || !actor.isDead()) && (!actor.getIsWork || actor.getIsWork()));
}
function length(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function protectingWall(game, start, actor) {
  if (kind(game, actor) !== "tower") return null;
  var Navigation = require("KinghtFallNavigation");
  return Navigation.wallBetween(game, start, Navigation.positionOf(actor.node, game));
}

function boundsFor(part) {
  var bounds = footprintBounds.get(part);
  if (bounds) return bounds;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (var i = 0; i < part.points.length; i++) {
    var vertex = part.points[i];
    minX = Math.min(minX, vertex.x); maxX = Math.max(maxX, vertex.x);
    minY = Math.min(minY, vertex.y); maxY = Math.max(maxY, vertex.y);
  }
  bounds = { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  footprintBounds.set(part, bounds);
  return bounds;
}

function polygonTouches(part, circle, radius, bounds) {
  if (bounds) {
    var reach = Math.max(0, radius), point = circle.position;
    if (point.x < bounds.minX - reach || point.x > bounds.maxX + reach ||
        point.y < bounds.minY - reach || point.y > bounds.maxY + reach) return false;
  }
  circle.radius = radius;
  return cc.Intersection.polygonCircle(part.points, circle);
}

function buildingTarget(unit, game, query, building, range, hitRange, breach, pursue) {
  if (!building || !building.getIsWork || !live(building)) return null;
  var Navigation = query.navigation;
  var parts = Navigation.attackPartsOf(building), nearest = null;
  var circle = query.circle, wall = !!building.getNavigationGateShapes, contact;
  if (!parts.length) return null;
  if (!circle.position) circle.position = unit.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
  // Core buildings share immutable world footprints for this simulation frame.
  // Leave custom and standalone footprint providers on their exact checks.
  var cacheable = building._combatFootprints && building._combatFootprints.parts === parts;
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    var collider = wall && part.collider;
    if (part.points.length < 3 || part.tagNode.activeInHierarchy === false ||
        pursue && !unit.canPursueTarget(part.tagNode, game, collider)) continue;
    var bounds = cacheable && boundsFor(part);
    var inSight = !isFinite(range) || polygonTouches(part, circle, range, bounds);
    if (!inSight && !wall) continue;
    if (!query.start) query.start = Navigation.positionOf(unit.node, game);
    var distance = Navigation.polygonDistance(unit, part.points, game, circle.position, query.start);
    var canAtt = isFinite(range) && range === hitRange ? inSight : polygonTouches(part, circle, hitRange, bounds);
    if (!canAtt && wall) {
      // A large unit can make body contact before its center enters melee range.
      if (contact === undefined) contact = Navigation.get(game).radius(unit) + 1;
      canAtt = distance <= contact;
    }
    if ((inSight || canAtt) && (!nearest || distance < nearest.distance)) {
      nearest = { tag: part.tagNode, polygon: part.points, collider: collider, building: building,
        distance: distance, canAtt: canAtt, breach: !!breach, sharedFootprint: !!cacheable };
    }
  }
  return nearest;
}
function refreshBuilding(unit, game, target) {
  var range = unit.cfg.AttackRange || 0;
  var query = { navigation: require("KinghtFallNavigation"), circle: { position: null, radius: 0 }, start: null };
  var selected = buildingTarget(unit, game, query, target.building, range + (unit.cfg.SearchRange || 0), range, target.breach, true);
  if (selected && protectingWall(game, query.start, selected.building)) return null;
  return selected;
}
function find(unit, game, rule, attackOnly) {
  var Navigation = require("KinghtFallNavigation");
  var data = game.gameData, start = Navigation.positionOf(unit.node, game);
  var query = { navigation: Navigation, circle: { position: null, radius: 0 }, start: start };
  var attackRange = unit.cfg.AttackRange || 0, awareness = attackRange + (attackOnly ? 0 : unit.cfg.SearchRange || 0);
  function actorTarget(actor) {
    if (!live(actor) || !attackOnly && !unit.canPursueTarget(actor.node, game)) return null;
    var distance = length(start, Navigation.positionOf(actor.node, game));
    return distance <= awareness ? { tag: actor.node, actor: actor, distance: distance, canAtt: distance <= attackRange } : null;
  }
  var target;
  if (!rule || rule.mode === "priority") {
    var bestRank = Infinity;
    function consider(actor, building) {
      if (!actor) return;
      var rank = rule ? rule.order.indexOf(kind(game, actor)) : 0;
      if (rank < 0 || rank > bestRank) return;
      var candidate = building ? buildingTarget(unit, game, query, actor, awareness, attackRange, false, !attackOnly) : actorTarget(actor);
      if (candidate && building) {
        var wall = protectingWall(game, start, actor);
        if (wall) candidate = buildingTarget(unit, game, query, wall, awareness, attackRange, true, !attackOnly);
      }
      if (candidate && (!target || rank < bestRank || candidate.distance < target.distance)) {
        target = candidate;
        bestRank = rank;
      }
    }
    consider(game.ctrPlay, false);
    data.getSoldierList().forEach(function (actor) { consider(actor, false); });
    var buildings = data.getAttackableBuildList ? data.getAttackableBuildList() : data.getBulidList();
    buildings.forEach(function (building) { consider(building, true); });
    return target || null;
  }

  target = rule.mode === "castle" ? buildingTarget(unit, game, query, data.baseBuild, Infinity, attackRange, false, true) : actorTarget(game.ctrPlay);
  if (!target || !unit.cfg.BuildingCross) { unit._objectiveBreach = null; return target; }
  if (target.building && target.distance <= Navigation.get(game).radius(unit) + 1) target.canAtt = true;
  var goal, wall = null, record = unit._objectiveBreach;
  if (record && record.cfg === unit.cfg && record.goal === target.tag && record.generation === target.tag._combatGeneration) {
    if (target.actor) goal = Navigation.attackPositionOf(target, unit, game);
    if ((!target.actor || length(record.position, goal) <= 20) && live(record.wall)) wall = record.wall;
  }
  if (!wall && target.canAtt) {
    var obstacle = Navigation.obstructionBetween(unit, game, goal || Navigation.attackPositionOf(target, unit, game), target.building);
    if (obstacle) {
      target.canAtt = false;
      if (live(obstacle) && kind(game, obstacle) === "wall") wall = obstacle;
    }
  }
  if (wall) {
    var selectedWall = buildingTarget(unit, game, query, wall, Infinity, attackRange, true, true);
    if (selectedWall) return selectedWall;
  }
  target.breachRoute = true;
  return target;
}

exports.targets = targets;
exports.modes = modes;
exports.issue = issue;
exports.settings = settings;
exports.allows = allows;
exports.find = find;
exports.refreshBuilding = refreshBuilding;
exports.protectingWall = protectingWall;
