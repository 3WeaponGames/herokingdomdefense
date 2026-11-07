'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup, Node, Vec2 } = require('./backend-gameplay-harness.cjs');
const { simulate } = require('../../packages/game-data-editor/preview/projectile.js');

const prefab = JSON.parse(fs.readFileSync(path.join(__dirname,
  '../../assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab'), 'utf8'));
const towerSettings = prefab.find(row => row.__type__ === '9986dU0XHpJNL2WkEBaowG/');
Vec2.prototype.rotateSelf = function (angle) {
  const x = this.x, y = this.y;
  this.x = x * Math.cos(angle) - y * Math.sin(angle);
  this.y = x * Math.sin(angle) + y * Math.cos(angle);
  return this;
};

function projectile(h, type, id) {
  const Bullet = h.load('KinghtFallBullet' + type).default;
  const shot = new Bullet();
  shot.node = new Node(id);
  shot.uuid = id;
  shot.bullet = { active: true };
  shot.ctrPar = { freeBullet() {} };
  if (type === 'Build') shot.speed = towerSettings.speed;
  return shot;
}

for (const fps of [10, 60]) test('authored tower shot and preview agree at ' + fps + ' FPS', () => {
  const h = setup(), shot = projectile(h, 'Build', 'tower'), target = new Node('target', null, 137.5, 0);
  const dt = 1 / fps;
  let hits = 0;
  shot.setTag(new Vec2(), target, () => hits++);
  const preview = simulate({
    speed: shot.speed, straight: true, angle: shot.angle, angleSpeed: shot.angleSpeed,
    addAngleSpeed: shot.addAngSpeed, arrivalRadius: 25
  }, target.x, fps);
  const points = [{ x: shot.node.x, y: shot.node.y }];
  let ticks = 0;
  while (!hits && ++ticks < fps) {
    const previous = shot.node.x;
    shot.onUpdate(dt);
    if (shot.node.x !== previous) points.push({ x: shot.node.x, y: shot.node.y });
  }
  assert.equal(hits, 1);
  assert.equal(ticks, fps === 10 ? 3 : 14);
  assert(Math.abs(shot.node.x - (fps === 10 ? target.x : 13 * shot.speed / 60)) < 1e-9);
  assert.deepEqual(preview.points.map(({ x, y }) => ({ x, y })), points);
  assert.equal(preview.time, preview.points.at(-1).time);
  shot.onUpdate(dt);
  assert.equal(hits, 1);
  assert.equal(shot.state, 1);
});

test('a steered shot tests the current target and retains strict radius and ordinary endpoint timing', () => {
  const h = setup();
  for (const [x, y, expected] of [[27.5, 24, 1], [27.5, 25, 0], [27.5, 26, 0], [90, 0, 0], [40, 0, 0]]) {
    const target = new Node('moving', null, 100, 0), shot = projectile(h, 'Build', 'test');
    // Hold this heading while the target moves to distinguish a chord from a tangent.
    shot.angleSpeed = 0;
    let hits = 0;
    shot.setTag(new Vec2(), target, () => hits++);
    target.setPosition(x, y);
    shot.onUpdate(.1);
    assert.equal(hits, expected, 'target ' + [x, y]);
    if (x === 40) {
      assert.equal(shot.node.x, 55);
      shot.onUpdate(.1);
      assert.equal(hits, 1);
    }
  }
});

test('retiring a target before the crossing step discards the shot and never grants an impact', () => {
  const h = setup(), shot = projectile(h, 'Build', 'retired'), target = new Node('target', null, 137.5, 0);
  target._combatGeneration = 4;
  let hits = 0;
  shot.setTag(new Vec2(), target, () => hits++);
  h.g.ndBuildArr2.push(shot);
  shot.onUpdate(.1);
  shot.onUpdate(.1);
  const late = shot.callAttack;
  target._combatGeneration++;
  shot.onUpdate(.1);
  late();
  assert.equal(hits, 0);
  assert.equal(shot.state, 2);
  assert.equal(h.g.ndBuildArr2.length, 0);
});

for (const [type, key] of Object.entries({
  Play: 'ndPlayArr2', Enemy: 'ndEnemyArr', Soldier: 'ndSoldArr', Build: 'ndBuildArr2'
})) test(type + ' projectile removals retain forward hit order and leave appended shots for the next tick', () => {
  const h = setup(), dt = 1 / 60, hits = [], target = new Node('target', null, 10, 0);
  h.g.gameStatus = h.e.stubs.KinghtFallModle.KinghtFallGameStage.Fight;
  h.g.gameData.onUpdata = h.noop;
  h.g.ctrPlay.onUpdata = h.noop;
  h.g.ctrPlay.doMove = h.noop;
  function ready(id, append) {
    const shot = projectile(h, type, id);
    shot.setTag(new Vec2(), target, () => {
      hits.push(id);
      if (append) h.g[key].push(ready('new', false));
    });
    return shot;
  }
  const expiring = [ready('expired1'), ready('expired2')];
  for (const shot of expiring) { shot.state = 1; shot.time = dt / 2; }
  h.g[key].push(...expiring, ready('first', true), ready('second'));
  h.g.onUpdate(dt);
  assert.deepEqual(hits, ['first', 'second']);
  assert.deepEqual(Array.from(h.g[key], shot => shot.uuid), ['first', 'second', 'new']);
  assert(expiring.every(shot => shot.state === 2));
  h.g.onUpdate(dt);
  assert.deepEqual(hits, ['first', 'second', 'new']);
});
