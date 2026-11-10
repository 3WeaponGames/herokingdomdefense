'use strict';
// Exercise shipped navigation and unit classes using the shared scene harness.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { NavigationGrid } = require('../../assets/_script/NavigationGrid');
const { environment, Node, Vec2, Collider, PhysicsPolygonCollider, PhysicsBoxCollider, PhysicsCircleCollider, CircleCollider, RigidBody, installIntersection, map01GateEnvironment, distance, near } = require('./runtime-harness.cjs');
const sourceDir = path.resolve(__dirname, '../../assets/_script');
const engineDir = process.env.COCOS_ENGINE_DIR || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }

test('Nested transforms use one main-space radius and convert movement back to the local parent', () => {
  const e = environment();
  e.game.ndMain.setPosition(350, -200); e.game.ndMain.scaleX = e.game.ndMain.scaleY = 1.3;
  const group = new Node('group', e.game.ndMain, 70, 30); group.angle = 90; group.scaleX = group.scaleY = 2;
  const u = e.unit(0, 0, group), child = new Node('body', u.node, 3, 0);
  child.addComponent(PhysicsCircleCollider).radius = 4;
  u.node.addComponent(CircleCollider).radius = 500; // search range must not affect navigation
  assert.equal(e.nav.get(e.game).radius(u), 20);
  const result = e.nav.moveTo(u, e.game, { x: 70, y: 120 }, 0.5);
  near(u.node.x, 15); near(u.node.y, 0);
  near(e.nav.positionOf(u.node, e.game).y, 60);
  assert.equal(result.arrived, false);
  near(u.rigidBody.linearVelocity.len(), 0);
});

test('Actual obstacle path advances by safe segments, clamps large timesteps, and never skips a nearby corner', () => {
  const e = environment(); e.box(0, 0, 40, 100);
  const u = e.unit(), target = { x: 100, y: 0 }, nav = e.nav.get(e.game);
  let result = e.nav.moveTo(u, e.game, target, 0), last = e.nav.positionOf(u.node, e.game);
  assert.equal(result.arrived, false); near(last.x, -100);
  for (let i = 0; i < 40 && !result.arrived; i++) {
    result = e.nav.moveTo(u, e.game, target, 10);
    const current = e.nav.positionOf(u.node, e.game);
    assert(nav.grid.segmentClear(last, current, nav.radius(u)), 'movement cut through an inflated collider');
    last = current;
  }
  assert.equal(result.reached, true); near(last.x, 100); near(last.y, 0);
  // A target less than the old 2px tolerance away is not arrived without travel.
  result = e.nav.moveTo(u, e.game, { x: 101.5, y: 0 }, 0);
  assert.equal(result.arrived, false); near(u.node.x, 100);
  result = e.nav.moveTo(u, e.game, { x: 101.5, y: 0 }, 100);
  assert.equal(result.reached, true); near(u.node.x, 101.5);
});

test('Blocked building goals report safe endpoint arrival separately from exact target arrival', () => {
  const e = environment(); e.box(0, 0, 40, 40, true); const u = e.unit();
  let result;
  for (let i = 0; i < 20; i++) { result = e.nav.moveTo(u, e.game, { x: 0, y: 0 }, 1); if (result.arrived) break; }
  assert.equal(result.arrived, true); assert.equal(result.reached, false);
  assert(u.node.x < -20); assert(e.nav.get(e.game).grid.isWalkable(e.nav.positionOf(u.node, e.game), 12));
});

test('A moving target cannot report arrival at its stale cached endpoint', () => {
  const e = environment(), u = e.unit();
  e.nav.moveTo(u, e.game, { x: 100, y: 0 }, 1);
  let result = e.nav.moveTo(u, e.game, { x: 110, y: 0 }, 100);
  near(u.node.x, 100); assert.equal(result.arrived, false); assert.equal(result.reached, false);
  result = e.nav.moveTo(u, e.game, { x: 110, y: 0 }, 100);
  near(u.node.x, 110); assert.equal(result.reached, true);
});

test('Unreachable routes clear stale velocity, cache unchanged failures, and recover immediately on geometry revision', () => {
  const e = environment(); const wall = e.box(0, 0, 20, 400), u = e.unit(), target = { x: 100, y: 0 };
  let result = e.nav.moveTo(u, e.game, target, 1), nav = e.nav.get(e.game);
  assert.equal(result.blocked, true); near(u.node.x, -100); near(u.rigidBody.linearVelocity.len(), 0);
  assert.equal(nav.stats.searches, 1);
  e.setTime(100); e.nav.moveTo(u, e.game, target, 1); assert.equal(nav.stats.searches, 1);
  e.setTime(801); e.nav.moveTo(u, e.game, target, 1); assert.equal(nav.stats.searches, 1);
  wall.enabled = false; e.nav.beginFrame(e.game);
  result = e.nav.moveTo(u, e.game, target, 1);
  assert.equal(result.blocked, false); assert.equal(nav.stats.searches, 2); near(u.node.x, -40);
});

test('Collider snapshots track active buildings, sensors, body activation, transforms and map bounds', () => {
  const e = environment(), wall = e.box(0, 0, 20, 100, true), nav = e.nav.get(e.game);
  nav.refresh(); const grid = nav.grid; assert.equal(nav.revision, 1);
  e.nav.beginFrame(e.game); nav.refresh(); assert.equal(nav.grid, grid);
  wall.sensor = true; e.nav.beginFrame(e.game); nav.refresh(); assert.equal(nav.revision, 2);
  assert(nav.grid.segmentClear({ x: -80, y: 0 }, { x: 80, y: 0 }, 12));
  wall.sensor = false; wall.body = { active: false }; e.nav.beginFrame(e.game); nav.refresh(); assert.equal(nav.revision, 2);
  wall.body.active = true; e.nav.beginFrame(e.game); nav.refresh(); assert.equal(nav.revision, 3);
  wall.node.x = 10; e.nav.beginFrame(e.game); nav.refresh(); assert.equal(nav.revision, 4);
  wall.node.active = false; e.nav.beginFrame(e.game); nav.refresh(); assert.equal(nav.revision, 5);
  e.game.mapSize.width = 500; e.nav.beginFrame(e.game); nav.refresh(); assert.equal(nav.revision, 6);
  assert(nav.grid.isWalkable({ x: 230, y: 0 }, 12));
});

