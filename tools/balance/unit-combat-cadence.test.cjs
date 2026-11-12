'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const Units = require('./unit-combat-power.cjs'), Profile = require('../../packages/game-data-editor/lib/attack-profile');
const Config = require('../../assets/KinghtFallConfig/GameJsonCfg.json'), Levels = require('../../assets/_script/UnitLevelStats');
const close = (a, b) => assert(Math.abs(a - b) <= Math.max(1, Math.abs(b)) * 1e-10, `${a} != ${b}`);
function unit(overrides = {}) { return { ID: 90001, side: 'enemy', AttackType: 1, Health: 40, AttackDamage: 10, AttackInterval: 1, ...overrides }; }
function context(record, { duration = 1, hit = .5, speed = 1, relative, level = 0 } = {}) {
  const type = record.side || 'enemy', key = `${type}:${record.ID}:default`;
  const settings = { timingDefaults: { [key]: { attack: hit } }, animationSpeeds: { [key]: speed } };
  const descriptor = Profile.describe({ type, id: record.ID, key, attackDuration: duration, ...(relative === undefined ? {} : { unitAnimationSpeed: relative }) }, settings, { type, id: record.ID, level, record });
  return { settings, descriptor };
}

test('actual unit CP uses release windup and clip completion for the shipped controller policies', () => {
  const melee = unit(), ranged = unit({ ID: 90003, AttackType: 2 }), support = unit({ ID: 90006, AttackType: 3, AttackInterval: 10, Data: [1.2, 3, 200, 15] });
  close(Units.calculate(melee, undefined, context(melee)).effectiveAttackRate, 1 / 1.5);
  close(Units.calculate(melee, undefined, context(melee, { duration: 4 })).effectiveAttackRate, .25);
  close(Units.calculate(ranged, undefined, context(ranged, { duration: 2 })).effectiveAttackRate, .5);
  const cast = Units.calculate(support, undefined, context(support, { duration: 9 }));
  close(cast.effectiveAttackRate, 1 / .6); close(cast.buffDps, 10 * 1.2 * 3 * 3 / .6);
  assert.equal(Units.calculate(melee).effectiveAttackRate, 1, 'old callers without source metadata retain their previous nominal score');
});

test('whole-unit zero freezes direct, healing, buff and splash releases but not the boss independent spell timer', () => {
  const sources = [unit(), unit({ ID: 90006, AttackType: 3, Data: [1.2, 3, 200, 15] }), unit({ ID: 90009, AttackType: 3, Data: [.5, 300, 10] }), unit({ ID: 90007, Data: [20, 200, 5] })];
  for (const source of sources) {
    const result = Units.calculate(source, undefined, context(source, { relative: 0 }));
    assert.equal(result.cp, 0); assert.equal(result.effectiveAttackRate, 0); assert.equal(result.attackTiming.frozen, true);
  }
  const boss = unit({ ID: 90012, Health: 500, AttackDamage: 75, AttackInterval: 1.2, Data: [2, 5, .5, 300, 10, 5] });
  const frozen = Units.calculate(boss, undefined, context(boss, { relative: 0 }));
  assert.equal(frozen.directDps, 0); assert.equal(frozen.preventedDps, 15); close(frozen.cp, Math.sqrt(500 * 15));
});

test('actual release rates update from edited cooldown/stage stats without mutating timing settings', () => {
  const source = unit(), timing = context(source, { speed: .37 }), before = JSON.stringify(timing);
  const first = Units.calculate(source, undefined, timing), staged = Units.calculate({ ...source, Health: 120, AttackDamage: 40, AttackInterval: 2 }, undefined, timing);
  close(first.effectiveAttackRate, 1 / Math.max(1 / .37, .5 / .37 + 1));
  close(staged.effectiveAttackRate, 1 / Math.max(1 / .37, .5 / .37 + .5));
  close(staged.cp, Math.sqrt(120 * 40 * staged.effectiveAttackRate));
  assert.equal(JSON.stringify(timing), before); assert.equal(source.AttackInterval, 1);
  for (const invalid of [null, {}, { descriptor: null }]) assert.equal(Units.calculate(source, undefined, invalid).cp, null);
});

test('real controller timer anchors and completion gates agree with CP policies', () => {
  const { environment } = require('../navigation/runtime-harness.cjs');
  for (const [type, ids] of [['enemy', [90001, 90002, 90003, 90004, 90005, 90006, 90007, 90008, 90009, 90010]], ['ally', [90001, 90002, 90003, 90004]]]) for (const id of ids) {
    const e = environment(); let starts = 0;
    e.stubs.GameToolsOverrides = { isPending: () => false, attack() { starts++; } };
    const name = 'KinghtFall' + (type === 'ally' ? 'Soldier' : 'Enemy') + 'Item' + String(id - 90000).padStart(2, '0');
    const actor = e.actor(name); actor.cfg = { ...e.cfg, ID: id }; actor.time.Attack = 123;
    const policy = Profile.describe({}, {}, { type, id, record: actor.cfg }).cooldownStart;
    actor.doAttackStart(); assert.equal(starts, 1, name); assert.equal(actor.time.Attack, policy === 'start' ? 0 : -1, name);
    if (id === 90010) continue;
    starts = 0; actor.time.Attack = 1; actor.state = 2; actor.bornInfo = { nodeIndex: 1, pathList: [] }; actor.onUpdate(0);
    assert.equal(starts, policy === 'hit-unblocked' ? 1 : 0, name + ' clip completion gate');
  }
});

test('maintained roster export covers every unit, respects first ally level metadata and exports actual level stats without source writes', () => {
  const root = path.resolve(__dirname, '../..'), files = ['assets/KinghtFallConfig/GameJsonCfg.json', 'assets/resources/characters/catalog.json'];
  const before = files.map(file => fs.readFileSync(path.join(root, file)));
  const roster = require('./unit-combat-power-roster.cjs').collect(root, { allyLevels: true });
  const base = roster.rows.filter(row => !row.level);
  assert.equal(base.filter(row => row.side === 'enemy').length, Object.keys(Config.SoldierCfg).length);
  assert.equal(base.filter(row => row.side === 'ally').length, 4);
  for (const row of roster.rows) {
    assert(Number.isFinite(row.power.cp)); assert.equal(row.power.reason, null); assert.equal(row.timing.key, row.key);
    if (row.side === 'ally') assert.equal(row.descriptor.level, row.sourceLevel);
    if (row.side === 'ally' && row.level) {
      const stats = Levels.resolve(Config.AllyCfg[row.id], Config.GameTools, row.level);
      assert.equal(row.stats.Health, stats.Health); assert.equal(row.stats.AttackDamage, stats.AttackDamage); assert.equal(row.stats.AttackInterval, stats.AttackInterval);
    }
  }
  close(base.find(row => row.side === 'enemy' && row.id === 90001).power.cp, Math.sqrt(40 * 10 / 1.5));
  assert.equal(base.find(row => row.side === 'enemy' && row.id === 94001).timing.modelAnimationSpeed, .25);
  files.forEach((file, index) => assert(before[index].equals(fs.readFileSync(path.join(root, file))), file));
});
