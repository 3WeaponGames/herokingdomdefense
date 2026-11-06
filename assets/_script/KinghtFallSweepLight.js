var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_menu = cc__decorator.menu;
var ccp_requireComponent = cc__decorator.requireComponent;
var def_KinghtFallSweepLight = function (t) {
  function _ctor() {
    return null !== t && t.apply(this, arguments) || this;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    var t = this.node.getComponent(cc.Sprite).spriteFrame;
    cc.tween(this.node).set({
      position: cc.v3(-(t.getOriginalSize().width + cc.winSize.width) / 2)
    }).to(5, {
      position: cc.v3((t.getOriginalSize().width + cc.winSize.width) / 2)
    }).start();
  };
  return cc__decorate([ccp_ccclass, ccp_requireComponent(cc.Sprite), ccp_menu("自定义组件KinghtFall/SweepLight")], _ctor);
}(cc.Component);
exports.default = def_KinghtFallSweepLight;