test('Physics round-trip noise preserves the geometry cache while real subpixel transforms still invalidate it', () => {
  const e = environment(), parent = new Node('terrain group', e.game.ndMain, 20, 30);
  const wall = e.box(-172.986, 0, 20, 80, false, parent), nav = e.nav.get(e.game);
  nav.refresh(); const originalGrid = nav.grid;
  // Actual live dt1_1 terrain drift: 1.1368683772161603e-13 in node.x.
  wall.node.x = -172.98599999999988;
  parent.x += 1e-13; parent.angle += 1e-13; parent.scaleX += 1e-13;
  e.nav.beginFrame(e.game); nav.refresh();
  assert.equal(nav.revision, 1, 'Numerical physics noise rebuilt the immutable scene');
  assert.equal(nav.grid, originalGrid);
  wall.node.x += .0001;
  e.nav.beginFrame(e.game); nav.refresh();
  assert.equal(nav.revision, 2, 'A real subpixel translation reused stale geometry');
  wall.offset.x += .0001;
  e.nav.beginFrame(e.game); nav.refresh();
  assert.equal(nav.revision, 3, 'A real collider offset reused stale geometry');
  parent.scaleX += .0001;
  e.nav.beginFrame(e.game); nav.refresh();
  assert.equal(nav.revision, 4, 'An ancestor scale change reused stale geometry');
  parent.angle += .0001;
  e.nav.beginFrame(e.game); nav.refresh();
  assert.equal(nav.revision, 5, 'An ancestor rotation reused stale geometry');
});

test('Round physics obstacles use a conservative polygon rather than cutting into a circle', () => {
  const e = environment(), owner = new Node('round', e.game.ndMain);
  owner.addComponent(PhysicsCircleCollider).radius = 80; e.game.gameData.obstacles.push({ node: owner });
  const nav = e.nav.get(e.game); nav.refresh();
  for (let i = 0; i < 128; i++) {
    const a = i * Math.PI / 64;
    assert.equal(nav.grid.isWalkable({ x: Math.cos(a) * 79.99, y: Math.sin(a) * 79.99 }, 0), false);
  }
});

test('Gate sibling wall pieces referenced by ndAniOther block routes and track their own activation', () => {
  const e = environment(), gate = e.box(0, 180, 20, 20, true), owner = e.game.gameData.buildings[0];
  const wingParent = new Node('side wall group', e.game.ndMain, 30, 0), wing = new Node('wing', wingParent, -30, 0);
  const collider = wing.addComponent(PhysicsBoxCollider); collider.size = { width: 20, height: 400 };
  owner.ndAniOther = [{ node: wing }, { node: wing }, wing];
  const u = e.unit(), nav = e.nav.get(e.game), result = e.nav.moveTo(u, e.game, { x: 100, y: 0 }, 1);
  assert.equal(result.blocked, true); assert.equal(nav.grid.polygons.length, 2, 'Repeated references must not duplicate shapes');
  gate.node.active = false; e.nav.beginFrame(e.game); nav.refresh();
  assert.equal(nav.grid.polygons.length, 1, 'A visible sibling wing remains solid independently of the gate');
  assert.equal(nav.grid.segmentClear({ x: -100, y: 0 }, { x: 100, y: 0 }, 12), false);
  collider.enabled = false; e.nav.beginFrame(e.game);
  assert.equal(e.nav.moveTo(u, e.game, { x: 100, y: 0 }, 1).blocked, false);
});

test('A validated overlap escape moves gradually and cached paths are discarded after an unrelated teleport', () => {
  const e = environment(); e.box(0, 0, 40, 40); const u = e.unit(-25, 0), target = { x: -100, y: 0 };
  let result = e.nav.moveTo(u, e.game, target, 0.01), state = u._navigationState;
  assert(state.escape); near(distance({ x: -25, y: 0 }, e.nav.positionOf(u.node, e.game)), 0.6);
  const searches = e.nav.get(e.game).stats.searches;
  for (let i = 0; i < 40 && !result.arrived; i++) result = e.nav.moveTo(u, e.game, target, 0.1);
  assert.equal(result.reached, true); assert.equal(e.nav.get(e.game).stats.searches, searches);
  u.node.setPosition(25, 0);
  e.nav.moveTo(u, e.game, target, 0.01);
  assert(e.nav.get(e.game).stats.searches > searches); assert(u._navigationState.escape);
});

test('Physics-disabled building-crossing units retain direct movement and clear old cached routes', () => {
  const e = environment(); e.box(0, 0, 20, 400); const u = e.unit();
  u._navigationState = { stale: true }; u.rigidBody.active = false;
  const result = e.nav.moveTo(u, e.game, { x: 100, y: 0 }, 100);
  near(u.node.x, 100); assert.equal(result.reached, true); assert.equal(u._navigationState, null);
  assert.equal(e.nav.get(e.game).stats.searches, 0); near(u.rigidBody.linearVelocity.len(), 0);
});

test('Every enemy archetype inherits live navigation; stale combat vectors cannot steer authored movement', () => {
  for (let n = 1; n <= 10; n++) {
    const e = environment(), name = 'KinghtFallEnemyItem' + String(n).padStart(2, '0'), u = e.actor(name);
    const routeParent = new Node('route', e.game.ndMain, 30, -10), waypoint = new Node('goal', routeParent, 70, 10);
    u.bornInfo = { nodeIndex: 0, pathList: [waypoint] };
    u.vec2_2 = new Vec2(-9000, 9000); u.onUpdate(0.1);
    near(u.node.x, -94); near(u.node.y, 0); assert.equal(u.bornInfo.nodeIndex, 0, name);
    assert(u._navigationState, name + ' did not use the planner');
    assert(u instanceof e.load('KinghtFallEnemyBase').default);
  }
});

test('Enemy combat targets use transformed child-node positions without consuming authored route entries', () => {
  const e = environment(), u = e.actor('KinghtFallEnemyItem01'), group = new Node('building', e.game.ndMain, 30, 20), target = new Node('tag', group, 70, -20);
  u.bornInfo = { nodeIndex: 0, pathList: [new Node('authored', e.game.ndMain, -100, 150)] };
  u.getFind = () => ({ tag: target, canAtt: false });
  u.onUpdate(100); near(u.node.x, 100); near(u.node.y, 0); assert.equal(u.bornInfo.nodeIndex, 0);
  u.onUpdate(0); assert.equal(u.bornInfo.nodeIndex, 0);
});

