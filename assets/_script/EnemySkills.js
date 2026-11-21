"use strict";

var definitions = [
  { id: "heal", label: "Heal nearby allies", help: "Restores a percentage of maximum HP to the nearest wounded allies.",
    defaults: { interval: 1 / .3, percent: 50, radius: 300, maxTargets: 10 } },
  { id: "haste", label: "Attack speed boost", help: "Temporarily increases the attack speed of nearby allies.",
    defaults: { interval: 5, percent: 120, radius: 200, maxTargets: 15, duration: 3 } },
  { id: "damage", label: "Damage boost", help: "Temporarily increases the attack damage of nearby allies.",
    defaults: { interval: 5, percent: 25, radius: 200, maxTargets: 15, duration: 3 } },
  { id: "move", label: "Move speed boost", help: "Temporarily increases the movement speed of nearby allies.",
    defaults: { interval: 5, percent: 25, radius: 200, maxTargets: 15, duration: 3 } },
  { id: "weaken", label: "Weaken opposing attacks", help: "Temporarily reduces the damage dealt by nearby opposing heroes, troops, and attacking buildings.",
    defaults: { interval: 5, percent: 50, radius: 300, maxTargets: 10, duration: 5 } }
];

function fields(definition) {
  var labels = { heal: "HP restored (%)", haste: "Attack speed bonus (%)", damage: "Attack damage bonus (%)",
    move: "Movement speed bonus (%)", weaken: "Damage reduction (%)" };
  var fields = [
    { key: "interval", label: "Cast interval (seconds)", min: 0 },
    { key: "percent", label: labels[definition.id], min: 0, max: definition.id === "heal" || definition.id === "weaken" ? 100 : undefined },
    { key: "radius", label: "Radius", min: 0 },
    { key: "maxTargets", label: "Maximum targets", min: 1, integer: true }
  ];
  if (definition.id !== "heal") fields.push({ key: "duration", label: "Duration (seconds)", min: 0 });
  return fields;
}

function object(value) { return !!value && typeof value === "object" && !Array.isArray(value); }

function skillIssue(definition, setting) {
  if (!object(setting)) return "Choose a valid setting for " + definition.label + ".";
  for (var field of fields(definition)) {
    var value = setting[field.key];
    if (!Number.isFinite(value) || value <= 0 || field.max !== undefined && value > field.max || field.integer && !Number.isSafeInteger(value)) {
      return definition.label + " requires a valid positive value for " + field.label.toLowerCase() +
        (field.max === undefined ? "." : " up to " + field.max + ".");
    }
  }
  return null;
}

function issue(settings) {
  if (settings === undefined) return null;
  if (!object(settings)) return "Enemy skills must be a table.";
  for (var definition of definitions) {
    var setting = settings[definition.id];
    if (setting === undefined || setting === false) continue;
    var error = skillIssue(definition, setting);
    if (error) return error;
  }
  return null;
}

function innate(unit) {
  if (unit.AttackType !== 3 || unit.UnitAttack && require("./UnitAttackRules").active(unit)) return null;
  var behavior = unit.BehaviorTemplate || unit.ID;
  if (behavior === 90006) return "haste";
  if (behavior === 90009) return "heal";
  return null;
}

function originalEnabled(unit) {
  var id = innate(unit);
  if (!id || !unit.EnemySkills) return true;
  var setting = unit.EnemySkills[id];
  return setting !== false && (setting === undefined || !!skillIssue(definitions.find(function (item) { return item.id === id; }), setting));
}

function begin(settings) {
  return definitions.filter(function (definition) {
    var setting = settings[definition.id];
    return setting && !skillIssue(definition, setting);
  }).map(function (definition) {
    return { id: definition.id, setting: settings[definition.id], elapsed: 0 };
  });
}

function live(actor) {
  return cc.isValid(actor, true) && !actor._isPooled && cc.isValid(actor.node, true) && actor.node.activeInHierarchy !== false &&
    (!actor.isDead || !actor.isDead()) && !(actor.hp <= 0) && (!actor.getIsWork || actor.getIsWork());
}

function release(owner, game, cast, current) {
  var data = game.gameData, id = cast.id, setting = cast.setting;
  var targets = data.getEnemyList(), buildings = [];
  if (id === "weaken") {
    buildings = data.getAttackableBuildList ? data.getAttackableBuildList() : data.getBulidList();
    targets = [game.ctrPlay].concat(data.getSoldierList(), buildings);
  }
  var navigation = require("./KinghtFallNavigation");
  var origin = navigation.positionOf(owner.node, game), candidates = [];
  for (var actor of targets) {
    if (actor === owner || !live(actor)) continue;
    if (id === "heal" ? !actor.addHpPro || !(actor.hp < actor.hpMax) : !actor.addBuff) continue;
    var node = actor.node;
    var distance;
    if (buildings.includes(actor)) {
      distance = Infinity;
      for (var part of navigation.attackPartsOf(actor)) distance = Math.min(distance, navigation.polygonDistance(owner, part.points, game));
    } else distance = cc.Vec2.distance(origin, navigation.positionOf(node, game));
    if (distance <= setting.radius) candidates.push({ actor: actor, node: node, generation: node._combatGeneration, distance: distance });
  }
  candidates.sort(function (a, b) { return a.distance - b.distance; });
  var types = require("./KinghtFallInterface").KinghtFallEnemyBuffType;
  var amount = setting.percent / 100, applied = 0;
  for (var target of candidates) {
    if (!current()) return;
    if (applied >= setting.maxTargets) break;
    var recipient = target.actor;
    if (!live(recipient) || recipient.node !== target.node || target.node._combatGeneration !== target.generation) continue;
    if (id === "heal") {
      if (recipient.hp >= recipient.hpMax) continue;
      recipient.addHpPro(amount);
    } else if (id === "haste") recipient.addBuff(types.AttackSpeed, { addSpeed: amount, time: setting.duration }, id);
    else if (id === "damage") recipient.addBuff(types.DamageAdd, { addNum: amount, time: setting.duration }, id);
    else if (id === "move") recipient.addBuff(types.MoveSpeedAdd, { addSpeed: amount, time: setting.duration }, id);
    else recipient.addBuff(types.DamageCut, { subNum: amount, time: setting.duration }, id);
    applied++;
  }
}

function update(owner, game, casts, dt, current) {
  for (var cast of casts) {
    cast.elapsed += dt;
    if (cast.elapsed < cast.setting.interval) continue;
    cast.elapsed %= cast.setting.interval;
    release(owner, game, cast, current);
    if (!current()) return false;
  }
  return true;
}

exports.definitions = definitions;
exports.fields = fields;
exports.issue = issue;
exports.innate = innate;
exports.originalEnabled = originalEnabled;
exports.begin = begin;
exports.update = update;
