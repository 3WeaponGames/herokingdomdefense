'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Catalog = require('../../assets/_script/ShopCatalog'), Core = require('../../assets/_script/ShopCore');
const root = path.resolve(__dirname, '../..'), config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const data = cfg => ({ getTreasureCfg: () => cfg.TreasureCfg, getGoodsCfgById: id => cfg.GoodsCfg[id] });
const catalog = Catalog.create(data(config)), copy = value => JSON.parse(JSON.stringify(value));
const qualities = [4, 3, 2, 1];
const chestPlan = [
  ['wooden-chest', 75, 500, 1, 2, [], [90, 10, 0, 0]],
  ['iron-chest', 150, 1500, 2, 2, [[3, 1]], [70, 25, 5, 0]],
  ['silver-chest', 225, 3000, 3, 3, [[3, 1]], [50, 40, 9, 1]],
  ['knight-chest', 375, 6000, 5, 3, [[2, 1]], [30, 50, 18, 2]],
  ['royal-chest', 650, 14000, 8, 4, [[2, 1]], [15, 45, 35, 5]],
  ['epic-chest', 1300, 35000, 18, 4, [[2, 2]], [0, 40, 50, 10]],
  ['legendary-chest', 2100, 60000, 30, 5, [[1, 1]], [0, 20, 75, 5]],
  ['crown-chest', 3300, 100000, 48, 6, [[1, 1]], [0, 0, 90, 10]]
];
const bundlePlan = [
  ['archer-starter', 199, [120016, 120017], 'wooden-chest', 1, 50, 5000, 2],
  ['guard-kit', 499, [120011, 120007], 'iron-chest', 1, 250, 10000, 3],
  ['royal-archer', 999, [120005, 120015, 120016], 'silver-chest', 2, 500, 25000, 5],
  ['kings-war-chest', 1999, [120001, 120006, 120008], 'knight-chest', 3, 1200, 60000, 8],
  ['crown-treasury', 4999, [120002, 120005, 120006], 'epic-chest', 3, 3500, 200000, 16]
];

test('expanded catalog construction is synchronous and read-only, preserving daily stock and legacy economy', () => {
  const before = JSON.stringify(config), first = Catalog.create(data(config)), second = Catalog.create(data(config));
  assert.deepEqual(first, second); assert.equal(JSON.stringify(config), before);
  assert.equal(first.relics.length, config.TreasureCfg.length); assert.equal(first.bundles.length, 5); assert.equal(first.chests.length, 8); assert.equal(first.resources.length, 14);
  assert.deepEqual(first.dailyDeal.rewards, [{ id: 2001, num: 500 }]); assert.equal(first.dailyDeal.cost, null); assert.equal(first.dailyDeal.payment, undefined);
  assert.deepEqual(first.refreshCosts, [0, 10, 20, 30, 40, 50, 75, 100, 125, 150]); assert.deepEqual(first.refreshCosts, Core.refreshCosts);
  for (const relic of first.relics) {
    const authored = config.TreasureCfg.find(r => r.ID === relic.relicId); assert.equal(first.relicById[relic.relicId], relic);
    assert.equal(config.GoodsCfg[relic.goodId].itemID, authored.ID); assert.equal(relic.quality, authored.Quality);
    assert.deepEqual(relic.cost, authored.Quality === 4 ? { id: 2001, num: 1000 } : { id: 2002, num: authored.Quality === 1 ? 200 : authored.Quality === 2 ? 100 : 50 });
  }
  const context = { exports: {}, Math: Object.assign(Object.create(Math), { random() { throw Error('catalog browsing rolled a reward'); } }) };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/ShopCatalog.js'), 'utf8'), context);
  assert.equal(context.exports.create(data(config)).chests.length, 8);
});

