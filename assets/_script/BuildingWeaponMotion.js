"use strict";

// Presentation-only adaptation of Tiny Kingdom's MechTower / PositionSpring.
// The existing tower controller remains responsible for targeting and shots.
function finite(value, fallback) { return typeof value === "number" && isFinite(value) ? value : fallback; }
function config(weapon) {
  var value = weapon && weapon.motion;
  if (!value || value.type !== "spring") return null;
  return { distance: Math.max(0, finite(value.distance, 0)), speed: Math.max(0, finite(value.speed, 20)),
    damping: Math.max(.001, finite(value.damping, 5)), reloadTime: Math.max(0, finite(value.reloadTime, 0)) };
}
function start(weapon, attackInterval) {
  var settings = config(weapon);
  if (!settings) return null;
  var views = [weapon].concat(Object.keys(weapon.views || {}).map(function (name) { return weapon.views[name]; }));
  var reload = settings.reloadTime > 0 && views.some(function (view) { return view && typeof view.emptySprite === "string" && view.emptySprite; });
  // Preserve the authored reload delay, shortening only the visual delay for
  // a buffed attack cadence. The visual state never delays a gameplay shot.
  var interval = finite(attackInterval, Infinity);
  return { settings: settings, age: 0, kickAge: 0, loaded: !reload, active: true,
    reloadAt: reload ? Math.min(settings.reloadTime, interval > 0 ? interval / 2 : settings.reloadTime) : null };
}
function step(state, dt) {
  if (!state || !state.active) return;
  dt = Math.max(0, finite(dt, 0));
  state.age += dt;
  state.kickAge += dt;
  if (!state.loaded && state.age >= state.reloadAt) {
    state.loaded = true;
    state.kickAge = state.age - state.reloadAt;
  }
  state.active = !state.loaded || state.kickAge < 1 / state.settings.damping;
}
function factor(state) {
  if (!state) return 0;
  var amplitude = Math.max(0, 1 - state.settings.damping * state.kickAge);
  if (!amplitude) return 0;
  return amplitude * (Math.sin(state.settings.speed * state.kickAge) + 1) / 2;
}
exports.config = config;
exports.start = start;
exports.step = step;
exports.factor = factor;
