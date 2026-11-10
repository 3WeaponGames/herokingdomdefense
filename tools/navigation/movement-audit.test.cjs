'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {environment,Node,PhysicsBoxCollider,distance}=require('./runtime-harness.cjs');

test('a resting soldier displaced into a wall clearance margin resumes a safe gradual escape',()=>{
 const e=environment(),unit=e.actor('KinghtFallSoldierBase',-25,0);
 unit.node.addComponent(PhysicsBoxCollider).size={width:22,height:22};e.box(0,0,20,200);
 unit._separateArmyCommands=true;unit.rallyPoint={pos:{x:-25,y:0}};unit._settledPoint={x:-25,y:0};unit._standingGoal={pos:{x:-25,y:0}};
 const nav=e.nav.get(e.game),grid=nav.gridFor(unit),start=unit.node.position;
 assert(!grid.isWalkable(start,nav.radius(unit)),'fixture must overlap inflated clearance, not the wall itself');
 assert(grid.isWalkable(start,0));assert.equal(e.nav.canStopFollowing(unit,e.game,unit.rallyPoint.pos),false);
 unit.onUpdate(.1);assert(distance(start,unit.node)>0,'a settled point must not freeze a physically overlapping body');assert(distance(start,unit.node)<=6.000001,'recovery retains ordinary movement speed');
});

test('resetting a deferred navigation request releases its turn instead of blocking the next active unit',()=>{
 const e=environment(),first=e.unit(-100,0),second=e.unit(-100,20),nav=e.nav.get(e.game),target={x:100,y:0};
 e.nav.beginFrame(e.game);nav._frameSearches=8;
 assert(e.nav.moveTo(first,e.game,target,.1).deferred);e.nav.reset(first);nav._frameSearches=0;
 assert.equal(e.nav.moveTo(second,e.game,target,.1).deferred,undefined,'cancelled requester still owns the head of the queue');
 assert(second.node.x>-100);
});

test('pooling releases movement, route and pursuit references for both enemy and allied actors',()=>{
 for(const name of ['KinghtFallEnemyBase','KinghtFallSoldierBase']){
  const e=environment();e.stubs.PoolMgr={PoolMgr:{getInstance:()=>({freeNode(_key,node){node.active=false;}})}};e.game.gameData.delEnemy=e.game.gameData.delSoldier=()=>{};
  const unit=e.actor(name),target=new Node('old scene waypoint',e.game.ndMain,100,0);
  unit._isPooled=false;unit.bornInfo={pathList:[target],nodeIndex:0};unit.pathList={pathInfoList:[{pos:{x:100,y:0}}]};unit._orderTarget={node:target};unit._retaliationTarget={node:target};unit._standingGoal={pos:{x:0,y:0}};
  e.nav.moveTo(unit,e.game,{x:100,y:0},.1);assert(unit._navigationState);unit._navigationProgress={owner:e.nav.get(e.game)};unit.freeNode();
  assert.equal(unit._navigationState,null,name+' keeps its planner');assert.equal(unit._navigationProgress,null,name+' keeps its crowd recovery');
  if(name==='KinghtFallEnemyBase')assert.equal(unit.bornInfo,null,'pooled route retains scene nodes');
  else{assert.equal(unit.pathList,null);assert.equal(unit._orderTarget,null);assert.equal(unit._retaliationTarget,null);assert.equal(unit._standingGoal,null);}
 }
});