test('A fully upgraded Map02 gate wing is approached at its attack polygon rather than its unreachable origin', () => {
  const fixture = require('./fixtures/map02-upper-left-gate-level3.json');
  for (const spawn of [fixture.spawn, { x: -640, y: 880 }, { x: -600, y: 880 }]) {
    const e = environment(); installIntersection(e.cc);
    e.game.mapSize = { width: fixture.bounds.maxX - fixture.bounds.minX, height: fixture.bounds.maxY - fixture.bounds.minY };
    e.game.ctrPlay.isDead = () => true;
    function shape(node, points) {
      const collider = node.addComponent(PhysicsPolygonCollider);
      collider.points = points.map(p => ({ x: p.x - node.x, y: p.y - node.y }));
      return collider;
    }
    fixture.terrain.forEach(points => { const node = new Node('terrain', e.game.ndMain); shape(node, points); e.game.gameData.obstacles.push({ node }); });
    const parts = fixture.parts.map(part => {
      const node = new Node(part.name, e.game.ndMain, part.origin.x, part.origin.y); node.fixtureId = part.id;
      return { node, collider: shape(node, part.points) };
    });
    const gate = { node: parts[0].node, ndAniOther: parts.slice(1), getIsWork: () => true,
      getWposPhyCol2: () => parts.map(p => ({ tagNode: p.node, points: p.collider.points.map(v => p.node.convertToWorldSpaceAR(v)) })) };
    e.game.gameData.buildings.push(gate);
    const u = e.actor('KinghtFallEnemyItem01', spawn.x, spawn.y), body = u.node.addComponent(PhysicsBoxCollider);
    body.size = { width: 22, height: 22 }; u.cfg.AttackRange = fixture.attackRange; u.cfg.SearchRange = fixture.searchRange;
    delete u.getFind; delete u.onFindList;
    let attacks = 0; u.doAttackStart = () => { attacks++; };
    u.bornInfo = { nodeIndex: 0, pathList: [new Node('objective', e.game.ndMain, -245.465, 598.627)] };
    const selected = u.getFind(), nav = e.nav.get(e.game); nav.refresh();
    const oldTarget = parts.reduce((best, part) => distance(spawn, part.node.position) < distance(spawn, best.node.position) ? part : best);
    if (spawn === fixture.spawn) assert.equal(oldTarget.node.fixtureId, fixture.expectedOldSelection);
    assert.equal(selected.canAtt, false); assert(selected.polygon.length >= 3);
    assert.equal(nav.grid.findPath(spawn, e.nav.positionOf(oldTarget.node, e.game), fixture.radius), null, 'fixture no longer reproduces the old nearest-origin failure');
    assert.equal(!!u.onFindList(), false); assert.equal(attacks, 0);
    const approach = e.nav.attackPositionOf(selected, u, e.game);
    assert(nav.grid.findPath(spawn, approach, fixture.radius), 'polygon approach has no safe path');
    let previous = u.node.getPosition();
    for (let i = 0; i < 160 && !u.getFind().canAtt; i++) {
      u.onUpdate(0.05);
      const current = u.node.getPosition();
      assert(nav.grid.segmentClear(previous, current, fixture.radius), 'enemy cut through the closed gate or terrain');
      assert(distance(previous, current) <= 3.000001, 'approach teleported');
      assert.equal(u.bornInfo.nodeIndex, 0, 'combat pursuit consumed the route objective');
      previous = current;
    }
    assert.equal(u.getFind().canAtt, true, 'enemy never entered its unchanged attack range');
    u.time.Attack = 1; u.onUpdate(0);
    assert.equal(attacks, 1, 'normal movement update did not enter an attack on the closed gate');
    assert(parts.every(p => p.collider.enabled), 'fix opened or disabled the gate');
  }
});

test('Building approach polygons transform from world space and ordinary unit targets retain their node position', () => {
  const e = environment(), u = e.unit(0, 0), target = new Node('target', e.game.ndMain, 100, 0);
  e.game.ndMain.setPosition(300, -200); e.game.ndMain.scaleX = e.game.ndMain.scaleY = 1.5; e.game.ndMain.angle = 25;
  const polygon = [{ x: 60, y: -20 }, { x: 120, y: -20 }, { x: 120, y: 20 }, { x: 60, y: 20 }].map(p => e.game.ndMain.convertToWorldSpaceAR(p));
  const approach = e.nav.attackPositionOf({ tag: target, polygon }, u, e.game);
  near(approach.x, 60); near(approach.y, 0);
  const ordinary = e.nav.attackPositionOf({ tag: target }, u, e.game);
  near(ordinary.x, 100); near(ordinary.y, 0);
});

test('Map02 level-two gate and neighboring built structures recover all four reproduced pursuit stalls', () => {
  const fixture = require('./fixtures/map02-upper-left-gate-level2.json');
  for (const spawn of fixture.starts) {
    const e = environment(); installIntersection(e.cc);
    e.game.mapSize = { width: fixture.bounds.maxX - fixture.bounds.minX, height: fixture.bounds.maxY - fixture.bounds.minY };
    e.game.ctrPlay.isDead = () => true;
    fixture.terrain.forEach(points => {
      const node = new Node('terrain', e.game.ndMain), collider = node.addComponent(PhysicsPolygonCollider); collider.points = points;
      e.game.gameData.obstacles.push({ node });
    });
    const colliders = [];
    fixture.buildings.forEach(building => {
      const root = new Node(building.name, e.game.ndMain, building.origin.x, building.origin.y);
      const parts = building.parts.map(part => {
        const node = part.id === building.nodeId ? root : new Node(part.name, e.game.ndMain, part.origin.x, part.origin.y);
        node.fixtureId = part.id;
        const collider = node.addComponent(PhysicsPolygonCollider);
        collider.points = part.points.map(p => ({ x: p.x - node.x, y: p.y - node.y })); colliders.push(collider);
        return { node, collider };
      });
      e.game.gameData.buildings.push({ node: root, ndAniOther: parts.filter(p => p.node !== root), getIsWork: () => true,
        getWposPhyCol2: () => parts.map(p => ({ tagNode: p.node, points: p.collider.points.map(v => p.node.convertToWorldSpaceAR(v)) })) });
    });
    const u = e.actor('KinghtFallEnemyItem01', spawn.x, spawn.y), body = u.node.addComponent(PhysicsBoxCollider);
    body.size = { width: 22, height: 22 }; u.cfg.AttackRange = fixture.attackRange; u.cfg.SearchRange = fixture.searchRange;
    delete u.getFind; delete u.onFindList; let attacks = 0; u.doAttackStart = () => { attacks++; };
    u.bornInfo = { nodeIndex: 0, pathList: [new Node('objective', e.game.ndMain, -245.465, 598.627)] };
    const selected = u.getFind(), nav = e.nav.get(e.game); nav.refresh();
    const oldTarget = colliders.reduce((best, collider) => distance(spawn, collider.node.position) < distance(spawn, best.node.position) ? collider : best);
    assert.equal(nav.grid.findPath(spawn, e.nav.positionOf(oldTarget.node, e.game), fixture.radius), null, JSON.stringify(spawn) + ' no longer reproduces old origin failure');
    if (!selected.canAtt) assert(nav.grid.findPath(spawn, e.nav.attackPositionOf(selected, u, e.game), fixture.radius), 'nearest boundary is unreachable at ' + JSON.stringify(spawn));
    let previous = u.node.getPosition();
    for (let i = 0; i < 160 && !u.getFind().canAtt; i++) {
      u.onUpdate(0.05); const current = u.node.getPosition();
      assert(nav.grid.segmentClear(previous, current, fixture.radius), 'approach crossed another building');
      assert(distance(previous, current) <= 3.000001); previous = current;
    }
    assert.equal(u.getFind().canAtt, true, 'level-two enemy stayed outside attack range at ' + JSON.stringify(spawn));
    u.time.Attack = 1; u.onUpdate(0); assert.equal(attacks, 1);
    assert.equal(u.bornInfo.nodeIndex, 0); assert(colliders.every(c => c.enabled));
  }
});

