Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ArgsParseUtils = undefined;
var exp_ArgsParseUtils = function () {
  function _ctor() {}
  _ctor._makeLoadResArgs = function () {
    if (arguments.length < 1 || "string" != typeof arguments[0]) {
      console.error("_makeLoadResArgs error " + arguments);
      return null;
    }
    var t = {
      bundle: arguments[0],
      path: arguments[1],
      type: arguments[2],
      callback: arguments[3],
      autoRelese: false,
      cacheTme: 10,
      saveKey: null
    };
    for (var e = 4; e < arguments.length; ++e) {
      4 == e && "boolean" == typeof arguments[e] && (t.autoRelese = arguments[e]);
      if (5 == e && "number" == typeof arguments[e]) {
        t.cacheTme = arguments[e];
      } else {
        e == arguments.length - 1 && "string" == typeof arguments[e] && (t.saveKey = arguments[e]);
      }
    }
    return t;
  };
  _ctor._makeloadSpriteFrameResrgs = function () {
    if (arguments.length < 1 || "string" != typeof arguments[0]) {
      console.error("_makeloadSpriteFrameResrgs error " + arguments);
      return null;
    }
    var t = {
      bundle: arguments[0],
      path: arguments[1],
      callback: arguments[2],
      autoRelese: false,
      cacheTme: 10,
      saveKey: null
    };
    for (var e = 3; e < arguments.length; ++e) {
      3 == e && "boolean" == typeof arguments[e] && (t.autoRelese = arguments[e]);
      if (4 == e && "number" == typeof arguments[e]) {
        t.cacheTme = arguments[e];
      } else {
        e == arguments.length - 1 && "string" == typeof arguments[e] && (t.saveKey = arguments[e]);
      }
    }
    return t;
  };
  return _ctor;
}();
exports.ArgsParseUtils = exp_ArgsParseUtils;