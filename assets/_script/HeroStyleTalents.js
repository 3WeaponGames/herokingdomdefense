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
function unlockStatus(row, levels, owned) {
  if (owned(row.ID)) return 1;
  if (row.Level === 1) return 2;
  var previous = levels[row.Level - 2], current = levels[row.Level - 1];
  if (!previous || !previous.cfgList.some(function (sibling) { return owned(sibling.ID); })) return 4;
  var siblings = current && current.cfgList || [];
  if (optional(row, siblings)) return 2;
  return siblings.length > 1 && siblings.some(function (sibling) { return owned(sibling.ID); }) ? 3 : 2;
}
exports.bonuses = bonuses; exports.optional = optional; exports.unlockStatus = unlockStatus;
