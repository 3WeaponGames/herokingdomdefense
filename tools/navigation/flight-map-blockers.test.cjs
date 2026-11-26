'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { environment, Node, PhysicsBoxCollider } = require('./runtime-harness.cjs');
const spawnSource = fs.readFileSync(require.resolve('../../assets/_script/SpawnArea'), 'utf8');

function flyer(e, x, y, buildingCross = 0) {
  const unit = e.unit(x, y);
  unit.cfg = { BuildingCross: buildingCross };
  unit.navigationTeam = 'enemy';
  unit.rigidBody.active = false;
  const body = unit.node.addComponent(PhysicsBoxCollider);
  body.size = { width: 24, height: 24 };
  body.body = unit.rigidBody;
  return unit;
}

function wall(e, x, y, width, height) {
  const collider = e.box(x, y, width, height, true);
  const owner = e.game.gameData.buildings.at(-1);
  owner.getNavigationGateShapes = () => [];
  owner.getIsWork = () => true;
  return collider;
}

function spawnFixture(e, spec, x = -120) {
  const routeHolder = new Node('paths');
  const spawn = new Node('ndEnemy1', routeHolder, x, 0);
  const authored = new Node('Authored routes', routeHolder);
  authored.getComponent = () => ({ spawnSpec: () => spec });
  e.game.ndPath = routeHolder;
  return spawn;
}

test('flight detours around terrain and building footprints and crosses solid walls and closed gates', () => {
  const e = environment(), { game, nav } = e;
  const wallShape = wall(e, -60, 0, 18, 390);
  const gateLeaf = new Node('Gate leaf', game.ndMain, -100, 0).addComponent(PhysicsBoxCollider);
  gateLeaf.size = { width: 18, height: 390 };
  game.gameData.buildings.at(-1).getNavigationGateShapes = () => [{ collider: gateLeaf }];
  e.box(0, 0, 30, 120);
  const tower = e.box(70, 0, 25, 80, true);
  const unit = flyer(e, -135, 0), target = { x: 135, y: 0 };
  const navigation = nav.get(game), grid = navigation.gridFor(unit);
  assert.equal(navigation.gridFor(flyer(e, -130, 10, false)), grid, 'flyers share a grid');
  const radius = navigation.radius(unit, true);
  assert(radius > navigation.radius(unit), 'the inactive body still provides clearance');
  assert(grid.isWalkable({ x: -60, y: 0 }, radius));
  assert(grid.isWalkable({ x: -100, y: 0 }, radius));
  assert(!grid.isWalkable({ x: 0, y: 0 }, radius));
  assert(!grid.isWalkable(tower.node, radius));

  let movement, steps = 0, farthestY = 0;
  do {
    const previous = unit.node.getPosition();
    nav.beginFrame(game);
    movement = nav.moveTo(unit, game, target, .15, true);
    const next = unit.node.getPosition();
    assert(grid.segmentClear(previous, next, radius), 'swept flight must stay clear of terrain and other buildings');
    farthestY = Math.max(farthestY, Math.abs(next.y));
  } while (!movement.arrived && ++steps < 150);
  assert(movement.reached);
  assert(farthestY > 60);
  assert.equal(unit.node.x, target.x);
  assert.equal(unit.rigidBody.active, false);
  wallShape.size = { width: 28, height: 390 };
  nav.invalidate(game);
  assert.equal(navigation.gridFor(unit), grid, 'wall-only updates retain the flight grid');
  tower.node.y = 140;
  nav.invalidate(game);
  assert.notEqual(navigation.gridFor(unit), grid);
  assert(!navigation.gridFor(unit).isWalkable(tower.node, radius), 'building changes update flight blockers');
  assert(navigation.gridFor(unit).isWalkable({ x: 70, y: 0 }, radius));

  const f7Ground = flyer(e, -135, 0, 1);
  f7Ground._unitTestActor = true;
  f7Ground._unitTestRadius = radius;
  assert.equal(navigation.gridFor(f7Ground), navigation.grid);
  assert(!navigation.gridFor(f7Ground).isWalkable({ x: -60, y: 0 }, radius));
  for (let i = 0; i < 40; i++) {
    nav.beginFrame(game);
    nav.moveTo(f7Ground, game, target, .15);
    assert(f7Ground.node.x < -100, 'F7 ground still cannot traverse the closed gate');
  }
});

test('flight respects map blockers on an unflagged stage and requires an explicit flight unit', () => {
  const e = environment(), unit = flyer(e, -100, 0);
  e.game.gameData.levelCfg = { Level: 3 };
  e.box(0, 0, 24, 400);
  const movement = e.nav.moveTo(unit, e.game, { x: 90, y: 0 }, 10);
  assert(!movement.reached);
  assert(unit.node.x < -12);
  assert.equal(e.nav.usesFlightGrid({ cfg: {} }), false);
  assert.equal(e.nav.usesFlightGrid({ cfg: { BuildingCross: false }, navigationTeam: 'friendly' }), false);
});

