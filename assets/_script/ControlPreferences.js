"use strict";
var key = "project-cocos.hideIdleControls", loaded = false, hidden = false, listeners = new Set();
function getHideIdle() {
  if (!loaded) {
    loaded = true;
    try { hidden = cc.sys.localStorage.getItem(key) === "1"; } catch (error) { hidden = false; }
  }
  return hidden;
}
function setHideIdle(value) {
  if (getHideIdle() === !!value) return;
  hidden = !!value;
  try { cc.sys.localStorage.setItem(key, hidden ? "1" : "0"); } catch (error) { /* Keep this session usable without storage. */ }
  listeners.forEach(function (callback) { callback(hidden); });
}
function subscribe(callback) {
  listeners.add(callback);
  return function () { listeners.delete(callback); };
}
exports.getHideIdle = getHideIdle;
exports.setHideIdle = setHideIdle;
exports.subscribe = subscribe;
