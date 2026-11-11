'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, describe, calculate } = require('./unit-combat-power.cjs');

const direct = (overrides = {}) => ({ ID: 90001, AttackType: 1, Health: 40, AttackDamage: 10, AttackInterval: 1, ...overrides });
const buffer = (overrides = {}) => ({ ID: 90006, AttackType: 3, Health: 100, AttackInterval: .2, Data: [1.2, 3, 200, 15], ...overrides });
const healer = (overrides = {}) => ({ ID: 90009, AttackType: 3, Health: 300, AttackInterval: .3, Data: [.5, 300, 10], ...overrides });
const splash = (overrides = {}) => direct({ ID: 90007, Health: 500, AttackDamage: 20, Data: [20, 200, 5], ...overrides });
const debuff = (overrides = {}) => direct({ ID: 90012, Health: 500, AttackDamage: 75, AttackInterval: 1.2, Data: [2, 5, .5, 300, 10, 5], ...overrides });
const close = (actual, expected) => assert(Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-10, `${actual} != ${expected}`);

test('direct CP retains the original geometric score and allied units use their own base records', () => {
  const result = calculate(direct());
  assert.equal(result.kind, 'direct'); assert.equal(result.directDps, 10); assert.equal(result.cp, 20);
  assert.equal(result.effectiveOutput, 10); assert.equal(result.reason, null);
  assert.equal(calculate(direct({ side: 'ally', Health: 60, AttackDamage: 15, AttackInterval: .67 })).directDps, 10.05);
  assert.equal(calculate(direct({ ID: 90005, AttackDamage: 50, AttackInterval: .2, Name: 'Poison model' })).effectiveOutput, 10, 'visual names do not invent poison');
});

test('buff scoring uses other recipients, additive attack-speed stacks and authored duration/cast rate', () => {
  const source = buffer(), snapshot = JSON.stringify(source), result = calculate(source);
  assert.equal(result.kind, 'buffer'); assert.equal(result.directDps, 0); close(result.buffDps, 21.6); close(result.cp, Math.sqrt(2160));
  close(calculate(buffer({ Data: [1.2, 10, 200, 15] })).buffDps, 72, 'repeat casts can overlap');
  close(calculate(source, { nearbyAllies: 100 }).buffDps, 108);
  assert.equal(calculate(source, { nearbyAllies: 0 }).cp, 0, 'caster cannot buff itself');
  assert.equal(calculate(buffer({ AttackDamage: 999 })).directDps, 0, 'support controller does not perform a direct attack');
  assert.equal(calculate(buffer({ Data: [1.2, 3, 0, 15] })).buffDps, 0, 'strict radius zero reaches no other recipient');
  assert.equal(JSON.stringify(source), snapshot);
});

test('healers score recipient max HP, nearest-target cap and useful healing rather than their own HP or missing damage', () => {
  const result = calculate(healer());
  assert.equal(result.kind, 'healer'); assert.equal(result.directDps, 0); close(result.healingHps, 18); close(result.cp, Math.sqrt(5400));
  close(calculate(healer(), { healingUtilization: .5 }).healingHps, 9);
  close(calculate(healer(), { nearbyAllies: 50 }).healingHps, 60);
  close(calculate(healer({ Health: 900 })).healingHps, 18, 'recipient HP is independent of caster HP');
  close(calculate(healer({ Data: [2, 300, 10] })).healingHps, 36, 'healing cannot exceed recipient max HP per pulse');
  assert.equal(calculate(healer(), { nearbyAllies: 0 }).cp, 0, 'healing excludes its caster');
  assert.equal(calculate(healer(), { healingUtilization: 0 }).cp, 0);
});

test('splash counts secondary recipients separately from the primary hit and respects the target cap', () => {
  const result = calculate(splash());
  assert.equal(result.directDps, 20); assert.equal(result.splashDps, 40); assert.equal(result.effectiveOutput, 60); close(result.cp, Math.sqrt(30000));
  assert.equal(calculate(splash(), { splashTargets: 0 }).effectiveOutput, 20);
  assert.equal(calculate(splash(), { splashTargets: 50 }).splashDps, 100);
  assert.equal(calculate(splash({ AttackDamage: 200 })).splashDps, 40, 'authored fixed splash does not scale with direct damage');
});

