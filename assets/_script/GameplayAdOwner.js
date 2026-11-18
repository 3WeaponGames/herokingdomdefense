"use strict";
// A rewarded gameplay offer owns its pause and the exact battle that offered it.
function valid(value) { return !!value && cc.isValid(value, true); }
function begin(game, owner, extraCurrent) {
  var previous = owner._gameplayAdRequest;
  if (previous) { if (previous.isCurrent()) return null; previous.cancel(); }
  var ui = require("KinghtFallUIGame").default.instance;
  if (!valid(game) || !valid(owner) || !valid(ui) || ui.isclose || ui.ctrGame !== game) return null;
  var node = owner.node, generation = node && node._combatGeneration, resourceGeneration = owner._resourceGeneration, info = owner.buildInfo;
  var gameNode = game.node, data = game.gameData, epoch = game._combatEpoch, stage = game.gameStatus;
  var uiNode = ui.node, uiGeneration = ui._resourceGeneration, hero = game.ctrPlay, heroNode = hero && hero.node, heroGeneration = heroNode && heroNode._combatGeneration;
  var requests = game._gameplayAds || (game._gameplayAds = new Set()), request = { done: false, paused: true }, pauseOwners;
  function current() {
    return !request.cancelled && owner._gameplayAdRequest === request && valid(owner) && owner.node === node && valid(node) && node.activeInHierarchy !== false &&
      node._combatGeneration === generation && owner._resourceGeneration === resourceGeneration && owner.buildInfo === info && !owner.isDestroyed && !owner._isPooled &&
      valid(game) && game.node === gameNode && valid(gameNode) && gameNode.activeInHierarchy !== false && game.gameData === data && game._combatEpoch === epoch && game.gameStatus === stage &&
      require("KinghtFallUIGame").default.instance === ui && valid(ui) && !ui.isclose && ui.node === uiNode && valid(uiNode) && uiNode.activeInHierarchy !== false && ui._resourceGeneration === uiGeneration && ui.ctrGame === game &&
      game.ctrPlay === hero && valid(hero) && hero.node === heroNode && valid(heroNode) && heroNode._combatGeneration === heroGeneration && !hero._isPooled &&
      (!extraCurrent || extraCurrent());
  }
  function unlink() {
    requests.delete(request);
    if (owner._gameplayAdRequest === request) owner._gameplayAdRequest = null;
  }
  function releasePause() {
    if (!request.paused) return;
    request.paused = false;
    var owned = pauseOwners || ui._pauseOwners;
    if (!owned || !owned.has(request)) return;
    // A retained UI may restart this same controller. Removing our token must
    // preserve every other pause owner, even if this offer's epoch has ended.
    if (valid(ui) && !ui.isclose && ui.node === uiNode && valid(uiNode) && ui._resourceGeneration === uiGeneration && ui.ctrGame === game && ui._pauseOwners === owned) ui.onPauseGame(false, request);
    else owned.delete(request);
  }
  function closeDialog() {
    var dialog = request.dialog, dialogNode = request.dialogNode;
    request.dialog = request.dialogNode = null;
    try { if (dialog) dialog.cancel(); }
    finally { if (valid(dialogNode)) require("UIMgr").UIMgr.getInstance().closeUI(dialogNode); }
  }
  request.isCurrent = current;
  request.cancel = function () {
    if (request.cancelled) return;
    request.cancelled = request.done = true;
    unlink();
    try { releasePause(); } finally { closeDialog(); }
  };
  request.finish = function (callback, beforeRelease) {
    if (request.done) return;
    request.done = true;
    var accepted = current();
    try {
      if (accepted && beforeRelease) beforeRelease();
      releasePause();
      if (accepted && current()) callback(current);
    } finally { try { releasePause(); } finally { unlink(); } }
  };
  request.openDialog = function (id, from, type, callback) {
    if (!current() || request.done) return;
    request.dialog = require("UIMgr").UIMgr.getInstance().openUIWithOwner(id, from, {
      parent: ui, isCurrent: current, onCancel: request.cancel,
      onOpened: function (dialogNode) { request.dialogNode = dialogNode; if (!current() || request.done) closeDialog(); }
    }, type, callback);
  };
  owner._gameplayAdRequest = request;
  requests.add(request);
  try { ui.onPauseGame(true, request); pauseOwners = ui._pauseOwners; }
  catch (error) { request.cancel(); throw error; }
  if (!current()) { request.cancel(); return null; }
  return request;
}
exports.begin = begin;
exports.cancel = function (owner) { if (owner && owner._gameplayAdRequest) owner._gameplayAdRequest.cancel(); };
exports.retire = function (game) {
  if (game && game._gameplayAds) Array.from(game._gameplayAds).forEach(function (request) { request.cancel(); });
};
