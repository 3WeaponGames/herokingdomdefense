"use strict";

var UnitAttack = require("./UnitAttackRules");

function isFlying(enemy) {
  var cfg = enemy && enemy.cfg;
  return !!cfg && (cfg.BuildingCross === 0 || cfg.BuildingCross === false);
}

function troopCanTarget(troop, enemy) {
  return !isFlying(enemy) || Number(UnitAttack.attackType(troop.cfg)) === 2;
}

function heroCanTarget(hero, enemy) {
  if (!isFlying(enemy)) return true;
  // The original bow hero predates the fighting-style field.
  return hero.heroStyle ? hero.heroStyle === "skirmisher" || hero.heroStyle === "mystic" : hero.heroRanged !== false;
}

exports.isFlying = isFlying;
exports.troopCanTarget = troopCanTarget;
exports.heroCanTarget = heroCanTarget;
