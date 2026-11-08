'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { harness, config, clone } = require('./persistence-harness.cjs');

function fixture(saved, count = 2, power = 95) {
  const f = harness(saved), manager = f.modules.KinghtFallDataMgr.KinghtFallDataMgr.getInstance(), getGood = manager.getGoodsCfgById;
  manager.getGoodsCfgById = id => id === 2033 ? config.GoodsCfg[2033] || { enumValue: 2033, enumKey: 'EnergyItem', type: 1, name: 'Energy Item', icon: 'wg_ty_tl', sprBg: 'wg_ty_jld2' } : getGood(id);
  manager.getTreasureCfg = () => config.TreasureCfg;
  const api = f.load('EnergyItems'), items = api.create(f.player);
  if (!saved) {
    Object.assign(f.player.udata.data, { energyItems: count, energyItemUseRevision: 0, powerNum: power, powerUpdateTime: 12345 });
    f.player.missionData.initData(); f.player.rewardRecords().forEach(record => record.saveData());
  }
  f.state.writes = 0;
  return Object.assign(f, { api, items, manager });
}
function use(f) { return f.items.useOne(f.items.getView().token); }
function state(f) { return { count: f.player.udata.data.energyItems, revision: f.player.udata.data.energyItemUseRevision, energy: f.player.udata.getPowerNum(), regenAnchor: f.player.udata.getPowerUpdateTime() }; }
function grant(f, amount, once) {
  return f.player.claimRewards([{ id: 2033, num: amount }], 1, null, () => { if (once) f.player.udata.data.energyAwardClaimed = true; }, () => !once || !f.player.udata.data.energyAwardClaimed);
}

test('Energy item inventory defaults to zero for old accounts and reading it performs no writes', () => {
  const f = fixture(undefined, 0), fresh = new (f.load('KinghtFallUserData').KinghtFallUserData)(); fresh.createData();
  assert.equal(fresh.data.energyItems, 0); assert.equal(fresh.data.energyItemUseRevision, 0);
  delete f.player.udata.data.energyItems; delete f.player.udata.data.energyItemUseRevision;
  for (let index = 0; index < 10; index++) {
    const view = f.items.getView(); assert.equal(view.count, 0); assert.equal(view.energyPerItem, 20); assert.equal(view.available, false); assert.equal(view.error, null);
  }
  assert.equal(f.state.writes, 0); assert.equal(f.player.udata.data.energyItems, undefined);
});

test('granting reward2033 stores items without immediately adding Energy, and use grants the full20 above regen cap', () => {
  const f = fixture(undefined, 0, 95), beforeAnchor = f.player.udata.getPowerUpdateTime();
  const awarded = grant(f, 2); assert.deepEqual(clone(awarded), [{ id: 2033, num: 2 }]);
  assert.equal(f.items.getView().count, 2); assert.equal(f.player.udata.getPowerNum(), 95);
  assert.equal(use(f).ok, true); assert.deepEqual(state(f), { count: 1, revision: 1, energy: 115, regenAnchor: beforeAnchor });
  assert.equal(use(f).ok, true); assert.deepEqual(state(f), { count: 0, revision: 2, energy: 135, regenAnchor: beforeAnchor });
  const empty = f.items.getView(); assert.equal(empty.available, false); assert.equal(f.items.useOne(empty.token).code, 'empty');
});

test('stale Use callbacks cannot consume another item, including after an external reward restores the original count', () => {
  const f = fixture(undefined, 2, 30), old = f.items.getView();
  assert.equal(f.items.useOne(old.token).ok, true); assert.equal(f.items.useOne(old.token).code, 'stale');
  assert.deepEqual(state(f), { count: 1, revision: 1, energy: 50, regenAnchor: 12345 });
  assert(grant(f, 1)); const renewed = f.items.getView(); assert.equal(renewed.count, old.count); assert.notEqual(renewed.token, old.token);
  const writes = f.state.writes; assert.equal(f.items.useOne(old.token).code, 'stale'); assert.equal(f.state.writes, writes);
  assert.equal(f.items.useOne(renewed.token).ok, true); assert.deepEqual(state(f), { count: 1, revision: 2, energy: 70, regenAnchor: 12345 });
});

