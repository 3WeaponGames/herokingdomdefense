"use strict";
// Display geometry and formatting only. Purchases and stock belong to ShopRuntime.
exports.layout = function (bounds) {
  var baseWidth = Math.max(1, Math.min(900, bounds.right - bounds.left - 36));
  var currencyScale = Math.min(1, baseWidth / 722), center = (bounds.left + bounds.right) / 2;
  var top = bounds.top - 122 * currencyScale;
  var bottom = Math.min(bounds.top, isFinite(bounds.footer) ? Math.max(bounds.bottom, bounds.footer) : bounds.bottom + 120);
  var available = Math.max(0, top - bottom);
  // Keep the selected concept's card proportions, including a complete first
  // bundle, on shorter screens. Currency clearance uses the full lobby width.
  var width = Math.max(1, Math.min(baseWidth, available * 722 / 974)), scale = Math.min(1, width / 722);
  var chromeScale = Math.min(scale, available / 338);
  var title = top - 40 * chromeScale, tabs = title - 80 * chromeScale, daily = tabs - 123 * chromeScale;
  var listTop = Math.max(bottom, daily - 95 * chromeScale), height = listTop - bottom;
  return { width: width, scale: scale, currencyScale: currencyScale, chromeScale: chromeScale, center: center, title: title, tabs: tabs, daily: daily,
    listTop: listTop, listBottom: bottom, listHeight: height, listY: (listTop + bottom) / 2 };
};
exports.cost = function (value) { if (typeof value === "number") return { currency: 2002, amount: value }; value = value || {}; return { currency: Number(value.currency === undefined ? value.id : value.currency), amount: Number(value.amount === undefined ? value.num : value.amount) || 0 }; };
// JSB's Number.toLocaleString does not consistently group digits like Browser.
exports.formatAmount = function (value) {
  var numeric = Number(value), parts = String(isFinite(numeric) ? numeric : 0).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ","); return parts.join(".");
};
exports.referencePrice = function (payment) {
  var amount = payment && Number(payment.priceMinor);
  return isFinite(amount) && amount >= 0 ? (payment.currency || "USD") + " " + (amount / 100).toFixed(2) : "—";
};
exports.percent = function (chance) { return Math.round(Math.max(0, Math.min(1, Number(chance) || 0)) * 10000) / 100; };
exports.chestLayout = function (width, scale) {
  return { height: 344 * scale, iconX: -width * .26, iconY: 9 * scale,
    previewX: [width * .11, width * .35], previewY: 12 * scale,
    previewWidth: 148 * scale, previewHeight: 148 * scale,
    buyX: -width * .305, buyY: -128 * scale, buyWidth: width * .35, buyHeight: 72 * scale,
    openX: width * .055, openY: -126 * scale, openWidth: width * .25, openHeight: 64 * scale,
    hintX: width * .335, hintY: -126 * scale, hintWidth: width * .285, hintHeight: 64 * scale };
};
exports.presentationSignature = function (view) {
  return JSON.stringify([view.pending, ["bundles", "chests", "relics", "resources"].map(function (kind) {
    return (view[kind] || []).map(function (offer) { var payment = offer.payment;
      return [offer.id, offer.available, offer.soldOut, offer.purchaseCount, offer.firstPurchaseAvailable, offer.ownedCount,
        payment && [payment.available, payment.formattedPrice, payment.pending, payment.error, payment.code]];
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
