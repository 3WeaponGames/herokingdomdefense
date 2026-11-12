"use strict";
// Read-only upgrade ledger. UI categories and similar model names never make
// an army/building effect apply to the hero; these scopes follow runtime code.
// Account CP credits supported army stats separately from gameplay eligibility.
var Weapons = require("./HeroWeapons"), Eligibility = require("./RelicEligibility");
var TYPE_WEIGHT = .2;
var RELICS = {
  120001: ["reviveSeconds", "utility", "hero"], 120002: ["enemySlow", "utility", "hero"],
  120003: ["startingSilver", "excluded", "economy"], 120004: ["taxSilver", "excluded", "economy"],
  120005: ["stageGold", "excluded", "economy"], 120006: ["drawShards", "excluded", "economy"],
  120007: ["soldierMove", "excluded", "army"], 120008: ["freeHouse", "excluded", "building"],
  120009: ["buildCost", "excluded", "economy"], 120010: ["soldierDamageOverTime", "excluded", "army"],
  120011: ["invulnerableChance", "conditional", "hero"], 120012: ["talentCost", "excluded", "economy"],
  120013: ["equipmentCost", "excluded", "economy"], 120014: ["critHaste", "conditional", "hero"],
  120015: ["rangedSoldierAttackRate", "excluded", "army"], 120016: ["towerDamage", "excluded", "building"],
  120017: ["towerRange", "excluded", "building"], 120018: ["closeDamage", "conditional", "hero"],
  120019: ["soldierRetaliation", "excluded", "army"], 120020: ["millSilver", "excluded", "economy"],
  120021: ["castleDamage", "excluded", "building"], 120022: ["wallHealth", "excluded", "building"],
  120023: ["houseSilver", "excluded", "economy"], 120024: ["pierceDamage", "conditional", "hero"],
  120025: ["openingDamage", "conditional", "hero"], 120026: ["stationaryReduction", "conditional", "hero"],
  120027: ["focusDamage", "conditional", "hero"], 120028: ["castleRecovery", "excluded", "building"],
  120029: ["slowedDamage", "conditional", "hero"], 120030: ["chainDamage", "conditional", "hero"],
  120031: ["criticalChance", "stat", "hero"], 120032: ["castleHealth", "excluded", "building"],
  120033: ["rangedReduction", "conditional", "hero"], 120034: ["bossDamage", "conditional", "hero"],
  120035: ["cleaveDamage", "conditional", "hero"], 120036: ["waveBarrier", "conditional", "hero"],
  120037: ["towerControl", "excluded", "building"], 120038: ["soldierReplacement", "excluded", "army"],
  120039: ["move", "utility", "hero"], 120040: ["reflection", "conditional", "hero"],
  120041: ["movingReduction", "conditional", "hero"], 120042: ["killHealing", "conditional", "hero"],
  120043: ["emergencyHealing", "conditional", "hero"], 120044: ["range", "utility", "hero"],
  120045: ["soldierExecute", "excluded", "army"], 120046: ["castleReduction", "excluded", "building"],
  120047: ["buildingGrowth", "excluded", "building"], 120048: ["echoDamage", "conditional", "hero"],
  120049: ["stationarySoldierHealing", "excluded", "army"], 120050: ["castleControl", "excluded", "building"]
};
function finite(value) { return typeof value === "number" && isFinite(value); }
function rawData(user) { return user && user.data || user || {}; }
function list(value) { return Array.isArray(value) ? value : typeof value === "string" ? value.split(/[|,]/).map(function (entry) { return entry.trim(); }) : [value]; }
var required = Eligibility.required;
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
  if (source === "relic" && !Object.keys(restrictions).length) {
    var styles = Eligibility.stylesFor(row.ID);
    if (styles.length < Eligibility.ids.length) restrictions.RequiredHeroStyles = styles;
  }
  var cpStats = {}, cpEffect = null, implicitTypeRestriction = false;
  if (source === "talent") {
    if (scope === "hero" && kind === "stat") cpStats[effect] = 0;
    var armyStat = { 100001: "damage", 100002: "attackRate", 100003: "health", 100005: "range" }[Number(row.kindID)];
    if (armyStat) cpStats[armyStat] = 0;
    if (Number(row.kindID) === 100004) cpEffect = "armyMeleeReduction";
    implicitTypeRestriction = Number(row.kindID) === 100004 || Number(row.kindID) === 100005;
  } else if (Number(row.ID) === 120015) {
    cpStats.attackRate = 0; implicitTypeRestriction = true;
  }
  return { source: source, id: Number(row.ID), effect: effect, kind: kind, scope: scope, requirements: restrictions,
    cpStatMappings: cpStats, cpEffect: cpEffect, implicitTypeRestriction: implicitTypeRestriction,
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
    record.owned = !!level; record.level = level || 0; record.eligible = record.scope === "hero" && record.kind !== "excluded" && required(record.requirements, style);
    record.reason = !record.owned ? "Not owned." : record.scope === "run-perk-unlock" ? "Unlocks a run perk; ownership does not activate its combat effect." : record.scope === "unknown" ? "No implemented hero combat effect." : record.scope !== "hero" ? "Affects " + record.scope + ", not the hero." : !record.eligible ? "Requires a different equipped hero type." : record.effect === "enemySlow" ? "Movement utility; permanent slowing does not activate the controlled-target damage bonus." : record.kind === "utility" ? "Hero utility is displayed separately from combat output." : null;
    record.values = record.source === "relic" ? level ? record.levels[level - 1].slice() : [] : record.values;
    if (!record.owned || !record.eligible) return;
    if (record.source === "talent" && Object.prototype.hasOwnProperty.call(stats, record.effect)) stats[record.effect] += Number(record.values[0]) || 0;
    else effects[record.effect] = record.values.slice();
  });
  return { style: style.id, records: records, stats: stats, effects: effects };
}
function typeRestricted(record) {
  if (record.implicitTypeRestriction) return true;
  var restrictions = record.requirements || {};
  return Object.keys(restrictions).some(function (key) {
    var value = restrictions[key];
    if (value === undefined || value === null || value === "") return false;
    if (key === "RequiredAttackType") return true;
    // Broad all-hero tags do not restrict an upgrade to a particular type.
    return !list(value).some(function (item) { return item === "all" || item === "any" || item === "hero"; });
  });
}
function resolvePower(config, user, styleId) {
  var actual = resolve(config, user, styleId), stats = { health: 0, damage: 0, attackRate: 0, range: 0 }, effects = {};
  actual.records.forEach(function (record) {
    record.gameplayEligible = record.eligible; record.gameplayReason = record.reason;
    record.typeRestricted = typeRestricted(record);
    record.cpEligible = record.scope === "hero" && record.kind !== "excluded" || Object.keys(record.cpStatMappings).length > 0 || !!record.cpEffect;
    record.weight = record.owned && record.cpEligible ? record.typeRestricted ? TYPE_WEIGHT : 1 : 0;
    record.rawValues = record.values.slice();
    record.values = record.rawValues.map(function (value) { return typeof value === "number" ? value * record.weight : value; });
    record.creditedStats = {};
    if (!record.weight) return;
    record.reason = record.typeRestricted ? "Credits 20% of this type-restricted upgrade to account CP regardless of the equipped type." : "Credits the full unrestricted combat upgrade to account CP.";
    Object.keys(record.cpStatMappings).forEach(function (stat) {
      var value = Number(record.rawValues[record.cpStatMappings[stat]]) || 0, credited = value * record.weight;
      stats[stat] += credited; record.creditedStats[stat] = credited;
    });
    if (record.cpEffect) effects[record.cpEffect] = [(effects[record.cpEffect] && effects[record.cpEffect][0] || 0) + (Number(record.rawValues[0]) || 0) * record.weight];
    else if (!Object.keys(record.cpStatMappings).length) effects[record.effect] = record.values.slice();
  });
  return { mode: "account-wide", typeWeight: TYPE_WEIGHT, style: actual.style, records: actual.records, stats: stats, effects: effects };
}
function effect(ledger, name) {
  var value = ledger && ledger.effects && ledger.effects[name], first = value && value[0];
  return finite(first) && first > 0 ? first : 0;
}
function scenario(input) {
  var defaults = Object.assign({ heroOpeningTargetFraction: .25, heroFocusStacks: 1.5 }, require("./CombatPower").DEFAULTS), result = {}, reason = null;
  input = input === undefined ? {} : input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return { reason: "Hero CP assumptions must be an object." };
  var fractions = ["heroHealingUtilization", "heroTriggeredHealingUtilization", "heroCloseTargetFraction", "heroSlowedTargetFraction", "heroBossTargetFraction", "heroMovingFraction", "heroRangedDamageFraction", "heroOpeningTargetFraction"];
  var numbers = ["heroIncomingDps", "heroIncomingHitsPerSecond", "heroKillsPerSecond", "heroWaveSeconds", "splashTargets", "heroFocusStacks"];
  fractions.concat(numbers).forEach(function (key) {
    var value = Object.prototype.hasOwnProperty.call(input, key) ? input[key] : defaults[key]; result[key] = value;
    if (!finite(value) || value < 0 || fractions.indexOf(key) >= 0 && value > 1 || key === "heroWaveSeconds" && value === 0 || key === "splashTargets" && Math.floor(value) !== value || key === "heroFocusStacks" && value > 3) reason = reason || "Invalid hero CP assumption: " + key + ".";
  });
  return { values: result, reason: reason };
}
function evaluate(loadout, assumptions) {
  var settings = scenario(assumptions), a = settings.values;
  if (settings.reason) return { reason: settings.reason };
  var ledger = loadout.upgrades, close = 1 + effect(ledger, "closeDamage") * a.heroCloseTargetFraction;
  // The comparison's controlled-target fraction represents temporary control.
  // Owning the permanent global movement slow never increases that fraction.
  var slowedFraction = a.heroSlowedTargetFraction;
  var target = 1 + effect(ledger, "slowedDamage") * slowedFraction + effect(ledger, "bossDamage") * a.heroBossTargetFraction +
    effect(ledger, "openingDamage") * a.heroOpeningTargetFraction + effect(ledger, "focusDamage") * a.heroFocusStacks;
  var attackRate = loadout.effectiveAttackRate === undefined ? loadout.attackRate : loadout.effectiveAttackRate;
  // Critical haste refreshes its two-second window. Resolve its faster cooldown
  // with the same saved windup, so haste cannot speed up the authored release.
  var hasteUptime = 1 - Math.exp(-Math.max(0, loadout.criticalChance || 0) * attackRate * 2);
  var haste = effect(ledger, "critHaste"), timing = loadout.attackTiming;
  var hastedRate = timing && loadout.attackRate > 0 ? 1 / (timing.windup + 1 / (loadout.attackRate * (1 + haste))) : attackRate * (1 + haste);
  attackRate += Math.max(0, hastedRate - attackRate) * hasteUptime;
  var primaryDps = loadout.expectedDamage * close * target * attackRate;
  var noncriticalPrimary = loadout.damage * close * target;
  var echoDps = noncriticalPrimary * attackRate * effect(ledger, "echoDamage") / 6;
  var directDps = primaryDps + echoDps;
  // Thunder is dispatched before the critical roll. Secondary hits do not
  // receive the primary target's boss/slowed bonuses a second time.
  var chainDps = loadout.damage * close * attackRate * effect(ledger, "chainDamage") / 8 * Math.min(2, a.splashTargets);
  var pierceDps = noncriticalPrimary * attackRate * effect(ledger, "pierceDamage") * Math.min(1, a.splashTargets);
  var cleaveDps = noncriticalPrimary * attackRate * effect(ledger, "cleaveDamage") * Math.min(1, a.splashTargets);
  var ranged = effect(ledger, "rangedReduction"), moving = effect(ledger, "movingReduction"), stationary = effect(ledger, "stationaryReduction"), flat = effect(ledger, "armyMeleeReduction");
  var stillRanged = Math.min(.8, flat + ranged + stationary), movingRanged = Math.min(.8, flat + ranged + moving), movingMelee = Math.min(.8, flat + moving), stillMelee = Math.min(.8, flat + stationary);
  // Clamp each encounter state before averaging. Averaging reductions first
  // would overvalue overlapping defenses near the runtime's 80% cap.
  var averageReduction = (1 - a.heroMovingFraction) * a.heroRangedDamageFraction * stillRanged + (1 - a.heroMovingFraction) * (1 - a.heroRangedDamageFraction) * stillMelee + a.heroMovingFraction * a.heroRangedDamageFraction * movingRanged + a.heroMovingFraction * (1 - a.heroRangedDamageFraction) * movingMelee;
  var afterDefense = a.heroIncomingDps * (1 - averageReduction), chance = effect(ledger, "invulnerableChance");
  // Expected renewal: successful received hits can start a three-second shield;
  // attacks during that shield cannot start another shield. This estimates only
  // the relic's extra protection, not the hero's ordinary hit invulnerability.
  var shieldLoad = Math.min(1, chance) * 3 * a.heroIncomingHitsPerSecond;
  var shieldFraction = shieldLoad === Infinity ? 1 : shieldLoad / (1 + shieldLoad);
  // A single barrier supplies a finite absorption budget each wave.
  var barrierPreventedDps = Math.min(afterDefense * (1 - shieldFraction), loadout.health * effect(ledger, "waveBarrier") / a.heroWaveSeconds);
  var preventedDps = a.heroIncomingDps * averageReduction + afterDefense * shieldFraction + barrierPreventedDps;
  var rangedAfterDefense = a.heroIncomingDps * a.heroRangedDamageFraction * ((1 - a.heroMovingFraction) * (1 - stillRanged) + a.heroMovingFraction * (1 - movingRanged));
  var reflectionDps = Math.max(0, rangedAfterDefense * (1 - shieldFraction) - barrierPreventedDps * a.heroRangedDamageFraction) * effect(ledger, "reflection");
  // Only primary hero kills trigger Vampire Fang. A frozen or harmless hero
  // cannot earn this healing; reflected/secondary kills are excluded runtime.
  var killHealingHps = primaryDps > 0 ? loadout.health * Math.min(effect(ledger, "killHealing") * a.heroKillsPerSecond, .1 / a.heroWaveSeconds) * a.heroTriggeredHealingUtilization : 0;
  // Triggered healing utilization accounts for surviving the emergency threshold.
  // Waves without enough incoming damage to cross 30% HP receive no credit.
  var emergencyHealingHps = (afterDefense * (1 - shieldFraction) - barrierPreventedDps) * a.heroWaveSeconds > loadout.health * .7 ? loadout.health * effect(ledger, "emergencyHealing") / a.heroWaveSeconds * a.heroTriggeredHealingUtilization : 0;
  var waveHealingHps = 0;
  var regenerationHps = loadout.regen * a.heroHealingUtilization, healingHps = regenerationHps + killHealingHps + emergencyHealingHps;
  return { directDps: directDps, primaryDps: primaryDps, echoDps: echoDps, splashDps: chainDps + pierceDps + cleaveDps, chainDps: chainDps, pierceDps: pierceDps, cleaveDps: cleaveDps,
    reflectionDps: reflectionDps, preventedDps: preventedDps, healingHps: healingHps, regenerationHps: regenerationHps,
    killHealingHps: killHealingHps, emergencyHealingHps: emergencyHealingHps, waveHealingHps: waveHealingHps, averageReduction: averageReduction,
    barrierPreventedDps: barrierPreventedDps, hasteUptime: hasteUptime, effectiveRelicAttackRate: attackRate,
    shieldFraction: shieldFraction, effectiveSlowedTargetFraction: slowedFraction, conditionalDamageMultiplier: close * target, assumptions: a, reason: null };
}
exports.inventory = inventory; exports.resolve = resolve; exports.resolvePower = resolvePower; exports.required = required;
exports.typeRestricted = typeRestricted; exports.TYPE_WEIGHT = TYPE_WEIGHT;
exports.effect = effect; exports.scenario = scenario; exports.evaluate = evaluate;
