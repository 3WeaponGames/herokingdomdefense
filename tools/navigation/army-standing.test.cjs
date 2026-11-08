'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { environment, Node, Vec2, PhysicsPolygonCollider, distance } = require('./runtime-harness.cjs');
const prefab = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../assets/KinghtFallEnemy/PlayItemEnemy02.prefab')));
const body = prefab.find(row => row.__type__ === 'cc.PhysicsPolygonCollider');
function setup() {
  const e = environment(), game = e.game;
  Object.setPrototypeOf(game, e.load('KinghtFallGameCtrl').default.prototype);
  Object.assign(game, { pathIndex: 0, isAgg: false, _separateArmyCommands: true, mapSize: { width: 2000, height: 2000 } });
  game.ctrPlay.node.setPosition(0, 0);
  e.stubs.TestMode = { TestMode: { getInstance: () => ({ shouldBypassAdLimits: () => false }) } };
  e.soldier = (id, x = 0, y = -200) => {
    const unit = e.actor('KinghtFallSoldierItem' + String(id - 90000).padStart(2, '0'), x, y);
    unit.cfg = { ...unit.cfg, ID: id, AttackType: id === 90003 ? 2 : 1 };
    unit.node.addComponent(PhysicsPolygonCollider).points = body.points;
    unit.uuid = 'standing-' + game.gameData.soldiers.length;
    game.gameData.soldiers.push(unit); unit.setNew(); return unit;
  };
  e.tick = units => { e.clock = (e.clock || 0) + 50; e.setTime(e.clock); e.nav.beginFrame(game); units.forEach(unit => unit.onUpdate(.05)); };
  return e;
}
for (const mode of ['rally', 'follow']) test(mode + ' puts infantry in front, archers behind and cavalry on both flanks, then rests without replanning', () => {
  const e = setup(), game = e.game;
  const units = [90001, 90002, 90003, 90004].flatMap(id => Array.from({ length: 4 }, () => e.soldier(id)));
  if (mode === 'rally') game.rallyCommand();
  else { game.isAgg = true; units.forEach(unit => { unit._followSelected = true; unit.applyArmyOrder(game); }); }
  e.nav.beginFrame(game);
  const goals = units.map(unit => game.getArmyOrderGoal(unit, { x: 0, y: 0 }));
  assert(goals.every(goal => goal && goal.pos && !goal.pending));
  goals.forEach((goal, index) => goals.slice(0, index).forEach(other => assert(distance(goal.pos, other.pos) >= 46 - .001, 'open ground lost the wider rank spacing')));
  const group = id => units.map((unit, index) => ({ unit, p: goals[index].pos })).filter(row => row.unit.cfg.ID === id);
  const front = group(90001).concat(group(90002)), rear = group(90003), cavalry = group(90004);
  assert(Math.min(...front.map(row => row.p.y)) > Math.max(...rear.map(row => row.p.y)));
  assert(front.every(row => row.p.y > 0)); assert(rear.every(row => row.p.y < 0));
  const footWidth = Math.max(...front.concat(rear).map(row => Math.abs(row.p.x)));
  assert(cavalry.every(row => Math.abs(row.p.x) > footWidth));
  assert(cavalry.some(row => row.p.x < 0) && cavalry.some(row => row.p.x > 0));
  const width = Math.max(...goals.map(g => g.pos.x)) - Math.min(...goals.map(g => g.pos.x));
  const height = Math.max(...goals.map(g => g.pos.y)) - Math.min(...goals.map(g => g.pos.y));
  assert(width > 120 && width < 400); assert(height > 180 && height < 450);
  units.forEach((unit, index) => unit.node.setPosition(goals[index].pos));
  e.tick(units); assert(units.every(unit => unit.state === 0));
  const positions = units.map(unit => unit.node.position), searches = e.nav.get(game).stats.searches;
  for (let frame = 0; frame < 100; frame++) e.tick(units);
  units.forEach((unit, index) => { assert.equal(unit.state, 0); assert(distance(unit.node, positions[index]) < .001); });
  assert.equal(e.nav.get(game).stats.searches, searches);
});

