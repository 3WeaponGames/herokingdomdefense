Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallPlayerMgr = undefined;
var $z1EventMgr = require("EventMgr");
var $z1LanguageMgr = require("LanguageMgr");
var $z1UIMgr = require("UIMgr");
var $z1Config = require("Config");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallDailyData = require("KinghtFallDailyData");
var $z1KinghtFallGameData = require("KinghtFallGameData");
var $z1KinghtFallGuideData = require("KinghtFallGuideData");
var $z1KinghtFallMissionData = require("KinghtFallMissionData");
var $z1KinghtFallUserData = require("KinghtFallUserData");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var exp_KinghtFallPlayerMgr = function () {
  function _ctor() {}
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new _ctor());
    return this.instance;
  };
  _ctor.prototype.preload = function (t) {
    this.udata = new $z1KinghtFallUserData.KinghtFallUserData();
    this.udata.getData();
    this.missionData = new $z1KinghtFallMissionData.KinghtFallMissionData();
    this.missionData.getData();
    this.guideData = new $z1KinghtFallGuideData.KinghtFallGuideData();
    this.guideData.getData();
    this.dailyData = new $z1KinghtFallDailyData.KinghtFallDailyData();
    this.dailyData.getData();
    this.gameData = new $z1KinghtFallGameData.KinghtFallGameData();
    this.gameData.getData();
    this.reloadConfig();
    t && t();
  };
  _ctor.prototype.reloadConfig = function () {};
  _ctor.prototype.getUserData = function () {
    return this.udata;
  };
  _ctor.prototype.getDailyData = function () {
    return this.dailyData;
  };
  _ctor.prototype.getGuideData = function () {
    return this.guideData;
  };
  _ctor.prototype.getMissionData = function () {
    return this.missionData;
  };
  _ctor.prototype.getGameData = function () {
    return this.gameData;
  };
  _ctor.prototype.trySub = function (t, e) {
    undefined === e && (e = false);
    for (var n = 0; n < t.length; n++) {
      var i = t[n].id;
      var c = t[n].num;
      switch ($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(i).type) {
        case $z1KinghtFallEnum.KinghtFallEnumGoodType.Type01:
          switch (i) {
            case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin:
              if (c > this.udata.getGoldNum()) {
                if (e) {
                  $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIAddCurrency, $z1Config.UIID.UITips, $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin);
                } else {
                  $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, $z1LanguageMgr.LanguageMgr.getInstance().T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTips02));
                }
                return false;
              }
              break;
            case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Diamond:
              if (c > this.udata.getDiamondNum()) {
                if (e) {
                  $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIAddCurrency, $z1Config.UIID.UITips, $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Diamond);
                } else {
                  $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, $z1LanguageMgr.LanguageMgr.getInstance().T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTips03));
                }
                return false;
              }
              break;
            case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.stamina:
              if (c > this.udata.getPowerNum()) {
                if (e) {
                  $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIAddStrength, $z1Config.UIID.UITips);
                } else {
                  $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UINONE, $z1LanguageMgr.LanguageMgr.getInstance().T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTips04));
                }
                return false;
              }
          }
      }
    }
    return true;
  };
  _ctor.prototype.SubGood = function (t) {
    for (var e = 0; e < t.length; e++) {
      var n = t[e].id;
      var i = t[e].num;
      switch ($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(n).type) {
        case $z1KinghtFallEnum.KinghtFallEnumGoodType.Type01:
          switch (n) {
            case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin:
              this.udata.subGoldNum(i);
              break;
            case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Diamond:
              this.udata.subDiamondNum(i);
              break;
            case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.stamina:
              this.udata.subPowerNum(i);
          }
      }
    }
  };
  _ctor.prototype.addRewards = function (t, e, n) {
    undefined === e && (e = 1);
    var a = [];
    for (var o = 0; o < t.length; o++) {
      var r = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(t[o].id);
      var l = t[o].num * e;
      switch (r.type) {
        case $z1KinghtFallEnum.KinghtFallEnumGoodType.Type01:
          switch (r.enumValue) {
            case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin:
              this.udata.addGoldNum(l);
              this.missionData.addAchNum($z1KinghtFallEnum.KinghtFallEnumAchiEnum.GetGold, l);
              n && $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.AniGold, n);
              break;
            case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Diamond:
              this.udata.addDiamondNum(l);
              this.missionData.addAchNum($z1KinghtFallEnum.KinghtFallEnumAchiEnum.GetDiamonds, l);
              n && $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.AniDiamond, n);
              break;
            case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.stamina:
              this.udata.addPowerNum(l);
              break;
            case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.PassPoints:
              this.missionData.addAchPoint(l);
          }
          a.push(t[o]);
      }
    }
    $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 31);
    return a;
  };
  _ctor.prototype.hasGetLevelReward = function (t) {
    var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getLevelCfgById(t);
    if (!e) {
      return false;
    }
    var n = this.udata.getStageInfo(e.Level);
    for (var i = 0; i < e.Challenge.length; i++) {
      if ((n & 1 << e.Challenge[i] - 1) > 0 && !this.udata.getStageReward(e.Level, i + 1)) {
        return true;
      }
    }
    return false;
  };
  return _ctor;
}();
exports.KinghtFallPlayerMgr = exp_KinghtFallPlayerMgr;