test('two open item panels share count/revision and reject duplicate cross-panel callbacks', () => {
  const f = fixture(), other = f.api.create(f.player), one = f.items.getView(), two = other.getView(); assert.equal(one.token, two.token);
  assert.equal(f.items.useOne(one.token).ok, true); assert.equal(other.useOne(two.token).code, 'stale');
  assert.equal(other.useOne(other.getView().token).ok, true); assert.deepEqual(state(f), { count: 0, revision: 2, energy: 135, regenAnchor: 12345 });
});

test('item count and use receipt persist across reload and do not reset with the daily record or shop stock', () => {
  const f = fixture(undefined, 7, 10); assert.equal(use(f).ok, true);
  f.player.dailyData.data.time = Date.now() - 2 * 86400000; f.player.dailyData.ensureCurrentDay();
  let now = new Date(2026, 10, 8, 12).getTime();
  const shop = f.load('ShopRuntime').create(f.player, f.manager, { now: () => now, rng: () => .5 });
  assert.equal(shop.getView().ready, true); now += 86400000; assert.equal(shop.getView().ready, true);
  assert.equal(f.items.getView().count, 6);
  const reload = fixture(f.persist()); assert.deepEqual(state(reload), { count: 6, revision: 1, energy: 30, regenAnchor: 12345 });
});

test('actual shop currency Energy products and immediate-open chests award stored items before any Energy is used', () => {
  assert.equal(config.GoodsCfg[2033].enumValue, 2033); assert.equal(config.GoodsCfg[2033].type, 1);
  for (const [kind, expectedOffers] of [['resources', 4], ['chests', 8]]) {
    const sample = fixture(undefined, 0, 95), sampleShop = sample.load('ShopRuntime').create(sample.player, sample.manager, { rng: () => .5 });
    const offers = sampleShop.getView()[kind].filter(offer => offer.rewards.some(reward => reward.id === 2033)); assert.equal(offers.length, expectedOffers);
    for (const product of offers) {
      const f = fixture(undefined, 0, 95); Object.assign(f.player.udata.data, { goldNum: 1000000, diamondNum: 10000 }); f.player.udata.saveData();
      const shop = f.load('ShopRuntime').create(f.player, f.manager, { rng: () => .5 }), view = shop.getView(), offer = view[kind].find(row => row.id === product.id), amount = offer.rewards.find(reward => reward.id === 2033).num;
      assert.equal(shop.purchase(kind, offer.id, view.token).ok, true, kind + '/' + offer.id);
      assert.equal(f.items.getView().count, amount); assert.equal(f.player.udata.getPowerNum(), 95, 'purchase does not immediately refill Energy');
      assert.equal(use(f).ok, true); assert.equal(f.items.getView().count, amount - 1); assert.equal(f.player.udata.getPowerNum(), 115);
      const reload = fixture(f.persist()); assert.equal(reload.items.getView().count, amount - 1); assert.equal(reload.player.udata.getPowerNum(), 115);
    }
  }
});

test('item consumption recovers inventory, use revision and Energy once at every durable write boundary', () => {
  const baseline = fixture(); assert.equal(use(baseline).ok, true); const expected = state(baseline), boundaries = baseline.state.writes; assert(boundaries >= 3);
  for (let boundary = 1; boundary <= boundaries; boundary++) {
    const f = fixture(), quote = f.items.getView(); f.state.crashAt = boundary;
    assert.throws(() => f.items.useOne(quote.token), /process interruption/, 'boundary ' + boundary);
    const reload = fixture(f.persist()); assert.equal(reload.items.getView().count, 1); assert.deepEqual(state(reload), expected);
    assert.equal(reload.items.useOne(quote.token).code, 'stale');
    const again = fixture(reload.persist()); again.items.getView(); assert.deepEqual(state(again), expected);
  }
});

test('one-time item rewards recover the inventory credit and business receipt together at every write boundary', () => {
  const baseline = fixture(undefined, 0, 45); assert(grant(baseline, 3, true)); const expected = state(baseline), boundaries = baseline.state.writes;
  assert.equal(expected.energy, 45); assert.equal(expected.count, 3);
  for (let boundary = 1; boundary <= boundaries; boundary++) {
    const f = fixture(undefined, 0, 45); f.state.crashAt = boundary; assert.throws(() => grant(f, 3, true), /process interruption/);
    const reload = fixture(f.persist()); reload.items.getView(); assert.deepEqual(state(reload), expected); assert.equal(reload.player.udata.data.energyAwardClaimed, true);
    assert.equal(grant(reload, 3, true), null); assert.deepEqual(state(reload), expected);
  }
});

