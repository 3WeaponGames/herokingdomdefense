"use strict";

// The Tools reset page stops before player/service initialization. It never
// opens the lobby or runs the autosave timers belonging to the old player.
var EPOCH_KEY = "project-cocos.progress-generation";
function snapshot(storage) {
  var rows = [];
  for (var i = 0; i < storage.length; i++) {
    var key = storage.key(i), value = storage.getItem(key);
    if (key !== null && value !== null) rows.push([key, value]);
  }
  return rows.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
}
function isProgress(key, prefixes) {
  return prefixes.some(function (prefix) { return prefix && key.indexOf(prefix) === 0; });
}
function clear(storage, before, prefixes, generation) {
  if (JSON.stringify(snapshot(storage)) !== JSON.stringify(before)) throw Error("The save changed. Close other game tabs, then reopen this reset page.");
  var removed = before.filter(function (row) { return isProgress(row[0], prefixes); });
  if (!removed.length) return 0;
  try {
    // Old browser tabs must not restore their in-memory save after this reset.
    storage.setItem(EPOCH_KEY, generation);
    if (storage.getItem(EPOCH_KEY) !== generation) throw Error("Cannot protect the new save from an older game tab.");
    removed.forEach(function (row) {
      storage.removeItem(row[0]);
      if (storage.getItem(row[0]) !== null) throw Error("A saved record could not be removed.");
    });
    return removed.length;
  } catch (error) {
    // Retain the generation fence even on rollback. Old tabs must reload.
    removed.forEach(function (row) { storage.setItem(row[0], row[1]); });
    throw error;
  }
}
function openIfRequested() {
  if (typeof CC_EDITOR !== "undefined" && CC_EDITOR ||
      !(typeof CC_PREVIEW !== "undefined" && CC_PREVIEW || typeof CC_DEBUG !== "undefined" && CC_DEBUG) ||
      typeof window === "undefined" || !window.location || typeof document === "undefined" || cc.sys.isNative) return false;
  var url = new URL(window.location.href), token = url.searchParams.get("hkd-reset-progress"), bridge = url.searchParams.get("hkd-reset-bridge");
  if (!token) return false;
  // Never continue booting the game when a reset URL is malformed or expired.
  if (cc.audioEngine) { cc.audioEngine.stopAll(); cc.audioEngine.setMusicVolume(0); cc.audioEngine.setEffectsVolume(0); }
  var root = document.createElement("div"); root.id = "hkd-progress-reset";
  root.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#202733;color:#edf3ff;padding:32px;overflow:auto;overflow-wrap:break-word;word-break:break-word;font:16px/1.6 Segoe UI,sans-serif;box-sizing:border-box";
  document.body.appendChild(root);
  function add(tag, value) { var node = document.createElement(tag); if (value) node.textContent = value; root.appendChild(node); return node; }
  add("h1", "Reset all progress");
  add("p", "Browser player: " + window.location.origin);
  add("p", "Close other game tabs before resetting. This clears the campaign, tutorial, saved battles, currencies, equipment, talents, relics and rewards. Maps, balance data, language and audio preferences are kept.");
  var status = add("p", "Reading saved progress…"), field = add("input"), button = add("button", "Back up and reset all progress");
  field.placeholder = "Type RESET"; field.setAttribute("aria-label", "Type RESET to confirm"); field.autocomplete = "off";
  field.style.cssText = "display:block;padding:12px;font:inherit;margin:20px 0;color:#17212c";
  button.style.cssText = "padding:12px 18px;font:inherit;background:#923d46;color:white;border:0;border-radius:6px";
  button.disabled = true;
  var storage = cc.sys.localStorage, before, prefixes, busy = false;
  try {
    var endpoint = new URL(bridge);
    if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || endpoint.pathname !== "/reset" || !/^[a-f0-9]{48}$/.test(token)) throw Error("Invalid reset link. Reopen Reset All Progress from Cocos Tools.");
    var config = require("Config").GameConfig;
    prefixes = [config.AppCacheName, config.WebCacheName].filter(function (value, index, all) { return value && all.indexOf(value) === index; });
    if (!prefixes.length) throw Error("The game save namespace is unavailable.");
    before = snapshot(storage);
    status.textContent = before.filter(function (row) { return isProgress(row[0], prefixes); }).length + " saved progress records. Type RESET to confirm. A verified backup will be saved outside the project before anything is cleared.";
  } catch (error) { status.textContent = error.message; field.disabled = true; return true; }
  field.oninput = function () { button.disabled = busy || field.value !== "RESET"; };
  function send(action, values) {
    return fetch(endpoint.href, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(Object.assign({token:token, action:action}, values || {}))}).then(function (response) {
      return response.json().then(function (result) { if (!response.ok || result.error) throw Error(result.error || "The reset tool is unavailable."); return result; });
    });
  }
  button.onclick = function () {
    if (busy || field.value !== "RESET") return;
    busy = true; button.disabled = true; field.disabled = true; status.textContent = "Backing up this player…";
    var backup;
    send("backup", {storage:before, prefixes:prefixes, origin:window.location.origin}).then(function (result) {
      backup = result.backup;
      var count = clear(storage, before, prefixes, token);
      status.textContent = "Reset complete (" + count + " records). Close this page and press Play in Cocos to start with the tutorial and Stage 1. Backup: " + backup;
      button.hidden = true; field.hidden = true;
      return send("complete", {removed:count}).catch(function () {});
    }).catch(function (error) {
      status.textContent = error.message + (backup ? " Backup preserved: " + backup : " Progress was not cleared.");
      busy = false; field.disabled = false; button.disabled = field.value !== "RESET";
    });
  };
  return true;
}
exports.EPOCH_KEY = EPOCH_KEY;
exports.snapshot = snapshot;
exports.isProgress = isProgress;
exports.clear = clear;
exports.openIfRequested = openIfRequested;