test('Waiting enemies reacquire an approaching target outside attack range and resume pursuit', () => {
  const e = environment(), u = e.actor('KinghtFallEnemyItem02');
  delete u.getFind;
  e.game.ctrPlay.node.setPosition(-50, 0);
  u.bornInfo = { nodeIndex: 1, pathList: [new Node('completed route', e.game.ndMain, -100, 0)] };
  u.doWait();
  assert.equal(u.state, 3);
  assert.equal(u.getFind().canAtt, false);
  u.onUpdate(0);
  assert.equal(u.state, 1, 'route-end wait ignored a new target outside attack range');
  u.onUpdate(0.1);
  assert(u.node.x > -100, 'reacquired target did not restart movement');
  assert.equal(u.bornInfo.nodeIndex, 1, 'reacquisition must not rewind the completed route');
});

test('All eight pursuing enemy classes resume forward after the hero leaves actual aggro range', () => {
  for (const n of [1, 2, 3, 4, 5, 7, 8, 10]) {
    const e = environment(), name = 'KinghtFallEnemyItem' + String(n).padStart(2, '0'), u = e.actor(name);
    delete u.getFind; // Exercise the shipped hero-distance/aggro selection too.
    u.bornInfo = { nodeIndex: 0, pathList: [new Node('passed', e.game.ndMain, -50, 0), new Node('objective', e.game.ndMain, 100, 0)] };
    for (let i = 0; i < 4; i++) {
      e.game.ctrPlay.node.setPosition(u.node.x + 42, 0);
      u.onUpdate(0.5);
      assert.equal(u.bornInfo.nodeIndex, 0, name + ' consumed a waypoint during combat');
    }
    near(u.node.x, 20); assert.equal(u._routeInterrupted, true);
    e.game.ctrPlay.node.setPosition(150, 150);
    u.onUpdate(0.1);
    near(u.node.x, 26); assert.equal(u.bornInfo.nodeIndex, 1, name);
    assert.equal(u._routeInterrupted, false); assert.equal(u.facingLeft, false);
    for (let i = 0; i < 20 && u.bornInfo.nodeIndex < 2; i++) u.onUpdate(0.1);
    near(u.node.x, 100); assert.equal(u.bornInfo.nodeIndex, 2, name + ' lost the final objective');
  }
});

test('Auxiliary classes share route resumption without acquiring hero aggro', () => {
  for (const name of ['KinghtFallEnemyItem06', 'KinghtFallEnemyItem09']) {
    const e = environment(), u = e.actor(name, 20, 0);
    u.bornInfo = { nodeIndex: 0, pathList: [new Node('passed', e.game.ndMain, -50, 0), new Node('objective', e.game.ndMain, 100, 0)] };
    u.getFind = () => { throw new Error('Auxiliary must not start chasing'); };
    u.interruptRoute(); u.onUpdate(0.1);
    near(u.node.x, 26); assert.equal(u.bornInfo.nodeIndex, 1); assert.equal(u._routeInterrupted, false);
    u.onUpdate(0.1); near(u.node.x, 32);
  }
});

test('Combat acquisition and disengagement invalidate close destinations within the path cache tolerance', () => {
  const e = environment(), u = e.actor('KinghtFallEnemyItem01', 0, 0);
  const objective = new Node('objective', e.game.ndMain, 35, 0), hero = new Node('hero', e.game.ndMain, 20, 0);
  u.bornInfo = { nodeIndex: 0, pathList: [objective] };
  u.onUpdate(0); near(u._navigationState.target.x, 35);
  u.getFind = () => ({ tag: hero, canAtt: false });
  u._targetSearchElapsed = .2; // Observe the next bounded acquisition tick.
  u.onUpdate(0); near(u._navigationState.target.x, 20);
  u.getFind = () => null;
  u.onUpdate(0.1); near(u._navigationState.target.x, 35); near(u.node.x, 6);
  assert.equal(e.nav.get(e.game).stats.searches, 3);
});

test('Disengaging skips multiple passed waypoints but retains the final objective and transforms', () => {
  const e = environment(), group = new Node('route', e.game.ndMain, -100, 20), u = e.actor('KinghtFallEnemyItem01', 60, 0);
  const nodes = [0, 60, 120, 200].map((x, i) => new Node('waypoint' + i, group, x, -20));
  u.bornInfo = { nodeIndex: 0, pathList: nodes }; u.interruptRoute();
  u.onUpdate(0); assert.equal(u.bornInfo.nodeIndex, 3); near(u.node.x, 60);
  u.onUpdate(0.1); near(u.node.x, 66); assert.equal(u.bornInfo.nodeIndex, 3);
  u.onUpdate(1); near(u.node.x, 100); assert.equal(u.bornInfo.nodeIndex, 4);
  assert.equal(nodes.length, 4); near(nodes[0].x, 0);
});

test('A resumed objective routes around intervening obstacles instead of cutting through them', () => {
  const e = environment(); e.box(60, 0, 16, 100);
  const u = e.actor('KinghtFallEnemyItem01', 20, 0), body = u.node.addComponent(PhysicsBoxCollider);
  body.size = { width: 22, height: 22 }; // 20-unit clearance, matching authored bodies.
  u.bornInfo = { nodeIndex: 0, pathList: [new Node('passed', e.game.ndMain, -50, 0), new Node('objective', e.game.ndMain, 150, 0)] };
  u.getFind = () => ({ tag: e.game.ctrPlay.node, canAtt: true }); u.onUpdate(0);
  u.getFind = () => null;
  const nav = e.nav.get(e.game); let last = u.node.getPosition(), detoured = false;
  for (let i = 0; i < 200 && u.bornInfo.nodeIndex < 2; i++) {
    u.onUpdate(0.1);
    assert(u.bornInfo.nodeIndex >= 1, 'returned to the obsolete waypoint');
    const current = u.node.getPosition();
    assert(nav.grid.segmentClear(last, current, nav.radius(u)), 'resumed movement crossed a collider');
    assert(distance(last, current) <= 6.000001, 'resumed movement teleported');
    detoured = detoured || Math.abs(current.y) > 50;
    last = current;
  }
  assert(detoured); near(u.node.x, 150); near(u.node.y, 0); assert.equal(u.bornInfo.nodeIndex, 2);
});

test('Route resumption cannot infer passed waypoints across a wall or before a forward segment', () => {
  const e = environment(); e.box(0, 0, 100, 20);
  const u = e.actor('KinghtFallEnemyItem01', 0, 40);
  u.bornInfo = { nodeIndex: 0, pathList: [new Node('first', e.game.ndMain, -100, -80), new Node('last', e.game.ndMain, 100, -80)] };
  u.interruptRoute(); u.onUpdate(0); assert.equal(u.bornInfo.nodeIndex, 0);
  // An intentional building-crossing unit still uses its configured behavior.
  u.rigidBody.active = false; u.interruptRoute(); u.onUpdate(0); assert.equal(u.bornInfo.nodeIndex, 1);
  const before = environment(), b = before.actor('KinghtFallEnemyItem01', -100, 40);
  b.bornInfo = { nodeIndex: 0, pathList: [new Node('first', before.game.ndMain, -50, 0), new Node('last', before.game.ndMain, 100, 0)] };
  b.interruptRoute(); b.onUpdate(0); assert.equal(b.bornInfo.nodeIndex, 0);
});

