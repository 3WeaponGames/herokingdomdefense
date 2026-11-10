"use strict";

// Destination-level prices. Legacy rows retain their existing paid amounts
// until the author explicitly saves a BuildCost on the level being purchased.
function has(row) { return !!row && typeof row.BuildCost === "number" && isFinite(row.BuildCost) && row.BuildCost >= 0; }
function value(category, source, target) {
  if (has(target)) return target.BuildCost;
  return source ? source.BuildSliverCost : category && category.lockCose;
}
function preview(category, target) {
  if (has(target)) return { value: target.BuildCost, varied: false };
  var rows = category && category.levelList || [], parents = rows.filter(function (row) { return (row.BranchBuild || []).indexOf(target.index) >= 0; });
  var values = target.level === 1 ? [category.lockCose] : parents.map(function (row) { return value(category, row, target); });
  values = values.filter(function (price) { return typeof price === "number" && isFinite(price) && price >= 0; });
  var first = values[0], varied = values.some(function (price) { return price !== first; });
  return { value: varied ? undefined : first, varied: varied };
}
function video(target, initial) {
  if (initial) return false;
  return has(target) ? target.VedioCount > 0 : !target.BuildSliverCost;
}
exports.has = has;
exports.value = value;
exports.preview = preview;
exports.video = video;
