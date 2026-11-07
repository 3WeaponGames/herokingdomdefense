Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1GAD_UserData = require("GAD_UserData");
var $z1GAD_Configs = require("GAD_Configs");
var $z1GAD_DataMgr = require("GAD_DataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var rewards = require("GAD_RewardRules");
var def_GAD_PlayerMgr = function () {
  function _ctor() {
    this._groupID = 0;
    this._tagID = 0;
    this._state = 0;
    this._cards = [];
    this._run = null;
    this._result = null;
    this._suspended = false;
    this._suspendOwners = new Set();
  }
  _ctor.getInstance = function () {
    this._instance || (this._instance = new _ctor());
    return this._instance;
  };
  _ctor.prototype.reset = function () {
    this._state = 0;
    this._cards = [];
    this._run = this._result = null;
  };
  _ctor.prototype.addCard = function (t) {
    this._cards.push(t);
  };
  _ctor.prototype.getCardByRandom = function () {
    return this._cards[Math.floor(Math.random() * this._cards.length)];
  };
  _ctor.prototype.removeCard = function (t) {
    var e = this._cards.indexOf(t);
    -1 != e && this._cards.splice(e, 1);
  };
  _ctor.prototype.getState = function () {
    return this._state;
  };
  _ctor.prototype.setState = function (t) {
    if (this._run && this._run.finalized && t === $z1GAD_Configs.emGADGameState.Game) return;
    this.tickRun();
    this._state = t;
    if (this._run) this._run.clockAt = t === $z1GAD_Configs.emGADGameState.Game && !this._suspended ? this.clockNow() : null;
  };
  _ctor.prototype.clockNow = function () {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  };
  _ctor.prototype.tickRun = function () {
    var run = this._run;
    if (!run || run.finalized) return;
    var now = this.clockNow(), active = this._state === $z1GAD_Configs.emGADGameState.Game && !this._suspended;
    if (active && run.clockAt !== null) {
      var elapsed = now - run.clockAt;
      // Resume/frozen-loop gaps are not active battle time. Ordinary slow
      // frames still count their real duration, independently of movement dt.
      if (elapsed >= 0 && elapsed <= 1000) run.activeMilliseconds += elapsed;
    }
    run.clockAt = active ? now : null;
  };
  _ctor.prototype.setRunSuspended = function (suspended, owner) {
    this.tickRun();
    owner = owner || "app";
    if (suspended) this._suspendOwners.add(owner); else this._suspendOwners.delete(owner);
    this._suspended = this._suspendOwners.size > 0;
    if (this._run) this._run.clockAt = !this._suspended && this._state === $z1GAD_Configs.emGADGameState.Game ? this.clockNow() : null;
  };
  _ctor.prototype.readyForRun = function () {
    var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
    if (!player.restorePendingRewards()) return false;
    var pending = player.getUserData().data.wallDefensePending;
    return !pending || !!player.settleWallDefense(pending);
  };
  _ctor.prototype.beginRun = function (admissionId) {
    var receipt = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().data.wallDefenseReceipt;
    var sequence = (receipt ? receipt.sequence : 0) + 1;
    this._run = { id: "wall-" + Date.now().toString(36) + "-" + sequence + "-" + Math.random().toString(36).slice(2),
      sequence: sequence, activeMilliseconds: 0, clearedWaves: 0, groups: new Map(), clockAt: null, finalized: false };
    this._result = null;
    if (admissionId) this._run.admissionId = admissionId;
    return this._run;
  };
  _ctor.prototype.registerWave = function (index, count) {
    if (this._run && !this._run.finalized) this._run.groups.set(index, count);
  };
  _ctor.prototype.resolveWaveRole = function (role) {
    var run = this._run, index = role._rewardWave;
    if (!run || run.finalized || role._rewardResolved || !run.groups.has(index)) return;
    role._rewardResolved = true;
    run.groups.set(index, Math.max(0, run.groups.get(index) - 1));
    // Waves overlap on screen. An early kill in a later wave cannot skip an
    // unresolved earlier wave or award its milestone twice.
    while (run.groups.get(run.clearedWaves + 1) === 0) {
      run.groups.delete(++run.clearedWaves);
    }
  };
  _ctor.prototype.finishRun = function (reason) {
    var run = this._run;
    if (!run) return null;
    if (!run.finalized) {
      this.tickRun();
      this._state = $z1GAD_Configs.emGADGameState.Over;
      run.finalized = true;
      run.clockAt = null;
      run.endReason = reason;
      var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
      this._result = rewards.createResult(run, $z1GAD_DataMgr.default.getInstance().data.wallDefenseRewards,
        $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfg(), player.getUserData().data.treasureInfo);
      if (run.admissionId) this._result.admissionId = run.admissionId;
    }
    $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().settleWallDefense(this._result);
    return this.getResult();
  };
  _ctor.prototype.getResult = function () {
    if (!this._result) return null;
    var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance(), receipt = player.getUserData().data.wallDefenseReceipt;
    return Object.assign({}, this._result, {
      saved: !!receipt && receipt.id === this._result.id && !player.pendingRewardJournal && !player.rewardStorageCheckPending,
      awarded: receipt && receipt.id === this._result.id ? receipt.awarded : this._result.rewards,
      unlockedGoods: receipt && receipt.id === this._result.id ? receipt.unlockedGoods : []
    });
  };
  _ctor.prototype.getTagID = function () {
    return ++this._tagID;
  };
  _ctor.prototype.getGroupID = function () {
    return ++this._groupID;
  };
  _ctor.prototype.preload = function (t) {
    if (!this._lifecycleBound) {
      this._lifecycleBound = true;
      cc.game.on(cc.game.EVENT_HIDE, function () { this.setRunSuspended(true); }, this);
      cc.game.on(cc.game.EVENT_SHOW, function () { this.setRunSuspended(false); }, this);
      cc.game.on("runtime-recovery-pause", function (paused) { this.setRunSuspended(paused, "resources"); }, this);
    }
    this._userData = new $z1GAD_UserData.default();
    this._userData.getData();
    t && t();
  };
  _ctor.prototype.getLevel = function () {
    var t = this._userData.getLevel();
    return (t - 1) % 3 + 1;
  };
  _ctor.prototype.addLevel = function () {
    this._userData.addLevel();
  };
  _ctor.prototype.getMapIndex = function () {
    return this.getLevel();
  };
  return _ctor;
}();
exports.default = def_GAD_PlayerMgr;
