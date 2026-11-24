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

test('melee attacks hit the gate and both wings from either side and damage the shared wall', () => {
  const { gate, unit, hits, impacts } = fixture();
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
  gate.wallHasGate = false;
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

test('an intact wall blocks cached tower targets and redirects tower priority to its wing', () => {
  const { nav, game, gate, tower, unit, hits } = fixture();
  game.gameData.buildings.push(tower);
  unit.cfg = { ...unit.cfg, AttackRange: 80, EnemyTargeting: { mode: 'priority', order: ['tower'] } };
  tower.node.setPosition(-100, 100);
  assert.equal(unit.getUpdateTarget().building, tower);
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

test('legacy ranged and flying enemies aim at the wall section before they can hit the tower', () => {
  for (const actor of ['KinghtFallEnemyLong', 'KinghtFallEnemyItem08']) {
    const e = fixture(actor), { game, gate, tower, unit, hits, impacts } = e;
    game.gameData.buildings.push(tower);
    unit.cfg = { ...unit.cfg, AttackRange: 100, BuildingCross: actor === 'KinghtFallEnemyLong' ? 1 : 0 };
    let shot;
    game.onShotEnemy = () => ({ pos: e.cc.v2(), ctr: { setParent() {}, setTag(_, target, hit, offset) { shot = { target, hit, offset }; } } });
    unit.doAttack();
    assert.equal(shot.target, gate.node);
    assert.deepEqual({ x: shot.offset.x, y: shot.offset.y }, { x: -8, y: 100 });
    const space = new Node('Projectile layer', game.ndMain, 20, 40), bullet = { node: new Node('Projectile', space), tagNode: shot.target, tagPos: new Vec2(), targetOffset: shot.offset };
    const { setup } = require('../testing/backend-gameplay-harness.cjs');
    setup().load('KinghtFallBulletBase').default.prototype.readTargetPosition.call(bullet);
    assert.deepEqual({ x: bullet.tagPos.x, y: bullet.tagPos.y }, { x: -28, y: 60 });
    shot.hit();
    assert.deepEqual(impacts, [{ x: -8, y: 100 }]);
    gate.isDestroyed = true;
    unit.doAttack();
    assert.equal(shot.target, tower.node);
    shot.hit();
    assert.deepEqual(hits, ['wall', 'tower']);
  }
});

test('legacy splash damage cannot hit a tower through a live wall', () => {
  const { game, gate, tower, unit, hits } = fixture('KinghtFallEnemyItem07');
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
});
