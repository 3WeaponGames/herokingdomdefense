'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const Commerce = require('../../assets/_script/ShopCommerce.js');
const Payments = require('../../assets/_script/ShopPayments.js');
const { harness, config, clone } = require('./persistence-harness.cjs');
const DAY = new Date(2026, 10, 8, 12).getTime();

// The provider and verifier are deliberately outside the account save. An
// interrupted account write must restore an actual unfinished store purchase.
function provider() {
  const ledger = { next: 0, transactions: [], ordinals: {}, checkoutCalls: 0, authorizationCalls: [], finishes: 0, hold: null };
  ledger.transaction = (productId, ordinal, receiptId) => {
    const transaction = { status: 'purchased', transactionId: 'transaction-' + ++ledger.next, productId, purchaseNumber: ordinal, receiptId: receiptId || 'receipt-' + ledger.next, finished: false };
    ledger.transactions.push(transaction); ledger.ordinals[productId] = Math.max(ledger.ordinals[productId] || 0, ordinal); return transaction;
  };
  ledger.options = {
    accountId: 'test-account', timeoutMs: 1000,
    store: {
      getProducts: ids => ids.map(productId => ({ productId, formattedPrice: '$' + productId.length + '.99', currency: 'USD' })),
      async purchase(productId) {
        ledger.checkoutCalls++;
        if (ledger.hold) await ledger.hold;
        const ordinal = (ledger.ordinals[productId] || 0) + 1; ledger.ordinals[productId] = ordinal;
        return ledger.transaction(productId, ordinal);
      },
      getPendingPurchases: () => ledger.transactions.filter(row => !row.finished),
      finish(transaction) { if (ledger.failFinish) throw Error('acknowledgement unavailable'); transaction.finished = true; ledger.finishes++; }
    },
    authorizePurchase(request) {
      ledger.authorizationCalls.push(request);
      return { allowed: !request.purchaseLimit || (ledger.ordinals[request.productId] || 0) < request.purchaseLimit, code: 'purchaseLimit',
        purchaseNumber: (ledger.ordinals[request.productId] || 0) + 1,
        purchaseCount: ledger.ordinals[request.productId] || 0, firstPurchaseAvailable: !(ledger.ordinals[request.productId] || 0),
        intentId: 'intent-' + ledger.authorizationCalls.length, accountId: request.accountId, productId: request.productId };
    },
    verifyPurchase: transaction => ({ status: 'verified', receiptId: transaction.receiptId, productId: transaction.productId,
      accountId: 'test-account', purchaseNumber: transaction.purchaseNumber, firstPurchase: transaction.purchaseNumber === 1 })
  };
  return ledger;
}
function fixture(saved, ledger = provider()) {
  const h = harness(saved), manager = h.modules.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
  manager.getTreasureCfg = () => config.TreasureCfg;
  let now = DAY, calls = 0;
  const payments = Payments.create(ledger.options);
  const service = h.load('ShopRuntime').create(h.player, manager, { payments, now: () => now, rng: () => { calls++; return .5; } });
  if (!saved) {
    Object.assign(h.player.udata.data, { goldNum: 1000000, diamondNum: 100000, powerNum: 30 });
    h.player.missionData.initData(); h.player.rewardRecords().forEach(record => record.saveData());
  }
  return Object.assign(h, { manager, service, payments, ledger, advance: amount => { now += amount; }, randomCalls: () => calls });
}
function view(f) { const result = f.service.getView(); assert.equal(result.ready, true, result.error); return result; }
async function initialized(saved, ledger) {
  const f = fixture(saved, ledger); view(f); assert.equal((await f.service.loadProducts()).ok, true); f.state.writes = 0; return f;
}
function account(f) { const result = clone(f.player.udata.data); delete result.sft; delete result.rewardTransaction; return result; }
function purchase(f, kind, id) { return f.service.purchase(kind, id, view(f).token); }

