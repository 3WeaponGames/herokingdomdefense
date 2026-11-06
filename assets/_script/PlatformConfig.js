var i;
var a;
var o;
var r;
var s;
var l;
var c;
var h;
var g;
var u;
var d;
var p;
var f;
var m;
var y;
var v;
var _;
var I;
var b;
var F;
var P;
var C;
var A;
var D;
var M;
var T;
var w;
var k;
var S;
var K;
var B;
var E;
var N;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ServerDataCfg = exports.AdConfig = exports.UM_VERSION = exports.SWCF = exports.ABSettingCF = exports.ABCF = undefined;
var $z1BasePlatform = require("BasePlatform");
var $z1Appcfg = require("Appcfg");
var $z1PlatformSetting = require("PlatformSetting");
exports.ABCF = ((i = {})[$z1PlatformSetting.AppName.Main] = ((a = {})[$z1Appcfg.ABD_ENV.DEV] = {
  switchId: 1828
}, a[$z1Appcfg.ABD_ENV.PRO] = {
  switchId: 1827
}, a), i[$z1PlatformSetting.AppName.MRDYX] = ((o = {})[$z1Appcfg.ABD_ENV.DEV] = {
  switchId: 1850
}, o[$z1Appcfg.ABD_ENV.PRO] = {
  switchId: 1849
}, o), i[$z1PlatformSetting.AppName.ZSSWZ] = ((r = {})[$z1Appcfg.ABD_ENV.DEV] = {
  switchId: 1836
}, r[$z1Appcfg.ABD_ENV.PRO] = {
  switchId: 1835
}, r), i[$z1PlatformSetting.AppName.XDQB] = ((s = {})[$z1Appcfg.ABD_ENV.DEV] = {
  switchId: 1840
}, s[$z1Appcfg.ABD_ENV.PRO] = {
  switchId: 1839
}, s), i[$z1PlatformSetting.AppName.XXSCD] = ((l = {})[$z1Appcfg.ABD_ENV.DEV] = {
  switchId: 1844
}, l[$z1Appcfg.ABD_ENV.PRO] = {
  switchId: 1843
}, l), i[$z1PlatformSetting.AppName.Bili1] = ((c = {})[$z1Appcfg.ABD_ENV.DEV] = {
  switchId: 9999
}, c[$z1Appcfg.ABD_ENV.PRO] = {
  switchId: 9999
}, c), i[$z1PlatformSetting.AppName.Bili2] = ((h = {})[$z1Appcfg.ABD_ENV.DEV] = {
  switchId: 9999
}, h[$z1Appcfg.ABD_ENV.PRO] = {
  switchId: 9999
}, h), i);
exports.ABSettingCF = ((g = {})[$z1PlatformSetting.AppName.Main] = ((u = {})[$z1BasePlatform.Platform.EDITOR] = {
  type: $z1Appcfg.ABTestType.A_fixed
}, u[$z1BasePlatform.Platform.BYTEDANCE] = {
  type: $z1Appcfg.ABTestType.AB_Test
}, u[$z1BasePlatform.Platform.WEB_LINK] = {
  type: $z1Appcfg.ABTestType.A_fixed
}, u[$z1BasePlatform.Platform.ANDROID_233] = {
  type: $z1Appcfg.ABTestType.A_fixed
}, u[$z1BasePlatform.Platform.VIVO] = {
  type: $z1Appcfg.ABTestType.A_fixed
}, u[$z1BasePlatform.Platform.ANDROID_4399] = {
  type: $z1Appcfg.ABTestType.A_fixed
}, u), g[$z1PlatformSetting.AppName.MRDYX] = ((d = {})[$z1BasePlatform.Platform.WEB_LINK] = {
  type: $z1Appcfg.ABTestType.NO_AB
}, d[$z1BasePlatform.Platform.BYTEDANCE] = {
  type: $z1Appcfg.ABTestType.AB_Test
}, d), g[$z1PlatformSetting.AppName.ZSSWZ] = ((p = {})[$z1BasePlatform.Platform.BYTEDANCE] = {
  type: $z1Appcfg.ABTestType.NO_AB
}, p[$z1BasePlatform.Platform.WECHAT] = {
  type: $z1Appcfg.ABTestType.AB_Test
}, p), g[$z1PlatformSetting.AppName.XDQB] = ((f = {})[$z1BasePlatform.Platform.WECHAT] = {
  type: $z1Appcfg.ABTestType.AB_Test
}, f), g[$z1PlatformSetting.AppName.XXSCD] = ((m = {})[$z1BasePlatform.Platform.WECHAT] = {
  type: $z1Appcfg.ABTestType.NO_AB
}, m[$z1BasePlatform.Platform.KUAIKAN] = {
  type: $z1Appcfg.ABTestType.AB_Test
}, m[$z1BasePlatform.Platform.KuaiShou] = {
  type: $z1Appcfg.ABTestType.AB_Test
}, m[$z1BasePlatform.Platform.BiliBili] = {
  type: $z1Appcfg.ABTestType.NO_AB
}, m), g[$z1PlatformSetting.AppName.Bili1] = ((y = {})[$z1BasePlatform.Platform.KUAIKAN] = {
  type: $z1Appcfg.ABTestType.NO_AB
}, y[$z1BasePlatform.Platform.BiliBili] = {
  type: $z1Appcfg.ABTestType.A_fixed
}, y), g[$z1PlatformSetting.AppName.Bili2] = ((v = {})[$z1BasePlatform.Platform.BiliBili] = {
  type: $z1Appcfg.ABTestType.A_fixed
}, v), g);
exports.SWCF = ((_ = {})[$z1PlatformSetting.AppName.Main] = ((I = {})[$z1PlatformSetting.SwitchID.ShenHe] = {
  appId: 1825,
  h5_wechat: 0,
  h5_bytedance: 7,
  h5_oppo: 0,
  h5_vivo: 0,
  h5_qq: 0,
  h5_kuaikan: 0,
  android_google: 0,
  android_vivo: 0,
  android_233: 0,
  android_4399: 0,
  android_xiaomi: 0,
  h5_baidu: 0,
  ios: 0
}, I[$z1PlatformSetting.SwitchID.ShenHe_ABD] = {
  appId: 1826,
  h5_wechat: 1,
  h5_bytedance: 7,
  h5_oppo: 0,
  h5_vivo: 0,
  h5_qq: 0,
  h5_kuaikan: 0,
  android_google: 0,
  android_vivo: 0,
  android_233: 0,
  android_4399: 0,
  android_xiaomi: 0,
  h5_baidu: 0,
  ios: 0
}, I[$z1PlatformSetting.SwitchID.ShenHe2] = {
  appId: 1851,
  h5_wechat: 0,
  h5_bytedance: 0,
  h5_oppo: 0,
  h5_vivo: 0,
  h5_qq: 0,
  h5_kuaikan: 0,
  android_google: 0,
  android_vivo: 0,
  android_233: 0,
  android_4399: 0,
  android_xiaomi: 0,
  h5_baidu: 0,
  ios: 0
}, I), _[$z1PlatformSetting.AppName.MRDYX] = ((b = {})[$z1PlatformSetting.SwitchID.ShenHe] = {
  appId: 1847,
  h5_wechat: 0,
  h5_bytedance: 1,
  h5_oppo: 0,
  h5_vivo: 0,
  h5_qq: 0,
  h5_kuaikan: 0,
  android_google: 0,
  android_vivo: 0,
  android_233: 0,
  android_4399: 0,
  android_xiaomi: 0,
  h5_baidu: 0,
  ios: 0
}, b[$z1PlatformSetting.SwitchID.ShenHe_ABD] = {
  appId: 1848,
  h5_wechat: 0,
  h5_bytedance: 1,
  h5_oppo: 0,
  h5_vivo: 0,
  h5_qq: 0,
  h5_kuaikan: 0,
  android_google: 0,
  android_vivo: 0,
  android_233: 0,
  android_4399: 0,
  android_xiaomi: 0,
  h5_baidu: 0,
  ios: 0
}, b), _[$z1PlatformSetting.AppName.ZSSWZ] = ((F = {})[$z1PlatformSetting.SwitchID.ShenHe] = {
  appId: 1833,
  h5_wechat: 1,
  h5_bytedance: 0,
  h5_oppo: 0,
  h5_vivo: 0,
  h5_qq: 0,
  h5_kuaikan: 0,
  android_google: 0,
  android_vivo: 0,
  android_233: 0,
  android_4399: 0,
  android_xiaomi: 0,
  h5_baidu: 0,
  ios: 0
}, F[$z1PlatformSetting.SwitchID.ShenHe_ABD] = {
  appId: 1834,
  h5_wechat: 1,
  h5_bytedance: 0,
  h5_oppo: 0,
  h5_vivo: 0,
  h5_qq: 0,
  h5_kuaikan: 0,
  android_google: 0,
  android_vivo: 0,
  android_233: 0,
  android_4399: 0,
  android_xiaomi: 0,
  h5_baidu: 0,
  ios: 0
}, F), _[$z1PlatformSetting.AppName.XDQB] = ((P = {})[$z1PlatformSetting.SwitchID.ShenHe] = {
  appId: 1837,
  h5_wechat: 1,
  h5_bytedance: 0,
  h5_oppo: 0,
  h5_vivo: 0,
  h5_qq: 0,
  h5_kuaikan: 0,
  android_google: 0,
  android_vivo: 0,
  android_233: 0,
  android_4399: 0,
  android_xiaomi: 0,
  h5_baidu: 0,
  ios: 0
}, P[$z1PlatformSetting.SwitchID.ShenHe_ABD] = {
  appId: 1838,
  h5_wechat: 1,
  h5_bytedance: 0,
  h5_oppo: 0,
  h5_vivo: 0,
  h5_qq: 0,
  h5_kuaikan: 0,
  android_google: 0,
  android_vivo: 0,
  android_233: 0,
  android_4399: 0,
  android_xiaomi: 0,
  h5_baidu: 0,
  ios: 0
}, P), _[$z1PlatformSetting.AppName.XXSCD] = ((C = {})[$z1PlatformSetting.SwitchID.ShenHe] = {
  appId: 1841,
  h5_wechat: 0,
  h5_bytedance: 0,
  h5_oppo: 0,
  h5_vivo: 0,
  h5_qq: 0,
  h5_kuaikan: 1,
  android_google: 0,
  android_vivo: 0,
  android_233: 0,
  android_4399: 0,
  android_xiaomi: 0,
  h5_baidu: 0,
  ios: 0,
  kuaishou: 1
}, C[$z1PlatformSetting.SwitchID.ShenHe_ABD] = {
  appId: 1842,
  h5_wechat: 0,
  h5_bytedance: 0,
  h5_oppo: 0,
  h5_vivo: 0,
  h5_qq: 0,
  h5_kuaikan: 1,
  android_google: 0,
  android_vivo: 0,
  android_233: 0,
  android_4399: 0,
  android_xiaomi: 0,
  h5_baidu: 0,
  ios: 0,
  kuaishou: 1
}, C), _[$z1PlatformSetting.AppName.Bili1] = ((A = {})[$z1PlatformSetting.SwitchID.ShenHe] = {
  appId: 9999,
  h5_wechat: 0,
  h5_bytedance: 0,
  h5_oppo: 0,
  h5_vivo: 0,
  h5_qq: 0,
  h5_kuaikan: 0,
  android_google: 0,
  android_vivo: 0,
  android_233: 0,
  android_4399: 0,
  android_xiaomi: 0,
  h5_baidu: 0,
  ios: 0,
  bilibili: 9
}, A[$z1PlatformSetting.SwitchID.ShenHe_ABD] = {
  appId: 9999,
  h5_wechat: 0,
  h5_bytedance: 0,
  h5_oppo: 0,
  h5_vivo: 0,
  h5_qq: 0,
  h5_kuaikan: 0,
  android_google: 0,
  android_vivo: 0,
  android_233: 0,
  android_4399: 0,
  android_xiaomi: 0,
  h5_baidu: 0,
  ios: 0,
  bilibili: 9
}, A), _[$z1PlatformSetting.AppName.Bili2] = ((D = {})[$z1PlatformSetting.SwitchID.ShenHe] = {
  appId: 9999,
  h5_wechat: 0,
  h5_bytedance: 0,
  h5_oppo: 0,
  h5_vivo: 0,
  h5_qq: 0,
  h5_kuaikan: 0,
  android_google: 0,
  android_vivo: 0,
  android_233: 0,
  android_4399: 0,
  android_xiaomi: 0,
  h5_baidu: 0,
  ios: 0,
  bilibili: 9
}, D[$z1PlatformSetting.SwitchID.ShenHe_ABD] = {
  appId: 9999,
  h5_wechat: 0,
  h5_bytedance: 0,
  h5_oppo: 0,
  h5_vivo: 0,
  h5_qq: 0,
  h5_kuaikan: 0,
  android_google: 0,
  android_vivo: 0,
  android_233: 0,
  android_4399: 0,
  android_xiaomi: 0,
  h5_baidu: 0,
  ios: 0,
  bilibili: 9
}, D), _);
exports.UM_VERSION = ((M = {})[$z1PlatformSetting.AppName.Main] = {
  h5_wechat: "1",
  h5_bytedance: "1.0.6",
  h5_oppo: "1.0.0",
  h5_vivo: "1.0.1",
  h5_qq: "1.0.0",
  h5_kuaikan: "1",
  android_google: "1.0.0",
  android_vivo: "1.0.0",
  android_233: "1.0.0",
  android_4399: "1.0.0",
  android_xiaomi: "1.0.0",
  h5_baidu: "1.0.0",
  ios: "1.0.0",
  editor: "1.0.0",
  android_ohayoo: "1.0.0",
  android_bytedance: "1.0.0",
  Google: "1.0.0",
  kuaishou: "1.0.0",
  huawei: "1.0.0",
  weblink: "1.0.0",
  bilibili: "1.0.0"
}, M[$z1PlatformSetting.AppName.MRDYX] = {
  weblink: "1.0.0",
  h5_bytedance: "1.0.0",
  h5_wechat: "1.0.0",
  bilibili: "1.0.0"
}, M[$z1PlatformSetting.AppName.ZSSWZ] = {
  h5_wechat: "1.0.0",
  h5_bytedance: "1.0.0",
  bilibili: "1.0.0"
}, M[$z1PlatformSetting.AppName.XDQB] = {
  h5_wechat: "1.1.0",
  bilibili: "1.0.0"
}, M[$z1PlatformSetting.AppName.Bili1] = {
  bilibili: "0.0.1"
}, M[$z1PlatformSetting.AppName.Bili2] = {
  bilibili: "0.0.1",
  kuaishou: "1.0.0",
  h5_wechat: "1.0.0",
  editor: "1.0.0"
}, M[$z1PlatformSetting.AppName.XXSCD] = {
  bilibili: "1.0.0",
  h5_kuaikan: "1.0.1",
  kuaishou: "1.0.1"
}, M);
exports.AdConfig = ((T = {})[$z1PlatformSetting.AppName.Main] = ((w = {})[$z1BasePlatform.Platform.WECHAT] = {
  videoId: "1",
  multitonVideoId: "1",
  appTitle: "1",
  templateId: "33",
  insertId: "44",
  bannerId: "55",
  splashId: "66",
  nativeId: "77788"
}, w[$z1BasePlatform.Platform.BYTEDANCE] = {
  videoId: "5d003f0f53535ubje6",
  multitonVideoId: "5d003f0f53535ubje6",
  get appTitle() { return require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.platformconfig.text.397]]"); },
  insertId: "dd",
  bannerId: "dd",
  splashId: "dd",
  nativeId: "dd",
  templateId: "dd"
}, w[$z1BasePlatform.Platform.EDITOR] = {}, w[$z1BasePlatform.Platform.WEB_LINK] = {}, w), T[$z1PlatformSetting.AppName.MRDYX] = ((k = {})[$z1BasePlatform.Platform.WEB_LINK] = {}, k[$z1BasePlatform.Platform.BYTEDANCE] = {
  videoId: "81bhb59k7gb512gl4a",
  multitonVideoId: "81bhb59k7gb512gl4a",
  get appTitle() { return require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.platformconfig.text.406]]"); },
  templateId: "dd",
  insertId: "dd",
  bannerId: "dd",
  splashId: "dd",
  nativeId: "dd"
}, k[$z1BasePlatform.Platform.WECHAT] = {}, k), T[$z1PlatformSetting.AppName.ZSSWZ] = ((S = {})[$z1BasePlatform.Platform.BYTEDANCE] = {}, S[$z1BasePlatform.Platform.WECHAT] = {
  videoId: "adunit-7290a85ac7c2e9ea",
  multitonVideoId: "adunit-7290a85ac7c2e9ea",
  get appTitle() { return require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.platformconfig.text.415]]"); },
  templateId: "dd",
  insertId: "dd",
  bannerId: "dd",
  splashId: "dd",
  nativeId: "dd"
}, S), T[$z1PlatformSetting.AppName.XDQB] = ((K = {})[$z1BasePlatform.Platform.WECHAT] = {
  videoId: "adunit-abbfb1ec650e7e1d",
  multitonVideoId: "adunit-abbfb1ec650e7e1d",
  get appTitle() { return require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.platformconfig.text.424]]"); }
}, K), T[$z1PlatformSetting.AppName.XXSCD] = ((B = {})[$z1BasePlatform.Platform.BiliBili] = {}, B[$z1BasePlatform.Platform.KUAIKAN] = {}, B[$z1BasePlatform.Platform.KuaiShou] = {
  videoId: "2300006151_01",
  multitonVideoId: "2300006151_01",
  get appTitle() { return require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.platformconfig.text.428]]"); },
  templateId: "dd",
  insertId: "dd",
  bannerId: "dd",
  splashId: "dd",
  nativeId: "dd"
}, B), T[$z1PlatformSetting.AppName.Bili2] = ((E = {})[$z1BasePlatform.Platform.BiliBili] = {}, E), T);
exports.ServerDataCfg = ((N = {})[$z1PlatformSetting.AppName.Main] = {
  wechatOpened: true,
  douyinOpened: true,
  serverdataid: 316
}, N[$z1PlatformSetting.AppName.MRDYX] = {
  wechatOpened: false,
  douyinOpened: true,
  serverdataid: 331
}, N[$z1PlatformSetting.AppName.ZSSWZ] = {
  wechatOpened: true,
  douyinOpened: false,
  serverdataid: 321
}, N[$z1PlatformSetting.AppName.XDQB] = {
  wechatOpened: true,
  douyinOpened: false,
  serverdataid: 326
}, N[$z1PlatformSetting.AppName.XXSCD] = {
  wechatOpened: false,
  douyinOpened: false,
  serverdataid: 0
}, N[$z1PlatformSetting.AppName.Bili2] = {
  wechatOpened: false,
  douyinOpened: false,
  serverdataid: 0
}, N);