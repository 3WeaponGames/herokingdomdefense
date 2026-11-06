var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1LanguageMgr = require("LanguageMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
cc__decorator.property;
var ccp_menu = cc__decorator.menu;
var def_TranstaLabel = function (t) {
  function _ctor() {
    return null !== t && t.apply(this, arguments) || this;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    this.refresh();
  };
  _ctor.prototype.refresh = function () {
    var label = this.node.getComponent(cc.Label) || this.node.getComponent(cc.RichText);
    if (label) $z1LanguageMgr.LanguageMgr.getInstance().refreshLabel(label);
  };
  return cc__decorate([ccp_ccclass, ccp_menu("多语言/TranstLabel")], _ctor);
}(cc.Component);
exports.default = def_TranstaLabel;
