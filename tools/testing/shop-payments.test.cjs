'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Payments = require('../../assets/_script/ShopPayments');
const PRODUCT = { productId: 'hkd.gems.100', currency: 'USD', priceMinor: 99 };
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function fixture(overrides = {}) {
  const state = { events: [], delivered: 0, ledger: new Set(), purchases: [], ordinal: 1 };
  const settings = {
    accountId: 'account-A', timeoutMs: 1000, checkoutTimeoutMs: 1000,
    store: {
      async getProducts(ids) { state.events.push('products'); return ids.map(productId => ({ productId, currency: 'EUR', formattedPrice: '0,99 €' })); },
      async purchase(productId, intent) {
        state.events.push('purchase');
        const transaction = { status: 'purchased', transactionId: 'transaction-' + (state.purchases.length + 1), productId, intentId: intent.intentId };
        state.purchases.push(transaction); return transaction;
      },
      async getPendingPurchases() { state.events.push('restore'); return state.purchases.slice(); },
      async finish(transaction) { state.events.push('finish'); state.purchases = state.purchases.filter(row => row.transactionId !== transaction.transactionId); }
    },
    async authorizePurchase(context) { state.events.push('authorize'); state.authorization = context; return { ...context, allowed: true, intentId: 'intent-A', purchaseNumber: state.ordinal }; },
    async verifyPurchase(transaction, context) { state.events.push('verify'); state.verification = context; return { status: 'verified', receiptId: transaction.transactionId, productId: context.productId, accountId: context.accountId, purchaseNumber: state.ordinal, firstPurchase: state.ordinal === 1 }; }
  };
  const store = settings.store; Object.assign(settings, overrides); settings.store = Object.assign({}, store, overrides.store);
  const adapter = Payments.create(settings);
  function fulfill(cap) {
    state.capability = cap;
    return adapter.consumeVerifiedEntitlement(cap, proof => {
      state.events.push('fulfill'); state.proof = proof;
      if (!state.ledger.has(proof.receiptId)) { state.delivered++; state.ledger.add(proof.receiptId); }
      return { ok: true, rewards: [{ id: 2002, num: 100 }] };
    });
  }
  return { adapter, state, settings, fulfill, async ready() { assert.equal((await adapter.loadProducts([PRODUCT])).ok, true); return this; } };
}

test('unconfigured payments never enable checkout, contact stores, authenticate a raw receipt or grant rewards', async () => {
  for (const options of [undefined, {}, { accountId: 'A', store: {} }]) {
    const service = Payments.create(options); let calls = 0;
    assert.equal(service.describe(PRODUCT).available, false); assert.equal(service.describe(PRODUCT).formattedPrice, null);
    assert.equal((await service.purchase(PRODUCT, () => calls++)).code, 'paymentUnavailable');
    assert.equal((await service.restorePending(() => calls++)).ok, false);
    assert.equal(service.consumeVerifiedEntitlement({ verified: true }, () => calls++).code, 'unverified'); assert.equal(calls, 0);
  }
});

test('only store-provided localized product metadata enables a paid product; unknown and invalid rows stay disabled', async () => {
  const f = fixture(); assert.equal(f.adapter.describe(PRODUCT).available, false); await f.ready();
  assert.deepEqual(f.adapter.describe(PRODUCT), { available: true, formattedPrice: '0,99 €', currency: 'EUR', accountId: 'account-A', pending: false, code: null });
  assert.equal(f.adapter.describe({ productId: 'unknown' }).available, false); assert.equal(f.state.delivered, 0);
  await f.adapter.loadProducts([PRODUCT]); assert.equal(f.state.events.filter(e => e === 'products').length, 1);
  for (const row of [{ productId: PRODUCT.productId, currency: 'EUR' }, { productId: PRODUCT.productId, formattedPrice: '$0.99', currency: 'bad' }]) {
    const broken = fixture({ store: { getProducts: async () => [row] } }); assert.equal((await broken.adapter.loadProducts([PRODUCT])).ok, false); assert.equal(broken.adapter.describe(PRODUCT).available, false);
  }
});

