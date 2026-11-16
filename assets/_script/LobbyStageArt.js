"use strict";

var images = {
  forest: "Thumbnails/biome-forest",
  "deep-forest": "Thumbnails/biome-deep-forest",
  autumn: "Thumbnails/biome-autumn",
  desert: "Thumbnails/biome-desert",
  snow: "Thumbnails/biome-snow",
  ice: "Thumbnails/biome-ice",
  fire: "Thumbnails/biome-fire",
  lava: "Thumbnails/biome-lava"
};
var legacy = { Map01: "forest", Map02: "deep-forest", Map03: "desert", Map04: "snow", Map07: "fire" };
function own(table, key) { return typeof key === "string" && Object.prototype.hasOwnProperty.call(table, key); }
function mapBiome(id) {
  if (own(images, id)) return id;
  if (own(legacy, id)) return legacy[id];
  if (typeof id !== "string") return null;
  var original = /^map-original-0([1-4])-rebuilt$/.exec(id);
  if (original) return legacy["Map0" + original[1]];
  var terrain = /^map-(forest|deep-forest|autumn|desert|snow|ice|fire|lava)-terrain$/.exec(id);
  if (terrain) return terrain[1];
  var bridge = /^map-bridge-oblique-v2-(forest|autumn|ice)$/.exec(id);
  return bridge ? bridge[1] : null;
}
function biome(stage) {
  stage = stage || {};
  if (own(images, stage.EnvironmentBiome)) return stage.EnvironmentBiome;
  return mapBiome(stage.EnvironmentMapId) || mapBiome(stage.prefab);
}
function resource(stage) {
  stage = stage || {};
  if (stage.StageThumbnail) return stage.StageThumbnail;
  var selected = biome(stage);
  return selected ? images[selected] : stage.Map || images.forest;
}

exports.biome = biome;
exports.resource = resource;
