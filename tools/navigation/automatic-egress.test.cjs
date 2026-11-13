"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { environment, Node, PhysicsBoxCollider, distance } = require("./runtime-harness.cjs");
function setup(x = 80, y = 0) {
  const e = environment(); e.game.mapSize = { width: 1000, height: 1000 };
  const unit = e.actor("KinghtFallSoldierBase", x, y);
  unit.node.addComponent(PhysicsBoxCollider).size = { width: 18, height: 18 };
  unit.state = 0; unit.isAgg = false; unit.rallyPoint = null; unit.pathList = null;
  e.game.gameData.soldiers.push(unit);
  e.tick = (actors = [unit], dt = .05) => {
    e.clock = (e.clock || 0) + dt * 1000; e.setTime(e.clock); e.nav.beginFrame(e.game);
    actors.forEach(actor => actor.onUpdate(dt));
    const n = e.nav.get(e.game);
    assert(n._frameSearches <= 8, "automatic recovery bypassed the shared search count budget");
    assert(n._frameSearchWork <= 4096, "automatic recovery bypassed incremental work budget");
  };
  return { e, unit };
}
function walkUntilClear(e, unit, limit = 500) {
  const n = e.nav.get(e.game); let captured, moved = 0;
  for (let frame = 0; frame < limit; frame++) {
    const before = unit.node.position; e.tick();
    assert(distance(before, unit.node) <= unit.getSpeed() * .05 + 1e-6, "recovery teleported or changed speed");
    const grid = n.gridFor(unit), radius = n.radius(unit);
    assert(grid.canExitBlocked(before, unit.node, radius), "recovery entered a new obstacle");
    if (unit._automaticEgress) {
      if (!captured) captured = { ...unit._automaticEgress.goal };
      assert.deepEqual({ ...unit._automaticEgress.goal }, captured, "temporary goal follows the moving actor instead of remaining fixed");
    }
    if (distance(before, unit.node) > 0) moved++;
    if (grid.isWalkable(unit.node, radius)) { e.tick(); return { moved, frame }; }
  }
  assert.fail("living actor failed to walk out of the expanded footprint");
}
test("planning idle unit with no orders walks out when a small level-1 footprint expands", () => {
  const { e, unit } = setup(), building = e.box(0, 0, 40, 40, true);
  e.tick(); assert.equal(unit.state, 0);
  building.size = { width: 220, height: 220 };
  const result = walkUntilClear(e, unit);
  assert(result.moved > 1); assert.equal(unit._automaticEgress, null);
  assert.equal(unit.rallyPoint, null); assert.equal(unit.pathList, null);
  const rest = unit.node.position, searches = e.nav.get(e.game).stats.searches;
  for (let i = 0; i < 40; i++) e.tick();
  assert(distance(rest, unit.node) < 1e-6); assert.equal(unit.state, 0);
  assert.equal(e.nav.get(e.game).stats.searches, searches, "idle recovery kept replanning after exit");
});
test("an obstructed personal rally post is preserved while the unit rests at its safe temporary post", () => {
  const { e, unit } = setup(); unit._separateArmyCommands = true;
  const post = { pos: { x: 80, y: 0 } }; unit.rallyPoint = unit._personalRallyPoint = post;
  unit._standingGoal = { pos: { x: 80, y: 0 } }; unit._settledPoint = { x: 80, y: 0 };
  const building = e.box(0, 0, 40, 40, true); e.tick();
  building.size = { width: 220, height: 220 }; walkUntilClear(e, unit);
  assert.strictEqual(unit.rallyPoint, post); assert.strictEqual(unit._personalRallyPoint, post);
  assert.deepEqual(post.pos, { x: 80, y: 0 }); assert(unit._standingGoal.terrainRecovery);
  const rest = unit.node.position; for (let i = 0; i < 40; i++) e.tick();
  assert(distance(rest, unit.node) < 1e-6); assert.equal(unit.state, 0);
  const savedGoal = unit._standingGoal; e.box(-300, -300, 20, 20); e.tick();
  assert.notStrictEqual(unit._standingGoal, savedGoal, "geometry revision retained a stale standing goal");
  assert(unit._standingGoal.terrainRecovery, "unrelated geometry discarded the safe replacement post");
  for (let i = 0; i < 40; i++) e.tick();
  assert(distance(rest, unit.node) < 1e-6); assert.equal(unit.state, 0);
  // Simulate later growth elsewhere while this escaped body remains clear.
  building.size = { width: 220, height: 300 }; e.tick();
  assert(e.nav.get(e.game).gridFor(unit).isWalkable(unit.node, e.nav.get(e.game).radius(unit)));
  for (let i = 0; i < 40; i++) e.tick();
  assert(distance(rest, unit.node) < 1e-6); assert.equal(unit.state, 0);
  assert.strictEqual(unit.rallyPoint, post);
  building.enabled = false;
  for (let i = 0; i < 80; i++) e.tick();
  assert(distance(unit.node, post.pos) < .001, "removing the obstruction must restore the original post");
});
test("follow resumes toward the live hero after safety egress without consuming its order", () => {
  const { e, unit } = setup(); unit.isAgg = true; e.game.ctrPlay.node.setPosition(300, 0);
  e.box(0, 0, 220, 220, true); walkUntilClear(e, unit);
  for (let i = 0; i < 160; i++) e.tick();
  assert(unit.isAgg); assert(distance(unit.node, e.game.ctrPlay.node) <= 20.001);
  assert.equal(unit._automaticEgress, null);
});
test("friendly gate passage is not treated as a solid overlap", () => {
  const { e, unit } = setup(0, 0), leaf = e.box(0, 0, 40, 160, true);
  const owner = e.game.gameData.buildings[0];
  owner.getNavigationGateShapes = () => [{ collider: leaf, points: [ { x: -20, y: -80 }, { x: 20, y: -80 }, { x: 20, y: 80 }, { x: -20, y: 80 } ] }];
  e.tick(); const n = e.nav.get(e.game);
  assert(!n.grid.isWalkable(unit.node, n.radius(unit))); assert(n.gridFor(unit).isWalkable(unit.node, n.radius(unit)));
  assert.equal(unit._automaticEgress, undefined); assert.equal(unit.node.x, 0); assert.equal(unit.node.y, 0);
});
test("automatic escape cannot cross an unrelated barrier or re-enter the expanded building", () => {
  const { e, unit } = setup(80, 0); const footprint = e.box(0, 0, 220, 220, true);
  e.box(160, 0, 40, 260); const n = e.nav.get(e.game);
  walkUntilClear(e, unit); const rest = unit.node.position;
  assert(n.gridFor(unit).isWalkable(rest, n.radius(unit)));
  for (let i = 0; i < 20; i++) e.tick(); assert(distance(rest, unit.node) < 1e-6);
  const contact = {}; unit.onPreSolve(contact, null, footprint); assert(!contact.disabledOnce, "old footprint stays ignored after exit");
});
test("many resting actors share the incremental escape queue", () => {
  const { e, unit } = setup(0, 0), actors = [unit]; e.box(0, 0, 160, 160, true);
  for (let i = 1; i < 16; i++) {
    const actor = e.actor("KinghtFallSoldierBase", i % 4 * 8, Math.floor(i / 4) * 8);
    actor.node.addComponent(PhysicsBoxCollider).size = { width: 18, height: 18 };
    actor.state = 0; actor.rallyPoint = null; actor.pathList = null; e.game.gameData.soldiers.push(actor); actors.push(actor);
  }
  for (let frame = 0; frame < 700; frame++) e.tick(actors);
  const n = e.nav.get(e.game);
  assert(actors.every(actor => n.gridFor(actor).isWalkable(actor.node, n.radius(actor))));
  assert(n.stats.deferred > 0, "fixture did not exercise the fair queue");
});
test("fully sealed terrain waits without teleporting or retrying an unchanged failed route", () => {
  const { e, unit } = setup(0, 0); e.game.mapSize = { width: 120, height: 120 }; e.box(0, 0, 200, 200, true);
  for (let i = 0; i < 300; i++) e.tick();
  const n = e.nav.get(e.game); assert.equal(unit.node.x, 0); assert.equal(unit.node.y, 0);
  assert.equal(n.stats.searches, 1); assert.equal(n.stats.noPath, 1); assert.equal(unit.state, 0);
  assert(unit._automaticEgress); assert.equal(n._activeSearches.size, 0);
});
test("an attack or hit reaction finishes before automatic egress starts", () => {
  const { e, unit } = setup(0, 0); e.box(0, 0, 200, 200, true);
  unit.state = e.load("KinghtFallSoldierBase").KinghtFallSoldierStatus.Attack; e.tick();
  assert.equal(unit._automaticEgress, undefined); assert.equal(unit.node.x, 0);
  unit.state = 0; unit._hitReactionPlaying = true; e.tick(); assert.equal(unit._automaticEgress, undefined);
  unit._hitReactionPlaying = false; walkUntilClear(e, unit);
});