test('all product images and every actual goods/chest-token reward exist; Energy always remains stored inventory', () => {
  const offers = [catalog.dailyDeal, ...catalog.bundles, ...catalog.chests, ...catalog.resources], ids = new Set();
  function image(ref) {
    assert(ref && ref.bundle && ref.path); const base = ref.bundle === 'resources' ? 'assets/resources' : 'assets/' + ref.bundle;
    assert(fs.existsSync(path.join(root, base, ref.path + '.png')), JSON.stringify(ref));
  }
  for (const offer of offers) {
    assert(!ids.has(offer.id)); ids.add(offer.id); assert(offer.nameKey && offer.fallbackName); image(offer.icon);
    for (const reward of [...offer.rewards, ...offer.highlights, ...(offer.possibleRewards || [])]) {
      assert(Number.isInteger(reward.num) && reward.num > 0);
      if (reward.chestId) { assert(catalog.chestById[reward.chestId]); assert.equal(reward.id, undefined); }
      else { assert(config.GoodsCfg[reward.id]); assert.notEqual(reward.id, 2005, 'catalog never grants immediate Energy'); }
    }
    if (offer.heroIcon) image(offer.heroIcon);
  }
  catalog.relics.forEach(row => image(row.icon)); assert.equal(config.GoodsCfg[2033].enumKey, 'EnergyItem');
});

test('five paid bundles retain exact fixed relics, unopened chest tokens and all supplies with three honest highlights', () => {
  assert.deepEqual(catalog.bundles.map(o => o.id), bundlePlan.map(row => row[0]));
  for (const [id, price, relicIds, chestId, chestCount, gems, gold, energy] of bundlePlan) {
    const offer = catalog.bundles.find(row => row.id === id), fixed = relicIds.map(id => ({ id: catalog.relicById[id].goodId, num: 1 }));
    assert.equal(offer.cost, null); assert.deepEqual(offer.payment, { productId: 'hkd.bundle.' + id, currency: 'USD', priceMinor: price });
    assert.equal(offer.purchaseLimit, 2); assert.equal(offer.firstPurchaseDouble, undefined);
    assert.deepEqual(offer.rewards, [...fixed, { chestId, num: chestCount }, { id: 2002, num: gems }, { id: 2001, num: gold }, { id: 2033, num: energy }]);
    assert.deepEqual(offer.highlights, [fixed[0], { chestId, num: chestCount }, { id: 2002, num: gems }]);
    assert(offer.rewards.length > offer.highlights.length); assert.equal(offer.highlights.length, 3);
    assert(offer.rewards.filter(r => r.id && config.GoodsCfg[r.id].type === 2).every(r => r.num === 1));
  }
});

test('four Gold packs, four banked Energy packs and six paid Gem packs use the approved quantities with no Gold-to-Gem exchange', () => {
  const gold = catalog.resources.filter(o => o.rewards[0].id === 2001), energy = catalog.resources.filter(o => o.rewards[0].id === 2033), gems = catalog.resources.filter(o => o.rewards[0].id === 2002);
  assert.deepEqual(gold.map(o => [o.cost.id, o.cost.num, o.rewards[0].num]), [[2002, 50, 5000], [2002, 150, 15000], [2002, 500, 50000], [2002, 1000, 100000]]);
  assert.deepEqual(energy.map(o => [o.cost.id, o.cost.num, o.rewards[0].num]), [[2002, 50, 1], [2002, 135, 3], [2002, 250, 6], [2002, 450, 12]]);
  const amounts = [100, 550, 1200, 2600, 7000, 15000], prices = [99, 499, 999, 1999, 4999, 9999];
  assert.equal(gems.length, 6); const products = new Set(catalog.bundles.map(o => o.payment.productId));
  gems.forEach((offer, index) => {
    assert.equal(offer.id, 'gems-' + amounts[index]); assert.equal(offer.cost, null); assert.equal(offer.firstPurchaseDouble, true);
    assert.deepEqual(offer.payment, { productId: 'hkd.gems.' + amounts[index], currency: 'USD', priceMinor: prices[index] });
    assert(!products.has(offer.payment.productId)); products.add(offer.payment.productId); assert.equal(offer.purchaseLimit, undefined);
    assert.deepEqual(offer.rewards, [{ id: 2002, num: amounts[index] }]);
  });
  assert.deepEqual(gems.map(o => o.rewards[0].num * 2), [200, 1100, 2400, 5200, 14000, 30000]);
  assert(catalog.resources.every(o => o.payment || o.cost.id === 2002));
});

