'use strict';
// Real shipped navigation/SoldierBase, Map03 geometry and Creator's Box2D.
// Scene/stat/render adapters are supplied by the existing runtime harness.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {environment, Node, Vec2, PhysicsPolygonCollider, distance} = require('./runtime-harness.cjs');
const Maps = require('../../packages/game-data-editor/lib/map-assets');
const engine = process.env.COCOS_ENGINE_DIR || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const box2dPath = path.join(engine, 'external/box2d/box2d.js');
const separatorPath = path.join(engine, 'cocos2d/core/physics/CCPolygonSeparator.js');
const repo = path.resolve(__dirname, '../..');
const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const serialized = JSON.parse(fs.readFileSync(path.join(repo, 'assets/KinghtFallIconMap/Map03.prefab')));
const model = Maps.model(serialized);
const row = config.BuildEnum[3].levelList.find(value => value.index === 14);
const owner = model.owners.find(value => serialized[value.ownerComponent].ID === 9);
const prefab = JSON.parse(fs.readFileSync(path.join(repo, 'assets/KinghtFallEnemy/PlayItemEnemy02.prefab')));
const bodyConfig = prefab.find(value => value.__type__ === 'cc.RigidBody');
const bodyPoints = prefab.find(value => value.__type__ === 'cc.PhysicsPolygonCollider').points;
// Actual fresh stage3/plot9/tier1 heavy squad positions, captured before any
// planning update. No artificial blocker, actor radius or stat is introduced.
const starts = [
  {x: -81.04888916015625, y: 410.921875},
  {x: -58.04888916015625, y: 450.759033203125},
  {x: -104.04888916015625, y: 450.759033203125}
];

function fixtureGap(a, b) {
  let gap = -Infinity;
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length];
    const length = distance(p, q), x = -(q.y - p.y) / length, y = (q.x - p.x) / length;
    const aa = a.map(p => p.x * x + p.y * y), bb = b.map(p => p.x * x + p.y * y);
    gap = Math.max(gap, Math.min(...aa) - Math.max(...bb), Math.min(...bb) - Math.max(...aa));
  }
  return gap;
}

