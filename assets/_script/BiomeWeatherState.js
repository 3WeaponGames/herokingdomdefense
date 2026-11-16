"use strict";
// Presentation clocks only: this never reads or advances gameplay randomness.
var Rain = require("./ForestRainState");
var PROFILES = {
  "snow": [{ kind: "weather-snow-light", ground: false, opacity: .75 }, { kind: "weather-snow-splash", ground: true, opacity: .45 }],
  "ice": [{ kind: "weather-snow-dense", ground: false, opacity: .9 }, { kind: "weather-snow-splash-dense", ground: true, opacity: .6 }],
  "fire": [{ kind: "weather-ember-upward", ground: false, opacity: .65 }, { kind: "weather-ember-erratic", ground: false, opacity: .35 }],
  "lava": [{ kind: "weather-ember-upward", ground: false, opacity: .75 }, { kind: "weather-ember-erratic", ground: false, opacity: .55 }]
};
function supported(biome) { return biome === "deep-forest" || !!PROFILES[biome]; }
function create(seed, biome) { var state = Rain.create(seed); state.biome = biome; return state; }
function step(state, dt) {
  dt = typeof dt === "number" && isFinite(dt) ? Math.max(0, dt) : 0;
  if (state.biome === "deep-forest") {
    var drops = Rain.step(state, dt), layers = [], ground = {};
    drops.forEach(function (drop) {
      layers.push({ kind: "forest-rain-" + drop.kind, ground: false, age: drop.age, opacity: drop.opacity * .75 });
      var kind = drop.kind === "intense" ? "weather-rain-splash-intense" : "weather-rain-splash";
      if (!ground[kind]) { ground[kind] = { kind: kind, ground: true, age: state.time, opacity: 0 }; layers.push(ground[kind]); }
      ground[kind].opacity += drop.opacity * (drop.kind === "light" ? .4 : .65);
    });
    return layers;
  }
  state.time += dt;
  return (PROFILES[state.biome] || []).map(function (layer) {
    return { kind: layer.kind, ground: layer.ground, age: state.time, opacity: layer.opacity * Math.min(1, state.time / 2) };
  });
}
exports.supported = supported; exports.create = create; exports.step = step;
