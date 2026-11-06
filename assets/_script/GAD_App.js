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
  _ctor.prototype.enter_App = function (t, e) {
    var n = this;
    this.addTouchEvent();
    this._exitCall = e;
    cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP, function (t) {
      t.keyCode == cc.macro.KEY.space && $z1EventMgr.EventMgr.getInstance().emit($z1GAD_Configs.emGADEventName.GAD_WebPause);
    });
    var h = function () {
      n._isInited = true;
      $z1GAD_PlayerMgr.default.getInstance().reset();
      $z1UIMgr.UIMgr.getInstance().openUIOfCallback($z1GAD_Configs.GAD_UIID.UIGame, $z1Config.UIID.UINONE, function () {
        t && t();
        n.removeTouchEvent();
        $z1AudioMgr.AudioMgr.getInstance().playMusic($z1GAD_Configs.GAD_AudioId.bgm, $z1GAD_Configs.GADConfig.BgMusic);
        $z1AudioMgr.AudioMgr.getInstance().playEffect($z1GAD_Configs.GAD_AudioId.mission);
      });
    };
    if (this._isInited) {
      h();
    } else {
      $z1UIMgr.UIMgr.getInstance().addUICnf($z1GAD_Configs.GAD_UICF);
      $z1AudioMgr.AudioMgr.getInstance().addAdConf($z1GAD_Configs.GAD_AudioCF);
      $z1GAD_DataMgr.default.getInstance().load(function () {
        $z1GAD_DataMgr.default.getInstance().initCfgData();
        $z1GAD_PlayerMgr.default.getInstance().preload(function () {
          h();
        });
      });
    }
  };
  _ctor.prototype.exit_App = function (t) {
    $z1UIMgr.UIMgr.getInstance().closeById($z1GAD_Configs.GAD_UIID.UIGame);
    $z1UIMgr.UIMgr.getInstance().closeById($z1GAD_Configs.GAD_UIID.UIResult);
    $z1UIMgr.UIMgr.getInstance().closeById($z1GAD_Configs.GAD_UIID.UIPause);
    cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP);
    this._exitCall && this._exitCall(t);
    this._exitCall = null;
  };
  _ctor.prototype.addTouchEvent = function () {
    var t = new cc.Node();
    t.setContentSize(cc.winSize.width, cc.winSize.height);
    t.addComponent(cc.BlockInputEvents).enabled = true;
    t.zIndex = 999999;
    t.name = "block_touch_event";
    t.parent = cc.Canvas.instance.node;
  };
  _ctor.prototype.removeTouchEvent = function () {
    var t = cc.Canvas.instance.node.getChildByName("block_touch_event");
    t && t.destroy();
  };
  return _ctor;
}();
exports.default = def_GAD_App;