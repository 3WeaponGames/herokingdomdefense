'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { environment, Node, PhysicsPolygonCollider, installIntersection, map01GateEnvironment } = require('./runtime-harness.cjs');

function enemy(e, name = 'KinghtFallEnemyItem02') {
  const unit = e.actor(name, -100, 0);
  delete unit.getFind;
  unit.cfg = { ...unit.cfg, AttackRange: 20, SearchRange: 180 };
  unit.bornInfo = { nodeIndex: 0, pathList: [new Node('objective', e.game.ndMain, 150, 0)] };
  return unit;
}
function building(e) {
  const value = new (e.load('KinghtFallBuildBase').default)();
  value.node = new Node('gate', e.game.ndMain, 30, 0);
  value.index = 1;
  value.getIsWork = () => !value.isDestroyed && value.index > 0;
  value.node.addComponent(PhysicsPolygonCollider).points = [{ x: -10, y: -70 }, { x: 10, y: -70 }, { x: 10, y: 70 }, { x: -10, y: 70 }];
  value.node.components[0].tag = 1;
  const upper = value.node.addComponent(PhysicsPolygonCollider);
  upper.tag = 2; upper.points = [{ x: -20, y: -70 }, { x: 20, y: -70 }, { x: 20, y: 70 }, { x: -20, y: 70 }];
  e.game.gameData.buildings.push(value);
  return value;
}

test('All enemies and attack getters share one building vertex transform per frame', () => {
  const e = environment(), gate = building(e);
  let transforms = 0;
  const world = gate.node.convertToWorldSpaceAR;
  gate.node.convertToWorldSpaceAR = function (point) { transforms++; return world.call(this, point); };
  e.nav.beginFrame(e.game);
  const first = gate.getWposPhyCol2();
  for (let i = 0; i < 100; i++) {
    assert.equal(gate.getWposPhyCol2(), first);
    assert.equal(gate.getWposPhyCol()[0], first[0].points);
  }
  assert.equal(transforms, 4, 'Every enemy recomputed identical building geometry');
  gate.node.x += 10; e.nav.beginFrame(e.game);
  const moved = gate.getWposPhyCol2();
  assert.equal(moved[0].points[0].x, first[0].points[0].x + 10);
  assert.equal(transforms, 8);
  gate.index = 2;
  assert.equal(gate.getWposPhyCol2()[0].points[0].x, 20, 'Same-frame upgrade reused the old level');
  gate.isDestroyed = true;
  assert.equal(gate.getWposPhyCol2().length, 0, 'Destroyed gate remained targetable for the rest of the frame');
});

test('Building getters stay fresh outside the managed game update', () => {
  const e = environment(), gate = building(e);
  const first = gate.getWposPhyCol2();
  gate.node.x += 15;
  assert.equal(gate.getWposPhyCol2()[0].points[0].x, first[0].points[0].x + 15);
});

test('Cached pursuit checks current attack/search range and target death immediately', () => {
  const e = environment(); installIntersection(e.cc);
  const unit = enemy(e), hero = e.game.ctrPlay;
  hero.node.setPosition(0, 0);
  assert.equal(unit.getUpdateTarget().canAtt, false);
  hero.node.x = -90;
  assert.equal(unit.getUpdateTarget().canAtt, true, 'Attack-range entry waited for the next acquisition');
  hero.node.x = 150;
  assert.equal(unit.getUpdateTarget(), null, 'Out-of-search-range target stayed cached');
  unit._targetSearchElapsed = .2; hero.node.x = -80;
  assert.equal(unit.getUpdateTarget().tag, hero.node);
  hero.isDead = () => true;
  assert.equal(unit.getUpdateTarget(), null, 'Dead target stayed cached');
});

test('Reused target nodes trigger fresh acquisition and nearest-target choice refreshes within 0.2 seconds', () => {
  const e = environment(); installIntersection(e.cc);
  const unit = enemy(e), hero = e.game.ctrPlay;
  hero.node.setPosition(10, 0); hero.node._combatGeneration = 1;
  const fresh = unit.getFind.bind(unit); let scans = 0;
  unit.getFind = () => { scans++; return fresh(); };
  unit.getUpdateTarget();
  hero.node._combatGeneration++;
  unit.getUpdateTarget();
  assert.equal(scans, 2, 'A new lifetime inherited a cached target record');
  const soldier = { node: new Node('ally', e.game.ndMain, -80, 0), isDead: () => false };
  e.game.gameData.soldiers.push(soldier);
  unit._targetSearchElapsed = .19;
  assert.equal(unit.getUpdateTarget().tag, hero.node);
  unit._targetSearchElapsed = .2;
  assert.equal(unit.getUpdateTarget().tag, soldier.node);
});

test('Waiting enemies reacquire destroyed building targets without waiting for the scan interval', () => {
  const e = environment(); installIntersection(e.cc);
  const gate = building(e), unit = enemy(e);
  e.game.ctrPlay.node.setPosition(80, 0);
  e.nav.beginFrame(e.game);
  assert.equal(unit.getUpdateTarget().building, gate);
  gate.isDestroyed = true;
  unit.state = 3; unit.onUpdate(.01);
  assert.equal(unit.state, 1, 'Waiting unit never resumed movement to its replacement target');
  assert.equal(unit._targetSearchCache.target.tag, e.game.ctrPlay.node);
});

test('Crowded waves bound full acquisition work while retaining immediate first acquisition', () => {
  const e = environment(); installIntersection(e.cc);
  e.game.ctrPlay.node.setPosition(0, 0);
  const units = Array.from({ length: 100 }, () => enemy(e));
  let scans = 0, peakRepeatScans = 0;
  for (const unit of units) {
    const fresh = unit.getFind.bind(unit);
    unit.getFind = () => { scans++; return fresh(); };
    assert(unit.getUpdateTarget());
  }
  assert.equal(scans, 100);
  for (let frame = 0; frame < 60; frame++) {
    const before = scans;
    for (const unit of units) { unit._targetSearchElapsed += 1 / 60; unit.getUpdateTarget(); }
    peakRepeatScans = Math.max(peakRepeatScans, scans - before);
  }
  assert(scans <= 600, `${scans} full scans instead of at most 600`);
  assert(peakRepeatScans <= 20, `${peakRepeatScans} units reacquired in one synchronized frame`);
});

test('Fresh and cached acquisition select identical actual Map01 gate parts for every enemy attack family', () => {
  for (const level of [1, 2, 3]) {
    const e = map01GateEnvironment(level, null);
    for (const name of ['KinghtFallEnemyItem02', 'KinghtFallEnemyLong', 'KinghtFallEnemyItem07', 'KinghtFallEnemyItem08', 'KinghtFallEnemyItem10']) {
      const unit = enemy(e, name);
      unit.cfg.AttackRange = 50; unit.cfg.SearchRange = 220;
      for (const [x, y] of [[-600, 940], [-660, 880], [-550, 840]]) {
        unit.node.setPosition(x, y); unit._targetSearchElapsed = .2;
        const expected = unit.getFind(), actual = unit.getUpdateTarget();
        assert.equal(actual && actual.tag, expected && expected.tag, `${name}, level ${level}, ${x},${y}`);
        assert.equal(actual && actual.canAtt, expected && expected.canAtt);
        assert.equal(unit.getUpdateTarget() && unit.getUpdateTarget().tag, expected && expected.tag);
      }
    }
  }
});
