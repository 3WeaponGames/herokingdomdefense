Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PlatformSetting = exports.SwitchID = exports.AppName = undefined;
var i;
var $z1BasePlatform = require("BasePlatform");
(function (t) {
  t.Main = "Main";
  t.MRDYX = "MRDYX";
  t.ZSSWZ = "ZSSWZ";
  t.XDQB = "XDQB";
  t.XXSCD = "XXSCD";
  t.Bili1 = "Bili1";
  t.Bili2 = "Bili2";
})(i = exports.AppName || (exports.AppName = {}));
(function (t) {
  t[t.ShenHe = 0] = "ShenHe";
  t[t.ShenHe_ABD = 1] = "ShenHe_ABD";
  t[t.ShenHe2 = 2] = "ShenHe2";
})(exports.SwitchID || (exports.SwitchID = {}));
var exp_PlatformSetting = function () {
  function _ctor() {}
  _ctor.currentApp = i.Main;
  _ctor.currentPlatform = $z1BasePlatform.Platform.ANDROID_4399;
  return _ctor;
}();
exports.PlatformSetting = exp_PlatformSetting;