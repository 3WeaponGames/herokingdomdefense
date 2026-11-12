"use strict";

// Pure samples of the Archer tower's authored create/upgrade motion in jt.json.
// Only the presentation consumes this pose; the building and collider stay put.
var SMOOTH = [.25, 0, .75, 1], FALL = [.25, 0, .887, .22];
var CREATE = {
  y: [[0, 386.96, SMOOTH], [.3333, 547.23, "stepped"], [.5, 547.23, FALL],
    [.6667, -70.79, SMOOTH], [.8333, 25.94, SMOOTH], [1, 0]],
  sx: [[0, 0, SMOOTH], [.5, 1, FALL], [.6667, 1.094, SMOOTH], [.8333, .932, SMOOTH], [1, 1]],
  sy: [[0, 0, SMOOTH], [.5, 1, FALL], [.6667, .78, SMOOTH], [.8333, 1.076, SMOOTH], [1, 1]]
};
var UPGRADE = {
  y: [[.1667, 0, SMOOTH], [.3333, -12.18, SMOOTH], [.5, 0]],
  sx: [[0, 0, SMOOTH], [.1667, .893, SMOOTH], [.3333, 1.091, SMOOTH], [.5, 1]],
  sy: [[0, 0, SMOOTH], [.1667, 1.167, SMOOTH], [.3333, .893, SMOOTH], [.5, 1]]
};
var DESTROY = {
  x: [[0, 0, SMOOTH], [.3333, 2.29]],
  y: [[0, 0, SMOOTH], [.3333, -52.58]],
  sx: [[0, 1], [.3333, 1]],
  sy: [[0, 1, SMOOTH], [.3333, .76]]
};
function duration(kind) { return kind === "create" ? 1.2 : kind === "upgrade" ? .6667 : kind === "destroy" ? 1.1667 : 0; }
function identity() { return { x: 0, y: 0, scaleX: 1, scaleY: 1 }; }
function cubic(t, a, b) {
  var inverse = 1 - t;
  return 3 * inverse * inverse * t * a + 3 * inverse * t * t * b + t * t * t;
}
function ease(progress, curve) {
  if (progress <= 0 || progress >= 1) return progress;
  if (curve === "stepped") return 0;
  if (!curve) return progress;
  // Spine's curve is parameterized by X. Invert X rather than using time as
  // the Bezier parameter, particularly for the asymmetric falling segment.
  var low = 0, high = 1, middle = progress;
  for (var i = 0; i < 32; i++) {
    middle = (low + high) / 2;
    if (cubic(middle, curve[0], curve[2]) < progress) low = middle;
    else high = middle;
  }
  return cubic((low + high) / 2, curve[1], curve[3]);
}
function value(track, seconds) {
  if (seconds <= track[0][0]) return track[0][1];
  for (var i = 1; i < track.length; i++) {
    var before = track[i - 1], after = track[i];
    if (seconds < after[0]) {
      var progress = ease((seconds - before[0]) / (after[0] - before[0]), before[2]);
      return before[1] + (after[1] - before[1]) * progress;
    }
  }
  return track[track.length - 1][1];
}
function sample(kind, seconds) {
  var length = duration(kind);
  if (!length) return identity();
  seconds = typeof seconds === "number" && isFinite(seconds) ? Math.max(0, Math.min(length, seconds)) : 0;
  if (seconds >= length && kind !== "destroy") return identity();
  var track = kind === "create" ? CREATE : kind === "destroy" ? DESTROY : UPGRADE;
  var sx = value(track.sx, seconds), sy = value(track.sy, seconds), translation = value(track.y, seconds);
  // bone3 bind (-5.2,156.53) inherits jianzhu's .5 scale on create. Preserve
  // that pivot while converting its relative movement into owner-local space.
  var bonePose = kind === "create" || kind === "destroy";
  var px = bonePose ? -2.6 : 0, py = bonePose ? 78.265 : 0;
  var pose = { x: px * (1 - sx) + (track.x ? value(track.x, seconds) * .5 : 0) || 0,
    y: py * (1 - sy) + translation * (bonePose ? .5 : 1) || 0, scaleX: sx, scaleY: sy };
  if (kind === "destroy") pose.visible = seconds < .2667;
  return pose;
}
exports.duration = duration;
exports.sample = sample;
