Object.defineProperty(exports, "__esModule", {
  value: true
});
//电子邮件puhalskijsemen@gmail.com
//源码网站 开vpn全局模式打开 http://web3incubators.com/
//电报https://t.me/gamecode999
//网页客服 http://web3incubators.com/kefu.html

exports.BaseEventName = exports.ABTestType = exports.ABD_ENV = exports.ObjectWeightValue = exports.ObjectValue = exports.WeightObject = exports.LoadingProcess = exports.OrderLayer = exports.LanguageType = undefined;
(function (t) {
  t.zh = "zh";
  t.zh_tw = "fz";
  t.en = "en";
  t.jp = "jp";
})(exports.LanguageType || (exports.LanguageType = {}));
(function (t) {
  t[t.main = 0] = "main";
  t[t.special = 50] = "special";
  t[t.pop = 100] = "pop";
  t[t.top = 200] = "top";
  t[t.pop2 = 300] = "pop2";
  t[t.tip = 400] = "tip";
  t[t.guide = 900] = "guide";
  t[t.touch = 1e3] = "touch";
  t[t.Log = 2e3] = "Log";
})(exports.OrderLayer || (exports.OrderLayer = {}));
(function (t) {
  t[t.StartLoading = 5] = "StartLoading";
  t[t.ExcelCfg = 10] = "ExcelCfg";
  t[t.PlayerCfg = 20] = "PlayerCfg";
  t[t.ResCfg = 40] = "ResCfg";
  t[t.AudioCfg = 60] = "AudioCfg";
  t[t.OtherCfg = 80] = "OtherCfg";
  t[t.EndLoading = 100] = "EndLoading";
})(exports.LoadingProcess || (exports.LoadingProcess = {}));
exports.WeightObject = function () {};
exports.ObjectValue = function () {};
exports.ObjectWeightValue = function () {};
(function (t) {
  t[t.DEV = 0] = "DEV";
  t[t.PRO = 1] = "PRO";
})(exports.ABD_ENV || (exports.ABD_ENV = {}));
(function (t) {
  t[t.NO_AB = 0] = "NO_AB";
  t[t.AB_Test = 1] = "AB_Test";
  t[t.ABD_Test = 2] = "ABD_Test";
  t[t.A_fixed = 3] = "A_fixed";
  t[t.B_fixed = 4] = "B_fixed";
  t[t.D_fixed = 5] = "D_fixed";
})(exports.ABTestType || (exports.ABTestType = {}));
(function (t) {
  t.Loading = "Loading";
  t.OpenUI = "openUi";
  t.CloseUI = "CloseUI";
  t.ShowTopUI = "ShowTopUI";
  t.blocktouch = "blocktouch";
  t.onShow = "onShow";
  t.onHide = "onHide";
  t.RefreshReport = "onRefreshReport";
  t.ClearData = "ClearData";
  t.AdStart = "AdStart";
  t.ShowTransition = "ShowTransition";
  t.RewardedVideoAd = "RewardedVideoAd";
})(exports.BaseEventName || (exports.BaseEventName = {}));