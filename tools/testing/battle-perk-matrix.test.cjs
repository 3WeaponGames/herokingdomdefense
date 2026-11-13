'use strict';
// Exercise every shipped perk against existing hero/army stats, with inert
// building presentation. Native UI/capture performance is profiled separately.
const test = require('node:test');
const assert = require('node:assert/strict');
const {setup, hero, authored} = require('./backend-gameplay-harness.cjs');

function fixture() {
  const h = setup({Utils: {Utils: {randomRang(min, max) { assert(max > min); return min; }}}}), player = hero(h);
  const soldiers = [90001, 90002, 90003, 90004].map(id => {
    const soldier = h.e.actor('KinghtFallSoldierBase');
    soldier.cfg = {...h.e.cfg, ID: id, AttackType: id === 90003 ? 2 : 1};
    soldier.initBuffData();
    return soldier;
  });
  const upgrades = [], enumBuild = h.e.stubs.KinghtFallEnum.KinghtFallEnumBuildEnum;
  const buildings = ['ArrowTower', 'Barracks', 'ArrowTower'].map((kind, index) => ({
    ID: index + 1, index: index === 2 ? 0 : 1, level: 1,
    buildCfg: {enumValue: enumBuild[kind]}, buildInfo: {cfg: {BranchBuild: [1]}},
    getIsLock: () => true, getLevel() { return this.level; },
    initBuffData() { soldiers.forEach(soldier => soldier.initBuffData()); },
    onBuffUpgrade() { this.index = 1; ++this.level; upgrades.push(this.ID); }
  }));
  h.d.baseBuild = {getLevel: () => 4};
  h.d.buildings = Array.from({length: 4}, () => ({bulidPoint: [1, 2, 3]}));
  h.d.bulidPointMap = Object.fromEntries(buildings.map(building => [building.ID, building]));
  h.d.soldierList = soldiers;
  h.d.setLight = () => {};
  player.initBuffData();
  return {...h, player, soldiers, upgrades};
}

function stats(h) {
  return [h.player, ...h.soldiers].map(actor => ({
    hpMax: actor.hpMax, attackRange: actor.attackRange,
    attack: actor.getAttack(), speed: actor.getAttSpeed()
  }));
}

function verify(h, rows) {
  rows.forEach(row => h.d.addGameBuff(row.enumKey));
  assert.deepEqual(Array.from(h.d.buffList, entry => entry.cfg.ID), rows.map(row => row.ID));
  h.player.initBuffData();
  h.soldiers.forEach(soldier => soldier.initBuffData());
  const expected = stats(h), initialUpgrades = h.upgrades.length;
  expected.forEach(values => Object.entries(values).forEach(([name, value]) => {
    assert(Number.isFinite(value), `${rows.map(row => row.ID)} produces invalid ${name}: ${value}`);
    assert(value >= 0, `${rows.map(row => row.ID)} produces negative ${name}: ${value}`);
  }));
  // Ordinary stat refreshes must not replay acquisition, allocate actors, or
  // compound cached multipliers after the perk modal has closed.
  for (let refresh = 0; refresh < 20; refresh++) {
    h.player.initBuffData();
    h.soldiers.forEach(soldier => soldier.initBuffData());
    assert.deepEqual(stats(h), expected);
  }
  assert.equal(h.upgrades.length, initialUpgrades);
  assert.equal(h.d.soldierList.length, 4);
  assert.equal(h.pending.length, 0);
  assert.equal(h.d.buffList.length, rows.length);
}

for (const row of authored.BuffCfg) test(`battle perk ${row.ID} (${row.enumKey}) remains bounded after acquisition and repeated stat refresh`, () => verify(fixture(), [row]));

for (let start = 0; start < authored.BuffCfg.length; start += 3) {
  const rows = authored.BuffCfg.slice(start, start + 3);
  test(`three-perk batch ${rows.map(row => row.ID).join('/')} preserves finite, stable hero and army stats`, () => verify(fixture(), rows));
}

test('all configured battle perks can coexist without repeated acquisition or compounding refresh costs', () => verify(fixture(), authored.BuffCfg));
