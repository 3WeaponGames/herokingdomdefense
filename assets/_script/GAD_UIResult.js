var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1AudioMgr = require("AudioMgr");
var $z1GAD_Configs = require("GAD_Configs");
var $z1GAD_App = require("GAD_App");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_GAD_UIResult = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.isWin = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t) {
    this.isWin = t;
  };
  _ctor.prototype.start = function () {
    var t = this;
    if (this.isWin) {
      this.resultSp.setAnimation(0, "victory_appear", false);
      this.resultSp.setCompleteListener(function () {
        t.resultSp.setAnimation(0, "victory_idle", false);
      });
    } else {
      this.resultSp.setAnimation(0, "fail_appear", false);
      this.resultSp.setCompleteListener(function () {
        t.resultSp.setAnimation(0, "fail_idle", false);
      });
    }
    $z1AudioMgr.AudioMgr.getInstance().stopMusic($z1GAD_Configs.GADConfig.BgMusic);
    $z1AudioMgr.AudioMgr.getInstance().playEffectFree(this.isWin ? $z1GAD_Configs.GAD_AudioId.victory : $z1GAD_Configs.GAD_AudioId.fail);
    this.btnExit.on(cc.Node.EventType.TOUCH_END, function () {
      $z1GAD_App.default.instance.exit_App(0);
    });
  };
  cc__decorate([ccp_property(sp.Skeleton)], _ctor.prototype, "resultSp", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnExit", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_GAD_UIResult;