'use strict';

// A base-stat comparison, not a combat simulator. Recipients are other eligible
// units already in range; healing utilization accounts for wasted healing.
// AttackInterval is the game's nominal attacks/casts per second.
const CombatPower = require('../../assets/_script/CombatPower');
const DEFAULTS = CombatPower.DEFAULTS;

const finite = value => typeof value === 'number' && Number.isFinite(value);
const nonnegative = value => finite(value) && value >= 0;
const count = value => Number.isSafeInteger(value) && value >= 0;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const raw = (data, index) => Array.isArray(data) && finite(data[index]) ? data[index] : null;

function describe(unit) {
  const record = unit && typeof unit === 'object' ? unit : {};
  const source = record.BehaviorTemplate !== undefined ? record.BehaviorTemplate :
    record.CampaignBaseUnit !== undefined ? record.CampaignBaseUnit : record.ID;
  const behavior = Number(source);
  const data = record.Data;
  let kind = 'direct', parameters = {};
  if (record.side !== 'ally') {
    if (behavior === 90006) {
      kind = 'buffer';
      parameters = { bonus: raw(data, 0), duration: raw(data, 1), radius: raw(data, 2), cap: raw(data, 3) };
    } else if (behavior === 90009) {
      kind = 'healer';
      parameters = { healFraction: raw(data, 0), radius: raw(data, 1), cap: raw(data, 2) };
    } else if (behavior === 90007) {
      kind = 'splash';
      parameters = { splashDamage: raw(data, 0), radius: raw(data, 1), cap: raw(data, 2) };
    } else if (behavior === 90012) {
      kind = 'debuff';
      parameters = {
        spellType: raw(data, 0), spellInterval: raw(data, 1), reduction: raw(data, 2),
        radius: raw(data, 3), cap: raw(data, 4), duration: raw(data, 5)
      };
    } else if (behavior === 90010 || behavior === 90011) {
      parameters = { transformInterval: raw(data, 1), nextFormId: raw(data, 2) };
    }
  }
  return { behavior: finite(behavior) ? behavior : null, kind, parameters };
}

function validateAssumptions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { reason: 'Assumptions must be an object.' };
  const values = {};
  for (const key of Object.keys(DEFAULTS)) values[key] = own(input, key) ? input[key] : DEFAULTS[key];
  for (const key of ['referenceHp', 'referenceDps']) {
    if (!nonnegative(values[key])) return { reason: key + ' must be a finite nonnegative number.' };
  }
  for (const key of ['nearbyAllies', 'nearbyOpponents', 'splashTargets']) {
    if (!count(values[key])) return { reason: key + ' must be a nonnegative whole number.' };
  }
  for (const key of ['healingUtilization', 'heroHealingUtilization']) if (!nonnegative(values[key]) || values[key] > 1) return { reason: key + ' must be between zero and one.' };
  return { values };
}

function parameterProblem(kind, parameters) {
  if (kind === 'direct') return null;
  for (const [name, value] of Object.entries(parameters)) {
    if (!nonnegative(value)) return 'Missing or invalid ability parameter: ' + name + '.';
  }
  if (!count(parameters.cap)) return 'Ability target cap must be a nonnegative whole number.';
  if (kind === 'debuff' && parameters.spellType !== 2) return 'Unsupported boss spell behavior.';
  if (kind === 'debuff' && parameters.spellInterval <= 0) return 'Spell interval must be greater than zero.';
  return null;
}

// Repeated DamageCut buffs stack, then outgoing damage is clamped at zero.
// For a periodic caster, stacks alternate between floor(duration/interval)
// and that count plus one. Clamping the mean instead is wrong near saturation.
function averageReduction(reduction, duration, interval) {
  if (reduction === 0 || duration === 0) return 0;
  const stacks = duration / interval;
  if (!finite(stacks)) return null;
  const whole = Math.floor(stacks), fraction = stacks - whole;
  return (1 - fraction) * Math.min(1, whole * reduction) +
    fraction * Math.min(1, (whole + 1) * reduction);
}

function product(factors) {
  // A legitimate zero contribution remains zero even with very large settings.
  if (factors.includes(0)) return 0;
  return factors.reduce((value, factor) => value * factor, 1);
}

function calculate(unit, assumptions = DEFAULTS) {
  const metadata = describe(unit);
  const unavailable = reason => ({
    directDps: null, healingHps: null, buffDps: null, splashDps: null,
    preventedDps: null, effectiveOutput: null, cp: null,
    ...metadata, reason
  });
  const scenario = validateAssumptions(assumptions);
  if (scenario.reason) return unavailable(scenario.reason);
  if (!unit || typeof unit !== 'object' || Array.isArray(unit)) return unavailable('Unit must be an object.');
  if (!finite(unit.Health) || unit.Health <= 0) return unavailable('Base HP must be a finite number greater than zero.');
  if (!finite(unit.AttackInterval) || unit.AttackInterval <= 0) return unavailable('Base attack rate must be a finite number greater than zero.');
  const { kind, parameters: p } = metadata;
  const problem = parameterProblem(kind, p);
  if (problem) return unavailable(problem);
  const support = kind === 'buffer' || kind === 'healer';
  if (!support && !nonnegative(unit.AttackDamage)) return unavailable('Missing or invalid direct attack damage.');
  if (unit.side !== 'ally' && Number(unit.AttackType) === 3 && !support) return unavailable('Unsupported support behavior.');
  const a = scenario.values, rate = unit.AttackInterval;
  const output = {
    directDps: support ? 0 : unit.AttackDamage * rate,
    healingHps: 0, buffDps: 0, splashDps: 0, preventedDps: 0,
    effectiveOutput: null, cp: null, ...metadata, reason: null
  };
  if (kind === 'buffer') {
    const recipients = p.radius === 0 ? 0 : Math.min(p.cap, a.nearbyAllies);
    output.buffDps = product([a.referenceDps, p.bonus, p.duration, rate, recipients]);
  } else if (kind === 'healer') {
    const recipients = p.radius === 0 ? 0 : Math.min(p.cap, a.nearbyAllies);
    output.healingHps = product([a.referenceHp, Math.min(1, p.healFraction), rate, recipients, a.healingUtilization]);
  } else if (kind === 'splash') {
    // splashTargets counts secondary targets only; directDps owns the primary.
    output.splashDps = product([p.splashDamage, rate, Math.min(p.cap, a.splashTargets)]);
  } else if (kind === 'debuff') {
    const reduction = averageReduction(p.reduction, p.duration, p.spellInterval);
    if (reduction === null) return unavailable('Ability duration divided by interval exceeds the finite number range.');
    output.preventedDps = product([a.referenceDps, reduction, Math.min(p.cap, a.nearbyOpponents)]);
  }
  const shared = CombatPower.calculate({ health: unit.Health, ...output });
  if (shared.reason) return unavailable(shared.reason);
  output.effectiveOutput = shared.effectiveOutput;
  output.cp = shared.cp;
  return output;
}

module.exports = { DEFAULTS, describe, calculate };