test('collider snapshot invalidates when a native two-dimensional skew changes',()=>{
 const e=environment(),wall=e.box(0,0,20,80),node=wall.node,original=node.convertToWorldSpaceAR;
 node.skewX=node.skewY=0;node.convertToWorldSpaceAR=function(p){return original.call(this,{x:p.x+Math.tan(this.skewX*Math.PI/180)*p.y,y:p.y+Math.tan(this.skewY*Math.PI/180)*p.x});};
 const nav=e.nav.get(e.game);nav.refresh();const old=nav.grid;node.skewX=25;e.nav.beginFrame(e.game);nav.refresh();assert.notEqual(nav.grid,old,'skew left the cached static contour unchanged');
 const expected=[{x:-10,y:-40},{x:10,y:-40},{x:10,y:40},{x:-10,y:40}].map(p=>e.game.ndMain.convertToNodeSpaceAR(node.convertToWorldSpaceAR(p)));
 for(let i=0;i<expected.length;i++){assert(Math.abs(nav._polygons[0][i].x-expected[i].x)<1e-8);assert(Math.abs(nav._polygons[0][i].y-expected[i].y)<1e-8);}
});

test('auxiliary enemies retain permanent movement effects while expiring timed effects normally',()=>{
 const e=environment(),unit=e.actor('KinghtFallEnemyAuxiliary');unit.bornInfo={nodeIndex:0,pathList:[new Node('goal',e.game.ndMain,100,0)]};unit.time.Attack=-1;
 const permanent={time:0,timeMax:-1},timed={time:0,timeMax:.1};unit.debuffInfo=[permanent,timed];unit.delBuffIdx=i=>unit.debuffInfo.splice(i,1);
 unit.onUpdate(.05);assert.equal(unit.debuffInfo.length,2,'permanent movement effect expired on the first update');unit.onUpdate(.05);assert.deepEqual(unit.debuffInfo,[permanent]);assert.equal(permanent.time,0);
});

test('pre-spawn radius measures an inactive root body without including disabled child forms',()=>{
 const e=environment(),unit=e.unit();unit.node.addComponent(PhysicsBoxCollider).size={width:22,height:22};
 const alternate=new Node('disabled alternative',unit.node);alternate.active=false;alternate.addComponent(PhysicsBoxCollider).size={width:500,height:500};
 unit.node.active=false;unit.rigidBody.active=false;
 assert.equal(e.nav.get(e.game).radius(unit,true),20);assert.equal(e.nav.get(e.game).radius(unit),12);
});

function fakeIncremental(e,steps){
 const nav=e.nav.get(e.game);nav.refresh();const jobs=[];nav.grid.createSearch=(start,target)=>{const job={done:false,lastWork:1,cancelled:false,count:0,step(){this.count++;if(this.count>=steps){this.done=true;this.result={points:[{...start},{...target}],goal:{...target},reached:true};}},cancel(){this.cancelled=true;}};jobs.push(job);return job;};return {nav,jobs};
}
test('bounded pending searches advance once per frame, retain moving-target progress and release workspace on completion',()=>{
 const e=environment(),unit=e.unit(-100,0),f=fakeIncremental(e,3);let result;
 for(let frame=0;frame<3;frame++){e.nav.beginFrame(e.game);result=e.nav.moveTo(unit,e.game,{x:100+frame*30,y:0},.1);if(result.pending)e.nav.moveTo(unit,e.game,{x:100+frame*30,y:0},0);assert.equal(f.jobs[0].count,frame+1);}
 assert.equal(f.jobs.length,1,'moving target restarted unfinished work');assert(unit.node.x>-100,'completed pending plan made no progress');assert.equal(result.arrived,false,'stale target counted as reached');assert(f.jobs[0].cancelled);assert.equal(f.nav._activeSearches.size,0);
});
test('cancelling an in-flight search immediately grants the next active queued unit',()=>{
 const e=environment(),first=e.unit(),second=e.unit(-100,20),f=fakeIncremental(e,3),target={x:100,y:0};
 e.nav.beginFrame(e.game);assert(e.nav.moveTo(first,e.game,target,.1).pending);assert(e.nav.moveTo(second,e.game,target,.1).deferred);e.nav.reset(first);
 assert(f.jobs[0].cancelled);assert(e.nav.moveTo(second,e.game,target,.1).pending);assert.equal(f.nav._activeSearches.get(f.nav.grid).unit,second);
});

