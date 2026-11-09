"use strict";

// Match each implemented controller: ordinary melee waits for its clip and
// refills cooldown after the hit; ranged overlaps cooldown with its windup;
// support casts can replace their prior clip once their hit/cooldown is ready.
// Keep storage values at full precision; round only the editor presentation.
function finite(value) { return typeof value === "number" && isFinite(value); }
function timings(hitTime, duration, speed) {
  if (!finite(hitTime) || hitTime < 0 || !finite(duration) || duration < 0 || !finite(speed) || speed <= 0) return null;
  var windup = hitTime / speed, animationDuration = duration / speed;
  if (!finite(windup) || !finite(animationDuration)) return null;
  return { windup: windup, animationDuration: animationDuration };
}
function measure(cooldownRate, hitTime, duration, speed, cooldownStart) {
  var timing = timings(hitTime, duration, speed);
  if (!timing || !finite(cooldownRate) || cooldownRate <= 0) return null;
  var cooldown = 1 / cooldownRate;
  var unblocked = cooldownStart === "hit-unblocked", startsWithAttack = cooldownStart === "start";
  var cycle = startsWithAttack ? Math.max(timing.animationDuration, timing.windup, cooldown) :
    unblocked ? timing.windup + cooldown : Math.max(timing.animationDuration, timing.windup + cooldown);
  if (!finite(cooldown) || !finite(cycle) || cycle <= 0) return null;
  var rate = 1 / cycle, minimumCycle = unblocked ? timing.windup : Math.max(timing.windup, timing.animationDuration);
  if (!finite(rate) || rate <= 0) return null;
  return { rate: rate, cycle: cycle, cooldown: cooldown, windup: timing.windup,
    animationDuration: timing.animationDuration, maximumRate: minimumCycle ? 1 / minimumCycle : Infinity };
}
function cooldownRateFor(rate, hitTime, duration, speed, cooldownStart) {
  var timing = timings(hitTime, duration, speed);
  if (!timing || !finite(rate) || rate <= 0) return null;
  var cycle = 1 / rate;
  if (!finite(cycle)) return null;
  var startsWithAttack = cooldownStart === "start", unblocked = cooldownStart === "hit-unblocked";
  if (!startsWithAttack && cycle <= timing.windup) return null;
  // Accept only floating-point noise at the animation boundary, never a rate
  // that requires interrupting the authored animation or moving its hit marker.
  var boundary = startsWithAttack ? Math.max(timing.animationDuration, timing.windup) : unblocked ? 0 : timing.animationDuration;
  var tolerance = 1e-12 * Math.max(cycle, boundary);
  if (cycle + tolerance < boundary) return null;
  cycle = Math.max(cycle, boundary);
  var cooldownRate = 1 / (startsWithAttack ? cycle : cycle - timing.windup);
  return finite(cooldownRate) && cooldownRate > 0 ? cooldownRate : null;
}
function format(rate) {
  if (!finite(rate) || rate < 0) return "\u2014";
  var rounded = Math.round((rate + 2.220446049250313e-16) * 100) / 100;
  return finite(rounded) ? rounded.toFixed(2) : rate.toFixed(2);
}
exports.measure = measure;
exports.cooldownRateFor = cooldownRateFor;
exports.format = format;
