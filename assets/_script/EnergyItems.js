"use strict";

// Owned refills are inventory, not current Energy. A use journals the consumed
// item and its full Energy credit together with the existing account records.
var GOOD_ID = 2033, ENERGY_PER_ITEM = 20, MAX_INTEGER = 9007199254740991;
function integer(value) { return typeof value === "number" && isFinite(value) && Math.floor(value) === value && value >= 0 && value <= MAX_INTEGER; }
function values(user) {
  if (!user || !user.data) throw new Error("Energy item inventory is unavailable");
  var count = user.data.energyItems === undefined ? 0 : user.data.energyItems;
  var revision = user.data.energyItemUseRevision === undefined ? 0 : user.data.energyItemUseRevision;
  if (!integer(count) || !integer(revision)) throw new Error("Energy item inventory is invalid");
  return { count: count, revision: revision };
}
function token(state) { return GOOD_ID + ":" + state.revision + ":" + state.count; }
function result(code, message, count) { return { ok: false, code: code, error: message, count: count, energyAdded: 0 }; }

exports.GOOD_ID = GOOD_ID;
exports.ENERGY_PER_ITEM = ENERGY_PER_ITEM;
exports.add = function (user, amount) {
  if (!integer(amount)) throw new Error("Invalid Energy item quantity");
  var current = values(user);
  if (amount === 0) return current.count;
  if (!integer(current.count + amount)) throw new Error("Energy item inventory limit exceeded");
  user.data.energyItems = current.count + amount;
  user.saveData();
  return user.data.energyItems;
};

exports.create = function (player) {
  var busy = false;
  function user() { return player.getUserData ? player.getUserData() : player.udata; }
  function recover() {
    if (player.claimingRewardTransaction || !player.restorePendingRewards()) return false;
    return !player.rewardStorageCheckPending || !!(player.retryRewardRecovery && player.retryRewardRecovery());
  }
  function snapshot() {
    var current;
    try { current = values(user()); } catch (error) { return { error: "Energy item inventory could not be read safely.", code: "unavailable", count: 0 }; }
    return { count: current.count, revision: current.revision, token: token(current) };
  }
  return {
    getView: function () {
      if (busy || !recover()) return { count: snapshot().count, energyPerItem: ENERGY_PER_ITEM, available: false, token: null, code: "save", error: "Your previous change is still saving. Please try again." };
      var current = snapshot();
      var exhausted = current.revision >= MAX_INTEGER;
      return { count: current.count, energyPerItem: ENERGY_PER_ITEM, available: !current.error && !exhausted && current.count > 0,
        token: current.error || exhausted ? null : current.token,
        code: current.code || (exhausted ? "unavailable" : undefined), error: current.error || (exhausted ? "Energy item inventory needs recovery." : null) };
    },
    useOne: function (expected) {
      if (busy) return result("save", "An Energy item is already being used.", snapshot().count);
      busy = true;
      try {
        if (!recover()) return result("save", "Your previous change is still saving. Please try again.", snapshot().count);
        var current = snapshot();
        if (current.error || current.revision >= MAX_INTEGER) return result("unavailable", current.error || "Energy item inventory needs recovery.", current.count);
        if (typeof expected !== "string" || expected !== current.token) return result("stale", "Your Energy item inventory changed. Please try again.", current.count);
        if (current.count < 1) return result("empty", "You do not own any Energy items.", current.count);
        var saved = player.transact(function () {
          var record = user();
          record.data.energyItems = current.count - 1;
          record.data.energyItemUseRevision = current.revision + 1;
          // No cap is passed: purchased/consumable Energy can exceed regen cap.
          record.addPowerNum(ENERGY_PER_ITEM);
          return { count: record.data.energyItems, energyAdded: ENERGY_PER_ITEM };
        }, function () {
          var latest = snapshot();
          return !latest.error && latest.token === expected && latest.count > 0;
        });
        return saved === null ? result("save", "Your Energy item use is still saving. Please try again.", snapshot().count) : { ok: true, count: saved.count, energyAdded: saved.energyAdded };
      } finally { busy = false; }
    }
  };
};