test('commerce remains optional, pure mutations preserve extensions and authoritative ordinals deduplicate receipts', () => {
  const state = Commerce.empty(); state.extension = { retained: true };
  const offer = { id: 'bundle', payment: { productId: 'bundle.product' }, purchaseLimit: 2 };
  const second = { receiptId: 'second', productId: offer.payment.productId, accountId: 'test-account', purchaseNumber: 2, firstPurchase: false };
  const one = Commerce.recordPurchase(state, second, 'bundles', offer);
  assert.equal(one.bundleCounts.bundle, 2); assert.equal(state.revision, 0); assert.deepEqual(one.extension, state.extension);
  const first = { ...second, receiptId: 'first', purchaseNumber: 1, firstPurchase: true };
  const both = Commerce.recordPurchase(one, first, 'bundles', offer); assert.equal(both.bundleCounts.bundle, 2); assert.equal(both.revision, 2);
  assert.equal(Commerce.recordPurchase(both, { ...first, receiptId: 'alias' }, 'bundles', offer), both);
  assert.throws(() => Commerce.recordPurchase(both, { ...second, receiptId: 'third', purchaseNumber: 3 }, 'bundles', offer), /limit/);
  const inventory = Commerce.addChests(both, [{ chestId: 'wooden-chest', num: 2 }]);
  assert.equal(Commerce.consumeChest(inventory, 'wooden-chest').chests['wooden-chest'], 1); assert.equal(inventory.chests['wooden-chest'], 2);
  assert.throws(() => Commerce.addChests(inventory, [{ chestId: '__proto__', num: 1 }]), /Invalid/);
  assert.throws(() => Commerce.validate({ ...state, chests: { chest: -1 } }), /Invalid/);
});

test('unconfigured payments cannot grant paid offers or accept forged fulfillment capabilities', async () => {
  const f = fixture(), service = f.load('ShopRuntime').create(f.player, f.manager, { now: () => DAY, rng: () => .5 });
  const quote = service.getView(), before = account(f), writes = f.state.writes;
  assert(quote.bundles.every(row => row.payment && !row.available && row.cost === null && row.payment.formattedPrice === null));
  assert.equal(service.purchase('bundles', quote.bundles[0].id, quote.token).code, 'paymentUnavailable');
  assert.equal(service.purchase('resources', 'gems-100', quote.token).code, 'paymentUnavailable');
  assert.equal(service.deliverPaid(Object.freeze({ receiptId: 'forged', productId: quote.bundles[0].payment.productId })).code, 'unverified');
  assert.equal((await service.restorePurchases()).ok, false);
  assert.equal(f.player.udata.data.shopCommerce, undefined); assert.equal(f.state.writes, writes); assert.deepEqual(account(f), before);
});

test('each paid bundle grants fixed goods and stored Energy/chests only, with two lifetime purchases per SKU', async () => {
  const sample = await initialized();
  for (const template of view(sample).bundles) {
    const f = await initialized(), quote = view(f), offer = quote.bundles.find(row => row.id === template.id), beforeCalls = f.randomCalls();
    assert.equal(offer.available, true); assert.equal(offer.purchaseCount, 0); assert.equal(offer.purchasesRemaining, 2);
    assert.equal(offer.payment.formattedPrice, '$' + offer.payment.productId.length + '.99');
    assert(offer.rewards.some(row => row.chestId && row.id === 'chest:' + row.chestId && row.name && row.icon.path));
    assert.equal((await purchase(f, 'bundles', offer.id)).ok, true);
    const bought = view(f).bundles.find(row => row.id === offer.id), chest = offer.rewards.find(row => row.chestId), energy = offer.rewards.find(row => row.id === 2033);
    assert.equal(bought.purchaseCount, 1); assert.notEqual(view(f).token, quote.token);
    assert.equal(view(f).chests.find(row => row.id === chest.chestId).ownedCount, chest.num);
    assert.equal(f.player.udata.data.energyItems, energy.num); assert.equal(f.player.udata.getPowerNum(), 30);
    assert.equal(f.randomCalls(), beforeCalls, 'banking a chest does not draw or grant its contents');
    assert.equal(f.player.udata.getGoldNum(), 1000000 + offer.rewards.find(row => row.id === 2001).num);
    assert.equal(f.player.udata.getDiamondNum(), 100000 + offer.rewards.find(row => row.id === 2002).num);
    assert.equal(f.load('EnergyItems').create(f.player).useOne(f.load('EnergyItems').create(f.player).getView().token).ok, true);
    assert.equal(f.player.udata.getPowerNum(), 50);
    assert.equal((await purchase(f, 'bundles', offer.id)).ok, true);
    const capped = view(f).bundles.find(row => row.id === offer.id); assert.equal(capped.purchaseCount, 2); assert.equal(capped.soldOut, true); assert.equal(capped.available, false);
    assert.equal((await purchase(f, 'bundles', offer.id)).code, 'purchaseLimit'); assert.equal(f.ledger.checkoutCalls, 2);
    assert(f.ledger.authorizationCalls.every(row => row.purchaseLimit === 2));
    f.advance(86400000); assert.equal(view(f).bundles.find(row => row.id === offer.id).purchaseCount, 2);
    const reload = await initialized(f.persist(), f.ledger); assert.equal(view(reload).bundles.find(row => row.id === offer.id).purchaseCount, 2);
  }
});

