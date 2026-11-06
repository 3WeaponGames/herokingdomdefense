var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1AudioMgr = require("AudioMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_GAD_UISetting = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.musicSlider = null;
    e.effectSlider = null;
    e.btnClose = null;
    e.btnBackHome = null;
    e.btnPlay = null;
    e._musicBg2 = null;
    e._effectBg2 = null;
    e._callFunc = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t) {
    this._callFunc = t;
  };
  _ctor.prototype.onEnable = function () {
    this.musicSlider.progress = $z1AudioMgr.AudioMgr.getInstance().getMusicVolume();
    this.effectSlider.progress = $z1AudioMgr.AudioMgr.getInstance().getEffectVolume();
  };
  _ctor.prototype.start = function () {
    var t;
    var e;
    this._musicBg2 = null === (t = this.musicSlider.node.getChildByName("Background2")) || undefined === t ? undefined : t.getComponent(cc.Sprite);
    this._effectBg2 = null === (e = this.effectSlider.node.getChildByName("Background2")) || undefined === e ? undefined : e.getComponent(cc.Sprite);
    this._musicBg2 && (this._musicBg2.fillRange = this.musicSlider.progress);
    this._effectBg2 && (this._effectBg2.fillRange = this.effectSlider.progress);
    this.bindEvent();
    require("LanguageOptions").attach(this.node, -67);
  };
  _ctor.prototype.bindEvent = function () {
    var t = this;
    this.musicSlider.node.on("slide", function (e) {
      t._musicBg2 && (t._musicBg2.fillRange = e.progress);
      $z1AudioMgr.AudioMgr.getInstance().setMusicVolume(e.progress);
    }, this);
    this.effectSlider.node.on("slide", function (e) {
      t._effectBg2 && (t._effectBg2.fillRange = e.progress);
      $z1AudioMgr.AudioMgr.getInstance().setEffectVolume(e.progress);
    }, this);
    this.btnClose.on(cc.Node.EventType.TOUCH_END, function () {
      t._callFunc && t._callFunc(true);
      t.closeUI();
    }, this);
    this.btnBackHome.on(cc.Node.EventType.TOUCH_END, function () {
      t._callFunc && t._callFunc(false);
      t.closeUI();
    });
    this.btnPlay.on(cc.Node.EventType.TOUCH_END, function () {
      t._callFunc && t._callFunc(true);
      t.closeUI();
    });
  };
  cc__decorate([ccp_property(cc.Slider)], _ctor.prototype, "musicSlider", undefined);
  cc__decorate([ccp_property(cc.Slider)], _ctor.prototype, "effectSlider", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnClose", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnBackHome", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnPlay", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_GAD_UISetting;