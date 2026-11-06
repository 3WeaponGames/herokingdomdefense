var i;
var a;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GameConfig = exports.ByteAppName = exports.OnShowOptions = exports.SystemPlatform = exports.EventName = exports.AudioCF = exports.AudioId = exports.UICF = exports.UIID = undefined;
var o;
var r;
var $z1Appcfg = require("Appcfg");
(function (t) {
  t.UINONE = "UINone";
  t.UIHome = "UIHome";
  t.UITop = "UITop";
  t.UITips = "UITips";
  t.UITouch = "UITouch";
  t.UIGuide = "UIGuide";
  t.UICacheExample = "UICacheExample";
  t.UIRealName = "UIRealName";
  t.UIGameExist = "UIGameExist";
  t.UISideBoard = "UISideBoard";
  t.UISetting = "UISetting";
  t.UIReportTop = "UIReportTop";
  t.UIReport = "UIReport";
})(o = exports.UIID || (exports.UIID = {}));
exports.UICF = ((i = {})[o.UIHome] = {
  prefab: "ui/UIHome",
  name: "UIHome",
  showTop: true,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.main,
  bundleName: "prefabs"
}, i[o.UITop] = {
  prefab: "ui/UITop",
  name: "UITop",
  showTop: true,
  showMult: false,
  zIndex: 999,
  bundleName: "prefabs"
}, i[o.UITips] = {
  prefab: "ui/UITips",
  name: "UITips",
  showTop: true,
  zIndex: $z1Appcfg.OrderLayer.tip,
  bundleName: "prefabs"
}, i[o.UITouch] = {
  prefab: "ui/UITouch",
  name: "UITouch",
  showTop: true,
  zIndex: $z1Appcfg.OrderLayer.touch,
  bundleName: "prefabs"
}, i[o.UIGuide] = {
  prefab: "ui/UIGuide",
  name: "UIGuide",
  showTop: true,
  zIndex: $z1Appcfg.OrderLayer.guide,
  bundleName: "prefabs"
}, i[o.UIRealName] = {
  prefab: "UIRealName",
  name: "UIRealName",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.main,
  bundleName: "prefabs"
}, i[o.UIGameExist] = {
  prefab: "UIGameExist",
  name: "UIGameExist",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.touch,
  bundleName: "prefabs"
}, i[o.UICacheExample] = {
  prefab: "ui/UICacheExample",
  name: "UICacheExample",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.touch,
  bundleName: "prefabs"
}, i[o.UISideBoard] = {
  prefab: "ui/UISideBoard",
  name: "UISideBoard",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: "prefabs"
}, i[o.UISetting] = {
  prefab: "ui/UISetting",
  name: "UISetting",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: "prefabs"
}, i[o.UIReportTop] = {
  prefab: "ui/UIReportTop",
  name: "UIReportTop",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.touch,
  bundleName: "prefabs"
}, i[o.UIReport] = {
  prefab: "ui/UIReport",
  name: "UIReport",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.touch,
  bundleName: "prefabs"
}, i);
(function (t) {
  t.btnClick = "btnClick";
})(r = exports.AudioId || (exports.AudioId = {}));
exports.AudioCF = ((a = {})[r.btnClick] = {
  path: "btnclick",
  bundle: "audio"
}, a);
(function (t) {
  t.RefreshGold = "RefreshGold";
  t.showText = "showText";
})(exports.EventName || (exports.EventName = {}));
(function (t) {
  t.IOS = "ios";
  t.ANDROID = "android";
  t.UNKNOWN = "unknown";
})(exports.SystemPlatform || (exports.SystemPlatform = {}));
exports.OnShowOptions = function () {};
(function (t) {
  t.Toutiao = "Toutiao";
  t.Douyin = "Douyin";
  t.news_article_lite = "news_article_lite";
  t.live_stream = "live_stream";
  t.XiGua = "XiGua";
  t.PPX = "PPX";
  t.douyin_lite = "douyin_lite";
  t.live_stream_lite = "live_stream_lite";
  t.novel_fm = "novel_fm";
  t.novelapp = "novelapp";
})(exports.ByteAppName || (exports.ByteAppName = {}));
var exp_GameConfig = function () {
  function _ctor() {}
  _ctor.AppCacheName = "KinghtFall:";
  _ctor.WebCacheName = "KinghtFall:";
  _ctor.splitCount = "|";
  _ctor.splitNum = ";";
  _ctor.PreBundle = [];
  _ctor.ecrypt = false;
  _ctor.enableRcfg = false;
  return _ctor;
}();
exports.GameConfig = exp_GameConfig;