test('each Gem SKU doubles its entire first verified award once; later buys and other SKUs have independent bonuses', async () => {
  const f = await initialized();
  for (const offer of view(f).resources.filter(row => row.payment)) {
    const before = f.player.udata.getDiamondNum(), base = offer.baseRewards[0].num;
    assert.equal(offer.firstPurchaseAvailable, true); assert.equal(offer.rewards[0].num, base * 2);
    assert.equal((await purchase(f, 'resources', offer.id)).ok, true); assert.equal(f.player.udata.getDiamondNum(), before + base * 2);
    const afterFirst = view(f).resources.find(row => row.id === offer.id); assert.equal(afterFirst.firstPurchaseAvailable, false); assert.equal(afterFirst.rewards[0].num, base);
    assert.equal((await purchase(f, 'resources', offer.id)).ok, true); assert.equal(f.player.udata.getDiamondNum(), before + base * 3);
  }
  f.advance(86400000); assert(view(f).resources.filter(row => row.payment).every(row => !row.firstPurchaseAvailable));
  const reload = await initialized(f.persist(), f.ledger); assert(view(reload).resources.filter(row => row.payment).every(row => !row.firstPurchaseAvailable));
});

test('store authorization rejects an already capped cross-device bundle before checkout or local grants', async () => {
  const f = await initialized(), offer = view(f).bundles[0], before = account(f); f.ledger.ordinals[offer.payment.productId] = 2;
  assert.equal((await purchase(f, 'bundles', offer.id)).code, 'purchaseLimit'); assert.equal(f.ledger.checkoutCalls, 0); assert.deepEqual(account(f), before);
  assert.equal(view(f).bundles[0].soldOut, true, 'trusted server eligibility updates the visible lifetime cap without changing local account data');
});

test('a cross-device first Gem quote is corrected before checkout and the next confirmed purchase uses the actual award', async () => {
  const f = await initialized(), quoted = view(f), offer = quoted.resources.find(row => row.id === 'gems-100'), before = account(f);
  assert.equal(offer.firstPurchaseAvailable, true); assert.equal(offer.rewards[0].num, 200);
  f.ledger.ordinals[offer.payment.productId] = 1;
  const rejected = await f.service.purchase('resources', offer.id, quoted.token); assert.equal(rejected.code, 'paymentQuoteChanged');
  assert.equal(f.ledger.checkoutCalls, 0); assert.deepEqual(account(f), before);
  const refreshed = view(f), current = refreshed.resources.find(row => row.id === offer.id);
  assert.notEqual(refreshed.token, quoted.token); assert.equal(current.firstPurchaseAvailable, false); assert.equal(current.rewards[0].num, 100);
  assert.equal(f.service.purchase('resources', offer.id, quoted.token).code, 'stale');
  assert.equal((await f.service.purchase('resources', offer.id, refreshed.token)).ok, true);
  assert.equal(f.player.udata.getDiamondNum(), before.diamondNum + 100);
  assert.deepEqual(f.ledger.authorizationCalls.map(row => row.expectedFirstPurchase), [true, false]);
});

