var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_GAD_Enemy_Ani = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ani = null;
    e._attackFunc = null;
    e._attackCompleteFunc = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {};
  _ctor.prototype.Attack = function () {
    this._attackFunc && this._attackFunc();
    this._attackFunc = null;
  };
  _ctor.prototype.playAttack = function (t, e) {
    var n = this;
    this._attackFunc = t;
    this._attackCompleteFunc = e;
    this.ani.play("pbt_enemy_attack");
    this.ani.on("finished", function () {
      n._attackCompleteFunc && n._attackCompleteFunc();
      n._attackCompleteFunc = null;
      console.log("playAttack finished");
    });
  };
  _ctor.prototype.playMove = function () {
    this.ani.currentClip && "pbt_enemy_move" == this.ani.currentClip.name || this.ani.play("pbt_enemy_move");
  };
  cc__decorate([ccp_property(cc.Animation)], _ctor.prototype, "ani", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_GAD_Enemy_Ani;