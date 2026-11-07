'use strict';
// Exercise persistent army orders through the shipped controller and soldier AI.
const assert = require('node:assert/strict');
const { environment, Node, Vec2, PhysicsBoxCollider, PhysicsPolygonCollider, PolygonCollider, installIntersection, map01GateEnvironment, distance, near } = require('./runtime-harness.cjs');
const { NavigationGrid } = require('../../assets/_script/NavigationGrid');
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }
function soldier(e, x = -100, y = 0, n = 1) {
  const unit = e.actor('KinghtFallSoldierItem' + String(n).padStart(2, '0'), x, y);
  delete unit.getFind; delete unit.onFindList;
  e.game.gameData.soldiers.push(unit);
  return unit;
}
function controller(e) {
  Object.setPrototypeOf(e.game, e.load('KinghtFallGameCtrl').default.prototype);
  Object.assign(e.game, { vec2_1: new Vec2(), vec2_2: new Vec2(), pathIndex: 0, isAgg: false });
  return e.game;
}
function advance(e, unit, count = 1, dt = 0.05) {
  for (let frame = 0; frame < count; frame++) {
    e.clock = (e.clock || 0) + dt * 1000;
    e.setTime(e.clock); e.nav.beginFrame(e.game); unit.onUpdate(dt);
  }
}
function rally(e, point) {
  e.game.rallyPoint = { index: 7, pos: { x: point.x, y: point.y } };
  e.game.isAgg = false;
  e.game.gameData.soldiers.forEach(unit => unit.applyArmyOrder(e.game));
}
function gateApproaches(e, nav, gate) {
  const bounds = nav.grid.bounds;
  // Measure gate clearance independently of the map-edge body clearance.
  return new NavigationGrid(gate.getNavigationGateShapes().map(shape => shape.points.map(point => e.game.ndMain.convertToNodeSpaceAR(point))),
    { minX: bounds.minX - 100, minY: bounds.minY - 100, maxX: bounds.maxX + 100, maxY: bounds.maxY + 100 }, 80);
}

test('Rally placement persists with no army and new or revived soldiers inherit the current destination', () => {
  const e = environment(), game = controller(e);
  game.ctrPlay.node.setPosition(100, 0);
  game.changeAge();
  assert.equal(game.isAgg, false);
  assert.equal(game.ndAggFlag.active, true, 'empty army discarded its rally marker');
  assert(game.rallyPoint);
  near(game.rallyPoint.pos.x, 100); near(game.rallyPoint.pos.y, 0);
  const unit = soldier(e);
  unit.setNew();
  assert(unit.rallyPoint, 'new soldier did not inherit the rally');
  advance(e, unit, 100);
  near(unit.node.x, 100); near(unit.node.y, 0);
  assert(unit.rallyPoint); assert(game.rallyPoint); assert(game.ndAggFlag.active);
  assert.equal(unit.state, 0);
  game.ctrPlay.node.setPosition(-150, 100);
  advance(e, unit, 10);
  near(unit.node.x, 100); near(unit.node.y, 0);
  unit.node.setPosition(-100, 0); unit.node.active = false; unit.hp = 0;
  unit._navigationState = { stale: true };
  unit.setNew();
  assert.equal(unit._navigationState, null); assert(unit.rallyPoint);
  advance(e, unit);
  assert(unit.node.x > -100, 'revived soldier stayed at its spawn');
  game.changeAge();
  near(game.rallyPoint.pos.x, -150); near(unit.rallyPoint.pos.x, -150);
  game.clearArmyOrder();
  assert.equal(game.rallyPoint, null); assert.equal(unit.rallyPoint, null);
  assert.equal(game.ndAggFlag.active, false); assert.equal(unit.isAgg, false);
});

test('Follow mode tracks the current hero position and toggles off without accumulating breadcrumbs', () => {
  const e = environment(), game = controller(e), unit = soldier(e);
  e.load('KinghtFallConfig').KinghtFallParameter.FollowMode = 2;
  game.ctrPlay.node.setPosition(100, 0);
  game.changeAge();
  assert.equal(game.isAgg, true); assert.equal(unit.isAgg, true);
  assert.equal(game.rallyPoint, null); assert.equal(game.ndAggFlag.active, false);
  advance(e, unit);
  assert(unit.node.x > -100);
  for (let i = 0; i < 1200; i++) {
    game.ctrPlay.node.setPosition(i % 2 ? 100 : 120, 0);
    game.addPathNode();
  }
  assert(game.pathList.length <= 1, 'follow retained historical hero breadcrumbs');
  assert(!unit.pathList || unit.pathList.pathInfoList.length <= 1);
  unit.node.setPosition(-100, 0); unit.setNew();
  assert.equal(unit.isAgg, true, 'revived unit lost follow mode');
  game.changeAge();
  assert.equal(game.isAgg, false); assert.equal(unit.isAgg, false);
  assert.equal(unit.rallyPoint, null);
});

