"use strict";
// A fresh, read-only view of the equipped hero. Weapon tracks 3/4 belong to
// exactly one style; armor, regeneration, attack rate and mount remain shared.
var Weapons = require("./HeroWeapons"), Upgrades = require("./HeroUpgradeEffects");
function finite(value) { return typeof value === "number" && isFinite(value); }
function rawData(user) { return user && user.data || user || {}; }
function selected(user) {
  var data = rawData(user), style = data.heroWeapon ? Weapons.selected(data) : user && user.getHeroWeapon && user.getHeroWeapon();
  return style && Weapons.find(style.id) || Weapons.styles[0];
}
function level(user, slot, style) {
  var data = rawData(user);
  if (data.personLevel || data.heroWeapon) return Weapons.level(data, slot, style);
  if ((slot === 3 || slot === 4) && user && user.getHeroWeaponLevel) return user.getHeroWeaponLevel(style, slot);
  // Old read-only callers may expose accessors only. Never borrow a bow track
  // for another weapon in that fallback path.
  return user && user.getPersonLevel && (style === "skirmisher" || slot !== 3 && slot !== 4) ? user.getPersonLevel(slot) : 1;
}
function applyStyle(stats, user, config, upgrades) {
  var style = selected(user), resolved = upgrades || Upgrades.resolve(config, user, style.id), bonus = { health: resolved.stats.health, damage: resolved.stats.damage, speed: resolved.stats.attackRate };
  return { style: style.id, ranged: style.ranged, bonuses: bonus, health: stats.health * (1 + bonus.health), damage: stats.damage * (1 + bonus.damage), attackRate: stats.attackRate * (1 + bonus.speed), range: stats.range * style.reach };
}
function snapshot(config, user) {
  config = config || {}; var data = rawData(user), style = selected(user), levels = {}, equipment = {}, reason = null;
  for (var slot = 1; slot <= 6; slot++) {
    var row = (config.EquipCfg || []).filter(function (entry) { return Number(entry.id) === slot; })[0], progress = Number(level(user, slot, style.id));
    var current = row && row.levelInfo && Math.max(1, Math.min(row.levelInfo.length, isFinite(progress) ? Math.floor(progress) : 1));
    var value = current && row.levelInfo[current - 1] && row.levelInfo[current - 1].Parameters;
    levels[slot] = current || 1; equipment[slot] = value;
    if (!finite(value) || value < 0 || slot === 1 && value === 0) reason = reason || "Missing or invalid hero equipment stat in slot " + slot + ".";
  }
  var raw = { health: equipment[1], regen: equipment[2], damage: equipment[3], range: equipment[4], attackRate: equipment[5], move: equipment[6] };
  var upgrades = Upgrades.resolve(config, user, style.id), modified = applyStyle(raw, user, config, upgrades), baseHealth = modified.health;
  var criticalChance = Math.max(0, Math.min(1, Upgrades.effect(upgrades, "criticalChance")));
  var parameter = config.ParameterCfg && config.ParameterCfg[60015], criticalMultiplier = parameter ? Number(parameter.Value) : criticalChance > 0 ? NaN : 1;
  criticalMultiplier *= 1 + Upgrades.effect(upgrades, "criticalDamage");
  var result = { style: style.id, ranged: style.ranged, levels: levels, raw: raw, bonuses: modified.bonuses,
    baseHealth: baseHealth, health: baseHealth * (1 + Upgrades.effect(upgrades, "health")), damage: modified.damage, attackRate: modified.attackRate,
    regen: raw.regen, range: modified.range * (1 + Upgrades.effect(upgrades, "range")), move: raw.move * (1 + Upgrades.effect(upgrades, "move")), upgrades: upgrades,
    criticalChance: criticalChance, criticalMultiplier: criticalMultiplier,
    expectedDamage: modified.damage * (1 + criticalChance * (criticalMultiplier - 1)), reason: reason };
  ["health", "damage", "attackRate", "regen", "range", "move", "criticalMultiplier", "expectedDamage"].forEach(function (key) {
    if (!finite(result[key]) || result[key] < 0) result.reason = result.reason || "Invalid hero " + key + ".";
  });
  return result;
}
function calculate(config, user, assumptions) {
  var Core = require("./CombatPower"), loadout = snapshot(config, user), effects = Upgrades.evaluate(loadout, assumptions), reason = loadout.reason || effects.reason;
  var combat = Core.calculate({ health: reason ? 0 : loadout.health, directDps: effects.directDps, healingHps: effects.healingHps, splashDps: effects.splashDps, reflectionDps: effects.reflectionDps, preventedDps: effects.preventedDps });
  if (reason) combat.reason = reason;
  return Object.assign({}, loadout, effects, combat, { heroHealingUtilization: effects.assumptions && effects.assumptions.heroHealingUtilization });
}
exports.selected = selected; exports.applyStyle = applyStyle; exports.snapshot = snapshot; exports.calculate = calculate;
