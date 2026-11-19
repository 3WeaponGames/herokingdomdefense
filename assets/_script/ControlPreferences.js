"use strict";
function preference(key) {
  var loaded = false, enabled = false, listeners = new Set();
  function get() {
    if (!loaded) {
      loaded = true;
      try { enabled = cc.sys.localStorage.getItem(key) === "1"; } catch (error) { enabled = false; }
    }
    return enabled;
  }
  function set(value) {
    if (get() === !!value) return;
    enabled = !!value;
    try { cc.sys.localStorage.setItem(key, enabled ? "1" : "0"); } catch (error) { /* Keep this session usable without storage. */ }
    listeners.forEach(function (callback) { callback(enabled); });
  }
  function subscribe(callback) {
    listeners.add(callback);
    return function () { listeners.delete(callback); };
  }
  return { get: get, set: set, subscribe: subscribe };
}
var idle = preference("project-cocos.hideIdleControls");
exports.getHideIdle = idle.get;
exports.setHideIdle = idle.set;
exports.subscribe = idle.subscribe;
exports.autoSkillCast = preference("project-cocos.autoSkillCast");