test('Every soldier archetype attacks a nearby enemy while rallying, then resumes the persistent rally', () => {
  for (let n = 1; n <= 4; n++) {
    const e = environment(), unit = soldier(e, -100, 0, n);
    let dead = false, attacks = 0;
    const target = { node: new Node('enemy', e.game.ndMain, -100, 50), isDead: () => dead };
    e.game.gameData.enemies.push(target);
    unit.doAttackStart = () => { attacks++; dead = true; unit.doIdel(); };
    unit.time.Attack = 1;
    rally(e, { x: 100, y: 0 });
    advance(e, unit);
    assert(unit.node.y > 0, 'ordered soldier ignored an enemy inside search range: ' + n);
    near(unit.node.x, -100);
    advance(e, unit, 100);
    assert.equal(attacks, 1, 'soldier did not enter its regular attack: ' + n);
    near(unit.node.x, 100); near(unit.node.y, 0);
    assert(unit.rallyPoint); assert(unit._settledPoint);
  }
});

test('Soldiers retaliate against a ranged attacker outside normal search range and resume the order after it disappears', () => {
  const e = environment(), unit = soldier(e);
  let dead = false;
  const attacker = { node: new Node('ranged enemy', e.game.ndMain, -100, 100), cfg: { AttackRange: 150 }, isDead: () => dead };
  e.game.gameData.enemies.push(attacker);
  rally(e, { x: 100, y: 0 });
  unit.node.getPosition(unit.vec2_1);
  assert.equal(unit.getFind(), null, 'fixture attacker is inside normal acquisition range');
  unit.onAttacked(1, attacker);
  advance(e, unit);
  assert(unit.node.y > 0, 'damage did not interrupt the rally to retaliate');
  dead = true;
  advance(e, unit, 100);
  near(unit.node.x, 100); near(unit.node.y, 0);
  assert(unit.rallyPoint);
});

test('A rally at a blocked point stays pending at the safe projection and completes after the obstruction is removed', () => {
  const e = environment(), unit = soldier(e), obstacle = e.box(0, 0, 40, 40);
  rally(e, { x: 0, y: 0 });
  advance(e, unit, 100);
  assert(distance(unit.node.position, { x: 0, y: 0 }) > 20);
  assert.equal(unit._settledPoint, null, 'projected endpoint was mistaken for the rally destination');
  assert(unit.rallyPoint);
  obstacle.enabled = false; e.nav.beginFrame(e.game);
  advance(e, unit, 100);
  near(unit.node.x, 0); near(unit.node.y, 0);
  assert(unit._settledPoint);
});

test('A rally beside a wall can settle at a nearby safe point on the same side', () => {
  const e = environment(), unit = soldier(e);
  e.box(0, 0, 40, 100);
  rally(e, { x: -21, y: 0 });
  advance(e, unit, 100);
  assert(unit._settledPoint, 'body clearance prevented settling beside the wall');
  assert(distance(unit.node.position, e.game.rallyPoint.pos) <= 48);
  assert.equal(unit.state, 0); assert(unit.rallyPoint);
  assert(e.nav.canStopFollowing(unit, e.game, e.game.rallyPoint.pos));
});

