"use strict";

// New storefront prices live here. Authored legacy relic draws, progression,
// duplicate fragments and overflow conversion continue using their own config.
var GOLD = 2001, GEMS = 2002, ENERGY = 2033;
var RELIC_PRICES = { 1: 800, 2: 600, 3: 300, 4: 150 };
var REFRESH_COSTS = [0, 10, 20, 30, 40, 50, 75, 100, 125, 150];
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function positive(value) { return typeof value === "number" && isFinite(value) && Math.floor(value) === value && value > 0; }
function icon(bundle, path) { return { bundle: bundle, path: path }; }
function goodIcon(good) {
  return good.icon.indexOf("@icon/") === 0 ? icon("resources", good.icon.slice(6)) : icon("KinghtFallIconGood", good.icon);
}
function reward(id, num) { return { id: id, num: num }; }
function aggregate(rewards) {
  var result = [], lookup = Object.create(null);
  rewards.forEach(function (row) {
    if (!row || !positive(row.id) || !positive(row.num)) throw new Error("Invalid shop reward");
    if (lookup[row.id] === undefined) { lookup[row.id] = result.length; result.push(reward(row.id, row.num)); }
    else result[lookup[row.id]].num += row.num;
  });
  return result;
}
function random(rng) {
  var value = rng();
  if (typeof value !== "number" || !isFinite(value) || value < 0 || value >= 1) throw new Error("Invalid chest random source");
  return value;
}
function rollChest(offer, rng, onDraw) {
  if (!offer || !positive(offer.draws) || !Array.isArray(offer.rewards) || !Array.isArray(offer.guaranteedDraws) ||
      !offer.pools || !offer.rarityWeights || typeof offer.randomDraws !== "number" || !isFinite(offer.randomDraws) || offer.randomDraws < 0 || Math.floor(offer.randomDraws) !== offer.randomDraws) throw new Error("Invalid chest offer");
  var qualities = [4, 3, 2, 1], guaranteed = [], total = 0;
  qualities.forEach(function (quality) {
    var weight = offer.rarityWeights[quality];
    if (typeof weight !== "number" || !isFinite(weight) || weight < 0) throw new Error("Invalid chest rarity weights");
    total += weight;
  });
  offer.guaranteedDraws.forEach(function (row) {
    if (!row || qualities.indexOf(row.quality) < 0 || !positive(row.count)) throw new Error("Invalid guaranteed chest draws");
    for (var index = 0; index < row.count; index++) guaranteed.push(row.quality);
  });
  if (guaranteed.length + offer.randomDraws !== offer.draws || Math.abs(total - 100) > .000001) throw new Error("Invalid chest draw totals");
  qualities.forEach(function (quality) {
    if (offer.rarityWeights[quality] <= 0 && guaranteed.indexOf(quality) < 0) return;
    var pool = offer.pools[quality];
    if (!Array.isArray(pool) || !pool.length || !pool.every(function (row) { return row && positive(row.relicId) && positive(row.goodId) && row.quality === quality; })) throw new Error("Invalid chest rarity pool");
  });
  rng = rng || Math.random;
  if (typeof rng !== "function") throw new Error("Invalid chest random source");
  if (onDraw !== undefined && typeof onDraw !== "function") throw new Error("Invalid chest draw handler");
  var result = clone(offer.rewards);
  for (var draw = 0; draw < offer.draws; draw++) {
    var quality = guaranteed[draw];
    if (quality === undefined) {
      var selected = random(rng) * total;
      for (var at = 0; at < qualities.length; at++) {
        selected -= offer.rarityWeights[qualities[at]];
        if (selected < 0) { quality = qualities[at]; break; }
      }
    }
    var pool = offer.pools[quality], entry = pool[Math.floor(random(rng) * pool.length)];
    result.push(reward(entry.goodId, 1));
    // Complete the base grant and its Rune bonus before choosing another draw.
    if (onDraw) onDraw(entry, draw);
  }
  return aggregate(result);
}
function create(dataMgr) {
  if (!dataMgr || typeof dataMgr.getTreasureCfg !== "function" || typeof dataMgr.getGoodsCfgById !== "function") throw new Error("Shop needs authored game data");
  var authored = dataMgr.getTreasureCfg(), relics = [], relicById = Object.create(null);
  if (!Array.isArray(authored)) throw new Error("Invalid authored relic catalog");
  [GOLD, GEMS, ENERGY].forEach(function (id) {
    var good = dataMgr.getGoodsCfgById(id);
    if (!good || good.type !== 1) throw new Error("Missing shop currency " + id);
  });
  authored.forEach(function (entry) {
    var good = entry && dataMgr.getGoodsCfgById(entry.goodID);
    if (!entry || !positive(entry.ID) || [1, 2, 3, 4].indexOf(entry.Quality) < 0 || !Array.isArray(entry.levelInfo) || !entry.levelInfo.length ||
        !good || good.type !== 2 || good.itemID !== entry.ID || typeof good.icon !== "string" || !good.icon) return;
    if (relicById[entry.ID]) throw new Error("Duplicate authored relic " + entry.ID);
    // Relic qualities are historical: 1 orange, 2 purple, 3 blue, 4 green.
    var cost = reward(GEMS, RELIC_PRICES[entry.Quality]);
    var row = { relicId: entry.ID, goodId: entry.goodID, quality: entry.Quality, cost: cost, rewards: [reward(entry.goodID, 1)],
      nameKey: good.name, fallbackName: "Relic " + entry.ID, icon: goodIcon(good) };
    relics.push(row); relicById[row.relicId] = row;
  });
  relics.sort(function (a, b) { return a.relicId - b.relicId; });
  function good(id) {
    var value = dataMgr.getGoodsCfgById(id);
    if (!value || [1, 2].indexOf(value.type) < 0 || value.type === 2 && !relicById[value.itemID]) throw new Error("Missing shop reward " + id);
    return value;
  }
  var chestById = Object.create(null);
  function offer(id, title, image, cost, contents, highlights) {
    contents.forEach(function (row) {
      if (!row || !positive(row.num)) throw new Error("Invalid shop offer reward");
      if (row.chestId) { if (!chestById[row.chestId]) throw new Error("Missing shop chest " + row.chestId); }
      else good(row.id);
    });
    return { id: id, nameKey: "shop.offer." + id, fallbackName: title, icon: image, cost: cost, rewards: contents, highlights: highlights };
  }
  function paid(value, productId, priceMinor) {
    value.payment = { productId: productId, currency: "USD", priceMinor: priceMinor }; return value;
  }
  function chest(id, title, imagePath, price, gold, energy, draws, floors, odds) {
    var pools = {}, weights = { 4: odds[0], 3: odds[1], 2: odds[2], 1: odds[3] }, guaranteedDraws = floors.map(function (row) { return { quality: row[0], count: row[1] }; });
    var floorCount = guaranteedDraws.reduce(function (sum, row) { return sum + row.count; }, 0), pool = [];
    [4, 3, 2, 1].forEach(function (quality) {
      var count = guaranteedDraws.filter(function (row) { return row.quality === quality; }).reduce(function (sum, row) { return sum + row.count; }, 0);
      pools[quality] = relics.filter(function (row) { return row.quality === quality; }).map(function (row) { return { relicId: row.relicId, goodId: row.goodId, quality: quality }; });
      if (weights[quality] <= 0 && !count) return;
      if (!pools[quality].length) throw new Error("Missing authored chest rarity " + quality);
      pools[quality].forEach(function (entry) { pool.push({ relicId: entry.relicId, goodId: entry.goodId, quality: quality, weight: weights[quality] / 100 / pools[quality].length }); });
    });
    var fixed = [reward(GOLD, gold), reward(ENERGY, energy)];
    var top = pool.slice().sort(function (a, b) { return a.quality - b.quality || a.relicId - b.relicId; }).slice(0, 2);
    if (top.length < 2) throw new Error("Chest needs at least two authored relics");
    var value = offer(id, title, icon("resources", imagePath), reward(GEMS, price), fixed, top.map(function (entry) { return reward(entry.goodId, 1); }));
    value.draws = draws; value.guaranteedDraws = guaranteedDraws; value.randomDraws = draws - floorCount;
    value.pools = pools; value.rarityWeights = weights; value.relicPool = pool;
    value.possibleRewards = fixed.map(function (row) { return { id: row.id, num: row.num, guaranteed: true, chance: 1 }; }).concat(pool.map(function (row) {
      var guaranteedCount = guaranteedDraws.filter(function (floor) { return floor.quality === row.quality; }).reduce(function (sum, floor) { return sum + floor.count; }, 0);
      return { id: row.goodId, num: 1, relicId: row.relicId, quality: row.quality, guaranteed: false, perDraw: true, draws: value.randomDraws,
        weight: row.weight, totalWeight: 1, chance: row.weight, guaranteedDraws: guaranteedCount, guaranteedChance: guaranteedCount ? 1 / pools[row.quality].length : 0 };
    }));
    chestById[id] = value;
    return value;
  }
  var chests = [
    chest("wooden-chest", "Wooden Chest", "icons/2d-minimal/Items/Item_Chest_01_Wood", 75, 500, 1, 2, [], [90, 10, 0, 0]),
    chest("iron-chest", "Iron Chest", "icons/2d-minimal/Items/Item_Chest_02_01", 150, 1500, 2, 2, [[3, 1]], [70, 25, 5, 0]),
    chest("silver-chest", "Silver Chest", "icons/2d-minimal/Items/Item_Chest_02_02", 225, 3000, 3, 3, [[3, 1]], [50, 40, 9, 1]),
    chest("knight-chest", "Knight Chest", "icons/2d-minimal/Items/Item_Chest_03_01", 375, 6000, 5, 3, [[2, 1]], [30, 50, 18, 2]),
    chest("royal-chest", "Royal Chest", "icons/2d-minimal/Items/Item_Chest_03_02", 650, 14000, 8, 4, [[2, 1]], [15, 45, 35, 5]),
    chest("epic-chest", "Epic Chest", "icons/2d-minimal/Items/Item_Chest_04_Purple", 1300, 35000, 18, 4, [[2, 2]], [0, 40, 50, 10]),
    chest("legendary-chest", "Legendary Chest", "icons/2d-minimal/Items/Item_Chest_04_Red", 2100, 60000, 30, 5, [[1, 1]], [0, 20, 75, 5]),
    chest("crown-chest", "Crown Chest", "icons/GUI-Pro/Icons/Icon_Chest", 3300, 100000, 48, 6, [[1, 1]], [0, 0, 90, 10])
  ];
  function fixedRelic(id) {
    var relic = relicById[id]; if (!relic) throw new Error("Missing fixed bundle relic " + id); return reward(relic.goodId, 1);
  }
  function bundle(id, title, image, priceMinor, fixedIds, chestId, chestCount, gems, gold, energy) {
    var fixed = fixedIds.map(fixedRelic), token = { chestId: chestId, num: chestCount }, gemReward = reward(GEMS, gems);
    var value = offer(id, title, image, null, fixed.concat([token, gemReward, reward(GOLD, gold), reward(ENERGY, energy)]), [clone(fixed[0]), clone(token), clone(gemReward)]);
    value.heroIcon = image; value.purchaseLimit = 2;
    return paid(value, "hkd.bundle." + id, priceMinor);
  }
  var bundles = [
    bundle("archer-starter", "Archer Starter", icon("resources", "icons/2d-minimal/Equipment/Gear_Bow_01"), 199, [120016, 120017], "wooden-chest", 1, 50, 5000, 2),
    bundle("guard-kit", "Guard Kit", icon("resources", "icons/GUI-Pro/Icons/Icon_Shield"), 499, [120011, 120007], "iron-chest", 1, 250, 10000, 3),
    bundle("royal-archer", "Royal Archer", icon("resources", "icons/2d-minimal-hero-equipment/Weapons/Weapon_RecurveBowSteel"), 999, [120005, 120015, 120016], "silver-chest", 2, 500, 25000, 5),
    bundle("kings-war-chest", "King's War Chest", icon("resources", "icons/GUI-Pro/Icons/Icon_Chest"), 1999, [120001, 120006, 120008], "knight-chest", 3, 1200, 60000, 8),
    bundle("crown-treasury", "Crown Treasury", icon("resources", "icons/GUI-Pro/Icons/Icon_Crown"), 4999, [120002, 120005, 120006], "epic-chest", 3, 3500, 200000, 16)
  ];
  function gemPack(quantity, priceMinor) {
    var contents = [reward(GEMS, quantity)], value = offer("gems-" + quantity, quantity.toLocaleString() + " Gems", goodIcon(good(GEMS)), null, contents, clone(contents));
    value.firstPurchaseDouble = true; return paid(value, "hkd.gems." + quantity, priceMinor);
  }
  // Premium Gems have no repeatable Gold exchange. These offers declare store
  // product metadata only; successful verified fulfillment belongs to runtime.
  var resources = [
    offer("gold-pouch", "Gold Pouch", goodIcon(good(GOLD)), reward(GEMS, 50), [reward(GOLD, 5000)], [reward(GOLD, 5000)]),
    offer("gold-cart", "Gold Cart", goodIcon(good(GOLD)), reward(GEMS, 150), [reward(GOLD, 15000)], [reward(GOLD, 15000)]),
    offer("gold-vault", "Gold Vault", goodIcon(good(GOLD)), reward(GEMS, 500), [reward(GOLD, 50000)], [reward(GOLD, 50000)]),
    offer("gold-treasury", "Gold Treasury", goodIcon(good(GOLD)), reward(GEMS, 1000), [reward(GOLD, 100000)], [reward(GOLD, 100000)]),
    offer("energy-flask", "Energy Flask", goodIcon(good(ENERGY)), reward(GEMS, 50), [reward(ENERGY, 1)], [reward(ENERGY, 1)]),
    offer("energy-crate", "Energy Crate", goodIcon(good(ENERGY)), reward(GEMS, 135), [reward(ENERGY, 3)], [reward(ENERGY, 3)]),
    offer("energy-case", "Energy Case", goodIcon(good(ENERGY)), reward(GEMS, 250), [reward(ENERGY, 6)], [reward(ENERGY, 6)]),
    offer("energy-vault", "Energy Vault", goodIcon(good(ENERGY)), reward(GEMS, 450), [reward(ENERGY, 12)], [reward(ENERGY, 12)]),
    gemPack(100, 99), gemPack(550, 499), gemPack(1200, 999), gemPack(2600, 1999), gemPack(7000, 4999), gemPack(15000, 9999)
  ];
  var catalog = { version: 1, dailyDeal: offer("daily-supplies", "Daily Deal", icon("resources", "icons/GUI-Pro/Icons/Icon_Gift"), null, [reward(GOLD, 500)], [reward(GOLD, 500)]),
    bundles: bundles, chests: chests, chestById: chestById, resources: resources, relics: relics, relicById: relicById, refreshCosts: REFRESH_COSTS.slice() };
  return catalog;
}

exports.create = create;
exports.rollChest = rollChest;
exports.aggregate = aggregate;