test('Enemy authored goals advance only at the resolved endpoint; wait and unreachable states never advance', () => {
  for (const name of ['KinghtFallEnemyItem01', 'KinghtFallEnemyItem06', 'KinghtFallEnemyItem09']) {
    const e = environment(); e.box(0, 0, 40, 40, true); const u = e.actor(name), waypoint = new Node('goal', e.game.ndMain);
    u.bornInfo = { nodeIndex: 0, pathList: [waypoint] };
    u.onUpdate(0); assert.equal(u.bornInfo.nodeIndex, 0);
    for (let i = 0; i < 20 && u.bornInfo.nodeIndex === 0; i++) u.onUpdate(0.2);
    assert.equal(u.bornInfo.nodeIndex, 1, name); assert(u.node.x < -20);
    u.state = 3; const pos = u.node.getPosition(); u.onUpdate(0.2); near(distance(pos, u.node.position), 0); assert.equal(u.bornInfo.nodeIndex, 1);
    const blocked = environment(); blocked.box(0, 0, 20, 400); const b = blocked.actor(name);
    b.bornInfo = { nodeIndex: 0, pathList: [new Node('goal', blocked.game.ndMain, 100, 0)] }; b.onUpdate(10);
    assert.equal(b.bornInfo.nodeIndex, 0, 'a partial route must not complete the blocked objective');
    assert(b.node.x > -100 && b.node.x < -10, 'enemy should approach the obstruction without crossing it');
  }
});

test('Every allied archetype follows the same planner and completes a legacy destination without stale-vector movement', () => {
  for (let n = 1; n <= 4; n++) {
    const e = environment(), name = 'KinghtFallSoldierItem' + String(n).padStart(2, '0'), u = e.actor(name);
    u.pathList = { nodeIndex: 0, pathIndex: 42, pathInfoList: [{ index: 42, pos: { x: 100, y: 0 } }] };
    e.game.ndAggFlag.Flag = 1; u.vec2_2 = new Vec2(-9000, 9000); u.onUpdate(0.1);
    near(u.node.x, -94); near(u.node.y, 0); assert(u._navigationState);
    u.onUpdate(100); near(u.node.x, 100); assert.equal(u.pathList, null); assert.equal(e.game.ndAggFlag.Flag, 1); assert.equal(u.state, 0);
    u.onUpdate(0); assert.equal(e.game.ndAggFlag.Flag, 1, 'movement must not clear the persistent army marker');
    assert(u instanceof e.load('KinghtFallSoldierBase').default);
  }
});

test('Allied combat pursuit and follow distance both use the main coordinate system', () => {
  const e = environment(), group = new Node('unit-group', e.game.ndMain, -100, 0), u = e.actor('KinghtFallSoldierItem01', 0, 0, group);
  const targetParent = new Node('target-group', e.game.ndMain, 100, 20), target = new Node('target', targetParent, 0, -20);
  u.getFind = () => ({ tag: { node: target, isDead: () => false }, canAtt: false }); u.onUpdate(0.1);
  near(e.nav.positionOf(u.node, e.game).x, -94); near(u.node.x, 6);
  // Same local coordinates under different parents are not close in the map.
  e.game.ctrPlay.node.setParent(targetParent); e.game.ctrPlay.node.setPosition(6, -20);
  u.isAgg = true; u.pathList = { nodeIndex: 0, pathIndex: 1, pathInfoList: [{ index: 1, pos: { x: 100, y: 0 } }] };
  u.onUpdate(0.1); assert.equal(u.state, 1); near(e.nav.positionOf(u.node, e.game).x, -88);
});

test('Pooled enemy/allied init, allied revival, new rallies and route updates discard cached navigation', () => {
  const e = environment(), enemy = e.actor('KinghtFallEnemyBase'), soldier = e.actor('KinghtFallSoldierBase');
  e.game.setPath = () => ({ nodeIndex: 0, pathList: [] });
  enemy._navigationState = { old: true }; enemy._routeInterrupted = true; enemy.initData(1, {});
  assert.equal(enemy._navigationState, null); assert.equal(enemy._routeInterrupted, false); near(enemy.rigidBody.linearVelocity.len(), 0);
  soldier._navigationState = { old: true }; soldier.initData(90001); assert.equal(soldier._navigationState, null); near(soldier.rigidBody.linearVelocity.len(), 0);
  soldier._navigationState = { old: true }; soldier.setNew(); assert.equal(soldier._navigationState, null); assert.equal(soldier.pathList, null);
  assert.equal(soldier.startAgg(null), false); assert.equal(soldier.startAgg({ index: 1 }), false);
  soldier._navigationState = { old: true }; assert.equal(soldier.startAgg({ index: 1, pos: { x: 100, y: 0 } }), true); assert.equal(soldier._navigationState, null);
  soldier._navigationState = { old: true }; soldier.setPath([], true); assert.equal(soldier._navigationState, null);
  soldier.setPath([{ index: 1, pos: { x: 100, y: 0 } }, { index: 2, pos: { x: 120, y: 0 } }], false);
  assert.equal(soldier.pathList.pathInfoList.length, 1); assert.equal(soldier.pathList.pathIndex, 2);
  soldier.pathList = { nodeIndex: 0, pathIndex: 1, pathInfoList: [] }; assert.doesNotThrow(() => soldier.setPath([], false));
});

test('Game controller invalidates snapshots per update without accumulating historical follow routes', () => {
  const e = environment(), ctrl = new (e.load('KinghtFallGameCtrl').default)();
  Object.assign(ctrl, e.game, { ctrPlay: { node: new Node('hero', e.game.ndMain, 0, 0), doMove() {} }, gameStatus: -1, isAgg: true,
    pathList: [], pathIndex: 0 });
  ctrl.gameData.soldiers = [{ onUpdate() {} }];
  const nav = e.nav.get(ctrl); nav.refresh(); assert.equal(nav._refreshPending, false);
  ctrl.onUpdate(0); assert.equal(nav._refreshPending, true);
  for (let i = 0; i < 1000; i++) { ctrl.ctrPlay.node.x = i; ctrl.onUpdate(0); }
  assert.equal(ctrl.pathList.length, 0, 'following must not build a hero breadcrumb queue');
  ctrl.addPathNode(); assert.equal(ctrl.pathList.length, 1); assert.equal(ctrl.pathList[0].index, 0);
  ctrl.addPathNode(); assert.equal(ctrl.pathList.length, 1); assert.equal(ctrl.pathList[0].index, 1);
});