test('Gate triggers admit friendly soldiers from either side and keep side walls solid', () => {
  for (const x of [-50, 50]) {
    const e = environment(); installIntersection(e.cc);
    const gate = new (e.load('KinghtFallBuildWall').default)();
    gate.node = new Node('gate', e.game.ndMain); gate.index = 1;
    const leaf = gate.node.addComponent(PhysicsPolygonCollider);
    leaf.uuid = 'leaf'; leaf.tag = 1;
    leaf.points = [new Vec2(-10, -60), new Vec2(10, -60), new Vec2(10, 60), new Vec2(-10, 60)];
    gate.colPoint.leaf = leaf.points.map(point => point.clone());
    const trigger = gate.node.addComponent(PolygonCollider);
    trigger.points = [new Vec2(-40, -70), new Vec2(40, -70), new Vec2(40, 70), new Vec2(-40, 70)];
    const wing = e.box(0, 110, 20, 100, true);
    gate.ndAniOther = [{ node: wing.node }];
    gate.ndAniMain = gate.ndAniDown = { animation: 'idle', setAnimation() {}, addAnimation() {} };
    e.cc.Tween = { stopAllByTarget() {} };
    e.cc.tween = target => ({ to(_time, _properties, options) { this.options = options; return this; }, start() { this.options.onUpdate(target, 1); } });
    const unit = soldier(e, x, 0);
    assert.equal(gate.hasFriendlyAtGate(e.game), true, 'soldier did not open the gate from side ' + x);
    gate.doTime();
    assert.equal(gate.isOpen, true); assert.equal(leaf.enabled, false);
    assert.equal(wing.enabled, true, 'opening disabled a permanent side wall');
    const shapes = gate.getNavigationGateShapes();
    assert.equal(shapes.length, 1); assert.equal(shapes[0].collider, leaf);
    assert.equal(shapes[0].points.length, 4, 'open gate lost logical enemy geometry');
    // Resizing/repositioning the map must update the trigger in world space.
    e.game.ndMain.setPosition(420, -170); e.game.ndMain.scaleX = e.game.ndMain.scaleY = 1.7;
    assert.equal(gate.hasFriendlyAtGate(e.game), true);
    unit.node.setPosition(-150, -150);
    e.game.gameData.enemies.push({ node: new Node('enemy in gate', e.game.ndMain), isDead: () => false });
    assert.equal(gate.hasFriendlyAtGate(e.game), false, 'an enemy opened the friendly trigger');
    gate.doTime();
    assert.equal(gate.isOpen, false); assert.equal(leaf.enabled, true);
    unit.node.setPosition(x, 0); unit.isDead = () => true;
    assert.equal(gate.hasFriendlyAtGate(e.game), false, 'dead soldiers held the gate open');
    gate.isDestroyed = true;
    assert.equal(gate.getNavigationGateShapes().length, 0, 'destroyed gate retained a logical wall');
  }
});

test('Map01 intact gates let rallying and following allies cross both ways at every upgrade while enemies remain blocked', () => {
  for (const level of [1, 2, 3]) for (const reverse of [false, true]) for (const mode of ['rally', 'follow']) {
    const outside = { x: -600, y: 940 }, inside = { x: -300, y: 600 };
    const start = reverse ? outside : inside, goal = reverse ? inside : outside;
    const e = map01GateEnvironment(level, null), unit = soldier(e, start.x, start.y);
    const body = require('./fixtures/unit-colliders.json').find(collider => collider.file === 'PlayItemEnemy01.prefab');
    unit.node.addComponent(PhysicsPolygonCollider).points = body.points;
    const nav = e.nav.get(e.game), radius = nav.radius(unit), grid = nav.gridFor(unit);
    assert.equal(radius, 20); assert(grid.isWalkable(start, radius)); assert(grid.isWalkable(goal, radius));
    assert(grid.findPath(start, goal, radius), 'allied gate corridor has no route at level ' + level);
    assert.equal(nav.grid.findPath(start, goal, radius), null, 'intact gate admitted an enemy');
    const gate = e.game.gameData.buildings[2], leaf = gate.getNavigationGateShapes()[0].collider;
    // A visual/physics opening for the hero or ally must not let enemies through.
    leaf.enabled = false; e.nav.beginFrame(e.game); nav.refresh();
    assert.equal(nav.grid.findPath(start, goal, radius), null, 'temporarily open leaf admitted an enemy');
    if (mode === 'rally') rally(e, goal);
    else { e.game.ctrPlay.node.setPosition(goal); e.game.isAgg = true; unit.applyArmyOrder(e.game); }
    let previous = unit.node.getPosition(), crossedLeaf = false;
    for (let frame = 0; frame < 500 && unit.state !== 0; frame++) {
      advance(e, unit);
      const current = unit.node.getPosition();
      assert(nav.gridFor(unit).segmentClear(previous, current, radius), 'ally crossed terrain or a fixed side wall');
      assert(distance(previous, current) <= 3.000001, 'ally teleported through the gate');
      if (!nav.grid.segmentClear(previous, current, radius)) crossedLeaf = true;
      previous = current;
    }
    assert.equal(unit.state, 0, 'allied ' + mode + ' stalled at gate level ' + level + ', reverse=' + reverse);
    if (mode === 'rally') { near(unit.node.x, goal.x); near(unit.node.y, goal.y); assert(unit.rallyPoint); }
    else { assert(distance(unit.node.position, goal) <= 20); assert(e.nav.canStopFollowing(unit, e.game, goal)); assert(unit.isAgg); }
    assert(crossedLeaf, 'fixture did not actually cross the intact gate leaf');
    assert(gate.ndAniOther.every(part => part.node.getComponents(PhysicsPolygonCollider).every(collider => collider.enabled)), 'gate crossing disabled a side wall');
  }
});

