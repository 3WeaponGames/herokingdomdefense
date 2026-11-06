var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1SdkMgr = require("SdkMgr");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIBuildSel = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndItem = null;
    e.ndParent = null;
    e.build = null;
    e.callBack = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.init = function (t, e) {
    this.build = t;
    this.callBack = e;
  };
  _ctor.prototype.start = function () {
    this.ndItem.active = false;
    this.initView();
  };
  _ctor.prototype.initView = function () {
    var t = this;
    var e = this.build.buildInfo.cfg.BranchBuild;
    var n = function (n) {
      var a = e[n];
      var o = i.build.buildCfg.levelList[a - 1];
      var r = cc.instantiate(i.ndItem);
      r.parent = i.ndParent;
      r.active = true;
      r.x = 0;
      i.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconBuild, o.Icon, function (t) {
        var e = r.getChildByName("sprIcon");
        e.getComponent(cc.Sprite).spriteFrame = t;
        e.scale = o.Zoom;
        e.setPosition(o.Excursion ? cc.v2(o.Excursion[0] || 0, o.Excursion[1] || 0) : cc.v2(0, 0));
      });
      r.getChildByName("labName").getComponent(cc.Label).string = i.T(o.Name);
      for (var d = 0; d < r.children.length; d++) {
        var p = r.children[d];
        "ndNormal" == p.name && (p.active = !!o.BuildSliverCost);
        "ndVideo" == p.name && (p.active = !o.BuildSliverCost);
      }
      r.getChildByName("labInfo").getComponent(cc.RichText).string = require("LanguageMgr").LanguageMgr.getInstance().format("<b><outline color=#000000 width=4>{0}</outline></b>", [i.T(o.LevelUpDescribe)]);
      if (o.BuildSliverCost) {
        r.on(cc.Node.EventType.TOUCH_END, function () {
          t.callBack(a);
          t.closeUI();
        }, i);
      } else {
        r.on(cc.Node.EventType.TOUCH_END, function () {
          $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
            switch (t.build.buildCfg.enumValue) {
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.PrivateHouse:
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_up_2v1_X, "house");
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.ArrowTower:
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_up_2v1_X, "arrwo");
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Wall:
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_up_2v1_X, "wall");
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Mill:
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_up_2v1_X, "mill");
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Barracks:
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_up_2v1_X, "camp");
                break;
              case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.CastleCenter:
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_up_2v1_X, "home");
            }
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.building_2v1);
            $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_building_2v1_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
            t.callBack(a);
            t.closeUI();
          });
        }, i);
      }
    };
    var i = this;
    for (var a = 0; a < e.length; a++) {
      n(a);
    }
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndItem", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndParent", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIBuildSel;