'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { environment, Node, PhysicsPolygonCollider, installIntersection, Vec2 } = require('./runtime-harness.cjs');

function box(node, left, bottom, right, top) {
  const collider = node.addComponent(PhysicsPolygonCollider);
  collider.tag = 1;
  collider.points = [{ x: left, y: bottom }, { x: right, y: bottom }, { x: right, y: top }, { x: left, y: top }];
  return collider;
}

function fixture(type = 'KinghtFallEnemyItem02') {
  const e = environment(), { game } = e;
  installIntersection(e.cc);
  game.ctrPlay.isDead = () => true;
  game.gameStatus = e.stubs.KinghtFallModle.KinghtFallGameStage.Fight;
  const hits = [], impacts = [];
  const effects = e.stubs.KinghtFallUIGame.default.instance.ctrEffect;
  Object.assign(effects, { showDamageNum: at => impacts.push({ x: at.x, y: at.y }), onMonsterAttack() {}, onAttack2() {}, onAttack() {} });
  const gate = new (e.load('KinghtFallBuildWall').default)();
  Object.assign(gate, {
    node: new Node('Gate', game.ndMain), index: 1, getColliderIndex: () => gate.index,
    getIsWork: () => !gate.isDestroyed, buildInfo: { BuildID: 'Wall' }, uuid: 'wall',
    onAttacked(damage) { hits.push('wall'); return damage; }
  });
  const leaf = box(gate.node, -8, -35, 8, 35);
  gate.ndAniOther = [-100, 100].map(y => ({ node: new Node('Outer wall', game.ndMain, 0, y) }));
  gate.ndAniOther.forEach(part => box(part.node, -8, -65, 8, 65));
  game.gameData.buildings.push(gate);

  const unit = e.actor(type, -30, 100);
  delete unit.getFind;
  delete unit.onFindList;
  unit.cfg = { ...unit.cfg, AttackRange: 30, SearchRange: 60, Data: [5, 100, 8] };
  unit.getAttack = () => 5;
  const tower = new (e.load('KinghtFallBuildBase').default)();
  Object.assign(tower, {
    node: new Node('Tower', game.ndMain, 40, 100), index: 1, getColliderIndex: () => tower.index,
    getIsWork: () => true, buildInfo: { BuildID: 'ArrowTower' }, uuid: 'tower',
    onAttacked(damage) { hits.push('tower'); return damage; }
  });
  box(tower.node, -20, -20, 20, 20);
  return { ...e, gate, leaf, tower, unit, hits, impacts, effects };
}

function fillGate(e) {
  return Array.from({ length: 4 }, (_, index) => {
    const enemy = e.actor('KinghtFallEnemyItem02', -30, index * 4);
    delete enemy.getFind;
    enemy.cfg = { ...e.unit.cfg, EnemyTargeting: {mode:'priority',order:['wall']} };
    assert.equal(enemy.getUpdateTarget().tag, e.gate.node);
    return enemy;
  });
}

test('enemies reserve the gate first, spread to both wings when full, and retake freed gate space', () => {
  const e = fixture(), { unit, gate, hits, impacts } = e;
  const first = unit.getUpdateTarget();
  assert.equal(first.tag, gate.node);
  assert.equal(first.canAtt, false, 'Melee moves to the gate even though a wing is already in reach');
  assert.equal(unit.pickAttackTarget(e.game), null);
  unit.node.setPosition(-30, 42);
  assert.equal(unit.getUpdateTarget().canAtt, true);
  unit.doAttack();
  assert.deepEqual(impacts.at(-1), { x: -8, y: 35 });
  assert.deepEqual(hits, ['wall']);

  unit._isPooled = true;
  const atGate = fillGate(e);
  const overflow = [-90, 90].map(y => {
    const enemy = e.actor('KinghtFallEnemyItem02', -30, y);
    delete enemy.getFind;
    enemy.cfg = { ...unit.cfg };
    return enemy;
  });
  assert.equal(overflow[0].getUpdateTarget().tag, gate.ndAniOther[0].node);
  assert.equal(overflow[1].getUpdateTarget().tag, gate.ndAniOther[1].node);
  assert.equal(overflow[1].pickAttackTarget(e.game).tag, gate.ndAniOther[1].node);
  atGate[0].node._combatGeneration = 2;
  e.nav.beginFrame(e.game);
  assert.equal(overflow[1].getUpdateTarget().tag, gate.node);
  assert.equal(overflow[0].getUpdateTarget().tag, gate.ndAniOther[0].node);
});