test('Following soldiers do not stop within follow range while a solid wall separates them from the hero', () => {
  const e = environment(), unit = soldier(e, -8, 0);
  e.box(0, 0, 2, 400);
  e.game.ctrPlay.node.setPosition(8, 0); e.game.isAgg = true;
  unit.applyArmyOrder(e.game);
  advance(e, unit, 30);
  assert.equal(unit.isAgg, true);
  assert.notEqual(unit.state, 0, 'follow settled on the wrong side of a wall');
  assert.equal(e.nav.canStopFollowing(unit, e.game, e.game.ctrPlay.node.position), false);
});

test('Followers within the stop distance still cross a gate before stopping beside the hero', () => {
  for (const side of [-1, 1]) {
    const e = environment(), unit = soldier(e, side * 8, 0), leaf = e.box(0, 0, 2, 400, true);
    e.game.gameData.buildings[0].getNavigationGateShapes = () => [{ collider: leaf, points: [new Vec2(-1, -200), new Vec2(1, -200), new Vec2(1, 200), new Vec2(-1, 200)] }];
    e.game.ctrPlay.node.setPosition(-side * 8, 0); e.game.isAgg = true;
    unit.applyArmyOrder(e.game);
    assert.equal(e.nav.canStopFollowing(unit, e.game, e.game.ctrPlay.node.position), false);
    advance(e, unit, 20);
    assert.equal(unit.state, 0);
    assert(unit.node.x * side < -1, 'nearby hero left its follower on the opposite side of the gate');
    assert(e.nav.canStopFollowing(unit, e.game, e.game.ctrPlay.node.position));
  }
});

test('Melee and ranged enemy damage deliver the attacker to the real soldier retaliation hook', () => {
  for (const name of ['KinghtFallEnemyBase', 'KinghtFallEnemyLong', 'KinghtFallEnemyItem07', 'KinghtFallEnemyItem08', 'KinghtFallEnemyItem10']) {
    const e = environment(), unit = soldier(e), attacker = e.actor(name, -100, 100);
    attacker.cfg = { ...e.cfg, ID: 90002, AttackRange: 150, Suppressed: -1 };
    delete attacker.attackRange;
    attacker.getAttack = () => 1;
    attacker.doSplashDamage = () => {};
    e.game.gameData.enemies.push(attacker);
    e.game.ctrPlay.isDead = () => true;
    e.cc.isValid = value => !!value;
    Object.assign(e.load('KinghtFallUIGame').default.instance.ctrEffect, {
      showDamageNum() {}, onMonsterAttack() {}, onAttack2() {}
    });
    e.game.onShotEnemy = () => ({ pos: new Vec2(), ctr: { setParent() {}, setTag(_position, _target, onHit) { onHit(); } } });
    rally(e, { x: 100, y: 0 });
    attacker.doAttack();
    assert(unit.hp < 100, name + ' did not hit the soldier fixture');
    assert(unit._retaliationTarget === attacker, name + ' dropped the damage source');
    advance(e, unit);
    assert(unit.node.y > 0, name + ' damage did not cause retaliation');
  }
});

test('A slow soldier keeps pursuing a ranged attacker while making progress, then resumes its rally', () => {
  const e = environment(), unit = soldier(e);
  unit.getSpeed = () => 10;
  let dead = false, attacks = 0;
  const attacker = { node: new Node('distant archer', e.game.ndMain, -100, 100), cfg: { AttackRange: 150 }, isDead: () => dead };
  e.game.gameData.enemies.push(attacker);
  unit.doAttackStart = () => { attacks++; dead = true; unit.doIdel(); };
  unit.time.Attack = 1;
  rally(e, { x: 100, y: 0 });
  unit.onAttacked(1, attacker);
  advance(e, unit, 80);
  near(unit.node.x, -100);
  assert(unit.node.y >= 39, 'retaliation expired during a valid pursuit taking more than three seconds');
  assert(unit._retaliationTime > 0);
  advance(e, unit, 650);
  assert.equal(attacks, 1, 'slow soldier abandoned its attacker before reaching attack range');
  near(unit.node.x, 100); near(unit.node.y, 0);
  assert(unit.rallyPoint); assert(unit._settledPoint);
});

