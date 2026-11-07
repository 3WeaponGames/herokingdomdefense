var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1SdkMgr = require("SdkMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIVideoTips = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.labTitle = null;
    e.sprIcon = null;
    e.sprfIconList = [];
    e.labInfo = null;
    e.btnClose = null;
    e.btnVideo = null;
    e.type = 0;
    e.callBack = null;
    e.typeInfo = [{
      name: "[[loc:data.soldiercfg.90001.name]]",
      info: "[[loc:script.kinghtfalluivideotips.text.25]]"
    }, {
      name: "[[loc:data.soldiercfg.90001.name]]",
      info: "[[loc:script.kinghtfalluivideotips.text.25]]"
    }, {
      name: "[[loc:data.soldiercfg.90001.name]]",
      info: "[[loc:script.kinghtfalluivideotips.text.25]]"
    }, {
      name: "[[loc:data.soldiercfg.90001.name]]",
      info: "[[loc:script.kinghtfalluivideotips.text.25]]"
    }, {
      name: "[[loc:script.kinghtfalluivideotips.text.36]]",
      info: "[[loc:script.kinghtfalluivideotips.text.37]]"
    }, {
      name: "[[loc:script.kinghtfalluivideotips.text.39]]",
      info: "[[loc:script.kinghtfalluivideotips.text.40]]"
    }, {
      name: "[[loc:data.goodscfg.2008.name]]",
      info: "[[loc:script.kinghtfalluivideotips.text.43]]"
    }, {
      name: "[[loc:script.kinghtfalluivideotips.text.45]]",
      info: "[[loc:script.kinghtfalluivideotips.text.46]]"
    }, {
      name: "[[loc:script.kinghtfalluivideotips.text.48]]",
      info: "[[loc:script.kinghtfalluivideotips.text.49]]"
    }];
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t, e) {
    this.type = t;
    this.callBack = e;
  };
  _ctor.prototype.start = function () {
    var t = this;
    this.labTitle.string = this.T(this.typeInfo[this.type - 1].name);
    this.sprIcon.spriteFrame = this.sprfIconList[this.type - 1];
    this.labInfo.string = this.T(this.typeInfo[this.type - 1].info);
    this.btnClose.on(cc.Node.EventType.TOUCH_END, function () {
      t.finishDecision(t.callBack, false);
    }, this);
    this.btnVideo.on(cc.Node.EventType.TOUCH_END, function () {
      if (t.isclose || t._decisionCompleted || t._decisionPending) return;
      t._decisionPending = true;
      var generation = t._resourceGeneration;
      $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
        if (generation === t._resourceGeneration) t._decisionPending = false;
        t.finishDecision(t.callBack, true, generation);
      }, function () {
        if (generation === t._resourceGeneration) t._decisionPending = false;
      }, "battle.offer.confirm");
    }, this);
  };
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "labTitle", undefined);
  cc__decorate([ccp_property(cc.Sprite)], _ctor.prototype, "sprIcon", undefined);
  cc__decorate([ccp_property([cc.SpriteFrame])], _ctor.prototype, "sprfIconList", undefined);
  cc__decorate([ccp_property(cc.RichText)], _ctor.prototype, "labInfo", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnClose", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnVideo", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIVideoTips;
