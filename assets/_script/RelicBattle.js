"use strict";

// Battle-only relic effects. All values come from the owned relic snapshot;
// looking at the collection or opening an editor never calls these functions.
var Runtime = require("RelicRuntime");
var TowerCombat = require("TowerCombat");

function ratio(data, id) { return Math.min(.9, Runtime.value(data, id)); }
function castleHpMultiplier(data) { return 1 + ratio(data, 120032); }
function castleIncomingDamage(data, castle, damage) {
  var info = castle && castle.buildInfo;
  if (!(damage > 0) || !info || !(info.hp > 0) || !(info.hpMax > 0) || info.hp / info.hpMax >= .35) return damage;
  return damage * (1 - ratio(data, 120046));
}
function living(actor) {
  return !!actor && !actor.isDestroyed && (!actor.isDead || !actor.isDead()) &&
    (!actor.node || actor.node.activeInHierarchy !== false) && !(typeof actor.hp === "number" && actor.hp <= 0);
}
function afterCastleDamage(data, castle) {
  var info = castle && castle.buildInfo;
  if (!data || !info || castle.isDestroyed || !(info.hp > 0) || !(info.hpMax > 0)) return false;
  var hpRatio = info.hp / info.hpMax, phoenix = ratio(data, 120028), duration = Runtime.value(data, 120050);
  if (!(phoenix > 0 && hpRatio < .25) && !(duration > 0 && hpRatio < .5)) return false;
  var state = Runtime.state(data), triggered = false;
  // Evaluate both thresholds against the hit before Phoenix repairs the castle.
  if (duration > 0 && hpRatio < .5 && !state.hourglassUsed) {
    state.hourglassUsed = true;
    var enemies = typeof data.getEnemyList === "function" ? data.getEnemyList().slice() : (data.enemyList || []).slice();
    enemies.forEach(function (enemy) { if (living(enemy)) Runtime.applyControl(enemy, duration, .5); });
    triggered = true;
  }
  if (phoenix > 0 && hpRatio < .25 && !state.phoenixUsed) {
    state.phoenixUsed = true;
    info.hp = Math.min(info.hpMax, info.hp + info.hpMax * phoenix);
    if (castle.ctrHp) castle.ctrHp.setHp(info.hp, info.hpMax);
    triggered = true;
  }
  if (triggered) Runtime.commit(data);
  return triggered;
}
function replacementInterval(data, interval) {
  var reduction = ratio(data, 120038);
  return reduction > 0 && interval > 0 ? interval * (1 - reduction) : interval;
}
function productionBonus(data, baseAmount) {
  var extra = ratio(data, 120047);
  if (!(extra > 0) || !(baseAmount > 0) || !isFinite(baseAmount)) return 0;
  var state = Runtime.state(data), remainder = state.productionRemainder;
  remainder = typeof remainder === "number" && isFinite(remainder) && remainder >= 0 ? remainder : 0;
  var accrued = remainder + baseAmount * extra, bonus = Math.floor(accrued + 1e-9);
  state.productionRemainder = Math.max(0, accrued - bonus);
  return bonus;
}
function towerImpact(data, tower, target, center, parent) {
  var duration = Runtime.value(data, 120037);
  if (!(duration > 0) || !tower || !target || !target.node) return false;
  var kind = tower.buildCfg && tower.buildCfg.enumValue || tower.buildInfo && tower.buildInfo.BuildID;
  if (kind !== 2) return false;
  var now = typeof data._relicCombatTime === "number" && isFinite(data._relicCombatTime) ? data._relicCombatTime : 0;
  if (tower._relicGravityData === data && tower._relicGravityGeneration === data._relicGeneration && now - tower._relicGravityAt < 8) return false;
  center = center || TowerCombat.point(target.node, parent);
  if (!center || !isFinite(center.x) || !isFinite(center.y)) return false;
  var enemies = typeof data.getEnemyList === "function" ? data.getEnemyList().slice() : (data.enemyList || []).slice(), affected = [];
  enemies.forEach(function (enemy) {
    if (!TowerCombat.live(enemy)) return;
    var point = TowerCombat.point(enemy.node, parent), dx = point.x - center.x, dy = point.y - center.y;
    if (isFinite(dx) && isFinite(dy) && dx * dx + dy * dy <= 120 * 120) affected.push(enemy);
  });
  if (!affected.length) return false;
  tower._relicGravityData = data;
  tower._relicGravityGeneration = data._relicGeneration;
  tower._relicGravityAt = now;
  affected.forEach(function (enemy) { Runtime.applyControl(enemy, duration, .15); });
  return true;
}
function waveCleared(data, hero, round) {
  if (!data || !Number.isInteger(round) || round < 1) return false;
  var flask = ratio(data, 120043), chalice = ratio(data, 120049), silver = Math.floor(Runtime.value(data, 120048));
  if (!(flask > 0) && !(chalice > 0) && !(silver > 0)) return false;
  var state = Runtime.state(data);
  if (!state.completedWaves || typeof state.completedWaves !== "object" || Array.isArray(state.completedWaves)) state.completedWaves = {};
  if (state.completedWaves[round]) return false;
  // Mark before callbacks so a reentrant wave-end notification cannot pay twice.
  state.completedWaves[round] = true;
  if (flask > 0 && living(hero)) Runtime.heal(hero, flask);
  if (chalice > 0) {
    var soldiers = typeof data.getSoldierList === "function" ? data.getSoldierList().slice() : (data.soldierList || []).slice(), seen = [];
    soldiers.forEach(function (soldier) {
      if (seen.indexOf(soldier) >= 0 || !living(soldier)) return;
      seen.push(soldier); Runtime.heal(soldier, chalice);
    });
  }
  if (silver > 0 && round % 3 === 0) {
    if (typeof data.addCoin === "function") data.addCoin(silver);
    else data.coin += silver;
  }
  return true;
}

exports.castleHpMultiplier = castleHpMultiplier;
exports.castleIncomingDamage = castleIncomingDamage;
exports.afterCastleDamage = afterCastleDamage;
exports.replacementInterval = replacementInterval;
exports.productionBonus = productionBonus;
exports.towerImpact = towerImpact;
exports.waveCleared = waveCleared;