test('server authorization precedes checkout and verification; durable fulfillment precedes acknowledgement', async () => {
  const f = await fixture().ready(), result = await f.adapter.purchase({ ...PRODUCT, purchaseLimit: 2 }, f.fulfill);
  assert.equal(result.ok, true); assert.equal(f.state.delivered, 1);
  assert.deepEqual(f.state.events, ['products', 'authorize', 'purchase', 'verify', 'fulfill', 'finish']);
  assert.equal(f.state.authorization.purchaseLimit, 2); assert.equal(f.state.verification.intentId, 'intent-A');
  assert.equal(f.state.proof.firstPurchase, true); assert.equal(f.state.proof.purchaseNumber, 1); assert(Object.isFrozen(f.state.proof));
  assert.equal(f.adapter.describe(PRODUCT).available, true);
});

test('denied or mismatched server eligibility cannot open checkout or consume a bundle slot', async () => {
  for (const response of [{ allowed: false }, { allowed: true, intentId: 'A', accountId: 'other', productId: PRODUCT.productId }, { allowed: true, accountId: 'account-A', productId: PRODUCT.productId }]) {
    const f = await fixture({ authorizePurchase: async () => response }).ready(); assert.equal((await f.adapter.purchase(PRODUCT, f.fulfill)).ok, false);
    assert.equal(f.state.events.includes('purchase'), false); assert.equal(f.state.delivered, 0);
  }
});

test('concurrent buy clicks issue one authorization and one checkout', async () => {
  const f = await fixture().ready(); const first = f.adapter.purchase(PRODUCT, f.fulfill), second = f.adapter.purchase(PRODUCT, f.fulfill);
  assert.equal((await second).code, 'paymentPending'); assert.equal((await first).ok, true);
  assert.equal(f.state.events.filter(e => e === 'purchase').length, 1); assert.equal(f.state.delivered, 1);
});

test('an authoritative first-purchase quote change updates display eligibility before charging and releases its unused intent', async () => {
  const f = await fixture({ cancelAuthorization: async intent => { f.state.cancelledIntent = intent.intentId; } }).ready(); f.state.ordinal = 2;
  const result = await f.adapter.purchase({ ...PRODUCT, expectedFirstPurchase: true }, f.fulfill);
  assert.equal(result.code, 'paymentQuoteChanged'); assert.equal(f.state.events.includes('purchase'), false); assert.equal(f.state.delivered, 0);
  assert.equal(f.state.authorization.expectedFirstPurchase, true); assert.equal(f.state.cancelledIntent, 'intent-A');
  assert.equal(f.adapter.describe(PRODUCT).firstPurchaseAvailable, false); assert.equal(f.adapter.describe(PRODUCT).purchaseCount, 1);
  assert.equal((await f.adapter.purchase({ ...PRODUCT, expectedFirstPurchase: false }, f.fulfill)).ok, true); assert.equal(f.state.proof.firstPurchase, false);
});

test('missing or over-limit preflight ordinals never open checkout even if a backend incorrectly says allowed', async () => {
  const capped = await fixture().ready(); capped.state.ordinal = 3;
  assert.equal((await capped.adapter.purchase({ ...PRODUCT, purchaseLimit: 2 }, capped.fulfill)).code, 'purchaseLimit');
  assert.equal(capped.state.events.includes('purchase'), false); assert.equal(capped.state.delivered, 0);
  const missing = await fixture({ authorizePurchase: async context => ({ ...context, allowed: true, intentId: 'no-ordinal' }) }).ready();
  assert.equal((await missing.adapter.purchase(PRODUCT, missing.fulfill)).ok, false); assert.equal(missing.state.events.includes('purchase'), false);
});

