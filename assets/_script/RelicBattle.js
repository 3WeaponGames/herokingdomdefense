"use strict";

// Battle-only relic effects. All values come from the owned relic snapshot;
// looking at the collection or opening an editor never calls these functions.
var Runtime = require("RelicRuntime");
var TowerCombat = require("TowerCombat");

function ratio(data, id) { return Math.min(.9, Runtime.value(data, id)); }
function castleHpMultiplier(data) { return 1 + ratio(data, 120032); }
function castleIncomingDamage(data, castle, damage) {
  var info = castle && castle.buildInfo;
  if (!(damage > 0) || !info || !(info.hp > 0)) return damage;
  var protection = ratio(data, 120046);
  if (!(protection > 0) || !builtBuildings(data).some(function (build) { return build.buildInfo.BuildID === 6; })) return damage;
  return damage * (1 - protection);
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
  var owner = data.ctrPar, ownerData = owner && owner.gameData, epoch = owner && owner._combatEpoch, generation = data._relicGeneration, round = data.round;
  var node = castle.node, nodeGeneration = node && node._combatGeneration;
  function current() {
    return data.relicState === state && data.ctrPar === owner && data._relicGeneration === generation && data.round === round &&
      (!owner || owner.gameData === ownerData && owner._combatEpoch === epoch) && castle.buildInfo === info && castle.node === node &&
      (!node || node._combatGeneration === nodeGeneration) && !castle.isDestroyed && info.hp > 0 &&
      (typeof cc === "undefined" || !cc.isValid || cc.isValid(castle, true) && (!node || cc.isValid(node, true)));
  }
  // Evaluate both thresholds against the hit before Phoenix repairs the castle.
  if (duration > 0 && hpRatio < .5 && !state.hourglassUsed) {
    state.hourglassUsed = true;
    relicSound("hourglass-activate", castle);
    if (!current()) return false;
    var enemies = typeof data.getEnemyList === "function" ? data.getEnemyList().slice() : (data.enemyList || []).slice();
    var targets = enemies.filter(living).map(function (enemy) { return { actor: enemy, node: enemy.node, generation: enemy.node && enemy.node._combatGeneration }; });
    for (var index = 0; index < targets.length; index++) {
      if (!current()) return false;
      var target = targets[index];
      if (target.actor.node === target.node && (!target.node || target.node._combatGeneration === target.generation) && living(target.actor)) Runtime.applyControl(target.actor, duration, .5);
    }
    triggered = true;
  }
  if (!current()) return false;
  if (phoenix > 0 && hpRatio < .25 && !state.phoenixUsed) {
    state.phoenixUsed = true;
    relicSound("phoenix-castle-repair", castle);
    if (!current()) return false;
    info.hp = Math.min(info.hpMax, info.hp + info.hpMax * phoenix);
    var hp = castle.ctrHp;
    if (hp && (typeof cc === "undefined" || !cc.isValid || cc.isValid(hp, true) && (!hp.node || cc.isValid(hp.node, true))) && hp.setHp) hp.setHp(info.hp, info.hpMax);
    if (!current()) return false;
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
  if (!timer || timer.data !== data || timer.node !== hero.node || timer.generation !== generation || timer.battleGeneration !== data._relicGeneration || timer.round !== data.round || timer.owner !== data.ctrPar || timer.epoch !== (data.ctrPar && data.ctrPar._combatEpoch)) {
    timer = hero._relicArmyAura = { data: data, node: hero.node, generation: generation, battleGeneration: data._relicGeneration, round: data.round, owner: data.ctrPar, epoch: data.ctrPar && data.ctrPar._combatEpoch, elapsed: 0 };
  }
  if (!(amount > 0) || !living(hero) || !TowerCombat.live(hero) || moving) { timer.elapsed = 0; return 0; }
  if (!(dt > 0) || !isFinite(dt)) return 0;
  timer.elapsed += dt;
  var pulses = Math.floor((timer.elapsed + 1e-9) / 8);
  if (!pulses) return 0;
  timer.elapsed -= pulses * 8;
  var heroNode = hero.node, owner = data.ctrPar, ownerData = owner && owner.gameData, ownerHero = owner && owner.ctrPlay;
  var battleGeneration = data._relicGeneration, round = data.round, epoch = owner && owner._combatEpoch;
  var parent = heroNode.parent, center = TowerCombat.point(heroNode, parent), soldiers = (data.soldierList || []).slice(), entries = [], seen = [];
  soldiers.forEach(function (soldier) {
    if (!living(soldier) || !TowerCombat.live(soldier) || seen.indexOf(soldier) >= 0) return;
    seen.push(soldier);
    var pos = TowerCombat.point(soldier.node, parent), dx = pos.x - center.x, dy = pos.y - center.y;
    if (isFinite(dx) && isFinite(dy) && dx * dx + dy * dy <= 220 * 220) entries.push({ actor: soldier, node: soldier.node, generation: soldier.node._combatGeneration });
  });
  var healed = 0;
  for (var index = 0; index < entries.length; index++) {
    // A healing-view callback may restart the battle or replace its hero.
    if (data._relicGeneration !== battleGeneration || data.round !== round || data.ctrPar !== owner ||
        owner && (owner.gameData !== ownerData || owner.ctrPlay !== ownerHero || owner._combatEpoch !== epoch) ||
        hero.node !== heroNode || heroNode._combatGeneration !== generation || !living(hero) || !TowerCombat.live(hero)) break;
    var entry = entries[index];
    if (entry.actor.node === entry.node && entry.node._combatGeneration === entry.generation && living(entry.actor) && TowerCombat.live(entry.actor)) healed += Runtime.heal(entry.actor, amount * pulses);
  }
  return healed;
}
function towerImpact(data, tower, target, center, parent) {
  var duration = Runtime.value(data, 120037);
  if (!(duration > 0) || !tower || !target || !target.node) return false;
  var kind = tower.buildCfg && tower.buildCfg.enumValue || tower.buildInfo && tower.buildInfo.BuildID;
  if (kind !== 2) return false;
  var now = typeof data._relicCombatTime === "number" && isFinite(data._relicCombatTime) ? data._relicCombatTime : 0;
  var owner = data.ctrPar, ownerData = owner && owner.gameData, epoch = owner && owner._combatEpoch, stage = owner && owner.gameStatus;
  var generation = data._relicGeneration, round = data.round, towerNode = tower.node, towerGeneration = towerNode && towerNode._combatGeneration, targetNode = target.node, targetGeneration = targetNode._combatGeneration;
  function current() {
    return data.ctrPar === owner && data._relicGeneration === generation && data.round === round &&
      (!owner || owner.gameData === ownerData && owner._combatEpoch === epoch && owner.gameStatus === stage) &&
      tower.node === towerNode && (!towerNode || towerNode._combatGeneration === towerGeneration) &&
      target.node === targetNode && targetNode._combatGeneration === targetGeneration;
  }
  if (tower._relicGravityData === data && tower._relicGravityGeneration === generation && tower._relicGravityNode === towerNode && tower._relicGravityEpoch === epoch && now - tower._relicGravityAt < 8) return false;
  center = center || TowerCombat.point(target.node, parent);
  if (!center || !isFinite(center.x) || !isFinite(center.y)) return false;
  var enemies = typeof data.getEnemyList === "function" ? data.getEnemyList().slice() : (data.enemyList || []).slice(), affected = [], seen = new Set();
  enemies.forEach(function (enemy) {
    if (!TowerCombat.live(enemy) || seen.has(enemy)) return;
    seen.add(enemy);
    var point = TowerCombat.point(enemy.node, parent), dx = point.x - center.x, dy = point.y - center.y;
    if (isFinite(dx) && isFinite(dy) && dx * dx + dy * dy <= 120 * 120) affected.push({ actor: enemy, node: enemy.node, generation: enemy.node._combatGeneration });
  });
  if (!affected.length) return false;
  tower._relicGravityData = data;
  tower._relicGravityGeneration = data._relicGeneration;
  tower._relicGravityNode = towerNode;
  tower._relicGravityEpoch = epoch;
  tower._relicGravityAt = now;
  relicSound("gravity-proc", target);
  var applied = false;
  for (var index = 0; index < affected.length; index++) {
    if (!current()) return applied;
    var entry = affected[index];
    if (entry.actor.node === entry.node && entry.node._combatGeneration === entry.generation && TowerCombat.live(entry.actor)) applied = Runtime.applyControl(entry.actor, duration, .15) || applied;
  }
  return applied;
}
function waveCleared(data, hero, round) {
  if (!data || !Number.isInteger(round) || round < 1) return false;
  var interest = Math.floor(Runtime.value(data, 120004)), house = Math.floor(Runtime.value(data, 120023)), growth = ratio(data, 120047);
  if (!(interest > 0) && !(house > 0) && !(growth > 0)) return false;
  var state = Runtime.state(data);
  var owner = data.ctrPar, ownerData = owner && owner.gameData, epoch = owner && owner._combatEpoch, generation = data._relicGeneration, activeRound = data.round;
  function current() {
    return data.relicState === state && data.ctrPar === owner && data._relicGeneration === generation && data.round === activeRound &&
      (!owner || owner.gameData === ownerData && owner._combatEpoch === epoch);
  }
  if (!state.completedWaves || typeof state.completedWaves !== "object" || Array.isArray(state.completedWaves)) state.completedWaves = {};
  if (state.completedWaves[round]) return false;
  // Mark before callbacks so a reentrant wave-end notification cannot pay twice.
  state.completedWaves[round] = true;
  // Bank interest uses the balance before this clear's rewards and production.
  var silver = interest * Math.min(3, Math.max(0, Math.floor((data.coin || 0) / 10)));
  var tier = typeof data.getBaseLevel === "function" ? data.getBaseLevel() : data.baseBuild && data.baseBuild.getLevel ? data.baseBuild.getLevel() : 1;
  var buildings = builtBuildings(data).map(function (build) { return { actor: build, node: build.node, generation: build.node && build.node._combatGeneration, info: build.buildInfo }; });
  for (var index = 0; index < buildings.length; index++) {
    if (!current()) return false;
    var entry = buildings[index], build = entry.actor, key = pointKey(build), info = entry.info, kind = info.BuildID;
    if (!key || [4, 5].indexOf(kind) < 0 || build.buildInfo !== info || build.node !== entry.node || entry.node && entry.node._combatGeneration !== entry.generation || !living(build)) continue;
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
  }
  if (!current()) return false;
  if (silver > 0) {
    if (typeof data.addCoin === "function") data.addCoin(silver); else data.coin += silver;
  }
  return current();
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
