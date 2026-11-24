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

function pursuit() {
  const e = environment();
  installIntersection(e.cc);
  const { game } = e;
  game._combatEpoch = 1;
  game.gameStatus = e.stubs.KinghtFallModle.KinghtFallGameStage.Fight;
  game.ctrPlay.node.setPosition(30, 0);
  const hits = [];
  game.ctrPlay.onAttacked = damage => { hits.push('hero'); return damage; };
  game.ctrPlay.node._combatGeneration = 1;
  const troop = { node: new Node('troop', game.ndMain, -85, 0), isDead: () => false,
    onAttacked(damage) { hits.push('troop'); return damage; } };
  game.gameData.soldiers.push(troop);
  Object.assign(e.stubs.KinghtFallUIGame.default.instance.ctrEffect, { showDamageNum() {}, onMonsterAttack() {} });
  function structure(type, x, y, width, height) {
    const collider = e.box(x, y, width, height, true), structure = game.gameData.buildings.at(-1);
    const points = () => [[-width/2,-height/2],[width/2,-height/2],[width/2,height/2],[-width/2,height/2]]
      .map(([x,y]) => collider.node.convertToWorldSpaceAR(e.cc.v2(x,y)));
    Object.assign(structure, {
      buildInfo: { BuildID: type },
      getIsWork() { return collider.enabled; },
      getWposPhyCol2() { return [{ tagNode: collider.node, points: points() }]; },
      onAttacked(damage) {
        hits.push(type);
        if (type === 'Wall') collider.enabled = false;
        return damage;
      }
    });
    if (type === 'Wall') structure.getNavigationGateShapes = () => [];
    if (type === 'CastleCenter') game.gameData.baseBuild = structure;
    return structure;
  }
  function make(mode, options = {}, name) {
    const unit = enemy(e, name);
    unit.cfg = { ...unit.cfg, EnemyTargeting: { mode }, ...options };
    unit.getAttack = () => 5;
    unit.time.Attack = 1;
    return unit;
  }
  return { e, game, hits, troop, structure, make };
}

test('ordered targeting picks the first in-range group and the same rule applies at damage release', () => {
  const f = pursuit(), unit = f.make('priority', { AttackRange: 150, EnemyTargeting: { mode: 'priority', order: ['hero','troops'] } });
  assert.equal(unit.getFind().actor, f.game.ctrPlay);
  unit.doAttack();
  assert.deepEqual(f.hits, ['hero']);
  f.game.ctrPlay.node.x = 240;
  assert.equal(unit.getFind().actor, f.troop);
  unit.cfg = { ...unit.cfg, EnemyTargeting: { mode: 'priority', order: ['tower'] } };
  const tower = f.structure('ArrowTower', -65, 0, 10, 10);
  assert.equal(unit.getFind().building, tower);
  unit.doAttack();
  assert.deepEqual(f.hits, ['hero','ArrowTower']);
});

test('Lightning Slime follows its authored castle focus and attacks a blocking wall first', () => {
  const f = pursuit();
  const row = require('../../assets/KinghtFallConfig/GameJsonCfg.json').SoldierCfg[91154];
  const unit = f.make('castle', row, 'KinghtFallEnemyItem01');
  f.game.ctrPlay.node.x = -90;
  const castle = f.structure('CastleCenter', -55, 0, 10, 10);
  f.structure('ArrowTower', -75, 25, 10, 10);
  const wall = f.structure('Wall', -80, 0, 10, 30);
  assert.equal(unit.getFind().building, wall);
  unit.doAttack();
  f.e.nav.beginFrame(f.game);
  assert.equal(unit.getFind().building, castle);
  unit.doAttack();
  assert.deepEqual(f.hits, ['Wall', 'CastleCenter']);
});