test("pool/reset and a new command release the prior navigation owner and temporary recovery", () => {
  const { e, unit } = setup(); e.box(0, 0, 220, 220, true); e.tick();
  assert(unit._automaticEgress); e.nav.reset(unit);
  assert.equal(unit._automaticEgress, null); assert.equal(unit._standingNavigationOwner, null);
  assert.equal(unit._standingNavigationRevision, null); assert.equal(unit._terrainExit, null);
  unit._separateArmyCommands = true;
  const post = { pos: { x: 80, y: 0 } }; unit.rallyPoint = unit._personalRallyPoint = post;
  walkUntilClear(e, unit); assert(unit._standingGoal.terrainRecovery);
  // A normal new army order calls reset and must release the former owner.
  unit.applyArmyOrder(e.game);
  assert.equal(unit._automaticEgress, null); assert.equal(unit._standingNavigationOwner, null);
  assert.equal(unit._standingNavigationRevision, null); assert.equal(unit._standingGoal, null);
});

test("safe respawn and wave reload approach an obstructed saved post then rest at the completed projection", () => {
  for (const restore of ["respawn", "reload"]) {
    const { e, unit } = setup(150, 0); e.game._separateArmyCommands = true;
    const post = { pos: { x: 80, y: 0 } }; unit.rallyPoint = unit._personalRallyPoint = post;
    e.box(0, 0, 220, 220, true);
    if (restore === "respawn") unit.setNew(); else unit.applyArmyOrder(e.game);
    for (let i = 0; i < 160; i++) e.tick();
    const n = e.nav.get(e.game), rest = unit.node.position;
    assert(n.gridFor(unit).isWalkable(rest, n.radius(unit)));
    assert(unit.node.x < 150, "unit did not approach its projected saved post");
    assert.equal(unit.state, 0); assert(unit._standingGoal.terrainRecovery);
    assert.strictEqual(unit.rallyPoint, post); assert.strictEqual(unit._personalRallyPoint, post);
    assert.deepEqual(post.pos, { x: 80, y: 0 });
    for (let i = 0; i < 60; i++) e.tick();
    assert(distance(rest, unit.node) < 1e-6); assert.equal(unit.state, 0);
    const state = unit._navigationState; assert(state && !state.exact && !state.partial);
    state.partial = true;
    assert.equal(e.nav.projectedStandingPoint(unit, e.game, post.pos), null, "frontier arrival cannot become a standing post");
    state.partial = false;
    assert.equal(e.nav.projectedStandingPoint(unit, e.game, { x: 70, y: 0 }), null, "a stale/different target cannot settle");
  }
});

test("a subpixel physics nudge and later growth cannot complete egress inside its frozen target", () => {
  const { e, unit } = setup(80, 0); e.box(0, 0, 220, 220, true);
  e.nav.beginFrame(e.game); unit.onUpdate(0);
  const captured = { ...unit._automaticEgress.goal };
  unit.node.x += .5; e.box(-300, -300, 20, 20);
  walkUntilClear(e, unit);
  assert.deepEqual(captured, { x: 80, y: 0 });
  assert.equal(unit._automaticEgress, null); assert.equal(unit.state, 0);
  const rest = unit.node.position;
  for (let i = 0; i < 60; i++) e.tick();
  assert(distance(rest, unit.node) < 1e-6); assert.equal(unit.state, 0);
});
