"use strict";

// Transient battle state only. This module never reads or writes player saves.
// All percentages below are fractions, and charge meters use the range 0..1.
var DEFAULTS = {
  common: { cooldown: 12 },
  skirmisher: { cooldown: 12, chargeRate: .25, chargedDamage: .5, windup: .35, projectileSpeed: 1000, distanceDamagePer100: .1, projectileWidth: 28 },
  fighter: { cooldown: 12, maxStacks: 5, stackDuration: 5, stackDamage: .03, stackReduction: .025, stackTenacity: .08, buffDuration: 10, buffDamage: .25, buffAttackRate: .35, knockback: 140 },
  vanguard: { cooldown: 14, chargeRate: .2, chargeDecay: .15, buffDuration: 10, momentumMove: 1, momentumAttackRate: .35, duration: 2.5, strikes: 7, strikeDamage: .5, moveScaling: .25, attackScaling: .25, referenceMove: 300 },
  mystic: { cooldown: 12, maxCharges: 10, chargeDamage: .15, activeDamage: 1.5, slow: .2, slowDuration: 1.5 },
  bruiser: { cooldown: 12, missingDamage: .5, missingAttackRate: .75, sacrifice: .5 },
  guardian: { cooldown: 16, allyReduction: .1, shieldHealth: .25, shieldDuration: 5, tauntDuration: 3 }
};
function finite(value, fallback) { return typeof value === "number" && isFinite(value) ? value : fallback; }
function positive(value, fallback) { return Math.max(0, finite(value, fallback || 0)); }
function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
function missing(context) {
  context = context || {};
  var max = positive(context.maxHp, 0);
  return max > 0 ? 1 - clamp(finite(context.hp, max), 0, max) / max : 0;
}
function settings(style, overrides) {
  var result = Object.assign({}, DEFAULTS.common, DEFAULTS[style]);
  Object.keys(overrides || {}).forEach(function (key) {
    if (typeof result[key] === "number") result[key] = positive(overrides[key], result[key]);
  });
  return result;
}
function direction(value) {
  value = value || {};
  var x = finite(value.x, 1), y = finite(value.y, 0), length = Math.sqrt(x * x + y * y);
  return length > 0 ? { x: x / length, y: y / length } : { x: 1, y: 0 };
}
function createState(style, overrides) {
  style = DEFAULTS[style] && style !== "common" ? style : "skirmisher";
  return { style: style, tuning: settings(style, overrides), time: 0, charge: 0,
    buffRemaining: 0, buffStrength: 0, stacks: 0, stackRemaining: 0,
    target: null, marked: false, mysticCharges: 0, cooldown: 0,
    active: null, lastStrikeId: null, shield: 0, shieldRemaining: 0 };
}
function setTarget(state, target) {
  target = target === undefined ? null : target;
  if (state.target === target) return false;
  state.target = target;
  if (state.style === "mystic") { state.marked = false; state.mysticCharges = 0; }
  return true;
}
function clearTarget(state) { setTarget(state, null); }
function cancelActive(state) { state.active = null; }
function bonuses(state, context) {
  var t = state.tuning, result = { damage: 0, attackRate: 0, move: 0, damageReduction: 0, tenacity: 0, allyDamageReduction: 0 };
  if (state.style === "bruiser") {
    var amount = missing(context); result.damage = amount * t.missingDamage; result.attackRate = amount * t.missingAttackRate;
  } else if (state.style === "fighter") {
    var stacks = state.stackRemaining > 0 ? state.stacks : 0;
    result.damage = stacks * t.stackDamage; result.damageReduction = stacks * t.stackReduction;
    result.tenacity = clamp(stacks * t.stackTenacity, 0, .8);
    if (state.buffRemaining > 0) { result.damage += t.buffDamage; result.attackRate += t.buffAttackRate; }
  } else if (state.style === "vanguard") {
    var momentum = state.buffRemaining > 0 ? state.buffStrength : state.charge;
    result.move = momentum * t.momentumMove;
    if (state.buffRemaining > 0) result.attackRate = state.buffStrength * t.momentumAttackRate;
  } else if (state.style === "guardian") result.allyDamageReduction = t.allyReduction;
  result.damageReduction = clamp(result.damageReduction, 0, .8);
  return result;
}
function onBasicFire(state) {
  var amount = state.style === "skirmisher" ? state.charge : 0;
  if (state.style === "skirmisher") state.charge = 0;
  return { charge: amount, damageMultiplier: 1 + amount * positive(state.tuning.chargedDamage) };
}
function onHit(state, target, options) {
  options = options || {};
  var result = { charge: 0, damageMultiplier: 1, slow: 0, slowDuration: 0, marked: false };
  if (options.hit === false || options.targetAlive === false) return result;
  if (options.strikeId !== undefined && options.strikeId !== null) {
    if (state.lastStrikeId === options.strikeId) return result;
    state.lastStrikeId = options.strikeId;
  }
  var t = state.tuning;
  if (state.style === "vanguard" && state.buffRemaining <= 0 && state.charge > 0) {
    result.charge = state.charge;
    // The first landed hit locks this amount. Later hits cannot recharge,
    // strengthen or refresh the same ten-second momentum window.
    state.buffStrength = state.charge; state.buffRemaining = t.buffDuration;
  } else if (state.style === "fighter" && options.melee !== false) {
    state.stacks = Math.min(Math.max(1, Math.floor(t.maxStacks)), state.stacks + 1); state.stackRemaining = t.stackDuration;
  } else if (state.style === "mystic" && options.kind !== "skill" && target !== null && target !== undefined) {
    setTarget(state, target); state.marked = true;
    state.mysticCharges = Math.min(Math.max(1, Math.floor(t.maxCharges)), state.mysticCharges + 1);
    result.slow = t.slow; result.slowDuration = t.slowDuration; result.marked = true;
  }
  return result;
}
function canActivate(state, context) {
  context = context || {};
  if (state.cooldown > 1e-9 || state.active || context.alive === false || context.hp !== undefined && !(context.hp > 0)) return false;
  if (state.style === "mystic") {
    if (!state.marked || state.target === null || context.targetAlive === false) return false;
    if (Object.prototype.hasOwnProperty.call(context, "target") && context.target !== state.target) return false;
  }
  return true;
}
function vanguardMultiplier(state, context) {
  context = context || {};
  var t = state.tuning, move = positive(context.moveSpeed, t.referenceMove), rate = positive(context.attackRate, 1);
  return t.strikeDamage * (1 + (t.referenceMove > 0 ? move / t.referenceMove : 0) * t.moveScaling + rate * t.attackScaling);
}
function beginActive(state, context) {
  context = context || {};
  if (!canActivate(state, context)) return { ok: false, reason: state.active ? "active" : state.cooldown > 1e-9 ? "cooldown" : "target" };
  var t = state.tuning, result = { ok: true, style: state.style, hpCost: 0, damageMultiplier: 1, direction: direction(context.direction) };
  state.cooldown = t.cooldown;
  if (state.style === "skirmisher") {
    state.active = { kind: "skirmisher-arrow", elapsed: 0, duration: t.windup, emitted: 0, direction: result.direction, context: Object.assign({}, context) };
    result.windup = t.windup;
  } else if (state.style === "vanguard") {
    var count = Math.max(1, Math.floor(t.strikes));
    state.active = { kind: "vanguard-thrust", elapsed: 0, duration: Math.max(.001, t.duration), count: count, emitted: 0, direction: result.direction, context: Object.assign({}, context) };
    result.duration = state.active.duration; result.strikes = count; result.interval = state.active.duration / count;
    result.damageMultiplier = vanguardMultiplier(state, context);
  } else if (state.style === "fighter") {
    state.buffRemaining = t.buffDuration; result.buffDuration = t.buffDuration; result.knockback = t.knockback;
  } else if (state.style === "bruiser") {
    var hp = positive(context.hp), after = hp * (1 - clamp(t.sacrifice, 0, 1));
    result.hpCost = hp - after; result.hpAfterCost = after;
    result.damageMultiplier = 1 + missing({ hp: after, maxHp: context.maxHp });
  } else if (state.style === "mystic") {
    result.target = state.target; result.charges = state.mysticCharges;
    result.damageMultiplier = (t.activeDamage + state.mysticCharges * t.chargeDamage) * (1 + positive(context.splashDamage));
    state.mysticCharges = 0;
  } else if (state.style === "guardian") {
    state.shield = positive(context.maxHp) * t.shieldHealth; state.shieldRemaining = t.shieldDuration;
    result.shieldAmount = state.shield; result.shieldDuration = t.shieldDuration; result.tauntDuration = t.tauntDuration;
  }
  // Rendering supplies the chosen clip's authored hit marker in gameplay
  // seconds. The pure rules engine does not invent or rewrite asset timings.
  var impactDelay = positive(context.impactDelay);
  if (impactDelay > 0 && /^(fighter|bruiser|mystic)$/.test(state.style)) {
    result.impactDelay = impactDelay;
    state.active = { kind: state.style + "-impact", elapsed: 0, duration: impactDelay,
      emitted: 0, direction: result.direction, context: Object.assign({}, context), cast: result };
  }
  return result;
}
function advance(state, dt, context) {
  state.time += dt; state.cooldown = Math.max(0, state.cooldown - dt);
  var previousBuff = state.buffRemaining;
  state.buffRemaining = Math.max(0, state.buffRemaining - dt);
  if (state.style === "vanguard" && state.buffRemaining < 1e-9) state.buffRemaining = 0;
  if (!state.buffRemaining) state.buffStrength = 0;
  state.stackRemaining = Math.max(0, state.stackRemaining - dt);
  if (!state.stackRemaining) state.stacks = 0;
  state.shieldRemaining = Math.max(0, state.shieldRemaining - dt);
  if (!state.shieldRemaining) state.shield = 0;
  var t = state.tuning;
  if (state.style === "skirmisher") state.charge = context.moving ? 0 : clamp(state.charge + dt * t.chargeRate, 0, 1);
  if (state.style === "vanguard") {
    if (state.buffRemaining > 0) state.charge = state.buffStrength;
    else {
      // Only the portion after expiry can build a fresh charge, so long and
      // short frames produce the same next momentum cycle.
      var chargeTime = previousBuff > 0 ? Math.max(0, dt - previousBuff) : dt;
      if (previousBuff > 0) state.charge = 0;
      state.charge = clamp(state.charge + chargeTime * (context.moving ? t.chargeRate : -t.chargeDecay), 0, 1);
    }
  }
}
function step(state, dt, context) {
  context = context || {}; dt = positive(dt);
  if (Object.prototype.hasOwnProperty.call(context, "target")) setTarget(state, context.target);
  if (context.targetAlive === false && state.style === "mystic") clearTarget(state);
  if (context.alive === false) { cancelActive(state); clearTarget(state); state.charge = 0; return []; }
  var events = [], remaining = dt, guard = 0;
  // Segment at impact times so long frames produce exactly the same charge and
  // event schedule as short frames; no rendered-frame-dependent extra hits.
  do {
    var active = state.active;
    if (!active) { advance(state, remaining, context); break; }
    var at = active.kind === "vanguard-thrust" ? active.duration * (active.emitted + 1) / active.count : active.duration;
    var wait = Math.max(0, at - active.elapsed);
    if (wait > remaining + 1e-9) { advance(state, remaining, context); active.elapsed += remaining; break; }
    advance(state, wait, context); active.elapsed = at; remaining = Math.max(0, remaining - wait);
    var event = { type: active.kind, index: active.emitted + 1, time: state.time, elapsed: at,
      direction: { x: active.direction.x, y: active.direction.y }, context: active.context };
    active.emitted++;
    if (active.kind === "skirmisher-arrow") {
      var fire = onBasicFire(state); event.charge = fire.charge; event.damageMultiplier = fire.damageMultiplier;
      event.speed = state.tuning.projectileSpeed; event.width = state.tuning.projectileWidth;
      event.distanceDamagePer100 = state.tuning.distanceDamagePer100; state.active = null;
    } else if (active.kind === "vanguard-thrust") {
      event.count = active.count; event.damageMultiplier = vanguardMultiplier(state, Object.assign({}, active.context, context));
      if (active.emitted >= active.count) state.active = null;
    } else {
      event.cast = active.cast; state.active = null;
    }
    events.push(event);
  } while (remaining > 1e-9 && ++guard < 1000);
  return events;
}
function absorbDamage(state, amount) {
  amount = positive(amount); var absorbed = Math.min(state.shield, amount);
  state.shield -= absorbed; return { damage: amount - absorbed, absorbed: absorbed };
}
function projectileMultiplier(state, distance, baseMultiplier) {
  return positive(baseMultiplier, 1) * (1 + positive(distance) / 100 * positive(state.tuning.distanceDamagePer100));
}
exports.DEFAULTS = DEFAULTS; exports.createState = createState; exports.step = step;
exports.bonuses = bonuses; exports.onBasicFire = onBasicFire; exports.onHit = onHit;
exports.setTarget = setTarget; exports.clearTarget = clearTarget; exports.canActivate = canActivate;
exports.beginActive = beginActive; exports.cancelActive = cancelActive; exports.absorbDamage = absorbDamage;
exports.projectileMultiplier = projectileMultiplier; exports.vanguardMultiplier = vanguardMultiplier;