test('melee attacks hit a gateless wall and both wings from either side', () => {
  const { gate, unit, hits, impacts } = fixture();
  gate.wallHasGate = false;
  const parts = gate.getAttackTargetParts();
  assert.equal(parts.length, 3);
  for (const x of [-30, 30]) for (const [y, part] of [[0, parts[0]], [-100, parts[1]], [100, parts[2]]]) {
    unit.node.setPosition(x, y);
    const target = unit.getUpdateTarget();
    assert.equal(target.tag, part.tagNode);
    assert.equal(target.building, gate);
    assert.equal(target.canAtt, true);
    unit.doAttack();
    assert.deepEqual(impacts.at(-1), { x: Math.sign(x) * 8, y });
  }
  assert.deepEqual(hits, Array(6).fill('wall'));
  assert.equal(gate.getAttackTargetParts().length, 3);
  gate.isDestroyed = true;
  assert.equal(gate.getAttackTargetParts().length, 0);
  assert.equal(unit.getUpdateTarget(), null);
});

test('wall targeting follows the nearest compound fixture even when fixtures share a node', () => {
  const { nav, game, gate, leaf, unit } = fixture();
  const extension = box(gate.node, -108, 55, -92, 120);
  nav.beginFrame(game);
  const first = gate.getAttackTargetParts();
  assert.equal(first, gate.getAttackTargetParts());
  unit.node.setPosition(-30, 0);
  assert.equal(unit.getUpdateTarget().collider, leaf);
  unit.node.setPosition(-128, 77);
  assert.equal(unit.getUpdateTarget().collider, extension);
  gate.node.setPosition(20, 10);
  gate.node.scaleX = -1;
  leaf.offset = { x: 6, y: 0 };
  nav.beginFrame(game);
  const moved = gate.getAttackTargetParts();
  assert.notEqual(first, moved);
  const aim = nav.attackPointOf(gate, game, { x: -30, y: 20 }, moved[0].points);
  assert.deepEqual({ x: aim.x, y: aim.y }, { x: 6, y: 20 });
});

test('an intact wall blocks cached tower targets and redirects tower priority to a wing when the gate is crowded', () => {
  const e = fixture(), { nav, game, gate, tower, unit, hits } = e;
  game.gameData.buildings.push(tower);
  unit.cfg = { ...unit.cfg, AttackRange: 80, EnemyTargeting: { mode: 'priority', order: ['tower'] } };
  tower.node.setPosition(-100, 100);
  assert.equal(unit.getUpdateTarget().building, tower);
  fillGate(e);
  tower.node.setPosition(40, 100);
  nav.invalidate(game);
  const selected = unit.getUpdateTarget();
  assert.equal(selected.building, gate);
  assert.equal(selected.tag, gate.ndAniOther[1].node);
  assert.equal(selected.canAtt, true);
  unit.doAttack();
  gate.isDestroyed = true;
  assert.equal(unit.getUpdateTarget().building, tower);
  unit.doAttack();
  assert.deepEqual(hits, ['wall', 'tower']);
});

test('legacy ground ranged enemies aim at the gate before they can hit the tower', () => {
  for (const actor of ['KinghtFallEnemyLong', 'KinghtFallEnemyItem08']) {
    const e = fixture(actor), { game, gate, tower, unit, hits, impacts } = e;
    game.gameData.buildings.push(tower);
    unit.cfg = { ...unit.cfg, AttackRange: 100, BuildingCross: 1 };
    let shot;
    game.onShotEnemy = () => ({ pos: e.cc.v2(), ctr: { setParent() {}, setTag(_, target, hit, offset) { shot = { target, hit, offset }; } } });
    unit.doAttack();
    assert.equal(shot.target, gate.node);
    assert.deepEqual({ x: shot.offset.x, y: shot.offset.y }, { x: -8, y: 35 });
    const space = new Node('Projectile layer', game.ndMain, 20, 40), bullet = { node: new Node('Projectile', space), tagNode: shot.target, tagPos: new Vec2(), targetOffset: shot.offset };
    const { setup } = require('../testing/backend-gameplay-harness.cjs');
    setup().load('KinghtFallBulletBase').default.prototype.readTargetPosition.call(bullet);
    assert.deepEqual({ x: bullet.tagPos.x, y: bullet.tagPos.y }, { x: -28, y: -5 });
    shot.hit();
    assert.deepEqual(impacts, [{ x: -8, y: 35 }]);
    gate.isDestroyed = true;
    unit.doAttack();
    assert.equal(shot.target, tower.node);
    shot.hit();
    assert.deepEqual(hits, ['wall', 'tower']);
  }
});

