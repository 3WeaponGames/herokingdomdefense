'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {map01GateEnvironment, PhysicsPolygonCollider, distance} = require('./runtime-harness.cjs');

// Captured from the real Map01 gate3/30-soldier outward rally. The leading
// shield was pushed into the corner's clearance margin while its follower
// remained on a clear north-west route. Neither was attacking or waiting.
const starts = [
  {x: -495.5934526147636, y: 764.4877236524874},
  {x: -509.96684094234934, y: 773.4378267669056}
];
const goals = [{x: -733, y: 972.9089653438}, {x: -771, y: 972.9089653438}];
const prefab = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../assets/KinghtFallEnemy/PlayItemEnemy02.prefab'), 'utf8'));
const collider = prefab.find(x => x.__type__ === 'cc.PhysicsPolygonCollider');
const rigidBody = prefab.find(x => x.__type__ === 'cc.RigidBody');

test('an overlapping gate-corner start chooses a safe forward escape instead of reversing into its follower', () => {
  const e = map01GateEnvironment(3, {x: -600, y: 940});
  const grid = e.nav.get(e.game).gridFor({navigationTeam: 'friendly'});
  assert.equal(grid.isWalkable(starts[0], 20), true);
  assert.equal(grid.isWalkable(starts[1], 20), false);
  const route = grid.findPath(starts[1], goals[1], 20);
  assert(route && route.escape && route.reached);
  assert(grid._escapeClear(starts[1], route.escape.to, 20), 'escape must monotonically leave existing overlap without entering other obstacles');
  assert(route.escape.to.y > starts[1].y, 'the exit must advance through this gate rather than reverse south into the follower');
  for (let i = 1; i < route.points.length; i++) assert(grid.segmentClear(route.points[i - 1], route.points[i], 20));
});

const engine = process.env.COCOS_ENGINE_DIR || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const box2dPath = path.join(engine, 'external/box2d/box2d.js');
test('real Box2D shield contacts release the captured opposing gate pair and both reach their rally goals', {skip: !process.env.COCOS_ENGINE_DIR && !fs.existsSync(box2dPath)}, () => {
  const b = require(box2dPath);
  function run(nearestExitControl) {
    const e = map01GateEnvironment(3, {x: -600, y: 940});
    const nav = e.nav.get(e.game), grid = nav.gridFor({navigationTeam: 'friendly'});
    // Negative control reproduces the old nearest-exit policy against the
    // same real collision solver and original coarse gate grid. The refined
    // gate portals can independently release this old two-unit deadlock.
    if (nearestExitControl) {
      grid._passages=[];const search=grid.createSearch;
      grid.createSearch=function(start,goal,radius,partial){
        let escape=null;if(!this.isWalkable(start,radius)){const cache=this._cache(radius);escape=this._nearby(start,cache,this.cellSize*3+cache.radius*2).slice(0,128).find(c=>this._escapeClear(start,c.point,cache.radius))?.point||null;}
        const job=search.call(this,escape||start,goal,radius,partial);
        // Keep the negative control's original synchronous timing too: yielding
        // can itself break the captured perfectly opposing contact symmetry.
        while(!job.done)job.step(Infinity);
        if(job.result&&escape)job.result.escape={from:{x:start.x,y:start.y},to:escape,distance:distance(start,escape)};return job;
      };
    }
    const world = new b.b2World(new b.b2Vec2(0, 0));
    const units = starts.map(p => {
      const unit = e.unit(p.x, p.y);
      unit.navigationTeam = 'friendly'; unit.getSpeed = () => 85;
      unit.node.addComponent(PhysicsPolygonCollider).points = collider.points;
      const def = new b.b2BodyDef();
      def.type = b.b2BodyType.b2_dynamicBody;
      def.fixedRotation = rigidBody._fixedRotation;
      def.allowSleep = rigidBody._allowSleep;
      def.linearDamping = rigidBody._linearDamping;
      def.position.Set(p.x / 32, p.y / 32);
      const body = world.CreateBody(def), shape = new b.b2PolygonShape();
      shape.Set(collider.points.map(p => new b.b2Vec2(p.x / 32, p.y / 32)), collider.points.length);
      const fixture = new b.b2FixtureDef();
      fixture.shape = shape; fixture.density = 1; fixture.friction = .2; fixture.restitution = 0;
      body.CreateFixture(fixture); unit.body = body;
      return unit;
    });
    assert.equal(rigidBody._allowSleep, false);
    let touchingFrames = 0, peakSearches = 0;
    for (let frame = 0; frame < 600; frame++) {
      e.setTime(frame * 1000 / 60); e.nav.beginFrame(e.game);
      const before = nav.stats.searches;
      units.forEach((unit, index) => {
        const old = unit.node.position;
        e.nav.moveTo(unit, e.game, goals[index], 1 / 60);
        assert(distance(old, unit.node) <= 85 / 60 + 1e-7, 'recovery must retain ordinary movement speed');
        // Match Cocos syncPosition + physics synchronization: no artificial
        // separation, teleport recovery or ignored contact between the pair.
        unit.body.SetTransformVec(new b.b2Vec2(unit.node.x / 32, unit.node.y / 32), 0);
        unit.body.SetLinearVelocity(new b.b2Vec2(0, 0));
      });
      peakSearches = Math.max(peakSearches, nav.stats.searches - before);
      world.Step(1 / 60, 10, 10);
      for (let contact = world.GetContactList(); contact; contact = contact.GetNext()) if (contact.IsTouching()) touchingFrames++;
      units.forEach(unit => { const p = unit.body.GetPosition(); unit.node.setPosition(p.x * 32, p.y * 32); });
    }
    assert(peakSearches <= 8, 'shared navigation search budget must remain intact');
    return {units, touchingFrames};
  }
  const old = run(true);
  assert(old.touchingFrames > 500, 'negative control must maintain real touching contacts');
  old.units.forEach((unit, i) => assert(distance(unit.node, starts[i]) < .1, 'old escape policy must reproduce the observed near-zero-motion stall'));
  const current = run(false);
  assert(current.touchingFrames > 0, 'fixed path must still use normal collision response');
  current.units.forEach((unit, i) => assert(distance(unit.node, goals[i]) < .01, 'both soldiers must reach their actual rally goals'));
});
