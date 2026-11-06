var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseCtrl = require("BaseCtrl");
var $z1AudioMgr = require("AudioMgr");
var $z1UIMgr = require("UIMgr");
var $z1Config = require("Config");
var $z1commonConfig = require("commonConfig");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var def_gameCtrl = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.initMap = new Map();
    e._exitCall = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.enterSubModel = function (t, e, n) {
    var i = this;
    this._exitCall = n;
    this.initProperty(t);
    this.addTouchEvent();
    i.initMap[t] = true;
    $z1UIMgr.UIMgr.getInstance().openUIOfCallback(i.gameConf.gameUIID.UIGameExist, $z1Config.UIID.UINONE, function () {
      e && e();
      i.removeTouchEvent();
    });
  };
  _ctor.prototype.initProperty = function (t) {
    this.gameConf = $z1commonConfig.game.getGameConfig(t);
    if (!this.initMap[t]) {
      $z1UIMgr.UIMgr.getInstance().addUICnf(this.gameConf.gameUICF);
      $z1AudioMgr.AudioMgr.getInstance().addAdConf(this.gameConf.gameAudioCF);
    }
  };
  _ctor.prototype.exitSubModel = function () {};
  _ctor.prototype.addTouchEvent = function () {
    var t = new cc.Node();
    t.setContentSize(cc.winSize.width, cc.winSize.height);
    t.addComponent(cc.BlockInputEvents).enabled = true;
    t.zIndex = 9999;
    t.name = "block_touch_event";
    t.parent = cc.Canvas.instance.node;
  };
  _ctor.prototype.removeTouchEvent = function () {
    var t = cc.Canvas.instance.node.getChildByName("block_touch_event");
    t && t.destroy();
  };
  _ctor.prototype.onLoad = function () {};
  _ctor.prototype.start = function () {};
  _ctor.prototype.update = function () {};
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.default = def_gameCtrl;