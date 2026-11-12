"use strict";
// Read-only combat release metadata. Saved gold timings control gameplay;
// authored animation event markers must never create an unsaved windup.
var Cadence = require("./AttackCadence");
function finite(value) { return typeof value === "number" && isFinite(value); }
function validSpeed(value) { return finite(value) && value >= .1 && value <= 4; }
function validRelative(value) { return finite(value) && value >= 0 && value <= 2; }
function resolve(settings, descriptor) {
  settings = settings || {}; descriptor = descriptor || {};
  var type = descriptor.type || "enemy", id = type === "hero" ? "hero" : String(descriptor.id === undefined ? "" : descriptor.id);
  var key = descriptor.key || type + ":" + id + ":" + (descriptor.form || "default");
  var level = descriptor.level, speedKey = type === "ally" && finite(level) && level > 0 && Math.floor(level) === level ? "ally:" + id + ":level:" + level : key;
  var record = descriptor.record || {}, pack = descriptor.pack || record.MonsterPack;
  var baseline = validSpeed(descriptor.modelAnimationSpeed) ? descriptor.modelAnimationSpeed : pack === "fantasy-bosses" ? .25 : pack === "fantasy-monsters" ? .35 : 1;
  var relative = descriptor.unitAnimationSpeed, wholeUnit = validRelative(relative), speeds = settings.animationSpeeds || {};
  var speed = wholeUnit ? baseline * relative : validSpeed(speeds[speedKey]) ? speeds[speedKey] : validSpeed(speeds[key]) ? speeds[key] : baseline;
  var timing = settings.timings && settings.timings[key];
  if (timing === undefined) timing = settings.timingDefaults && settings.timingDefaults[key];
  var marker = timing && timing.attack, hit = finite(marker) && marker > 0 && marker <= 10 ? marker : 0;
  var duration = finite(descriptor.duration) && descriptor.duration >= 0 ? descriptor.duration : 0;
  var rate = descriptor.cooldownRate === undefined ? record.AttackInterval : descriptor.cooldownRate;
  var policy = descriptor.cooldownStart || (type === "hero" ? "hit-unblocked" : "hit");
  var result = { key: key, speedKey: speedKey, cooldownRate: rate, hitTime: hit, duration: duration,
    animationSpeed: speed, modelAnimationSpeed: baseline, cooldownStart: policy, frozen: speed === 0,
    rate: 0, cycle: null, cooldown: finite(rate) && rate > 0 ? 1 / rate : null, windup: speed > 0 ? hit / speed : null,
    animationDuration: speed > 0 ? duration / speed : null, reason: null };
  if (wholeUnit) result.unitAnimationSpeed = relative;
  if (!finite(rate) || rate < 0) { result.reason = "Missing or invalid attack cooldown rate."; return result; }
  if (speed === 0 || rate === 0) return result;
  var measured = Cadence.measure(rate, hit, duration, speed, policy);
  if (!measured) { result.reason = "Attack cadence exceeds the supported numeric range."; return result; }
  return Object.assign(result, measured);
}
exports.resolve = resolve;
