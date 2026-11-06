var i;
var cc__extends = __extends;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallUserData = undefined;
var $z1BaseData = require("BaseData");
var $z1EventMgr = require("EventMgr");
var $z1Config = require("Config");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var g = function () {
  this.goldNum = 0;
  this.diamondNum = 0;
  this.powerNum = 0;
  this.powerUpdateTime = 0;
  this.curStage = 1;
  this.maxStage = 1;
  this.maxOrder = 0;
  this.stageInfo = [];
  this.rewardInfo = [];
  this.functionUnlockInfo = [];
  this.followMode = 1;
  this.talentInfo = [];
  this.treasureInfo = [];
  this.shopInfo = [];
  this.personLevel = [];
  this.version = 1;
};
var exp_KinghtFallUserData = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.aliseMap = {
      goldNum: "1",
      diamondNum: "2",
      powerNum: "3",
      powerUpdateTime: "4",
      curStage: "5",
      maxStage: "6",
      maxOrder: "7",
      stageInfo: "8",
      rewardInfo: "9",
      functionUnlockInfo: "a",
      talentInfo: "b",
      treasureInfo: "c",
      shopInfo: "d",
      personLevel: "e",
      id: "f",
      isLock: "g",
      video: "h",
      level: "i",
      frame: "j",
      time: "k"
    };
    e.vesion = 1;
    e.protoId = 1;
    e.ecrypt = false;
    e.gameKey = $z1Config.GameConfig.AppCacheName + $z1KinghtFallConfig.KinghtFallParameter.AppCacheName + "UserData";
    e.isNewUser = false;
    e.maxPower = 100;
    e.powerRecoveryTime = 3e5;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.createData = function () {
    this.data = new g();
    return this.data;
  };
  _ctor.prototype.initData = function () {
    var t = false;
    this.maxPower = parseInt($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.StaminaLimit));
    this.powerRecoveryTime = 1e3 * parseInt($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.StaminaRecover));
    if (!this.data.powerUpdateTime) {
      this.data.powerUpdateTime = Date.now();
      this.data.powerNum = this.maxPower;
      t = true;
    }
    if (!this.data.followMode) {
      this.data.followMode = $z1KinghtFallConfig.KinghtFallParameter.FollowMode;
      t = true;
    }
    $z1KinghtFallConfig.KinghtFallParameter.FollowMode = this.data.followMode;
    t && this.saveData();
  };
  _ctor.prototype.validateSaveRecord = function (data) {
    data = this.normalizeSaveRecord(data, new g());
    var config = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
    var equipment = config.getEquipCfgList();
    ["stageInfo", "rewardInfo", "functionUnlockInfo", "personLevel"].forEach(function (key) {
      data[key] = data[key].map(function (value) { return typeof value === "number" && isFinite(value) && value >= 0 ? Math.floor(value) : 0; });
    });
    data.personLevel = data.personLevel.slice(0, equipment.length).map(function (value, index) { return Math.max(1, Math.min(equipment[index].levelInfo.length, value)); });
    ["talentInfo", "treasureInfo", "shopInfo"].forEach(function (key) {
      data[key] = data[key].filter(function (row) { return row && typeof row === "object" && Number.isInteger(row.id) && row.id > 0; }).map(function (row) {
        ["level", "frame", "video", "time"].forEach(function (field) {
          if (row[field] !== undefined && (typeof row[field] !== "number" || !isFinite(row[field]) || row[field] < 0)) row[field] = 0;
        });
        if (key !== "shopInfo") { row.level = Math.max(1, row.level || 1); row.frame = row.frame || 0; }
        if (key === "treasureInfo") {
          var treasure = config.getTreasureCfgById(row.id);
          if (treasure) row.level = Math.min(treasure.levelInfo.length, Math.floor(row.level));
        }
        return row;
      });
    });
    data.curStage = Math.max(1, Math.floor(data.curStage));
    data.maxStage = Math.max(data.curStage, Math.floor(data.maxStage));
    return data;
  };
  _ctor.prototype.getGoldNum = function () {
    return this.data.goldNum;
  };
  _ctor.prototype.applyBattleSettlement = function (settlement) {
    var receipt = this.data.battleSettlement;
    var previous = receipt && receipt.id === settlement.id ? receipt.multiplier : 0;
    // A late ad callback must never credit a battle older than the current receipt.
    if (settlement.multiplier > 1 && !previous) return false;
    if (previous >= settlement.multiplier) return this.saveData() !== false;
    var extra = settlement.multiplier - previous;
    var gold = 0;
    var diamond = 0;
    var power = 0;
    settlement.rewards.forEach(function (reward) {
      switch (reward.id) {
        case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin: gold += reward.num * extra; break;
        case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Diamond: diamond += reward.num * extra; break;
        case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.stamina: power += reward.num * extra; break;
      }
    });
    this.data.goldNum += gold;
    this.data.diamondNum += diamond;
    this.data.powerNum += power;
    if (!previous && settlement.isWin) {
      this.data.stageInfo[settlement.stage - 1] |= settlement.challengeMask;
      if (settlement.stage === this.data.maxStage) {
        this.data.curStage = settlement.stage + 1;
        this.data.maxStage = settlement.stage + 1;
        this.data.maxOrder = 0;
      }
    }
    this.data.battleSettlement = { id: settlement.id, multiplier: settlement.multiplier };
    var saved = this.saveData() !== false;
    if (gold) $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RefreshGold, gold, true);
    if (diamond) $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RefreshDiamond, diamond, true);
    if (power) $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RefreshPower);
    return saved;
  };
  _ctor.prototype.addGoldNum = function (t, e) {
    this.data.goldNum += t;
    this.saveData();
    if (!this.deferSave) $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RefreshGold, t, true, e);
  };
  _ctor.prototype.subGoldNum = function (t) {
    return !(this.data.goldNum < t || (this.data.goldNum -= t, $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RefreshGold, t, false), this.saveData(), 0));
  };
  _ctor.prototype.getDiamondNum = function () {
    return this.data.diamondNum;
  };
  _ctor.prototype.setDiamondNum = function (t) {
    this.data.diamondNum = t;
    this.saveData();
    $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RefreshDiamond);
  };
  _ctor.prototype.addDiamondNum = function (t, e) {
    this.data.diamondNum += t;
    this.saveData();
    if (!this.deferSave) $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RefreshDiamond, t, true, e);
  };
  _ctor.prototype.subDiamondNum = function (t) {
    return !(this.data.diamondNum < t || (this.data.diamondNum -= t, $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RefreshDiamond, t, false), this.saveData(), 0));
  };
  _ctor.prototype.getPowerNum = function () {
    return this.data.powerNum;
  };
  _ctor.prototype.addPowerNum = function (t, e) {
    undefined === e && (e = 0);
    this.data.powerNum += t;
    this.data.powerNum > this.maxPower && e > 0 && (this.data.powerNum = this.maxPower);
    this.data.powerUpdateTime += e;
    this.saveData();
    if (!this.deferSave) $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RefreshPower);
  };
  _ctor.prototype.subPowerNum = function (t) {
    return !(this.data.powerNum < t || (this.data.powerNum >= this.maxPower && (this.data.powerUpdateTime = Date.now()), this.data.powerNum -= t, $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RefreshPower), this.saveData(), 0));
  };
  _ctor.prototype.getPowerUpdateTime = function () {
    return this.data.powerUpdateTime;
  };
  _ctor.prototype.getStage = function () {
    return this.data.curStage;
  };
  _ctor.prototype.getMaxStage = function () {
    return this.data.maxStage;
  };
  _ctor.prototype.setMaxStage = function (t) {
    this.data.maxStage = t;
    this.saveData();
  };
  _ctor.prototype.getMaxOrder = function () {
    return this.data.maxOrder;
  };
  _ctor.prototype.setStage = function (t) {
    this.data.curStage = t;
    this.saveData();
  };
  _ctor.prototype.passOrder = function (t, e) {
    t < this.data.maxStage || e > this.data.maxOrder && (this.data.maxOrder = e, this.saveData());
  };
  _ctor.prototype.passStage = function (t, e) {
    this.data.stageInfo[t - 1] |= e;
    if (t == this.data.maxStage) {
      this.data.curStage = t + 1;
      this.data.maxStage = t + 1;
      this.data.maxOrder = 0;
    }
    this.saveData();
  };
  _ctor.prototype.getStageInfo = function (t) {
    if (this.data.stageInfo && this.data.stageInfo[t - 1]) {
      return this.data.stageInfo[t - 1];
    } else {
      return 0;
    }
  };
  _ctor.prototype.getStageReward = function (t, e) {
    return !(!this.data.rewardInfo || !this.data.rewardInfo[t - 1]) && (this.data.rewardInfo[t - 1] & 1 << e - 1) > 0;
  };
  _ctor.prototype.setStageReward = function (t, e) {
    this.data.rewardInfo || (this.data.rewardInfo = []);
    this.data.rewardInfo[t - 1] || (this.data.rewardInfo[t - 1] = 0);
    this.data.rewardInfo[t - 1] |= 1 << e - 1;
    this.saveData();
  };
  _ctor.prototype.getFunctionUnlockInfo = function (t) {
    return !(!this.data.functionUnlockInfo || !this.data.functionUnlockInfo[t]) && this.data.functionUnlockInfo[t];
  };
  _ctor.prototype.setFunctionUnlockInfo = function (t) {
    this.data.functionUnlockInfo || (this.data.functionUnlockInfo = []);
    this.data.functionUnlockInfo[t] = 1;
    this.saveData();
  };
  _ctor.prototype.getTalentLevel = function (t) {
    for (var e = 0; e < this.data.talentInfo.length; e++) {
      var n = this.data.talentInfo[e];
      if (n.id == t) {
        return n;
      }
    }
    return null;
  };
  _ctor.prototype.setTalentLevel = function (t) {
    for (var e = 0; e < this.data.talentInfo.length; e++) {
      if (this.data.talentInfo[e].id == t.id) {
        this.data.talentInfo[e] = t;
        return void this.saveData();
      }
    }
    this.data.talentInfo.push(t);
    this.data.talentInfo.sort(function (t, e) {
      return t.id - e.id;
    });
    this.saveData();
  };
  _ctor.prototype.getTalent = function () {
    return this.data.talentInfo;
  };
  _ctor.prototype.getTreasureLevel = function (t) {
    for (var e = 0; e < this.data.treasureInfo.length; e++) {
      var n = this.data.treasureInfo[e];
      if (n.id == t) {
        return n;
      }
    }
    return null;
  };
  _ctor.prototype.setTreasureLevel = function (t) {
    for (var e = 0; e < this.data.treasureInfo.length; e++) {
      if (this.data.treasureInfo[e].id == t.id) {
        this.data.treasureInfo[e] = t;
        return void this.saveData();
      }
    }
    this.data.treasureInfo.push(t);
    this.data.treasureInfo.sort(function (t, e) {
      return t.id - e.id;
    });
    this.saveData();
  };
  _ctor.prototype.getPersonLevel = function (t) {
    if (this.data.personLevel[t - 1]) {
      return this.data.personLevel[t - 1];
    } else {
      return 1;
    }
  };
  _ctor.prototype.setPersonLevel = function (t, e) {
    this.data.personLevel[t - 1] = e;
    this.saveData();
  };
  _ctor.prototype.getShopInfo = function (t) {
    for (var e = 0; e < this.data.shopInfo.length; e++) {
      var n = this.data.shopInfo[e];
      if (n.id == t) {
        return n;
      }
    }
    return null;
  };
  _ctor.prototype.setShopInfo = function (t) {
    for (var e = 0; e < this.data.shopInfo.length; e++) {
      if (this.data.shopInfo[e].id == t.id) {
        this.data.shopInfo[e] = t;
        return void this.saveData();
      }
    }
    this.data.shopInfo.push(t);
    this.saveData();
  };
  _ctor.prototype.setFollowMode = function () {
    this.data.followMode = $z1KinghtFallConfig.KinghtFallParameter.FollowMode;
    this.saveData();
  };
  return _ctor;
}($z1BaseData.BaseData);
exports.KinghtFallUserData = exp_KinghtFallUserData;