test('castle focus takes the shorter breach route around terrain and resumes pursuit after destroying the wall', () => {
  const { e, game, hits, make, structure } = pursuit();
  const unit = make('castle', { AttackRange: 12, SearchRange: 0, Speed: 60 });
  unit.node.setPosition(-145, 0);
  unit.node.addComponent(e.cc.PhysicsCircleCollider).radius = 10;
  structure('CastleCenter', 145, 0, 20, 40);
  const wall = structure('Wall', 0, 0, 12, 250);
  structure('ArrowTower', -125, 24, 16, 16);
  e.box(-70, 0, 30, 100);
  const moves = [];
  delete unit.onFindList;
  unit.doAttackStart = () => { unit.doAttack(); unit.time.Attack = 1; };
  for (let frame = 0; frame < 450 && !hits.includes('CastleCenter'); frame++) {
    e.setTime(frame * 50);
    e.nav.beginFrame(game);
    unit.onUpdate(.05);
    if (wall.getIsWork()) {
      assert(unit.node.x < -6, 'breach planning let the unit cross a live wall');
      moves.push(unit.node.y);
    }
  }
  assert(moves.some(y => Math.abs(y) > 50), 'the route avoided solid terrain before the breach');
  assert.deepEqual(hits, ['Wall','CastleCenter'], 'Stopped at ' + unit.node.x + ', ' + unit.node.y +
    ' with target ' + (unit.getUpdateTarget()?.tag.name || 'none'));
});

test('hero focus responds to sight immediately and ground units hit the blocking wall first', () => {
  const { e, game, hits, make, structure } = pursuit();
  const unit = make('hero', { AttackRange: 110, SearchRange: 20 });
  const wall = structure('Wall', -35, 0, 14, 75);
  game.ctrPlay.node.x = 90;
  assert.equal(unit.getUpdateTarget(), null);
  game.ctrPlay.node.x = 0;
  assert.equal(unit.getUpdateTarget().building, wall);
  unit.doAttack();
  e.nav.beginFrame(game);
  assert.equal(unit.getUpdateTarget().actor, game.ctrPlay);
  unit.doAttack();
  assert.deepEqual(hits, ['Wall','hero']);
});

test('a flying ranged enemy ignores walls and stays in flight when it fires', () => {
  const { e, game, make, structure } = pursuit();
  const unit = make('hero', { AttackRange: 150, BuildingCross: 0 }, 'KinghtFallEnemyItem08');
  unit.rigidBody.active = false;
  structure('Wall', -35, 0, 14, 260);
  let shot;
  game.onShotEnemy = () => ({ pos: e.cc.v2(), ctr: { setParent() {}, setTag(_, node) { shot = node; } } });
  assert.equal(unit.getUpdateTarget().actor, game.ctrPlay);
  unit.doAttack();
  assert.equal(shot, game.ctrPlay.node);
  assert.equal(unit.rigidBody.active, false);
  e.nav.moveTo(unit, game, { x: 50, y: 0 }, 3);
  assert(unit.node.x > -28, 'flight should pass the wall');
});

