var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1Config = require("Config");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIExchangeCode = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.editName = null;
    e.btnVideo = null;
    e.btnClose = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (e) {
    t.prototype.init.call(this);
    this.editName.string = e || "";
  };
  _ctor.prototype.start = function () {
    this.initEventListener();
    this.initBtnListener();
    this.initView();
    this.initBtnView();
  };
  _ctor.prototype.initEventListener = function () {};
  _ctor.prototype.initBtnListener = function () {
    this.btnClose.on(cc.Node.EventType.TOUCH_END, this.closeUI, this);
    this.btnVideo.on(cc.Node.EventType.TOUCH_END, this.openVideo, this);
  };
  _ctor.prototype.initView = function () {};
  _ctor.prototype.initBtnView = function () {};
  _ctor.prototype.openVideo = function () {
    var t = this.editName.string;
    if (t && 0 != t.length) {
      var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getCode(t);
      if (e) {
        var status = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getCodeStatus(e);
        if (status === "future") {
          this.openUI($z1Config.UIID.UITips, "[[loc:script.kinghtfalluiexchangecode.text.52]]");
        } else if (status !== "active") {
          this.openUI($z1Config.UIID.UITips, "[[loc:script.kinghtfalluiexchangecode.text.54]]");
        } else {
          var o = "gift_" + t.toLocaleLowerCase();
          if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getTimeByKey(o) >= e.exchange_time) {
            this.openUI($z1Config.UIID.UITips, "[[loc:script.kinghtfalluiexchangecode.text.58]]");
          } else {
            var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
            var r = e.rewards;
            var g = [];
            for (var u = 0; u < r.length; u++) {
              g.push({
                id: r[u][0],
                num: r[u][1]
              });
            }
            var d = player.claimRewards(g, 1, undefined, function () {
              player.getGuideData().addTimeByKey(o);
            }, function () {
              return $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getCodeStatus(e) === "active" && player.getGuideData().getTimeByKey(o) < e.exchange_time;
            });
            if (!d || !d.length) return;
            this.openUI($z1Config.UIID.UITips, e.gift_name);
            this.openUI($z1KinghtFallConfig.KinghtFallUIID.UIGoldReward, d);
            this.closeUI();
          }
        }
      } else {
        this.openUI($z1Config.UIID.UITips, "[[loc:script.kinghtfalluiexchangecode.text.76]]");
      }
    } else {
      this.openUI($z1Config.UIID.UITips, "[[loc:script.kinghtfalluiexchangecode.text.79]]");
    }
  };
  cc__decorate([ccp_property(cc.EditBox)], _ctor.prototype, "editName", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnVideo", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnClose", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIExchangeCode;
