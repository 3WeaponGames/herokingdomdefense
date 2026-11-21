"use strict";

var patterns = {
  melee: ["single", "splash"],
  ranged: ["single", "splash", "volley", "piercing", "chain"]
};
var fields = {
  attackDamage: { value: 5, min: 0 },
  attackRange: { value: 50, ranged: 250, min: 0 },
  splashRadius: { value: 90, min: 0 },
  splashFalloff: { value: 1, min: 0, max: 1 },
  shotsPerVolley: { value: 2, min: 1, integer: true },
  pierceTargets: { value: 2, min: 1, integer: true },
  chainHits: { value: 3, min: 1, integer: true },
  chainRange: { value: 160, min: 0 },
  chainDamageLoss: { value: .25, min: 0, max: 1 }
};

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
  return result;
}

exports.patterns = patterns;
exports.fields = fields;
exports.allowed = allowed;
exports.active = active;
exports.attackType = attackType;
exports.runtimeCfg = runtimeCfg;
exports.settings = settings;
exports.issues = issues;
