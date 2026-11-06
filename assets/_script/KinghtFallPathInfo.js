var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallPathInfo = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndLockList = [];
    e.ndBuildList = [];
    return e;
  }
  cc__extends(_ctor, t);
  cc__decorate([ccp_property({
    type: [Number],
    tooltip: "涉及出生点"
  })], _ctor.prototype, "ndLockList", undefined);
  cc__decorate([ccp_property({
    type: [Number],
    tooltip: "涉及建筑点"
  })], _ctor.prototype, "ndBuildList", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_KinghtFallPathInfo;