test('verification must match the ordinal reserved by this checkout intent', async () => {
  const f = await fixture({ verifyPurchase: async (_transaction, context) => ({ status: 'verified', receiptId: 'changed-ordinal', productId: context.productId, accountId: context.accountId, purchaseNumber: 2, firstPurchase: false }) }).ready();
  assert.equal((await f.adapter.purchase({ ...PRODUCT, expectedFirstPurchase: true }, f.fulfill)).code, 'unverified');
  assert.equal(f.state.delivered, 0); assert.equal(f.state.events.includes('finish'), false); assert.equal(f.adapter.describe(PRODUCT).pending, true);
});

for (const status of ['cancelled', 'pending', 'failed']) test('a ' + status + ' store purchase grants nothing and is never acknowledged', async () => {
  const f = await fixture({ store: { purchase: async () => ({ status, productId: PRODUCT.productId, transactionId: 'incomplete' }) } }).ready();
  assert.equal((await f.adapter.purchase(PRODUCT, f.fulfill)).ok, false); assert.equal(f.state.delivered, 0);
  assert.equal(f.state.events.includes('verify'), false); assert.equal(f.state.events.includes('finish'), false);
  assert.equal(f.adapter.describe(PRODUCT).pending, status === 'pending');
});

test('SDK failure, unknown product and forged completed callback never grant rewards', async () => {
  const f = await fixture({ store: { purchase: async () => { throw Error('SDK unavailable'); } } }).ready();
  assert.equal((await f.adapter.purchase(PRODUCT, f.fulfill)).ok, false); assert.equal(f.state.delivered, 0);
  assert.equal((await f.adapter.purchase({ productId: 'not-registered' }, f.fulfill)).ok, false);
  const forged = await fixture().ready();
  assert.equal((await forged.adapter.purchase(PRODUCT, () => ({ ok: true }))).code, 'unverified'); assert.equal(forged.state.events.includes('finish'), false);
});

test('private receipt capabilities cannot be copied, reused across adapters or consumed twice', async () => {
  const f = await fixture().ready(); await f.adapter.purchase(PRODUCT, f.fulfill); let extra = 0;
  assert.equal(f.adapter.consumeVerifiedEntitlement(f.state.capability, () => extra++).ok, true); assert.equal(extra, 0);
  assert.equal(f.adapter.consumeVerifiedEntitlement({ ...f.state.capability }, () => extra++).code, 'unverified');
  assert.equal(fixture().adapter.consumeVerifiedEntitlement(f.state.capability, () => extra++).code, 'unverified'); assert.equal(extra, 0);
});

test('unverified, mismatched account/product, invalid ordinal and conflicting first-purchase proof cannot grant or acknowledge', async () => {
  const invalid = [{ status: 'pending' }, { accountId: 'other' }, { productId: 'other' }, { receiptId: '' }, { purchaseNumber: 0 }, { purchaseNumber: 1.5 }, { firstPurchase: false }];
  for (const patch of invalid) {
    const f = await fixture({ verifyPurchase: async (transaction, context) => ({ status: 'verified', receiptId: transaction.transactionId, accountId: context.accountId, productId: context.productId, purchaseNumber: 1, firstPurchase: true, ...patch }) }).ready();
    assert.equal((await f.adapter.purchase(PRODUCT, f.fulfill)).code, 'unverified'); assert.equal(f.state.delivered, 0); assert.equal(f.state.events.includes('finish'), false);
    assert.equal(f.adapter.describe(PRODUCT).pending, true);
  }
});

test('failed durable save leaves the store receipt unfinished and a fresh restore can deliver it', async () => {
  const f = await fixture().ready();
  const result = await f.adapter.purchase(PRODUCT, cap => f.adapter.consumeVerifiedEntitlement(cap, () => ({ ok: false, code: 'save' })));
  assert.equal(result.code, 'save'); assert.equal(f.state.events.includes('finish'), false); assert.equal(f.adapter.describe(PRODUCT).pending, true);
  assert.equal((await f.adapter.restorePending(f.fulfill)).ok, true); assert.equal(f.state.delivered, 1); assert.equal(f.state.purchases.length, 0);
  assert.equal(f.adapter.describe(PRODUCT).available, true);
});

