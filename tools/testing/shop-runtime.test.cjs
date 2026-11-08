'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { harness, config, clone } = require('./persistence-harness.cjs');

const DAY = new Date(2026, 10, 8, 12).getTime();
function fixture(saved, timestamp = DAY) {
  const h = harness(saved);
  let time = timestamp, seed = 67531, randomCalls = 0, randomOverride = null;
  const manager = { ...h.modules.KinghtFallDataMgr.KinghtFallDataMgr.getInstance(), getTreasureCfg: () => config.TreasureCfg };
  const service = h.load('ShopRuntime').create(h.player, manager, {
    now: () => time,
    rng() { randomCalls++; if (randomOverride) return randomOverride(); seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  });
  if (!saved) {
    Object.assign(h.player.udata.data, { goldNum: 1000000, diamondNum: 100000, powerNum: 30 });
    h.player.missionData.initData();
    h.player.rewardRecords().forEach(record => record.saveData());
  }
  h.state.writes = 0;
  return Object.assign(h, { service, manager, advance: amount => { time += amount; }, setTime: value => { time = value; }, setRandom: value => { randomOverride = value; }, randomCalls: () => randomCalls });
}
function ready(f) {
  const view = f.service.getView();
  assert.equal(view.ready, true, view.error);
  return view;
}
function account(f) {
  const result = clone(f.player.udata.data);
  delete result.sft; delete result.rewardTransaction;
  return result;
}
function initialized() {
  const f = fixture(); ready(f); f.state.writes = 0;
  return f;
}
function buy(f, kind, id) {
  const view = ready(f);
  return f.service.purchase(kind, id || view[kind][0].id, view.token);
}

test('first visit persists twelve slots; ordinary reads and reopening perform no writes or random rolls', () => {
  const f = fixture(), view = ready(f), written = f.state.writes, calls = f.randomCalls();
  assert(written > 0);
  assert.deepEqual([1, 3, 4].map(quality => view.relics.filter(row => row.quality === quality).length), [2, 4, 6]);
  assert.equal(new Set(view.relics.map(row => row.relicId)).size, 12);
  assert.deepEqual(clone(view.refresh.cost), { currency: 2002, amount: 0 });
  for (let index = 0; index < 20; index++) assert.equal(ready(f).token, view.token);
  assert.equal(f.state.writes, written); assert.equal(f.randomCalls(), calls);
  const reopened = fixture(f.persist());
  assert.deepEqual(clone(ready(reopened).relics), clone(view.relics));
  assert.equal(reopened.state.writes, 0); assert.equal(reopened.randomCalls(), 0);
});

test('unpersisted initial stock is unavailable and retries without overwriting account progress', () => {
  const f = fixture(); f.state.failKeys.add(f.player.rewardJournalKey());
  const view = f.service.getView(); assert.equal(view.ready, false); assert.equal(view.code, 'save');
  assert.equal(f.player.udata.data.shopState, undefined); assert.equal(f.player.udata.getGoldNum(), 1000000);
  assert.equal(f.service.claimDaily(view.token).ok, false);
  f.state.failKeys.clear(); assert.equal(ready(f).relics.length, 12);
});

test('first-open stock publication recovers the exact rolled stock at every durable write boundary', () => {
  const baseline = fixture(); ready(baseline); const expected = account(baseline), boundaries = baseline.state.writes;
  for (let boundary = 1; boundary <= boundaries; boundary++) {
    const f = fixture(); f.state.crashAt = boundary;
    assert.throws(() => f.service.getView(), /process interruption/);
    const reloaded = fixture(f.persist()); ready(reloaded);
    assert.deepEqual(account(reloaded), expected, 'initial stock boundary ' + boundary);
    assert.equal(reloaded.randomCalls(), 0, 'journal recovery never generates replacement stock');
  }
});

test('the shared daily reward is claimable once and stale callbacks cannot claim or pay again', () => {
  const f = initialized(), view = ready(f);
  const result = f.service.claimDaily(view.token); assert.equal(result.ok, true);
  assert.deepEqual(clone(result.rewards).map(row => ({ id: row.id, num: row.num })), [{ id: 2001, num: 500 }]);
  assert.equal(f.player.udata.getGoldNum(), 1000500); assert.equal(ready(f).dailyDeal.claimed, true);
  const writes = f.state.writes;
  assert.equal(f.service.claimDaily(view.token).code, 'stale');
  assert.equal(f.service.claimDaily(ready(f).token).code, 'claimed');
  assert.equal(f.service.purchase('resources', view.resources[0].id, view.token).code, 'stale');
  assert.equal(f.state.writes, writes); assert.equal(f.player.udata.getGoldNum(), 1000500);
});

test('buying all twelve relics preserves sold slots until refresh, then makes all slots purchasable again', () => {
  const f = initialized(), stock = clone(f.player.udata.data.shopState.slots);
  const totals = rows => rows.reduce((sum, row) => { sum[row.cost.currency] = (sum[row.cost.currency] || 0) + row.cost.amount; return sum; }, { 2001: 0, 2002: 0 });
  const firstCost = totals(ready(f).relics);
  assert.deepEqual(firstCost, { 2001: 0, 2002: 3700 }, 'two Legendary, four Rare and six Common slots use the approved Gem prices');
  for (const row of stock) assert.equal(buy(f, 'relics', row.slotId).ok, true);
  assert(ready(f).relics.every(row => row.soldOut && !row.available));
  assert.deepEqual(clone(f.player.udata.data.shopState.slots).map(row => row.relicId), stock.map(row => row.relicId));
  assert.equal(f.player.udata.data.shopState.generation, 1);
  const soldView = ready(f); assert.equal(f.service.purchase('relics', stock[0].slotId, soldView.token).code, 'soldout');
  assert.equal(f.player.udata.getGoldNum(), 1000000 - firstCost[2001]); assert.equal(f.player.udata.getDiamondNum(), 100000 - firstCost[2002]);
  assert.equal(f.service.refreshRelics(soldView.token).ok, true);
  assert(ready(f).relics.every(row => !row.soldOut && row.available));
  f.player.udata.data.shopState.slots.forEach((row, index) => assert.notEqual(row.relicId, stock[index].relicId));
  const secondOffers = ready(f).relics, secondCost = totals(secondOffers);
  for (const row of secondOffers) assert.equal(buy(f, 'relics', row.id).ok, true);
  assert.equal(f.player.udata.getGoldNum(), 1000000 - firstCost[2001] - secondCost[2001]); assert.equal(f.player.udata.getDiamondNum(), 100000 - firstCost[2002] - secondCost[2002]);
});

test('manual refresh has one free use, escalating paid costs and a ten-use cap; old refresh buttons cannot charge', () => {
  const f = initialized(), costs = [0, 10, 20, 30, 40, 50, 75, 100, 125, 150];
  for (let index = 0; index < costs.length; index++) {
    const view = ready(f), before = f.player.udata.getDiamondNum();
    assert.equal(view.refresh.cost.currency, 2002); assert.equal(view.refresh.cost.amount, costs[index]);
    assert.equal(view.refresh.used, index); assert.equal(f.service.refreshRelics(view.token).ok, true);
    assert.equal(f.player.udata.getDiamondNum(), before - costs[index]);
    assert.equal(f.service.refreshRelics(view.token).code, 'stale');
    assert.equal(f.player.udata.getDiamondNum(), before - costs[index]);
  }
  const exhausted = ready(f), writes = f.state.writes;
  assert.equal(exhausted.refresh.used, 10); assert.equal(exhausted.refresh.remaining, 0); assert.equal(exhausted.refresh.enabled, false);
  assert.equal(f.service.refreshRelics(exhausted.token).code, 'refreshlimit');
  assert.equal(f.player.udata.getDiamondNum(), 99400); assert.equal(f.state.writes, writes);
});

test('insufficient currency, unknown offers and stale sold-slot buttons do not grant, roll or debit', () => {
  const f = initialized(); Object.assign(f.player.udata.data, { goldNum: 0, diamondNum: 0 }); f.player.udata.saveData();
  const view = ready(f), before = account(f), calls = f.randomCalls(), writes = f.state.writes;
  assert.equal(f.service.purchase('resources', view.resources[0].id, view.token).code, 'insufficientGems');
  const common = view.relics.find(row => row.quality === 4);
  assert.equal(f.service.purchase('relics', common.id, view.token).code, common.cost.currency === 2001 ? 'insufficientGold' : 'insufficientGems');
  assert.equal(f.service.purchase('relics', 'missing', view.token).code, 'unavailable');
  assert.equal(f.service.purchase('__proto__', 'missing', view.token).code, 'unavailable');
  assert.deepEqual(account(f), before); assert.equal(f.randomCalls(), calls); assert.equal(f.state.writes, writes);
  assert.equal(f.service.refreshRelics(view.token).ok, true, 'first refresh is free even with zero gems');
  const afterFree = ready(f); assert.equal(f.service.refreshRelics(afterFree.token).code, 'insufficientGems');
});

test('views expose full bundle contents, two chest highlights, random-only odds and usable relic icons/rewards', () => {
  const f = initialized(), view = ready(f);
  assert(view.bundles.every(row => row.rewards.length > row.highlights.length && row.highlights.length === 3));
  assert(view.chests.every(row => row.highlights.length === 2 && row.draws === row.randomDraws + row.guaranteedDraws.reduce((sum, item) => sum + item.count, 0)));
  for (const chest of view.chests) {
    assert(chest.possibleRewards.length > 2);
    assert(chest.possibleRewards.every(row => !row.guaranteed && row.perDraw && row.chance >= 0 && row.chance <= 1 && row.name && row.icon.path));
    assert(!chest.possibleRewards.some(row => chest.rewards.some(fixed => fixed.id === row.id)));
  }
  assert(view.relics.every(row => row.rewards.length === 1 && row.rewards[0].icon.path && row.name.indexOf('[[loc:') === 0));
  assert(view.resources.every(row => row.rewards.length && (row.payment ? row.cost === null && !row.available : [2001, 2002].includes(row.cost.currency))));
  assert(view.bundles.every(row => row.cost === null && row.payment && !row.available && row.purchaseLimit === 2));
  assert.equal(f.player.udata.data.shopCommerce, undefined, 'viewing paid offers never initializes lifetime commerce state');
});

test('currency names retain authored localization markers in normal offers, fixed contents and actual granted rewards', () => {
  const f = initialized(), quote = ready(f), bundle = quote.bundles[0];
  for (const id of [2001, 2002, 2033]) {
    const expected = f.manager.getGoodsCfgById(id).name;
    assert.equal(expected.indexOf('[[loc:'), 0, 'authored currency names are resolved by the UI language manager');
    assert.equal(bundle.rewards.find(row => row.id === id).name, expected);
  }
  assert.equal(quote.resources.find(row => row.id === 'gold-pouch').rewards[0].name, f.manager.getGoodsCfgById(2001).name);
  assert.equal(quote.chests[0].rewards.find(row => row.id === 2033).name, f.manager.getGoodsCfgById(2033).name);
  const claim = f.service.claimDaily(quote.token); assert.equal(claim.ok, true);
  assert.equal(claim.rewards[0].name, f.manager.getGoodsCfgById(2001).name);
  const energy = buy(f, 'resources', 'energy-flask'); assert.equal(energy.ok, true);
  assert.equal(energy.rewards[0].name, f.manager.getGoodsCfgById(2033).name);
});

test('all shop relic rewards expose authored inspection IDs, rarity and frame metadata without mutating progress or random state', () => {
  const f = initialized(), before = account(f), writes = f.state.writes, calls = f.randomCalls(), quote = ready(f), qualities = new Set();
  const offers = quote.bundles.concat(quote.chests, quote.relics, quote.resources);
  for (const offer of offers) {
    for (const row of (offer.rewards || []).concat(offer.highlights || [], offer.possibleRewards || [])) {
      const good = f.manager.getGoodsCfgById(row.id);
      if (good && good.type === 2) {
        const relic = f.manager.getTreasureCfgById(good.itemID); qualities.add(relic.Quality);
        assert.equal(row.relicId, relic.ID); assert.equal(row.quality, relic.Quality);
        assert.deepEqual(clone(row.rarityFrame), { bundle: 'KinghtFallIconGood', path: good.sprBg });
      } else {
        assert.equal(row.relicId, undefined); assert.equal(row.quality, undefined); assert.equal(row.rarityFrame, undefined);
      }
    }
  }
  assert.deepEqual([...qualities].sort(), [1, 2, 3, 4]);
  for (const row of quote.relics) assert.deepEqual(clone(row.rarityFrame), clone(row.rewards[0].rarityFrame));
  assert.deepEqual(account(f), before); assert.equal(f.state.writes, writes); assert.equal(f.randomCalls(), calls);
  const purchased = buy(f, 'relics', quote.relics.find(row => row.quality === 4).id); assert.equal(purchased.ok, true);
  const reward = purchased.rewards[0], good = f.manager.getGoodsCfgById(reward.id);
  assert.equal(reward.relicId, good.itemID); assert.equal(reward.quality, 4); assert.equal(reward.rarityFrame.path, good.sprBg);
});

test('random pool and actual reward rows never inherit fixed conversion quotes from Array.map indexes', () => {
  const f = initialized(), raw = f.load('ShopCatalog').create(f.manager).chestById['wooden-chest'], selected = raw.pools[4][0], maxed = raw.pools[4][1];
  const cfg = f.manager.getTreasureCfgById(selected.relicId), full = f.manager.getTreasureCfgById(maxed.relicId);
  const needed = cfg.levelInfo.slice(0, -1).reduce((sum, row) => sum + row.PieceCost, 0); assert(needed > 0);
  f.player.udata.setTreasureLevel({ id: selected.relicId, level: 1, frame: needed - 1 });
  f.player.udata.setTreasureLevel({ id: maxed.relicId, level: full.levelInfo.length, frame: 0 });
  const quote = ready(f), offer = quote.chests.find(row => row.id === raw.id);
  assert(offer.possibleRewards.findIndex(row => row.id === maxed.goodId) > 0, 'the fully funded relic exercises a nonzero map index');
  assert(offer.possibleRewards.every(row => !Object.hasOwn(row, 'conversionGold')), 'random pool odds are not fixed-reward conversion promises');
  f.setRandom(() => 0);
  const result = f.service.purchase('chests', offer.id, quote.token); assert.equal(result.ok, true);
  const index = result.rewards.findIndex(row => row.id === selected.goodId); assert(index > 0, 'the relic award follows fixed currencies in the actual result');
  assert.equal(result.rewards[index].num, 1, 'the first copy funds the final fragment and the second uses normal Gold conversion');
  assert.equal(f.player.udata.getTreasureLevel(selected.relicId).frame, needed);
  assert(result.rewards.every(row => !Object.hasOwn(row, 'conversionGold')), 'actual awards are not quoted again against post-grant ownership');
});

function drawQuest(f) {
  f.player.missionData.data.taskInfo = { id: 6, type: 7, num: 0, stage: 0 };
  delete f.player.missionData.data.quests; delete f.player.missionData.data.questCursor;
  f.player.missionData.saveData();
}
function questProgress(f) { return clone(f.player.missionData.data.quests.find(row => row.id === 6)); }
function queueRandom(f, values) {
  const queue = values.slice();
  f.setRandom(() => { assert(queue.length > 0, 'unexpected chest/bonus random call'); return queue.shift(); });
  return queue;
}

for (const [level, chance, bonusValues] of [[0, 0, []], [1, .1, [.05, .1]], [2, .3, [.2, .3]], [3, .5, [.4, .5]]]) {
  test('authored Doubling Rune chance ' + chance * 100 + '% applies per base draw and advances the relic-draw quest by base draws only', () => {
    const f = initialized(); drawQuest(f);
    if (level) f.player.udata.setTreasureLevel({ id: 120006, level, frame: 0 });
    const values = level ? bonusValues.flatMap(value => [0, 0, value]) : [0, 0, 0, 0], queue = queueRandom(f, values), view = ready(f), offer = view.chests.find(row => row.id === 'wooden-chest'), calls = f.randomCalls();
    assert.equal(offer.extraCopyChance, chance);
    const result = f.service.purchase('chests', offer.id, view.token); assert.equal(result.ok, true); assert.equal(queue.length, 0);
    const copies = level ? 4 : 2, relic = f.manager.getTreasureCfgById(120020);
    assert.equal(result.rewards.find(row => row.id === relic.goodID).num, copies);
    assert.equal(f.player.udata.getTreasureLevel(relic.ID).frame, copies - 1);
    assert.equal(f.randomCalls() - calls, level ? 6 : 4);
    assert.equal(questProgress(f).num, offer.draws, 'bonus copies do not count as extra paid base draws');
    assert.equal(questProgress(f).stage, 1); assert.equal(f.player.udata.getDiamondNum(), 100000 - offer.cost.amount);
  });
}

test('a Rune first unlocked mid-chest affects that draw and later draws without reordering aggregated duplicate relics', () => {
  const f = initialized(); drawQuest(f);
  const raw = f.load('ShopCatalog').create(f.manager).chests.find(row => row.id === 'legendary-chest');
  function select(id) { const pool = raw.pools[1], index = pool.findIndex(row => row.relicId === id); assert(index >= 0); return (index + .5) / pool.length; }
  const queue = queueRandom(f, [select(120001), .99, select(120006), .05, .99, select(120001), .05, .99, select(120001), .5, .99, select(120001), .5]), view = ready(f), offer = view.chests.find(row => row.id === raw.id);
  assert.equal(offer.extraCopyChance, 0);
  const result = f.service.purchase('chests', offer.id, view.token); assert.equal(result.ok, true); assert.equal(queue.length, 0);
  assert.equal(result.rewards.find(row => row.id === 2011).num, 2, 'newly acquired Rune grants its own one extra copy');
  assert.equal(result.rewards.find(row => row.id === 2006).num, 5, 'earlier repeated relic stays before the Rune while its later draw gets a bonus');
  assert.equal(f.player.udata.getTreasureLevel(120006).frame, 1); assert.equal(f.player.udata.getTreasureLevel(120001).frame, 4);
  assert.equal(questProgress(f).num, raw.draws); assert.equal(ready(f).chests[0].extraCopyChance, .1);
});

test('fixed bundle and direct relic purchases do not trigger random-draw Rune bonuses or relic-draw quests', () => {
  const f = initialized(); drawQuest(f); f.player.udata.setTreasureLevel({ id: 120006, level: 3, frame: 0 });
  f.setRandom(() => { throw Error('fixed purchases must not roll a bonus'); });
  assert.equal(buy(f, 'bundles').code, 'paymentUnavailable'); assert.equal(buy(f, 'relics', ready(f).relics[0].id).ok, true);
  assert.equal(questProgress(f).num, 0); assert.equal(questProgress(f).stage, 0);
});

test('Rune bonuses, chest costs and draw-quest progress recover together without rerolls or duplicate bonuses', () => {
  function prepared() {
    const f = initialized(); drawQuest(f); f.player.udata.setTreasureLevel({ id: 120006, level: 3, frame: 0 });
    queueRandom(f, [0, 0, 0, 0, 0, 0]); f.state.writes = 0; return f;
  }
  const baseline = prepared(); assert.equal(buy(baseline, 'chests', 'wooden-chest').ok, true);
  const expected = account(baseline), quest = questProgress(baseline), boundaries = baseline.state.writes;
  assert.equal(baseline.player.udata.getTreasureLevel(120020).frame, 3);
  for (let boundary = 1; boundary <= boundaries; boundary++) {
    const f = prepared(), old = ready(f); f.state.crashAt = boundary;
    assert.throws(() => f.service.purchase('chests', 'wooden-chest', old.token), /process interruption/);
    const reload = fixture(f.persist()); ready(reload); assert.deepEqual(account(reload), expected); assert.deepEqual(questProgress(reload), quest);
    assert.equal(reload.randomCalls(), 0); assert.equal(reload.service.purchase('chests', 'wooden-chest', old.token).code, 'stale');
    const twice = fixture(reload.persist()); ready(twice); assert.deepEqual(account(twice), expected); assert.deepEqual(questProgress(twice), quest);
  }
});

test('maxed relics show and apply the existing configured gold conversion within the same purchase', () => {
  const f = initialized(), initial = ready(f), row = initial.relics[0], cfg = f.manager.getTreasureCfgById(row.relicId);
  f.player.udata.setTreasureLevel({ id: row.relicId, level: cfg.levelInfo.length, frame: 0 });
  const view = ready(f), offer = view.relics.find(relic => relic.id === row.id), beforeGold = f.player.udata.getGoldNum(), beforeGems = f.player.udata.getDiamondNum();
  assert.equal(offer.conversionGold, cfg.Conversion[1]);
  const result = f.service.purchase('relics', offer.id, view.token); assert.equal(result.ok, true);
  assert.equal(f.player.udata.getGoldNum(), beforeGold + cfg.Conversion[1]); assert.equal(f.player.udata.getDiamondNum(), beforeGems - offer.cost.amount);
  assert.equal(ready(f).relics.find(relic => relic.id === row.id).soldOut, true);
  assert.deepEqual(clone(result.rewards).map(reward => ({ id: reward.id, num: reward.num })), [{ id: 2001, num: cfg.Conversion[1] }]);
});

test('external relic rewards or upgrades invalidate an old purchase quote before conversion can change silently', () => {
  const f = initialized(), quoted = ready(f), row = quoted.relics[0], cfg = f.manager.getTreasureCfgById(row.relicId), originalRevision = f.player.udata.data.shopState.revision;
  assert.equal(row.conversionGold, 0);
  f.player.udata.setTreasureLevel({ id: row.relicId, level: cfg.levelInfo.length, frame: 0 });
  const current = ready(f), before = account(f), writes = f.state.writes;
  assert.equal(f.player.udata.data.shopState.revision, originalRevision, 'another feature did not mutate the shop revision');
  assert.notEqual(current.token, quoted.token); assert.equal(current.relics[0].conversionGold, cfg.Conversion[1]);
  assert.equal(f.service.purchase('relics', row.id, quoted.token).code, 'stale');
  assert.equal(f.service.refreshRelics(quoted.token).code, 'stale'); assert.equal(f.service.claimDaily(quoted.token).code, 'stale');
  assert.deepEqual(account(f), before); assert.equal(f.state.writes, writes);
  assert.equal(f.service.purchase('relics', row.id, current.token).ok, true);
  assert.equal(f.player.udata.getGoldNum(), before.goldNum + cfg.Conversion[1]); assert.equal(f.player.udata.getDiamondNum(), before.diamondNum - row.cost.amount);
  const ownerOrder = ready(f).token;
  f.player.udata.data.treasureInfo.reverse(); assert.equal(ready(f).token, ownerOrder, 'inventory ordering is not an outcome change');
});

test('local midnight restocks once, resets manual quota and daily claim; stale pre-midnight buttons remain rejected', () => {
  const f = initialized(); f.setTime(new Date(2026, 10, 8, 23, 59).getTime());
  let view = ready(f); assert.equal(view.dailyDeal.remainingSeconds, 60);
  assert.equal(f.service.claimDaily(view.token).ok, true);
  assert.equal(f.service.refreshRelics(ready(f).token).ok, true);
  const old = ready(f), generation = f.player.udata.data.shopState.generation;
  f.advance(60000);
  assert.equal(f.service.purchase('relics', old.relics[0].id, old.token).code, 'stale');
  view = ready(f); assert.equal(view.dailyDeal.claimed, false); assert.equal(view.refresh.used, 0); assert.equal(view.refresh.cost.amount, 0);
  assert.equal(f.player.udata.data.shopState.generation, generation + 1);
  assert.equal(f.service.claimDaily(view.token).ok, true); assert.equal(f.player.udata.getGoldNum(), 1001000);
  const writes = f.state.writes; ready(f); ready(f); assert.equal(f.state.writes, writes);
  f.advance(-86400000); view = ready(f); assert.equal(view.dailyDeal.claimed, true); assert.equal(view.refresh.enabled, false);
  assert.equal(f.service.claimDaily(view.token).code, 'claimed'); assert.equal(f.service.refreshRelics(view.token).code, 'unavailable');
  assert.equal(f.player.udata.getGoldNum(), 1001000);
});

const operations = {
  daily: f => f.service.claimDaily(ready(f).token),
  relic: f => buy(f, 'relics', ready(f).relics.find(row => row.quality === 4).id),
  chest: f => buy(f, 'chests'),
  resource: f => buy(f, 'resources'),
  refresh: f => f.service.refreshRelics(ready(f).token)
};
for (const [kind, operation] of Object.entries(operations)) {
  test(kind + ' transaction recovers debit, rewards, claim and stock flags once at every durable write boundary', () => {
    const baseline = initialized();
    if (kind === 'refresh') { assert.equal(baseline.service.refreshRelics(ready(baseline).token).ok, true); baseline.state.writes = 0; }
    assert.equal(operation(baseline).ok, true); const expected = account(baseline), boundaries = baseline.state.writes; assert(boundaries >= 3);
    for (let boundary = 1; boundary <= boundaries; boundary++) {
      const f = initialized();
      if (kind === 'refresh') { assert.equal(f.service.refreshRelics(ready(f).token).ok, true); f.state.writes = 0; }
      f.state.crashAt = boundary;
      assert.throws(() => operation(f), /process interruption/, kind + ' boundary ' + boundary);
      const reloaded = fixture(f.persist()); ready(reloaded); assert.deepEqual(account(reloaded), expected, kind + ' boundary ' + boundary);
      const twice = fixture(reloaded.persist()); ready(twice); assert.deepEqual(account(twice), expected, 'recovery repeated only saves, never re-awards');
    }
  });
}

test('journal rejection changes nothing, while target failure recovers the frozen chest roll without additional RNG', () => {
  const f = initialized(), view = ready(f), before = account(f);
  f.state.failKeys.add(f.player.rewardJournalKey());
  assert.equal(f.service.purchase('chests', view.chests[0].id, view.token).code, 'save'); assert.deepEqual(account(f), before);
  f.state.failKeys.clear(); ready(f);
  f.state.failKeys.add(f.player.udata.gameKey);
  const failed = f.service.purchase('chests', ready(f).chests[0].id, ready(f).token); assert.equal(failed.code, 'save');
  assert(f.player.pendingRewardJournal); const rolled = account(f), calls = f.randomCalls();
  f.state.failKeys.clear(); ready(f); assert.deepEqual(account(f), rolled); assert.equal(f.randomCalls(), calls);
  assert.equal(f.player.udata.getGoldNum(), before.goldNum + view.chests[0].rewards.find(row => row.id === 2001).num); assert.equal(f.player.udata.getDiamondNum(), before.diamondNum - view.chests[0].cost.amount);
});

test('a yesterday pending claim recovers once before today is initialized and can be claimed once for the new day', () => {
  const f = initialized(); f.state.failKeys.add(f.player.udata.gameKey);
  assert.equal(f.service.claimDaily(ready(f).token).code, 'save');
  const next = fixture(f.persist(), new Date(2026, 10, 9, 12).getTime()), today = ready(next);
  assert.equal(next.player.udata.getGoldNum(), 1000500); assert.equal(today.dailyDeal.claimed, false);
  assert.equal(next.service.claimDaily(today.token).ok, true); assert.equal(next.player.udata.getGoldNum(), 1001000);
  const again = fixture(next.persist(), new Date(2026, 10, 9, 12).getTime()); assert.equal(ready(again).dailyDeal.claimed, true); assert.equal(again.player.udata.getGoldNum(), 1001000);
});

test('midnight stock publication recovers once and preserves unknown account, stock and slot extensions', () => {
  function previousDay() {
    const f = initialized(); assert.equal(f.service.claimDaily(ready(f).token).ok, true); assert.equal(f.service.refreshRelics(ready(f).token).ok, true);
    f.player.udata.data.futureAccount = { retained: 7 }; f.player.udata.data.shopState.futureStock = { retained: 8 }; f.player.udata.data.shopState.slots[0].futureSlot = 'retained';
    f.player.udata.saveData(); f.setTime(new Date(2026, 10, 9, 0, 0).getTime()); f.state.writes = 0; return f;
  }
  const baseline = previousDay(); ready(baseline); const expected = account(baseline), boundaries = baseline.state.writes;
  assert.equal(expected.shopState.dailyClaimed, false); assert.equal(expected.shopState.refreshCount, 0); assert.equal(expected.shopState.slots[0].futureSlot, 'retained');
  for (let boundary = 1; boundary <= boundaries; boundary++) {
    const f = previousDay(); f.state.crashAt = boundary; assert.throws(() => f.service.getView(), /process interruption/);
    const reloaded = fixture(f.persist(), new Date(2026, 10, 9, 0, 0).getTime()); ready(reloaded);
    assert.deepEqual(account(reloaded), expected, 'midnight stock boundary ' + boundary); assert.equal(reloaded.randomCalls(), 0);
  }
});

test('two open shop services share claim, purchase and refresh revisions and reject each other\'s stale buttons', () => {
  const f = initialized(), second = f.load('ShopRuntime').create(f.player, f.manager, { now: () => DAY, rng: () => .5 });
  const firstView = ready(f), secondView = second.getView(); assert.equal(secondView.token, firstView.token);
  assert.equal(f.service.claimDaily(firstView.token).ok, true); assert.equal(second.claimDaily(secondView.token).code, 'stale');
  let view = second.getView(); assert.equal(view.dailyDeal.claimed, true);
  assert.equal(second.purchase('resources', view.resources[0].id, view.token).ok, true);
  assert.equal(f.service.refreshRelics(view.token).code, 'stale');
  view = ready(f); assert.equal(f.service.refreshRelics(view.token).ok, true); assert.equal(second.refreshRelics(view.token).code, 'stale');
  assert.equal(f.player.udata.getGoldNum(), 1005500); assert.equal(f.player.udata.getDiamondNum(), 99950); assert.equal(second.getView().refresh.used, 1);
});

test('malformed shop state fails closed without rearming the daily deal or wiping the original account data', () => {
  for (const malformed of [null, {}, { version: 2 }, { version: 1, dailyClaimed: false }]) {
    const f = initialized(); f.player.udata.data.shopState = malformed; f.player.udata.data.futureField = { preserved: true }; f.player.udata.saveData(); f.state.writes = 0;
    const before = account(f), view = f.service.getView(); assert.equal(view.ready, false); assert.equal(view.code, 'unavailable');
    assert.equal(f.service.claimDaily(view.token).ok, false); assert.deepEqual(account(f), before); assert.equal(f.state.writes, 0);
    const reopened = fixture(f.persist()); assert.equal(reopened.service.getView().ready, false); assert.deepEqual(account(reopened), before);
  }
});
