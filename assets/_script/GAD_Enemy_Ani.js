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
    var callback = this._attackFunc;
    this._attackFunc = null;
    callback && callback();
  };
  _ctor.prototype.playAttack = function (t, e) {
    this._attackFunc = t;
    this._attackCompleteFunc = e;
    this.ani.off("finished", this.onAttackFinished, this);
    this.ani.on("finished", this.onAttackFinished, this);
    this.ani.play("pbt_enemy_attack");
  };
  _ctor.prototype.onAttackFinished = function (event, state) {
    if (state && state.name !== "pbt_enemy_attack") return;
    var callback = this._attackCompleteFunc;
    this._attackFunc = this._attackCompleteFunc = null;
    this.ani.off("finished", this.onAttackFinished, this);
    callback && callback();
  };
  _ctor.prototype.onDestroy = function () {
    this.ani && this.ani.off("finished", this.onAttackFinished, this);
    this._attackFunc = this._attackCompleteFunc = null;
  };
  _ctor.prototype.playMove = function () {
    this.ani.currentClip && "pbt_enemy_move" == this.ani.currentClip.name || this.ani.play("pbt_enemy_move");
  };
  cc__decorate([ccp_property(cc.Animation)], _ctor.prototype, "ani", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_GAD_Enemy_Ani;
