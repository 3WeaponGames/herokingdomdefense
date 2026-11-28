"use strict";
function preference(key) {
  var loaded = false, specified = false, enabled = false, listeners = new Set();
  function get() {
    if (!loaded) {
      loaded = true;
      try {
        var saved = cc.sys.localStorage.getItem(key);
        specified = saved === "1" || saved === "0";
        enabled = saved === "1";
      } catch (error) { enabled = false; }
    }
    return enabled;
  }
  function set(value) {
    if (get() === !!value) return;
    enabled = !!value;
    specified = true;
    try { cc.sys.localStorage.setItem(key, enabled ? "1" : "0"); } catch (error) { /* Keep this session usable without storage. */ }
    listeners.forEach(function (callback) { callback(enabled); });
  }
  function subscribe(callback) {
    listeners.add(callback);
    return function () { listeners.delete(callback); };
  }
  function setDefault(value) {
    get();
    if (!specified) set(value);
  }
  return { get: get, set: set, subscribe: subscribe, setDefault: setDefault };
}
var idle = preference("project-cocos.hideIdleControls");
exports.getHideIdle = idle.get;
exports.setHideIdle = idle.set;
exports.subscribe = idle.subscribe;
exports.autoSkillCast = preference("project-cocos.autoSkillCast");
