"use strict";

// Unit stats and character looks use the barracks' authored level, not the
// index of its upgrade branch. Unconfigured fields retain the base record.
var FIELDS = ["Health", "AttackDamage", "AttackInterval", "AttackRange", "SightRange", "SearchRange", "Speed"];
function key(id, value) { return "ally:" + id + ":level:" + value; }
function level(actor) {
  var build = actor && actor.outBuild, row = build && build.buildInfo && build.buildInfo.cfg;
  var value = row && row.level;
  if (value === undefined && build && typeof build.getLevel === "function") value = build.getLevel();
  return typeof value === "number" && isFinite(value) && value > 0 && Math.floor(value) === value ? value : null;
}
function valid(field, value) {
  return FIELDS.indexOf(field) >= 0 && typeof value === "number" && isFinite(value) &&
    (field === "Health" || field === "AttackInterval" ? value > 0 : value >= 0);
}
function resolve(base, settings, value) {
  if (!base || typeof value !== "number" || !isFinite(value) || value <= 0 || Math.floor(value) !== value) return base;
  var overrides = settings && settings.unitLevels && settings.unitLevels[key(base.ID, value)], result = base;
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return base;
  FIELDS.forEach(function (field) {
    if (!Object.prototype.hasOwnProperty.call(overrides, field) || !valid(field, overrides[field]) || overrides[field] === base[field]) return;
    if (result === base) { result = {}; Object.keys(base).forEach(function (name) { result[name] = base[name]; }); }
    result[field] = overrides[field];
  });
  return result;
}
exports.FIELDS = FIELDS; exports.key = key; exports.level = level; exports.resolve = resolve; exports.valid = valid;
