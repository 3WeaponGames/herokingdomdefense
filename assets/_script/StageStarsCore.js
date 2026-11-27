"use strict";
// Ratings use the existing objective bitmask, independently of chest claims.
function objectives(stage) {
  return stage && Array.isArray(stage.Challenge) ? stage.Challenge.slice(0, 3) : [1, 2, 3];
}
function cleared(stage, mask, maxStage) {
  return !!(mask & 1) || Number(maxStage) > Number(stage.Level);
}
function count(stage, mask, won) {
  if (!won) return 0;
  var earned = objectives(stage).reduce(function (total, type) { return total + (type === 1 || (mask & (1 << (type - 1))) ? 1 : 0); }, 0);
  return Math.max(1, Math.min(3, earned));
}
function maskForStars(stage, stars) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 3) return null;
  var types = objectives(stage), mask = 1;
  for (var i = 0; i < types.length && count(stage, mask, true) < stars; i++) {
    if (types[i] === 2 || types[i] === 3) mask |= 1 << (types[i] - 1);
  }
  return count(stage, mask, true) === stars ? mask : null;
}
exports.cleared = cleared;
exports.count = count;
exports.maskForStars = maskForStars;
