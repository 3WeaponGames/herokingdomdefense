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
  this.wallDefenseBestWave = 0;
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
    data.wallDefenseBestWave = Math.floor(data.wallDefenseBestWave);
    var admission = data.wallDefenseAdmission;
    if (admission && (typeof admission.id !== "string" || !admission.id || admission.id.length > 160 || typeof admission.cost !== "number" || !isFinite(admission.cost) || admission.cost <= 0 || typeof admission.used !== "boolean")) delete data.wallDefenseAdmission;
    var rules = require("GAD_RewardRules");
    if (data.wallDefensePending && !rules.validResult(data.wallDefensePending)) delete data.wallDefensePending;
    var receipt = data.wallDefenseReceipt;
    if (receipt && (!rules.validResult(receipt.result) || receipt.id !== receipt.result.id || receipt.sequence !== receipt.result.sequence ||
        !Array.isArray(receipt.awarded) || !receipt.awarded.every(function (row) { return row && Number.isInteger(row.id) && Number.isInteger(row.num) && row.num >= 0; }) ||
        !Array.isArray(receipt.unlockedGoods) || !receipt.unlockedGoods.every(Number.isInteger))) delete data.wallDefenseReceipt;
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
    var totals = previous && receipt.rewardTotals ? Object.assign({}, receipt.rewardTotals) : {};
    var goods = $z1KinghtFallEnum.KinghtFallEnumGoodsCfg;
    function currency(reward, amount, apply) {
      if ([goods.Coin, goods.Diamond, goods.stamina, goods.PassPoints].indexOf(reward.id) < 0) return false;
      totals[reward.id] = (totals[reward.id] || 0) + amount;
      if (apply) {
        if (reward.id === goods.Coin) gold += amount;
        else if (reward.id === goods.Diamond) diamond += amount;
        else if (reward.id === goods.stamina) power += amount;
      }
      return true;
    }
    // Older receipts only awarded the four currency types and have no totals.
    if (previous && !receipt.rewardTotals) settlement.rewards.forEach(function (reward) { currency(reward, reward.num * previous, false); });
    var deferred = this.deferSave;
    this.deferSave = true;
    try {
      settlement.rewards.forEach(function (reward) {
        var amount = reward.num * extra;
        if (currency(reward, amount, true)) return;
        var config = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(reward.id);
        if (config && config.type === $z1KinghtFallEnum.KinghtFallEnumGoodType.Type02) {
          require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance().addTreasureReward(config.itemID, amount, function (converted) { currency(converted, converted.num, true); });
        }
      });
    } finally { this.deferSave = deferred; }
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
    this.data.battleSettlement = { id: settlement.id, multiplier: settlement.multiplier, rewardTotals: totals };
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
    if (typeof t !== "number" || !isFinite(t) || t < 0 || this.data.goldNum < t) return false;
    this.data.goldNum -= t;
    if (this.saveData() === false) { this.data.goldNum += t; return false; }
    if (!this.deferSave) $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RefreshGold, t, false);
    return true;
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
    if (typeof t !== "number" || !isFinite(t) || t < 0 || this.data.diamondNum < t) return false;
    this.data.diamondNum -= t;
    if (this.saveData() === false) { this.data.diamondNum += t; return false; }
    if (!this.deferSave) $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RefreshDiamond, t, false);
    return true;
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
    if (typeof t !== "number" || !isFinite(t) || t < 0 || this.data.powerNum < t) return false;
    var previousTime = this.data.powerUpdateTime;
    if (this.data.powerNum >= this.maxPower) this.data.powerUpdateTime = Date.now();
    this.data.powerNum -= t;
    if (this.saveData() === false) { this.data.powerNum += t; this.data.powerUpdateTime = previousTime; return false; }
    if (!this.deferSave) $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RefreshPower);
    return true;
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