test('fixed bundle conversion is quoted precisely and an external ownership change invalidates its paid confirmation before checkout', async () => {
  const f = await initialized(), quoted = view(f), offer = quoted.bundles[0];
  assert.equal(offer.conversionGold, 0);
  for (const reward of offer.rewards) {
    const good = f.manager.getGoodsCfgById(reward.id);
    if (good && good.type === 2) { const cfg = f.manager.getTreasureCfgById(good.itemID); f.player.udata.setTreasureLevel({ id: cfg.ID, level: cfg.levelInfo.length, frame: 0 }); }
  }
  assert.equal(f.service.purchase('bundles', offer.id, quoted.token).code, 'stale'); assert.equal(f.ledger.checkoutCalls, 0);
  const current = view(f).bundles[0], expected = current.rewards.reduce((sum, reward) => sum + (reward.conversionGold || 0), 0), fixedGold = current.rewards.find(row => row.id === 2001).num;
  assert(expected > 0); assert.equal(current.conversionGold, expected);
  const gold = f.player.udata.getGoldNum(), random = f.randomCalls();
  const result = await purchase(f, 'bundles', current.id); assert.equal(result.ok, true);
  assert.equal(f.player.udata.getGoldNum(), gold + fixedGold + expected); assert.equal(f.randomCalls(), random, 'fixed relics and banked chests do not trigger Rune rolls');
  assert.equal(result.rewards.filter(row => row.id === 2001).reduce((sum, row) => sum + row.num, 0), fixedGold + expected);
});

test('two services cannot start duplicate checkout while one is pending, and fulfillment survives intervening daily/currency changes', async () => {
  const f = await initialized(); let release; f.ledger.hold = new Promise(resolve => { release = resolve; });
  const other = f.load('ShopRuntime').create(f.player, f.manager, { payments: f.payments, now: () => DAY, rng: () => .5 });
  const quote = view(f), pending = f.service.purchase('bundles', quote.bundles[0].id, quote.token);
  assert.equal(view(f).pending, true); assert.equal(other.purchase('bundles', quote.bundles[0].id, quote.token).ok, false);
  assert.equal(f.service.purchase('resources', 'gold-pouch', quote.token).ok, true);
  f.advance(86400000); view(f); release(); assert.equal((await pending).ok, true);
  assert.equal(f.ledger.checkoutCalls, 1); assert.equal(view(f).pending, false); assert.equal(view(f).bundles[0].purchaseCount, 1);
  assert.equal(f.player.udata.getDiamondNum(), 100000 - 50 + 50);
});

test('out-of-order restores deliver missing bundle ordinals and authoritative first Gem bonuses exactly once', async () => {
  const ledger = provider(), product = 'hkd.bundle.archer-starter', gems = 'hkd.gems.100';
  ledger.transaction(product, 2); ledger.transaction(product, 1); ledger.transaction(gems, 2); ledger.transaction(gems, 1); ledger.transaction(gems, 1, 'alias-first');
  const f = await initialized(undefined, ledger), before = f.player.udata.getDiamondNum();
  assert.equal((await f.service.restorePurchases()).ok, true);
  assert.equal(f.player.udata.getDiamondNum(), before + 2 * 50 + 300);
  assert.equal(view(f).bundles[0].purchaseCount, 2); assert.equal(view(f).chests[0].ownedCount, 2);
  assert.equal(Object.keys(f.player.udata.data.shopCommerce.receipts).length, 4, 'same SKU ordinal under an alias receipt grants nothing');
  assert.equal((await f.service.restorePurchases()).ok, true); assert.equal(f.player.udata.getDiamondNum(), before + 400);
  assert.equal(ledger.finishes, 5, 'duplicate unfinished provider transactions can be acknowledged after durable dedup');
});

test('over-cap or conflicting verified receipts remain unacknowledged and cannot grant a different product', async () => {
  const ledger = provider(); ledger.transaction('hkd.bundle.archer-starter', 3);
  const f = await initialized(undefined, ledger), before = account(f);
  const result = await f.service.restorePurchases(); assert.equal(result.ok, false); assert.equal(result.results[0].code, 'purchaseLimit');
  assert.deepEqual(account(f), before); assert.equal(ledger.finishes, 0);
  const clean = await initialized(); assert.equal((await purchase(clean, 'resources', 'gems-100')).ok, true);
  const original = clean.ledger.transactions[0]; clean.ledger.transaction('hkd.gems.550', 1, original.receiptId);
  const previous = account(clean); assert.equal((await clean.service.restorePurchases()).ok, false); assert.deepEqual(account(clean), previous);
});

