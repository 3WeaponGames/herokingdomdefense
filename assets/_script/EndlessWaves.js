"use strict";

var stars = require("./StageStarsCore");
var rewards = require("./GAD_RewardRules");

exports.unlocked = function (stage, user) {
  if (!stage || !stage.WaveCfg || !stage.WaveCfg.length) return false;
  var mask = user.getStageInfo(stage.Level);
  return stars.count(stage, mask, stars.cleared(stage, mask, user.getMaxStage())) === 3;
};

exports.bestWave = function (profile, stage) {
  var wave = profile.endlessBestWaves && profile.endlessBestWaves["stage" + stage];
  return Number.isSafeInteger(wave) && wave > 0 ? wave : 0;
};

exports.recordBestWave = function (profile, stage, wave) {
  if (wave <= exports.bestWave(profile, stage)) return;
  // The profile codec reserves bare numeric keys for field aliases.
  if (!profile.endlessBestWaves) profile.endlessBestWaves = {};
  profile.endlessBestWaves["stage" + stage] = wave;
};

exports.waveAt = function (stage, round) {
  var waves = stage.WaveCfg;
  if (!Number.isSafeInteger(round) || round < 1 || !waves.length) return undefined;
  if (round <= waves.length) return waves[round - 1];

  // Keep the finale's actor count and spawn cadence for every extra wave.
  var extra = round - waves.length;
  var finale = waves[waves.length - 1];
  return Object.assign({}, finale, {
    Wave: round,
    HealthCoefficient: finale.HealthCoefficient * (1 + .15 * extra),
    AttackCoefficient: finale.AttackCoefficient * (1 + .08 * extra)
  });
};

function Run(stage, admissionId, previousSequence, config) {
  this.endlessStage = stage;
  this.admissionId = admissionId;
  this.sequence = previousSequence + 1;
  // A persisted admission ID can be longer than the receipt ID allows.
  this.id = "endless-" + Date.now().toString(36) + "-" + this.sequence + "-" + Math.random().toString(36).slice(2);
  this.config = config;
  this.activeMilliseconds = 0;
  this._clockRemainder = 0;
  this.clearedWaves = 0;
}
Run.prototype.tick = function (seconds) {
  // The engine's real frame delta arrives before the gameplay speed multiplier.
  // Ignore suspended-frame gaps, as in the original survival mode.
  if (this.result || !(seconds > 0 && seconds <= 1)) return;
  // Carry rounding error across frames so frame rate cannot change a payout.
  var elapsed = seconds * 1000 - this._clockRemainder;
  var total = this.activeMilliseconds + elapsed;
  this._clockRemainder = (total - this.activeMilliseconds) - elapsed;
  this.activeMilliseconds = total;
};
Run.prototype.clear = function (wave) {
  if (!this.result && wave === this.clearedWaves + 1) this.clearedWaves = wave;
};
Run.prototype.finish = function (reason, player, treasures) {
  if (this.result) return;
  this.endReason = reason;
  var nearest = Math.round(this.activeMilliseconds);
  if (Math.abs(this.activeMilliseconds - nearest) <= nearest * Number.EPSILON) this.activeMilliseconds = nearest;
  this.result = rewards.createResult(this, this.config, treasures, player.getUserData().data.treasureInfo);
  player.settleEndlessRun(this.result);
};
Run.prototype.getResult = function (player) {
  if (!this.result) return null;
  var receipt = player.getUserData().data.wallDefenseReceipt;
  var paid = receipt && receipt.id === this.result.id;
  return Object.assign({}, this.result, {
    saved: !!paid && !player.pendingRewardJournal && !player.rewardStorageCheckPending,
    awarded: paid ? receipt.awarded : this.result.rewards,
    unlockedGoods: paid ? receipt.unlockedGoods : []
  });
};
exports.Run = Run;
