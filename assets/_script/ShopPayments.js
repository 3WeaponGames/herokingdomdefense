"use strict";

// Store adapters supply localized products and unfinished transactions. The
// application's trusted backend authorizes eligibility BEFORE checkout and
// verifies receipts BEFORE the durable game transaction can grant anything.
// No configured adapter means no real-money checkout, including in Test Mode.
var MAX_INTEGER = 9007199254740991;
function validText(value) { return typeof value === "string" && value.length > 0 && value.length <= 256; }
function productId(value) { return validText(value) && /^[a-zA-Z0-9._-]+$/.test(value); }
function positive(value) { return typeof value === "number" && isFinite(value) && Math.floor(value) === value && value > 0 && value <= MAX_INTEGER; }
function failure(code) { return { ok: false, code: code, rewards: [] }; }
function payment(value) {
  return value && productId(value.productId) && (value.purchaseLimit === undefined || positive(value.purchaseLimit)) &&
    (value.expectedFirstPurchase === undefined || typeof value.expectedFirstPurchase === "boolean");
}

exports.create = function (initial) {
  var config = null, generation = 0, products = Object.create(null), requested = Object.create(null), eligibility = Object.create(null);
  var loading = null, restoring = null, active = false, uncertain = false, pending = Object.create(null), proofs = new WeakMap();

  function configured() {
    return config && validText(config.accountId) && config.store && typeof config.store.getProducts === "function" &&
      typeof config.store.purchase === "function" && typeof config.store.getPendingPurchases === "function" &&
      typeof config.store.finish === "function" && typeof config.authorizePurchase === "function" && typeof config.verifyPurchase === "function";
  }
  function timeout() { return config && positive(config.timeoutMs) ? Math.min(config.timeoutMs, 300000) : 20000; }
  function bounded(operation, milliseconds, code) {
    return new Promise(function (resolve, reject) {
      var done = false, timer = setTimeout(function () { if (!done) { done = true; reject({ paymentCode: code }); } }, milliseconds);
      Promise.resolve().then(operation).then(function (value) {
        if (!done) { done = true; clearTimeout(timer); resolve(value); }
      }, function () { if (!done) { done = true; clearTimeout(timer); reject({ paymentCode: code }); } });
    });
  }
  function describe(value) {
    var row = payment(value) && products[value.productId], waiting = active || uncertain || !!restoring || Object.keys(pending).length > 0;
    var view = { available: !!configured() && !!row && !waiting, formattedPrice: row ? row.formattedPrice : null,
      currency: row ? row.currency : null, accountId: configured() ? config.accountId : null, pending: waiting,
      code: !configured() ? "paymentUnavailable" : waiting ? "paymentPending" : row ? null : "paymentLoading" };
    if (value && eligibility[value.productId]) Object.assign(view, eligibility[value.productId]);
    return view;
  }
  function loadProducts(values) {
    if (!Array.isArray(values) || values.some(function (row) { return !payment(row); })) return Promise.resolve(failure("unavailable"));
    values.forEach(function (row) { requested[row.productId] = true; });
    if (!configured()) return Promise.resolve(failure("paymentUnavailable"));
    if (loading) return loading.then(function () { return loadProducts(values); });
    var missing = Object.keys(requested).filter(function (id) { return !products[id]; });
    if (!missing.length) return Promise.resolve({ ok: true });
    var current = generation, selected = config;
    loading = bounded(function () { return selected.store.getProducts(missing.slice()); }, timeout(), "paymentUnavailable").then(function (rows) {
      if (generation !== current || !Array.isArray(rows)) return failure("paymentUnavailable");
      var accepted = Object.create(null);
      rows.forEach(function (row) {
        if (row && missing.indexOf(row.productId) >= 0 && validText(row.formattedPrice) && typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency) && !accepted[row.productId]) {
          accepted[row.productId] = { productId: row.productId, formattedPrice: row.formattedPrice, currency: row.currency };
        }
      });
      Object.keys(accepted).forEach(function (id) { products[id] = accepted[id]; });
      var ready = missing.every(function (id) { return !!products[id]; });
      return { ok: ready, code: ready ? null : "paymentUnavailable" };
    }, function () { return failure("paymentUnavailable"); }).then(function (result) { loading = null; return result; });
    return loading;
  }
  function consumeVerifiedEntitlement(capability, callback) {
    var record = capability && proofs.get(capability);
    if (!record || record.generation !== generation || !configured() || record.proof.accountId !== config.accountId || typeof callback !== "function") return failure("unverified");
    if (record.completed) return record.result;
    if (record.running) return failure("paymentPending");
    record.running = true;
    function finish(result) {
      record.running = false;
      if (result && result.ok === true) { record.completed = true; record.result = result; }
      return result || failure("save");
    }
    try {
      var result = callback(record.proof);
      if (result && typeof result.then === "function") return result.then(finish, function (error) { record.running = false; throw error; });
      return finish(result);
    } catch (error) { record.running = false; throw error; }
  }
  function delivery(transaction, expectedId, intentId, fulfill, current, selected, expectedNumber) {
    if (!transaction || transaction.status !== "purchased") {
      if (transaction && transaction.status === "cancelled") { delete pending[transaction.transactionId]; return Promise.resolve(failure("paymentCancelled")); }
      if (transaction && transaction.status === "failed") { delete pending[transaction.transactionId]; return Promise.resolve(failure("paymentUnavailable")); }
      uncertain = true; return Promise.resolve(failure("paymentPending"));
    }
    if (!validText(transaction.transactionId) || !productId(transaction.productId) || transaction.productId !== expectedId || !requested[expectedId] ||
        intentId && transaction.intentId && transaction.intentId !== intentId) return Promise.resolve(failure("unverified"));
    var key = transaction.transactionId;
    pending[key] = transaction;
    return bounded(function () {
      return selected.verifyPurchase(transaction, { productId: expectedId, accountId: selected.accountId, intentId: intentId || transaction.intentId || null, purchaseNumber: expectedNumber || null });
    }, timeout(), "verificationPending").then(function (verified) {
      if (generation !== current || !verified || verified.status !== "verified" || !validText(verified.receiptId) ||
          verified.productId !== expectedId || verified.accountId !== selected.accountId || !positive(verified.purchaseNumber) || expectedNumber && verified.purchaseNumber !== expectedNumber ||
          (verified.firstPurchase !== undefined && verified.firstPurchase !== (verified.purchaseNumber === 1))) return failure("unverified");
      var proof = Object.freeze({ receiptId: verified.receiptId, productId: expectedId, accountId: verified.accountId,
        purchaseNumber: verified.purchaseNumber, firstPurchase: verified.purchaseNumber === 1 });
      var capability = Object.freeze({});
      var record = { generation: current, proof: proof, running: false, completed: false };
      proofs.set(capability, record);
      return Promise.resolve().then(function () { return fulfill(capability); }).then(function (result) {
        // The SDK must not consume/acknowledge a purchase until the account
        // journal and its receipt are durable, even if the UI has been hidden.
        if (!result || !result.ok) return result || failure("save");
        if (!record.completed) return failure("unverified");
        var old = eligibility[expectedId] || {};
        eligibility[expectedId] = { firstPurchaseAvailable: false, purchaseCount: Math.max(old.purchaseCount || 0, verified.purchaseNumber) };
        return bounded(function () { return selected.store.finish(transaction); }, timeout(), "acknowledgementPending").then(function (finished) {
          if (finished === false || finished && finished.ok === false) return Object.assign({}, result, { pendingAcknowledgement: true });
          delete pending[key]; return result;
        }, function () { return Object.assign({}, result, { pendingAcknowledgement: true }); });
      });
    }, function () { return failure("verificationPending"); });
  }
  function purchase(value, fulfill) {
    if (!payment(value) || typeof fulfill !== "function") return Promise.resolve(failure("unavailable"));
    var status = describe(value);
    if (!status.available) return Promise.resolve(failure(status.code));
    active = true;
    var current = generation, selected = config, authorization;
    return bounded(function () {
      return selected.authorizePurchase({ accountId: selected.accountId, productId: value.productId, purchaseLimit: value.purchaseLimit || null, expectedFirstPurchase: value.expectedFirstPurchase });
    }, timeout(), "paymentUnavailable").then(function (result) {
      if (result && result.accountId === selected.accountId && result.productId === value.productId) {
        var known = eligibility[value.productId] || {};
        if (typeof result.firstPurchaseAvailable === "boolean") known.firstPurchaseAvailable = result.firstPurchaseAvailable;
        if (typeof result.purchaseCount === "number" && isFinite(result.purchaseCount) && result.purchaseCount >= 0 && Math.floor(result.purchaseCount) === result.purchaseCount) known.purchaseCount = result.purchaseCount;
        eligibility[value.productId] = known;
      }
      if (result && result.allowed === false) return failure(result.code === "purchaseLimit" ? "purchaseLimit" : "paymentUnavailable");
      if (generation !== current || !result || result.allowed !== true || !validText(result.intentId) || result.accountId !== selected.accountId || result.productId !== value.productId || !positive(result.purchaseNumber) ||
          result.firstPurchase !== undefined && result.firstPurchase !== (result.purchaseNumber === 1)) return failure("paymentUnavailable");
      authorization = result;
      eligibility[value.productId] = { firstPurchaseAvailable: result.purchaseNumber === 1, purchaseCount: result.purchaseNumber - 1 };
      var limitReached = value.purchaseLimit && result.purchaseNumber > value.purchaseLimit;
      var quoteChanged = typeof value.expectedFirstPurchase === "boolean" && value.expectedFirstPurchase !== (result.purchaseNumber === 1);
      if (limitReached || quoteChanged) {
        // Release a reserved intent if another device changed the displayed
        // lifetime/first-purchase eligibility. Never charge for a lesser quote.
        var cancelled = typeof selected.cancelAuthorization === "function" ? bounded(function () { return selected.cancelAuthorization(result); }, timeout(), "paymentUnavailable").catch(function () {}) : Promise.resolve();
        return cancelled.then(function () { return failure(limitReached ? "purchaseLimit" : "paymentQuoteChanged"); });
      }
      var storeTimeout = positive(selected.checkoutTimeoutMs) ? Math.min(selected.checkoutTimeoutMs, 600000) : 120000;
      return bounded(function () { return selected.store.purchase(value.productId, { intentId: authorization.intentId, accountId: selected.accountId }); }, storeTimeout, "paymentPending").then(function (transaction) {
        return delivery(transaction, value.productId, authorization.intentId, fulfill, current, selected, authorization.purchaseNumber);
      });
    }).catch(function (error) {
      if (error && error.paymentCode === "paymentPending") uncertain = true;
      return failure(error && error.paymentCode || "paymentUnavailable");
    }).then(function (result) { active = false; return result; });
  }
  function restorePending(fulfill) {
    if (!configured() || typeof fulfill !== "function") return Promise.resolve(failure("paymentUnavailable"));
    if (restoring) return restoring;
    if (active) return Promise.resolve(failure("paymentPending"));
    var current = generation, selected = config;
    restoring = bounded(function () { return selected.store.getPendingPurchases(); }, timeout(), "paymentUnavailable").then(function (rows) {
      if (generation !== current || !Array.isArray(rows)) return failure("paymentUnavailable");
      uncertain = false;
      var seen = Object.create(null), results = [], sequence = Promise.resolve();
      var unfinished = Object.create(null);
      rows.forEach(function (row) { if (row && validText(row.transactionId)) unfinished[row.transactionId] = true; });
      // The bridge's complete unfinished-transaction list is authoritative.
      // A cancelled/refunded or remotely finished receipt must not leave this
      // session's paid buttons permanently disabled by an old retry record.
      Object.keys(pending).forEach(function (id) { if (!unfinished[id]) delete pending[id]; });
      rows.forEach(function (transaction) {
        if (!transaction || !validText(transaction.transactionId) || seen[transaction.transactionId]) return;
        seen[transaction.transactionId] = true;
        sequence = sequence.then(function () {
          return delivery(transaction, transaction.productId, transaction.intentId, fulfill, current, selected).then(function (result) { results.push(result); });
        });
      });
      return sequence.then(function () { return { ok: results.every(function (row) { return row && row.ok; }), results: results }; });
    }).catch(function () { return failure("paymentUnavailable"); }).then(function (result) { restoring = null; return result; });
    return restoring;
  }
  function configure(value) {
    if (active || restoring || loading) throw new Error("Cannot change the store during a payment operation");
    config = value || null; generation++; products = Object.create(null); eligibility = Object.create(null); pending = Object.create(null); uncertain = false;
    if (configured()) loadProducts(Object.keys(requested).map(function (id) { return { productId: id }; }));
    return !!configured();
  }
  config = initial || null;
  return { describe: describe, loadProducts: loadProducts, purchase: purchase, consumeVerifiedEntitlement: consumeVerifiedEntitlement,
    restorePending: restorePending, configure: configure };
};

var instance;
exports.getInstance = function () { if (!instance) instance = exports.create(); return instance; };
exports.configure = function (options) { return exports.getInstance().configure(options); };
