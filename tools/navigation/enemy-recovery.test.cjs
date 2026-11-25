'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {environment,Node,PhysicsPolygonCollider,PhysicsBoxCollider,installIntersection,distance}=require('./runtime-harness.cjs');
const {NavigationGrid}=require('../../assets/_script/NavigationGrid');
function enemy(e,x,y){
  const u=e.actor('KinghtFallEnemyItem02',x,y);delete u.getFind;delete u.onFindList;
  u.cfg={...u.cfg,AttackRange:50,SearchRange:220};u.time.Attack=1;
  u.bornInfo={nodeIndex:0,pathList:[new Node('objective',e.game.ndMain,300,0)]};return u;
}
test('nearby enemies share the expensive unreachable-component search while retaining full body clearance',()=>{
  const polygon=[{x:-10,y:-300},{x:10,y:-300},{x:10,y:300},{x:-10,y:300}];
  const grid=new NavigationGrid([polygon],{minX:-300,minY:-300,maxX:300,maxY:300},20),goal={x:150,y:0};
  let expanded=0,shared=0;
  for(let i=0;i<100;i++){
    const start={x:-150+i%5,y:Math.floor(i/5)},route=grid.findPath(start,goal,20,true);
    assert(route&&route.partial&&!route.reached);expanded+=grid.lastSearch.expanded;if(grid.lastSearch.shared)shared++;
    for(let j=1;j<route.points.length;j++)assert(grid.segmentClear(route.points[j-1],route.points[j],20));
  }
  assert.equal(shared,99,'wave repeated identical unreachable searches');assert(expanded<500);
  assert.equal(grid.findPath({x:-150,y:0},goal,20),null,'exact-goal caller inherited a partial route');
});
test('a distant wall enters attack range, is breached and all queued enemies continue to their objective',()=>{
  const e=environment();installIntersection(e.cc);e.game.mapSize={width:1000,height:1000};e.game.ctrPlay.isDead=()=>true;
  const node=new Node('wall',e.game.ndMain),shape=node.addComponent(PhysicsPolygonCollider);
  const polygon=shape.points=[{x:-10,y:-500},{x:10,y:-500},{x:10,y:500},{x:-10,y:500}];
  let alive=true,attacks=0,peak=0;
  e.game.gameData.buildings.push({node,getIsWork:()=>alive,getWposPhyCol:()=>alive?[polygon]:[],getWposPhyCol2:()=>alive?[{tagNode:node,points:polygon}]:[]});
  const army=Array.from({length:30},(_,i)=>enemy(e,-350-i%3,Math.floor(i/3)*3));
  army.forEach(u=>{u.doAttackStart=()=>{if(++attacks===3){alive=false;shape.enabled=false;}u.time.Attack=0;};});
  const nav=e.nav.get(e.game),moved=new Set();
  for(let frame=0;frame<650;frame++){
    e.setTime(frame*50);e.nav.beginFrame(e.game);const searches=nav.stats.searches;
    for(const u of army){const previous=u.node.position;u.onUpdate(.05);assert(distance(previous,u.node)<=3.000001,'recovery teleported a unit');if(distance(previous,u.node)>.01)moved.add(u);}
    peak=Math.max(peak,nav.stats.searches-searches);
    if(army.every(u=>u.bornInfo.nodeIndex===1))break;
  }
  assert.equal(moved.size,army.length,'queued enemies starved');assert(attacks>=3,'enemies never approached the distant wall');
  assert(army.every(u=>u.bornInfo.nodeIndex===1),'breach did not release the route');assert(peak<=8,'search budget exceeded');
});