test('all three ordinary Map03 heavy soldiers yield out of blocked posts through real Box2D contacts', {
  skip: !fs.existsSync(box2dPath) || !fs.existsSync(separatorPath)
}, () => {
  const e = environment(), game = e.game, b2 = require(box2dPath);
  Object.assign(game, {isAgg: false, _separateArmyCommands: true,
    mapSize: {width: model.bounds.maxX - model.bounds.minX, height: model.bounds.maxY - model.bounds.minY}});
  game.ctrPlay.isDead = () => true;
  const separator = {exports: {}};
  vm.runInNewContext(fs.readFileSync(separatorPath, 'utf8'), {
    module: separator, exports: separator.exports, cc: {v2: (x = 0, y = 0) => new Vec2(x, y)}
  });
  const shapes = [];
  for (const source of model.colliders.filter(value => value.active && value.registered && model.byId[value.owner].kind === 'obstacle')) {
    const node = new Node(model.byId[source.owner].name, game.ndMain);
    const collider = node.addComponent(PhysicsPolygonCollider);
    collider.points = source.points.map(p => new Vec2(p.x, p.y));
    game.gameData.obstacles.push({node}); shapes.push(collider);
  }
  const node = new Node('9-by', game.ndMain, owner.world[4] + row.WorldScale * row.ModelOffset.x,
    owner.world[5] + row.WorldScale * row.ModelOffset.y);
  node.scaleX = node.scaleY = row.WorldScale;
  for (const polygon of row.Blocker.body.polygons) {
    const collider = node.addComponent(PhysicsPolygonCollider);
    collider.points = polygon.map(p => new Vec2(p.x, p.y)); shapes.push(collider);
  }
  game.gameData.buildings.push({node});
  const world = new b2.b2World(new b2.b2Vec2(0, 0));
  function body(points, unit, collider) {
    const def = new b2.b2BodyDef();
    def.type = unit ? b2.b2BodyType.b2_dynamicBody : b2.b2BodyType.b2_staticBody;
    def.fixedRotation = bodyConfig._fixedRotation; def.allowSleep = false;
    def.linearDamping = unit ? bodyConfig._linearDamping : 0;
    if (unit) def.position.Set(unit.node.x / 32, unit.node.y / 32);
    const result = world.CreateBody(def);
    for (const polygon of separator.exports.ConvexPartition(points)) {
      let vertices = [];
      for (const p of polygon) {
        vertices.push(new b2.b2Vec2(p.x / 32, p.y / 32));
        if (vertices.length === 8) {
          const shape = new b2.b2PolygonShape(); shape.Set(vertices, vertices.length);
          result.CreateFixture(shape, 1).SetUserData({unit, collider});
          vertices = [vertices[0], vertices[vertices.length - 1]];
        }
      }
      if (vertices.length >= 3) {
        const shape = new b2.b2PolygonShape(); shape.Set(vertices, vertices.length);
        result.CreateFixture(shape, 1).SetUserData({unit, collider});
      }
    }
    return result;
  }
  for (const collider of shapes) body(collider.points.map(p => collider.node.convertToWorldSpaceAR(p)), null, collider);
  const units = starts.map((point, i) => {
    const unit = e.actor('KinghtFallSoldierItem02', point.x, point.y);
    delete unit.isDead; delete unit.getSpeed;
    unit.cfg = {...config.SoldierCfg[90002]}; unit.debuffInfo = []; unit.uuid = 'Map03-heavy-' + i;
    unit.node._combatGeneration = 2; unit.state = 0; unit.hp = unit.hpMax = 72;
    unit.navigationTeam = 'friendly'; unit._separateArmyCommands = true;
    unit.rallyPoint = {pos: {...point}}; unit._personalRallyPoint = unit.rallyPoint;
    unit.node.addComponent(PhysicsPolygonCollider).points = bodyPoints.map(p => new Vec2(p.x, p.y));
    game.gameData.soldiers.push(unit); return unit;
  });
  const bodies = units.map(unit => body(bodyPoints.map(p => new Vec2(p.x, p.y)), unit, unit.node.getComponent(PhysicsPolygonCollider)));
  const navigation = e.nav.get(game); navigation.refresh();
  units.forEach(unit => e.nav.prepareTerrainExit(unit, game, true));
  const originalOverlaps = units.map(unit => new Set(unit._terrainExit.colliders.keys()));
  let touching = 0, suppressed = 0;
  const listener = new b2.b2ContactListener();
  listener.PreSolve = contact => {
    touching++;
    const data = [contact.GetFixtureA().GetUserData(), contact.GetFixtureB().GetUserData()];
    for (let i = 0; i < 2; i++) if (data[i].unit) {
      const adapter = {};
      data[i].unit.onPreSolve(adapter, data[i].collider, data[1 - i].collider);
      if (adapter.disabledOnce) {
        assert(originalOverlaps[units.indexOf(data[i].unit)].has(data[1 - i].collider), 'No additional collider may become passable');
        contact.SetEnabled(false); suppressed++;
      }
    }
  };
  world.SetContactListener(listener);
  let firstClear = null, lastMoving = 0;
  for (let frame = 0; frame < 720; frame++) {
    e.setTime((frame + 1) * 1000 / 60); e.nav.beginFrame(game);
    units.forEach((unit, i) => {
      const before = unit.node.position; unit.onUpdate(1 / 60);
      assert.equal(unit.getSpeed(), 85, 'Use the ordinary authored heavy speed');
      assert(distance(before, unit.node) <= unit.getSpeed() / 60 + 1e-5, 'No speed change or teleport');
      assert(navigation.gridFor(unit).canExitBlocked(before, unit.node.position, navigation.radius(unit), true), 'Every step must leave existing overlap outward without new terrain entry');
      bodies[i].SetTransformVec(new b2.b2Vec2(unit.node.x / 32, unit.node.y / 32), 0);
      bodies[i].SetLinearVelocity(new b2.b2Vec2(0, 0));
    });
    world.Step(1 / 60, 10, 10);
    units.forEach((unit, i) => { const p = bodies[i].GetPosition(); unit.node.setPosition(p.x * 32, p.y * 32); });
    const clear = units.every(unit => navigation.gridFor(unit).isWalkable(unit.node.position, navigation.radius(unit)));
    if (clear && firstClear === null) firstClear = frame;
    if (firstClear !== null) assert(clear, 'Do not return to an obstructed post after leaving it');
    if (units.some(unit => unit.state !== 0)) lastMoving = frame;
    assert.equal(game.gameData.soldiers.length, 3);
    assert(units.every(unit => unit.node.active && !unit.isDead() && unit.hp === 72 && !unit._isPooled));
  }
  assert(touching > 0, 'Real solid-body contact response must run');
  assert(suppressed > 0, 'The existing initial-overlap exception must run without broadening');
  assert(firstClear !== null && firstClear < 600, 'All three must reach clear ground before the 12-second bound');
  assert(lastMoving < 660, 'All three must remain idle on their clear posts for the final second');
  // Navigation circles deliberately enclose the flattened body diamond. Test
  // exact physical polygons rather than requiring those circles to separate.
  const polygons = bodies.map(body => {
    const fixture = body.GetFixtureList(), shape = fixture.GetShape();
    assert.equal(shape.m_count, bodyPoints.length);
    return shape.m_vertices.slice(0, shape.m_count).map(vertex => {
      const point = body.GetWorldPoint(vertex, new b2.b2Vec2());
      return {x: point.x * 32, y: point.y * 32};
    });
  });
  for (let i = 0; i < polygons.length; i++) for (let j = 0; j < i; j++) {
    assert(fixtureGap(polygons[i], polygons[j]) >= -.01, 'Actual active body polygons must be disjoint');
  }
});

