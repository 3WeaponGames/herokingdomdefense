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
    defaults: { interval: 5, percent: 50, radius: 300, maxTargets: 10, duration: 5 } },
  { id: "attackSlow", label: "Attack speed debuff", opponents: true, help: "Reduces the attack rate of nearby opposing heroes and troops.",
    defaults: { interval: 5, percent: 30, radius: 200, maxTargets: 3, duration: 3 } },
  { id: "moveSlow", label: "Move speed debuff", opponents: true, help: "Slows the movement of nearby opposing heroes and troops.",
    defaults: { interval: 5, percent: 35, radius: 200, maxTargets: 3, duration: 3 } },
  { id: "polymorph", label: "Transform opponents", opponents: true, help: "Temporarily changes opposing heroes and troops into a chosen form that can move but cannot attack.",
    defaults: { interval: 8, radius: 200, maxTargets: 1, duration: 3, unitId: 91014 } }
];

function fields(definition) {
  var labels = { heal: "HP restored (%)", haste: "Attack speed bonus (%)", damage: "Attack damage bonus (%)",
    move: "Movement speed bonus (%)", weaken: "Damage reduction (%)", attackSlow: "Attack speed reduction (%)",
    moveSlow: "Movement speed reduction (%)" };
  var fields = [
    { key: "interval", label: "Cast interval (seconds)", min: 0 },
    { key: "radius", label: "Radius", min: 0 },
    { key: "maxTargets", label: "Maximum targets", min: 1, integer: true }
  ];
  if (labels[definition.id]) fields.splice(1, 0, { key: "percent", label: labels[definition.id], min: 0,
    max: definition.id === "heal" || definition.id === "weaken" || definition.opponents ? 100 : undefined });
  if (definition.id !== "heal") fields.push({ key: "duration", label: "Duration (seconds)", min: 0 });
  return fields;
}

function object(value) { return !!value && typeof value === "object" && !Array.isArray(value); }

function form(units, settings, id) {
  var unit = Number.isSafeInteger(id) && id > 0 && units && units[id];
  return require("./EnemyTransform").supported(unit, settings) ? unit : null;
}

function skillIssue(definition, setting, units, settings) {
  if (!object(setting)) return "Choose a valid setting for " + definition.label + ".";
  if (definition.id === "polymorph" && (!Number.isSafeInteger(setting.unitId) || setting.unitId <= 0 ||
      units && !form(units, settings, setting.unitId))) return "Choose an available unit model for Transform opponents.";
  for (var field of fields(definition)) {
    var value = setting[field.key];
    if (!Number.isFinite(value) || value <= 0 || field.max !== undefined && value > field.max || field.integer && !Number.isSafeInteger(value)) {
      return definition.label + " requires a valid positive value for " + field.label.toLowerCase() +
        (field.max === undefined ? "." : " up to " + field.max + ".");
    }
  }
  return null;
}

function issue(skills, units, settings) {
  if (skills === undefined) return null;
  if (!object(skills)) return "Enemy skills must be a table.";
  for (var definition of definitions) {
    var setting = skills[definition.id];
    if (setting === undefined || setting === false) continue;
    var error = skillIssue(definition, setting, units, settings);
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
    return { id: definition.id, opponents: definition.opponents, setting: settings[definition.id], elapsed: 0 };
  });
}

function live(actor) {
  return cc.isValid(actor, true) && !actor._isPooled && cc.isValid(actor.node, true) && actor.node.activeInHierarchy !== false &&
    (!actor.isDead || !actor.isDead()) && !(actor.hp <= 0) && (!actor.getIsWork || actor.getIsWork());
}

function release(owner, game, cast, current) {
  var data = game.gameData, id = cast.id, setting = cast.setting;
  var targets, buildings = [];
  if (id === "weaken") {
    buildings = data.getAttackableBuildList ? data.getAttackableBuildList() : data.getBulidList();
  }
  targets = cast.opponents || id === "weaken" ? [game.ctrPlay].concat(data.getSoldierList(), buildings) : data.getEnemyList();
  var navigation = require("./KinghtFallNavigation");
  var origin = navigation.positionOf(owner.node, game), candidates = [];
  for (var actor of targets) {
    if (actor === owner || !live(actor)) continue;
    if (id === "polymorph" && actor._opposingForm) continue;
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
    else if (id === "attackSlow") recipient.addBuff(types.AttackSlow, { subNum: amount, time: setting.duration }, id);
    else if (id === "moveSlow") recipient.addBuff(types.MoveSlow, { subNum: amount, time: setting.duration }, id);
    else if (id === "polymorph") {
      if (recipient.addBuff(types.Polymorph, { unitId: setting.unitId, time: setting.duration }, id) === false) continue;
    }
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
exports.form = form;
exports.innate = innate;
exports.originalEnabled = originalEnabled;
exports.begin = begin;
exports.update = update;
