var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1Appcfg = require("Appcfg");
var $z1PlatformSetting = require("PlatformSetting");
var $z1AudioMgr = require("AudioMgr");
var $z1EventMgr = require("EventMgr");
var $z1PlatformManager = require("PlatformManager");
var $z1ResCacheMgr = require("ResCacheMgr");
var $z1ResourceMgr = require("ResourceMgr");
var $z1SdkMgr = require("SdkMgr");
var $z1UIMgr = require("UIMgr");
var $z1ServerDataMgr = require("ServerDataMgr");
var $z1Config = require("Config");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1DataMgr = require("DataMgr");
var $z1PlayerMgr = require("PlayerMgr");
var $z1LanguageMgr = require("LanguageMgr");
var $z1TestMode = require("TestMode");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_Loading = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.uiRoot = null;
    e.progressBar = null;
    e.labPro = null;
    e.logo = null;
    e.soft = null;
    e.process = 0;
    e.sceneName = "Main";
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    var self = this;
    this.loadingRetries = [];
    this.resourceErrorHandler = function (error, retry) { self.showLoadingError(error, retry); };
    $z1ResourceMgr.ResourceMgr.getInstance().loadErrorHandler = this.resourceErrorHandler;
    this.node.on(cc.Node.EventType.TOUCH_END, this.retryLoading, this);
    this.labPro.node.on(cc.Node.EventType.TOUCH_END, this.retryLoading, this);
    cc.director.preloadScene(this.sceneName);
    $z1LanguageMgr.LanguageMgr.getInstance().init();
  };
  _ctor.prototype.start = function () {
    var self = this;
    var language = $z1LanguageMgr.LanguageMgr.getInstance();
    language.init(function (error) {
      if (!cc.isValid(self)) return;
      if (error) return self.showLoadingError(error, function () { self.start(); });
      language.preloadArtwork(function () {
        if (cc.isValid(self) && !self.gameStarted) { self.gameStarted = true; self.loadLogo(); self.startGame(); }
      });
    });
  };
  _ctor.prototype.showLoadingError = function (error, retry) {
    if (!cc.isValid(this)) return;
    console.error("Startup resource failed", error);
    this.loadingRetries = this.loadingRetries || [];
    if (this.loadingRetries.indexOf(retry) < 0) this.loadingRetries.push(retry);
    var language = $z1LanguageMgr.LanguageMgr.getInstance();
    // This fallback is needed when the translation catalog itself could not load.
    var bootstrapMessage = "Unable to load the game. Tap to retry.";
    this.labPro.string = language.ready ? language.t("loading.failed") : bootstrapMessage;
    if (!this.progressLabelStyle) {
      this.progressLabelStyle = { width: this.labPro.node.width, height: this.labPro.node.height,
        overflow: this.labPro.overflow, horizontalAlign: this.labPro.horizontalAlign };
    }
    this.labPro.node.width = Math.min(cc.winSize.width - 80, 640) / Math.abs(this.labPro.node.scaleX || 1);
    this.labPro.node.height = 180;
    this.labPro.overflow = cc.Label.Overflow.SHRINK;
    this.labPro.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
  };
  _ctor.prototype.retryLoading = function () {
    if (!this.loadingRetries || !this.loadingRetries.length) return;
    var retries = this.loadingRetries.splice(0);
    if (this.progressLabelStyle) {
      this.labPro.node.width = this.progressLabelStyle.width;
      this.labPro.node.height = this.progressLabelStyle.height;
      this.labPro.overflow = this.progressLabelStyle.overflow;
      this.labPro.horizontalAlign = this.progressLabelStyle.horizontalAlign;
      this.progressLabelStyle = null;
    }
    var language = $z1LanguageMgr.LanguageMgr.getInstance();
    this.labPro.string = language.ready ? language.t("loading.progress", [Math.round(this.process * 100)]) : "0%";
    retries.forEach(function (retry) { retry(); });
  };
  _ctor.prototype.loadMainScene = function () {
    var self = this;
    var retry = function () { self.loadMainScene(); };
    var accepted = cc.director.loadScene(this.sceneName, function (error) {
      if (error) self.showLoadingError(error, retry);
    });
    if (accepted === false) this.showLoadingError(new Error("Main scene is unavailable"), retry);
  };
  _ctor.prototype.onDestroy = function () {
    var resources = $z1ResourceMgr.ResourceMgr.getInstance();
    if (resources.loadErrorHandler === this.resourceErrorHandler) resources.loadErrorHandler = null;
    this.node.off(cc.Node.EventType.TOUCH_END, this.retryLoading, this);
    if (cc.isValid(this.labPro.node)) this.labPro.node.off(cc.Node.EventType.TOUCH_END, this.retryLoading, this);
    $z1EventMgr.EventMgr.getInstance().off($z1Appcfg.BaseEventName.Loading, this, this.setProcessLoad);
    this.loadingRetries = [];
  };
  _ctor.prototype.startGame = function () {
    var t = this;
    cc.debug.setDisplayStats(false);
    cc.game.addPersistRootNode(this.uiRoot);
    this.progressBar.fillRange = 0;
    this.labPro.string = $z1LanguageMgr.LanguageMgr.getInstance().t("loading.progress", [0]);
    $z1PlatformManager.PlatformManager.getInstance().init();
    $z1ResCacheMgr.ResCacheMgr.getInstance().init();
    $z1UIMgr.UIMgr.getInstance().addUICnf($z1Config.UICF);
    $z1UIMgr.UIMgr.getInstance().Init(this.uiRoot);
    $z1TestMode.TestMode.getInstance().init();
    $z1AudioMgr.AudioMgr.getInstance().init($z1Config.AudioCF);
    $z1EventMgr.EventMgr.getInstance().on($z1Appcfg.BaseEventName.Loading, this, this.setProcessLoad);
    $z1SdkMgr.SdkMgr.getInstance().requestCheckVersion(function () {
      $z1ServerDataMgr.ServerdataMgr.init(function () {
        t.setProcessLoad($z1Appcfg.LoadingProcess.StartLoading);
      });
    });
    this.preloadUI();
    console.log("当前应用", $z1PlatformSetting.PlatformSetting.currentApp);
    console.log("当前渠道", $z1PlatformSetting.PlatformSetting.currentPlatform);
  };
  _ctor.prototype.setProcessLoad = function (t) {
    this.process = t / 100;
    if (!this.loadingRetries || !this.loadingRetries.length) this.labPro.string = $z1LanguageMgr.LanguageMgr.getInstance().t("loading.progress", [t]);
    this.progressBar.fillRange = this.process;
    switch (t) {
      case $z1Appcfg.LoadingProcess.StartLoading:
        $z1DataMgr.DataMgr.getInstance().preload();
        break;
      case $z1Appcfg.LoadingProcess.ExcelCfg:
        $z1PlayerMgr.PlayerMgr.getInstance().preload();
        break;
      case $z1Appcfg.LoadingProcess.PlayerCfg:
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.dau);
        $z1KinghtFallModle.default.getInstance().preload(null);
        break;
      case $z1Appcfg.LoadingProcess.ResCfg:
      case $z1Appcfg.LoadingProcess.OtherCfg:
        break;
      case $z1Appcfg.LoadingProcess.EndLoading:
        this.loadMainScene();
    }
  };
  _ctor.prototype.preloadUI = function () {};
  _ctor.prototype.loadLogo = function () {
    var t = this;
    var e = "wg_jz_logo";
    switch ($z1PlatformSetting.PlatformSetting.currentApp) {
      case $z1PlatformSetting.AppName.Main:
        e = "wg_jz_logo";
        this.soft.string = "";
        break;
      case $z1PlatformSetting.AppName.MRDYX:
        e = "wg_jz_logo1";
        this.soft.string = "";
        break;
      case $z1PlatformSetting.AppName.ZSSWZ:
        e = "wg_jz_logo2";
        this.soft.string = "";
        break;
      default:
        e = "";
        this.soft.string = "";
    }
    $z1ResourceMgr.ResourceMgr.getInstance().loadSpriteframe("load", e, function (e) {
      e && cc.isValid(t.logo) && (t.logo.spriteFrame = e);
    });
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "uiRoot", undefined);
  cc__decorate([ccp_property(cc.Sprite)], _ctor.prototype, "progressBar", undefined);
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "labPro", undefined);
  cc__decorate([ccp_property(cc.Sprite)], _ctor.prototype, "logo", undefined);
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "soft", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_Loading;