test('pre-item-version reward journals still recover without new default fields invalidating their snapshots', () => {
  const f = fixture(undefined, 0, 45); f.state.failKeys.add(f.player.udata.gameKey);
  const awarded = f.player.claimRewards([{ id: 2001, num: 500 }], 1, null, () => { f.player.udata.data.legacyRewardClaimed = true; }, () => !f.player.udata.data.legacyRewardClaimed);
  assert.equal(awarded, null); assert(f.player.pendingRewardJournal);
  const disk = f.persist(), journalKey = f.player.rewardJournalKey(), journal = JSON.parse(disk[journalKey]);
  for (const entry of journal.records) if (entry.key === f.player.udata.gameKey) { delete entry.data.energyItems; delete entry.data.energyItemUseRevision; }
  disk[journalKey] = JSON.stringify(journal);
  const oldUser = JSON.parse(disk[f.player.udata.gameKey]); delete oldUser.energyItems; delete oldUser.energyItemUseRevision; disk[f.player.udata.gameKey] = JSON.stringify(oldUser);
  const reload = fixture(disk); assert.equal(reload.items.getView().count, 0); assert.equal(reload.player.rewardStorageCheckPending, false);
  assert.equal(reload.player.pendingRewardJournal, null); assert.equal(reload.player.udata.data.legacyRewardClaimed, true); assert.equal(reload.player.udata.getGoldNum(), 500);
  assert.equal(reload.player.udata.getPowerNum(), 45); assert.equal(reload.storage.get(journalKey), '');
  assert.equal(reload.player.udata.data.energyItems, undefined, 'legacy records are not rewritten just to seed zero inventory');
  const again = fixture(reload.persist()); again.items.getView(); assert.equal(again.player.udata.getGoldNum(), 500);
});

const battleRewards = [{ id: 2033, num: 2 }, { id: 2001, num: 10 }, { id: 2002, num: 3 }, { id: 2005, num: 5 }];
function assertBattleAward(f, multiplier) {
  assert.equal(f.items.getView().count, 2 * multiplier); assert.equal(f.player.udata.getPowerNum(), 45 + 5 * multiplier);
  assert.equal(f.player.udata.getGoldNum(), 10 * multiplier); assert.equal(f.player.udata.getDiamondNum(), 3 * multiplier);
  assert.equal(f.player.udata.data.battleSettlement.rewardTotals[2033], 2 * multiplier);
}

test('authored battle Energy-item rewards stay in inventory and include exact double-ad receipt totals', () => {
  const f = fixture(undefined, 0, 45), settlement = f.player.gameData.beginSettlement(battleRewards, 1, 1, true);
  assertBattleAward(f, 1); assert.equal(f.player.udata.getMaxStage(), 2);
  assert.equal(f.player.gameData.settleBattle(settlement, 2), true); assertBattleAward(f, 2);
  assert.equal(f.player.gameData.settleBattle(settlement, 2), true); assertBattleAward(f, 2);
  f.player.gameData.beginSettlement([{ id: 2033, num: 1 }], 2, 0, false);
  assert.equal(f.player.udata.data.energyItems, 5); assert.equal(f.player.gameData.settleBattle(settlement, 2), false, 'old ad cannot alter a newer result');
  assert.equal(f.player.udata.data.energyItems, 5); assert.equal(f.player.udata.getPowerNum(), 55);
});