test('paid purchase history stays bound to its game account and a store-account switch cannot charge or overwrite it', async () => {
  const f = await initialized(); assert.equal((await purchase(f, 'bundles', 'archer-starter')).ok, true);
  assert.equal(f.player.udata.data.shopCommerce.accountId, 'test-account');
  const before = account(f), quoted = view(f);
  const otherLedger = provider(); otherLedger.options.accountId = 'different-account';
  otherLedger.options.verifyPurchase = transaction => ({ status: 'verified', receiptId: transaction.receiptId, productId: transaction.productId, accountId: 'different-account', purchaseNumber: 1 });
  f.payments.configure(otherLedger.options); await f.service.loadProducts();
  const switched = view(f), offer = switched.bundles[0]; assert.notEqual(switched.token, quoted.token);
  assert.equal(offer.available, false); assert.equal(offer.payment.available, false); assert.equal(offer.payment.code, 'accountMismatch');
  assert.equal(f.service.purchase('bundles', offer.id, switched.token).code, 'accountMismatch'); assert.equal(otherLedger.checkoutCalls, 0);
  otherLedger.transaction('hkd.gems.100', 1);
  const restored = await f.service.restorePurchases(); assert.equal(restored.ok, false); assert.equal(restored.results[0].code, 'accountMismatch');
  assert.deepEqual(account(f), before); assert.equal(otherLedger.finishes, 0);
});

test('an acknowledgement failure restores the durable receipt without awarding content again', async () => {
  const f = await initialized(); f.ledger.failFinish = true;
  const paid = await purchase(f, 'resources', 'gems-100'); assert.equal(paid.ok, true); assert.equal(paid.pendingAcknowledgement, true);
  assert.equal(view(f).pending, true); assert(view(f).resources.filter(row => row.payment).every(row => !row.available));
  const expected = account(f), beforeWrites = f.state.writes; f.ledger.failFinish = false;
  assert.equal((await f.service.restorePurchases()).ok, true); assert.deepEqual(account(f), expected); assert.equal(f.state.writes, beforeWrites);
  assert.equal(view(f).pending, false); assert.equal(f.ledger.finishes, 1);
});

test('two services share banked-chest revisions, so a stale Open event cannot consume a second owned chest', async () => {
  const f = await initialized(); assert.equal((await purchase(f, 'bundles', 'archer-starter')).ok, true); assert.equal((await purchase(f, 'bundles', 'archer-starter')).ok, true);
  const second = f.load('ShopRuntime').create(f.player, f.manager, { payments: f.payments, now: () => DAY, rng: () => .5 });
  const one = view(f), two = second.getView(); assert.equal(one.token, two.token); assert.equal(one.chests[0].ownedCount, 2);
  assert.equal(f.service.openChest('wooden-chest', one.token).ok, true);
  const before = account(f), calls = f.randomCalls(); assert.equal(second.openChest('wooden-chest', two.token).code, 'stale');
  assert.deepEqual(account(f), before); assert.equal(f.randomCalls(), calls); assert.equal(second.getView().chests[0].ownedCount, 1);
});

for (const [kind, id] of [['bundles', 'archer-starter'], ['resources', 'gems-100']]) {
  test('paid ' + kind + ' receipts, inventory and awards recover once at every durable write boundary', async () => {
    const baseline = await initialized(); assert.equal((await purchase(baseline, kind, id)).ok, true);
    const expected = account(baseline), boundaries = baseline.state.writes; assert(boundaries >= 3);
    for (let boundary = 1; boundary <= boundaries; boundary++) {
      const f = await initialized(); f.state.crashAt = boundary; await purchase(f, kind, id);
      const reload = await initialized(f.persist(), f.ledger); assert.equal((await reload.service.restorePurchases()).ok, true);
      assert.deepEqual(account(reload), expected, kind + ' boundary ' + boundary);
      assert.equal(reload.randomCalls(), 0, 'paid fixed content and banked chests never roll');
      const twice = await initialized(reload.persist(), f.ledger); assert.equal((await twice.service.restorePurchases()).ok, true); assert.deepEqual(account(twice), expected);
    }
  });
}