const box2dFile=path.join(process.env.COCOS_ENGINE_DIR||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine','external/box2d/box2d.js');
test('a body pinned in an occupied lane yields around the crowd without crossing adjacent terrain or teleporting',{skip:!fs.existsSync(box2dFile)},()=>{
  const b=require(box2dFile);
  function run(recover){
    const e=environment();e.game.mapSize={width:600,height:600};e.game.ctrPlay.isDead=()=>true;
    const unit=e.unit(-90,0),blocker=e.unit(0,0);unit.node.addComponent(PhysicsBoxCollider).size={width:22,height:22};blocker.node.addComponent(PhysicsBoxCollider).size={width:22,height:22};
    e.game.gameData.soldiers.push(blocker);e.box(0,60,80,30);
    const nav=e.nav.get(e.game);if(!recover)nav.crowdDetour=()=>null;
    const world=new b.b2World(new b.b2Vec2(0,0));
    function body(x,dynamic){const def=new b.b2BodyDef();def.type=dynamic?b.b2BodyType.b2_dynamicBody:b.b2BodyType.b2_staticBody;def.fixedRotation=true;def.allowSleep=false;def.position.Set(x/32,0);const body=world.CreateBody(def),shape=new b.b2PolygonShape();shape.SetAsBox(11/32,11/32);body.CreateFixture(shape,1);return body;}
    const moving=body(-90,true);body(0,false);let minY=0,peak=0;
    for(let frame=0;frame<600;frame++){
      e.setTime(frame*1000/60);e.nav.beginFrame(e.game);const previous=unit.node.position,before=nav.stats.searches;
      e.nav.moveTo(unit,e.game,{x:90,y:0},1/60);peak=Math.max(peak,nav.stats.searches-before);
      assert(distance(previous,unit.node)<=1.000001,'recovery changed ordinary movement speed');
      assert(nav.grid.segmentClear(previous,unit.node,nav.radius(unit)),'crowd yield crossed terrain');
      moving.SetTransformVec(new b.b2Vec2(unit.node.x/32,unit.node.y/32),0);moving.SetLinearVelocity(new b.b2Vec2(0,0));world.Step(1/60,10,10);
      const p=moving.GetPosition();unit.node.setPosition(p.x*32,p.y*32);minY=Math.min(minY,unit.node.y);
    }
    assert(peak<=8);return{unit,minY};
  }
  assert(distance(run(false).unit.node,{x:90,y:0})>80,'negative control must reproduce the physical stall');
  const fixed=run(true);assert(distance(fixed.unit.node,{x:90,y:0})<.01,'crowd recovery did not finish its objective');assert(fixed.minY<-10,'unit did not take the safe side of the occupied lane');
});
test('an unreachable nearby hero cannot pin pursuit when another valid target is reachable',()=>{
  const e=environment();installIntersection(e.cc);e.game.mapSize={width:600,height:600};
  const wall=e.box(0,0,20,600);e.game.ctrPlay.node.setPosition(30,0);
  const u=enemy(e,-30,0),ally={node:new Node('reachable defender',e.game.ndMain,-150,120),isDead:()=>false};
  e.game.gameData.soldiers.push(ally);let attacks=0;u.doAttackStart=()=>{attacks++;};
  for(let frame=0;frame<150&&!attacks;frame++){e.setTime(frame*50);e.nav.beginFrame(e.game);u.onUpdate(.05);}
  assert(attacks>0,'unreachable hero monopolized acquisition');assert.equal(u.getUpdateTarget().tag,ally.node);
  // The same rejected target becomes eligible immediately when the wall opens.
  wall.enabled=false;e.nav.beginFrame(e.game);assert(u.canPursueTarget(e.game.ctrPlay.node,e.game));
});
test('partial routes preserve the objective and geometry changes resume it without repeated static searches',()=>{
  const e=environment();e.game.mapSize={width:600,height:600};const wall=e.box(0,0,20,600),u=enemy(e,-150,0);
  // Isolate route travel from combat; no destructible targets exist here.
  u.getFind=()=>null;const nav=e.nav.get(e.game);
  for(let frame=0;frame<90;frame++){e.setTime(frame*50);e.nav.beginFrame(e.game);u.onUpdate(.05);}
  assert.equal(u.bornInfo.nodeIndex,0);assert(u.node.x>-150&&u.node.x<-10);const searches=nav.stats.searches;
  for(let frame=90;frame<100;frame++){e.setTime(frame*50);e.nav.beginFrame(e.game);u.onUpdate(.05);}
  assert.equal(nav.stats.searches,searches,'stationary frontier repeated the full search');
  wall.enabled=false;
  for(let frame=100;frame<300&&u.bornInfo.nodeIndex===0;frame++){e.setTime(frame*50);e.nav.beginFrame(e.game);u.onUpdate(.05);}
  // The authored point at x300 is on the map edge and resolves inside bounds.
  assert.equal(u.bornInfo.nodeIndex,1);
});

test('physically pinned melee, ranged and support enemies recover to unoccupied ground with a clear route continuation',()=>{
 for(const type of ['KinghtFallEnemyItem02','KinghtFallEnemyItem03','KinghtFallEnemyAuxiliary']){
  const e=environment();e.game.mapSize={width:1000,height:1000};e.game.ctrPlay.isDead=()=>true;
  const u=e.actor(type,-300,0);u.cfg={...u.cfg,SearchRange:0};u.bornInfo={nodeIndex:0,pathList:[new Node('objective',e.game.ndMain,300,0)]};u.getFind=()=>null;u.time.Attack=-1;e.game.gameData.enemies.push(u);
  const original=u.node.position,hp=u.hp;let recovered=false;
  for(let frame=0;frame<140;frame++){
   e.setTime(frame*50);e.nav.beginFrame(e.game);u.onUpdate(.05);
   if(u._navigationRecoveries){recovered=true;break;}
   u.node.setPosition(original); // A persistent native contact cancels the attempted step.
  }
  assert(recovered,type+' remained pinned');const nav=e.nav.get(e.game),radius=nav.radius(u);
  assert(nav.grid.isWalkable(u.node.position,radius));assert(nav.grid.segmentClear(u.node.position,{x:300,y:0},radius));assert.equal(u.hp,hp);assert.equal(e.game.gameData.enemies.length,1);
  const after=u.node.position;e.nav.beginFrame(e.game);u.onUpdate(.05);assert(distance(after,u.node)>0,type+' did not resume movement');
 }
});

test('an isolated terrain spawn recovers onto its forward route rather than returning to the same partial frontier',()=>{
 const e=environment();e.game.mapSize={width:600,height:600};e.game.ctrPlay.isDead=()=>true;e.box(0,0,20,600);
 const u=enemy(e,-150,0),goal={x:150,y:0};u.getFind=()=>null;u.bornInfo.pathList[0].setPosition(goal);e.game.gameData.enemies.push(u);
 let recovered=false;
 for(let frame=0;frame<400&&u.bornInfo.nodeIndex===0;frame++){
  e.setTime(frame*50);e.nav.beginFrame(e.game);u.onUpdate(.05);
  if(!recovered&&u._navigationRecoveries){
   recovered=true;const nav=e.nav.get(e.game),plan=nav.grid.findPath(u.node.position,goal,nav.radius(u));
   assert(plan&&plan.reached,'relocation only reconnected to the old unreachable frontier');
  }
 }
 assert(recovered);assert.equal(u.bornInfo.nodeIndex,1,'recovered enemy did not continue along its route');assert.equal(u._navigationRecoveries,1);
});

test('an intact building cannot be bypassed by stranded recovery when target acquisition is delayed',()=>{
 const e=environment();e.game.mapSize={width:600,height:600};e.game.ctrPlay.isDead=()=>true;e.box(0,0,20,600,true);
 const u=enemy(e,-150,0);u.getFind=()=>null;u.bornInfo.pathList[0].setPosition(150,0);e.game.gameData.enemies.push(u);
 for(let frame=0;frame<400;frame++){e.setTime(frame*50);e.nav.beginFrame(e.game);u.onUpdate(.05);assert(u.node.x<0,'recovery teleported through an intact defensive wall');}
 assert.equal(u.bornInfo.nodeIndex,0);assert(!u._navigationRecoveries,'partial wall frontier was mistaken for a usable continuation');
});

test('stranded pursuit retains its valid combat continuation instead of jumping back onto the authored route',()=>{
 const e=environment();e.game.mapSize={width:1000,height:1000};e.game.ctrPlay.isDead=()=>true;
 const u=e.unit(-300,0),pursuit={x:-300,y:200};u.navigationTeam='enemy';u.bornInfo={nodeIndex:0,pathList:[new Node('route',e.game.ndMain,300,0)]};
 u._targetSearchCache={target:{tag:new Node('pursuit',e.game.ndMain,pursuit.x,pursuit.y),canAtt:false}};e.game.gameData.enemies.push(u);
 const original=u.node.position;let recovered=false;
 for(let frame=0;frame<140;frame++){
  e.setTime(frame*50);e.nav.beginFrame(e.game);e.nav.moveTo(u,e.game,pursuit,.05);
  if(e.nav.recoverStranded(u,e.game,.05)){recovered=true;break;}
  u.node.setPosition(original);
 }
 assert(recovered);assert(Math.abs(u.node.x-original.x)<.001,'pursuit recovery was redirected toward the authored route');assert(u.node.y>original.y);
 const nav=e.nav.get(e.game);assert(nav.grid.segmentClear(u.node.position,pursuit,nav.radius(u)));assert.equal(u.bornInfo.nodeIndex,0);
});

test('stationary attacks, support waits, zero speed and deferred navigation never trigger stranded relocation',()=>{
 for(const mode of ['attack','wait','zero','pending','cooldown']){
  const e=environment(),u=enemy(e,-150,0);u.state=mode==='attack'?2:mode==='wait'?3:1;if(mode==='zero')u.getSpeed=()=>0;
  for(let frame=0;frame<140;frame++){
   if(mode==='pending')u._navigationState={job:{}};
   if(mode==='cooldown')u._targetSearchCache={target:{canAtt:true}};
   if(mode==='attack'||mode==='wait')u.state=mode==='attack'?2:3;
   u.updateCombatTimers(.05);
  }
  assert(!u._navigationRecoveries,mode+' was treated as a movement failure');
 }
});

test('stranded watchdog defers collider measurements until an actual recovery attempt',()=>{
 const e=environment(),u=e.unit(-100,0),nav=e.nav.get(e.game),measure=nav.radius;
 e.game.mapSize={width:4000,height:4000};
 const data=e.game.gameData;
 let rosterReads=0;
 data.getEnemyList=()=>{rosterReads++;return data.enemies;};
 data.getSoldierList=()=>{rosterReads++;return data.soldiers;};
 let measurements=0;nav.radius=function(...args){if(args[0]===u)measurements++;return measure.apply(this,args);};
 // Continued physical progress keeps the watchdog cold for an entire wave.
 for(let frame=0;frame<600;frame++){
  e.setTime(frame*1000/60);e.nav.beginFrame(e.game);u.node.x+=1;
  assert.equal(e.nav.recoverStranded(u,e.game,1/60),false);
 }
 assert.equal(measurements,0,'ordinary walking repeated the movement collider scan');
 // A stationary actor must still retain the existing five-second threshold.
 u.node.x+=8;e.nav.beginFrame(e.game);e.nav.recoverStranded(u,e.game,.1);
 const still=u.node.position;
 for(let frame=0;frame<49;frame++){
  e.nav.beginFrame(e.game);assert.equal(e.nav.recoverStranded(u,e.game,.1),false);
 }
 assert.equal(measurements,0,'a cold watchdog scanned colliders before its deadline');
 for(let frame=0;frame<3&&measurements===0;frame++){
  e.nav.beginFrame(e.game);e.nav.recoverStranded(u,e.game,.1);
 }
 assert.equal(measurements,1,'the bounded recovery attempt must measure current body clearance');
 assert.deepEqual(u.node.position,still,'no authored continuation may relocate the actor');
 assert.equal(u._enemyStall.elapsed,3,'a failed attempt leaves two seconds until the next try');
 assert.equal(nav._strandedRecoveryFrame,nav._frameId,'a failed attempt consumes the frame budget');
 for(let frame=0;frame<19;frame++){
  e.nav.beginFrame(e.game);assert.equal(e.nav.recoverStranded(u,e.game,.1),false);
 }
 assert.equal(measurements,1,'the watchdog must wait before retrying');
 for(let frame=0;frame<2&&measurements===1;frame++){
  e.nav.beginFrame(e.game);assert.equal(e.nav.recoverStranded(u,e.game,.1),false);
 }
 assert.equal(measurements,2,'the watchdog retries after two seconds');
 assert.equal(rosterReads,0,'there is no need to scan actors without a continuation point');
});