function wallTest() {
  const { e, game, hits, structure } = pursuit();
  game.gameStatus = e.stubs.KinghtFallModle.KinghtFallGameStage.Prepare;
  e.stubs.KinghtFallModle.KinghtFallSoldierAniEnum.Attack = 'attack';
  const placements = [];
  e.stubs.SpawnArea = {
    prepare(_actor, _game, _spawn, collides) { placements.push({ prepare: collides }); },
    apply(actor) { placements.at(-1).apply = actor.rigidBody.active; return true; }
  };
  game.node = new Node('game');
  game.ndPath = new Node('paths', game.ndMain);
  new Node('ndEnemy1', game.ndPath, -145, 0);
  const waypoint = new Node('waypoint', game.ndPath, -55, 0);
  game.setPath = () => ({ nodeIndex: 0, pathList: [waypoint] });
  game.addEnemy = e.load('KinghtFallGameCtrl').default.prototype.addEnemy;
  game.ctrPlay.node.x = 170;
  const castle = structure('CastleCenter', 145, 0, 20, 40);
  const wall = new (e.load('KinghtFallBuildWall').default)();
  wall.node = new Node('Gate', game.ndMain);
  wall.ndAniMain = { node: new Node('Wall art', wall.node) };
  wall.ndAniDown = { node: new Node('Gate leaf art', wall.node) };
  wall.buildCfg = { enumValue: 'Wall' };
  wall.buildInfo = { BuildID: 'Wall', cfg: {}, hp: 20, hpMax: 25 };
  wall.index = 1;
  wall.canLock = true;
  wall.onAttacked = () => { throw Error('F7 must use its own wall health'); };
  wall.ctrHp = { node: new Node('Wall HP', game.ndMain), setHp(hp, max) {
    this.hp = hp;
    this.node.active = hp > 0 && hp < max;
  } };
  wall.upHpView();
  function fixture(node, height, tag = 1) {
    const collider = node.addComponent(e.cc.PhysicsPolygonCollider);
    collider.points = [[-6,-height/2],[6,-height/2],[6,height/2],[-6,height/2]].map(([x,y]) => e.cc.v2(x,y));
    collider.tag = tag;
    return collider;
  }
  const leaf = fixture(wall.node, 60);
  const otherTier = fixture(wall.node, 80, 2);
  otherTier.enabled = false;
  wall.ndAniOther = [-77.5, 77.5].map(y => ({ node: new Node('Wing', game.ndMain, 0, y) }));
  const wings = wall.ndAniOther.map(part => fixture(part.node, 95));
  game.gameData.buildings.push(wall);

  const rules = [[90001, 'castle', 1], [90002, 'hero', 1], [90003, 'hero', 0]];
  const records = new Map(rules.map(([ID, mode, BuildingCross]) => [ID, {
    ...e.cfg, ID, AttackType: 1, AttackRange: 12, SearchRange: 100, BuildingCross, EnemyTargeting: { mode }
  }]));
  e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById = id => records.get(id);
  const attacks = new Map(rules.map(([id]) => [id, []]));
  const prefab = { refs: 0, addRef() { this.refs++; }, decRef() { this.refs--; } };
  e.cc.instantiate = prefab => {
    const actor = e.actor(prefab.kind || 'KinghtFallEnemyMelee', 0, 0);
    delete actor.onFindList;
    delete actor.getFind;
    actor.node.setParent(null);
    actor.node.destroy = () => { actor.node.destroyed = true; actor.node.setParent(null); };
    actor.node.getComponent = () => actor;
    const body = actor.node.addComponent(e.cc.PhysicsCircleCollider);
    body.radius = 21;
    body.body = actor.rigidBody;
    actor.doAttack = () => { throw Error('Preview attacks must not invoke gameplay damage'); };
    actor.spAni.setAnimation = (_, name) => {
      if (name === 'attack') attacks.get(actor.cfg.ID).push(actor.getUpdateTarget()?.tag);
    };
    return actor.node;
  };

  const batch = rules.map(([id]) => ({ profile: { id, model: { name: String(id) } }, prefab }));
  const send = (breakWalls, units = batch) => e.load('UnitTestEncounter').send(game, units, 1, 1, .25, false, breakWalls);
  let frame = 0;
  function advance(count) {
    for (let i = 0; i < count; i++, frame++) {
      e.setTime(frame * 50);
      e.nav.beginFrame(game);
      game._unitTest.update(.05);
    }
  }
  return { e, game, hits, castle, wall, leaf, otherTier, wings, attacks, prefab, batch, send, advance, placements, records };
}

