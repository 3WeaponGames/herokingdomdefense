'use strict';
// Primary-hit records carry their own battle and pooled-node identities. Relic
// secondary hits never become primary hits or change authored attack timing.
var Runtime = require('RelicRuntime');
var Skills = require('./HeroStyleSkills');
var FlightTargeting = require('./FlightTargeting');
function current() { return Runtime.current(); }
function living(actor) {
  return !!actor && (typeof cc === 'undefined' || !cc.isValid || cc.isValid(actor, true) && (!actor.node || cc.isValid(actor.node, true))) && !actor._isPooled && (!actor.isDead || !actor.isDead()) &&
    (!actor.node || actor.node.activeInHierarchy !== false) && actor.hp > 0;
}
function heroOf(data) { return data && data.ctrPar && data.ctrPar.ctrPlay; }
function heroSource(actor, data) { return !!actor && (!!actor._relicHero || actor === heroOf(data)); }
function position(actor) {
  if (!actor || typeof cc !== 'undefined' && cc.isValid && !cc.isValid(actor, true)) return null;
  var node = actor && actor.node;
  if (node && typeof cc !== 'undefined' && cc.isValid && !cc.isValid(node, true)) return null;
  return node && node.getPosition ? node.getPosition() : node && node.position;
}
function feedback(target, damage) {
  if (!target || target._isPooled) return;
  var ui = require('KinghtFallUIGame').default.instance;
  var effect = ui && ui.ctrEffect;
  if (!effect || typeof cc !== 'undefined' && cc.isValid && (!cc.isValid(effect, true) || effect.node && !cc.isValid(effect.node, true))) return;
  var point = position(target);
  if (effect.showDamageNum && point) effect.showDamageNum(point, damage, false);
}
function generation(actor) { return actor && actor.node && actor.node._combatGeneration; }
function sameHeroLife(record) {
  var hero = record && record.hero;
  return !!hero && !hero._isPooled && hero.node === record.heroNode && generation(hero) === record.heroGeneration &&
    (typeof cc === 'undefined' || !cc.isValid || cc.isValid(hero, true) && (!hero.node || cc.isValid(hero.node, true)));
}
function sameBattle(record, releasedDamage) {
  return !!record && current() === record.data &&
    record.relicGeneration === (record.data && record.data._relicGeneration) &&
    (!record.game || record.data.ctrPar === record.game && record.game._combatEpoch === record.epoch && (!record.game.gameData || record.game.gameData === record.data) && (!record.game.ctrPlay || record.game.ctrPlay === record.hero)) &&
    (releasedDamage || living(record.hero) && record.hero.node === record.heroNode && generation(record.hero) === record.heroGeneration);
}
function primaryContext(hero, target, damage, critical, release) {
  var data = current();
  return { data: data, relicGeneration: data && data._relicGeneration, game: data && data.ctrPar, epoch: data && data.ctrPar && data.ctrPar._combatEpoch,
    hero: hero, heroNode: hero && hero.node, heroGeneration: generation(hero), heroStyle: hero && hero.heroStyle, target: target, targetNode: target && target.node, targetGeneration: generation(target),
    nonCritical: damage, critical: !!critical, echo: release && release.target === target && release.targetNode === (target && target.node) && release.targetGeneration === generation(target) && sameBattle(release) ? release.echo : 0 };
}
function primaryCurrent(record, target, hero) {
  return sameBattle(record, true) && record.hero === hero && record.target === target &&
    (!target || target.node === record.targetNode && (typeof cc === 'undefined' || !cc.isValid || cc.isValid(target, true) && (!target.node || cc.isValid(target.node, true)))) &&
    generation(target) === record.targetGeneration;
}
function primaryValid(record, target, hero) { return primaryCurrent(record, target, hero) && sameBattle(record) && !record.used; }
function enemyDamage(target, damage, source, secondary, context, preview) {
  if (!(damage > 0) || secondary) return damage;
  var data = current(), bonus = 0, primary = primaryValid(context, target, source);
  if (primary) {
    if (Runtime.controlled(target)) bonus += Runtime.value(data, 120029);
    if (Runtime.boss(target)) bonus += Runtime.value(data, 120034);
    if (target.hp >= target.hpMax) bonus += Runtime.value(data, 120025);
    var focus = Runtime.value(data, 120027);
    if (focus > 0) {
      var previous = source._relicFocus, stacks = previous && previous.data === data && previous.round === data.round &&
        previous.epoch === context.epoch && previous.relicGeneration === context.relicGeneration && previous.heroNode === source.node && previous.heroGeneration === generation(source) && previous.target === target && previous.targetNode === target.node && previous.targetGeneration === generation(target) ? Math.min(3, previous.stacks + 1) : 0;
      if (!preview) source._relicFocus = { data: data, round: data.round, epoch: context.epoch, relicGeneration: context.relicGeneration, heroNode: source.node, heroGeneration: generation(source), target: target, targetNode: target.node, targetGeneration: generation(target), stacks: stacks };
      bonus += focus * stacks;
    }
    var point = position(target), origin = position(source);
    context.point = point && { x: point.x, y: point.y };
    context.origin = origin && { x: origin.x, y: origin.y };
    context.nonCritical *= 1 + bonus;
  }
  if (source && source.navigationTeam === 'friendly' && !heroSource(source, data) && target.hp < target.hpMax * .25) bonus += Runtime.value(data, 120045);
  damage *= 1 + bonus;
  // This target's matchup is separate from the base damage used by relic procs.
  if (context && context.heroStyle && !context.used && (primary || primaryCurrent(context, target, source))) {
    damage = require('GameToolsOverrides').typeCounterDamage(source, target, damage, context.heroStyle);
  }
  return damage;
}
function previewHeroHit(hero, target, damage) {
  return enemyDamage(target, damage, hero, false, primaryContext(hero, target, damage, false), true);
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
  if (damage > 0 && ratio > 0 && source && source.cfg && Number(source.cfg.AttackType) === 2 && living(source) && primaryCurrent(reflectedContext, source, hero) && sameHeroLife(reflectedContext)) {
    var reflected = damage * ratio;
    relicSound("mirror-reflect", hero);
    if (!primaryCurrent(reflectedContext, source, hero) || !sameHeroLife(reflectedContext) || !living(source)) return;
    var received = source.onAttacked(reflected, hero, true);
    if (primaryCurrent(reflectedContext, source, hero)) feedback(source, received);
  }
}
function enemyKilled(target, source, secondary, context) {
  var data = current(), fraction = Runtime.value(data, 120042);
  if (!(fraction > 0) || secondary || !primaryValid(context, target, source)) return;
  var state = Runtime.state(data), key = String(data.round);
  var used = state.vampireHealedByWave || (state.vampireHealedByWave = {});
  var remaining = Math.max(0, .1 - (Number(used[key]) || 0));
  if (!(remaining > 1e-9)) return;
  var planned = Math.min(fraction, remaining), previous = used[key], maximum = source.hpMax;
  used[key] = Math.min(.1, (Number(previous) || 0) + planned);
  var silent = (source.heroStyle || context.heroStyle || data.heroStyle) === "bruiser";
  var actual = Math.min(planned, Math.max(0, Runtime.heal(source, planned, {silent:silent})) / maximum);
  used[key] = Math.max(0, used[key] - planned + actual);
  if (.1 - used[key] < 1e-9) used[key] = .1;
  if (!used[key] && previous === undefined) delete used[key];
  if (actual > 0 && !silent && sameBattle(context)) {
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
  var lifetime = primaryContext(hero, primary, damage, false);
  var center = position(primary);
  if (!center) return;
  var enemies = data.getEnemyList ? data.getEnemyList() : data.enemyList || [], nearby = [];
  for (var index = 0; index < enemies.length; index++) {
    var enemy = enemies[index], point = position(enemy);
    if (enemy === primary || !living(enemy) || !point || !FlightTargeting.heroCanTarget(hero, enemy)) continue;
    var dx = point.x - center.x, dy = point.y - center.y, distance = dx * dx + dy * dy;
    if (distance <= 200 * 200) {
      if (nearby.length === 2 && distance >= nearby[1].distance) continue;
      var candidate = { enemy: enemy, node: enemy.node, distance: distance, generation: generation(enemy) };
      if (nearby.length < 2) nearby.push(candidate); else nearby[1] = candidate;
      if (nearby.length === 2 && nearby[1].distance < nearby[0].distance) { var first = nearby[0]; nearby[0] = nearby[1]; nearby[1] = first; }
    }
  }
  if (nearby.length) relicSound("chain-lightning", primary);
  for (var i = 0; i < Math.min(2, nearby.length); i++) {
    if (!sameBattle(lifetime)) break;
    var record = nearby[i], target = record.enemy, amount = damage * ratio;
    if (!living(target) || target.node !== record.node || !target.node || target.node._combatGeneration !== record.generation) continue;
    var received = target.onAttacked(amount, hero, true);
    if (sameBattle(lifetime) && target.node === record.node && generation(target) === record.generation && !target._isPooled) feedback(target, received);
  }
  return release;
}
function primaryImpact(target, hero, context, damage) {
  if (!(damage > 0) || !primaryValid(context, target, hero)) return;
  context.used = true;
  require("TutorialFlow").heroHit(context.game);
  var data = context.data;
  var gear = hero._heroSecondary || {};
  // Capture the hit before style callbacks can heal/change the same target.
  var dealt = Math.min(damage, Math.max(0, target.hp + damage));
  if(hero._styleRuntime)hero._styleRuntime.onImpact(target,damage,context);
  // Style callbacks may recycle the hero or retire this battle synchronously.
  // A dead target with the same generation still grants legitimate kill heals.
  if (!primaryCurrent(context, target, hero) || !sameBattle(context)) return;
  // Life steal uses damage actually removed, excluding overkill and all
  // reflected/splash hits. It cannot revive a dead or recycled hero.
  if (gear.lifeSteal > 0 && hero.hpMax > 0) Runtime.heal(hero, dealt * gear.lifeSteal / hero.hpMax, {silent:(context.heroStyle || hero.heroStyle || data.heroStyle) === "bruiser"});
  if (!sameBattle(context)) return;
  if (hero.heroStyle !== "mystic" && gear.splashDamage > 0 && gear.splashRadius > 0 && context.point) {
    var splash = [], targets = data.getEnemyList ? data.getEnemyList() : data.enemyList || [];
    for (var s = 0; s < targets.length; s++) {
      var neighbor = targets[s], location = position(neighbor);
      if (neighbor === target || !living(neighbor) || !location || !FlightTargeting.heroCanTarget(hero, neighbor)) continue;
      var sx = location.x - context.point.x, sy = location.y - context.point.y;
      if (sx * sx + sy * sy <= gear.splashRadius * gear.splashRadius) splash.push({ enemy:neighbor,node:neighbor.node,generation:generation(neighbor) });
    }
    for (var s = 0; s < splash.length; s++) secondaryHit(splash[s].enemy, damage * gear.splashDamage, context, splash[s].generation, splash[s].node);
  }
  if (!sameBattle(context)) return;
  if (context.critical && Runtime.value(data, 120014) > 0) {
    hero._relicHaste = { data: data, epoch: context.epoch, relicGeneration: context.relicGeneration, heroNode: hero.node, heroGeneration: context.heroGeneration, remaining: 2, round: data.round };
  }
  var pierce = Runtime.value(data, 120024), cleave = Runtime.value(data, 120035), center = context.point, origin = context.origin;
  if ((pierce > 0 || cleave > 0) && center && origin) {
    var enemies = data.getEnemyList ? data.getEnemyList() : data.enemyList || [], pierced = null, cleaved = null;
    var dx = center.x - origin.x, dy = center.y - origin.y, length = Math.sqrt(dx * dx + dy * dy);
    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i], point = position(enemy);
      if (enemy === target || !living(enemy) || !point || !FlightTargeting.heroCanTarget(hero, enemy)) continue;
      var x = point.x - center.x, y = point.y - center.y, distance = x * x + y * y;
      var along = length > 0 ? (x * dx + y * dy) / length : -1;
      var across = length > 0 ? Math.abs(x * dy - y * dx) / length : Infinity;
      if (pierce > 0 && along > 0 && along <= 70 && across <= 12 && (!pierced || along < pierced.distance)) pierced = { enemy: enemy, node: enemy.node, generation: generation(enemy), distance: along };
      if (cleave > 0 && distance <= 100 * 100 && (!cleaved || distance < cleaved.distance)) cleaved = { enemy: enemy, node: enemy.node, generation: generation(enemy), distance: distance };
    }
    if (pierced) secondaryHit(pierced.enemy, context.nonCritical * pierce, context, pierced.generation, pierced.node);
    if (cleaved) secondaryHit(cleaved.enemy, context.nonCritical * cleave, context, cleaved.generation, cleaved.node);
  }
  if (context.echo > 0 && living(target)) secondaryHit(target, context.nonCritical * context.echo, context, context.targetGeneration, context.targetNode);
  primaryHeroPerks(target, hero, context);
}
// Shared primary-hit benefits apply equally to projectiles, melee, beams and
// active skills. Keeping them here prevents missing benefits and duplicate
// wrappers, while secondary relic hits remain excluded.
function primaryHeroPerks(target, hero, context) {
  if (!sameBattle(context) || !primaryCurrent(context, target, hero)) return;
  var data = context.data;
  if (!data || !data.getGameBuff) return;
  var kill = data.getGameBuff(50008), dead = target.isDead ? target.isDead() : target.hp <= 0;
  if (kill && dead && kill.Pamer && kill.Pamer[0] > 0) {
    if (hero.addHpPro) hero.addHpPro(kill.Pamer[0]);
    else Runtime.heal(hero, kill.Pamer[0]);
  }
  if (!sameBattle(context) || !primaryCurrent(context, target, hero) || !living(target)) return;
  var slow = data.getGameBuff(50015), amount = slow && slow.Pamer && slow.Pamer[0];
  if (!(amount > 0) || !target.addBuff) return;
  var buffs = target.debuffInfo || [], previous = null;
  for (var i = 0; i < buffs.length; i++) {
    if (buffs[i]._heroCrippling && buffs[i]._heroCrippling.hero === hero && buffs[i]._heroCrippling.generation === context.heroGeneration) { previous = buffs[i]; break; }
  }
  if (previous) { previous.time = 0; previous.timeMax = 1; previous.data.subNum = amount; }
  else {
    var status = { subNum: amount, time: 1 };
    target.addBuff(require("KinghtFallInterface").KinghtFallEnemyBuffType.MoveSpeed, status);
    if (!sameBattle(context) || !primaryCurrent(context, target, hero) || !living(target)) return;
    buffs = target.debuffInfo || [];
    for (var index = 0; index < buffs.length; index++) if (buffs[index].data === status) {
      buffs[index]._heroCrippling = { hero: hero, generation: context.heroGeneration }; break;
    }
  }
}
function secondaryHit(target, damage, context, targetGeneration, targetNode) {
  if (!sameBattle(context) || !living(target) || target.node !== targetNode || generation(target) !== targetGeneration ||
      !FlightTargeting.heroCanTarget(context.hero, target)) return;
  var received = target.onAttacked(damage, context.hero, true);
  if (sameBattle(context) && target.node === targetNode && generation(target) === targetGeneration) feedback(target, received);
}
function updateHero(hero, dt) {
  var data = current();
  if (!living(hero)) return;
  waveBarrier(data, hero);
  var haste = hero._relicHaste;
  if (haste) {
    if (haste.data !== data || haste.epoch !== (data && data.ctrPar && data.ctrPar._combatEpoch) || haste.relicGeneration !== (data && data._relicGeneration) || haste.heroNode && haste.heroNode !== hero.node || haste.heroGeneration !== generation(hero) || haste.round !== data.round) delete hero._relicHaste;
    else { haste.remaining = Math.max(0, haste.remaining - Math.max(0, dt)); if (haste.remaining < 1e-9) haste.remaining = 0; }
  }
}
function heroHaste(hero) {
  var data = current(), haste = hero && hero._relicHaste;
  return haste && haste.remaining > 0 && haste.data === data && haste.epoch === (data && data.ctrPar && data.ctrPar._combatEpoch) && haste.relicGeneration === (data && data._relicGeneration) && (!haste.heroNode || haste.heroNode === hero.node) && haste.heroGeneration === generation(hero) && haste.round === data.round ? Runtime.value(data, 120014) : 0;
}
function allyIncoming(actor,damage){
  var hero=heroOf(current());
  if(!living(hero)||!hero._styleRuntime||!living(actor))return damage;
  var bonus=hero._styleRuntime.bonus().allyDamageReduction||0,a=position(actor),b=position(hero),radius=Skills.guardianRadius(hero._styleRuntime.state&&hero._styleRuntime.state.tuning,'allyRadius');
  return bonus>0&&a&&b&&Math.hypot(a.x-b.x,a.y-b.y)<=radius?damage*(1-Math.min(.8,bonus)):damage;
}
function tauntedTarget(enemy){
  var record=enemy&&enemy._heroTaunt,data=current();
  if(!record||record.remaining<=0||record.data!==data||record.epoch!==(data&&data.ctrPar&&data.ctrPar._combatEpoch)||record.enemyNode&&record.enemyNode!==enemy.node||record.heroNode&&(!record.hero||record.heroNode!==record.hero.node)||record.enemyGeneration!==generation(enemy)||record.generation!==generation(record.hero)||!living(record.hero))return null;
  return record.hero;
}
var controlClocks = new WeakMap();
function controlRenderers(enemy) {
  var result=[];[enemy.spAni,enemy.spAni2,enemy.spAni3,enemy.spAniUp].forEach(function(renderer){if(renderer&&result.indexOf(renderer)<0)result.push(renderer);});return result;
}
function controlAnimationClock(enemy,factor) {
  var clocks=controlClocks.get(enemy);if(!clocks&&factor===1)return;
  if(!clocks){clocks=[];controlClocks.set(enemy,clocks);}
  var ui=require('KinghtFallUIGame').default.instance,globalSpeed=ui&&ui.speed;
  var global=typeof globalSpeed==='number'&&isFinite(globalSpeed)&&globalSpeed>=0?globalSpeed:null;
  controlRenderers(enemy).forEach(function(renderer){
    if(typeof cc!=='undefined'&&cc.isValid&&!cc.isValid(renderer,true))return;
    var clock=clocks.filter(function(record){return record.renderer===renderer;})[0],current=renderer.timeScale;
    if(!clock){clock={renderer:renderer,base:typeof current==='number'&&isFinite(current)?current:1};clocks.push(clock);}
    if(global!==null)clock.base=global;
    else if(clock.applied!==undefined&&typeof current==='number'&&isFinite(current)&&Math.abs(current-clock.applied)>1e-9)clock.base=current;
    clock.applied=clock.base*factor;renderer.timeScale=clock.applied;
  });
  if(factor===1)controlClocks.delete(enemy);
}
function releaseFrozenControl(enemy) {
  var paused = enemy && enemy._relicPausedRenderers;
  if (!paused) return;
  for (var i = 0; i < paused.length; i++) {
    var renderer = paused[i].renderer;
    if (renderer && (typeof cc === 'undefined' || !cc.isValid || cc.isValid(renderer, true))) renderer.paused = paused[i].wasPaused;
  }
  delete enemy._relicPausedRenderers;
}
function releaseControl(enemy) {
  releaseFrozenControl(enemy);controlAnimationClock(enemy,1);
}
function updateEnemy(enemy, dt) {
  var control = Runtime.controlDelta(enemy, dt);
  // Scale the renderer component once; saved/package playback stays on its
  // tracks. This matches the scheduler's control delta and handles partial
  // expiry without multiplying either the game speed or saved speed twice.
  controlAnimationClock(enemy,dt>0?Math.max(0,control.dt/dt):1);
  if (control.frozen) {
    require('GameToolsOverrides').cancel(enemy);
    if (enemy.rigidBody) enemy.rigidBody.linearVelocity = typeof cc !== 'undefined' ? cc.Vec2.ZERO : { x: 0, y: 0 };
    if (!enemy._relicPausedRenderers) {
      var paused = enemy._relicPausedRenderers = [];
      [enemy.spAni, enemy.spAni2, enemy.spAni3, enemy.spAniUp].forEach(function (renderer) {
        if (!renderer || typeof cc !== 'undefined' && cc.isValid && !cc.isValid(renderer, true) || paused.some(function (entry) { return entry.renderer === renderer; })) return;
        paused.push({ renderer: renderer, wasPaused: !!renderer.paused }); renderer.paused = true;
      });
    }
    return;
  }
  releaseFrozenControl(enemy);
  enemy.onUpdate(control.dt);
}
exports.enemyDamage = enemyDamage;
exports.heroIncoming = heroIncoming;
exports.afterHeroHit = afterHeroHit;
exports.enemyKilled = enemyKilled;
exports.heroAttack = heroAttack;
exports.primaryContext = primaryContext;
exports.previewHeroHit = previewHeroHit;
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