test('A stalled retaliation attempt releases its target and resumes a reachable rally', () => {
  const e = environment(), unit = soldier(e);
  e.box(0, 50, 400, 10);
  const attacker = { node: new Node('unreachable archer', e.game.ndMain, -100, 100), cfg: { AttackRange: 150 }, isDead: () => false };
  e.game.gameData.enemies.push(attacker);
  rally(e, { x: 100, y: 0 });
  unit.onAttacked(1, attacker);
  advance(e, unit, 20);
  near(unit.node.x, -100); near(unit.node.y, 0);
  advance(e, unit, 150);
  near(unit.node.x, 100); near(unit.node.y, 0);
  assert.equal(unit._retaliationTime, 0);
  assert(unit.rallyPoint); assert(unit._settledPoint);
});

test('Delayed ranged hits keep damage but do not retaliate against a recycled or destroyed shooter', () => {
  for (const name of ['KinghtFallEnemyLong', 'KinghtFallEnemyItem08']) for (const invalidation of ['recycled', 'destroyed']) {
    const e = environment(), unit = soldier(e), attacker = e.actor(name, -100, 100);
    attacker.cfg = { ...e.cfg, ID: 90002, AttackRange: 150, Suppressed: -1 };
    attacker.getAttack = () => 1;
    attacker.node._combatGeneration = 1;
    e.game.gameData.enemies.push(attacker);
    e.game.ctrPlay.isDead = () => true;
    e.cc.isValid = value => !!value && !value.destroyed;
    Object.assign(e.load('KinghtFallUIGame').default.instance.ctrEffect, { showDamageNum() {}, onMonsterAttack() {} });
    let hit;
    e.game.onShotEnemy = () => ({ pos: new Vec2(), ctr: { setParent() {}, setTag(_position, _target, onHit) { hit = onHit; } } });
    rally(e, { x: 100, y: 0 });
    attacker.doAttack();
    assert.equal(typeof hit, 'function', name + ' did not launch its projectile');
    assert.equal(unit.hp, 100);
    if (invalidation === 'recycled') attacker.node._combatGeneration++;
    else attacker.node.destroyed = true;
    hit();
    assert.equal(unit.hp, 99, name + ' incorrectly discarded valid in-flight damage');
    assert(!unit._retaliationTarget, name + ' retaliated against its ' + invalidation + ' shooter');
    advance(e, unit);
    assert(unit.node.x > -100, name + ' interrupted rally for a stale shooter identity');
    near(unit.node.y, 0);
  }
});

test('Crowded Map01 orders reserve distinct body-clear destinations on the requested side of every gate level', () => {
  for (const level of [1, 2, 3]) for (const count of [30, 60]) for (const anchor of [{ x: -300, y: 600 }, { x: -600, y: 940 }]) {
    const e = map01GateEnvironment(level);
    controller(e); e.game.ctrPlay.node.setPosition(anchor);
    e.game.ctrPlay.node.addComponent(e.cc.PhysicsCircleCollider).radius = 20;
    const gate = e.game.gameData.buildings.find(building => building.node.name === '17-cq');
    const leaf = gate.node.getComponents(PhysicsPolygonCollider)[0];
    gate.getNavigationGateShapes = () => [{ collider: leaf, points: leaf.points.map(p => leaf.node.convertToWorldSpaceAR(p)) }];
    for (let i = 0; i < count; i++) {
      const unit = soldier(e, -300, 600, i % 2 ? 2 : 3);
      unit.node.addComponent(PhysicsPolygonCollider).points = [new Vec2(-15, 3), new Vec2(0, -5), new Vec2(15, 3), new Vec2(0, 11)];
    }
    rally(e, anchor); e.nav.beginFrame(e.game);
    const nav = e.nav.get(e.game), units = e.game.gameData.soldiers;
    const slots = units.map(unit => e.game.getArmyOrderGoal(unit, anchor));
    const approaches = gateApproaches(e, nav, gate);
    assert(slots.every(slot => slot && slot.pos), 'formation left soldiers waiting for slots: ' + level + '/' + count + '/' + anchor.y);
    slots.forEach((slot, i) => {
      assert(nav.grid.isWalkable(slot.pos, nav.radius(units[i])), 'formation chose terrain or an intact gate leaf');
      assert(nav.grid.segmentClear(anchor, slot.pos, 0), 'formation chose the wrong side of a gate');
      assert(approaches.isWalkable(slot.pos, slot.radius * 2 + 8 - 1e-6), 'formation parked a body in the protected gate approach');
      assert(distance(anchor, slot.pos) <= 480);
      if (level === 3 && count === 60) {
        const start = anchor.y === 600 ? { x: -600, y: 940 } : { x: -300, y: 600 };
        assert(nav.gridFor(units[i]).findPath(start, slot.pos, nav.radius(units[i])), 'a formation slot cannot be reached through the gate at full body clearance');
      }
      for (let j = 0; j < i; j++) assert(distance(slot.pos, slots[j].pos) + .01 >= slot.radius + slots[j].radius - 2, 'reserved body destinations overlap');
    });
    assert.equal(nav.stats.searches, 0, 'assigning formation slots issued per-unit path searches');
  }
});

