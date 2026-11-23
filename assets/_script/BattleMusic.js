"use strict";
// Music selection is deterministic and never changes combat RNG or saved progress.
var BIOMES = ["forest", "deep-forest", "autumn", "desert", "snow", "ice", "fire", "lava"];
var LEGACY = { Map01: "forest", Map02: "deep-forest", Map03: "desert", Map07: "fire" };
var PLANNING = { forest: "ready_bgm", "deep-forest": "deep_forest_ready_bgm", autumn: "autumn_ready_bgm",
  desert: "desert_ready_bgm", snow: "snow_ready_bgm", ice: "ice_ready_bgm", fire: "fire_ready_bgm", lava: "lava_ready_bgm" };
function biome(level) {
  level = level || {};
  if (BIOMES.indexOf(level.EnvironmentBiome) >= 0) return level.EnvironmentBiome;
  var map = level.EnvironmentMapId || level.prefab;
  return BIOMES.indexOf(map) >= 0 ? map : LEGACY[map] || LEGACY[level.prefab] || "forest";
}
function flag(value) { return value === true || value === 1 || value === "true" || value === "1"; }
function bossUnit(id, config, level, seen) {
  id = Number(id);
  if (!(id > 0)) return false;
  if (id === 90010 || id === 90011 || id === 90012) return true;
  seen = seen || {};
  if (seen[id]) return false;
  seen[id] = true;
  var local = level && level.EnemyProfiles && level.EnemyProfiles[id];
  if (local && bossUnit(local.baseId, config, level, seen)) return true;
  var unit = config && config.SoldierCfg && config.SoldierCfg[id];
  if (unit && (flag(unit.IsBoss) || flag(unit.Boss))) return true;
  var profiles = config && config.GameTools && config.GameTools.unitProfiles || {};
  var entry = profiles.entries && profiles.entries[id], form = profiles.bossForms && profiles.bossForms[id];
  return !!(unit && [unit.BehaviorTemplate, unit.CampaignBaseUnit, unit.ProfileBaseID].some(function (base) {
    return bossUnit(base, config, level, seen);
  }) || entry && bossUnit(entry.baseId, config, level, seen) || form && bossUnit(form.source, config, level, seen));
}
function waveHasBoss(wave, config, level) {
  if (!wave) return false;
  if (Array.isArray(wave.SpawnTimeline)) return wave.SpawnTimeline.some(function (row) {
    return row && row.count > 0 && bossUnit(row.unitId, config, level);
  });
  // Repeated legacy lane definitions replace the previous lane, as in gameplay.
  var lanes = {};
  (wave.RefreshSoldierKind || []).forEach(function (line) {
    var parts = String(line).split("#");
    if (parts.length > 1) lanes[parts[0]] = parts[1].split(";");
  });
  return Object.keys(lanes).some(function (lane) {
    return lanes[lane].some(function (entry) {
      var pair = entry.split(",");
      return Number(pair[1]) > 0 && bossUnit(pair[0], config, level);
    });
  });
}
function positive(value) { var n = Number(value); return isFinite(n) && n >= 1 ? Math.floor(n) : 1; }
function battle(data, config, forceBoss) {
  data = data || {};
  var level = data.levelCfg || {}, waves = level.WaveCfg || [], round = positive(data.round);
  if (waves.length && round === waves.length) return "final_wave_bgm";
  if (forceBoss || waveHasBoss(waves[round - 1], config, level)) return "boss_fight_bgm";
  var index = (positive(level.Level) + round - 2) % 3;
  return index ? "fight_bgm_" + (index + 1) : "fight_bgm";
}
exports.biome = biome;
exports.planning = function (level) { return PLANNING[biome(level)]; };
exports.bossUnit = bossUnit;
exports.waveHasBoss = waveHasBoss;
exports.battle = battle;
