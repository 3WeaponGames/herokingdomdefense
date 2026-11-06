'use strict';
// Deterministic workload for the shipped adapter/planner on authored Map01.
// Timing is diagnostic only; operation counts and movement safety are asserted.
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { NavigationGrid } = require('../../assets/_script/NavigationGrid');
const { map01GateEnvironment, PhysicsBoxCollider, PhysicsPolygonCollider, Node, distance } = require('./runtime-harness.cjs');

function workload(name, targetAt, frames = 300) {
  const e = map01GateEnvironment(3, null), nav = e.nav.get(e.game);
  const units = Array.from({ length: 100 }, (_, i) => {
    const unit = e.unit(-604 + i % 10, 926 + Math.floor(i / 10));
    unit.node.addComponent(PhysicsBoxCollider).size = { width: 22, height: 22 };
    return unit;
  });
  const positions = units.map(unit => ({ x: unit.node.x, y: unit.node.y }));
  const scenery = new Set(e.game.gameData.obstacles.map(owner => owner.node));
  for (const owner of e.game.gameData.buildings) {
    scenery.add(owner.node);
    for (const part of owner.ndAniOther || []) scenery.add(part.node || part);
  }
  const counts = { centers: 0, queries: 0, expanded: 0, staticTransforms: 0, staticScans: 0, maxSearchesPerFrame: 0 };
  const originals = {
    center: NavigationGrid.prototype._center,
    query: NavigationGrid.prototype._query,
    path: NavigationGrid.prototype.findPath,
    world: Node.prototype.convertToWorldSpaceAR,
    components: Node.prototype.getComponentsInChildren
  };
  NavigationGrid.prototype._center = function (...args) { counts.centers++; return originals.center.apply(this, args); };
  NavigationGrid.prototype._query = function (...args) { counts.queries++; return originals.query.apply(this, args); };
  NavigationGrid.prototype.findPath = function (...args) {
    const result = originals.path.apply(this, args);
    counts.expanded += this.lastSearch?.expanded || 0;
    return result;
  };
  Node.prototype.convertToWorldSpaceAR = function (...args) {
    if (scenery.has(this)) counts.staticTransforms++;
    return originals.world.apply(this, args);
  };
  Node.prototype.getComponentsInChildren = function (...args) {
    if (scenery.has(this)) counts.staticScans++;
    return originals.components.apply(this, args);
  };
  const started = performance.now();
  try {
    for (let frame = 0; frame < frames; frame++) {
      e.setTime(frame * 1000 / 60);
      e.nav.beginFrame(e.game);
      const before = nav.stats.searches;
      const target = targetAt(frame);
      for (const unit of units) {
        const result = e.nav.moveTo(unit, e.game, target, 1 / 60);
        assert(!result.reached, name + ': a unit crossed the closed gate');
        assert.equal(unit.rigidBody.linearVelocity.len(), 0);
      }
      counts.maxSearchesPerFrame = Math.max(counts.maxSearchesPerFrame, nav.stats.searches - before);
    }
  } finally {
    NavigationGrid.prototype._center = originals.center;
    NavigationGrid.prototype._query = originals.query;
    NavigationGrid.prototype.findPath = originals.path;
    Node.prototype.convertToWorldSpaceAR = originals.world;
    Node.prototype.getComponentsInChildren = originals.components;
  }
  const milliseconds = Math.round((performance.now() - started) * 10) / 10;
  assert.equal(nav.stats.revisions, 1, 'An unchanged Map01 must retain the same grid');
  assert(positions.every(position => nav.grid.isWalkable(position, 20)), 'Stress spawns must start clear of inflated terrain');
  units.forEach((unit, i) => assert(distance(unit.node, positions[i]) < 0.0001, name + ': a blocked unit moved through terrain'));
  const report = { name, units: units.length, frames, milliseconds, ...nav.stats, ...counts };
  console.log(JSON.stringify(report));
  assert(counts.maxSearchesPerFrame <= 8, name + ': path searches exceeded the per-frame budget');
  assert.equal(nav.stats.snapshotBuilds, 1, name + ': unchanged geometry was repeatedly transformed/rebuilt');
  return { report, e, units };
}

workload('Map01 closed gate, shared blocked polygon goal', () => ({ x: -500, y: 750 }));
const moving = workload('Map01 closed gate, moving target inside castle', frame => ({ x: -360 + Math.floor(frame / 12) % 2 * 24, y: 600 }));

// Cached failures and a search budget must not leave units starved when a real
// change makes the route usable. Remove the actual three-part gate, then give
// every actor normal frame updates in a fixed order. The destination keeps
// moving before one full batch of 100 searches could complete: earlier actors
// must not monopolize the budget and starve the last actors in the update list.
const { e, units } = moving, nav = e.nav.get(e.game), gate = e.game.gameData.buildings[2];
e.game.gameData.buildings.splice(2, 1);
for (const node of [gate.node, ...gate.ndAniOther.map(part => part.node || part)]) {
  for (const collider of node.getComponentsInChildren(PhysicsPolygonCollider)) collider.enabled = false;
}
const before = units.map(unit => ({ x: unit.node.x, y: unit.node.y }));
for (let frame = 300; frame < 372; frame++) {
  e.setTime(frame * 1000 / 60); e.nav.beginFrame(e.game);
  const searchesBefore = nav.stats.searches;
  for (const unit of units) {
    const previous = { x: unit.node.x, y: unit.node.y };
    e.nav.moveTo(unit, e.game, { x: -360 + Math.floor((frame - 300) / 12) * 24, y: 600 }, 1 / 60);
    assert(nav.grid.segmentClear(previous, unit.node, 20), 'A budgeted unit crossed terrain after removing the gate');
  }
  assert(nav.stats.searches - searchesBefore <= 8, 'Removing the gate caused an unbounded search spike');
}
assert.equal(nav.stats.snapshotBuilds, 2, 'Removing the gate should rebuild geometry exactly once');
units.forEach((unit, i) => assert(distance(unit.node, before[i]) > 1, 'Unit ' + i + ' was starved after removing the gate'));
console.log('PASS 100 blocked units stay within the search budget and all follow the moving target after the gate is removed');