test('ordinary walkable crowd yielding keeps clear-segment routing and ordinary speed', () => {
  const e = environment(), unit = e.unit(-100, 0), neighbour = e.unit(-75, 0);
  unit.navigationTeam = neighbour.navigationTeam = 'friendly';
  e.game.gameData.soldiers.push(unit, neighbour); e.box(0, 0, 40, 100);
  const navigation = e.nav.get(e.game), grid = navigation.gridFor(unit), target = {x: 100, y: 0};
  assert(grid.isWalkable(unit.node.position, navigation.radius(unit)));
  let detours = 0;
  const detour = navigation.crowdDetour;
  navigation.crowdDetour = function (actor, start, goal, radius, actualGrid, escapeOnly) {
    assert(!escapeOnly, 'Ordinary movement must not acquire escape permission');
    const result = detour.call(this, actor, start, goal, radius, actualGrid, escapeOnly);
    if (result) { detours++; assert(actualGrid.segmentClear(start, result, radius)); }
    return result;
  };
  for (let frame = 0; frame < 600; frame++) {
    e.setTime((frame + 1) * 1000 / 60); e.nav.beginFrame(e.game);
    const before = unit.node.position; e.nav.moveTo(unit, e.game, target, 1 / 60);
    assert(distance(before, unit.node) <= unit.getSpeed() / 60 + 1e-6);
    assert(grid.segmentClear(before, unit.node.position, navigation.radius(unit)), 'Ordinary crowd paths must not cross terrain');
    // Reproduce a normal crowd contact briefly, then let the actor proceed.
    if (frame < 65) unit.node.setPosition(before);
  }
  assert(detours > 0, 'Exercise the existing walkable stalled-crowd branch');
  assert(distance(unit.node, target) < .01);
});

test('exact physical clearance distinguishes a safe flattened body from its enclosing navigation circle', () => {
  const polygon = p => bodyPoints.map(v => ({x: p.x + v.x, y: p.y + v.y}));
  assert(fixtureGap(polygon({x: 0, y: 0}), polygon({x: 0, y: 0})) < 0, 'Reject actual body overlap');
  const a = {x: -4.46661376953125, y: 485.75}, b = {x: -11.369476318359375, y: 472.807373046875};
  assert(distance(a, b) < 40, 'The native-before conservative circles overlap');
  assert(fixtureGap(polygon(a), polygon(b)) > .5, 'The native-before real diamond polygons are nevertheless disjoint');
});
