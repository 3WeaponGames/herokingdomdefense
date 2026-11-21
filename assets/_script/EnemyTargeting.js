"use strict";

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
function find(unit, game, rule) {
  var navigation = require("KinghtFallNavigation"), data = game.gameData;
  var start = navigation.positionOf(unit.node, game);
  var attackRange = unit.cfg.AttackRange || 0, awareness = attackRange + (unit.cfg.SearchRange || 0);
  var world = unit.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
  function actorTarget(actor) {
    if (!live(actor) || !unit.canPursueTarget(actor.node, game)) return null;
    var distance = length(start, navigation.positionOf(actor.node, game));
    return distance <= awareness ? { tag: actor.node, actor: actor, distance: distance, canAtt: distance <= attackRange } : null;
  }
  function buildingTarget(building, range, hitRange, breach) {
    if (!live(building)) return null;
    // A breach happens at the blocking face, which can be a wing or the edge
    // of a wide gate. A short melee attack cannot reach the doorway's center.
    var parts = breach && building.getWposPhyCol2 ? building.getWposPhyCol2() : navigation.attackPartsOf(building);
    var nearest = null;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!unit.canPursueTarget(part.tagNode, game)) continue;
      if (isFinite(range) && !cc.Intersection.polygonCircle(part.points, { position: world, radius: range })) continue;
      var distance = navigation.polygonDistance(unit, part.points, game);
      if (!nearest || distance < nearest.distance) nearest = { tag: part.tagNode, polygon: part.points, building: building,
        distance: distance, canAtt: cc.Intersection.polygonCircle(part.points, { position: world, radius: hitRange }), breach: !!breach };
    }
    return nearest;
  }
  var target;
  if (rule.mode === "priority") {
    var bestRank = Infinity;
    function consider(actor, building) {
      if (!actor) return;
      var rank = rule.order.indexOf(kind(game, actor));
      if (rank < 0 || rank > bestRank) return;
      var candidate = building ? buildingTarget(actor, awareness, attackRange) : actorTarget(actor);
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

  target = rule.mode === "castle" ? buildingTarget(data.baseBuild, Infinity, attackRange) : actorTarget(game.ctrPlay);
  if (!target || !unit.cfg.BuildingCross) { unit._objectiveBreach = null; return target; }
  var contact = navigation.get(game).radius(unit) + 1;
  if (target.building && target.distance <= contact) target.canAtt = true;
  var goal = navigation.attackPositionOf(target, unit, game), wall = null, record = unit._objectiveBreach;
  if (record && record.cfg === unit.cfg && record.goal === target.tag && record.generation === target.tag._combatGeneration &&
      (!target.actor || length(record.position, goal) <= 20) && live(record.wall)) wall = record.wall;
  if (!wall && target.canAtt) {
    var obstacle = navigation.obstructionBetween(unit, game, goal, target.building);
    if (obstacle) {
      target.canAtt = false;
      if (live(obstacle) && kind(game, obstacle) === "wall") wall = obstacle;
    }
  }
  if (wall) {
    // The center of a large unit can stop outside its melee radius at contact.
    var selectedWall = buildingTarget(wall, Infinity, Math.max(attackRange, contact), true);
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
