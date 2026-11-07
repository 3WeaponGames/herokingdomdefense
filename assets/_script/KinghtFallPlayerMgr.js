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
var $z1CacheUtils = require("CacheUtils");
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
    this.gameData.deferSettlementRecovery = true;
    this.gameData.getData();
    this.restorePendingRewards();
    this.gameData.deferSettlementRecovery = false;
    if (!this.pendingRewardJournal && !this.rewardStorageCheckPending) this.gameData.initData();
    var self = this;
    if (!this.rewardRetryTimer) this.rewardRetryTimer = setInterval(function () {
      self.retryRewardRecovery();
      if (!self.pendingRewardJournal && !self.rewardStorageCheckPending && self.gameData && self.gameData.data.pendingSettlement) self.gameData.completeSettlement(self.gameData.data.pendingSettlement);
    }, 1000);
    this.reloadConfig();
    t && t();
  };
  _ctor.prototype.reloadConfig = function () {};
  _ctor.prototype.rewardRecords = function () {
    return [this.udata, this.missionData, this.dailyData, this.guideData, this.gameData].filter(function (record) { return !!record && !!record.data; });
  };
  _ctor.prototype.rewardJournalKey = function () { return this.udata.gameKey + ".rewardJournal"; };
  _ctor.prototype.rewardSaveFailure = function () {
    this.rewardStorageCheckPending = true;
    $z1EventMgr.EventMgr.getInstance().emit("SaveFailed", { key: this.rewardJournalKey() });
  };
  _ctor.prototype.retryRewardRecovery = function () {
    if (this.pendingRewardJournal) return this.restorePendingRewards();
    if (this.udata && this.udata.data.wallDefensePending) return !!this.settleWallDefense(this.udata.data.wallDefensePending);
    if (!this.rewardStorageCheckPending) return true;
    // If journaling failed before any award, the claim remains available. Probe
    // only an empty journal so recovery can clear the notice without erasing it.
    var key = this.rewardJournalKey();
    try {
      if ($z1CacheUtils.CacheUtils.getData(key)) return this.restorePendingRewards();
      if ($z1CacheUtils.CacheUtils.saveData(key, "") === false) { this.rewardSaveFailure(); return false; }
    } catch (error) { this.rewardSaveFailure(); return false; }
    this.rewardStorageCheckPending = false;
    $z1EventMgr.EventMgr.getInstance().emit("SaveRecovered", { key: key });
    return true;
  };
  _ctor.prototype.restorePendingRewards = function () {
    if (this.claimingRewardTransaction) return false;
    var key = this.rewardJournalKey();
    if (!this.pendingRewardJournal) {
      try {
        var raw = $z1CacheUtils.CacheUtils.getData(key);
        if (!raw) return true;
        var journal = JSON.parse(raw);
        var records = this.rewardRecords();
        if (journal.version !== 1 || typeof journal.id !== "string" || !Array.isArray(journal.records) || !journal.records.length || !journal.records.every(function (entry) {
          var record = records.filter(function (record) { return record.gameKey === entry.key; })[0];
          if (!record || !entry.data || Array.isArray(entry.data) || entry.data.rewardTransaction !== journal.id) return false;
          var checked = record.validateSaveRecord(JSON.parse(JSON.stringify(entry.data)));
          return JSON.stringify(checked) === JSON.stringify(entry.data);
        })) throw new Error("Invalid reward recovery journal");
        this.pendingRewardJournal = journal;
      } catch (error) {
        if (raw && !this.rewardJournalInvalid) {
          this.rewardJournalInvalid = true;
          this.udata.preserveSaveRecord(raw, key, "journal");
        }
        console.error("Cannot recover reward transaction", error);
        this.rewardSaveFailure();
        return false;
      }
    }
    var pending = this.pendingRewardJournal;
    var targets = this.rewardRecords();
    // Install all journal receipts together in memory before any write. Ordinary
    // gameplay saves during a disk failure then retain the receipt and new state.
    for (var i = 0; i < pending.records.length; i++) {
      var entry = pending.records[i];
      var record = targets.filter(function (target) { return target.gameKey === entry.key; })[0];
      if (record.saveBlockedByRecovery) { this.rewardSaveFailure(); return false; }
      if (record.data.rewardTransaction !== pending.id) record.data = JSON.parse(JSON.stringify(entry.data));
    }
    if (this.dailyData) this.dailyData.ensureCurrentDay();
    if (this.missionData) this.missionData.initData();
    for (var j = 0; j < pending.records.length; j++) {
      var targetKey = pending.records[j].key;
      record = targets.filter(function (target) { return target.gameKey === targetKey; })[0];
      // A matching in-memory receipt can still have a failed write pending.
      if (record.saveData() === false) { this.rewardSaveFailure(); return false; }
    }
    if ($z1CacheUtils.CacheUtils.saveData(key, "") === false) { this.rewardSaveFailure(); return false; }
    this.pendingRewardJournal = null;
    this.rewardStorageCheckPending = false;
    $z1EventMgr.EventMgr.getInstance().emit("SaveRecovered", { key: key });
    $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 31);
    $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RefreshGold);
    $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RefreshDiamond);
    $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RefreshPower);
    return true;
  };
  // Reward balances, achievement counters, and their one-time claim flags are
  // staged together. No target save runs until the complete journal is durable.
  _ctor.prototype.claimRewards = function (rewards, multiplier, position, markClaim, eligible) {
    if (this.claimingRewardTransaction || !this.restorePendingRewards()) return null;
    if (this.dailyData) this.dailyData.ensureCurrentDay();
    if (!eligible()) return null;
    var records = this.rewardRecords();
    if (records.some(function (record) { return record.pause || record.saveBlockedByRecovery; })) { this.rewardSaveFailure(); return null; }
    var originals = records.map(function (record) { return record.data; });
    var id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    var journal = { version: 1, id: id, records: [] };
    var result;
    this.claimingRewardTransaction = true;
    try {
      records.forEach(function (record) { record.data = JSON.parse(JSON.stringify(record.data)); record.deferSave = true; });
      result = this.addRewards(rewards, multiplier, position);
      if (markClaim(result) === false) return null;
      records.forEach(function (record, index) {
        // JSON expands sparse claim/equipment arrays to nulls. Store their
        // canonical shape so recovery validates exactly the bytes we journaled.
        record.data = record.validateSaveRecord(JSON.parse(JSON.stringify(record.data)));
        if (JSON.stringify(record.data) !== JSON.stringify(originals[index])) {
          record.data.rewardTransaction = id;
          journal.records.push({ key: record.gameKey, data: record.data });
        }
      });
    } finally {
      records.forEach(function (record, index) { record.data = originals[index]; record.deferSave = false; });
      this.claimingRewardTransaction = false;
    }
    if (!journal.records.length) return null;
    if ($z1CacheUtils.CacheUtils.saveData(this.rewardJournalKey(), JSON.stringify(journal)) === false) { this.rewardSaveFailure(); return null; }
    this.pendingRewardJournal = journal;
    if (!this.restorePendingRewards()) return null;
    if (position) rewards.forEach(function (reward) {
      if (reward.id === $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin) $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.AniGold, position);
      if (reward.id === $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Diamond) $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.AniDiamond, position);
    });
    return result;
  };
  _ctor.prototype.settleWallDefense = function (result) {
    if (!require("GAD_RewardRules").validResult(result) || !this.restorePendingRewards()) return false;
    var data = this.udata.data, receipt = data.wallDefenseReceipt;
    if (receipt && receipt.id === result.id) return receipt;
    if (receipt && receipt.sequence >= result.sequence) return false;
    var pending = data.wallDefensePending;
    if (pending && pending.id !== result.id) {
      if (!this.settleWallDefense(pending)) return false;
      data = this.udata.data;
      receipt = data.wallDefenseReceipt;
      if (receipt && receipt.sequence >= result.sequence) return receipt.id === result.id ? receipt : false;
    }
    // Persist the exact rolled result before crediting anything. A failed save
    // keeps it available to the existing reward recovery timer and next launch.
    data.wallDefensePending = JSON.parse(JSON.stringify(result));
    if (this.udata.saveData() === false) { this.rewardSaveFailure(); return false; }
    var player = this, previouslyOwned = new Set(data.treasureInfo.map(function (row) { return row.id; }));
    var awarded = this.claimRewards(result.rewards, 1, null, function (actual) {
      var staged = player.udata.data;
      staged.wallDefenseBestWave = Math.max(staged.wallDefenseBestWave || 0, result.clearedWaves);
      staged.wallDefenseReceipt = { id: result.id, sequence: result.sequence, result: JSON.parse(JSON.stringify(result)),
        awarded: actual.map(function (reward) { return { id: reward.id, num: reward.num }; }),
        unlockedGoods: result.drops.filter(function (drop) { return !previouslyOwned.has(drop.itemID); }).map(function (drop) { return drop.goodID; }) };
      delete staged.wallDefensePending;
    }, function () {
      var current = player.udata.data.wallDefenseReceipt;
      return player.udata.data.wallDefensePending && player.udata.data.wallDefensePending.id === result.id && (!current || current.sequence < result.sequence);
    });
    return awarded === null ? false : this.udata.data.wallDefenseReceipt;
  };
  // Run all changes on staged records. A successful journal contains the debit,
  // award, counters and checkpoint together before any target record is saved.
  _ctor.prototype.transact = function (mutate, eligible) {
    var result;
    var committed = this.claimRewards([], 1, null, function () {
      result = mutate();
      return result === false ? false : undefined;
    }, eligible || function () { return true; });
    return committed ? result === undefined ? true : result : null;
  };
  _ctor.prototype.purchase = function (costs, mutate, eligible) {
    var self = this, totals = {};
    var currencies = [$z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin, $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Diamond, $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.stamina];
    if (!Array.isArray(costs) || !costs.every(function (cost) {
      if (!cost || currencies.indexOf(cost.id) < 0 || typeof cost.num !== "number" || !isFinite(cost.num) || cost.num < 0) return false;
      totals[cost.id] = (totals[cost.id] || 0) + cost.num;
      return isFinite(totals[cost.id]);
    })) return null;
    var combined = Object.keys(totals).map(function (id) { return { id: Number(id), num: totals[id] }; });
    return this.transact(function () { self.SubGood(combined); return mutate ? mutate() : true; }, function () {
      return (!eligible || eligible()) && combined.every(function (cost) {
        var balance = cost.id === currencies[0] ? self.udata.getGoldNum() : cost.id === currencies[1] ? self.udata.getDiamondNum() : self.udata.getPowerNum();
        return balance >= cost.num;
      });
    });
  };
  _ctor.prototype.drawTreasures = function (box, count, costs, video) {
    var self = this, config = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
    if (!box || !Number.isInteger(count) || count < 1) return null;
    return this.purchase(costs || [], function () {
      var shop = self.udata.getShopInfo(box.ID) || { id: box.ID, time: 0, video: 0 };
      if (video) {
        shop.video++;
        if (shop.video < box.VedioCount) { self.udata.setShopInfo(shop); return { pending: true, rewards: [] }; }
        shop.video -= box.VedioCount;
      }
      var task = self.missionData.getTaskInfo();
      if (task.type === $z1KinghtFallEnum.KinghtFallEnumTaskEnum.TreasureCount) {
        task.num += count;
        self.missionData.setTaskInfo(task);
      }
      var rewards = [];
      for (var index = 0; index < count; index++) {
        shop.time++;
        var guarantee = shop.time >= box.GuarantNumber;
        if (guarantee) shop.time -= box.GuarantNumber;
        var banner = config.getBannerCfg(guarantee ? box.GuarantBanner : box.Banner);
        var selected = require("Utils").Utils.weight_rand(banner.map(function (row) { return { id: row.RewardID, weight: row.Weight }; }));
        if (!selected) return false;
        if (config.getTreasureCfgById(selected.id).Quality <= 2) shop.time = 0;
        Array.prototype.push.apply(rewards, self.addTreasureReward(selected.id, 1));
        var relic = self.udata.getTreasureLevel($z1KinghtFallEnum.KinghtFallEnumTreasureEnum.SignOfMultiplication);
        var effect = relic && config.getTreasureCfgById(relic.id).levelInfo[relic.level - 1];
        if (effect && effect.param && Math.random() <= effect.param[0]) Array.prototype.push.apply(rewards, self.addTreasureReward(selected.id, 1));
      }
      self.udata.setShopInfo(shop);
      return { pending: false, rewards: rewards };
    });
  };
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
  // The first relic copy unlocks it; duplicates become fragments until every
  // remaining upgrade is funded, then use the relic's configured conversion.
  _ctor.prototype.addTreasureReward = function (t, e, overflowReward) {
    undefined === e && (e = 1);
    var n = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfgById(t);
    var i = [];
    if (!n || !isFinite(e) || e <= 0) return i;
    for (var a = 0; a < Math.floor(e); a++) {
      var o = this.udata.getTreasureLevel(t);
      if (!o) {
        this.udata.setTreasureLevel({ id: t, level: 1, frame: 0 });
        i.push({ item: { id: n.goodID, num: 1 }, isNew: true });
        continue;
      }
      var r = 0;
      // The final level has no next upgrade and therefore no PieceCost.
      for (var s = Math.max(1, o.level); s < n.levelInfo.length; s++) {
        r += n.levelInfo[s - 1].PieceCost;
      }
      if (o.frame >= r) {
        var l = { id: n.Conversion[0], num: n.Conversion[1] };
        if (overflowReward) overflowReward(l);
        else this.addRewards([l]);
        i.push({ item: l, isNew: false });
      } else {
        o.frame++;
        this.udata.setTreasureLevel(o);
        i.push({ item: { id: n.goodID, num: 1 }, isNew: false });
      }
    }
    return i;
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
              !this.claimingRewardTransaction && n && $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.AniGold, n);
              break;
            case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Diamond:
              this.udata.addDiamondNum(l);
              this.missionData.addAchNum($z1KinghtFallEnum.KinghtFallEnumAchiEnum.GetDiamonds, l);
              !this.claimingRewardTransaction && n && $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.AniDiamond, n);
              break;
            case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.stamina:
              this.udata.addPowerNum(l);
              break;
            case $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.PassPoints:
              this.missionData.addAchPoint(l);
          }
          a.push(t[o]);
          break;
        case $z1KinghtFallEnum.KinghtFallEnumGoodType.Type02:
          var treasures = this.addTreasureReward(r.itemID, l);
          for (var j = 0; j < treasures.length; j++) a.push(treasures[j].item);
          break;
      }
    }
    if (!this.claimingRewardTransaction) $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 31);
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
