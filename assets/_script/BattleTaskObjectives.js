"use strict";

var definitions = [
  { id: "kill-hero", kind: "kill", target: "hero", label: "Kill enemies with the hero", defaultCount: 10 },
  { id: "kill-barracks", kind: "kill", target: "barracks", label: "Kill enemies with barracks units", defaultCount: 10 },
  { id: "kill-tower", kind: "kill", target: "tower", label: "Kill enemies with towers", defaultCount: 10 },
  { id: "kill-scarecrow", kind: "kill", target: "scarecrow", label: "Kill enemies with scarecrows", defaultCount: 10 },
  { id: "kill-bomb-mill", kind: "kill", target: "bomb-mill", label: "Kill enemies with bomb mills", defaultCount: 10 },
  { id: "survive-wall", kind: "survive", target: "wall", label: "Survive waves with walls intact", defaultCount: 1 },
  { id: "survive-tower", kind: "survive", target: "tower", label: "Survive waves with towers intact", defaultCount: 1 },
  { id: "survive-house", kind: "survive", target: "house", label: "Survive waves with houses intact", defaultCount: 1 }
];

function definition(id) {
  return definitions.find(function (row) { return row.id === id; });
}

function descriptionToken(id, count, progress) {
  if (!definition(id)) return null;
  var recipe = { template: "battle.task.objective." + id, params: [progress, count] };
  return "[[fmt:" + encodeURIComponent(JSON.stringify(recipe)) + "]]";
}

function record(game, kind, tag) {
  var data = game && game.gameData;
  return !!(data && typeof data.recordBattleTask === "function" && data.recordBattleTask(kind, tag));
}

exports.definitions = definitions;
exports.definition = definition;
exports.descriptionToken = descriptionToken;
exports.recordKill = function (game, tag) { return record(game, "kill", tag); };
exports.recordDestruction = function (game, tag) { return record(game, "survive", tag); };
