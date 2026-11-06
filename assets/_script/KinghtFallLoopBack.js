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
var def_KinghtFallLoopBack = function (t) {
  function _ctor() {
    return null !== t && t.apply(this, arguments) || this;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    var t = this.node.getComponent(cc.Sprite);
    t.type = cc.Sprite.Type.TILED;
    var e = t.spriteFrame;
    this.node.setContentSize(cc.winSize.width + e.getOriginalSize().width, cc.winSize.height + e.getOriginalSize().height);
    cc.tween(this.node).set({
      position: cc.v3(-e.getOriginalSize().width / 2, -e.getOriginalSize().height / 2, 0)
    }).to(20, {
      position: cc.v3(cc.winSize.width / 2, cc.winSize.height / 2, 0)
    }).union().repeatForever().start();
  };
  return cc__decorate([ccp_ccclass, ccp_requireComponent(cc.Sprite), ccp_menu("自定义组件KinghtFall/LoopBack")], _ctor);
}(cc.Component);
exports.default = def_KinghtFallLoopBack;