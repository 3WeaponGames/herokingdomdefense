"use strict";

var patterns = {
  melee: ["single", "splash"],
  ranged: ["single", "splash", "volley", "piercing", "chain"]
};
var fields = {
  attackDamage: { value: 5, min: 0 },
  attackRange: { value: 50, ranged: 250, min: 0 },
  splashRadius: { value: 90, min: 0 },
  splashFalloff: { value: .2, min: 0, max: 1 },
  shotsPerVolley: { value: 2, min: 1, integer: true },
  pierceTargets: { value: 2, min: 1, integer: true },
  chainHits: { value: 3, min: 1, integer: true },
  chainRange: { value: 160, min: 0 },
  chainDamageLoss: { value: .25, min: 0, max: 1 }
};
function damageEffect(label, percent, duration, buildings) {
  return {
    label: label,
    buildings: buildings,
    fields: {
      percent: {
        label: label + " damage per second (%)", value: percent, min: 0, max: 1, percent: true,
        help: "Percentage of the triggering hit's damage applied each second." +
          (buildings ? " Affects troops, the hero, and buildings." : " Affects troops and the hero.")
      },
      duration: { label: label + " duration (seconds)", value: duration, min: 0 }
    }
  };
}
var damageEffects = {
  poison: damageEffect("Poison", .1, 5, false),
  burn: damageEffect("Burn", .25, 2, true),
  bleed: damageEffect("Bleed", .15, 3, false)
};
var hitEffects = Object.assign({
  slow: {
    label: "Slow",
    fields: {
      percent: {
        label: "Movement slow (%)", value: .3, min: 0, max: 1, percent: true,
        help: "Reduces the movement speed of each unit damaged by this attack."
      },
      duration: { label: "Slow duration (seconds)", value: 3, min: 0 }
    }
  },
  lifeSteal: {
    label: "Life steal",
    fields: {
      percent: {
        label: "Life steal (%)", value: .2, min: 0, max: 1, percent: true,
        help: "Heals the attacker for this percentage of the HP removed from each target."
      }
    }
  }
}, damageEffects);

function object(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function allowed(delivery, pattern) {
  return (delivery === "melee" || delivery === "ranged") && patterns[delivery].indexOf(pattern) !== -1;
}
function active(cfg) {
  var raw = cfg && cfg.UnitAttack;
  return object(raw) && allowed(raw.delivery, raw.pattern) ? raw : null;
}
function attackType(cfg) {
  var raw = active(cfg);
  if (!raw) return cfg && cfg.AttackType;
  return raw.delivery === "ranged" ? 2 : 1;
}
function runtimeCfg(cfg) {
  var raw = active(cfg);
  if (!raw) return cfg;
  var next = Object.assign({}, cfg, { AttackType: raw.delivery === "ranged" ? 2 : 1 });
  // Support templates can omit all three stats used by the normal attack AI.
  if (next.AttackDamage === undefined) next.AttackDamage = resolveNumber(raw, "attackDamage");
  if (next.AttackRange === undefined) next.AttackRange = resolveNumber(raw, "attackRange");
  if (next.SearchRange === undefined) next.SearchRange = 80;
  return next;
}
function validNumber(value, rule) {
  return typeof value === "number" && isFinite(value) && value >= rule.min &&
    (rule.max === undefined || value <= rule.max) && (!rule.integer || Number.isSafeInteger(value));
}
function resolveNumber(raw, key) {
  var rule = fields[key];
  if (validNumber(raw[key], rule)) return raw[key];
  return raw.delivery === "ranged" && rule.ranged !== undefined ? rule.ranged : rule.value;
}
function settings(cfg) {
  var raw = active(cfg);
  if (!raw) return null;
  var result = { delivery: raw.delivery, pattern: raw.pattern };
  Object.keys(fields).forEach(function (key) {
    result[key] = resolveNumber(raw, key);
  });
  if (object(raw.onHit)) {
    result.onHit = {};
    Object.keys(hitEffects).forEach(function (id) {
      var effect = raw.onHit[id], rules = hitEffects[id].fields;
      if (object(effect) && Object.keys(rules).every(function (key) { return validNumber(effect[key], rules[key]); })) {
        result.onHit[id] = Object.assign({}, effect);
      }
    });
  }
  return result;
}
function issues(raw) {
  if (!object(raw)) return [{ field: null, message: "Attack settings must be an object." }];
  var result = [];
  if (["original", "melee", "ranged"].indexOf(raw.delivery) === -1) {
    result.push({ field: "delivery", message: "Choose Original, Melee, or Ranged." });
  } else if (raw.delivery !== "original" && !allowed(raw.delivery, raw.pattern)) {
    result.push({ field: "pattern", message: "Choose an attack pattern available for this delivery." });
  }
  Object.keys(fields).forEach(function (key) {
    var rule = fields[key];
    if (raw[key] === undefined || validNumber(raw[key], rule)) return;
    var message = rule.integer ? "Enter a positive whole number." : rule.max === 1 ?
      "Enter a percentage between 0 and 100." : "Enter a finite value of at least zero.";
    result.push({ field: key, message: message });
  });
  if (raw.onHit === undefined) return result;
  if (!object(raw.onHit)) {
    result.push({ field: "onHit", message: "On-hit effects must be an object." });
    return result;
  }
  Object.keys(hitEffects).forEach(function (id) {
    if (!Object.prototype.hasOwnProperty.call(raw.onHit, id)) return;
    var effect = raw.onHit[id], rules = hitEffects[id].fields;
    if (!object(effect)) {
      result.push({ field: ["onHit", id], message: "Effect settings must be an object." });
      return;
    }
    Object.keys(rules).forEach(function (key) {
      var rule = rules[key];
      if (validNumber(effect[key], rule)) return;
      var message = rule.percent ? "Enter a percentage between 0 and 100." : "Enter a finite duration of at least zero seconds.";
      result.push({ field: ["onHit", id, key], message: message });
    });
  });
  return result;
}

exports.patterns = patterns;
exports.fields = fields;
exports.hitEffects = hitEffects;
exports.damageEffects = damageEffects;
exports.allowed = allowed;
exports.active = active;
exports.attackType = attackType;
exports.runtimeCfg = runtimeCfg;
exports.settings = settings;
exports.issues = issues;
