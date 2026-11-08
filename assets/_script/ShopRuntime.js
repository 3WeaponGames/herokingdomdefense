"use strict";

// The shop uses the same durable debit/reward journal as the rest of the game.
// Its stock and claim flags deliberately do not share the old chest-pity table.
var Core = require("ShopCore");
var Catalog = require("ShopCatalog");
var Commerce = require("ShopCommerce");
var GOLD = 2001, GEMS = 2002;

function copy(value) { return JSON.parse(JSON.stringify(value)); }
function failure(code, message) { return { ok: false, code: code, error: message, rewards: [] }; }
function token(state) { return state.day + ":" + state.revision; }
function costView(cost) { return cost ? { currency: cost.id, amount: cost.num } : null; }

exports.create = function (player, dataMgr, options) {
  options = options || {};
  var now = options.now || function () { return Date.now(); };
  var random = options.rng || Math.random;
  var payments = options.payments || require("ShopPayments").getInstance();
  var catalog, catalogError, busy = false;
  try { catalog = Catalog.create(dataMgr); } catch (error) { catalogError = error; }

  function actionToken(state) {
    // A reward or upgrade elsewhere can change whether this purchase awards a
    // relic copy or overflow Gold, without changing the shop's own revision.
    var owned = player.udata.data.treasureInfo.map(function (row) { return [row.id, row.level, row.frame]; });
    owned.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; });
    var quotes = catalog.bundles.concat(catalog.resources).filter(function (row) { return !!row.payment; }).map(function (row) {
      var store = payments.describe(row.payment);
      return [row.payment.productId, store.accountId || null, typeof store.firstPurchaseAvailable === "boolean" ? store.firstPurchaseAvailable : null,
        typeof store.purchaseCount === "number" ? store.purchaseCount : null];
    });
    quotes.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    return token(state) + ":" + commerce().revision + "|" + JSON.stringify([owned, quotes]);
  }

  function commerce() { return Commerce.read(player.udata.data.shopCommerce); }
  function bumpStock() { var next = Core.clone(player.udata.data.shopState); next.revision++; player.udata.data.shopState = next; }
  function paymentPending() {
    return !!player.shopPaymentPending || !!(catalog && catalog.bundles.some(function (row) { return row.payment && payments.describe(row.payment).pending; }));
  }

  function rewardView(reward, quoteConversion) {
    if (reward.chestId) {
      var chest = catalog.chestById ? catalog.chestById[reward.chestId] : catalog.chests.filter(function (row) { return row.id === reward.chestId; })[0];
      if (!chest) throw new Error("Unknown banked chest");
      return { id: "chest:" + reward.chestId, chestId: reward.chestId, num: reward.num, name: chest.fallbackName, nameKey: chest.nameKey, icon: copy(chest.icon) };
    }
    var good = dataMgr.getGoodsCfgById(reward.id), row = copy(reward);
    var names = { 2001: "Gold", 2002: "Gems", 2005: "Energy" };
    row.name = row.name || good && good.name || names[row.id] || "Item " + row.id;
    if (!row.icon && good && good.icon) {
      row.icon = good.icon.indexOf("@icon/") === 0 ? { bundle: "resources", path: good.icon.slice(6) } : { bundle: "KinghtFallIconGood", path: good.icon };
    }
    if (good && good.type === 2) {
      var relic = dataMgr.getTreasureCfgById(good.itemID);
      if (relic) {
        row.relicId = relic.ID;
        row.quality = relic.Quality;
        if (good.sprBg) row.rarityFrame = good.sprBg.indexOf("@icon/") === 0 ? { bundle: "resources", path: good.sprBg.slice(6) } : { bundle: "KinghtFallIconGood", path: good.sprBg };
      }
    }
    if (quoteConversion === true && good && good.type === 2) row.conversionGold = conversionGold(good.itemID) * row.num;
    return row;
  }

  function conversionGold(relicId) {
    var owned = player.udata.getTreasureLevel(relicId), relic = dataMgr.getTreasureCfgById(relicId);
    if (!owned || !relic) return 0;
    var needed = 0;
    for (var level = Math.max(1, owned.level); level < relic.levelInfo.length; level++) needed += relic.levelInfo[level - 1].PieceCost;
    return owned.frame >= needed && relic.Conversion[0] === GOLD ? relic.Conversion[1] : 0;
  }

  function runeEffect() {
    var owned = player.udata.getTreasureLevel(120006), relic = owned && dataMgr.getTreasureCfgById(120006);
    var effect = relic && relic.levelInfo[owned.level - 1];
    return effect && effect.param ? effect : null;
  }

  function chestRewards(offer) {
    var mission = player.missionData;
    if (mission.recordQuestEvent) mission.recordQuestEvent(7, offer.draws);
    else {
      var task = mission.getTaskInfo();
      if (task && task.type === 7) { task.num += offer.draws; mission.setTaskInfo(task); }
    }
    var actual = grant(offer.rewards);
    Catalog.rollChest(offer, random, function (entry) {
      var reward = [{ id: entry.goodId, num: 1 }];
      Array.prototype.push.apply(actual, grant(reward));
      // Preserve the legacy draw order: even a Rune unlocked by this base
      // draw can award its extra copy before the next independent draw.
      var effect = runeEffect();
      if (effect && random() <= effect.param[0]) Array.prototype.push.apply(actual, grant(reward));
    });
    return Catalog.aggregate(actual);
  }

  function offerView(offer) {
    var result = copy(offer), ownedCommerce = commerce();
    result.name = offer.relicId && offer.nameKey || offer.fallbackName || offer.name || String(offer.id);
    result.cost = costView(offer.cost);
    result.rewards = (offer.rewards || (offer.goodId ? [{ id: offer.goodId, num: 1 }] : [])).map(function (row) { return rewardView(row, true); });
    if (offer.payment && offer.purchaseLimit) result.conversionGold = result.rewards.reduce(function (sum, row) { return sum + (row.conversionGold || 0); }, 0);
    if (offer.highlights) result.highlights = offer.highlights.map(function (row) { return rewardView(row, true); });
    if (offer.possibleRewards) result.possibleRewards = offer.possibleRewards.filter(function (row) { return !row.guaranteed; }).map(rewardView);
    if (offer.draws) {
      var effect = runeEffect(), chance = effect && Number(effect.param[0]);
      result.extraCopyChance = typeof chance === "number" && isFinite(chance) ? Math.max(0, Math.min(1, chance)) : 0;
    }
    result.available = offer.available !== false;
    result.soldOut = false;
    if (offer.payment) {
      var store = payments.describe(offer.payment);
      result.payment = copy(offer.payment);
      result.payment.available = !!store.available;
      result.payment.formattedPrice = store.formattedPrice || null;
      result.payment.code = store.code || null;
      result.payment.error = store.error || null;
      result.payment.pending = !!store.pending;
      result.payment.accountId = store.accountId || null;
      if (ownedCommerce.accountId && ownedCommerce.accountId !== store.accountId) {
        result.payment.available = false; result.payment.code = "accountMismatch";
      }
      result.available = result.available && result.payment.available && !result.payment.pending && !player.shopPaymentPending;
      if (offer.purchaseLimit) {
        result.purchaseCount = Commerce.purchaseCount(ownedCommerce, offer.id);
        if (typeof store.purchaseCount === "number" && isFinite(store.purchaseCount) && Math.floor(store.purchaseCount) === store.purchaseCount && store.purchaseCount >= 0) result.purchaseCount = Math.max(result.purchaseCount, store.purchaseCount);
        result.purchaseLimit = offer.purchaseLimit;
        result.purchasesRemaining = Math.max(0, offer.purchaseLimit - result.purchaseCount);
        result.soldOut = result.purchasesRemaining === 0;
        result.available = result.available && !result.soldOut;
      }
      if (offer.firstPurchaseDouble) {
        result.firstPurchaseAvailable = typeof store.firstPurchaseAvailable === "boolean" ? store.firstPurchaseAvailable : Commerce.firstAvailable(ownedCommerce, offer.id);
        result.baseRewards = copy(result.rewards);
        if (result.firstPurchaseAvailable) result.rewards.forEach(function (row) { row.num *= 2; });
      }
    }
    if (offer.draws) result.ownedCount = Commerce.ownedCount(ownedCommerce, offer.id);
    return result;
  }

  function relicView(slot) {
    var template = catalog.relicById[slot.relicId], result = offerView(template);
    result.id = slot.slotId;
    result.relicId = slot.relicId;
    result.quality = slot.quality;
    if (result.rewards[0] && result.rewards[0].rarityFrame) result.rarityFrame = copy(result.rewards[0].rarityFrame);
    result.soldOut = slot.bought;
    result.available = !slot.bought;
    result.conversionGold = conversionGold(slot.relicId);
    return result;
  }

  function recover() {
    if (player.claimingRewardTransaction) return false;
    if (!player.restorePendingRewards()) return false;
    if (player.rewardStorageCheckPending && (!player.retryRewardRecovery || !player.retryRewardRecovery())) return false;
    return true;
  }

  function readyState() {
    if (!catalog || catalogError) return failure("unavailable", "The shop is unavailable. Please reopen it after the game finishes loading.");
    if (!recover()) return failure("save", "Your previous change is still saving. Please try again.");
    try { commerce(); } catch (error) { return failure("unavailable", "Shop purchase history could not be read safely. Your saved progress has been kept."); }
    var timestamp = Number(now()), today;
    try { today = Core.localDay(timestamp); } catch (error) { return failure("unavailable", "The device date is unavailable."); }
    var hasState = Object.prototype.hasOwnProperty.call(player.udata.data, "shopState");
    var state = player.udata.data.shopState;
    if (hasState) {
      try { Core.validate(state, catalog); } catch (error) { return failure("unavailable", "Shop progress could not be read safely. Your saved progress has been kept."); }
    }
    if (!hasState || today > state.day) {
      var previousToken = hasState ? token(state) : null;
      var changed = player.transact(function () {
        player.udata.data.shopState = Core.createState(catalog, timestamp, random, hasState ? player.udata.data.shopState : undefined);
        return true;
      }, function () {
        var current = player.udata.data.shopState;
        return previousToken === null ? !Object.prototype.hasOwnProperty.call(player.udata.data, "shopState") : current && token(current) === previousToken;
      });
      if (!changed) return failure("save", "Shop stock is still saving. Please try again.");
      state = player.udata.data.shopState;
    }
    return { ok: true, state: state, timestamp: timestamp, today: today };
  }

  function secondsUntilReset(state, timestamp) {
    var boundary = Core.nextMidnight(timestamp);
    // A backwards clock must not advertise a reset before the already-saved day.
    if (Core.localDay(timestamp) < state.day) {
      var parts = state.day.split("-");
      boundary = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + 1).getTime();
    }
    return Math.max(0, Math.ceil((boundary - timestamp) / 1000));
  }

  function unavailable(result) {
    return { ready: false, error: result.error, code: result.code, token: null, pending: paymentPending(),
      dailyDeal: { claimed: false, remainingSeconds: 0, rewards: [] },
      bundles: [], chests: [], relics: [], resources: [],
      refresh: { cost: { currency: GEMS, amount: 0 }, used: 0, limit: 10, remaining: 0, nextNumber: 1, remainingSeconds: 0, enabled: false } };
  }

  function currentToken(expected) {
    var state = player.udata.data.shopState;
    return typeof expected === "string" && state && actionToken(state) === expected;
  }

  function action(expected, operation) {
    if (busy) return failure("save", "The shop is updating. Please try again.");
    busy = true;
    try {
      var ready = readyState();
      if (!ready.ok) return ready;
      if (!currentToken(expected)) return failure("stale", "The shop changed. Please try again.");
      return operation(ready);
    } finally { busy = false; }
  }

  function grant(rewards) { return player.addRewards(rewards, 1, null); }
  function grantMixed(rewards) {
    var goods = [], chests = [];
    rewards.forEach(function (row) {
      if (row.chestId) { rewardView(row); chests.push(copy(row)); }
      else goods.push(row);
    });
    var actual = grant(goods);
    if (chests.length) {
      player.udata.data.shopCommerce = Commerce.addChests(commerce(), chests);
      Array.prototype.push.apply(actual, chests);
    }
    return actual;
  }
  function saved(result) {
    return result === null ? failure("save", "Your purchase is still saving. Please try again.") : { ok: true, rewards: (result.rewards || []).map(rewardView) };
  }

  function fulfill(proof) {
    if (busy) return failure("save", "The shop is updating. Your paid purchase can be restored shortly.");
    busy = true;
    try {
      var ready = readyState();
      if (!ready.ok) return ready;
      var kind, offer;
      ["bundles", "resources"].some(function (group) {
        offer = catalog[group].filter(function (row) { return row.payment && row.payment.productId === proof.productId; })[0];
        if (offer) { kind = group; return true; } return false;
      });
      if (!offer) return failure("unavailable", "This verified product is unavailable. Your purchase has been kept for restoration.");
      var previous = commerce(), next;
      if (previous.accountId && previous.accountId !== proof.accountId) return failure("accountMismatch", "Load the game profile belonging to this store account before restoring this purchase.");
      try { next = Commerce.recordPurchase(previous, proof, kind, offer); }
      catch (error) { return failure(offer.purchaseLimit && proof.purchaseNumber > offer.purchaseLimit ? "purchaseLimit" : "verification", error.message); }
      if (next === previous) return { ok: true, duplicate: true, rewards: [] };
      var revision = previous.revision;
      return saved(player.transact(function () {
        player.udata.data.shopCommerce = Commerce.recordPurchase(commerce(), proof, kind, offer);
        var rewards = copy(offer.rewards);
        // The verified lifetime ordinal remains authoritative after restore and
        // when multiple devices deliver their first transactions out of order.
        if (offer.firstPurchaseDouble && proof.firstPurchase) rewards.forEach(function (row) { row.num *= 2; });
        var actual = grantMixed(rewards);
        bumpStock();
        return { rewards: actual };
      }, function () { return commerce().revision === revision && !Commerce.purchaseReceipt(commerce(), proof); }));
    } finally { busy = false; }
  }

  function deliverPaid(entitlement) { return payments.consumeVerifiedEntitlement(entitlement, fulfill); }

  function paidPurchase(offer) {
    var store = payments.describe(offer.payment);
    if (commerce().accountId && commerce().accountId !== store.accountId) return failure("accountMismatch", "The store account does not match this game profile.");
    if (!store.available || store.pending || player.shopPaymentPending) return failure(store.pending || player.shopPaymentPending ? "pending" : "paymentUnavailable", "Store payments are unavailable or another purchase is still pending.");
    if (offer.purchaseLimit && Commerce.purchaseCount(commerce(), offer.id) >= offer.purchaseLimit) return failure("purchaseLimit", "This bundle's purchase limit has been reached.");
    var payment = copy(offer.payment);
    if (offer.purchaseLimit) payment.purchaseLimit = offer.purchaseLimit;
    if (offer.firstPurchaseDouble) payment.expectedFirstPurchase = typeof store.firstPurchaseAvailable === "boolean" ? store.firstPurchaseAvailable : Commerce.firstAvailable(commerce(), offer.id);
    player.shopPaymentPending = true;
    var pending;
    try { pending = payments.purchase(payment, deliverPaid); }
    catch (error) { player.shopPaymentPending = false; throw error; }
    return Promise.resolve(pending).then(function (result) {
      player.shopPaymentPending = false; return result;
    }, function (error) { player.shopPaymentPending = false; throw error; });
  }

  return {
    getView: function () {
      if (busy) return unavailable(failure("save", "The shop is updating. Please try again."));
      busy = true;
      try {
        var ready = readyState();
        if (!ready.ok) return unavailable(ready);
        var state = ready.state, price = Core.refreshCost(state), remaining = secondsUntilReset(state, ready.timestamp);
        return { ready: true, error: null, token: actionToken(state), pending: paymentPending(),
          dailyDeal: { claimed: state.dailyClaimed, remainingSeconds: remaining, rewards: catalog.dailyDeal.rewards.map(rewardView), icon: copy(catalog.dailyDeal.icon), name: catalog.dailyDeal.fallbackName, nameKey: catalog.dailyDeal.nameKey },
          bundles: catalog.bundles.map(offerView), chests: catalog.chests.map(offerView), relics: state.slots.map(relicView), resources: catalog.resources.map(offerView),
          refresh: { cost: { currency: GEMS, amount: price === null ? 0 : price }, used: state.refreshCount, limit: 10,
            remaining: Math.max(0, 10 - state.refreshCount), nextNumber: Math.min(10, state.refreshCount + 1), remainingSeconds: remaining,
            enabled: price !== null && ready.today === state.day } };
      } finally { busy = false; }
    },

    claimDaily: function (expected) {
      return action(expected, function (ready) {
        if (ready.state.dailyClaimed) return failure("claimed", "The daily deal has already been claimed.");
        var result = player.claimRewards(catalog.dailyDeal.rewards, 1, null, function () {
          player.udata.data.shopState = Core.claim(player.udata.data.shopState);
        }, function () { return currentToken(expected) && !player.udata.data.shopState.dailyClaimed; });
        return result === null ? failure("save", "Your daily deal is still saving. Please try again.") : { ok: true, rewards: result.map(rewardView) };
      });
    },

    purchase: function (kind, id, expected) {
      return action(expected, function (ready) {
        var offer, slot;
        if (kind === "relics") {
          slot = ready.state.slots.filter(function (row) { return row.slotId === id; })[0];
          if (slot) offer = catalog.relicById[slot.relicId];
          if (slot && slot.bought) return failure("soldout", "This relic is sold out until the next refresh.");
        } else if (["bundles", "chests", "resources"].indexOf(kind) >= 0) offer = catalog[kind].filter(function (row) { return row.id === id; })[0];
        if (!offer || offer.available === false) return failure("unavailable", "This offer is unavailable.");
        if (offer.payment) return paidPurchase(offer);
        if (!offer.cost) return failure("unavailable", "This offer has no supported purchase method.");
        var currency = offer.cost.id === GOLD ? player.udata.getGoldNum() : player.udata.getDiamondNum();
        if (currency < offer.cost.num) return failure(offer.cost.id === GOLD ? "insufficientGold" : "insufficientGems", offer.cost.id === GOLD ? "Not enough gold." : "Not enough gems.");
        var result = player.purchase([offer.cost], function () {
          var actual = kind === "chests" ? chestRewards(offer) : grant(offer.rewards || [{ id: offer.goodId, num: 1 }]);
          if (kind === "relics") player.udata.data.shopState = Core.buyRelic(player.udata.data.shopState, id);
          else bumpStock();
          return { rewards: actual };
        }, function () {
          var state = player.udata.data.shopState;
          return currentToken(expected) && (kind !== "relics" || state.slots.some(function (row) { return row.slotId === id && row.relicId === slot.relicId && !row.bought; }));
        });
        return saved(result);
      });
    },

    openChest: function (id, expected) {
      return action(expected, function () {
        var offer = catalog.chests.filter(function (row) { return row.id === id; })[0];
        if (!offer) return failure("unavailable", "This chest is unavailable.");
        if (Commerce.ownedCount(commerce(), id) < 1) return failure("notOwned", "You do not own this chest.");
        return saved(player.transact(function () {
          player.udata.data.shopCommerce = Commerce.consumeChest(commerce(), id);
          var actual = chestRewards(offer); bumpStock(); return { rewards: actual };
        }, function () { return currentToken(expected) && Commerce.ownedCount(commerce(), id) > 0; }));
      });
    },

    deliverPaid: deliverPaid,

    restorePurchases: function () { return payments.restorePending(deliverPaid); },

    loadProducts: function () {
      if (!catalog || catalogError) return Promise.resolve(failure("unavailable", "The shop catalog is unavailable."));
      return payments.loadProducts(catalog.bundles.concat(catalog.resources).filter(function (row) { return !!row.payment; }).map(function (row) { return row.payment; }));
    },

    refreshRelics: function (expected) {
      return action(expected, function (ready) {
        if (ready.today !== ready.state.day) return failure("unavailable", "Relic refresh is paused until the device date reaches the saved shop day.");
        var price = Core.refreshCost(ready.state);
        if (price === null) return failure("refreshlimit", "All 10 refreshes have been used today.");
        if (player.udata.getDiamondNum() < price) return failure("insufficientGems", "Not enough gems.");
        return saved(player.purchase([{ id: GEMS, num: price }], function () {
          player.udata.data.shopState = Core.roll(player.udata.data.shopState, catalog, ready.timestamp, random, true);
          return { rewards: [] };
        }, function () { return currentToken(expected) && player.udata.data.shopState.refreshCount < 10; }));
      });
    }
  };
};