for (const multiplier of [1, 2]) test('battle Energy-item multiplier ' + multiplier + ' recovers inventory and existing currencies at every durable write boundary', () => {
  function prepared() {
    const f = fixture(undefined, 0, 45);
    if (multiplier === 2) f.settlement = f.player.gameData.beginSettlement(battleRewards, 1, 1, true);
    f.state.writes = 0; return f;
  }
  function settle(f) { return multiplier === 1 ? f.player.gameData.beginSettlement(battleRewards, 1, 1, true) : f.player.gameData.settleBattle(f.settlement, 2); }
  const baseline = prepared(); settle(baseline); assertBattleAward(baseline, multiplier); const boundaries = baseline.state.writes;
  assert(boundaries >= 4);
  for (let boundary = 1; boundary <= boundaries; boundary++) {
    const f = prepared(); f.state.crashAt = boundary; assert.throws(() => settle(f), /process interruption/);
    const reload = fixture(f.persist()); reload.player.gameData.initData(); assertBattleAward(reload, multiplier);
    const again = fixture(reload.persist()); again.player.gameData.initData(); assertBattleAward(again, multiplier);
  }
});

test('failed battle account save retains a recoverable pending result without awarding the same item twice', () => {
  const f = fixture(undefined, 0, 45); f.state.failKeys.add(f.player.udata.gameKey);
  const settlement = f.player.gameData.beginSettlement(battleRewards, 1, 1, true); assert(f.player.gameData.data.pendingSettlement);
  assert.equal(f.player.udata.data.energyItems, 2); f.state.failKeys.clear(); assert.equal(f.player.gameData.completeSettlement(settlement), true);
  const reload = fixture(f.persist()); reload.player.gameData.initData(); assertBattleAward(reload, 1);
  assert.equal(reload.player.gameData.data.pendingSettlement, undefined);
});

test('journal failure preserves the item and Energy, while a later retry consumes exactly once', () => {
  const f = fixture(), quote = f.items.getView(), before = state(f); f.state.failKeys.add(f.player.rewardJournalKey());
  assert.equal(f.items.useOne(quote.token).code, 'save'); assert.deepEqual(state(f), before);
  f.state.failKeys.clear(); assert.equal(f.items.getView().token, quote.token); assert.equal(f.items.useOne(quote.token).ok, true);
  assert.deepEqual(state(f), { count: 1, revision: 1, energy: 115, regenAnchor: 12345 });
});

test('failed account write leaves a recoverable receipt and blocks another use until the journal saves', () => {
  const f = fixture(undefined, 1), quote = f.items.getView(); f.state.failKeys.add(f.player.udata.gameKey);
  assert.equal(f.items.useOne(quote.token).code, 'save'); assert(f.player.pendingRewardJournal);
  assert.equal(f.items.getView().available, false); assert.equal(f.items.useOne(quote.token).code, 'save');
  f.state.failKeys.clear(); const recovered = f.items.getView(); assert.equal(recovered.count, 0); assert.equal(recovered.available, false);
  assert.equal(f.items.useOne(quote.token).code, 'stale'); assert.equal(f.items.useOne(recovered.token).code, 'empty');
  assert.deepEqual(state(f), { count: 0, revision: 1, energy: 115, regenAnchor: 12345 });
});

test('invalid quantities or live malformed inventory cannot silently consume, normalize or award items', () => {
  const f = fixture(); const before = state(f);
  for (const amount of [-1, 1.5, NaN, Infinity, '2']) assert.throws(() => f.api.add(f.player.udata, amount), /quantity/);
  assert.deepEqual(state(f), before); assert.equal(f.state.writes, 0); assert.equal(f.api.add(f.player.udata, 0), 2); assert.equal(f.state.writes, 0);
  for (const count of [-1, 1.5, NaN, Infinity, null, '2']) {
    f.player.udata.data.energyItems = count;
    const view = f.items.getView(); assert.equal(view.available, false); assert.equal(view.code, 'unavailable'); assert.equal(f.items.useOne(view.token).code, 'unavailable');
    assert.equal(f.state.writes, 0); assert.equal(f.player.udata.data.energyItems, count);
  }
});

test('save validation retains whole inventory counts and account extensions when upgrading legacy records', () => {
  const f = fixture(), source = clone(f.player.udata.data); source.energyItems = 7.5; source.energyItemUseRevision = -1; source.futureAccount = { retained: true };
  const normalized = f.player.udata.validateSaveRecord(source);
  assert.equal(normalized.energyItems, 7); assert.equal(normalized.energyItemUseRevision, 0); assert(normalized.futureAccount.retained);
  assert.equal(normalized.powerNum, 95); assert.equal(normalized.goldNum, 0);
});
