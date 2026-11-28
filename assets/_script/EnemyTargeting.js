"use strict";

var FlightTargeting = require("./FlightTargeting");
var footprintBounds = new WeakMap();
var wallCrowds = new WeakMap();
var gateCapacity = 4;

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
  { value: "buildings-first", label: "Buildings first" },
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
  if (actor.getNavigationGateShapes) return "wall";
  var types = require("KinghtFallEnum").KinghtFallEnumBuildEnum;
  var id = actor.buildInfo && actor.buildInfo.BuildID || actor.buildCfg && actor.buildCfg.enumValue;
  if (id !== undefined && types) {
    if (id === types.CastleCenter) return "castle";
    if (id === types.ArrowTower) return "tower";
    if (id === types.Wall) return "wall";
  }
  return actor.getIsWork ? "building" : "troops";
}
function allows(rule, game, actor, breach, unit) {
  if (FlightTargeting.isFlying(unit) && kind(game, actor) === "wall") return false;
  if (!rule) return true;
  if (breach) return actor === breach;
  if (rule.mode === "buildings-first") return true;
  var type = kind(game, actor);
  return rule.mode === "priority" ? rule.order.indexOf(type) >= 0 : rule.mode === type;
}
function live(actor) {
  return !!(actor && cc.isValid(actor, true) && cc.isValid(actor.node, true) && actor.node.activeInHierarchy !== false &&
    !actor._isPooled && !actor.isDestroyed && (!actor.isDead || !actor.isDead()) && (!actor.getIsWork || actor.getIsWork()));
}
function length(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function protectingWall(game, start, actor, unit) {
  if (FlightTargeting.isFlying(unit) || kind(game, actor) !== "tower") return null;
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

function removeAssignment(crowd, unit, assignment) {
  crowd.units.delete(unit);
  var occupants = assignment.occupants;
  if (assignment.gate) occupants.gates--;
  var count = occupants.parts.get(assignment.part);
  if (count === 1) occupants.parts.delete(assignment.part);
  else occupants.parts.set(assignment.part, count - 1);
}
function wallCrowd(game, navigation) {
  var crowd = wallCrowds.get(game);
  if (!crowd || crowd.data !== game.gameData || crowd.epoch !== game._combatEpoch) {
    crowd = { data: game.gameData, epoch: game._combatEpoch, units: new Map(), walls: new WeakMap() };
    wallCrowds.set(game, crowd);
  }
  if (!navigation._frameManaged || crowd.frame !== navigation._frameId) {
    crowd.frame = navigation._frameId;
    crowd.units.forEach(function (assignment, unit) {
      if (!live(unit) || unit.node._combatGeneration !== assignment.generation || unit.cfg !== assignment.cfg ||
          !live(assignment.wall)) removeAssignment(crowd, unit, assignment);
    });
  }
  return crowd;
}
function assignWall(unit, game, target) {
  var crowd = wallCrowds.get(game);
  if (!crowd || crowd.data !== game.gameData || crowd.epoch !== game._combatEpoch) return;
  var previous = crowd.units.get(unit), wall = target && target.wallPoint && target.building;
  var part = wall && (target.collider || target.tag);
  if (previous && previous.wall === wall && previous.part === part && previous.gate === target.gate &&
      previous.generation === unit.node._combatGeneration && previous.cfg === unit.cfg) return;
  if (previous) removeAssignment(crowd, unit, previous);
  if (!wall) return;
  var occupants = crowd.walls.get(wall);
  if (!occupants) { occupants = { gates: 0, parts: new Map() }; crowd.walls.set(wall, occupants); }
  if (target.gate) occupants.gates++;
  occupants.parts.set(part, (occupants.parts.get(part) || 0) + 1);
  crowd.units.set(unit, { wall: wall, part: part, gate: target.gate, occupants: occupants,
    generation: unit.node._combatGeneration, cfg: unit.cfg });
}
function wallTarget(unit, game, query, wall, parts, range, hitRange, breach, pursue, shared) {
  var Navigation = query.navigation, navigation = Navigation.get(game), terrain = navigation.mapGrid();
  var start = query.start || (query.start = Navigation.positionOf(unit.node, game));
  var crowd = wallCrowd(game, navigation), own = crowd.units.get(unit), occupants = crowd.walls.get(wall);
  if (own && own.wall !== wall) own = null;
  var room = !occupants || occupants.gates < gateCapacity || own && own.gate;
  var gateShapes = wall.getNavigationGateShapes(true), gate = null, wing = null, wingScore = Infinity;
  var contact = navigation.radius(unit) + 1, noticed = Infinity;
  var worldContact = length(query.circle.position, game.ndMain.convertToWorldSpaceAR(cc.v2(start.x + contact, start.y)));
  var sight = Math.max(range, worldContact);
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i], key = part.collider || part.tagNode;
    if (part.points.length < 3 || part.tagNode.activeInHierarchy === false ||
        pursue && !unit.canPursueTarget(part.tagNode, game, part.collider) ||
        query.attackOnly && own && own.part !== key) continue;
    var isGate = gateShapes.some(function (shape) { return shape.collider === part.collider; });
    var inSight = !isFinite(sight) || polygonTouches(part, query.circle, sight, shared && boundsFor(part));
    if (!inSight && !isGate) continue;
    var aim = Navigation.wallContact(start, part.points, game, terrain, shared);
    if (!aim) continue;
    var gap = length(start, aim.point), worldPoint = game.ndMain.convertToWorldSpaceAR(cc.v2(aim.point));
    var worldGap = length(query.circle.position, worldPoint);
    var inRange = aim.clear && (worldGap <= hitRange || gap <= contact);
    if (query.attackOnly && !inRange) continue;
    if (inSight || inRange) noticed = Math.min(noticed, gap);
    var target = { tag: part.tagNode, polygon: part.points, collider: part.collider, building: wall,
      distance: gap, canAtt: inRange, breach: !!breach, sharedFootprint: !!shared, gate: isGate, wallPoint: aim.point };
    if (isGate) {
      if (!gate || gap < gate.distance) gate = target;
    } else {
      var others = occupants && occupants.parts.get(key) || 0;
      if (own && own.part === key) others--;
      var score = gap + others * 36 + (aim.clear ? 0 : 120);
      if (score < wingScore) { wing = target; wingScore = score; }
    }
  }
  if (!isFinite(noticed)) return null;
  var selected = room && gate || wing || gate;
  // Gate preference chooses the approach without changing which structure
  // is closest for the unit's normal target-priority rules.
  if (selected) selected.distance = noticed;
  return selected;
}
function buildingTarget(unit, game, query, building, range, hitRange, breach, pursue) {
  if (!building || !building.getIsWork || !live(building) || !allows(null, game, building, null, unit)) return null;
  var Navigation = query.navigation;
  var parts = Navigation.attackPartsOf(building), nearest = null;
  var circle = query.circle;
  if (!parts.length) return null;
  if (!circle.position) circle.position = unit.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
  // Core buildings share immutable world footprints for this simulation frame.
  // Leave custom and standalone footprint providers on their exact checks.
  var cacheable = building._combatFootprints && building._combatFootprints.parts === parts;
  if (building.getNavigationGateShapes) return wallTarget(unit, game, query, building, parts, range, hitRange, breach, pursue, cacheable);
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (part.points.length < 3 || part.tagNode.activeInHierarchy === false ||
        pursue && !unit.canPursueTarget(part.tagNode, game)) continue;
    var bounds = cacheable && boundsFor(part);
    var inSight = !isFinite(range) || polygonTouches(part, circle, range, bounds);
    if (!inSight) continue;
    if (!query.start) query.start = Navigation.positionOf(unit.node, game);
    var distance = Navigation.polygonDistance(unit, part.points, game, circle.position, query.start);
    var canAtt = isFinite(range) && range === hitRange ? inSight : polygonTouches(part, circle, hitRange, bounds);
    if (!nearest || distance < nearest.distance) {
      nearest = { tag: part.tagNode, polygon: part.points, building: building,
        distance: distance, canAtt: canAtt, breach: !!breach, sharedFootprint: !!cacheable };
    }
  }
  return nearest;
}
function refreshBuilding(unit, game, target) {
  var range = unit.cfg.AttackRange || 0;
  var query = { navigation: require("KinghtFallNavigation"), circle: { position: null, radius: 0 }, start: null };
  var selected = buildingTarget(unit, game, query, target.building, range + (unit.cfg.SearchRange || 0), range, target.breach, true);
  if (selected && protectingWall(game, query.start, selected.building, unit)) return null;
  return selected;
}
function rememberedWall(unit, node, goal) {
  var record = unit._objectiveBreach;
  return record && record.cfg === unit.cfg && record.goal === node && record.generation === node._combatGeneration &&
    (!goal || length(record.position, goal) <= 20) && live(record.wall) ? record.wall : null;
}
function obstructionInSight(unit, game, query, goal, sight) {
  var start = query.start, distance = length(start, goal);
  if (distance > sight) {
    var fraction = sight / distance;
    goal = { x: start.x + (goal.x - start.x) * fraction, y: start.y + (goal.y - start.y) * fraction };
  }
  return query.navigation.obstructionBetween(unit, game, goal);
}
function heroBreachTarget(unit, game, query, target, sight, attackRange) {
  var Navigation = query.navigation, hero = game.ctrPlay;
  var goal = live(hero) ? Navigation.positionOf(hero.node, game) : null;
  var heroDistance = goal ? length(query.start, goal) : Infinity;
  function closerWall(wall) {
    if (!wall || kind(game, wall) !== "wall") return null;
    var selected = buildingTarget(unit, game, query, wall, sight, attackRange, true, true);
    return selected && selected.distance < heroDistance ? selected : null;
  }
  var obstruction = goal && obstructionInSight(unit, game, query, goal, sight);
  var wall = closerWall(obstruction);
  if (wall) return wall;
  if (target) {
    // A planned approach can reach a wall around a corner even when the
    // straight line to the hero first meets a different obstacle.
    var remembered = rememberedWall(unit, target.tag, goal);
    if (remembered && !obstruction && !target.canAtt) {
      var navigation = Navigation.get(game);
      var radius = unit._unitTestRadius || navigation.radius(unit);
      if (navigation.grid.segmentClear(query.start, goal, radius)) remembered = null;
    }
    if (obstruction || !target.canAtt) {
      wall = closerWall(remembered);
      if (wall) return wall;
    }
    if (obstruction) target.canAtt = false;
    target.breachRoute = true;
    return target;
  }
  // Keep moving along the authored route while the hero is out of reach.
  var route = unit.bornInfo, waypoint = route && route.pathList && route.pathList[route.nodeIndex];
  if (!waypoint) return null;
  var destination = Navigation.positionOf(waypoint, game);
  return closerWall(rememberedWall(unit, waypoint, destination)) ||
    closerWall(obstructionInSight(unit, game, query, destination, sight));
}
function find(unit, game, rule, attackOnly) {
  var Navigation = require("KinghtFallNavigation");
  var data = game.gameData, start = Navigation.positionOf(unit.node, game);
  var query = { navigation: Navigation, circle: { position: null, radius: 0 }, start: start, attackOnly: attackOnly };
  var attackRange = unit.cfg.AttackRange || 0, awareness = attackRange + (attackOnly ? 0 : unit.cfg.SearchRange || 0);
  function actorTarget(actor) {
    if (!live(actor) || !attackOnly && !unit.canPursueTarget(actor.node, game)) return null;
    var distance = length(start, Navigation.positionOf(actor.node, game));
    return distance <= awareness ? { tag: actor.node, actor: actor, distance: distance, canAtt: distance <= attackRange } : null;
  }
  var target, buildingsFirst = rule && rule.mode === "buildings-first";
  if (!rule || rule.mode === "priority" || buildingsFirst) {
    var bestRank = Infinity;
    function consider(actor, building) {
      if (!actor) return;
      var rank = rule && !buildingsFirst ? rule.order.indexOf(kind(game, actor)) : 0;
      if (rank < 0 || rank > bestRank) return;
      var candidate = building ? buildingTarget(unit, game, query, actor, awareness, attackRange, false, !attackOnly) : actorTarget(actor);
      if (candidate && building) {
        var wall = protectingWall(game, start, actor, unit);
        if (wall) candidate = buildingTarget(unit, game, query, wall, awareness, attackRange, true, !attackOnly);
      }
      if (candidate && (!target || rank < bestRank || candidate.distance < target.distance)) {
        target = candidate;
        bestRank = rank;
      }
    }
    function considerUnits() {
      consider(game.ctrPlay, false);
      data.getSoldierList().forEach(function (actor) { consider(actor, false); });
    }
    if (!buildingsFirst) considerUnits();
    var buildings = data.getAttackableBuildList ? data.getAttackableBuildList() : data.getBulidList();
    buildings.forEach(function (building) { consider(building, true); });
    if (buildingsFirst && !target) considerUnits();
    return target || null;
  }

  target = rule.mode === "castle" ? buildingTarget(unit, game, query, data.baseBuild, Infinity, attackRange, false, true) : actorTarget(game.ctrPlay);
  if (!unit.cfg.BuildingCross) { unit._objectiveBreach = null; return target; }
  if (rule.mode === "hero") return heroBreachTarget(unit, game, query, target, awareness, attackRange);
  if (!target) { unit._objectiveBreach = null; return null; }
  if (target.building && target.distance <= Navigation.get(game).radius(unit) + 1) target.canAtt = true;
  var wall = rememberedWall(unit, target.tag);
  if (!wall && target.canAtt) {
    var obstacle = Navigation.obstructionBetween(unit, game, Navigation.attackPositionOf(target, unit, game), target.building);
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
exports.assignWall = assignWall;
exports.refreshBuilding = refreshBuilding;
exports.protectingWall = protectingWall;