test('Live Map01 gate contact positions receive destinations beyond the protected approach', () => {
  const e = map01GateEnvironment(3), game = controller(e), anchor = { x: -300, y: 600 };
  game.ctrPlay.node.setPosition(anchor);
  const observed = [{ x: -385.29912398256045, y: 731.6858574673008 }, { x: -371.2131780856619, y: 722.6605702858508 }];
  const badGoal = { x: -376, y: 731.6358613752346 };
  const units = [];
  for (let i = 0; i < 60; i++) {
    const point = observed[i] || anchor, unit = soldier(e, point.x, point.y, 3);
    unit.node.addComponent(PhysicsPolygonCollider).points = [new Vec2(-15, 3), new Vec2(0, -5), new Vec2(15, 3), new Vec2(0, 11)];
    units.push(unit);
  }
  rally(e, anchor); e.nav.beginFrame(game);
  const nav = e.nav.get(game), gate = game.gameData.buildings.find(building => building.node.name === '17-cq');
  const slots = units.map(unit => game.getArmyOrderGoal(unit, anchor));
  const approaches = gateApproaches(e, nav, gate);
  assert(nav.grid.isWalkable(badGoal, 20), 'recorded failure depended on a statically reachable goal');
  assert(!approaches.isWalkable(badGoal, 48), 'recorded goal was outside the protected approach');
  assert.equal(game.settleArmyCrowd(units[1], observed[1]), false, 'recovery must not accept resting inside the gate approach');
  // A layout recheck must also remove a previously retained unsafe slot.
  game._armyFormation.slots.set(units[1], { pos: badGoal, radius: 20 });
  game._armyFormation.revision--;
  e.nav.beginFrame(game);
  const reassigned = units.map(unit => game.getArmyOrderGoal(unit, anchor));
  assert(reassigned.every(slot => slot && slot.pos && approaches.isWalkable(slot.pos, 48)));
  assert(distance(reassigned[1].pos, badGoal) > 1, 'retained slot kept directing its owner into the gate approach');
  for (let i = 0; i < 2; i++) {
    assert(nav.gridFor(units[i]).findPath(observed[i], reassigned[i].pos, 20), 'live contact position lost its safe exit route');
    advance(e, units[i], 300);
    assert.equal(units[i].state, 0, 'unit did not finish its route away from the gate approach');
    assert(approaches.isWalkable(units[i].node.position, 48));
  }
  assert(slots.every(slot => slot && slot.pos), 'new layout lost army capacity');
});

test('Gate approach reservations preserve lone-unit orders and release destroyed gates', () => {
  const e = map01GateEnvironment(3), game = controller(e), anchor = { x: -376, y: 731.6358613752346 };
  game.ctrPlay.node.setPosition(anchor);
  const first = soldier(e, -371, 722, 3);
  first.node.addComponent(PhysicsPolygonCollider).points = [new Vec2(-15, 3), new Vec2(0, -5), new Vec2(15, 3), new Vec2(0, 11)];
  assert.equal(game.getArmyOrderGoal(first, anchor), null, 'a lone soldier lost its exact command destination');
  const second = soldier(e, -380, 700, 3);
  second.node.addComponent(PhysicsPolygonCollider).points = [new Vec2(-15, 3), new Vec2(0, -5), new Vec2(15, 3), new Vec2(0, 11)];
  rally(e, anchor); e.nav.beginFrame(game);
  const nav = e.nav.get(game), gate = game.gameData.buildings.find(building => building.node.name === '17-cq');
  const intact = [first, second].map(unit => game.getArmyOrderGoal(unit, anchor));
  const approaches = gateApproaches(e, nav, gate), shapes = gate.getNavigationGateShapes();
  assert(intact.every(slot => approaches.isWalkable(slot.pos, 48)));
  shapes.forEach(shape => { shape.collider.enabled = false; });
  gate.getNavigationGateShapes = () => [];
  game.applyArmyOrder(); e.nav.beginFrame(game);
  const destroyed = [first, second].map(unit => game.getArmyOrderGoal(unit, anchor));
  assert(destroyed.every(slot => slot && slot.pos && nav.grid.isWalkable(slot.pos, 20)));
  assert(destroyed.some(slot => !approaches.isWalkable(slot.pos, 48)), 'a destroyed gate kept reserving its old approach');
});