test('a failed acknowledgement restores the same receipt without granting it twice', async () => {
  const f = await fixture().ready(), finish = f.settings.store.finish; f.settings.store.finish = async () => false;
  const result = await f.adapter.purchase(PRODUCT, f.fulfill); assert.equal(result.ok, true); assert.equal(result.pendingAcknowledgement, true); assert.equal(f.state.delivered, 1);
  f.settings.store.finish = finish; assert.equal((await f.adapter.restorePending(f.fulfill)).ok, true);
  assert.equal(f.state.delivered, 1); assert.equal(f.state.purchases.length, 0);
});

test('a receipt removed or cancelled by the store cannot keep paid controls stuck pending', async () => {
  for (const cancelled of [false, true]) {
    const f = await fixture({ verifyPurchase: async () => ({ status: 'pending' }) }).ready();
    assert.equal((await f.adapter.purchase(PRODUCT, f.fulfill)).ok, false); assert.equal(f.adapter.describe(PRODUCT).pending, true);
    if (cancelled) f.state.purchases[0].status = 'cancelled'; else f.state.purchases = [];
    await f.adapter.restorePending(f.fulfill);
    assert.equal(f.adapter.describe(PRODUCT).available, true); assert.equal(f.state.delivered, 0); assert.equal(f.state.events.includes('finish'), false);
  }
});

test('restoration verifies each pending receipt, skips duplicate SDK callbacks and retains authoritative first-purchase ordinals', async () => {
  const f = await fixture().ready(), t = { status: 'purchased', productId: PRODUCT.productId, transactionId: 'restored-A' };
  f.state.purchases = [t, t]; f.state.ordinal = 2;
  assert.equal((await f.adapter.restorePending(f.fulfill)).ok, true); assert.equal(f.state.delivered, 1); assert.equal(f.state.proof.purchaseNumber, 2); assert.equal(f.state.proof.firstPurchase, false);
  assert.equal(f.state.events.filter(e => e === 'verify').length, 1);
});

test('payment account/config cannot change while checkout or metadata loading is in flight', async () => {
  const f = await fixture().ready(), operation = f.adapter.purchase(PRODUCT, f.fulfill);
  assert.throws(() => f.adapter.configure({}), /during a payment/); await operation;
  assert.equal(f.adapter.configure(null), false); assert.equal(f.adapter.consumeVerifiedEntitlement(f.state.capability, () => ({ ok: true })).code, 'unverified');
  assert.equal(f.adapter.describe(PRODUCT).available, false);
});

test('verification timeout does not grant or acknowledge, and late verification cannot deliver after timeout', async () => {
  let complete; const f = await fixture({ timeoutMs: 10, verifyPurchase: () => new Promise(resolve => { complete = resolve; }) }).ready();
  assert.equal((await f.adapter.purchase(PRODUCT, f.fulfill)).code, 'verificationPending');
  complete({ status: 'verified', receiptId: 'late', productId: PRODUCT.productId, accountId: 'account-A', purchaseNumber: 1 }); await wait(15);
  assert.equal(f.state.delivered, 0); assert.equal(f.state.events.includes('finish'), false);
});

test('store checkout timeout leaves purchase controls pending until the SDK is queried for recovery', async () => {
  const f = await fixture({ checkoutTimeoutMs: 10, store: { purchase: () => new Promise(() => {}) } }).ready();
  assert.equal((await f.adapter.purchase(PRODUCT, f.fulfill)).code, 'paymentPending'); assert.equal(f.adapter.describe(PRODUCT).pending, true);
  assert.equal(f.state.delivered, 0); assert.equal((await f.adapter.restorePending(f.fulfill)).ok, true); assert.equal(f.adapter.describe(PRODUCT).available, true);
});

test('payment adapter loads without Cocos, a TestMode singleton or platform SDK side effects', () => {
  const context = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/_script/ShopPayments.js'), 'utf8'), context);
  assert.equal(context.exports.getInstance().describe(PRODUCT).available, false); assert.equal(typeof context.exports.configure, 'function');
});