test('rejected journals and failed target saves keep paid transactions restorable without a second charge', async () => {
  for (const failedKey of ['journal', 'account']) {
    const f = await initialized(), before = f.player.udata.getDiamondNum(); f.state.failKeys.add(failedKey === 'journal' ? f.player.rewardJournalKey() : f.player.udata.gameKey);
    assert.equal((await purchase(f, 'resources', 'gems-100')).ok, false); assert.equal(f.ledger.finishes, 0);
    if (failedKey === 'journal') assert.equal(f.player.udata.getDiamondNum(), before);
    f.state.failKeys.clear(); assert.equal((await f.service.restorePurchases()).ok, true);
    assert.equal(f.player.udata.getDiamondNum(), before + 200); assert.equal(f.ledger.checkoutCalls, 1); assert.equal(f.ledger.finishes, 1);
    assert.equal((await f.service.restorePurchases()).ok, true); assert.equal(f.player.udata.getDiamondNum(), before + 200);
  }
});

test('banked chests survive midnight/reload, open only from inventory and advance base-draw quests without paying Gems again', async () => {
  const f = await initialized(); assert.equal((await purchase(f, 'bundles', 'archer-starter')).ok, true);
  f.player.missionData.data.taskInfo = { id: 6, type: 7, num: 0, stage: 0 }; delete f.player.missionData.data.quests; delete f.player.missionData.data.questCursor; f.player.missionData.saveData();
  f.advance(86400000); assert.equal(view(f).chests[0].ownedCount, 1);
  const reload = await initialized(f.persist(), f.ledger), quote = view(reload), chest = quote.chests[0], before = reload.player.udata.getDiamondNum();
  const opened = reload.service.openChest(chest.id, quote.token); assert.equal(opened.ok, true);
  assert.equal(view(reload).chests[0].ownedCount, 0); assert.equal(reload.player.udata.getDiamondNum(), before);
  assert.equal(reload.player.missionData.data.quests.find(row => row.id === 6).num, chest.draws);
  assert.equal(reload.service.openChest(chest.id, quote.token).code, 'stale');
  assert.equal(reload.service.openChest(chest.id, view(reload).token).code, 'notOwned');
  assert.equal(reload.service.openChest('missing', view(reload).token).code, 'unavailable');
});

test('opening a banked chest recovers its consume, frozen Rune rolls and quest progress at every write boundary', async () => {
  async function prepared() {
    const f = await initialized(); assert.equal((await purchase(f, 'bundles', 'archer-starter')).ok, true);
    f.player.udata.setTreasureLevel({ id: 120006, level: 3, frame: 0 });
    f.player.missionData.data.taskInfo = { id: 6, type: 7, num: 0, stage: 0 }; delete f.player.missionData.data.quests; delete f.player.missionData.data.questCursor; f.player.missionData.saveData();
    f.state.writes = 0; return f;
  }
  const baseline = await prepared(); assert.equal(baseline.service.openChest('wooden-chest', view(baseline).token).ok, true);
  const expected = account(baseline), quest = clone(baseline.player.missionData.data.quests), boundaries = baseline.state.writes;
  for (let boundary = 1; boundary <= boundaries; boundary++) {
    const f = await prepared(), old = view(f); f.state.crashAt = boundary;
    assert.throws(() => f.service.openChest('wooden-chest', old.token), /process interruption/);
    const reload = await initialized(f.persist(), f.ledger); assert.deepEqual(account(reload), expected); assert.deepEqual(clone(reload.player.missionData.data.quests), quest);
    assert.equal(reload.randomCalls(), 0); assert.equal(reload.service.openChest('wooden-chest', old.token).code, 'stale');
  }
});

test('malformed commerce fails closed and preserves the saved record rather than resetting paid limits or inventory', async () => {
  for (const malformed of [null, {}, { version: 2 }, { ...Commerce.empty(), chests: { 'wooden-chest': -1 } }]) {
    const f = await initialized(); f.player.udata.data.shopCommerce = malformed; f.player.udata.data.futureCommerceOwner = 'retained'; f.player.udata.saveData(); f.state.writes = 0;
    const before = account(f), blocked = f.service.getView(); assert.equal(blocked.ready, false); assert.equal(blocked.code, 'unavailable');
    assert.equal(f.service.purchase('bundles', 'archer-starter', blocked.token).ok, false); assert.deepEqual(account(f), before); assert.equal(f.state.writes, 0);
  }
});
