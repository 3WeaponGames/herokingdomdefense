"use strict";

// Wall Defense's reward calculation is independent of rendering and skill data.
function needsPieces(config, owned) {
  if (!owned) return true;
  var remaining = 0;
  for (var level = Math.max(1, owned.level); level < config.levelInfo.length; level++) remaining += config.levelInfo[level - 1].PieceCost || 0;
  return owned.frame < remaining;
}

exports.createResult = function (run, config, treasures, inventory, random) {
  random = random || Math.random;
  var active = Math.max(0, Math.floor(run.activeMilliseconds));
  var cleared = Math.max(0, Math.floor(run.clearedWaves));
  var result = { version: 1, id: run.id, sequence: run.sequence, endReason: run.endReason,
    activeMilliseconds: active, clearedWaves: cleared,
    baseGold: Math.floor(active * config.goldPerMinute / 60000), crystals: Math.floor(active / (config.secondsPerCrystal * 1000)),
    rewards: [], drops: [] };
  result.rewards.push({ id: config.goldID, num: result.baseGold }, { id: config.crystalID, num: result.crystals });
  var owned = {};
  inventory.forEach(function (row) { owned[row.id] = { level: row.level, frame: row.frame }; });
  for (var wave = config.wavesPerItem; wave <= cleared; wave += config.wavesPerItem) {
    var band = config.rarityBands[config.rarityBands.length - 1];
    for (var i = 0; i < config.rarityBands.length; i++) if (wave <= config.rarityBands[i].throughWave) { band = config.rarityBands[i]; break; }
    // Weights run common -> legendary. Authored Relic qualities run in reverse:
    // 4 green, 3 blue, 2 purple, 1 orange. Keep the existing item IDs/qualities.
    var total = band.weights.reduce(function (sum, weight) { return sum + weight; }, 0), roll = random() * total, quality = 4;
    for (i = 0; i < band.weights.length; i++) { roll -= band.weights[i]; if (roll < 0) { quality = 4 - i; break; } }
    var tier = treasures.filter(function (item) { return item.Quality === quality; });
    var useful = tier.filter(function (item) { return needsPieces(item, owned[item.ID]); });
    // An exhausted tier retains its normal conversion, never a higher-rarity reroll.
    var pool = useful.length ? useful : tier;
    if (!pool.length) continue;
    var item = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))], row = owned[item.ID];
    result.drops.push({ wave: wave, quality: quality, itemID: item.ID, goodID: item.goodID });
    var reward = result.rewards.filter(function (entry) { return entry.id === item.goodID; })[0];
    if (reward) reward.num++; else result.rewards.push({ id: item.goodID, num: 1 });
    if (!row) owned[item.ID] = { level: 1, frame: 0 };
    else if (needsPieces(item, row)) row.frame++;
  }
  return result;
};

exports.validResult = function (result) {
  function count(value) { return Number.isInteger(value) && value >= 0; }
  return !!result && result.version === 1 && typeof result.id === "string" && result.id.length > 0 && result.id.length < 160 &&
    count(result.sequence) && result.sequence > 0 && typeof result.endReason === "string" &&
    count(result.activeMilliseconds) && count(result.clearedWaves) && count(result.baseGold) && count(result.crystals) &&
    Array.isArray(result.rewards) && result.rewards.length <= 1000 && result.rewards.every(function (reward) { return reward && count(reward.id) && reward.id > 0 && count(reward.num); }) &&
    Array.isArray(result.drops) && result.drops.length <= 1000 && result.drops.every(function (drop) {
      return drop && count(drop.wave) && drop.wave > 0 && drop.wave <= result.clearedWaves && count(drop.quality) && drop.quality >= 1 && drop.quality <= 4 && count(drop.itemID) && drop.itemID > 0 && count(drop.goodID) && drop.goodID > 0;
    });
};