test('Formation slots survive death, revival and newcomers without renumbering existing soldiers', () => {
  const e = environment(), game = controller(e);
  game.ctrPlay.node.setPosition(0, 0);
  const units = [soldier(e), soldier(e), soldier(e), soldier(e)];
  game.changeAge(); e.nav.beginFrame(game);
  const original = units.map(unit => ({ ...game.getArmyOrderGoal(unit, game.rallyPoint.pos).pos }));
  delete units[0].isDead; units[0].state = 4; units[0].node.active = false;
  const newcomer = soldier(e); newcomer.applyArmyOrder(game);
  e.nav.beginFrame(game);
  units.forEach((unit, i) => { const point = game.getArmyOrderGoal(unit, game.rallyPoint.pos).pos; near(point.x, original[i].x); near(point.y, original[i].y); });
  units[0].setNew(); e.nav.beginFrame(game);
  const revived = game.getArmyOrderGoal(units[0], game.rallyPoint.pos).pos;
  near(revived.x, original[0].x); near(revived.y, original[0].y);
  assert(units[0].rallyPoint);
});

test('Sixty-unit formations bound geometry work and reuse retained slots when following', () => {
  for (const actualMap of [true, false]) {
    const e = actualMap ? map01GateEnvironment(3) : environment(), game = controller(e);
    const anchor = actualMap ? { x: -300, y: 600 } : { x: 0, y: 0 };
    game.isAgg = true; game.ctrPlay.node.setPosition(anchor);
    for (let i = 0; i < 60; i++) {
      const unit = soldier(e);
      unit.node.addComponent(PhysicsPolygonCollider).points = [new Vec2(-15, 3), new Vec2(0, -5), new Vec2(15, 3), new Vec2(0, 11)];
    }
    e.nav.beginFrame(game);
    const navigation = e.nav.get(game); navigation.refresh();
    let walks = 0, segments = 0;
    const walk = navigation.grid.isWalkable, segment = navigation.grid.segmentClear;
    navigation.grid.isWalkable = function () { walks++; return walk.apply(this, arguments); };
    navigation.grid.segmentClear = function () { segments++; return segment.apply(this, arguments); };
    const units = game.gameData.soldiers;
    const slots = units.map(unit => game.getArmyOrderGoal(unit, anchor));
    assert(slots.every(slot => slot && slot.pos));
    assert(walks < 500 && segments < 500, 'formation repeated terrain checks per soldier: ' + walks + '/' + segments);
    const initialWork = { walks, segments };
    units.forEach(unit => game.getArmyOrderGoal(unit, anchor));
    assert.deepEqual({ walks, segments }, initialWork, 'the same frame rebuilt the formation');
    if (!actualMap) {
      walks = segments = 0;
      const moved = { x: 25, y: 0 }; game.ctrPlay.node.setPosition(moved); e.nav.beginFrame(game);
      units.forEach((unit, i) => {
        const next = game.getArmyOrderGoal(unit, moved);
        near(next.pos.x, slots[i].pos.x + 25); near(next.pos.y, slots[i].pos.y);
      });
      assert(walks <= 61 && segments <= 61, 'following inspected unused candidates after retaining every slot: ' + walks + '/' + segments);
    }
    assert.equal(navigation.stats.searches, 0, 'formation allocation performed path searches');
  }
});

test('Formation arrival tolerates contact jitter and follows a moving hero without collapsing onto its position', () => {
  const e = environment(), game = controller(e), units = [soldier(e), soldier(e), soldier(e), soldier(e)];
  e.load('KinghtFallConfig').KinghtFallParameter.FollowMode = 2;
  game.ctrPlay.node.setPosition(0, 0); game.changeAge(); e.nav.beginFrame(game);
  const slots = units.map(unit => ({ ...game.getArmyOrderGoal(unit, game.ctrPlay.node.position).pos }));
  units.forEach((unit, i) => unit.node.setPosition(slots[i].x + 3, slots[i].y));
  units.forEach(unit => unit.onUpdate(.05));
  assert(units.every(unit => unit.state === 0));
  const nav = e.nav.get(game), searches = nav.stats.searches;
  units[0].node.setPosition(slots[0].x + 9, slots[0].y);
  advance(e, units[0]);
  assert.equal(units[0].state, 0); assert.equal(nav.stats.searches, searches, 'small contact correction restarted route planning');
  game.ctrPlay.node.setPosition(25, 0); e.nav.beginFrame(game);
  units.forEach((unit, i) => {
    const next = game.getArmyOrderGoal(unit, game.ctrPlay.node.position).pos;
    near(next.x, slots[i].x + 25); near(next.y, slots[i].y);
    assert(distance(next, game.ctrPlay.node.position) > 10);
  });
  units[0].onUpdate(.05);
  assert.equal(units[0].state, 1, 'settled follower did not resume when its formation moved');
});

