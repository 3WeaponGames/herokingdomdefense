'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const {environment,Node,PhysicsPolygonCollider,PhysicsBoxCollider,distance}=require('./runtime-harness.cjs');
const map=require('./fixtures/map03-authored.json');

function nativeFloatTransforms(t){
  for(const method of ['convertToWorldSpaceAR','convertToNodeSpaceAR']){
    const original=Node.prototype[method];
    Node.prototype[method]=function(point){const result=original.call(this,point);result.x=Math.fround(result.x);result.y=Math.fround(result.y);return result;};
    t.after(()=>{Node.prototype[method]=original;});
  }
  const original=Node.prototype.setPosition;
  Node.prototype.setPosition=function(x,y){if(typeof x==='object')return original.call(this,Math.fround(x.x),Math.fround(x.y));return original.call(this,Math.fround(x),Math.fround(y));};
  t.after(()=>{Node.prototype.setPosition=original;});
}
function corner(t){
  nativeFloatTransforms(t);
  const e=environment();e.cc.sys={isNative:true};e.game.mapSize={width:map.bounds.maxX-map.bounds.minX,height:map.bounds.maxY-map.bounds.minY};e.game.ctrPlay.isDead=()=>true;
  for(const obstacle of map.obstacles){const node=new Node(obstacle.name,e.game.ndMain);for(const polygon of obstacle.polygons)node.addComponent(PhysicsPolygonCollider).points=polygon;e.game.gameData.obstacles.push({node});}
  const unit=e.actor('KinghtFallEnemyItem02',-1015.5786,-1406.0992);unit.node.setPosition(unit.node.position);unit.node.addComponent(PhysicsBoxCollider).size={width:22,height:22};unit.getFind=()=>null;unit.getSpeed=()=>102;unit.time.Attack=-1;
  const route=map.routes.find(route=>route.spawns.includes(11)&&route.buildings.length===0);
  unit.bornInfo={nodeIndex:0,pathList:route.points.map((point,index)=>new Node('route '+index,e.game.ndMain,point.x,point.y))};e.game.gameData.enemies.push(unit);
  const navigation=e.nav.get(e.game),grid=navigation.gridFor(unit),radius=navigation.radius(unit);
  assert.equal(grid.findPath(unit.node.position,route.points[0],radius,true),null,'Use the actual lane11 corner with no gradual terrain exit');
  const create=grid.createSearch;let jobs=0,pendingFrames=0;
  // Preserve the real grid result while modeling native millisecond slices
  // that leave an expensive query pending for multiple gameplay frames.
  grid.createSearch=function(...args){jobs++;const job=create.apply(this,args),step=job.step;job.step=function(work,milliseconds){const result=step.call(this,Math.min(work,1),milliseconds);if(!this.done)pendingFrames++;return result;};return job;};
  return{e,unit,navigation,grid,radius,jobs:()=>jobs,pendingFrames:()=>pendingFrames};
}
for(const noise of ['none','body','transform'])test('native lane11 failed query permits recovery and route progress with '+noise+' Float32 noise',t=>{
  const f=corner(t),{e,unit,grid,radius}=f;let recovered=false,progressed=false;
  for(let frame=0;frame<1800&&!progressed;frame++){
    e.setTime(frame*1000/60);e.game.ndMain.setPosition(1600+(noise==='transform'?Math.sin(frame/10)*200:0),-1300+(noise==='transform'?Math.cos(frame/10)*200:0));
    if(noise==='body'&&!unit._navigationRecoveries)unit.node.setPosition(-1015.5786,-1406.0992+(frame%2?.0004:-.0004));
    const before=e.nav.positionOf(unit.node,e.game),recoveries=unit._navigationRecoveries||0;e.nav.beginFrame(e.game);unit.onUpdate(1/60);const after=e.nav.positionOf(unit.node,e.game);
    if((unit._navigationRecoveries||0)>recoveries){recovered=true;assert(grid.isWalkable(after,radius),'Recovery must land on free ground');}
    else if(distance(before,after)>.001){assert(distance(before,after)<=102/60+.002,'Ordinary movement must retain authored speed');assert(grid.canExitBlocked(before,after,radius,true),'Float identity tolerance must not permit terrain crossing');}
    progressed=unit.bornInfo.nodeIndex>0;
  }
  assert(f.pendingFrames()>1,'Regression needs a real query spanning multiple native frames');
  assert(recovered,'Float32 rounding repeatedly invalidated the failed query and prevented five-second recovery');
  assert(progressed,'Recovered enemy did not reach its next authored route point');
  assert(f.jobs()<20,'Static route identity should not rebuild on Float32 camera noise');
});