test('eight chest prices, fixed supplies, included rarity guarantees and remaining odds exactly match the approved table', () => {
  assert.deepEqual(catalog.chests.map(c => c.id), chestPlan.map(row => row[0]));
  for (const [id, price, gold, energy, draws, floors, odds] of chestPlan) {
    const chest = catalog.chestById[id]; assert.equal(chest, catalog.chests.find(c => c.id === id));
    assert.deepEqual(chest.cost, { id: 2002, num: price }); assert.equal(chest.payment, undefined);
    assert.deepEqual(chest.rewards, [{ id: 2001, num: gold }, { id: 2033, num: energy }]);
    assert.equal(chest.draws, draws); assert.deepEqual(chest.guaranteedDraws, floors.map(([quality, count]) => ({ quality, count })));
    assert.equal(chest.randomDraws, draws - floors.reduce((sum, row) => sum + row[1], 0));
    assert.deepEqual(qualities.map(q => chest.rarityWeights[q]), odds); assert.equal(odds.reduce((a, b) => a + b), 100);
    const top = chest.relicPool.slice().sort((a, b) => a.quality - b.quality || a.relicId - b.relicId).slice(0, 2);
    assert.deepEqual(chest.highlights, top.map(row => ({ id: row.goodId, num: 1 }))); assert.equal(chest.highlights.length, 2);
    const possible = chest.possibleRewards.filter(r => !r.guaranteed); assert(Math.abs(possible.reduce((n, row) => n + row.chance, 0) - 1) < 1e-12);
    for (const quality of qualities) {
      const pool = chest.pools[quality], authored = catalog.relics.filter(r => r.quality === quality);
      assert.deepEqual(pool.map(r => r.relicId), authored.map(r => r.relicId));
      const expectedFloor = floors.filter(row => row[0] === quality).reduce((n, row) => n + row[1], 0);
      for (const row of possible.filter(r => r.quality === quality)) {
        assert.equal(row.chance, chest.rarityWeights[quality] / 100 / pool.length); assert.equal(row.draws, chest.randomDraws); assert(row.perDraw);
        assert.equal(row.guaranteedDraws, expectedFloor); assert.equal(row.guaranteedChance, expectedFloor ? 1 / pool.length : 0);
      }
    }
  }
});

test('quality selection is independent of population size, and every ID within a selected rarity is uniform', () => {
  for (const chest of catalog.chests) {
    let cumulative = 0;
    for (const quality of qualities) {
      const probability = chest.rarityWeights[quality]; if (!probability) continue;
      const samples = [(cumulative + probability / 2) / 100, (cumulative + 1e-7) / 100, (cumulative + probability - 1e-7) / 100], pool = chest.pools[quality]; cumulative += probability;
      for (const sample of samples) for (let index = 0; index < pool.length; index++) {
        const queue = [sample, (index + .5) / pool.length], one = { ...chest, draws: 1, guaranteedDraws: [], randomDraws: 1 };
        const rewards = Catalog.rollChest(one, () => queue.shift());
        assert.equal(rewards.find(r => r.id === pool[index].goodId).num, 1); assert.equal(queue.length, 0);
      }
    }
  }
});

test('guaranteed slots are included in the draw total and callbacks interleave before the next base roll', () => {
  const before = JSON.stringify(catalog);
  for (const chest of catalog.chests) {
    const selected = [], trace = []; let calls = 0;
    const rewards = Catalog.rollChest(chest, () => { trace.push('rng'); calls++; return .3; }, (entry, index) => { trace.push('base:' + index); selected.push(entry); });
    const guaranteed = chest.guaranteedDraws.flatMap(row => Array(row.count).fill(row.quality));
    assert.deepEqual(selected.slice(0, guaranteed.length).map(r => r.quality), guaranteed);
    assert.equal(selected.length, chest.draws); assert.equal(calls, guaranteed.length + 2 * chest.randomDraws);
    assert.equal(rewards.filter(r => config.GoodsCfg[r.id].type === 2).reduce((n, r) => n + r.num, 0), chest.draws);
    let cursor = 0;
    for (let i = 0; i < chest.draws; i++) {
      assert.equal(trace[cursor++], 'rng'); if (i >= guaranteed.length) assert.equal(trace[cursor++], 'rng'); assert.equal(trace[cursor++], 'base:' + i);
    }
    assert(rewards.every(r => r.id !== 2005));
  }
  const chest = catalog.chestById['iron-chest'], trace = [];
  Catalog.rollChest(chest, () => { trace.push('rng'); return .2; }, (_entry, index) => { trace.push('base:' + index); trace.push('rune:' + index); });
  assert.deepEqual(trace, ['rng', 'base:0', 'rune:0', 'rng', 'rng', 'base:1', 'rune:1']);
  assert.equal(JSON.stringify(catalog), before);
});

