'use strict';
// Primary-hit records carry their own battle and pooled-node identities. Relic
// secondary hits never become primary hits or change authored attack timing.
var Runtime = require('RelicRuntime');
function current() { return Runtime.current(); }
function living(actor) {
  return !!actor && !actor._isPooled && (!actor.isDead || !actor.isDead()) &&
    (!actor.node || actor.node.activeInHierarchy !== false) && actor.hp > 0;
}
function heroOf(data) { return data && data.ctrPar && data.ctrPar.ctrPlay; }
function heroSource(actor, data) { return !!actor && (!!actor._relicHero || actor === heroOf(data)); }
function position(actor) {
  var node = actor && actor.node;
  return node && node.getPosition ? node.getPosition() : node && node.position;
}
function feedback(target, damage) {
  var ui = require('KinghtFallUIGame').default.instance;
  if (ui && ui.ctrEffect && ui.ctrEffect.showDamageNum && target.node) ui.ctrEffect.showDamageNum(position(target), damage, false);
}
function generation(actor) { return actor && actor.node && actor.node._combatGeneration; }
function sameBattle(record, releasedDamage) {
  return !!record && current() === record.data &&
    record.relicGeneration === (record.data && record.data._relicGeneration) &&
    (!record.game || record.game._combatEpoch === record.epoch) &&
    (releasedDamage || living(record.hero) && generation(record.hero) === record.heroGeneration);
}
function primaryContext(hero, target, damage, critical, release) {
  var data = current();
  return { data: data, relicGeneration: data && data._relicGeneration, game: data && data.ctrPar, epoch: data && data.ctrPar && data.ctrPar._combatEpoch,
    hero: hero, heroGeneration: generation(hero), target: target, targetGeneration: generation(target),
    nonCritical: damage, critical: !!critical, echo: release && release.target === target && release.targetGeneration === generation(target) && sameBattle(release) ? release.echo : 0 };
}
function primaryCurrent(record, target, hero) {
  return sameBattle(record, true) && record.hero === hero && record.target === target &&
    generation(target) === record.targetGeneration;
}
function primaryValid(record, target, hero) { return primaryCurrent(record, target, hero) && sameBattle(record) && !record.used; }
function enemyDamage(target, damage, source, secondary, context) {
  if (!(damage > 0) || secondary) return damage;
  var data = current(), bonus = 0, primary = primaryValid(context, target, source);
  if (primary) {
    if (Runtime.controlled(target)) bonus += Runtime.value(data, 120029);
    if (Runtime.boss(target)) bonus += Runtime.value(data, 120034);
    if (target.hp >= target.hpMax) bonus += Runtime.value(data, 120025);
    var focus = Runtime.value(data, 120027);
    if (focus > 0) {
      var previous = source._relicFocus, stacks = previous && previous.data === data && previous.round === data.round &&
        previous.epoch === context.epoch && previous.relicGeneration === context.relicGeneration && previous.heroGeneration === generation(source) && previous.target === target && previous.targetGeneration === generation(target) ? Math.min(3, previous.stacks + 1) : 0;
      source._relicFocus = { data: data, round: data.round, epoch: context.epoch, relicGeneration: context.relicGeneration, heroGeneration: generation(source), target: target, targetGeneration: generation(target), stacks: stacks };
      bonus += focus * stacks;
    }
    var point = position(target), origin = position(source);
    context.point = point && { x: point.x, y: point.y };
    context.origin = origin && { x: origin.x, y: origin.y };
    context.nonCritical *= 1 + bonus;
  }
  if (source && source.navigationTeam === 'friendly' && !heroSource(source, data) && target.hp < target.hpMax * .25) bonus += Runtime.value(data, 120045);
  return damage * (1 + bonus);
}
function waveBarrier(data, hero) {
  var fraction = Runtime.value(data, 120036);
  if (!(fraction > 0) || !living(hero)) return null;
  var state = Runtime.state(data), waves = state.heroBarriersByWave || (state.heroBarriersByWave = {}), key = String(data.round);
  if (!waves[key]) waves[key] = { remaining: hero.hpMax * fraction };
  return waves[key];
}
function heroIncoming(hero, damage, source, ranged) {
  if (!(damage > 0)) return damage;
  var data = current(), reduction = hero._heroSecondary && hero._heroSecondary.damageReduction || 0;
  if(hero._styleRuntime)reduction+=hero._styleRuntime.bonus().damageReduction||0;
  if (ranged || source && source.cfg && Number(source.cfg.AttackType) === 2) reduction += Runtime.value(data, 120033);
  if (hero._relicMoving) reduction += Runtime.value(data, 120041);
  else reduction += Runtime.value(data, 120026);
  damage *= 1 - Math.min(.8, reduction);
  var skill=hero._styleRuntime&&hero._styleRuntime.state;
  if(skill&&skill.shieldRemaining>0)damage=require("HeroStyleSkills").absorbDamage(skill,damage).damage;
  var barrier = waveBarrier(data, hero);
  if (barrier) { var absorbed = Math.min(damage, Math.max(0, barrier.remaining)); barrier.remaining -= absorbed; damage -= absorbed; }
  return damage;
}
function afterHeroHit(hero, damage, source) {
  var data = current(), ratio = Runtime.value(data, 120040), reflectedContext = primaryContext(hero, source, damage, false);
  var emergency = Runtime.value(data, 120043);
  if (damage > 0 && emergency > 0 && living(hero) && hero.hp < hero.hpMax * .3) {
    var state = Runtime.state(data), used = state.emergencyHealedByWave || (state.emergencyHealedByWave = {}), key = String(data.round);
    if (!used[key]) {
      used[key] = true;
      if (!(Runtime.heal(hero, emergency) > 0)) delete used[key];
    }
  }
  if (damage > 0 && ratio > 0 && source && source.cfg && Number(source.cfg.AttackType) === 2 && living(source) && primaryCurrent(reflectedContext, source, hero)) {
    var reflected = damage * ratio;
    relicSound("mirror-reflect", hero);
    source.onAttacked(reflected, hero, true);
    if (primaryCurrent(reflectedContext, source, hero)) feedback(source, reflected);
  }
}
function enemyKilled(target, source, secondary, context) {
  var data = current(), fraction = Runtime.value(data, 120042);
  if (!(fraction > 0) || secondary || !primaryValid(context, target, source)) return;
  var state = Runtime.state(data), key = String(data.round);
  var used = state.vampireHealedByWave || (state.vampireHealedByWave = {});
  var remaining = Math.max(0, .1 - (Number(used[key]) || 0));
  if (!(remaining > 1e-9)) return;
  var planned = Math.min(fraction, remaining), previous = used[key];
  used[key] = Math.min(.1, (Number(previous) || 0) + planned);
  var actual = Math.min(planned, Math.max(0, Runtime.heal(source, planned)) / source.hpMax);
  used[key] = Math.max(0, used[key] - planned + actual);
  if (.1 - used[key] < 1e-9) used[key] = .1;
  if (!used[key] && previous === undefined) delete used[key];
  if (actual > 0) {
    relicSound("life-steal", source);
  }
}
function heroAttack(hero, primary, damage) {
  var data = current(), ratio = Runtime.value(data, 120030), echo = Runtime.value(data, 120048), release;
  if (!(damage > 0) || !living(primary) || !living(hero) || !(ratio > 0 || echo > 0)) return;
  var state = Runtime.state(data);
  if (echo > 0) {
    state.bowReleaseCount = (Number(state.bowReleaseCount) || 0) + 1;
    release = primaryContext(hero, primary, damage, false);
    release.echo = state.bowReleaseCount % 6 ? 0 : echo;
  }
  if (!(ratio > 0)) return release;
  state.heroAttackCount = (Number(state.heroAttackCount) || 0) + 1;
  if (state.heroAttackCount % 8) return release;
  var center = position(primary);
  if (!center) return;
  var enemies = data.getEnemyList ? data.getEnemyList() : data.enemyList || [], nearby = [];
  for (var index = 0; index < enemies.length; index++) {
    var enemy = enemies[index], point = position(enemy);
    if (enemy === primary || !living(enemy) || !point) continue;
    var dx = point.x - center.x, dy = point.y - center.y, distance = dx * dx + dy * dy;
    if (distance <= 200 * 200) nearby.push({ enemy: enemy, distance: distance, generation: enemy.node && enemy.node._combatGeneration });
  }
  nearby.sort(function (a, b) { return a.distance - b.distance; });
  if (nearby.length) relicSound("chain-lightning", primary);
  var game = data.ctrPar, epoch = game && game._combatEpoch, heroGeneration = hero.node && hero.node._combatGeneration;
  for (var i = 0; i < Math.min(2, nearby.length); i++) {
    if (current() !== data || game && game._combatEpoch !== epoch || !living(hero) || hero.node && hero.node._combatGeneration !== heroGeneration) break;
    var record = nearby[i], target = record.enemy, amount = damage * ratio;
    if (!living(target) || !target.node || target.node._combatGeneration !== record.generation) continue;
    target.onAttacked(amount, hero, true);
    if (current() === data && (!game || game._combatEpoch === epoch) && target.node._combatGeneration === record.generation) feedback(target, amount);
  }
  return release;
}
function primaryImpact(target, hero, context, damage) {
  if (!(damage > 0) || !primaryValid(context, target, hero)) return;
  context.used = true;
  var data = context.data;
  var gear = hero._heroSecondary || {};
  if(hero._styleRuntime)hero._styleRuntime.onImpact(target,damage,context);
  // Life steal uses damage actually removed, excluding overkill and all
  // reflected/splash hits. It cannot revive a dead or recycled hero.
  var dealt = Math.min(damage, Math.max(0, target.hp + damage));
  if (gear.lifeSteal > 0 && hero.hpMax > 0) Runtime.heal(hero, dealt * gear.lifeSteal / hero.hpMax);
  if (!sameBattle(context)) return;
  if (hero.heroStyle !== "mystic" && gear.splashDamage > 0 && gear.splashRadius > 0 && context.point) {
    var splash = [], targets = data.getEnemyList ? data.getEnemyList() : data.enemyList || [];
    for (var s = 0; s < targets.length; s++) {
      var neighbor = targets[s], location = position(neighbor);
      if (neighbor === target || !living(neighbor) || !location) continue;
      var sx = location.x - context.point.x, sy = location.y - context.point.y;
      if (sx * sx + sy * sy <= gear.splashRadius * gear.splashRadius) splash.push({ enemy:neighbor,generation:generation(neighbor) });
    }
    for (var s = 0; s < splash.length; s++) secondaryHit(splash[s].enemy, damage * gear.splashDamage, context, splash[s].generation);
  }
  if (!sameBattle(context)) return;
  if (context.critical && Runtime.value(data, 120014) > 0) {
    hero._relicHaste = { data: data, epoch: context.epoch, relicGeneration: context.relicGeneration, heroGeneration: context.heroGeneration, remaining: 2, round: data.round };
  }
  var pierce = Runtime.value(data, 120024), cleave = Runtime.value(data, 120035), center = context.point, origin = context.origin;
  if ((pierce > 0 || cleave > 0) && center && origin) {
    var enemies = data.getEnemyList ? data.getEnemyList() : data.enemyList || [], nearby = [];
    var dx = center.x - origin.x, dy = center.y - origin.y, length = Math.sqrt(dx * dx + dy * dy);
    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i], point = position(enemy);
      if (enemy === target || !living(enemy) || !point) continue;
      var x = point.x - center.x, y = point.y - center.y, distance = x * x + y * y;
      var along = length > 0 ? (x * dx + y * dy) / length : -1;
      var across = length > 0 ? Math.abs(x * dy - y * dx) / length : Infinity;
      if (pierce > 0 ? along > 0 && along <= 70 && across <= 12 : distance <= 100 * 100) nearby.push({ enemy: enemy, generation: generation(enemy), distance: pierce > 0 ? along : distance });
    }
    nearby.sort(function (a, b) { return a.distance - b.distance; });
    if (nearby.length) secondaryHit(nearby[0].enemy, context.nonCritical * (pierce || cleave), context, nearby[0].generation);
  }
  if (context.echo > 0 && living(target)) secondaryHit(target, context.nonCritical * context.echo, context, context.targetGeneration);
}
function secondaryHit(target, damage, context, targetGeneration) {
  if (!sameBattle(context) || !living(target) || generation(target) !== targetGeneration) return;
  target.onAttacked(damage, context.hero, true);
  if (sameBattle(context) && generation(target) === targetGeneration) feedback(target, damage);
}
function updateHero(hero, dt) {
  var data = current();
  if (!living(hero)) return;
  waveBarrier(data, hero);
  var haste = hero._relicHaste;
  if (haste) {
    if (haste.data !== data || haste.epoch !== (data && data.ctrPar && data.ctrPar._combatEpoch) || haste.relicGeneration !== (data && data._relicGeneration) || haste.heroGeneration !== generation(hero) || haste.round !== data.round) delete hero._relicHaste;
    else { haste.remaining = Math.max(0, haste.remaining - Math.max(0, dt)); if (haste.remaining < 1e-9) haste.remaining = 0; }
  }
}
function heroHaste(hero) {
  var data = current(), haste = hero && hero._relicHaste;
  return haste && haste.remaining > 0 && haste.data === data && haste.epoch === (data && data.ctrPar && data.ctrPar._combatEpoch) && haste.relicGeneration === (data && data._relicGeneration) && haste.heroGeneration === generation(hero) && haste.round === data.round ? Runtime.value(data, 120014) : 0;
}
function allyIncoming(actor,damage){
  var hero=heroOf(current());
  if(!living(hero)||!hero._styleRuntime||!living(actor))return damage;
  var bonus=hero._styleRuntime.bonus().allyDamageReduction||0,a=position(actor),b=position(hero);
  return bonus>0&&a&&b&&Math.hypot(a.x-b.x,a.y-b.y)<=250?damage*(1-Math.min(.8,bonus)):damage;
}
function tauntedTarget(enemy){
  var record=enemy&&enemy._heroTaunt,data=current();
  if(!record||record.remaining<=0||record.data!==data||record.epoch!==(data&&data.ctrPar&&data.ctrPar._combatEpoch)||record.enemyGeneration!==generation(enemy)||record.generation!==generation(record.hero)||!living(record.hero))return null;
  return record.hero;
}
function releaseControl(enemy) {
  var paused = enemy && enemy._relicPausedRenderers;
  if (!paused) return;
  for (var i = 0; i < paused.length; i++) paused[i].renderer.paused = paused[i].wasPaused;
  delete enemy._relicPausedRenderers;
}
function updateEnemy(enemy, dt) {
  var control = Runtime.controlDelta(enemy, dt);
  if (control.frozen) {
    require('GameToolsOverrides').cancel(enemy);
    if (enemy.rigidBody) enemy.rigidBody.linearVelocity = typeof cc !== 'undefined' ? cc.Vec2.ZERO : { x: 0, y: 0 };
    if (!enemy._relicPausedRenderers) {
      var paused = enemy._relicPausedRenderers = [];
      [enemy.spAni, enemy.spAni2, enemy.spAni3, enemy.spAniUp].forEach(function (renderer) {
        if (!renderer || paused.some(function (entry) { return entry.renderer === renderer; })) return;
        paused.push({ renderer: renderer, wasPaused: !!renderer.paused }); renderer.paused = true;
      });
    }
    return;
  }
  releaseControl(enemy);
  enemy.onUpdate(control.dt);
}
exports.enemyDamage = enemyDamage;
exports.heroIncoming = heroIncoming;
exports.afterHeroHit = afterHeroHit;
exports.enemyKilled = enemyKilled;
exports.heroAttack = heroAttack;
exports.primaryContext = primaryContext;
exports.primaryCurrent = primaryCurrent;
exports.primaryValid = primaryValid;
exports.primaryImpact = primaryImpact;
exports.updateHero = updateHero;
exports.heroHaste = heroHaste;
exports.allyIncoming = allyIncoming;
exports.tauntedTarget = tauntedTarget;
exports.updateEnemy = updateEnemy;
exports.releaseControl = releaseControl;

function relicSound(id, actor) {
  if (typeof cc === "undefined" || !cc.resources) return;
  var sound = require("BattleSounds");
  if (sound.effect) sound.effect(id, actor);
}
