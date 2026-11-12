"use strict";
// Read-only upgrade ledger. UI categories and similar model names never make
// an army/building effect apply to the hero; these scopes follow runtime code.
var Weapons = require("./HeroWeapons");
var RELICS = {
  120001: ["reviveSeconds", "utility", "hero"], 120002: ["enemySlow", "utility", "hero"],
  120003: ["startingSilver", "excluded", "economy"], 120004: ["taxSilver", "excluded", "economy"],
  120005: ["stageGold", "excluded", "economy"], 120006: ["drawShards", "excluded", "economy"],
  120007: ["soldierMove", "excluded", "army"], 120008: ["freeHouse", "excluded", "building"],
  120009: ["buildCost", "excluded", "economy"], 120010: ["soldierDamageOverTime", "excluded", "army"],
  120011: ["invulnerableChance", "conditional", "hero"], 120012: ["talentCost", "excluded", "economy"],
  120013: ["equipmentCost", "excluded", "economy"], 120014: ["meleeSoldierAttackRate", "excluded", "army"],
  120015: ["rangedSoldierAttackRate", "excluded", "army"], 120016: ["towerDamage", "excluded", "building"],
  120017: ["towerRange", "excluded", "building"], 120018: ["closeDamage", "conditional", "hero"],
  120019: ["soldierRetaliation", "excluded", "army"], 120020: ["millSilver", "excluded", "economy"],
  120021: ["castleDamage", "excluded", "building"], 120022: ["wallHealth", "excluded", "building"],
  120023: ["houseSilver", "excluded", "economy"], 120024: ["cavalryStats", "excluded", "army"],
  120025: ["archerStats", "excluded", "army"], 120026: ["heavyInfantryStats", "excluded", "army"],
  120027: ["infantryStats", "excluded", "army"], 120028: ["castleRecovery", "excluded", "building"],
  120029: ["slowedDamage", "conditional", "hero"], 120030: ["chainDamage", "conditional", "hero"],
  120031: ["criticalChance", "stat", "hero"], 120032: ["castleHealth", "excluded", "building"],
  120033: ["rangedReduction", "conditional", "hero"], 120034: ["bossDamage", "conditional", "hero"],
  120035: ["criticalDamage", "stat", "hero"], 120036: ["health", "stat", "hero"],
  120037: ["towerControl", "excluded", "building"], 120038: ["soldierReplacement", "excluded", "army"],
  120039: ["move", "utility", "hero"], 120040: ["reflection", "conditional", "hero"],
  120041: ["movingReduction", "conditional", "hero"], 120042: ["killHealing", "conditional", "hero"],
  120043: ["waveHealing", "conditional", "hero"], 120044: ["range", "utility", "hero"],
  120045: ["soldierExecute", "excluded", "army"], 120046: ["castleReduction", "excluded", "building"],
  120047: ["production", "excluded", "economy"], 120048: ["waveSilver", "excluded", "economy"],
  120049: ["soldierWaveHealing", "excluded", "army"], 120050: ["castleControl", "excluded", "building"]
};
function finite(value) { return typeof value === "number" && isFinite(value); }
function rawData(user) { return user && user.data || user || {}; }
function list(value) { return Array.isArray(value) ? value : typeof value === "string" ? value.split(/[|,]/).map(function (entry) { return entry.trim(); }) : [value]; }
function matches(value, style) {
  return list(value).some(function (item) {
    return item === style.id || item === "hero" || item === "all" || item === "any" || item === "melee" && !style.ranged || item === "ranged" && style.ranged;
  });
}
function required(row, style) {
  if (row.HeroStyle !== undefined && row.HeroStyle !== null && row.HeroStyle !== "" && row.HeroStyle !== style.id) return false;
  var fields = ["RequiredHeroStyle", "RequiredHeroStyles", "RequiredType", "RequiredUnitType", "UnitType"];
  for (var index = 0; index < fields.length; index++) {
    var value = row[fields[index]];
    if (value !== undefined && value !== null && value !== "" && !matches(value, style)) return false;
  }
  if (row.RequiredAttackType !== undefined && Number(row.RequiredAttackType) !== (style.ranged ? 2 : 1)) return false;
  return true;
}
function metadata(source, row) {
  var info, effect, kind, scope;
  if (source === "talent") {
    effect = row.HeroStat === "speed" ? "attackRate" : row.HeroStat;
    if (row.HeroStyle && ["health", "damage", "attackRate"].indexOf(effect) >= 0) { kind = "stat"; scope = "hero"; }
    else if (Number(row.kindID) >= 100010 && Number(row.kindID) <= 100027) { effect = "perkUnlock"; kind = "excluded"; scope = "run-perk-unlock"; }
    else { effect = "otherTalent"; kind = "excluded"; scope = Number(row.kindID) >= 100001 && Number(row.kindID) <= 100005 ? "army" : Number(row.kindID) >= 100006 && Number(row.kindID) <= 100009 ? "building" : "unknown"; }
  } else {
    info = RELICS[row.ID] || ["unsupported", "excluded", "unknown"];
    effect = info[0]; kind = info[1]; scope = info[2];
  }
  var restrictions = {};
  ["HeroStyle", "RequiredHeroStyle", "RequiredHeroStyles", "RequiredType", "RequiredUnitType", "UnitType", "RequiredAttackType"].forEach(function (key) { if (row[key] !== undefined) restrictions[key] = JSON.parse(JSON.stringify(row[key])); });
  return { source: source, id: Number(row.ID), effect: effect, kind: kind, scope: scope, requirements: restrictions,
    values: source === "talent" ? (row.EffectNumber || []).slice() : null,
    levels: source === "relic" ? (row.levelInfo || []).map(function (level) { return (level.param || []).slice(); }) : null };
}
function inventory(config) {
  config = config || {};
  return (config.TalentLevelCfg || []).map(function (row) { return metadata("talent", row); })
    .concat((config.TreasureCfg || []).map(function (row) { return metadata("relic", row); }));
}
function resolve(config, user, styleId) {
  config = config || {}; var data = rawData(user), style = Weapons.find(styleId) || Weapons.selected(data), ownedTalents = {}, ownedRelics = {};
  (Array.isArray(data.talentInfo) ? data.talentInfo : []).forEach(function (entry) { if (entry && entry.isLock) ownedTalents[entry.id] = true; });
  (Array.isArray(data.treasureInfo) ? data.treasureInfo : []).forEach(function (entry) { if (entry && !Object.prototype.hasOwnProperty.call(ownedRelics, entry.id)) ownedRelics[entry.id] = entry; });
  var records = inventory(config), stats = { health: 0, damage: 0, attackRate: 0 }, effects = {};
  records.forEach(function (record) {
    var row = (record.source === "talent" ? config.TalentLevelCfg : config.TreasureCfg).filter(function (value) { return Number(value.ID) === record.id; })[0];
    var owned = record.source === "talent" ? ownedTalents[record.id] : ownedRelics[record.id], level = record.source === "talent" ? owned ? 1 : 0 : owned && Number(owned.level);
    if (record.source === "relic") level = finite(level) && level >= 1 && record.levels.length ? Math.min(record.levels.length, Math.floor(level)) : 0;
    record.owned = !!level; record.level = level || 0; record.eligible = record.scope === "hero" && record.kind !== "excluded" && required(row, style);
    record.reason = !record.owned ? "Not owned." : record.scope === "run-perk-unlock" ? "Unlocks a run perk; ownership does not activate its combat effect." : record.scope === "unknown" ? "No implemented hero combat effect." : record.scope !== "hero" ? "Affects " + record.scope + ", not the hero." : !record.eligible ? "Requires a different equipped hero type." : record.effect === "enemySlow" ? "Movement utility; also enables damage bonuses against slowed targets." : record.kind === "utility" ? "Hero utility is displayed separately from combat output." : null;
    record.values = record.source === "relic" ? level ? record.levels[level - 1].slice() : [] : record.values;
    if (!record.owned || !record.eligible) return;
    if (record.source === "talent" && Object.prototype.hasOwnProperty.call(stats, record.effect)) stats[record.effect] += Number(record.values[0]) || 0;
    else effects[record.effect] = record.values.slice();
  });
  return { style: style.id, records: records, stats: stats, effects: effects };
}
function effect(ledger, name) {
  var value = ledger && ledger.effects && ledger.effects[name], first = value && value[0];
  return finite(first) && first > 0 ? first : 0;
}
function scenario(input) {
  var defaults = require("./CombatPower").DEFAULTS, result = {}, reason = null;
  input = input === undefined ? {} : input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return { reason: "Hero CP assumptions must be an object." };
  var fractions = ["heroHealingUtilization", "heroTriggeredHealingUtilization", "heroCloseTargetFraction", "heroSlowedTargetFraction", "heroBossTargetFraction", "heroMovingFraction", "heroRangedDamageFraction"];
  var numbers = ["heroIncomingDps", "heroIncomingHitsPerSecond", "heroKillsPerSecond", "heroWaveSeconds", "splashTargets"];
  fractions.concat(numbers).forEach(function (key) {
    var value = Object.prototype.hasOwnProperty.call(input, key) ? input[key] : defaults[key]; result[key] = value;
    if (!finite(value) || value < 0 || fractions.indexOf(key) >= 0 && value > 1 || key === "heroWaveSeconds" && value === 0 || key === "splashTargets" && Math.floor(value) !== value) reason = reason || "Invalid hero CP assumption: " + key + ".";
  });
  return { values: result, reason: reason };
}
function evaluate(loadout, assumptions) {
  var settings = scenario(assumptions), a = settings.values;
  if (settings.reason) return { reason: settings.reason };
  var ledger = loadout.upgrades, close = 1 + effect(ledger, "closeDamage") * a.heroCloseTargetFraction;
  var slowedFraction = effect(ledger, "enemySlow") > 0 ? 1 : a.heroSlowedTargetFraction;
  var target = 1 + effect(ledger, "slowedDamage") * slowedFraction + effect(ledger, "bossDamage") * a.heroBossTargetFraction;
  var directDps = loadout.expectedDamage * close * target * loadout.attackRate;
  // Thunder is dispatched before the critical roll. Secondary hits do not
  // receive the primary target's boss/slowed bonuses a second time.
  var chainDps = loadout.damage * close * loadout.attackRate * effect(ledger, "chainDamage") / 8 * Math.min(2, a.splashTargets);
  var ranged = effect(ledger, "rangedReduction"), moving = effect(ledger, "movingReduction");
  var stillRanged = Math.min(.8, ranged), movingRanged = Math.min(.8, ranged + moving), movingMelee = Math.min(.8, moving);
  // Clamp each encounter state before averaging. Averaging reductions first
  // would overvalue overlapping defenses near the runtime's 80% cap.
  var averageReduction = (1 - a.heroMovingFraction) * a.heroRangedDamageFraction * stillRanged + a.heroMovingFraction * a.heroRangedDamageFraction * movingRanged + a.heroMovingFraction * (1 - a.heroRangedDamageFraction) * movingMelee;
  var afterDefense = a.heroIncomingDps * (1 - averageReduction), chance = effect(ledger, "invulnerableChance");
  // Expected renewal: successful received hits can start a three-second shield;
  // attacks during that shield cannot start another shield. This estimates only
  // the relic's extra protection, not the hero's ordinary hit invulnerability.
  var shieldLoad = Math.min(1, chance) * 3 * a.heroIncomingHitsPerSecond;
  var shieldFraction = shieldLoad === Infinity ? 1 : shieldLoad / (1 + shieldLoad);
  var preventedDps = a.heroIncomingDps * averageReduction + afterDefense * shieldFraction;
  var rangedAfterDefense = a.heroIncomingDps * a.heroRangedDamageFraction * ((1 - a.heroMovingFraction) * (1 - stillRanged) + a.heroMovingFraction * (1 - movingRanged));
  var reflectionDps = rangedAfterDefense * (1 - shieldFraction) * effect(ledger, "reflection");
  var killHealingHps = loadout.health * Math.min(effect(ledger, "killHealing") * a.heroKillsPerSecond, .1 / a.heroWaveSeconds) * a.heroTriggeredHealingUtilization;
  var waveHealingHps = loadout.health * effect(ledger, "waveHealing") / a.heroWaveSeconds * a.heroTriggeredHealingUtilization;
  var regenerationHps = loadout.regen * a.heroHealingUtilization, healingHps = regenerationHps + killHealingHps + waveHealingHps;
  return { directDps: directDps, primaryDps: directDps, splashDps: chainDps, chainDps: chainDps,
    reflectionDps: reflectionDps, preventedDps: preventedDps, healingHps: healingHps, regenerationHps: regenerationHps,
    killHealingHps: killHealingHps, waveHealingHps: waveHealingHps, averageReduction: averageReduction,
    shieldFraction: shieldFraction, effectiveSlowedTargetFraction: slowedFraction, conditionalDamageMultiplier: close * target, assumptions: a, reason: null };
}
exports.inventory = inventory; exports.resolve = resolve; exports.required = required;
exports.effect = effect; exports.scenario = scenario; exports.evaluate = evaluate;
