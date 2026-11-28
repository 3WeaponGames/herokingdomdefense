"use strict";
var enums = require("./KinghtFallEnum");
var kinds = enums.KinghtFallEnumBuildEnum, missions = enums.KinghtFallEnumInGameTaskEnum;

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

var construction = [
  { kind: kinds.ArrowTower, build: missions.BuildTower, upgrade: missions.UpgradeTower },
  { kind: kinds.Barracks, build: missions.BuildBarracks, upgrade: missions.UpgradeBarracks },
  { kind: kinds.PrivateHouse, build: missions.BuildHome, upgrade: missions.UpgradeHome },
  { kind: kinds.Mill, build: missions.BuildMill, upgrade: missions.UpgradeMill },
  { kind: kinds.Wall, build: missions.BuildWall, upgrade: missions.UpgradeWall }
];
var castle = { kind: kinds.CastleCenter, upgrade: missions.UpgradeCastle };

function structureReady(id, buildings) {
  var objective = id === castle.upgrade ? castle :
    construction.find(function (entry) { return id === entry.build || id === entry.upgrade; });
  if (!objective) return false;
  var level = id === objective.upgrade ? 2 : 1;
  return buildings.some(function (building) {
    return building.buildCfg && building.buildCfg.enumValue === objective.kind && building.getLevel && building.getLevel() >= level;
  });
}

function initialBranches(cfg) {
  var rows = cfg && cfg.levelList || [];
  var choices = cfg && cfg.InitialChoices || (rows[0] ? [rows[0].index] : []);
  return rows.filter(function (row) { return row.level === 1 && choices.indexOf(row.index) >= 0; });
}

function canUpgrade(cfg) {
  var branches = initialBranches(cfg);
  return branches.length > 0 && branches.every(function (branch) {
    return cfg.levelList.some(function (row) { return row.level === 2 && (branch.BranchBuild || []).indexOf(row.index) >= 0; });
  });
}

function planStructures(stage, configs, pool, limit, random) {
  var unlocks = {}, tasks = [];
  [1, 2, 3, 4].forEach(function (tier) {
    (stage["HomeLevel" + tier + "Unlock"] || []).forEach(function (spot) {
      if (!unlocks[spot[0]]) unlocks[spot[0]] = tier;
    });
  });
  function available(id) { return pool.indexOf(id) >= 0 && tasks.indexOf(id) < 0; }
  function buildCandidates(tier, includeMill) {
    return construction.filter(function (entry) {
      return available(entry.build) && (includeMill || entry.kind !== kinds.Mill) &&
        unlocks[entry.kind] <= tier && initialBranches(configs[entry.kind]).length;
    }).map(function (entry) { return entry.build; });
  }
  function draw(candidates, end) {
    while (tasks.length < end && candidates.length) {
      tasks.push(candidates.splice(Math.floor(random() * candidates.length), 1)[0]);
    }
  }
  var phase = Math.ceil(limit / 3);
  draw(buildCandidates(1, false), phase);
  // The castle upgrade opens the next set of plots and level-two branches.
  var tier = 1;
  if (tasks.length < limit && available(castle.upgrade) && canUpgrade(configs[castle.kind])) {
    tasks.push(castle.upgrade);
    tier = 2;
  }
  draw(buildCandidates(tier, true), Math.min(limit, phase * 2));
  if (tier > 1) draw(construction.filter(function (entry) {
    return tasks.indexOf(entry.build) >= 0 && available(entry.upgrade) && canUpgrade(configs[entry.kind]);
  }).map(function (entry) { return entry.upgrade; }), limit);
  draw(buildCandidates(tier, true), limit);
  return tasks;
}

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
exports.planStructures = planStructures;
exports.structureReady = structureReady;
exports.recordKill = function (game, tag) { return record(game, "kill", tag); };
exports.recordDestruction = function (game, tag) { return record(game, "survive", tag); };
