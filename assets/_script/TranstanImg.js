var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1Appcfg = require("Appcfg");
var $z1LanguageMgr = require("LanguageMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var ccp_menu = cc__decorator.menu;
var def_TranstanImg = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.en = null;
    e.jp = null;
    e.fz = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    this._originalFrame = this.node.getComponent(cc.Sprite) && this.node.getComponent(cc.Sprite).spriteFrame;
    $z1LanguageMgr.LanguageMgr.getInstance().onChange(this.refresh, this);
    this.refresh();
  };
  _ctor.prototype.onDestroy = function () {
    $z1LanguageMgr.LanguageMgr.getInstance().offChange(this.refresh, this);
  };
  _ctor.prototype.refresh = function () {
    this.en && (this.en.active = false);
    this.jp && (this.jp.active = false);
    this.fz && (this.fz.active = false);
    var t = this.node.getComponent(cc.Sprite);
    if ($z1LanguageMgr.LanguageMgr.getInstance().getCurrentLanguage() == $z1Appcfg.LanguageType.en && this.en) {
      this.en.active = true;
      t && (t.spriteFrame = null);
    } else if ($z1LanguageMgr.LanguageMgr.getInstance().getCurrentLanguage() == $z1Appcfg.LanguageType.jp && this.jp) {
      this.jp.active = true;
      t && (t.spriteFrame = null);
    } else if ($z1LanguageMgr.LanguageMgr.getInstance().getCurrentLanguage() == $z1Appcfg.LanguageType.zh_tw && this.fz && t) {
      this.fz.active = true, t.spriteFrame = null;
    } else if (t && this._originalFrame) {
      t.spriteFrame = this._originalFrame;
    }
  };
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "英文"
  })], _ctor.prototype, "en", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "日语"
  })], _ctor.prototype, "jp", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "繁体"
  })], _ctor.prototype, "fz", undefined);
  return cc__decorate([ccp_ccclass, ccp_menu("多语言/TranstanImg")], _ctor);
}(cc.Component);
exports.default = def_TranstanImg;
