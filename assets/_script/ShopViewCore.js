"use strict";
// Display geometry and formatting only. Purchases and stock belong to ShopRuntime.
exports.layout = function (bounds) {
  var width = Math.min(900, Math.max(280, bounds.right - bounds.left - 28));
  var scale = Math.min(1, width / 722), center = (bounds.left + bounds.right) / 2;
  var top = bounds.top - 122 * scale, bottom = bounds.bottom + 144 * scale;
  var title = top - 48 * scale, tabs = title - 90 * scale, daily = tabs - 124 * scale;
  var listTop = daily - 92 * scale, height = Math.max(96 * scale, listTop - bottom);
  return { width: width, scale: scale, center: center, title: title, tabs: tabs, daily: daily,
    listTop: listTop, listBottom: bottom, listHeight: height, listY: (listTop + bottom) / 2 };
};
exports.cost = function (value) { if (typeof value === "number") return { currency: 2002, amount: value }; value = value || {}; return { currency: Number(value.currency === undefined ? value.id : value.currency), amount: Number(value.amount === undefined ? value.num : value.amount) || 0 }; };
exports.referencePrice = function (payment) {
  var amount = payment && Number(payment.priceMinor);
  return isFinite(amount) && amount >= 0 ? (payment.currency || "USD") + " " + (amount / 100).toFixed(2) : "—";
};
exports.percent = function (chance) { return Math.round(Math.max(0, Math.min(1, Number(chance) || 0)) * 10000) / 100; };
exports.presentationSignature = function (view) {
  return JSON.stringify([view.pending, ["bundles", "chests", "relics", "resources"].map(function (kind) {
    return (view[kind] || []).map(function (offer) { var payment = offer.payment;
      return [offer.id, offer.available, offer.soldOut, offer.purchaseCount, offer.firstPurchaseAvailable, offer.ownedCount,
        payment && [payment.available, payment.formattedPrice, payment.pending, payment.error]];
    });
  })]);
};
exports.time = function (seconds) {
  var totalMinutes = Math.max(0, Math.ceil((Number(seconds) || 0) / 60));
  var hours = Math.floor(totalMinutes / 60), minutes = totalMinutes % 60;
  function pad(value) { return value < 10 ? "0" + value : String(value); }
  return pad(hours) + "h " + pad(minutes) + "m";
};
exports.tap = function (event) {
  if (!event || !event.getLocation || !event.getStartLocation) return true;
  var a = event.getLocation(), b = event.getStartLocation(); return Math.hypot(a.x - b.x, a.y - b.y) <= 14;
};
