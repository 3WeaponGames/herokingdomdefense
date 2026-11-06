var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
//电子邮件puhalskijsemen@gmail.com
//源码网站 开vpn全局模式打开 http://web3incubators.com/
//电报https://t.me/gamecode999
//网页客服 http://web3incubators.com/kefu.html

var $z1GAD_Base = require("GAD_Base");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_GAD_Bubble = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.text = null;
    e.icon = null;
    e._cardID = 0;
    e._cfg = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.setCardID = function (t) {
    this._cardID = t;
  };
  _ctor.prototype.getCardID = function () {
    return this._cardID;
  };
  _ctor.prototype.start = function () {
    this.node.active = true;
  };
  _ctor.prototype.init = function (t, e) {
    this.initTagID();
    this._cfg = t;
    this._cardID = e;
  };
  _ctor.prototype.getCfg = function () {
    return this._cfg;
  };
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "text", undefined);
  cc__decorate([ccp_property(cc.Sprite)], _ctor.prototype, "icon", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1GAD_Base.default);
exports.default = def_GAD_Bubble;