test('native cached request identity still rejects a subpixel target that moved beyond rounding noise',()=>{
  const e=environment();e.cc.sys={isNative:true};e.box(0,0,20,400);
  const unit=e.unit(-100,0),navigation=e.nav.get(e.game);
  assert.equal(e.nav.moveTo(unit,e.game,{x:10.1,y:0},0).blocked,true);
  const result=e.nav.moveTo(unit,e.game,{x:9.9,y:0},.1);
  assert.equal(result.blocked,false);assert.equal(navigation.stats.searches,2);
  assert(unit.node.x>-100);assert(navigation.grid.segmentClear({x:-100,y:0},unit.node,navigation.radius(unit)));
});

test('native arrival cannot complete a pursuit at a genuinely moved cached endpoint',()=>{
  const e=environment();e.cc.sys={isNative:true};const unit=e.unit(-100,0);
  e.nav.moveTo(unit,e.game,{x:100,y:0},2);
  const stale=e.nav.moveTo(unit,e.game,{x:110,y:0},2);
  assert.equal(unit.node.x,100);assert.equal(stale.arrived,false);assert.equal(stale.reached,false);
  const current=e.nav.moveTo(unit,e.game,{x:110,y:0},1);
  assert.equal(unit.node.x,110);assert.equal(current.arrived,true);assert.equal(current.reached,true);
});

test('native soldier rests at a completed blocked-post projection despite request and contact rounding noise',()=>{
  const e=environment();e.cc.sys={isNative:true};e.box(0,0,40,40,true);
  const unit=e.actor('KinghtFallSoldierBase',-100,0),post={pos:{x:0,y:0}};
  unit.isAgg=false;unit.rallyPoint=unit._personalRallyPoint=post;unit.pathList=null;
  e.nav.recoverBlocked(unit,e.game,0);
  const projected=e.nav.moveTo(unit,e.game,post.pos,2);
  assert.equal(projected.arrived,true);assert.equal(projected.reached,false);
  unit.node.y+=.005;
  const arrival=e.nav.moveTo(unit,e.game,post.pos,0);
  assert.equal(arrival.arrived,true);assert.equal(arrival.reached,false);assert.equal(arrival.distance,0);
  assert(e.nav.projectedStandingPoint(unit,e.game,post.pos),'Contact noise must use the same completed-endpoint identity as moveTo');
  assert(e.nav.projectedStandingPoint(unit,e.game,{x:.005,y:0}),'Request noise must use the same target identity as moveTo');
  assert.equal(e.nav.projectedStandingPoint(unit,e.game,{x:.02,y:0}),null,'A genuinely changed post cannot inherit the old endpoint');
  const navigation=e.nav.get(e.game),grid=navigation.gridFor(unit),radius=navigation.radius(unit);
  assert.equal(grid.isWalkable(post.pos,radius),false);assert.equal(grid.isWalkable(unit.node.position,radius),true);
  unit.onUpdate(.05);
  assert.equal(unit.state,0,'The soldier must stop its Move animation at the accepted projection');
  assert(unit._standingGoal.terrainRecovery);assert.equal(unit._standingGoal.order,post);assert.deepEqual(post.pos,{x:0,y:0});
});