test('route rejoining and manual displacement respect red terrain even when its shape matches a wall', () => {
  const e = environment(), { game, nav } = e;
  e.box(0, 0, 24, 400);
  const owner = game.gameData.obstacles[0];
  owner.getNavigationGateShapes = () => [];
  const unit = flyer(e, -105, 0);
  unit.bornInfo = { nodeIndex: 0, pathList: [
    new Node('start', game.ndMain, -105, -180),
    new Node('turn', game.ndMain, 30, -180),
    new Node('end', game.ndMain, 30, 100)
  ] };
  const navigation = nav.get(game), oldGrid = navigation.gridFor(unit);
  assert.equal(nav.resumeEnemyRoute(unit, game), 0, 'must not rejoin across red');
  nav.moveManual(unit, game, e.cc.v2(100, 0));
  assert(unit.node.x < -12);
  assert(oldGrid.isWalkable(unit.node, navigation.radius(unit, true)));

  game.gameData.buildings.push(game.gameData.obstacles.shift());
  nav.invalidate(game);
  assert.notEqual(navigation.gridFor(unit), oldGrid);
  unit.node.setPosition(-105, 0);
  assert.equal(nav.resumeEnemyRoute(unit, game), 2, 'the same geometry as a wall permits rejoining');
  nav.moveManual(unit, game, e.cc.v2(100, 0));
  assert.equal(unit.node.x, 100);
});

test('flight samples a clear point inside its spawn disk and projects wholly blocked disks or point spawns', () => {
  const e = environment(), { game, nav } = e;
  const unit = flyer(e, -120, 0), area = e.load('SpawnArea');
  const spec = { radius: 65 };
  const spawn = spawnFixture(e, spec);

  const blocker = e.box(-116, 0, 20, 80);
  wall(e, -120, 0, 135, 135);
  const navigation = nav.get(game), grid = navigation.gridFor(unit), radius = navigation.radius(unit, true);
  const sampled = area.prepare(unit, game, 1, false, { BuildingCross: 0 });
  assert(Math.hypot(sampled.start.x - spawn.x, sampled.start.y - spawn.y) <= spec.radius);
  assert(grid.isWalkable(sampled.start, radius));
  assert(!navigation.grid.isWalkable(sampled.start, radius), 'walls are ignored during sampling');
  assert(area.apply(unit, game, 1, sampled));
  assert.equal(unit.node.x, sampled.start.x);
  assert.equal(unit.node.y, sampled.start.y);

  blocker.size = { width: 100, height: 120 };
  spec.radius = 4;
  nav.invalidate(game);
  const blockedSpawn = area.prepare(unit, game, 1, false, unit.cfg);
  assert(Math.hypot(blockedSpawn.start.x - spawn.x, blockedSpawn.start.y - spawn.y) > spec.radius);
  assert(area.apply(unit, game, 1, blockedSpawn));
  const red = navigation.gridFor(unit);
  assert(red.isWalkable(unit.node, radius));
  assert(Math.abs(unit.node.x - (-66 + radius)) <= .05, 'the nearest in-map red-clear side was found');
  spec.radius = 0;
  const pointSpawn = area.prepare(unit, game, 1, false, unit.cfg);
  assert.deepEqual(pointSpawn.start, blockedSpawn.start);
  assert(area.apply(unit, game, 1, pointSpawn));
  assert(red.isWalkable(unit.node, radius));

  const tower = e.box(pointSpawn.start.x, pointSpawn.start.y, 20, 40, true);
  nav.invalidate(game);
  assert(area.apply(unit, game, 1, pointSpawn));
  assert(nav.get(game).gridFor(unit).isWalkable(unit.node, radius));
  assert.notEqual(unit.node.x, tower.node.x, 'a building added after preparation invalidates the spawn');
});

test('deterministic fallback finds a clear cap missed by both sampling passes without leaving the disk', () => {
  const e = environment(), { game, nav } = e;
  const spec = { radius: 4 }, spawn = spawnFixture(e, spec);
  const unit = flyer(e, spawn.x, spawn.y), navigation = nav.get(game);
  const body = navigation.radius(unit, true);
  const left = -199, right = spawn.x + spec.radius - body - .01;
  e.box((left + right) / 2, 0, right - left, 400);
  const grid = navigation.gridFor(unit);
  let draws = 0;
  const math = Object.create(Math);
  math.random = () => { draws++; return .5; };
  const context = { exports: {}, require: () => nav, Math: math, cc: e.cc };
  vm.runInNewContext(spawnSource, context);
  const area = context.exports;
  assert.equal(area.sample(spawn, spec.radius, math.random, p => grid.isWalkable(p, body)), null);
  assert.equal(draws, 128);
  const a = area.prepare(unit, game, 1, false, unit.cfg);
  const b = area.prepare(unit, game, 1, false, unit.cfg);
  assert.deepEqual(a.start, b.start);
  assert.equal(draws, 128 * 3, 'the fallback itself consumes no RNG');
  assert(grid.isWalkable(a.start, body));
  assert(Math.hypot(a.start.x - spawn.x, a.start.y - spawn.y) <= spec.radius);
});

test('a fully sealed red map still retains its scheduled enemy', () => {
  const e = environment(), { game, nav } = e;
  const spawn = spawnFixture(e, { radius: 6 }), unit = flyer(e, -120, 0), area = e.load('SpawnArea');
  e.box(0, 0, 400, 400);
  const prepared = area.prepare(unit, game, 1, false, unit.cfg);
  assert(area.apply(unit, game, 1, prepared));
  assert(Math.hypot(unit.node.x - spawn.x, unit.node.y - spawn.y) <= 6);
  assert(!nav.get(game).gridFor(unit).isWalkable(unit.node, 0));
});
