"use strict";
// Earned progression rewards outlive their panel. A failed journal creation
// keeps only the captured claim pending; no SDK request or idle timer repeats.
var pending = new Set(), retryTimer = null;
function valid(value) { return !!value && (typeof cc === "undefined" || !cc.isValid || cc.isValid(value, true)); }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stopIdleTimer() {
  if (!pending.size && retryTimer !== null) { clearInterval(retryTimer); retryTimer = null; }
}
function retryPending() { Array.from(pending).forEach(function (request) { request.retry(); }); stopIdleTimer(); }
function retain(request) {
  pending.add(request);
  if (retryTimer === null) retryTimer = setInterval(retryPending, 1000);
}
function get(owner, key) { var request = owner && owner[key]; return request && !request.done ? request : null; }
function create(owner, key, player, work, present, notify) {
  if (get(owner, key)) return null;
  var node = owner.node, generation = owner._resourceGeneration;
  var records = ["udata", "missionData", "dailyData", "guideData", "gameData"].filter(function (name) { return !!player[name]; }).map(function (name) {
    var record = player[name]; return { name: name, record: record, key: record.gameKey, generation: record._cloudGeneration };
  });
  var request = { done: false, earned: false, busy: false, attempted: false };
  request.isUI = function () { return valid(owner) && !owner.isclose && owner.node === node && valid(node) && node.activeInHierarchy !== false && owner._resourceGeneration === generation; };
  request.isContext = function () { return records.every(function (entry) { var record = player[entry.name]; return record === entry.record && !!record.data && record.gameKey === entry.key && record._cloudGeneration === entry.generation; }); };
  function finish() {
    request.done = true; pending.delete(request);
    if (owner[key] === request) owner[key] = null;
    stopIdleTimer();
  }
  request.cancel = function () { if (!request.earned && !request.done) finish(); };
  request.retry = function () {
    if (request.done || !request.earned || request.busy) return false;
    if (!request.isContext()) { finish(); return false; }
    request.busy = true;
    try {
      // Avoid repeating a draw while storage is known to be unavailable. The
      // existing recovery probe must succeed before retrying its original claim.
      if (request.attempted && player.rewardStorageCheckPending && player.retryRewardRecovery && !player.retryRewardRecovery()) { retain(request); return false; }
      request.attempted = true;
      if (player.pendingRewardJournal && player.restorePendingRewards && !player.restorePendingRewards()) { retain(request); return false; }
      var result = work();
      if (!result || !result.done) { retain(request); return false; }
      finish();
      var shown = false;
      try { if (result.show !== false && present && request.isUI()) shown = present(result.value, request.isUI) !== false; }
      finally { if (result.notify !== false && notify && request.isContext()) notify(result.value, shown); }
      return true;
    } catch (error) {
      if (!request.done) retain(request);
      if (!request.reported) { request.reported = true; console.error("Could not complete earned ad reward", error); }
      return false;
    } finally { request.busy = false; }
  };
  request.earn = function () {
    if (request.done || request.earned) return false;
    request.earned = true;
    return request.retry();
  };
  owner[key] = request;
  return request;
}
exports.create = create;
exports.get = get;
exports.clone = clone;
exports.point = function (value) { return value ? { x: value.x, y: value.y } : null; };
exports.events = function (emit) {
  var delivered = Object.create(null);
  return function (name, value) { if (!delivered[name]) { delivered[name] = true; emit(name, value); } };
};
