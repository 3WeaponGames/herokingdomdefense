"use strict";

// Battle-only relic effects. All values come from the owned relic snapshot;
// looking at the collection or opening an editor never calls these functions.
var Runtime = require("RelicRuntime");
var TowerCombat = require("TowerCombat");

function ratio(data, id) { return Math.min(.9, Runtime.value(data, id)); }
function castleHpMultiplier(data) { return 1 + ratio(data, 120032); }
function castleIncomingDamage(data, castle, damage) {
  var info = castle && castle.buildInfo;
  if (!(damage > 0) || !info || !(info.hp > 0) || !builtBuildings(data).some(function (build) { return build.buildInfo.BuildID === 6; })) return damage;
  return damage * (1 - ratio(data, 120046));
}
function living(actor) {
  return !!actor && !actor._isPooled && !actor.isDestroyed && (!actor.isDead || !actor.isDead()) &&
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
    relicSound("hourglass-activate", castle);
    var enemies = typeof data.getEnemyList === "function" ? data.getEnemyList().slice() : (data.enemyList || []).slice();
    enemies.forEach(function (enemy) { if (living(enemy)) Runtime.applyControl(enemy, duration, .5); });
    triggered = true;
  }
  if (phoenix > 0 && hpRatio < .25 && !state.phoenixUsed) {
    state.phoenixUsed = true;
    relicSound("phoenix-castle-repair", castle);
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
function builtBuildings(data) {
  var map = data && data.bulidPointMap || {}, result = [], seen = [];
  Object.keys(map).forEach(function (key) {
    var build = map[key], info = build && build.buildInfo;
    if (!build || seen.indexOf(build) >= 0 || !info || !info.cfg || !(info.hp > 0) || !living(build) ||
        typeof build.getIsWork === "function" && !build.getIsWork()) return;
    seen.push(build); result.push(build);
  });
  return result;
}
function pointKey(build) {
  var id = build && (build.ID === undefined ? build.pointId : build.ID);
  return Number.isInteger(Number(id)) && Number(id) > 0 ? String(id) : null;
}
function economicGrowth(data, pointId) {
  var ledger = data && data.relicState && data.relicState.economicGrowthByPoint;
  var count = ledger && ledger[String(pointId)];
  return ratio(data, 120047) * Math.min(3, typeof count === "number" && isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
}
function applyEconomicGrowth(data, info, pointId, preserveDamage) {
  if (!info || !info.cfg || [4, 5].indexOf(info.BuildID) < 0) return 0;
  var bonus = info.cfg.Hp * economicGrowth(data, pointId), previous = info._relicGrowthHp || 0;
  if (!(bonus >= 0) || !isFinite(bonus)) return 0;
  var delta = bonus - previous;
  info.hpMax += delta;
  if (preserveDamage && info.hp > 0) info.hp = Math.min(info.hpMax, info.hp + delta);
  info._relicGrowthHp = bonus;
  return delta;
}
function armyBannerBonus(data) {
  var timer = data && data._relicArmyBanner;
  return timer && timer.round === data.round && timer.generation === data._relicGeneration ? ratio(data, 120010) * timer.stacks : 0;
}
function updateArmyBanner(data, dt) {
  var amount = ratio(data, 120010);
  if (!(amount > 0) || !(dt > 0) || !isFinite(dt)) return 0;
  var timer = data._relicArmyBanner;
  if (!timer || timer.round !== data.round || timer.generation !== data._relicGeneration) {
    timer = data._relicArmyBanner = { round: data.round, generation: data._relicGeneration, elapsed: 0, stacks: 0 };
  }
  if (timer.stacks >= 3) return 0;
  timer.elapsed += dt;
  var gained = Math.min(3 - timer.stacks, Math.floor((timer.elapsed + 1e-9) / 10));
  if (!gained) return 0;
  timer.elapsed -= gained * 10; timer.stacks += gained;
  return gained;
}
function updateHeroAura(data, hero, dt, moving) {
  var amount = ratio(data, 120049);
  if (!data || !hero) return 0;
  var timer = hero._relicArmyAura, generation = hero.node && hero.node._combatGeneration;
  if (!timer || timer.data !== data || timer.generation !== generation || timer.battleGeneration !== data._relicGeneration || timer.round !== data.round) {
    timer = hero._relicArmyAura = { data: data, generation: generation, battleGeneration: data._relicGeneration, round: data.round, elapsed: 0 };
  }
  if (!(amount > 0) || !living(hero) || !hero.node || moving) { timer.elapsed = 0; return 0; }
  if (!(dt > 0) || !isFinite(dt)) return 0;
  timer.elapsed += dt;
  var pulses = Math.floor((timer.elapsed + 1e-9) / 8);
  if (!pulses) return 0;
  timer.elapsed -= pulses * 8;
  var parent = hero.node.parent, center = TowerCombat.point(hero.node, parent), soldiers = (data.soldierList || []).slice(), entries = [], seen = [];
  soldiers.forEach(function (soldier) {
    if (!living(soldier) || !soldier.node || seen.indexOf(soldier) >= 0) return;
    seen.push(soldier);
    var pos = TowerCombat.point(soldier.node, parent), dx = pos.x - center.x, dy = pos.y - center.y;
    if (isFinite(dx) && isFinite(dy) && dx * dx + dy * dy <= 220 * 220) entries.push({ actor: soldier, node: soldier.node, generation: soldier.node._combatGeneration });
  });
  var healed = 0;
  entries.forEach(function (entry) {
    if (entry.actor.node === entry.node && entry.node._combatGeneration === entry.generation && living(entry.actor)) healed += Runtime.heal(entry.actor, amount * pulses);
  });
  return healed;
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
  relicSound("gravity-proc", target);
  affected.forEach(function (enemy) { Runtime.applyControl(enemy, duration, .15); });
  return true;
}
function waveCleared(data, hero, round) {
  if (!data || !Number.isInteger(round) || round < 1) return false;
  var interest = Math.floor(Runtime.value(data, 120004)), house = Math.floor(Runtime.value(data, 120023)), growth = ratio(data, 120047);
  if (!(interest > 0) && !(house > 0) && !(growth > 0)) return false;
  var state = Runtime.state(data);
  if (!state.completedWaves || typeof state.completedWaves !== "object" || Array.isArray(state.completedWaves)) state.completedWaves = {};
  if (state.completedWaves[round]) return false;
  // Mark before callbacks so a reentrant wave-end notification cannot pay twice.
  state.completedWaves[round] = true;
  // Bank interest uses the balance before this clear's rewards and production.
  var silver = interest * Math.min(3, Math.max(0, Math.floor((data.coin || 0) / 10)));
  var tier = typeof data.getBaseLevel === "function" ? data.getBaseLevel() : data.baseBuild && data.baseBuild.getLevel ? data.baseBuild.getLevel() : 1;
  builtBuildings(data).forEach(function (build) {
    var key = pointKey(build), info = build.buildInfo, kind = info.BuildID;
    if (!key || [4, 5].indexOf(kind) < 0) return;
    if (house > 0 && kind === 4) {
      var receipts = state.houseTierReceipts || (state.houseTierReceipts = {}), tiers = receipts[key] || (receipts[key] = {});
      if (!tiers[String(tier)]) { tiers[String(tier)] = true; silver += house; }
    }
    if (growth > 0) {
      var ledger = state.economicGrowthByPoint || (state.economicGrowthByPoint = {});
      ledger[key] = Math.min(3, (typeof ledger[key] === "number" && isFinite(ledger[key]) ? Math.max(0, Math.floor(ledger[key])) : 0) + 1);
      applyEconomicGrowth(data, info, key, true);
      if (build.upHpView) build.upHpView();
    }
  });
  if (silver > 0) {
    if (typeof data.addCoin === "function") data.addCoin(silver); else data.coin += silver;
  }
  return true;
}

exports.castleHpMultiplier = castleHpMultiplier;
exports.castleIncomingDamage = castleIncomingDamage;
exports.afterCastleDamage = afterCastleDamage;
exports.replacementInterval = replacementInterval;
exports.economicGrowth = economicGrowth;
exports.applyEconomicGrowth = applyEconomicGrowth;
exports.armyBannerBonus = armyBannerBonus;
exports.updateArmyBanner = updateArmyBanner;
exports.updateHeroAura = updateHeroAura;
exports.towerImpact = towerImpact;
exports.waveCleared = waveCleared;

function relicSound(id, actor) {
  if (typeof cc === "undefined" || !cc.resources) return;
  var sound = require("BattleSounds");
  if (sound.effect) sound.effect(id, actor);
}
