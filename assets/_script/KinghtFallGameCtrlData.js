var BattleSounds = require("BattleSounds");
var SilverOfferSchedule = require("SilverOfferSchedule");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallCommerceKeyType = exports.KinghtFallTimeType = undefined;
var i;
var a;
var $z1PlatformSetting = require("PlatformSetting");
var $z1EventMgr = require("EventMgr");
var $z1LogMgr = require("LogMgr");
var $z1SdkMgr = require("SdkMgr");
var $z1Utils = require("Utils");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var $z1KinghtFallBuildBase = require("KinghtFallBuildBase");
var $z1KinghtFallBuildObstacle = require("KinghtFallBuildObstacle");
var $z1KinghtFallCommerce = require("KinghtFallCommerce");
var $z1KinghtFallInterface = require("KinghtFallInterface");
function battleObjective(task) {
  var id = task && task.list && task.list[task.index];
  return typeof id === "string" && Array.isArray(task.targets) ? require("BattleTaskObjectives").definition(id) : null;
}
var def_KinghtFallGameCtrlData = function () {
  function _ctor(t, e, restoring, restartSetup, taskCheckpoint) {
    this.bulidPointMap = {};
    this.obstacles = [];
    this.talentAdd = {};
    this.treasureAdd = {};
    this.treasureAddTime = {};
    this.businessPoints = [];
    this.businessAdd = {};
    this.coin = 0;
    this.round = 0;
    this.canNew = true;
    this.packInterval = .5;
    this.time = {};
    this.enemyList = [];
    this.pendingEnemySpawns = 0;
    this.soldierList = [];
    this.buffList = [];
    this.addTime = {};
    this._restoringCheckpoint = !!restoring;
    this.ctrPar = t;
    this.levelCfg = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getLevelCfgById(e);
    require("EnemyStageProfiles").activate(this.levelCfg);
    this.initData(restoring, restartSetup, taskCheckpoint);
  }
  _ctor.prototype.createTaskInfo = function (checkpoint) {
    var manager = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
    var task = { index: 0, list: [], reward: [], stage: 0 };
    // A resumed run always owns its original order. Checkpoints from before
    // reward snapshots keep the legacy pool's payout for each saved position.
    if (checkpoint) {
      task.index = checkpoint.index;
      task.stage = checkpoint.stage;
      task.list = checkpoint.list.slice();
      if (Array.isArray(checkpoint.reward)) {
        task.reward = checkpoint.reward.map(function (reward) { return reward && { id: reward.id, num: reward.num }; });
        if (checkpoint.authored) task.authored = true;
        if (checkpoint.rewardMultiplier !== undefined) task.rewardMultiplier = checkpoint.rewardMultiplier;
        if (Array.isArray(checkpoint.targets)) {
          task.targets = checkpoint.targets.slice();
          task.progress = checkpoint.progress || 0;
          if (typeof checkpoint.waveIntact === "boolean") task.waveIntact = checkpoint.waveIntact;
          if (Number.isSafeInteger(checkpoint.scoredRound)) task.scoredRound = checkpoint.scoredRound;
        }
        return task;
      }
    } else if (checkpoint === undefined && Array.isArray(this.levelCfg.BattleTasks)) {
      var config = manager.data || {};
      var targets = [], counted = false;
      this.levelCfg.BattleTasks.forEach(function (row) {
        if (!row || !Number.isSafeInteger(row.rewardId) || row.rewardId <= 0 || !Number.isSafeInteger(row.amount) ||
            row.amount < 0 || config.GoodsCfg && !config.GoodsCfg[row.rewardId]) return;
        var objective = typeof row.taskId === "string" && require("BattleTaskObjectives").definition(row.taskId);
        if (objective ? !Number.isSafeInteger(row.count) || row.count < 1 :
            !Number.isSafeInteger(row.taskId) || row.taskId <= 0 || config.InGameTaskEnum && !config.InGameTaskEnum[row.taskId]) return;
        task.list.push(row.taskId);
        task.reward.push({ id: row.rewardId, num: row.amount });
        targets.push(objective ? row.count : 1);
        counted = counted || !!objective;
      });
      if (counted) { task.targets = targets; task.progress = 0; }
      task.authored = true;
      var multiplier = this.levelCfg.InGameCoefficient;
      task.rewardMultiplier = Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : 1;
      return task;
    }
    var legacy = manager.getGameTask(Number(this.levelCfg.Level) === 1 ? 1 : 2);
    if (!checkpoint) task.list = (Number(legacy.MissionType) === 2 ?
      $z1KinghtFallModle.default.getInstance().randomArray(legacy.MissionID, legacy.MissionNumber) : legacy.MissionID).slice();
    task.reward = legacy.Award.slice(0, task.list.length).map(function (reward) { return { id: reward[0], num: reward[1] }; });
    return task;
  };
  _ctor.prototype.hasBattleTaskStructure = function (target) {
    var kinds = $z1KinghtFallEnum.KinghtFallEnumBuildEnum;
    var kind = target === "wall" ? kinds.Wall : target === "tower" ? kinds.ArrowTower : kinds.PrivateHouse;
    return this.getBulidList().some(function (building) {
      return building.buildCfg && building.buildCfg.enumValue === kind && building.getIsLock() && !building.isDestroyed;
    });
  };
  _ctor.prototype.beginBattleTaskWave = function () {
    var task = this.taskInfo, objective = battleObjective(task);
    if (objective && objective.kind === "survive" && task.stage === 0 && task.scoredRound !== this.round) {
      task.waveIntact = this.hasBattleTaskStructure(objective.target);
    }
  };
  _ctor.prototype.advanceBattleTask = function () {
    var task = this.taskInfo, target = task.targets[task.index];
    task.progress = Math.min(target, task.progress + 1);
    if (task.progress === target) {
      task.stage = 1;
      if (this.ctrPar.saveGame) this.ctrPar.saveGame();
    }
    return true;
  };
  _ctor.prototype.recordBattleTask = function (kind, tag) {
    var owner = this.ctrPar, task = this.taskInfo, objective = battleObjective(task);
    if (!owner || owner.gameData !== this || owner._restartRetired || owner.gameStatus !== $z1KinghtFallModle.KinghtFallGameStage.Fight ||
        this._roundCompleted || !objective || task.stage !== 0 || kind !== objective.kind || tag !== objective.target) return false;
    if (kind === "kill") return this.advanceBattleTask();
    if (!task.waveIntact) return false;
    task.waveIntact = false;
    return true;
  };
  _ctor.prototype.finishBattleTaskWave = function () {
    var task = this.taskInfo, objective = battleObjective(task);
    if (!objective || objective.kind !== "survive" || task.stage !== 0 ||
        typeof task.waveIntact !== "boolean" || task.scoredRound === this.round) return false;
    var intact = task.waveIntact && this.hasBattleTaskStructure(objective.target);
    task.scoredRound = this.round;
    delete task.waveIntact;
    if (intact) return this.advanceBattleTask();
    task.progress = 0;
    return false;
  };
  _ctor.prototype.initData = function (restoring, restartSetup, taskCheckpoint) {
    var t;
    this.buildings = [];
    var e = this.levelCfg.HomeLevel1Unlock;
    var n = {
      level: 1,
      bulidPoint: [],
      bulidId: []
    };
    for (var a = 0; a < e.length; a++) {
      var o = e[a];
      n.bulidId.push(o[0]);
      n.bulidPoint.push(o[1]);
    }
    this.buildings.push(n);
    e = this.levelCfg.HomeLevel2Unlock;
    n = {
      level: 2,
      bulidPoint: [],
      bulidId: []
    };
    for (a = 0; a < e.length; a++) {
      o = e[a];
      n.bulidId.push(o[0]);
      n.bulidPoint.push(o[1]);
    }
    this.buildings.push(n);
    e = this.levelCfg.HomeLevel3Unlock;
    n = {
      level: 3,
      bulidPoint: [],
      bulidId: []
    };
    for (a = 0; a < e.length; a++) {
      o = e[a];
      n.bulidId.push(o[0]);
      n.bulidPoint.push(o[1]);
    }
    this.buildings.push(n);
    // Level-four unlocks are optional in existing authored stages.
    e = this.levelCfg.HomeLevel4Unlock || [];
    n = {
      level: 4,
      bulidPoint: [],
      bulidId: []
    };
    for (a = 0; a < e.length; a++) {
      o = e[a];
      n.bulidId.push(o[0]);
      n.bulidPoint.push(o[1]);
    }
    this.buildings.push(n);
    this.taskInfo = this.createTaskInfo(taskCheckpoint);
    var eligibility = require("RelicEligibility");
    var user = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData();
    this.heroStyle = eligibility.selected(user).id;
    this.relicDefinitions = {};
    var y = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfg();
    for (a = 0; a < y.length; a++) {
      o = y[a];
      this.relicDefinitions[o.ID] = o;
      n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTreasureLevel(o.ID);
      if (n && eligibility.eligible(o.ID, this.heroStyle, o)) {
        this.treasureAdd[o.ID] = null === (t = o.levelInfo[n.level - 1]) || undefined === t ? undefined : t.param;
      }
    }
    var savedSetup = restartSetup && typeof restartSetup === "object" && !Array.isArray(restartSetup) &&
      restartSetup.treasureAddTime && typeof restartSetup.treasureAddTime === "object" && !Array.isArray(restartSetup.treasureAddTime) &&
      Object.keys(restartSetup.treasureAddTime).every(function (key) { return /^[1-9]\d*$/.test(key) && Number.isSafeInteger(restartSetup.treasureAddTime[key]) && restartSetup.treasureAddTime[key] > 0; });
    if (savedSetup) {
      // The lottery belongs to the admitted run, including after a process exit
      // between writing a retry checkpoint and loading its replacement map.
      this.treasureAddTime = JSON.parse(JSON.stringify(restartSetup.treasureAddTime));
    } else if (this.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.CovenantOfPatriarchs] && Math.random() < this.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.CovenantOfPatriarchs][0]) {
      var h = [];
      for (var v = 0; v < this.buildings[0].bulidId.length; v++) {
        this.buildings[0].bulidId[v] == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.PrivateHouse && h.push(this.buildings[0].bulidPoint[v]);
      }
      this.treasureAddTime[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.CovenantOfPatriarchs] = h[$z1Utils.Utils.randomRang(0, h.length)];
      $z1LogMgr.LogMgr.getInstance().info("***先祖的契约", h, this.treasureAddTime[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.CovenantOfPatriarchs]);
    }
    this.round = 0;
    this.coin = $z1KinghtFallConfig.KinghtFallParameter.InitGold;
    this.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.SilverCoinBag] && (this.coin += this.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.SilverCoinBag][0]);
    this.time = {};
    this.time[i.MonsterGenerate] = 0;
    this.packInterval = Number($z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getParamsCfgById($z1KinghtFallEnum.KinghtFallEnumParameterCfg.RefreshInterval));
    var _ = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTalent();
    for (a = 0; a < _.length; a++) {
      if ((o = _[a]) && o.isLock) {
        var I = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTalentLevelCfgById(o.id);
        if (!I) continue;
        this.talentAdd[I.kindID] || (this.talentAdd[I.kindID] = []);
        this.talentAdd[I.kindID].push(I.EffectNumber);
      }
    }
    this.loadMonster(restoring);
  };
  _ctor.prototype.setRound = function () {
    var round = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().getRoundNum(this.levelCfg.Level);
    var t = Number.isInteger(round) && round > 0 && this.levelCfg.WaveCfg[round - 1];
    if (!t) throw new Error("This saved wave is no longer available. Start a new game for this stage.");
    this._roundCompleted = false;
    this._advisorFinalClaimPending = false;
    this.round = round;
    this.videoCoin = t.CommerceSliver;
    this.enemyQueue = {};
    this.authoredTimeline = Array.isArray(t.SpawnTimeline) ? new (require('AuthoredSpawnPlan').Timeline)(t.SpawnTimeline) : null;
    // Timed schedules replace the legacy queue completely. Do not parse stale
    // or absent compatibility strings before constructing the effective queue.
    if (!this.authoredTimeline) for (var e = 0; e < t.RefreshSoldierKind.length; e++) {
      var n = t.RefreshSoldierKind[e];
      if (n) {
        var i = n.split("#");
        var a = parseInt(i[0]);
        this.enemyQueue[a] = [];
        var o = i[1].split(";");
        for (var r = 0; r < o.length; r++) {
          var s = o[r].split(",");
          this.enemyQueue[a].push({
            id: parseInt(s[0]),
            num: parseInt(s[1])
          });
        }
      }
    }
    this.coin = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGameData().getCoin(this.levelCfg.Level);
    if (this.authoredTimeline) this.enemyQueue = this.authoredTimeline.queue();
  };
  _ctor.prototype.loadMonster = function (restoring) {
    this._roundCompleted = false;
    this._advisorFinalClaimPending = false;
    this.round++;
    var t = this.levelCfg.WaveCfg[this.round - 1];
    if (!restoring) this.coin += t.StartSliver;
    if (!restoring && t.StartSliver > 0 && BattleSounds.effect) BattleSounds.effect("battle-silver-reward", null, { game: this.ctrPar });
    this.videoCoin = t.CommerceSliver;
    if (!restoring) $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addAchNum($z1KinghtFallEnum.KinghtFallEnumAchiEnum.GetSliver, t.StartSliver);
    this.authoredTimeline = Array.isArray(t.SpawnTimeline) ? new (require('AuthoredSpawnPlan').Timeline)(t.SpawnTimeline) : null;
    this.enemyQueue = {};
    if (!this.authoredTimeline) for (var e = 0; e < t.RefreshSoldierKind.length; e++) {
      var n = t.RefreshSoldierKind[e];
      if (n) {
        var i = n.split("#");
        var a = parseInt(i[0]);
        this.enemyQueue[a] = [];
        var o = i[1].split(";");
        for (var r = 0; r < o.length; r++) {
          var s = o[r].split(",");
          this.enemyQueue[a].push({
            id: parseInt(s[0]),
            num: parseInt(s[1])
          });
        }
      }
    }
    if (this.authoredTimeline) this.enemyQueue = this.authoredTimeline.queue();
  };
  _ctor.prototype.onRestart = function (t) {
    delete this._millIncomeSnapshot;
    delete this._relicArmyBanner;
    var restoring = !t && this._restoringCheckpoint;
    this._restoringCheckpoint = false;
    this.pendingEnemySpawns = 0;
    if (t) { this.addTime = {}; require("RelicRuntime").restore(this, null); }
    var e = this.getBulidList();
    for (var n = 0; n < e.length; n++) {
      e[n].reset(t);
    }
    if (t) {
      this.round = 0;
      this.coin = $z1KinghtFallConfig.KinghtFallParameter.InitGold;
      this.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.SilverCoinBag] && (this.coin += this.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.SilverCoinBag][0]);
      for (var a = 0; a < this.soldierList.length; a++) {
        this.soldierList[a].node.destroy();
      }
      this.soldierList = [];
      this.businessAdd = {};
    } else {
      var o = this.levelCfg.WaveCfg[this.round - 1];
      if (!restoring) {
        this.coin -= o.StartSliver;
        $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addAchNum($z1KinghtFallEnum.KinghtFallEnumAchiEnum.GetSliver, -o.StartSliver);
      }
      this.round--;
    }
    this.time[i.MonsterGenerate] = 0;
    this.loadMonster(restoring);
    this.upMap();
    for (a = 0; a < this.enemyList.length; a++) {
      this.enemyList[a].node.destroy();
    }
    this.enemyList = [];
    this.canNew = true;
    this.initCom();
  };
  _ctor.prototype.initCom = function () {
    if (this.canNew) {
      if (this.appearBusinessPoints) {
        this.appearBusinessPoints.node.active = false;
      }
      this.canNew = false;
      var offer = this.businessPoints[0];
      var schedule = offer && SilverOfferSchedule.settings(SilverOfferSchedule.read(offer));
      this.appearBusinessPoints = schedule && this.businessAdd[a.SilverClaimedWave] !== this.round &&
        SilverOfferSchedule.appears(schedule, this.round) ? offer : null;
    }
    if ($z1SdkMgr.SdkMgr.getInstance().getCheckVersion($z1PlatformSetting.SwitchID.ShenHe)) {
      this.appearBusinessPoints && (this.appearBusinessPoints.node.active = false);
      if (this.weaponBusinessPoints) this.weaponBusinessPoints.node.active = false;
      if (this.horseBusinessPoints) this.horseBusinessPoints.node.active = false;
    } else {
      if (this.appearBusinessPoints) {
        this.appearBusinessPoints.init(1);
        this.appearBusinessPoints.node.active = true;
      }
      if (this.weaponBusinessPoints) switch (this.businessAdd[a.FlagWeapon]) {
        default:
          this.weaponBusinessPoints.node.active = true;
          this.weaponBusinessPoints.init(1);
          break;
        case 1:
          if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopSecondOpen()) {
            this.weaponBusinessPoints.node.active = true;
            this.weaponBusinessPoints.init(2);
          } else {
            this.weaponBusinessPoints.node.active = false;
          }
          break;
        case 2:
          this.weaponBusinessPoints.node.active = false;
      }
      if (this.horseBusinessPoints) switch (this.businessAdd[a.FlagHorse]) {
        default:
          this.horseBusinessPoints.node.active = true;
          this.horseBusinessPoints.init(1);
          break;
        case 1:
          if ($z1KinghtFallModle.KinghtFallSwitch.isMapShopSecondOpen()) {
            this.horseBusinessPoints.node.active = true;
            this.horseBusinessPoints.init(2);
          } else {
            this.horseBusinessPoints.node.active = false;
          }
          break;
        case 2:
          this.horseBusinessPoints.node.active = false;
      }
    }
  };
  _ctor.prototype.captureMillIncome = function () {
    if (this._millIncomeSnapshot && this._millIncomeSnapshot.round === this.round) return;
    var income = {};
    for (var point in this.bulidPointMap) {
      if (!Object.prototype.hasOwnProperty.call(this.bulidPointMap, point)) continue;
      var building = this.bulidPointMap[point];
      if (building.buildInfo && building.buildInfo.cfg && building.buildInfo.cfg.MillDefense) income[point] = building.getGetCoin();
    }
    this._millIncomeSnapshot = {round:this.round, income:income};
  };
  _ctor.prototype.settleFinalMillIncome = function () {
    this.captureMillIncome();
    var snapshot = this._millIncomeSnapshot;
    if (snapshot.paid) return 0;
    snapshot.paid = true;
    var silver = Object.keys(snapshot.income).reduce(function (sum, point) { return sum + snapshot.income[point]; }, 0);
    if (silver > 0) {
      this.coin += silver;
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addAchNum($z1KinghtFallEnum.KinghtFallEnumAchiEnum.GetSliver, silver);
    }
    return silver;
  };
  _ctor.prototype.endRoundGame = function () {
    this.captureMillIncome();
    var millIncome = this._millIncomeSnapshot.income;
    delete this._millIncomeSnapshot;
    this.loadMonster();
    var t = [this.baseBuild];
    var e = 0;
    for (var n in this.bulidPointMap) {
      if (Object.prototype.hasOwnProperty.call(this.bulidPointMap, n)) {
        var i = this.bulidPointMap[n];
        switch (i.buildCfg.enumValue) {
          case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.Mill:
            var fieldMill = i.buildInfo && i.buildInfo.cfg && i.buildInfo.cfg.MillDefense;
            var millReward = fieldMill ? (millIncome[n] || 0) : i.getIsWork() ? i.getGetCoin() : 0;
            if (millReward > 0) {
              e += millReward;
              t.push(i);
              if (!fieldMill && this.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.MillOfAbundance] && Math.random() < this.treasureAdd[$z1KinghtFallEnum.KinghtFallEnumTreasureEnum.MillOfAbundance][0]) {
                e++, $z1LogMgr.LogMgr.getInstance().info("***丰饶之磨");
              }
            }
            break;
          case $z1KinghtFallEnum.KinghtFallEnumBuildEnum.PrivateHouse:
            if (i.getIsWork()) {
              e += i.getGetCoin();
              t.push(i);
            }
        }
        i.endRoundGame();
      }
    }
    if (e > 0) {
      this.coin += e;
      if (BattleSounds.effect) BattleSounds.effect("battle-silver-reward", null, { game: this.ctrPar });
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addAchNum($z1KinghtFallEnum.KinghtFallEnumAchiEnum.GetSliver, e);
    }
    this.soldierList.forEach(function (t) {
      t.delAllBuff();
    });
    delete this._relicArmyBanner;
    this.canNew = true;
    this.initCom();
    return t;
  };
  _ctor.prototype.getHpAdd = function (t) {
    var e = this.levelCfg.WaveCfg[this.round - 1].HealthCoefficient;
    var cfg = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById(t);
    if (1 == (cfg.UnitAttack ? require("UnitAttackRules").attackType(cfg) : cfg.AttackType)) {
      var n = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff25);
      n && (e -= n.Pamer[0]);
      var i = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff38);
      i && (e -= i.Pamer[0]);
    }
    return e;
  };
  _ctor.prototype.getAttAdd = function () {
    return this.levelCfg.WaveCfg[this.round - 1].AttackCoefficient;
  };
  _ctor.prototype.initMap = function () {
    for (var t = 0; t < this.ctrPar.ndMain.children.length; t++) {
      var e = this.ctrPar.ndMain.children[t];
      e.zIndex = Math.floor(cc.winSize.height) - Math.floor(e.y);
      var n = e.getComponent($z1KinghtFallBuildBase.default);
      if (n) {
        var i = $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None;
        for (var a = 0; a < this.buildings.length; a++) {
          var o = this.buildings[a];
          if (o.bulidPoint.includes(n.ID)) {
            i = o.bulidId[o.bulidPoint.indexOf(n.ID)];
            break;
          }
        }
        n.initData(i) && (this.bulidPointMap[n.ID] = n);
      } else {
        var r = e.getComponent($z1KinghtFallBuildObstacle.default);
        if (r) {
          this.obstacles.push(r);
        } else {
          var s = e.getComponent($z1KinghtFallCommerce.default);
          if (s) {
            switch (s.ndType) {
              case $z1KinghtFallCommerce.KinghtFallCommerceType.Silver:
                if (!this.businessPoints.length) this.businessPoints.push(s);
                break;
              case $z1KinghtFallCommerce.KinghtFallCommerceType.Weapon:
                this.weaponBusinessPoints = require('AuthoredSpawnPlan').offers(this.weaponBusinessPoints, s);
                break;
              case $z1KinghtFallCommerce.KinghtFallCommerceType.Horse:
                this.horseBusinessPoints = require('AuthoredSpawnPlan').offers(this.horseBusinessPoints, s);
            }
            s.node.active = false;
          }
        }
      }
    }
    this.baseBuild = this.bulidPointMap[1];
  };
  _ctor.prototype.upMap = function () {
    for (var t in this.bulidPointMap) {
      Object.prototype.hasOwnProperty.call(this.bulidPointMap, t) && this.bulidPointMap[t].upData();
    }
  };
  _ctor.prototype.setLight = function (t) {
    for (var e in this.bulidPointMap) {
      Object.prototype.hasOwnProperty.call(this.bulidPointMap, e) && this.bulidPointMap[e].setLight(t);
    }
  };
  _ctor.prototype.canLock = function (t) {
    if (1 == t) {
      return true;
    }
    for (var e = this.baseBuild.getLevel(); e > 0; e--) {
      if (this.buildings[e - 1].bulidPoint.includes(t)) {
        return true;
      }
    }
    return false;
  };
  var stockBuildingList = _ctor.prototype.getBulidList = function () {
    var t = [];
    for (var e in this.bulidPointMap) {
      if (Object.prototype.hasOwnProperty.call(this.bulidPointMap, e)) {
        var n = this.bulidPointMap[e];
        t.push(n);
      }
    }
    return t;
  };
  _ctor.prototype.getAttackableBuildList = function () {
    var list = this.getBulidList, buildings = list.call(this);
    // The stock lookup already returns a private snapshot. A custom provider
    // can return shared storage and continues to receive the original copy.
    var targets = list === stockBuildingList ? buildings : buildings.slice();
    buildings.forEach(function (building) {
      if (building.getFieldTargets) targets = targets.concat(building.getFieldTargets());
    });
    return targets;
  };
  _ctor.prototype.getBaseLevel = function () {
    return this.baseBuild.getLevel();
  };
  _ctor.prototype.isBlocked = function (t) {
    for (var e = 0; e < this.obstacles.length; e++) {
      var n = (o = this.obstacles[e]).getWposPhyCol();
      for (var i = 0; i < n.length; i++) {
        var a = n[i];
        if (cc.Intersection.rectPolygon(t, a)) {
          return true;
        }
      }
    }
    n = this.baseBuild.getWposPhyCol();
    for (i = 0; i < n.length; i++) {
      a = n[i];
      if (cc.Intersection.rectPolygon(t, a)) {
        return true;
      }
    }
    for (e = this.baseBuild.getLevel(); e > 0; e--) {
      var o = this.buildings[e - 1];
      for (var r = 0; r < o.bulidPoint.length; r++) {
        n = this.bulidPointMap[o.bulidPoint[r]].getWposPhyCol();
        for (i = 0; i < n.length; i++) {
          a = n[i];
          if (cc.Intersection.rectPolygon(t, a)) {
            return true;
          }
        }
      }
    }
    return false;
  };
  _ctor.prototype.onUpdata = function (t) {
    var data = this, owner = this.ctrPar, epoch = owner && owner._combatEpoch, stage = owner && owner.gameStatus, ui = $z1KinghtFallUIGame.default.instance;
    function current() { return !owner || cc.isValid(owner, true) && owner.gameData === data && owner._combatEpoch === epoch && owner.gameStatus === stage &&
      (!ui || $z1KinghtFallUIGame.default.instance === ui && !ui.isclose && ui.ctrGame === owner); }
    if (!current()) return;
    var advancedQueue = false;
    if (this.authoredTimeline) {
      var self = this;
      this.authoredTimeline.advance(t, function (unit, spawn, route) { if (current()) { advancedQueue = true; self.ctrPar.addEnemy(unit, spawn, route); } });
      if (!current()) return;
      if (advancedQueue) this.enemyQueue = this.authoredTimeline.queue();
    } else {
    this.time[i.MonsterGenerate] += t;
    if (this.time[i.MonsterGenerate] > this.packInterval) {
      this.time[i.MonsterGenerate] = 0;
      for (var e in this.enemyQueue) {
        if (Object.prototype.hasOwnProperty.call(this.enemyQueue, e)) {
          var n = this.enemyQueue[e];
          if (n && n.length > 0) {
            var a = n[0];
            advancedQueue = true;
            this.ctrPar.addEnemy(a.id, parseInt(e));
            if (!current()) return;
            a.num--;
            a.num <= 0 && n.shift();
          }
        }
      }
    }
    }
    var roster = this.enemyList, o = 0;
    var combat = roster.length && require("RelicCombat");
    for (var remaining = roster.length; remaining > 0 && o < roster.length; remaining--) {
      var enemy = roster[o];
      if (enemy) combat.updateEnemy(enemy, t);
      if (!current() || this.enemyList !== roster) return;
      if (roster[o] === enemy) o++;
    }
    require("RelicBattle").updateArmyBanner(this, t);
    // Delay groups do not create an enemy whose death can finish the wave.
    // Recheck after draining them, retaining the pending-spawn/once-only guard.
    if (advancedQueue && this.enemyList.length === 0) this.tryEndGame();
  };
  _ctor.prototype.getEnemyList = function () {
    return this.enemyList;
  };
  _ctor.prototype.addEnemy = function (t) {
    this.enemyList.push(t);
  };
  _ctor.prototype.delEnemy = function (t, transformed) {
    var removed = false;
    for (var e = 0; e < this.enemyList.length; e++) {
      if (this.enemyList[e].uuid == t.uuid) {
        this.enemyList.splice(e, 1);
        removed = true;
        break;
      }
    }
    if (!removed) return false;
    if (transformed === true) return true;
    var n = this.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff03);
    if (n) {
      this.addTime[i.KillSoldier1]++;
      if (this.addTime[i.KillSoldier1] >= n.Pamer[0]) {
        this.addTime[i.KillSoldier1] = 0, this.addTime[i.KillSoldier2] += n.Pamer[1], this.addTime[i.KillSoldier2] > 10 && (this.addTime[i.KillSoldier2] = 10);
      }
    }
    this.tryEndGame();
  };
  _ctor.prototype.getSoldierList = function () {
    return this.soldierList;
  };
  _ctor.prototype.addSoldier = function (t) {
    this.soldierList.push(t);
  };
  _ctor.prototype.delSoldier = function (t, preserveNode) {
    for (var e = 0; e < this.soldierList.length; e++) {
      var n = this.soldierList[e];
      if (n.uuid == t.uuid) {
        if (preserveNode !== true) n.node.destroy();
        this.soldierList.splice(e, 1);
        break;
      }
    }
  };
  _ctor.prototype.tryEndGame = function () {
    var data=this,owner=this.ctrPar,ownerNode=owner&&owner.node,ownedData=owner&&owner.gameData,epoch=owner&&owner._combatEpoch;
    var ui=typeof $z1KinghtFallUIGame!=="undefined"?$z1KinghtFallUIGame.default.instance:null,uiNode=ui&&ui.node,uiGeneration=ui&&ui._resourceGeneration;
    var hero=owner&&owner.ctrPlay,heroNode=hero&&hero.node,heroGeneration=heroNode&&heroNode._combatGeneration;
    var round=this.round,level=this.levelCfg,relicGeneration=this._relicGeneration,valid=typeof cc!=="undefined"&&cc.isValid;
    function current(){return data.ctrPar===owner&&data.round===round&&data.levelCfg===level&&data._relicGeneration===relicGeneration&&
      (!owner||owner.node===ownerNode&&owner.gameData===ownedData&&(ownedData===undefined||ownedData===data)&&owner._combatEpoch===epoch&&owner.ctrPlay===hero&&
        (!valid||valid(owner,true)&&(!ownerNode||valid(ownerNode,true)))&&(!ownerNode||ownerNode.activeInHierarchy!==false))&&
      (!hero||hero.node===heroNode&&(!heroNode||heroNode._combatGeneration===heroGeneration)&&(!valid||valid(hero,true)&&(!heroNode||valid(heroNode,true))))&&
      (!ui||$z1KinghtFallUIGame.default.instance===ui&&!ui.isclose&&ui.node===uiNode&&ui._resourceGeneration===uiGeneration&&(!owner||ui.ctrGame===owner)&&(!uiNode||uiNode.activeInHierarchy!==false)&&(!valid||valid(ui,true)&&(!uiNode||valid(uiNode,true))));}
    if(!current())return;
    var relicCommitReady = false;
    if (this._relicRoundCommitPending) {
      if (this._relicSavePending) return;
      var pendingSilver = this._relicRoundCoinPending || 0;
      delete this._relicRoundCommitPending;
      delete this._relicRoundCoinPending;
      relicCommitReady = true;
      if (pendingSilver > 0) $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addAchNum($z1KinghtFallEnum.KinghtFallEnumAchiEnum.GetSliver, pendingSilver);
      if(!current())return;
    }
    if (this.authoredTimeline && this.authoredTimeline.pending()) return;
    if(!current())return;
    var t = 0;
    for (var e in this.enemyQueue) {
      !this.authoredTimeline && Object.prototype.hasOwnProperty.call(this.enemyQueue, e) && (t += this.enemyQueue[e].length);
    }
    var retryAdvisor = this._advisorFinalClaimPending;
    if ((relicCommitReady || retryAdvisor || !this._roundCompleted) && this.enemyList.length <= 0 && t <= 0 && !(this.pendingEnemySpawns > 0)) {
      this._roundCompleted = true;
      if (this.captureMillIncome) this.captureMillIncome();
      if(!current())return;
      if (!retryAdvisor && require("RelicRuntime").active(this)) {
        var coinBefore = this.coin;
        var rewarded=require("RelicBattle").waveCleared(this, hero, round);
        if(!current())return;
        if (rewarded) {
          var silver = this.coin - coinBefore;
          var committed=require("RelicRuntime").commit(this);
          if(!current())return;
          if (!committed) {
            this._relicRoundCommitPending = true;
            this._relicRoundCoinPending = silver;
            return;
          }
          if (silver > 0) $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addAchNum($z1KinghtFallEnum.KinghtFallEnumAchiEnum.GetSliver, silver);
          if(!current())return;
        } else if (this._relicSavePending) {
          // A failed earlier legendary-charge save must also become durable
          // before this battle advances past its cleared wave.
          this._relicRoundCommitPending = true;
          return;
        }
      }
      this.finishBattleTaskWave();
      if (!current()) return;
      var task = this.taskInfo, readyAdvisor = battleObjective(task) && task.stage === 1;
      if (round === this.levelCfg.WaveCfg.length && (readyAdvisor || retryAdvisor)) {
        // The Advisor closes with combat, so finish this earned claim before
        // settlement retires the paid run's checkpoint.
        var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
        var completed = player.restorePendingRewards();
        if (!current()) return;
        if (completed && readyAdvisor) {
          completed = !!(ui && ui.getTask && ui.getTask(true));
          if (!current()) return;
        }
        if (completed) {
          completed = player.restorePendingRewards();
          if (!current()) return;
        }
        if (!completed) {
          this._advisorFinalClaimPending = true;
          this._advisorFinalClaimRetry = .5;
          return;
        }
        this._advisorFinalClaimPending = false;
        if (!current()) return;
      }
      $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.start_X_Y, this.levelCfg.Level + "_" + this.round);
      if(!current())return;
      $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().passOrder(this.levelCfg.Level, this.round);
      if(!current())return;
      if (this.round < this.levelCfg.WaveCfg.length) {
        $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.RoundEnd);
      } else {
        if (this.settleFinalMillIncome) this.settleFinalMillIncome();
        if(!current())return;
        $z1EventMgr.EventMgr.getInstance().emit($z1KinghtFallConfig.KinghtFallEventName.GameOver, true);
      }
    }
  };
  _ctor.prototype.addGameBuff = function (t, restoring) {
    var e;
    var n = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBuffCfgById(t);
    if (!n) {
      if (restoring) throw new Error("A saved perk is no longer available. Start a new game for this stage.");
      return false;
    }
    this.buffList.push({
      id: t,
      pamer: n.Pamer,
      cfg: n
    });
    // Loading a checkpoint restores ownership, not the original acquisition reward.
    if (restoring && [10, 11, 12, 24, 29].some(function (id) {
      return t == $z1KinghtFallEnum.KinghtFallEnumBuffCfg["Buff" + (id < 10 ? "0" : "") + id];
    })) return;
    switch (t) {
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff01:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff14:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff21:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff22:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff35:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff36:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff37:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff40:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff41:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff42:
        $z1KinghtFallUIGame.default.instance.ctrGame.ctrPlay.initBuffData();
        break;
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff02:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff57:
        this.addTime[i.SoldierMaxHp] = (this.addTime[i.SoldierMaxHp] || 0) + n.Pamer[0];
        this.addTime[i.SoldierDamage] = (this.addTime[i.SoldierDamage] || 0) + n.Pamer[1];
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff07:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff09:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff23:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff26:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff32:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff43:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff47:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff45:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff53:
        for (var a in this.bulidPointMap) {
          Object.prototype.hasOwnProperty.call(this.bulidPointMap, a) && (r = this.bulidPointMap[a]).initBuffData();
        }
        break;
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff10:
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff29:
        $z1KinghtFallUIGame.default.instance.ctrGame.gameData.coin += n.Pamer[0];
        $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData().addAchNum($z1KinghtFallEnum.KinghtFallEnumAchiEnum.GetSliver, n.Pamer[0]);
        $z1KinghtFallUIGame.default.instance.initView();
        break;
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff11:
        var o = [];
        for (var a in this.bulidPointMap) {
          Object.prototype.hasOwnProperty.call(this.bulidPointMap, a) && (r = this.bulidPointMap[a]).buildCfg.enumValue != $z1KinghtFallEnum.KinghtFallEnumBuildEnum.CastleCenter && r.getIsLock() && r.buildInfo.cfg && (null === (e = r.buildInfo.cfg.BranchBuild) || undefined === e ? undefined : e.length) > 0 && r.getLevel() < this.baseBuild.getLevel() && o.push(r);
        }
        o.length > 0 && o[$z1Utils.Utils.randomRang(0, o.length)].onBuffUpgrade();
        break;
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff12:
        o = [];
        for (var a in this.bulidPointMap) {
          Object.prototype.hasOwnProperty.call(this.bulidPointMap, a) && (r = this.bulidPointMap[a]).buildCfg.enumValue == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.ArrowTower && this.canLockBuild(a) && 0 == r.index && o.push(r);
        }
        o.length > 0 && o[$z1Utils.Utils.randomRang(0, o.length)].onBuffUpgrade();
        break;
      case $z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff24:
        for (var a in this.bulidPointMap) {
          var r;
          Object.prototype.hasOwnProperty.call(this.bulidPointMap, a) && (r = this.bulidPointMap[a]).buildCfg.enumValue == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.ArrowTower && this.canLockBuild(a) && r.getLevel() < this.baseBuild.getLevel() && r.onBuffUpgrade();
        }
        $z1KinghtFallUIGame.default.instance.ctrGame.gameData.coin = 0;
        $z1KinghtFallUIGame.default.instance.initView();
    }
  };
  _ctor.prototype.canLockBuild = function (t) {
    var e = this.bulidPointMap[t];
    if (e.buildCfg.enumValue == $z1KinghtFallEnum.KinghtFallEnumBuildEnum.None) {
      return false;
    }
    for (var n = 0; n < this.baseBuild.getLevel(); n++) {
      if (this.buildings[n].bulidPoint.includes(e.ID)) {
        return true;
      }
    }
    return false;
  };
  _ctor.prototype.getGameBuff = function (t) {
    for (var e = 0; e < this.buffList.length; e++) {
      var n = this.buffList[e];
      if (n.id == t) {
        return n.cfg;
      }
    }
    return null;
  };
  _ctor.prototype.startRoundGame = function () {
    this.beginBattleTaskWave();
    this.setLight(true);
    this.addTime[i.KillSoldier1] = 0;
    this.addTime[i.KillSoldier2] = 0;
    this.addTime[i.SoldierDamage2] = 0;
    var t = this.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff17);
    if (t && this.coin >= 10) {
      this.addTime[i.SoldierDamage1] = t.Pamer[0];
    } else {
      this.addTime[i.SoldierDamage1] = 0;
    }
    var e = this.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff19);
    if (e && 0 == this.coin) {
      this.addTime[i.PlayerDamage] = e.Pamer[0];
    } else {
      this.addTime[i.PlayerDamage] = 0;
    }
    var n = this.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff27);
    n && (this.addTime[i.PlayerDamage] += n.Pamer[0]);
    var a = this.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff49);
    a && (this.addTime[i.PlayerDamage] += a.Pamer[0]);
    this.addTime[i.PlayerAttackSpeed] = 0;
    var o = this.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff28);
    o && (this.addTime[i.PlayerAttackSpeed] += o.Pamer[0]);
    var r = this.getGameBuff($z1KinghtFallEnum.KinghtFallEnumBuffCfg.Buff50);
    r && (this.addTime[i.PlayerAttackSpeed] += r.Pamer[0]);
    this.businessPoints.forEach(function (t) {
      t.node.active = false;
    });
    if (this.weaponBusinessPoints) this.weaponBusinessPoints.node.active = false;
    if (this.horseBusinessPoints) this.horseBusinessPoints.node.active = false;
  };
  _ctor.prototype.onChangeSpeed = function () {
    for (var t = 0; t < this.enemyList.length; t++) {
      this.enemyList[t].onChangeSpeed();
    }
    for (t = 0; t < this.soldierList.length; t++) {
      this.soldierList[t].onChangeSpeed();
    }
    for (var e in this.bulidPointMap) {
      Object.prototype.hasOwnProperty.call(this.bulidPointMap, e) && this.bulidPointMap[e].onChangeSpeed();
    }
  };
  return _ctor;
}();
exports.default = def_KinghtFallGameCtrlData;
(function (t) {
  t.MonsterGenerate = "MonsterGenerate";
  t.PlayerDamage = "PlayerDamage";
  t.PlayerAttackSpeed = "PlayerAttackSpeed";
  t.SoldierMaxHp = "SoldierMaxHp";
  t.SoldierDamage = "SoldierDamage";
  t.SoldierDamage1 = "SoldierDamage1";
  t.SoldierDamage2 = "SoldierDamage2";
  t.KillSoldier1 = "KillSoldier1";
  t.KillSoldier2 = "KillSoldier2";
})(i = exports.KinghtFallTimeType || (exports.KinghtFallTimeType = {}));
(function (t) {
  t.FlagWeapon = "CommerceFlagWeapon";
  t.FlagHorse = "CommerceFlagHorse";
  t.Attack = "CommerceAttack";
  t.AttackSpeed = "CommerceAttackSpeed";
  t.Speed = "CommerceSpeed";
  t.Energy1 = "CommerceEnergy1";
  t.Energy2 = "CommerceEnergy2";
  t.SilverClaimedWave = "CommerceSilverClaimedWave";
})(a = exports.KinghtFallCommerceKeyType || (exports.KinghtFallCommerceKeyType = {}));
