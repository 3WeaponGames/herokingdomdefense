"use strict";
// Display-only ratings reuse the existing objective bitmask. Chest claims and
// rewards do not participate, and rendering never modifies player progress.
function cleared(stage, mask, maxStage) {
  return !!(mask & 1) || Number(maxStage) > Number(stage.Level);
}
function count(stage, mask, won) {
  if (!won) return 0;
  var objectives = stage && Array.isArray(stage.Challenge) ? stage.Challenge.slice(0, 3) : [1, 2, 3];
  var earned = objectives.reduce(function (total, type) { return total + (type === 1 || (mask & (1 << (type - 1))) ? 1 : 0); }, 0);
  return Math.max(1, Math.min(3, earned));
}
exports.cleared = cleared;
exports.count = count;
