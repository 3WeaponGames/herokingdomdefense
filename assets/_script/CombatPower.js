"use strict";
// Shared nominal combat comparison for hero and units. Callers resolve active
// equipment, stage stats and ability output; this module never reads game state.
// Hero encounter fractions are comparison benchmarks, not live battle state.
// Passive regeneration and triggered healing have separate useful-healing rates.
var DEFAULTS = Object.freeze({ referenceHp: 40, referenceDps: 10, nearbyAllies: 3,
  nearbyOpponents: 3, splashTargets: 2, healingUtilization: 1, heroHealingUtilization: 0,
  heroCloseTargetFraction: .5, heroSlowedTargetFraction: .25, heroBossTargetFraction: .25,
  heroMovingFraction: .25, heroRangedDamageFraction: .5, heroIncomingDps: 10,
  heroIncomingHitsPerSecond: 1, heroKillsPerSecond: .2, heroWaveSeconds: 30,
  heroTriggeredHealingUtilization: 1 });
var COMPONENTS = Object.freeze(["directDps", "healingHps", "buffDps", "splashDps", "reflectionDps", "preventedDps"]);
function nonnegative(value) { return typeof value === "number" && isFinite(value) && value >= 0; }
function unavailable(reason) {
  return { directDps: null, healingHps: null, buffDps: null, splashDps: null, reflectionDps: null,
    preventedDps: null, effectiveOutput: null, cp: null, reason: reason };
}
function calculate(stats) {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return unavailable("Combat stats must be an object.");
  if (!nonnegative(stats.health) || stats.health === 0) return unavailable("HP must be a finite number greater than zero.");
  var result = { effectiveOutput: 0, cp: null, reason: null };
  for (var i = 0; i < COMPONENTS.length; i++) {
    var name = COMPONENTS[i], value = stats[name] === undefined ? 0 : stats[name];
    if (!nonnegative(value)) return unavailable("Combat output must be finite and nonnegative: " + name + ".");
    result[name] = value;
    result.effectiveOutput += value;
  }
  var product = stats.health * result.effectiveOutput;
  if (!nonnegative(result.effectiveOutput) || !nonnegative(product)) return unavailable("Combat power exceeds the finite number range.");
  result.cp = Math.sqrt(product);
  return result;
}
exports.DEFAULTS = DEFAULTS;
exports.COMPONENTS = COMPONENTS;
exports.calculate = calculate;