test('F7 temporary settings control spawn clearance, wall damage, and pursuit even for a support profile', () => {
  const { game, hits, castle, wall, attacks, batch, send, advance, placements, records } = wallTest();
  game.ctrPlay.node.x = 45;
  const savedCastle = Object.freeze({ ...records.get(90001), BuildingCross: 0, EnemyTargeting: Object.freeze({ mode: 'hero' }) });
  const savedHero = Object.freeze({ ...records.get(90002), AttackType: 3, BuildingCross: 1, EnemyTargeting: Object.freeze({ mode: 'castle' }) });
  records.set(90001, savedCastle);
  records.set(90002, savedHero);
  const run = send(true, [
    { ...batch[0], overrides: { movement: 'ground', targeting: 'castle' } },
    { ...batch[1], prefab: { ...batch[1].prefab, kind: 'KinghtFallEnemyAuxiliary' }, overrides: { movement: 'flight', targeting: 'hero' } }
  ]);
  try {
    let flightCrossed = false;
    for (let frame = 0; frame < 320 && wall.getIsWork(); frame++) {
      advance(1);
      const [ground, flight] = run.actors;
      if (wall.getIsWork()) {
        assert(ground.node.x < -6, 'ground clearance must hold the actor before the gate');
        if (flight && flight.node.x > 6) flightCrossed = true;
      }
    }
    assert.deepEqual(placements, [{ prepare: true, apply: true }, { prepare: false, apply: false }]);
    assert(flightCrossed);
    assert.equal(wall.getIsWork(), false);
    assert(attacks.get(90001).includes(wall.node));
    assert.equal(run.actors[0].cfg.BuildingCross, 1);
    assert.equal(run.actors[1].cfg.BuildingCross, 0);
    assert(run.actors.every(actor => !actor.rigidBody.active));
    advance(180);
    assert.equal(attacks.get(90001).at(-1), castle.node);
    assert(attacks.get(90002).length > 0);
    assert(attacks.get(90002).every(target => target === game.ctrPlay.node));
    assert.deepEqual(hits, []);
    assert.equal(records.get(90001), savedCastle);
    assert.equal(records.get(90002), savedHero);
  } finally { run.dispose(); }
  assert(wall.getIsWork());
});

test('an F7 batch uses saved focus and flight settings against live blockers without dealing damage', () => {
  const { game, hits, wall, prefab, attacks, send, advance } = wallTest();
  const run = send(false);
  try {
    advance(140);
    const [castle, hero, flight] = run.actors;
    assert.equal(prefab.refs, 1);
    assert(castle._unitTestRadius > 12, 'the short-range actor must reach the wall at its true body clearance');
    assert(castle.node.x < -6 && attacks.get(90001).length > 0);
    assert(attacks.get(90001).every(target => target === wall.node));
    assert.equal(hero.bornInfo.nodeIndex, 1);
    assert.equal(flight.bornInfo.nodeIndex, 1);
    assert.deepEqual(attacks.get(90002), []);
    assert.deepEqual(attacks.get(90003), []);
    game.ctrPlay.node.x = 45;
    advance(140);
    assert(hero.node.x < -6 && attacks.get(90002).length > 0);
    assert(attacks.get(90002).every(target => target === wall.node));
    assert(flight.node.x > 6 && attacks.get(90003).length > 0);
    assert(attacks.get(90003).every(target => target === game.ctrPlay.node));
    assert(run.actors.every(actor => actor._unitTestActor && !actor.rigidBody.active));
    assert.equal(game.gameData.getEnemyList().length, 0);
    assert.deepEqual(hits, []);
    assert(wall.getIsWork());
  } finally { run.dispose(); }
  assert.equal(prefab.refs, 0);
});