test('Map initialization discards the previous map navigation instance', () => {
  const e = environment(), ctrl = new (e.load('KinghtFallGameCtrl').default)(), map = new Node('map');
  for (const name of ['ndBg', 'ndDown', 'ndPath', 'ndTrack', 'ndMain', 'ndUI']) new Node(name, map);
  new Node('ndStar', map.getChildByName('ndPath'), 10, 20);
  Object.assign(ctrl, e.game); ctrl.gameData.initMap = () => {}; e.nav.get(ctrl);
  ctrl.initMap(map); assert.equal(ctrl._navigation, null); assert.equal(ctrl.ctrPlay.node.parent, ctrl.ndMain);
});

function functionAt(source, marker) {
  const start = source.indexOf('function', source.indexOf(marker));
  assert(start >= 0, 'Function marker missing: ' + marker);
  const open = source.indexOf('{', start);
  let depth = 1, end = open + 1;
  for (; end < source.length && depth; end++) {
    if (source[end] === '{') depth++;
    else if (source[end] === '}') depth--;
  }
  assert.equal(depth, 0);
  return source.slice(start, end);
}

test('UIGame settles the ancestor Widget before activating map Rigidbody components', () => {
  const source = fs.readFileSync(path.join(sourceDir, 'KinghtFallUIGame.js'), 'utf8');
  const start = functionAt(source, '_ctor.prototype.start = function');
  let aligned = false, activated = false;
  const cc = { Widget: function () {}, instantiate() { assert(aligned, 'Map instantiated before parent/ancestor layout'); return { setParent() { activated = true; assert(aligned); } }; } };
  const game = { initData() {}, initMap() {}, ndUI: {}, ndPath: {}, gameData: { upMap() {}, initCom() {} }, onLateUpdate() {}, loadGame: () => false };
  const ui = { ndCtrGame: { getComponent: Type => Type === cc.Widget ? { updateAlignment() { aligned = true; } } : game },
    btnAgg: { getChildByName: () => ({}) }, initBtnEvent() {}, initEvent() {}, initView() {}, initBtnView() {},
    loadPrefab(bundle, name, callback) { assert.equal(name, 'Map01'); callback({}); },
    ctrEffect: { initData() {} }, sendEvent() {}, ctrUI: { ndGuide: { setParent() {} } } };
  const context = { cc, BattleSounds: {}, $z1Appcfg: { BaseEventName: {} }, TestMode: { getInstance: () => ({ setGameplayTarget() {} }) },
    $z1KinghtFallConfig: { KinghtFallAudioId: {}, KinghtFallParameter: {}, KinghtFallBundelName: {} },
    $z1AudioMgr: { AudioMgr: { getInstance: () => ({ playMusic() {} }) } }, $z1KinghtFallGameCtrl: { default: function () {} },
    $z1KinghtFallDataMgr: { KinghtFallDataMgr: { getInstance: () => ({ getLevelCfgById: () => ({ prefab: 'Map01' }) }) } } };
  ui.playPlanningMusic = vm.runInNewContext('(' + functionAt(source, '_ctor.prototype.playPlanningMusic = function') + ')', context);
  vm.runInNewContext('(' + start + ')', context).call(ui);
  assert(activated);
});

const engineBodyFile = path.join(engineDir, 'cocos2d/core/physics/CCRigidBody.js');
if (fs.existsSync(engineBodyFile)) {
  test('Installed Cocos physics reproduces the 166.667px drift; ancestor synchronization preserves all local map coordinates', () => {
    const e = environment(), physics = e.physics, scene = new Node('scene'), canvas = new Node('canvas', scene, 375, 667), map = new Node('map', canvas);
    e.stubs.AudioMgr = { AudioMgr: { getInstance: () => ({ stopOwnedEffects() {} }) } };
    const gate = e.unit(-453.39, 703.474, map), terrain = e.unit(-172.986, 1495.705, map), wallParent = new Node('wall parent', map, -400, 700), wall = e.unit(7.055, -42.225, wallParent);
    const bodySource = fs.readFileSync(engineBodyFile, 'utf8'), managerSource = fs.readFileSync(path.join(engineDir, 'cocos2d/core/physics/CCPhysicsManager.js'), 'utf8');
    const globals = { cc: e.cc, VEC2_ZERO: Vec2.ZERO, PTM_RATIO: 32, BodyType: { Animated: 3 }, PHYSICS_ANGLE_TO_ANGLE: 180 / Math.PI,
      vec2_tmp: new Vec2(), convertToNodeRotation: (_, value) => value, PhysicsManager: { VELOCITY_ITERATIONS: 10, POSITION_ITERATIONS: 10 } };
    const syncPosition = vm.runInNewContext('(' + functionAt(bodySource, '    syncPosition: function') + ')', globals);
    physics._syncNode = vm.runInNewContext('(' + functionAt(managerSource, '    _syncNode: function') + ')', globals);
    physics.update = vm.runInNewContext('(' + functionAt(managerSource, '    update: function') + ')', globals);
    Object.assign(physics, { enabled: true, enabledAccumulator: false, _delayEvents: [], _world: { Step() {} }, _bodies: [gate.rigidBody, terrain.rigidBody, wall.rigidBody] });
    for (const body of physics._bodies) {
      const p = body.node.convertToWorldSpaceAR(Vec2.ZERO);
      body.type = 0; body.syncPosition = syncPosition;
      body._b2Body = { pos: new Vec2(p.x / 32, p.y / 32), GetPosition() { return this.pos; }, GetAngle: () => 0,
        SetTransformVec(point) { this.pos = point.clone ? point.clone() : new Vec2(point.x, point.y); } };
    }
    canvas.y += 166.667; physics.update(1 / 60);
    near(gate.node.y, 703.474 - 166.667); near(terrain.node.y, 1495.705 - 166.667); near(wall.node.y, -42.225 - 166.667);
    canvas.y = 667; gate.node.setPosition(-453.39, 703.474); terrain.node.setPosition(-172.986, 1495.705); wall.node.setPosition(7.055, -42.225);
    physics._bodies.forEach(body => body.syncPosition());
    const ctrl = new (e.load('KinghtFallGameCtrl').default)(); ctrl._bindMapPhysics(map);
    assert.equal(physics.listeners.length, 1);
    canvas.y += 166.667; physics.update(1 / 60);
    near(gate.node.y, 703.474); near(terrain.node.y, 1495.705); near(wall.node.y, -42.225);
    canvas.y -= 50; physics.update(1 / 60); near(gate.node.y, 703.474); near(wall.node.y, -42.225);
    // Unchanged ancestors must not overwrite normal body simulation each tick.
    gate.rigidBody._b2Body.pos.x += 5 / 32; physics.update(1 / 60); near(gate.node.x, -453.39 + 5);
    let applied = 0; const collider = terrain.node.addComponent(PhysicsBoxCollider); collider.enabledInHierarchy = collider._inited = true; collider.apply = () => { applied++; };
    canvas.scaleX = canvas.scaleY = 1.1; physics.update(1 / 60); near(terrain.node.y, 1495.705); assert.equal(applied, 1);
    ctrl._bindMapPhysics(map); assert.equal(physics.listeners.length, 1);
    ctrl.onDestroy(); assert.equal(physics.listeners.length, 0); assert.equal(ctrl.baseDestroyed, true);
  });
} else console.log('SKIP installed-engine physics regression: set COCOS_ENGINE_DIR to a Creator 2.4.13 engine checkout.');