test('a flying melee enemy crosses the closed gate and attacks the tower', () => {
  const { nav, game, gate, tower, unit, hits } = fixture();
  unit.node.setPosition(-30, 0);
  tower.node.setPosition(65, 0);
  game.gameData.buildings.push(tower);
  const groundTarget = unit.getUpdateTarget();
  assert.equal(groundTarget.building, gate);

  unit.cfg.BuildingCross = false;
  unit.rigidBody.active = false;
  const selected = unit.getUpdateTarget();
  assert.equal(selected.building, tower, 'refreshing a cached gate target switches to the tower');
  assert.equal(selected.canAtt, false);
  for (let i = 0; i < 40 && !unit.getUpdateTarget()?.canAtt; i++) {
    nav.beginFrame(game);
    const target = unit.getUpdateTarget();
    assert.equal(target.building, tower);
    nav.moveTo(unit, game, nav.attackPositionOf(target, unit, game), .05);
  }
  assert(unit.node.x > 8);
  unit.doAttack();
  assert.deepEqual(hits, ['tower']);
  assert(gate.getIsWork());

  unit.cfg = { ...unit.cfg, EnemyTargeting: { mode: 'priority', order: ['wall', 'tower'] } };
  assert.equal(unit.getUpdateTarget().building, tower);
  unit.cfg = { ...unit.cfg, EnemyTargeting: { mode: 'priority', order: ['wall'] } };
  assert.equal(unit.getUpdateTarget(), null);
});

test('legacy flying ranged shots hit a tower behind a live gate after the attacker is reused', () => {
  for (const actor of ['KinghtFallEnemyLong', 'KinghtFallEnemyItem08']) {
    const e = fixture(actor), { game, gate, tower, unit, hits } = e;
    game.gameData.buildings.push(tower);
    unit.cfg = { ...unit.cfg, AttackRange: 100, BuildingCross: 0 };
    let shot;
    game.onShotEnemy = () => ({ pos: e.cc.v2(), ctr: { setParent() {}, setTag(_, target, hit) { shot = { target, hit }; } } });
    unit.doAttack();
    assert.equal(shot.target, tower.node);
    unit.cfg = { ...unit.cfg, BuildingCross: 1 };
    unit.node._combatGeneration = 2;
    shot.hit();
    assert.deepEqual(hits, ['tower']);
    assert(gate.getIsWork());
  }
});

test('pursuit and ranged impacts use exposed wall faces beside terrain and skip buried parts', () => {
  const e = fixture('KinghtFallEnemyLong'), { game, gate, unit, nav } = e;
  gate.wallHasGate = false;
  unit.cfg = { ...unit.cfg, AttackRange: 120 };
  unit.node.setPosition(-55, 110);
  e.box(1, 105, 34, 58);
  const terrain = nav.get(game).mapGrid();
  assert.equal(terrain.isWalkable({x:-8,y:110},0), false, 'The old closest point is inside the cliff');
  const target = unit.getUpdateTarget();
  assert(target.canAtt && terrain.segmentClear(unit.node, target.wallPoint, 0));
  assert.deepEqual(nav.attackPointOf(gate, game, unit.node, target.polygon, target.wallPoint), target.wallPoint);
  assert(terrain.isWalkable(nav.attackPositionOf(target, unit, game), 0));
  let aim;
  game.onShotEnemy = () => ({pos:e.cc.v2(),ctr:{setParent(){},setTag(_n,_target,_hit,offset){aim=offset;}}});
  unit.doAttack();
  assert.deepEqual({x:aim.x,y:aim.y},{x:target.wallPoint.x,y:target.wallPoint.y});
  e.box(0, 0, 34, 340);
  nav.invalidate(game);
  assert.equal(unit.getUpdateTarget(), null);
  assert.equal(unit.pickAttackTarget(game), null);
});

test('legacy ground splash respects wall protection and flying splash skips walls', () => {
  const { nav, game, gate, tower, unit, hits } = fixture('KinghtFallEnemyItem07');
  game.gameData.buildings.push(tower);
  unit.doAttack();
  assert.deepEqual(hits, ['wall']);
  gate.isDestroyed = true;
  const troop = {
    node: new Node('Troop', game.ndMain, -15, 100), uuid: 'troop', isDead: () => false,
    onAttacked(damage) { hits.push('troop'); return damage; }
  };
  game.gameData.soldiers.push(troop);
  unit.doAttack();
  assert.deepEqual(hits, ['wall', 'troop', 'tower']);

  gate.isDestroyed = false;
  nav.invalidate(game);
  unit.cfg = { ...unit.cfg, BuildingCross: 0 };
  unit.doAttack();
  assert.deepEqual(hits, ['wall', 'troop', 'tower', 'troop', 'tower']);
});