test('Contact-pinned soldiers settle safely in the rally area and still acquire enemies', () => {
  const e = environment(), game = controller(e), unit = soldier(e, -20, 0);
  soldier(e, -20, 18); soldier(e, 40, 0);
  game.ctrPlay.node.setPosition(0, 0); game.changeAge();
  const order = game.rallyPoint, resting = { x: -20, y: 0 };
  for (let i = 0; i < 25; i++) { unit.node.setPosition(resting); advance(e, unit); }
  const slot = game._armyFormation.slots.get(unit);
  assert.equal(unit.state, 0); assert(slot.resting, 'resolved ally contact kept forcing the old numbered slot');
  near(slot.pos.x, resting.x); near(slot.pos.y, resting.y);
  assert.equal(unit.rallyPoint, order);
  let dead = false, attacks = 0;
  e.game.gameData.enemies.push({ node: new Node('enemy', game.ndMain, -20, -10), isDead: () => dead });
  unit.time.Attack = 1; unit.doAttackStart = () => { attacks++; dead = true; unit.doIdel(); };
  advance(e, unit, 10);
  assert.equal(attacks, 1, 'local crowd arrival disabled ordinary combat');
  assert.equal(unit.rallyPoint, order);
});

test('Crowd arrival rejects the wrong gate side and keeps the gate throat clear', () => {
  const e = environment(), game = controller(e), unit = soldier(e, -30, 0);
  soldier(e, -30, 20);
  const leaf = e.box(0, 0, 4, 400, true);
  game.gameData.buildings[0].getNavigationGateShapes = () => [{ collider: leaf, points: [new Vec2(-2, -200), new Vec2(2, -200), new Vec2(2, 200), new Vec2(-2, 200)] }];
  game.ctrPlay.node.setPosition(40, 0); game.changeAge(); e.nav.beginFrame(game);
  game.getArmyOrderGoal(unit, game.rallyPoint.pos);
  assert.equal(game.settleArmyCrowd(unit, unit.node.position), false, 'crowd arrival accepted the opposite gate side');
  unit.node.setPosition(20, 0); game.gameData.soldiers[1].node.setPosition(20, 18);
  assert.equal(game.settleArmyCrowd(unit, unit.node.position), false, 'crowd arrival parked a unit in the gate throat');
});

test('A short hero move across a gate invalidates the previous-side follow formation', () => {
  const e = environment(), game = controller(e), units = [soldier(e, -40, 0), soldier(e, -40, 25)];
  const leaf = e.box(0, 0, 2, 400, true);
  game.gameData.buildings[0].getNavigationGateShapes = () => [{ collider: leaf, points: [new Vec2(-1, -200), new Vec2(1, -200), new Vec2(1, 200), new Vec2(-1, 200)] }];
  e.load('KinghtFallConfig').KinghtFallParameter.FollowMode = 2;
  game.ctrPlay.node.setPosition(-8, 0); game.changeAge(); e.nav.beginFrame(game);
  units.forEach(unit => assert(game.getArmyOrderGoal(unit, game.ctrPlay.node.position).pos.x < -1));
  game.ctrPlay.node.setPosition(8, 0); e.nav.beginFrame(game);
  units.forEach(unit => assert(game.getArmyOrderGoal(unit, game.ctrPlay.node.position).pos.x > 1));
  near(game._armyFormation.anchor.x, 8);
});

test('Repeated contact oscillation does not indefinitely postpone safe crowd arrival', () => {
  const e = environment(), game = controller(e), unit = soldier(e, -20, 0);
  soldier(e, -20, 18); soldier(e, 40, 0);
  game.ctrPlay.node.setPosition(0, 0); game.changeAge();
  for (let frame = 0; frame < 30; frame++) {
    // Live Box2D contact moved this unit back and forth by about eight pixels
    // for five seconds while cancelling every attempted forward step.
    unit.node.setPosition(-20 + (frame % 2 ? -3.5 : 3.5), 0);
    advance(e, unit);
  }
  assert.equal(unit.state, 0, 'contact jitter repeatedly restarted the progress timer');
  assert(game._armyFormation.slots.get(unit).resting);
  assert(unit.rallyPoint);
});

console.log(`${passed} friendly order regression checks passed.`);