test('malformed chest odds, totals, rarity pools and random values fail without changing catalog rewards', () => {
  const chest = catalog.chestById['crown-chest'];
  for (const mutate of [c => c.rarityWeights[1] = 99, c => c.guaranteedDraws[0].count = 20, c => c.randomDraws = -1, c => c.pools[1] = [], c => c.pools[1][0].quality = 3]) {
    const bad = copy(chest); mutate(bad); const before = JSON.stringify(bad); assert.throws(() => Catalog.rollChest(bad, () => .2), /Invalid/); assert.equal(JSON.stringify(bad), before);
  }
  for (const value of [1, -1, NaN, Infinity, '0']) assert.throws(() => Catalog.rollChest(chest, () => value), /random source/);
  assert.throws(() => Catalog.rollChest(chest, () => .2, true), /draw handler/);
  assert.throws(() => Catalog.aggregate([{ chestId: 'wooden-chest', num: 1 }]), /reward/);
  assert.deepEqual(Catalog.aggregate([{ id: 2033, num: 1 }, { id: 2033, num: 3 }]), [{ id: 2033, num: 4 }]);
});

test('premium currency has no repeatable exchange source, and worst Rune overflow stays below equivalent Gold purchases', () => {
  const inGame = [...catalog.chests, ...catalog.resources, ...catalog.relics].filter(o => o.cost);
  assert(inGame.every(o => o.rewards.every(r => r.id !== 2002 && !r.chestId)), 'only paid store grants can contain Gems');
  const goldPerGem = 100;
  assert(catalog.resources.filter(o => o.rewards[0].id === 2001).every(o => o.rewards[0].num / o.cost.num === goldPerGem));
  for (const chest of catalog.chests) {
    const largestRefund = Math.max(...chest.relicPool.map(row => config.TreasureCfg.find(t => t.ID === row.relicId).Conversion[1]));
    const worstGold = chest.rewards.find(r => r.id === 2001).num + chest.draws * 2 * largestRefund;
    assert(worstGold < chest.cost.num * goldPerGem, chest.id);
  }
  // A sticker comparison, not a claim that progression or paid packs are balanced.
  const nominal = { 4: 10, 3: 50, 2: 100, 1: 200 }, comparison = catalog.chests.map(chest => {
    const fixed = chest.rewards.find(r => r.id === 2001).num / 100 + chest.rewards.find(r => r.id === 2033).num * 37.5;
    const floors = chest.guaranteedDraws.reduce((n, row) => n + row.count * nominal[row.quality], 0);
    const random = qualities.reduce((n, q) => n + chest.rarityWeights[q] / 100 * nominal[q], 0) * chest.randomDraws;
    return fixed + floors + random;
  });
  assert.deepEqual(comparison.map(n => Math.round(n * 100) / 100), [70.5, 164.5, 264.5, 447.5, 747, 1405, 2305, 3550]);
});

test('catalog and stock load without Cocos, player state or platform services across existing configuration variants', () => {
  for (const name of ['ShopCore', 'ShopCatalog']) {
    const context = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), context);
    assert.equal(typeof context.exports[name === 'ShopCore' ? 'createState' : 'create'], 'function');
  }
  for (const variant of ['KinghtFallConfig', 'KinghtFallConfigB', 'KinghtFallConfigD']) {
    const cfg = Object.assign({}, config, JSON.parse(fs.readFileSync(path.join(root, 'assets', variant, 'GameJsonCfg.json')))), built = Catalog.create(data(cfg));
    Core.validate(Core.createState(built, new Date(2026, 10, 8).getTime(), () => .3), built);
  }
});