test('Ancestor scaling reapplies live collider shapes without resurrecting disabled, inactive or pending fixtures', () => {
  const e = environment(), map = e.game.ndMain, unit = e.unit(20, 30);
  e.stubs.AudioMgr = { AudioMgr: { getInstance: () => ({ stopOwnedEffects() {} }) } };
  const ctrl = new (e.load('KinghtFallGameCtrl').default)();
  const calls = [];
  for (const [name, enabled, active, initialized] of [
    ['live', true, true, true], ['open gate', false, false, false],
    ['inactive component', true, false, true], ['pending init', true, true, false]
  ]) {
    const collider = unit.node.addComponent(PhysicsBoxCollider);
    Object.assign(collider, {enabled, enabledInHierarchy: active, _inited: initialized, apply() { calls.push(name); }});
  }
  ctrl._bindMapPhysics(map);
  map.scaleX = 1.2; map.scaleY = .8;
  e.physics.emit('before-step');
  assert.deepEqual(calls, ['live'], 'apply creates fixtures regardless of component enabled state in Creator2.4');
  e.physics.emit('before-step');
  assert.deepEqual(calls, ['live'], 'unchanged ancestors must not rebuild fixtures again');
  ctrl.onDestroy();
});

test('Permanent combat buffs survive updates; timed buffs expire without removing adjacent permanent buffs', () => {
  for (const name of ['KinghtFallSoldierBase', 'KinghtFallEnemyBase']) {
    const e = environment(), actor = e.actor(name);
    actor.state = -1; actor.attack = 100;
    const kind = e.load('KinghtFallInterface').KinghtFallEnemyBuffType.DamageAdd;
    actor.addBuff(kind, { addNum: 0.1, time: -1 });
    actor.addBuff(kind, { addNum: 0.2, time: 1 });
    actor.addBuff(kind, { addNum: 0.3, time: -1 });
    actor.onUpdate(0.5);
    assert.equal(actor.getBuffList(kind).length, 3, name + ' retains permanent and unexpired buffs');
    actor.onUpdate(0.5);
    assert.equal(actor.getBuffList(kind).length, 2, name + ' expires only the timed buff');
    actor.onUpdate(60);
    assert.equal(actor.getBuffList(kind).length, 2);
    if (name === 'KinghtFallSoldierBase') near(actor.getAttack(), 140);
    actor.delBuff(kind);
    assert.equal(actor.getBuffList(kind).length, 0, 'permanent buffs can still be removed explicitly');
  }
});

test('Map01 shield enemies reach and attack every left-gate level instead of stalling at an occluded corner', () => {
  for (const level of [1, 2, 3]) for (const hero of [null, { x: -420, y: 600 }]) {
    const e = map01GateEnvironment(level, hero), u = e.actor('KinghtFallEnemyItem02', -600, 940);
    const prefab = JSON.parse(fs.readFileSync(path.join(sourceDir, '../KinghtFallEnemy/ItemEnemy02.prefab'), 'utf8'));
    u.node.addComponent(PhysicsPolygonCollider).points = prefab.find(component => component.__type__ === 'cc.PhysicsPolygonCollider').points;
    const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json').SoldierCfg['90002'];
    u.cfg.AttackRange = config.AttackRange; u.cfg.SearchRange = config.SearchRange;
    delete u.getFind; delete u.onFindList;
    u.time.Attack = 1;
    let attacks = 0;
    u.doAttackStart = () => { attacks++; };
    u.bornInfo = { nodeIndex: 0, pathList: [new Node('route goal', e.game.ndMain, -532.576, 759.256)] };
    const nav = e.nav.get(e.game); nav.refresh();
    const radius = nav.radius(u); assert.equal(radius, 20);
    let previous = u.node.position;
    for (let frame = 0; frame < 400 && !attacks; frame++) {
      e.setTime(frame * 50); u.onUpdate(0.05);
      const current = u.node.position;
      assert(nav.grid.segmentClear(previous, current, radius), 'Gate approach crossed terrain or a wall');
      assert(distance(previous, current) <= 3.000001, 'Gate approach teleported');
      previous = current;
    }
    assert(attacks > 0, `Level ${level}, hero ${!!hero}: enemy remained at ${JSON.stringify(u.node.position)}`);
    assert.equal(u.bornInfo.nodeIndex, 0, 'Combat must not consume the authored route');
  }
});

test('A nearby hero behind a closed gate cannot keep shield enemies targeting an unreachable origin', () => {
  const e = environment(); installIntersection(e.cc);
  e.game.mapSize = { width: 600, height: 600 };
  e.game.ctrPlay.node.setPosition(20, 0);
  const gate = new Node('offset-origin gate', e.game.ndMain, 0, 180);
  const polygon = [{ x: -10, y: -280 }, { x: 10, y: -280 }, { x: 10, y: 280 }, { x: -10, y: 280 }];
  gate.addComponent(PhysicsPolygonCollider).points = polygon.map(p => ({ x: p.x, y: p.y - gate.y }));
  e.game.gameData.buildings.push({ node: gate, getIsWork: () => true,
    getWposPhyCol: () => [polygon], getWposPhyCol2: () => [{ tagNode: gate, points: polygon }] });
  const u = e.actor('KinghtFallEnemyItem02', -100, 0);
  u.node.addComponent(PhysicsBoxCollider).size = { width: 22, height: 22 };
  u.cfg.AttackRange = 50; u.cfg.SearchRange = 220; u.time.Attack = 1;
  delete u.getFind; delete u.onFindList;
  let attacks = 0; u.doAttackStart = () => { attacks++; };
  u.bornInfo = { nodeIndex: 0, pathList: [new Node('objective', e.game.ndMain, 150, 0)] };
  const nav = e.nav.get(e.game); nav.refresh();
  assert.equal(nav.grid.findPath(u.node.position, e.game.ctrPlay.node.position, nav.radius(u)), null);
  for (let frame = 0; frame < 200 && !attacks; frame++) { e.setTime(frame * 50); u.onUpdate(0.05); }
  assert(attacks > 0, 'Enemy never approached and attacked the gate blocking its route to the hero');
  assert.equal(u.getFind().tag, gate);
  assert.equal(u.bornInfo.nodeIndex, 0);
});

test('A small physics nudge invalidates a failed overlap escape instead of leaving the unit blocked forever', () => {
  const e = environment(); e.box(0, 0, 240, 400);
  const u = e.unit(65, 0), goal = { x: 180, y: 0 }, nav = e.nav.get(e.game);
  assert.equal(e.nav.moveTo(u, e.game, goal, 0).blocked, true);
  assert.equal(nav.stats.searches, 1);
  // This two-pixel nudge puts a valid exit within the planner's escape radius.
  u.node.x = 67;
  const result = e.nav.moveTo(u, e.game, goal, 0.1);
  assert.equal(result.blocked, false);
  assert.equal(nav.stats.searches, 2);
  assert(u.node.x > 67, 'The valid gradual escape did not begin');
  assert(distance(u.node, { x: 67, y: 0 }) <= 6.000001, 'Retrying the escape teleported the unit');
});