test('F7 ground units open a gate and resume their own objectives while flight crosses before the breach', () => {
  const { e, game, hits, castle, wall, leaf, otherTier, wings, attacks, send, advance } = wallTest();
  game.ctrPlay.node.x = 45;
  const run = send(true);
  try {
    let flightCrossed = false;
    for (let frame = 0; frame < 320 && wall.getIsWork(); frame++) {
      advance(1);
      const [castleOnly, heroOnly, flight] = run.actors;
      if (wall.getIsWork()) {
        assert(castleOnly.node.x < -6 && (!heroOnly || heroOnly.node.x < -6), 'ground units crossed a live gate');
        if (flight && flight.node.x > 6) flightCrossed = true;
      }
    }
    assert(flightCrossed);
    assert(attacks.get(90001).includes(wall.node));
    assert(attacks.get(90002).includes(wall.node));
    assert.equal(wall.getIsWork(), false);
    assert.equal(wall.node.active, true, 'the building controller should stay active');
    assert.equal(wall.isDestroyed, false, 'only the test owns the breach');
    assert.equal(wall.buildInfo.hp, 20);
    assert.equal(wall.ctrHp.node.active, false);
    assert.equal(wall.ndAniMain.node.active, false);
    assert.equal(wall.ndAniDown.node.active, false);
    assert.equal(leaf.enabled, false);
    assert(wings.every(collider => !collider.enabled && !collider.node.active));
    assert.equal(wall.getNavigationGateShapes().length, 0);
    wall.doTime(.05);
    assert.equal(leaf.enabled, false, 'gate updates must leave the test gap open');

    advance(300);
    assert(run.actors.every(actor => actor.node.x > 6));
    assert.equal(attacks.get(90001).at(-1), castle.node);
    assert.equal(attacks.get(90002).at(-1), game.ctrPlay.node);
    assert(attacks.get(90003).every(target => target === game.ctrPlay.node));
    assert.deepEqual(hits, []);

    const addEnemy = game.addEnemy;
    game.addEnemy = () => {
      assert(leaf.enabled, 'the replacement must spawn against restored collision');
      return null;
    };
    assert.throws(() => send(false), /Could not place/);
    game.addEnemy = addEnemy;
    assert.equal(game._unitTest, run);
    assert.equal(leaf.enabled, false, 'a failed replacement must keep the existing breach');
  } finally { run.dispose(); }

  assert.equal(game._unitTest, null);
  assert(wall.getIsWork());
  assert.equal(wall.buildInfo.hp, 20);
  assert.equal(wall.ctrHp.hp, 20);
  assert.equal(wall.ctrHp.node.active, true);
  assert.equal(wall.ndAniMain.node.active, true);
  assert.equal(wall.ndAniDown.node.active, true);
  assert.equal(leaf.enabled, true);
  assert.equal(otherTier.enabled, false);
  assert(wings.every(collider => collider.enabled && collider.node.active));
  assert.equal(wall.getNavigationGateShapes().length, 1);
  assert(!e.nav.get(game).gridFor({}).isWalkable({ x: 0, y: 0 }, 0), 'clearing must restore the obstacle without waiting for the next frame');
});

test('F7 wall hits respect saved timing and clearing cancels pending hits and resets partial damage', () => {
  const { e, game, wall, attacks, batch, send, advance } = wallTest();
  const tools = e.load('GameToolsOverrides');
  const settings = e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data;
  settings.GameTools = { timingDefaults: { 'enemy:90001:default': { attack: .15 } },
    timings: { 'enemy:90001:default': { attack: .3 } } };
  const run = send(true, batch.slice(0, 1));
  try {
    for (let frame = 0; frame < 160 && !attacks.get(90001).length; frame++) advance(1);
    assert.equal(attacks.get(90001).length, 1);
    assert.equal(wall.ctrHp.hp, 20);
    tools.tick(.1, false);
    advance(5);
    assert.equal(wall.ctrHp.hp, 20, 'the saved overriding marker must not release early');
    run.playAttack();
    assert.equal(attacks.get(90001).length, 1, 'manual playback must not replace an outstanding wall hit');
    advance(1);
    assert.equal(wall.ctrHp.hp, 15);
    assert.equal(wall.buildInfo.hp, 20);
    for (let frame = 0; frame < 60 && attacks.get(90001).length < 2; frame++) advance(1);
    assert.equal(attacks.get(90001).length, 2);
    assert.equal(wall.ctrHp.hp, 15);
  } finally { run.dispose(); }

  assert.equal(wall.ctrHp.hp, 20);
  const replacement = send(false, batch.slice(0, 1));
  try {
    run.update(1);
    advance(100);
    assert.equal(game._unitTest, replacement);
    assert.equal(wall.ctrHp.hp, 20);
    assert(wall.getIsWork());
  } finally { replacement.dispose(); }
});