test('enemy and friendly grids progress independently within a shared frame budget',()=>{
 const e=environment(),enemy=e.unit(),ally=e.unit(-100,20),f=fakeIncremental(e,3);ally.navigationTeam='friendly';f.nav.gridFor(ally).createSearch=f.nav.grid.createSearch;
 for(let frame=0;frame<3;frame++){e.nav.beginFrame(e.game);e.nav.moveTo(enemy,e.game,{x:100,y:0},.1);e.nav.moveTo(ally,e.game,{x:100,y:20},.1);assert(f.nav._activeSearches.size<=2);assert(f.nav._frameSearchWork<=4096);}
 assert(ally.node.x>-100,'friendly work waited for enemy completion');assert(enemy.node.x>-100);assert.equal(f.jobs.length,2);
});
test('geometry revision cancels pending work and drops obsolete grid queues immediately',()=>{
 const e=environment(),first=e.unit(),second=e.unit(-100,20),f=fakeIncremental(e,3),target={x:100,y:0};
 e.nav.beginFrame(e.game);e.nav.moveTo(first,e.game,target,.1);e.nav.moveTo(second,e.game,target,.1);assert(f.nav._requests.size);
 e.box(0,0,20,100);e.nav.beginFrame(e.game);f.nav.refresh();assert(f.jobs[0].cancelled);assert.equal(f.nav._activeSearches.size,0);assert.equal(f.nav._requests.size,0);assert.equal(first._navigationRequestOwner,null);assert.equal(second._navigationRequestOwner,null);
});
test('a failed pending query with stale start coordinates cannot reject the current pursuit',()=>{
 const e=environment(),unit=e.unit(),f=fakeIncremental(e,2),search=f.nav.grid.createSearch;
 f.nav.grid.createSearch=(...args)=>{const job=search(...args),step=job.step;job.step=(...slice)=>{step.apply(job,slice);if(job.done)job.result=null;};return job;};
 e.nav.beginFrame(e.game);assert(e.nav.moveTo(unit,e.game,{x:100,y:0},.1).pending);unit.node.x++;
 e.nav.beginFrame(e.game);const result=e.nav.moveTo(unit,e.game,{x:100,y:0},.1);assert(result.deferred);assert.equal(result.blocked,false);assert.equal(unit._navigationState,null);assert.equal(f.nav.stats.noPath,0);
});

test('pending continuations reserve their frame slot before newly arriving queries',()=>{
 const e=environment(),enemy=e.unit(),f=fakeIncremental(e,2);e.nav.beginFrame(e.game);assert(e.nav.moveTo(enemy,e.game,{x:100,y:0},.1).pending);
 const friendGrid=f.nav.gridFor({navigationTeam:'friendly'});friendGrid.createSearch=(start,goal)=>({done:false,lastWork:1,step(){this.done=true;this.result={points:[start,goal],goal,reached:true};},cancel(){}});
 e.nav.beginFrame(e.game);const results=[];for(let i=0;i<8;i++){const unit=e.unit(-100,20+i);unit.navigationTeam='friendly';results.push(e.nav.moveTo(unit,e.game,{x:100,y:20+i},.1));}
 e.nav.moveTo(enemy,e.game,{x:100,y:0},.1);assert.equal(f.nav._frameSearches,8);assert(results[7].deferred);assert.equal(f.jobs[0].count,2,'existing query lost its reserved continuation');
});
test('permanent building effects survive while adjacent timed effects expire',()=>{
 const e=environment(),building=new (e.load('KinghtFallBuildBase').default)(),permanent={time:0,timeMax:-1},timed={time:0,timeMax:.1};
 building.getIsWork=()=>true;building.debuffInfo=[permanent,timed];building.delBuffIdx=i=>building.debuffInfo.splice(i,1);building.doTime=()=>{};
 building.onUpdate(.05);assert.equal(building.debuffInfo.length,2);building.onUpdate(.05);assert.deepEqual(building.debuffInfo,[permanent]);assert.equal(permanent.time,0);
});
