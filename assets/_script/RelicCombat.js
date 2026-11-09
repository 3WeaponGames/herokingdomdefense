'use strict';
// New relics observe actual releases and damage, without changing authored
// animation hit markers or the legacy relic implementations.
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
function enemyDamage(target, damage, source, secondary) {
  if (!(damage > 0) || secondary) return damage;
  var data = current(), bonus = 0;
  if (Runtime.slowed(target, data)) bonus += Runtime.value(data, 120029);
  if (heroSource(source, data) && Runtime.boss(target)) bonus += Runtime.value(data, 120034);
  if (source && source.navigationTeam === 'friendly' && !heroSource(source, data) && target.hp < target.hpMax * .25) bonus += Runtime.value(data, 120045);
  return damage * (1 + bonus);
}
function heroIncoming(hero, damage, source, ranged) {
  if (!(damage > 0)) return damage;
  var data = current(), reduction = 0;
  if (ranged || source && source.cfg && Number(source.cfg.AttackType) === 2) reduction += Runtime.value(data, 120033);
  if (hero._relicMoving) reduction += Runtime.value(data, 120041);
  return damage * (1 - Math.min(.8, reduction));
}
function afterHeroHit(hero, damage, source) {
  var data = current(), ratio = Runtime.value(data, 120040);
  if (!(damage > 0 && ratio > 0) || !source || !source.cfg || Number(source.cfg.AttackType) !== 2 || !living(source)) return;
  var reflected = damage * ratio;
  relicSound("mirror-reflect", hero);
  source.onAttacked(reflected, hero, true);
  feedback(source, reflected);
}
function enemyKilled(target, source, secondary) {
  var data = current(), fraction = Runtime.value(data, 120042);
  if (!(fraction > 0) || secondary || !heroSource(source, data) || !living(source)) return;
  var state = Runtime.state(data), key = String(data.round);
  var used = state.vampireHealedByWave || (state.vampireHealedByWave = {});
  var remaining = Math.max(0, .1 - (Number(used[key]) || 0));
  if (!(remaining > 0)) return;
  var before = source.hp;
  Runtime.heal(source, Math.min(fraction, remaining));
  var actual = Math.max(0, source.hp - before) / source.hpMax;
  if (actual > 0) {
    used[key] = Math.min(.1, (Number(used[key]) || 0) + actual);
    relicSound("life-steal", source);
  }
}
function heroAttack(hero, primary, damage) {
  var data = current(), ratio = Runtime.value(data, 120030);
  if (!(ratio > 0 && damage > 0) || !living(primary) || !living(hero)) return;
  var state = Runtime.state(data);
  state.heroAttackCount = (Number(state.heroAttackCount) || 0) + 1;
  if (state.heroAttackCount % 8) return;
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
exports.updateEnemy = updateEnemy;
exports.releaseControl = releaseControl;

function relicSound(id, actor) {
  if (typeof cc === "undefined" || !cc.resources) return;
  var sound = require("BattleSounds");
  if (sound.effect) sound.effect(id, actor);
}