test('debuffs score prevented DPS with their spell interval and exact clamped overlapping-stack average', () => {
  const result = calculate(debuff());
  assert.equal(result.directDps, 90); assert.equal(result.preventedDps, 15); assert.equal(result.effectiveOutput, 105); close(result.cp, Math.sqrt(52500));
  assert.equal(calculate(debuff(), { nearbyOpponents: 0 }).preventedDps, 0);
  assert.equal(calculate(debuff(), { nearbyOpponents: 99 }).preventedDps, 50);
  const fractional = calculate(debuff({ Data: [2, 5, .75, 300, 10, 7.5] }));
  close(fractional.preventedDps, 26.25, 'half the time has one 75% cut, half has two capped at 100%');
  assert.equal(calculate(debuff({ Data: [2, 5, .75, 300, 10, 50] })).preventedDps, 30);
  assert.equal(calculate(debuff({ Data: [2, 5, .5, 300, 10, 0] })).preventedDps, 0);
});

test('describe exposes raw parameters and inherited behavior without inventing shields, transforms or special abilities', () => {
  const unit = healer({ ID: 100000, BehaviorTemplate: 90009 });
  assert.deepEqual(describe(unit), { behavior: 90009, kind: 'healer', parameters: { healFraction: .5, radius: 300, cap: 10 } });
  assert.equal(calculate(unit).healingHps, 18);
  assert.equal(describe(direct({ ID: 92001, CampaignBaseUnit: 90007, Data: [20, 200, 5] })).kind, 'splash');
  const phase = describe(direct({ ID: 90010, Data: [1, 10, 90011] }));
  assert.deepEqual(phase.parameters, { transformInterval: 10, nextFormId: 90011 }); assert.equal(phase.kind, 'direct');
  assert.equal(calculate(direct({ ID: 90010, Data: [1, 10, 90011] })).cp, 20, 'future phases do not become an invented HP bonus');
});

test('zero contributions remain valid while malformed source stats and missing required abilities stay unavailable', () => {
  assert.equal(calculate(direct({ AttackDamage: 0 })).cp, 0);
  for (const source of [direct({ AttackDamage: undefined }), direct({ Health: 0 }), direct({ AttackInterval: 0 }), direct({ AttackDamage: -1 }), buffer({ Data: undefined }), healer({ Data: [.5, 300, -1] }), debuff({ Data: [2, 0, .5, 300, 10, 5] }), direct({ ID: 100001, AttackType: 3 })]) {
    const result = calculate(source); assert.equal(result.cp, null); assert.equal(result.effectiveOutput, null); assert(result.reason);
  }
  assert.equal(calculate(direct({ AttackDamage: Number.MAX_VALUE, AttackInterval: 2 })).cp, null);
  assert.equal(calculate(buffer({ Data: [Number.MAX_VALUE, 3, 200, 15] }), { referenceDps: 0 }).cp, 0);
});

test('assumption validation preserves supported zeros, rejects unsafe counts and never mutates shared defaults or caller inputs', () => {
  const assumptions = { referenceHp: 0, referenceDps: 0, nearbyAllies: 0, nearbyOpponents: 0, splashTargets: 0, healingUtilization: 0 }, snapshot = JSON.stringify(assumptions), defaults = JSON.stringify(DEFAULTS);
  assert.equal(calculate(healer(), assumptions).cp, 0); assert.equal(calculate(buffer(), assumptions).cp, 0);
  for (const invalid of [{ nearbyAllies: .5 }, { nearbyOpponents: -1 }, { splashTargets: Number.MAX_SAFE_INTEGER + 1 }, { referenceHp: NaN }, { referenceDps: Infinity }, { healingUtilization: 1.01 }, { healingUtilization: -1 }, null]) {
    const result = calculate(direct(), invalid); assert.equal(result.cp, null); assert(result.reason);
  }
  assert.equal(JSON.stringify(assumptions), snapshot); assert.equal(JSON.stringify(DEFAULTS), defaults); assert(Object.isFrozen(DEFAULTS));
});
