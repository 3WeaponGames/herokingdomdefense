Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallDataMgr = undefined;
var $z1BasePlatform = require("BasePlatform");
var $z1PlatformSetting = require("PlatformSetting");
var $z1ResourceMgr = require("ResourceMgr");
var $z1DataMgr = require("DataMgr");
var $z1PlayerMgr = require("PlayerMgr");
var exp_KinghtFallDataMgr = function () {
  function _ctor() {
    this.readRemoteCfg = false;
    this.localCfg = {
      A: "KinghtFallConfig",
      B: "KinghtFallConfigB",
      D: "KinghtFallConfigD"
    };
    this.remoteCfg = {
      A: "zhongwei/KinghtFall/configs",
      B: "zhongwei/KinghtFall/configsB",
      D: "zhongwei/KinghtFall/configsD"
    };
  }
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new _ctor());
    return this.instance;
  };
  _ctor.prototype.preload = function (t) {
    var e = this;
    if (this.readRemoteCfg) {
      alert("注意：当前使用的是本地远程配置文件");
      console.error("注意：当前使用的是本地远程配置文件！！！");
      var n = this.remoteCfg.A;
      $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.WEB_LINK && this.remoteCfg.AWeb && (n = this.remoteCfg.AWeb);
      var l = {
        dir: n,
        fileName: "GameJsonCfg.json"
      };
      $z1DataMgr.DataMgr.getInstance().loadRemoteTestCfg(l, function (n) {
        e.data = n;
        e.reloadConfig($z1PlayerMgr.PlayerMgr.getInstance().getAbType(), t);
      });
    } else {
      n = this.localCfg.A;
      $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.WEB_LINK && this.localCfg.AWeb && (n = this.localCfg.AWeb);
      $z1ResourceMgr.ResourceMgr.getInstance().loadRes(n, "GameJsonCfg", cc.JsonAsset, function (n) {
        e.data = n.json;
        n.decRef();
        e.reloadConfig($z1PlayerMgr.PlayerMgr.getInstance().getAbType(), t);
      });
    }
  };
  _ctor.prototype.reloadConfig = function (t, e) {
    var n = this;
    if ("A" != t && "C" != t) {
      if (this.readRemoteCfg) {
        var s = this.remoteCfg["" + t];
        $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.WEB_LINK && this.remoteCfg[t + "Web"] && (s = this.remoteCfg[t + "Web"]);
        if (s) {
          var l = {
            dir: s,
            fileName: "GameJsonCfg.json"
          };
          $z1DataMgr.DataMgr.getInstance().loadRemoteTestCfg(l, function (t) {
            if (t) {
              for (var i in t) {
                n.data[i] = t[i];
              }
            }
            e && e();
          });
        } else {
          e && e();
        }
      } else {
        s = this.localCfg["" + t];
        $z1PlatformSetting.PlatformSetting.currentPlatform == $z1BasePlatform.Platform.WEB_LINK && this.localCfg[t + "Web"] && (s = this.localCfg[t + "Web"]);
        if (s) {
          $z1ResourceMgr.ResourceMgr.getInstance().loadRes(s, "GameJsonCfg", cc.JsonAsset, function (t) {
            var i = t.json;
            if (i) {
              for (var a in i) {
                n.data[a] = i[a];
              }
            }
            t.decRef();
            e && e();
          });
        } else {
          e && e();
        }
      }
    } else {
      e && e();
    }
  };
  _ctor.prototype.getParamsCfgById = function (t) {
    return this.data.ParameterCfg[t].Value;
  };
  _ctor.prototype.getGoodsCfgById = function (t) {
    return this.data.GoodsCfg[t];
  };
  _ctor.prototype.getGuideCfgById = function (t) {
    var e = [];
    for (var n = 0; n < this.data.GuideCfg.length; n++) {
      var i = this.data.GuideCfg[n];
      i.GuideGroup == t && e.push(i);
    }
    return e;
  };
  _ctor.prototype.getTaskCfgById = function (t) {
    return this.data.TaskCfg[t - 1];
  };
  _ctor.prototype.getAchievementCfg = function () {
    return this.data.AchievementCfg;
  };
  _ctor.prototype.getPassCfg = function () {
    return this.data.BpCfg;
  };
  _ctor.prototype.getOnlineRewardCfg = function () {
    return this.data.onLineRewardCfg;
  };
  _ctor.prototype.getSignCfg = function () {
    return this.data.SignCfg;
  };
  _ctor.prototype.getTalentLevelCfg = function () {
    return this.data.TalentLevelCfg;
  };
  _ctor.prototype.getTalentLevelCfgById = function (t) {
    return this.data.TalentLevelCfg[t - 1];
  };
  _ctor.prototype.getTalentCfg = function (t) {
    return this.data.TalentCfg[t];
  };
  _ctor.prototype.getTreasureCfg = function () {
    return this.data.TreasureCfg;
  };
  _ctor.prototype.getTreasureCfgById = function (t) {
    for (var e = 0; e < this.data.TreasureCfg.length; e++) {
      var n = this.data.TreasureCfg[e];
      if (n.ID == t) {
        return n;
      }
    }
    return null;
  };
  _ctor.prototype.getBoxCfgById = function (t) {
    return this.data.ShopCfg[t];
  };
  _ctor.prototype.getBannerCfg = function (t) {
    var e = [];
    for (var n = 0; n < this.data.BannerCfg.length; n++) {
      var i = this.data.BannerCfg[n];
      i.LibraryID == t && e.push(i);
    }
    return e;
  };
  _ctor.prototype.getEquipCfg = function (t) {
    return this.data.EquipCfg[t];
  };
  _ctor.prototype.getEquipCfgList = function () {
    return this.data.EquipCfg;
  };
  _ctor.prototype.getLevelCfgList = function () {
    return this.data.LevelCfg;
  };
  _ctor.prototype.getLevelCfgById = function (t) {
    return this.data.LevelCfg[t - 1];
  };
  _ctor.prototype.getLevelCfgById2 = function (t) {
    if (t >= this.data.LevelCfg.length) {
      return this.data.LevelCfg[this.data.LevelCfg.length - 1];
    } else {
      return this.data.LevelCfg[t - 1];
    }
  };
  _ctor.prototype.getBuildCfgById = function (t) {
    return this.data.BuildEnum[t];
  };
  _ctor.prototype.getBuffCfgById = function (t) {
    for (var e = 0; e < this.data.BuffCfg.length; e++) {
      var n = this.data.BuffCfg[e];
      if (n.ID == t) {
        return n;
      }
    }
    return null;
  };
  _ctor.prototype.getBuffCfgList = function () {
    return this.data.BuffCfg;
  };
  _ctor.prototype.getGameTask = function (t) {
    return this.data.InGameTaskCfg[t - 1];
  };
  _ctor.prototype.getGameTaskEnem = function (t) {
    return this.data.InGameTaskEnum[t];
  };
  _ctor.prototype.getSoldierCfgById = function (t) {
    return this.data.SoldierCfg[t];
  };
  _ctor.prototype.getCode = function (t) {
    var e = t.toLocaleLowerCase();
    for (var n = 0; n < this.data.GiftCfg.length; n++) {
      var i = this.data.GiftCfg[n];
      if (i.gift_num.toLocaleLowerCase() == e) {
        return i;
      }
    }
    return null;
  };
  _ctor.prototype.getCodeJoin = function (t) {
    for (var e = 0; e < this.data.GiftCfg.length; e++) {
      var n = this.data.GiftCfg[e];
      if (n.join == t) {
        return n;
      }
    }
    return null;
  };
  return _ctor;
}();
exports.KinghtFallDataMgr = exp_KinghtFallDataMgr;