function barracks(e, count = 4) {
  if (!Vec2.prototype.multiplyScalar) Vec2.prototype.multiplyScalar = function (n) { this.x *= n; this.y *= n; return this; };
  const b = new (e.load('KinghtFallBuildBarracks').default)();
  b.node = new Node('Barracks', e.game.ndMain); b.ndBotnNodeList = new Node('Spawn', b.node, 0, -80);
  b.buildInfo = { cfg: { Data: [count, 90002, .1] } }; b.VideoTimes = 0;
  const progress = { active: false, getChildByName: () => ({ getComponent: () => ({ fillRange: 0 }) }) };
  Object.assign(b, { ndPro: progress, ndVideoSoldier: {}, _testAdLimitBypass: false, canAddVideoSoldier: () => false, getIsWork: () => true, time: { Reborn: 0, RebornMax: .1 } });
  b.enemyList = Array.from({ length: count }, () => e.soldier(90002, -700, 0));
  b.enemyList.forEach((unit, index) => { unit._personalRallyPoint = null; unit.setParent(b); unit.node.setPosition(b.getPos(index)); unit.setNew(); });
  return b;
}
test('barracks assigns body-clear standing spots and adding a soldier retains existing posts', () => {
  const e = setup(); e.game.ctrPlay.node.setPosition(600, 600);
  const b = barracks(e), nav = e.nav.get(e.game), previous = b.enemyList.map(unit => unit.node.position);
  b.enemyList.forEach((unit, index) => {
    assert(nav.gridFor(unit).isWalkable(unit.node, nav.radius(unit)));
    b.enemyList.slice(0, index).forEach(other => assert(distance(unit.node, other.node) >= nav.radius(unit) + nav.radius(other) + 4 - .001));
  });
  b.VideoTimes++; const extra = e.soldier(90002, -700, 0); b.enemyList.push(extra); extra.setParent(b);
  extra._personalRallyPoint = null; extra.node.setPosition(b.getPos(4)); extra.setNew();
  b.enemyList.slice(0, 4).forEach((unit, index) => assert(distance(b.getPos(index), previous[index]) < .001));
  for (let frame = 0; frame < 100; frame++) e.tick(b.enemyList);
  assert(b.enemyList.every(unit => unit.state === 0));
  b.enemyList.slice(0, 4).forEach((unit, index) => assert(distance(unit.node, previous[index]) < .001));
});

const box2dPath = path.join(process.env.COCOS_ENGINE_DIR || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine', 'external/box2d/box2d.js');
test('a casualty returns beside an occupied post and stays still through real Box2D contacts', { skip: !fs.existsSync(box2dPath) }, () => {
  const e = setup(); e.game.ctrPlay.node.setPosition(600, 600);
  const b = barracks(e), casualty = b.enemyList[0], post = casualty.node.position;
  delete casualty.isDead; casualty.hp = 0; casualty.node.active = false; b.addDie(casualty);
  const visitor = e.soldier(90002, post.x, post.y), army = b.enemyList.concat([visitor]);
  b.doTime(.2); assert(casualty.node.active); assert(casualty.hp > 0);
  assert(distance(casualty.node, post) > 20, 'occupied spawn point was reused');
  const box2d = require(box2dPath), world = new box2d.b2World(new box2d.b2Vec2(0, 0));
  const bodies = army.map(unit => {
    const def = new box2d.b2BodyDef(); def.type = box2d.b2BodyType.b2_dynamicBody; def.fixedRotation = true;
    const result = world.CreateBody(def), shape = new box2d.b2PolygonShape();
    shape.Set(body.points.map(p => new box2d.b2Vec2(p.x / 32, p.y / 32)), body.points.length);
    const fixture = new box2d.b2FixtureDef(); fixture.shape = shape; fixture.density = 1; fixture.friction = .2; result.CreateFixture(fixture);
    return result;
  });
  let resting;
  for (let frame = 0; frame < 200; frame++) {
    e.tick(army);
    bodies.forEach((body, index) => { body.SetTransformVec(new box2d.b2Vec2(army[index].node.x / 32, army[index].node.y / 32), 0); body.SetLinearVelocity(new box2d.b2Vec2(0, 0)); });
    world.Step(.05, 8, 3); bodies.forEach((body, index) => { const p = body.GetPosition(); army[index].node.setPosition(p.x * 32, p.y * 32); });
    if (frame === 100) resting = army.map(unit => unit.node.position);
    if (frame > 100) army.forEach((unit, index) => { assert.equal(unit.state, 0, 'resting soldier resumed pushing toward an occupied point'); assert(distance(unit.node, resting[index]) < .5); });
  }
  assert(distance(casualty.node, post) < 100, 'casualty abandoned the barracks area');
  assert(distance(casualty.node, visitor.node) >= e.nav.get(e.game).radius(casualty) + e.nav.get(e.game).radius(visitor));
});
