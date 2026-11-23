Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallDataMgr = undefined;
var $z1ResourceMgr = require("ResourceMgr");
var exp_KinghtFallDataMgr = function () {
  function _ctor() {}
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new _ctor());
    return this.instance;
  };
  _ctor.prototype.preload = function (done) {
    var manager = this;
    $z1ResourceMgr.ResourceMgr.getInstance().loadRes("KinghtFallConfig", "GameJsonCfg", cc.JsonAsset, function (asset) {
      manager.data = asset.json;
      asset.decRef();
      if (done) done();
    });
  };
  _ctor.prototype.getParamsCfgById = function (t) {
    return this.data.ParameterCfg[t].Value;
  };
  _ctor.prototype.getGoodsCfgById = function (t) {
    return this.data.GoodsCfg[t];
  };
  _ctor.prototype.getGuideCfgById = function (t) {
    var e = [];
    var rows = this.data && this.data.GuideCfg || [];
    for (var n = 0; n < rows.length; n++) {
      var i = rows[n];
      i.GuideGroup == t && e.push(i);
    }
    return e.sort(function (left, right) { return left.GuideStep - right.GuideStep; });
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
    var rows = this.data && this.data.TalentLevelCfg || [], id = Number(t);
    for (var index = 0; index < rows.length; index++) if (rows[index] && Number(rows[index].ID) === id) return rows[index];
    return undefined;
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
  _ctor.prototype.getSoldierCfgById = function (t, side) {
    if (side === "ally" && this.data.AllyCfg && this.data.AllyCfg[t]) return this.data.AllyCfg[t];
    var units = this.data.SoldierCfg;
    var unit = (side!=="ally"&&Number(t)>=1000000000&&require("EnemyStageProfiles").current(this.data,t)) || units[t];
    if (unit || side === "ally") return unit;
    var profiles = this.data.GameTools && this.data.GameTools.unitProfiles;
    return units[profiles && profiles.aliases && profiles.aliases[t]];
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
      if (n.join == t && this.getCodeStatus(n) === "active") {
        return n;
      }
    }
    return null;
  };
  _ctor.prototype.getCodeStatus = function (code) {
    // Parse the configured local calendar format explicitly; Safari does not
    // consistently accept the hyphenated, non-ISO date strings in GiftCfg.
    function stamp(value) {
      if (!value) return null;
      var parts = /^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
      if (!parts) return NaN;
      var date = new Date(+parts[1], +parts[2] - 1, +parts[3], +parts[4], +parts[5], +parts[6]);
      if (date.getFullYear() !== +parts[1] || date.getMonth() !== +parts[2] - 1 || date.getDate() !== +parts[3] || date.getHours() !== +parts[4] || date.getMinutes() !== +parts[5] || date.getSeconds() !== +parts[6]) return NaN;
      return date.getTime();
    }
    var begin = stamp(code.begin_time), end = stamp(code.end_time), now = Date.now();
    if (Number.isNaN(begin) || Number.isNaN(end) || begin !== null && end !== null && end <= begin) return "invalid";
    if (begin !== null && now < begin) return "future";
    if (end !== null && now >= end) return "expired";
    return "active";
  };
  _ctor.prototype.hasActiveGiftCode = function () {
    var self = this;
    return this.data.GiftCfg.some(function (code) { return self.getCodeStatus(code) === "active"; });
  };
  return _ctor;
}();
exports.KinghtFallDataMgr = exp_KinghtFallDataMgr;