test('Subpixel target movement invalidates a failed path when the target becomes approachable', () => {
  const e = environment(); e.box(0, 0, 20, 400);
  const u = e.unit(-100, 0), nav = e.nav.get(e.game);
  assert.equal(e.nav.moveTo(u, e.game, { x: 10.1, y: 0 }, 0).blocked, true);
  assert.equal(nav.stats.searches, 1);
  // The first point is outside the far face; it cannot project through the wall.
  // Moving 0.2px inside the polygon permits a safe approach to its near face.
  const result = e.nav.moveTo(u, e.game, { x: 9.9, y: 0 }, 0.1);
  assert.equal(result.blocked, false);
  assert.equal(nav.stats.searches, 2);
  assert(u.node.x > -100);
  assert(nav.grid.segmentClear({ x: -100, y: 0 }, u.node, 12));
});

test('A live Map01 crowd displacement past an escape anchor advances toward the rally instead of backtracking', () => {
  const e = map01GateEnvironment(1, null), goal = { x: -300, y: 600 };
  // Both positions were observed in the actual Creator inward-rally run.
  const u = e.unit(-567.1206546305175, 867.3987725677789);
  u.navigationTeam = 'friendly';
  u.node.addComponent(PhysicsBoxCollider).size = { width: 22, height: 22 };
  const nav = e.nav.get(e.game), grid = nav.gridFor(u);
  e.nav.moveTo(u, e.game, goal, 0);
  assert(u._navigationState.escape, 'Fixture must begin inside inflated cliff clearance');
  assert.equal(u._navigationState.index, 0);
  const displaced = { x: -577.8107077083368, y: 856.559562021177 };
  assert(grid.isWalkable(displaced, 20));
  assert(grid.segmentClear(displaced, goal, 20));
  u.node.setPosition(displaced);
  const result = e.nav.moveTo(u, e.game, goal, 0.1);
  assert.equal(result.blocked, false);
  assert(u.node.y < displaced.y, 'Unit backtracked north to its obsolete escape anchor');
  assert(u.node.x > displaced.x, 'Unit failed to advance east toward the rally');
  assert(grid.segmentClear(displaced, u.node, 20));
  assert.equal(nav.stats.searches, 1, 'A safe cached segment should not need a new search');
});

test('Cached escape lookahead retains detour corners when the next shortcut crosses a wall', () => {
  const e = environment(); e.box(0, 0, 40, 80);
  const u = e.unit(-25, 0), goal = { x: 100, y: 0 }, nav = e.nav.get(e.game);
  e.nav.moveTo(u, e.game, goal, 0);
  assert(u._navigationState.escape);
  const displaced = { x: -65, y: 55 }, grid = nav.grid, radius = nav.radius(u);
  u.node.setPosition(displaced);
  assert(grid.isWalkable(displaced, radius));
  assert.equal(grid.segmentClear(displaced, goal, radius), false, 'Fixture must require a detour');
  let previous = displaced, result;
  for (let frame = 0; frame < 20; frame++) {
    e.setTime(frame * 100); e.nav.beginFrame(e.game);
    result = e.nav.moveTo(u, e.game, goal, 1);
    const current = { x: u.node.x, y: u.node.y };
    assert(grid.segmentClear(previous, current, radius), 'Lookahead skipped a required wall corner');
    assert(distance(previous, current) <= 60.000001, 'Lookahead teleported the unit');
    previous = current;
    if (result.reached) break;
  }
  assert(result.reached, 'Safe lookahead failed to complete the detour');
});

test('Delayed attack effects cannot survive pooling and reuse of the same enemy or allied node', () => {
  for (const [name, type] of [['KinghtFallEnemyBase', 'enemy'], ['KinghtFallSoldierBase', 'ally']]) {
    const e = environment();
    e.stubs.PoolMgr = { PoolMgr: { getInstance: () => ({ freeNode(_key, node) { node.active = false; } }) } };
    e.game.gameData.delEnemy = e.game.gameData.delSoldier = () => {};
    e.game.setPath = () => ({ nodeIndex: 0, pathList: [] });
    e.load('KinghtFallDataMgr').KinghtFallDataMgr.getInstance().data.GameTools = { timings: { [type + ':90001:default']: { attack: .1 } } };
    const actor = e.actor(name), timing = e.load('GameToolsOverrides');
    actor.initData(90001, {});
    const generation = actor.node._combatGeneration;
    let hits = 0; actor.doAttack = () => hits++;
    actor.doAttackStart(); timing.tick(.04, true); assert.equal(hits, 0); assert(timing.isPending(actor));
    actor.freeNode(); assert.equal(timing.isPending(actor), false); assert(actor.node._combatGeneration > generation);
    actor.node.active = true; actor.initData(90001, {});
    timing.tick(.2, true); assert.equal(hits, 0, 'Old delayed effect fired in the reused actor generation');
    actor.doAttackStart(); timing.tick(.1, true); assert.equal(hits, 1, 'Fresh generation lost its own timed attack');
  }
});

test('A delayed hit reads current-frame building geometry after navigation begins its new frame', () => {
  const e = environment(), ctrl = new (e.load('KinghtFallGameCtrl').default)();
  Object.assign(ctrl, e.game, { gameStatus: 1, ctrPlay: { doMove() {}, onUpdata() {} },
    ndPlayArr2: [], ndEnemyArr: [], ndSoldArr: [], ndBuildArr2: [] });
  ctrl.gameData.onUpdata = () => {};
  e.load('KinghtFallUIGame').default.instance.ctrGame = ctrl;
  const building = new (e.load('KinghtFallBuildBase').default)();
  Object.assign(building, { node: new Node('building', ctrl.ndMain), index: 1, ndAniOther: [], isDestroyed: false });
  const collider = building.node.addComponent(PhysicsPolygonCollider);
  collider.tag = 1; collider.points = [new Vec2(-10, -10), new Vec2(10, -10), new Vec2(10, 10), new Vec2(-10, 10)];
  e.nav.beginFrame(ctrl);
  assert.equal(building.getWposPhyCol2()[0].points[0].x, -10);
  building.node.x = 100;
  const owner = e.actor('KinghtFallEnemyBase'), timing = e.load('GameToolsOverrides');
  e.load('KinghtFallDataMgr').KinghtFallDataMgr.getInstance().data.GameTools = { timings: { 'enemy:90001:default': { attack: .1 } } };
  let hitGeometry;
  timing.attack(owner, 'enemy', () => { hitGeometry = building.getWposPhyCol2()[0].points[0].x; });
  ctrl.onUpdate(.1);
  assert.equal(hitGeometry, 90, 'Delayed hit observed the previous frame\'s building position');
});

console.log(`Navigation runtime integration: ${passed} tests passed.`);
