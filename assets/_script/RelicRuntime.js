"use strict";

// Shared runtime-only state for the additional relics. Authoring panels do not
// load this module or create player records. Missing ownership has no effect.
function current() {
  try { var ui = require("KinghtFallUIGame").default.instance; return ui && ui.ctrGame && ui.ctrGame.gameData || null; }
  catch (_) { return null; }
}
function values(data, id) { var row = data && data.treasureAdd && data.treasureAdd[id]; return Array.isArray(row) ? row : []; }
function value(data, id, index) { var result = values(data, id)[index || 0]; return typeof result === "number" && isFinite(result) && result > 0 ? result : 0; }
function active(data) { for (var id = 120028; id <= 120050; id++) if (value(data, id)) return true; return false; }
function copy(input) { return input === undefined ? undefined : JSON.parse(JSON.stringify(input)); }
function state(data) {
  if (!data) return {};
  if (!data.relicState || typeof data.relicState !== "object" || Array.isArray(data.relicState)) data.relicState = {};
  return data.relicState;
}
function restore(data, saved) {
  delete data.relicState;
  delete data._relicSavePending;
  delete data._relicSaveRetryTime;
  delete data._relicRoundCommitPending;
  delete data._relicRoundCoinPending;
  data._relicCombatTime = 0;
  data._relicGeneration = (data._relicGeneration || 0) + 1;
  if (saved && typeof saved === "object" && !Array.isArray(saved)) data.relicState = copy(saved);
}
function snapshot(data) { return data && data.relicState ? copy(data.relicState) : undefined; }
function commit(data) {
  if (!data || !data.ctrPar || !data.ctrPar.saveGame) return true;
  if (data.ctrPar.saveGame() === false) {
    // The effect is already applied in memory. Retain its receipt and retry
    // the same snapshot instead of applying the reward or charge again.
    data._relicSavePending = true;
    data._relicSaveRetryTime = 0;
    return false;
  }
  delete data._relicSavePending;
  delete data._relicSaveRetryTime;
  return true;
}
function retry(data, dt) {
  if (!data || !data._relicSavePending || !(dt > 0) || !isFinite(dt)) return false;
  data._relicSaveRetryTime = (data._relicSaveRetryTime || 0) + dt;
  if (data._relicSaveRetryTime + 1e-9 < 1) return false;
  return commit(data);
}
function living(actor) {
  return !!actor && !actor._isPooled && !(actor.isDead && actor.isDead()) && typeof actor.hp === "number" && actor.hp > 0 && typeof actor.hpMax === "number" && actor.hpMax > 0;
}
function heal(actor, fraction) {
  if (!living(actor) || !(fraction > 0)) return 0;
  var before = actor.hp; actor.hp = Math.min(actor.hpMax, actor.hp + actor.hpMax * fraction);
  var hp = actor.ctrHp || actor.hpctrl;
  if (hp && hp.setHp) hp.setHp(actor.hp, actor.hpMax);
  if (actor.upHpView) actor.upHpView();
  return actor.hp - before;
}
function boss(enemy) {
  var cfg = enemy && enemy.cfg || {};
  return cfg.IsBoss === true || cfg.IsBoss === 1 || cfg.Boss === true || cfg.Boss === 1 || cfg.Role === "boss" || cfg.role === "boss" || [90010, 90011, 90012].indexOf(Number(cfg.ID)) >= 0 || [90010, 90011, 90012].indexOf(Number(cfg.CampaignBaseUnit)) >= 0;
}
function clearControl(enemy) { if (enemy) delete enemy._relicControl; }
function applyControl(enemy, seconds, bossSlow) {
  if (!enemy || enemy._isPooled || enemy.isDead && enemy.isDead() || !(seconds > 0)) return false;
  var generation = enemy.node && enemy.node._combatGeneration;
  var control = enemy._relicControl;
  if (!control || control.generation !== generation) control = enemy._relicControl = { generation: generation, freeze: 0, slow: 0, duration: 0 };
  if (boss(enemy)) {
    control.slow = Math.max(control.slow, Math.min(.9, Math.max(0, bossSlow === undefined ? .5 : bossSlow)));
    control.duration = Math.max(control.duration, seconds);
  } else {
    control.freeze = Math.max(control.freeze, seconds);
    // Cancel a queued authored hit before the next scheduler tick. The authored
    // default and custom attack timings remain untouched.
    try { require("GameToolsOverrides").cancel(enemy); } catch (_) {}
  }
  return true;
}
function controlDelta(enemy, dt) {
  var control = enemy && enemy._relicControl;
  var result = { dt: dt, frozen: false, moveScale: 1, attackScale: 1 };
  if (!control || control.generation !== (enemy.node && enemy.node._combatGeneration) || !(dt > 0)) return result;
  if (control.freeze > 0) {
    var frozen = Math.min(dt, control.freeze); control.freeze = Math.max(0, control.freeze - dt);
    result.dt = Math.max(0, dt - frozen); result.frozen = result.dt <= 1e-9;
  } else if (control.duration > 0 && control.slow > 0) {
    var slowedTime = Math.min(dt, control.duration); control.duration = Math.max(0, control.duration - dt);
    result.dt = dt - slowedTime * control.slow; result.attackScale = 1 - control.slow;
  }
  return result;
}
function slowed(enemy, data) {
  if (value(data, 120002)) return true;
  var control = enemy && enemy._relicControl;
  if (control && (control.freeze > 0 || control.duration > 0 && control.slow > 0)) return true;
  return !!(enemy && (enemy.debuffInfo || []).some(function (buff) { return buff && (buff.subNum > 0 || buff.data && buff.data.subNum > 0) && (buff.type === "MoveSpeed" || buff.type === 3); }));
}
module.exports = { current: current, values: values, value: value, active: active, state: state, restore: restore, snapshot: snapshot,
  commit: commit, retry: retry, living: living, heal: heal, boss: boss, applyControl: applyControl, clearControl: clearControl, controlDelta: controlDelta, slowed: slowed };
