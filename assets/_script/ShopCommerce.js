"use strict";

// Lifetime purchases and banked chests deliberately live outside daily stock.
// An absent record is a virtual empty inventory; merely opening the shop writes
// nothing here. All mutations are committed by PlayerMgr's reward journal.
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function whole(value) { return typeof value === "number" && isFinite(value) && Math.floor(value) === value && value >= 0 && value <= 9007199254740991; }
function key(value) { return typeof value === "string" && value.length > 0 && value.length <= 1024 && value !== "__proto__" && value !== "constructor" && value !== "prototype"; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
function owns(value, field) { return Object.prototype.hasOwnProperty.call(value, field); }
function empty() { return { version: 1, revision: 0, bundleCounts: {}, gemFirst: {}, chests: {}, receipts: {} }; }
function validate(state) {
  if (!object(state) || state.version !== 1 || !whole(state.revision)) throw new Error("Invalid shop commerce record");
  if (state.accountId !== undefined && !key(state.accountId)) throw new Error("Invalid shop purchase account");
  ["bundleCounts", "gemFirst", "chests", "receipts"].forEach(function (field) {
    if (!object(state[field])) throw new Error("Invalid shop commerce " + field);
    Object.keys(state[field]).forEach(function (id) {
      var value = state[field][id];
      if (!key(id)) throw new Error("Invalid shop commerce key");
      if (field === "gemFirst" ? value !== true : field === "receipts" ? !object(value) || !key(value.productId) || !key(value.offerId) || !whole(value.purchaseNumber) || value.purchaseNumber < 1 || ["bundles", "resources"].indexOf(value.kind) < 0 : !whole(value)) throw new Error("Invalid shop commerce value");
    });
  });
  return state;
}
function read(value) { return value === undefined ? empty() : validate(value); }
function count(table, id) { if (!key(id)) throw new Error("Invalid shop product"); return owns(table, id) ? table[id] : 0; }
function revise(state) {
  var next = clone(validate(state));
  if (!whole(next.revision + 1)) throw new Error("Shop commerce revision is exhausted");
  next.revision++;
  return next;
}
function addChests(state, rewards) {
  var next = clone(validate(state));
  rewards.forEach(function (row) {
    if (!row || !key(row.chestId) || !whole(row.num) || row.num < 1) throw new Error("Invalid chest inventory reward");
    var amount = count(next.chests, row.chestId) + row.num;
    if (!whole(amount)) throw new Error("Chest inventory is full");
    next.chests[row.chestId] = amount;
  });
  return next;
}
function consumeChest(state, id) {
  var next = revise(state), owned = count(next.chests, id);
  if (owned < 1) throw new Error("This chest is not owned");
  next.chests[id] = owned - 1;
  return next;
}
function receipt(state, id) {
  validate(state);
  if (!key(id)) throw new Error("Invalid purchase receipt");
  return owns(state.receipts, id) ? state.receipts[id] : null;
}
function purchaseReceipt(state, proof) {
  var byId = receipt(state, proof.receiptId);
  if (byId) return byId;
  var ids = Object.keys(state.receipts);
  for (var index = 0; index < ids.length; index++) {
    var row = state.receipts[ids[index]];
    if (row.productId === proof.productId && row.purchaseNumber === proof.purchaseNumber) return row;
  }
  return null;
}
function recordPurchase(state, proof, kind, offer) {
  validate(state);
  if (!proof || !key(proof.receiptId) || !key(proof.productId) || !key(proof.accountId) || !whole(proof.purchaseNumber) || proof.purchaseNumber < 1 || proof.firstPurchase !== (proof.purchaseNumber === 1) || !offer || !key(offer.id) || !offer.payment || offer.payment.productId !== proof.productId || ["bundles", "resources"].indexOf(kind) < 0) throw new Error("Invalid verified shop purchase");
  if (state.accountId !== undefined && state.accountId !== proof.accountId) throw new Error("The purchase belongs to a different account");
  var previous = purchaseReceipt(state, proof);
  if (previous) {
    if (previous.productId !== proof.productId || previous.purchaseNumber !== proof.purchaseNumber || previous.kind !== kind || previous.offerId !== offer.id) throw new Error("The purchase receipt belongs to another product");
    return state;
  }
  var next = revise(state);
  next.accountId = proof.accountId;
  if (kind === "bundles") {
    var bought = count(state.bundleCounts, offer.id), limit = offer.purchaseLimit;
    if (!whole(limit) || limit < 1 || proof.purchaseNumber > limit) throw new Error("This bundle's purchase limit has been reached");
    // Restores can arrive out of order. The server's lifetime ordinal controls
    // the cap, while each missing paid entitlement still receives its content.
    next.bundleCounts[offer.id] = Math.max(bought, proof.purchaseNumber);
  } else if (offer.firstPurchaseDouble) next.gemFirst[offer.id] = true;
  next.receipts[proof.receiptId] = { productId: proof.productId, purchaseNumber: proof.purchaseNumber, kind: kind, offerId: offer.id };
  return next;
}
exports.empty = empty;
exports.read = read;
exports.validate = validate;
exports.clone = clone;
exports.revise = revise;
exports.addChests = addChests;
exports.consumeChest = consumeChest;
exports.recordPurchase = recordPurchase;
exports.receipt = receipt;
exports.purchaseReceipt = purchaseReceipt;
exports.purchaseCount = function (state, id) { return count(validate(state).bundleCounts, id); };
exports.ownedCount = function (state, id) { return count(validate(state).chests, id); };
exports.firstAvailable = function (state, id) { validate(state); if (!key(id)) throw new Error("Invalid shop product"); return !owns(state.gemFirst, id); };
