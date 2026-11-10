'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {NavigationGrid}=require('../../assets/_script/NavigationGrid');
const {environment,PhysicsBoxCollider,Vec2,distance}=require('./runtime-harness.cjs');
const box=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const bounds={minX:-600,minY:-600,maxX:600,maxY:600};
test('one-way terrain allows movement within a blocker and exit, but prevents entry and re-entry with full body clearance',()=>{
 const grid=new NavigationGrid([box(-100,-100,100,100),box(180,-40,220,40)],bounds,20);
 assert(grid.canExitBlocked({x:90,y:0},{x:0,y:0},12),'existing overlap may move deeper before finding an exit');
 assert(grid.canExitBlocked({x:0,y:0},{x:150,y:0},12));
 assert(!grid.canExitBlocked({x:150,y:0},{x:0,y:0},12),'the same edge is forbidden in reverse');
 assert(!grid.canExitBlocked({x:0,y:0},{x:260,y:0},12),'an exit cannot enter a different blocker');
 assert(!grid.canExitBlocked({x:150,y:112},{x:0,y:112},12),'the whole body must clear the boundary');
 const concave=[{x:-200,y:-100},{x:200,y:-100},{x:200,y:100},{x:100,y:100},{x:100,y:0},{x:-100,y:0},{x:-100,y:100},{x:-200,y:100}];
 const u=new NavigationGrid([concave],bounds,20);
 assert(!u.canExitBlocked({x:-150,y:50},{x:250,y:50},12),'a straight line cannot leave and re-enter a concave polygon');
 assert(u.canExitBlocked({x:-150,y:50},{x:-150,y:180},12));
});
test('deep overlaps find exits beyond the old local search and preserve the objective',()=>{
 const grid=new NavigationGrid([box(-300,-300,100,300),box(-100,-250,300,250)],bounds,20),start={x:0,y:0},goal={x:500,y:0},route=grid.findPath(start,goal,12);
 assert(route&&route.reached&&route.escape);assert.deepEqual(route.goal,goal);
 let previous=start;for(const p of route.points){assert(grid.canExitBlocked(previous,p,12));previous=p;}
 assert(!grid.segmentClear(start,goal,12));assert(!grid.canExitBlocked(goal,start,12));
});
test('incremental escape can turn inside an existing blocker to avoid entering a different obstacle',()=>{
 // The outer U encloses the small starting blocker. Its opening is above it;
 // every straight exit from the deep start toward the goal crosses that U.
 const inner=box(-220,-220,220,220),outer=[{x:-320,y:-320},{x:320,y:-320},{x:320,y:320},{x:240,y:320},{x:240,y:-240},{x:-240,y:-240},{x:-240,y:320},{x:-320,y:320}];
 const grid=new NavigationGrid([inner,outer],bounds,20),start={x:0,y:-190},goal={x:500,y:0},job=grid.createSearch(start,goal,12);
 let slices=0;while(!job.done&&slices++<20000){job.step(37);assert(job.lastWork<=37);}
 assert(job.done&&job.result&&job.result.reached);const route=job.result;
 let previous=start;for(const p of route.points){assert(grid.canExitBlocked(previous,p,12),'escape entered another blocker');previous=p;}
 assert.deepEqual(route.goal,goal);assert(grid.isWalkable(route.escape.to,12));
});
test('shared movement recovers friendly and enemy units after spawn, skill, knockback and a new blocker',()=>{
 for(const team of ['friendly','enemy']){
  const e=environment();e.game.mapSize={width:1200,height:1200};const unit=e.unit(-450,0);unit.navigationTeam=team;
  const nav=e.nav.get(e.game),goal={x:450,y:0};e.nav.moveTo(unit,e.game,goal,.05);
  e.box(0,0,500,500);
  for(const displaced of [{x:0,y:0},{x:-100,y:40},{x:100,y:-40}]){
   unit.node.setPosition(displaced.x,displaced.y);let escaped=false;
   for(let frame=0;frame<700&&distance(unit.node,goal)>.001;frame++){
    const previous={x:unit.node.x,y:unit.node.y};e.nav.moveTo(unit,e.game,goal,.05);
    assert(distance(previous,unit.node)<=unit.getSpeed()*.05+1e-7,'recovery must retain ordinary speed');
    assert(nav.gridFor(unit).canExitBlocked(previous,unit.node,nav.radius(unit)),'movement entered blocked ground');
    if(nav.gridFor(unit).isWalkable(unit.node,nav.radius(unit)))escaped=true;
   }
   assert(escaped&&distance(unit.node,goal)<.001,team+' must resume its objective after displacement');
  }
 }
});
test('hero controls can leave existing terrain overlap and cannot acquire an exception by walking into a blocker',()=>{
 const e=environment();e.game.mapSize={width:1200,height:1200};const hero=e.actor('KinghtFallGamePlayCtrl',0,0);hero.node.addComponent(PhysicsBoxCollider).size={width:22,height:22};hero.state=0;hero.time.RenSoundTime=1;hero.ctrPlayAni={setMove(){},setIdle(){}};
 const old=e.box(0,0,200,200),other=e.box(300,0,100,100);hero.doMove(new Vec2(1,0),.1);assert.equal(hero.node.x,6);assert(hero.rigidBody.enabledContactListener);
 let contact={};hero.onPreSolve(contact,null,old);assert(contact.disabledOnce,'the overlapping collider must permit exit');contact={};hero.onPreSolve(contact,null,other);assert(!contact.disabledOnce,'a different collider stays solid');
 for(let frame=0;frame<28;frame++)hero.doMove(new Vec2(1,0),.1);assert(hero.node.x>120);
 contact={};hero.onPreSolve(contact,null,old);assert(!contact.disabledOnce,'terrain becomes solid again as soon as overlap clears');
 const before=hero.node.position;for(let frame=0;frame<35;frame++)hero.doMove(new Vec2(-1,0),.1);assert(hero.node.x>100,'hero input cannot re-enter the blocker');assert(e.nav.get(e.game).gridFor(hero).isWalkable(hero.node.position,e.nav.get(e.game).radius(hero)));assert(hero.node.x<before.x);
 e.nav.reset(hero);assert.equal(hero._terrainExit,null,'reset releases old scene collider references');
});
test('enabling terrain contacts registers live Creator fixtures once and never rebuilds the actor body',()=>{
 const e=environment(),unit=e.unit(),collider=unit.node.addComponent(PhysicsBoxCollider),fixtures=[{},{}],registered=[];collider._fixtures=fixtures;collider.body=unit.rigidBody;
 e.physics._contactListener={_contactFixtures:registered};e.physics._registerContactFixture=fixture=>registered.push(fixture);collider.apply=()=>{throw Error('Contact registration must not rebuild physics');};
 e.nav.enableTerrainContacts(unit);e.nav.enableTerrainContacts(unit);assert(unit.rigidBody.enabledContactListener);assert.deepEqual(registered,fixtures);
});
const box2dFile=require('node:path').join(process.env.COCOS_ENGINE_DIR||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine','external/box2d/box2d.js');
test('real physics cannot pin an exiting unit between overlapping terrain colliders',{skip:!require('node:fs').existsSync(box2dFile)},()=>{
 const b=require(box2dFile);
 function run(allowExit){
  const e=environment();e.game.mapSize={width:1200,height:1200};const unit=e.actor('KinghtFallSoldierBase',0,0);unit.node.addComponent(PhysicsBoxCollider).size={width:22,height:22};const nav=e.nav.get(e.game),world=new b.b2World(new b.b2Vec2(0,0));let moving,suppressed=0;
  function body(x,y,w,h,dynamic,collider){const def=new b.b2BodyDef();def.type=dynamic?b.b2BodyType.b2_dynamicBody:b.b2BodyType.b2_staticBody;def.fixedRotation=true;def.allowSleep=false;def.position.Set(x/32,y/32);const result=world.CreateBody(def),shape=new b.b2PolygonShape();shape.SetAsBox(w/64,h/64);const fixture=result.CreateFixture(shape,1);fixture.SetUserData(collider);return result;}
  for(const x of [-100,100])body(x,0,400,400,false,e.box(x,0,400,400));moving=body(0,0,22,22,true,null);
  const listener=new b.b2ContactListener();listener.PreSolve=contact=>{const a=contact.GetFixtureA(),other=(a.GetBody()===moving?contact.GetFixtureB():a).GetUserData(),adapter={};if(allowExit)unit.onPreSolve(adapter,null,other);if(adapter.disabledOnce){contact.SetEnabled(false);suppressed++;}};world.SetContactListener(listener);
  const goal={x:450,y:0};for(let frame=0;frame<900&&distance(unit.node,goal)>.01;frame++){e.setTime(frame*1000/60);e.nav.beginFrame(e.game);e.nav.moveTo(unit,e.game,goal,1/60);moving.SetTransformVec(new b.b2Vec2(unit.node.x/32,unit.node.y/32),0);moving.SetLinearVelocity(new b.b2Vec2(0,0));world.Step(1/60,10,10);const p=moving.GetPosition();unit.node.setPosition(p.x*32,p.y*32);}
  const contact={};unit.onPreSolve(contact,null,e.game.gameData.obstacles[0].node.components[0]);return {remaining:distance(unit.node,goal),suppressed,stillDisabled:!!contact.disabledOnce};
 }
 assert(run(false).remaining>300,'negative control must reproduce the physical trap');const fixed=run(true);assert(fixed.remaining<.01,'the actor must walk through its existing overlap and finish its objective');assert(fixed.suppressed>0);assert(!fixed.stillDisabled,'the collision exception must be temporary');
});
