"use strict";

var stageArt = require("./LobbyStageArt");

function resource(level) {
  var biome = stageArt.biome(level);
  var mapId = level && (level.EnvironmentMapId || level.prefab);
  // Map07 is authored as Lava; older stage records still call it Fire.
  // Use its Lava loading portrait without rewriting those gameplay records.
  if (mapId === "Map07" && biome === "fire") biome = "lava";
  return "stage-loading/" + (biome || "forest");
}

function coverSize(width, height, imageWidth, imageHeight) {
  if (![width, height, imageWidth, imageHeight].every(function (value) { return isFinite(value) && value > 0; })) return null;
  var scale = Math.max(width / imageWidth, height / imageHeight);
  return { width: imageWidth * scale, height: imageHeight * scale };
}

exports.resource = resource;
exports.coverSize = coverSize;
