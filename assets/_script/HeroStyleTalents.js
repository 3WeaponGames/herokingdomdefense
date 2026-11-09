"use strict";
function bonuses(rows, progress, style) {
  var result = { damage: 0, speed: 0, health: 0 }, owned = {};
  (progress || []).forEach(function (entry) { if (entry.isLock) owned[entry.id] = true; });
  (rows || []).forEach(function (row) {
    if (row.HeroStyle !== style || !owned[row.ID] || !Object.prototype.hasOwnProperty.call(result, row.HeroStat)) return;
    result[row.HeroStat] += Number(row.EffectNumber && row.EffectNumber[0]) || 0;
  });
  return result;
}
function optional(row, rows) { return !!row.OptionalBranch || rows.some(function (sibling) { return sibling.Level === row.Level && sibling.OptionalBranch; }); }
exports.bonuses = bonuses; exports.optional = optional;
