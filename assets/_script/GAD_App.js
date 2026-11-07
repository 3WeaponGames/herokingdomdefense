Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1AudioMgr = require("AudioMgr");
var $z1EventMgr = require("EventMgr");
var $z1UIMgr = require("UIMgr");
var $z1Config = require("Config");
var $z1GAD_Configs = require("GAD_Configs");
var $z1GAD_DataMgr = require("GAD_DataMgr");
var $z1GAD_PlayerMgr = require("GAD_PlayerMgr");
var def_GAD_App = function () {
  function _ctor() {
    this._isInited = false;
    this._exitCall = null;
    this.lockNum = 3;
  }
  Object.defineProperty(_ctor, "instance", {
    get: function () {
      this._instance || (this._instance = new _ctor());
      return this._instance;
    },
    enumerable: false,
    configurable: true
  });
  _ctor.prototype.enter_App = function (t, e, entry) {
    var n = this;
    if (this._entryOpen) this._entryOpen.cancel();
    this._entryOpen = null;
    var generation = this._entryGeneration = (this._entryGeneration || 0) + 1;
    this.addTouchEvent();
    this._exitCall = e;
    cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    var h = function () {
      if (n._entryGeneration !== generation) return;
      if (!$z1GAD_PlayerMgr.default.getInstance().readyForRun()) { n.removeTouchEvent(); if (entry && entry.onCancel) entry.onCancel(); return; }
      n._isInited = true;
      $z1GAD_PlayerMgr.default.getInstance().reset();
      n._entryOpen = $z1UIMgr.UIMgr.getInstance().openUIWithOwner($z1GAD_Configs.GAD_UIID.UIGame, $z1Config.UIID.UINONE, {
        isCurrent: function () { return n._entryGeneration === generation; },
        onCancel: function () { if (n._entryGeneration === generation) n.removeTouchEvent(); if (entry && entry.onCancel) entry.onCancel(); },
        onOpened: function () {
        if (n._entryGeneration !== generation) return;
        n.removeTouchEvent();
        t && t();
        if (n._entryGeneration !== generation) return;
        $z1AudioMgr.AudioMgr.getInstance().playMusic($z1GAD_Configs.GAD_AudioId.bgm, $z1GAD_Configs.GADConfig.BgMusic);
        $z1AudioMgr.AudioMgr.getInstance().playEffect($z1GAD_Configs.GAD_AudioId.mission);
      } }, entry ? { cost: entry.cost, unlockStage: entry.unlockStage, isCurrent: function () { return n._entryGeneration === generation; } } : null);
    };
    if (this._isInited) {
      h();
    } else {
      $z1UIMgr.UIMgr.getInstance().addUICnf($z1GAD_Configs.GAD_UICF);
      $z1AudioMgr.AudioMgr.getInstance().addAdConf($z1GAD_Configs.GAD_AudioCF);
      $z1GAD_DataMgr.default.getInstance().load(function () {
        if (n._entryGeneration !== generation) return;
        $z1GAD_DataMgr.default.getInstance().initCfgData();
        $z1GAD_PlayerMgr.default.getInstance().preload(function () {
          h();
        });
      });
    }
  };
  _ctor.prototype.exit_App = function (t) {
    this._entryGeneration = (this._entryGeneration || 0) + 1;
    if (this._entryOpen) this._entryOpen.cancel();
    this._entryOpen = null;
    $z1GAD_PlayerMgr.default.getInstance().setState($z1GAD_Configs.emGADGameState.Over);
    $z1GAD_PlayerMgr.default.getInstance().finishRun("quit");
    $z1AudioMgr.AudioMgr.getInstance().stopMusic($z1GAD_Configs.GADConfig.BgMusic);
    this.removeTouchEvent();
    var exitCall = this._exitCall;
    this._exitCall = null;
    $z1UIMgr.UIMgr.getInstance().closeById($z1GAD_Configs.GAD_UIID.UIGame);
    $z1UIMgr.UIMgr.getInstance().closeById($z1GAD_Configs.GAD_UIID.UIResult);
    $z1UIMgr.UIMgr.getInstance().closeById($z1GAD_Configs.GAD_UIID.UIPause);
    cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    exitCall && exitCall(t);
  };
  _ctor.prototype.onKeyUp = function (t) {
    t.keyCode == cc.macro.KEY.space && $z1EventMgr.EventMgr.getInstance().emit($z1GAD_Configs.emGADEventName.GAD_WebPause);
  };
  _ctor.prototype.addTouchEvent = function () {
    this.removeTouchEvent();
    var t = new cc.Node();
    this._touchBlocker = t;
    t.setContentSize(cc.winSize.width, cc.winSize.height);
    t.addComponent(cc.BlockInputEvents).enabled = true;
    t.zIndex = cc.macro.MAX_ZINDEX;
    t.name = "block_touch_event";
    t.parent = cc.Canvas.instance.node;
  };
  _ctor.prototype.removeTouchEvent = function () {
    var t = this._touchBlocker;
    this._touchBlocker = null;
    t && cc.isValid(t, true) && t.destroy();
  };
  return _ctor;
}();
exports.default = def_GAD_App;
