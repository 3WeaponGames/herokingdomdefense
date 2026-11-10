'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {NavigationGrid}=require('../../assets/_script/NavigationGrid'),fixture=require('./fixtures/map03-authored.json');
const box=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}],bounds={minX:-100,minY:-100,maxX:100,maxY:100};
function finish(job,budget=37){let turns=0;while(!job.done){job.step(budget);assert(job.lastWork<=budget);assert(++turns<100000);}return job.result;}
function safe(grid,plan,radius){assert(plan);for(const p of plan.points)assert(grid.isWalkable(p,radius));for(let i=1;i<plan.points.length;i++)assert(grid.segmentClear(plan.points[i-1],plan.points[i],radius));assert.deepEqual(plan.points.at(-1),plan.goal);}

test('cold authored A* is cooperatively budgeted through setup, reconstruction and smoothing',()=>{
 const grid=new NavigationGrid(fixture.obstacles.flatMap(o=>o.polygons),fixture.bounds,20),query=grid._query;let queries=0;grid._query=function(...args){queries++;return query.apply(this,args);};
 const job=grid.createSearch({x:-668.558,y:1167.758},{x:190.137,y:-1137.361},36),phases=new Set();assert.equal(queries,0,'creating a request does not perform collision work');let slices=0;
 while(!job.done){const before=queries;job.step(61);phases.add(job.phase);assert(job.lastWork<=61);assert(queries-before<=job.lastWork*5,'setup or geometry escaped the primitive work budget');assert(++slices<10000);}
 assert(slices>20);safe(grid,job.result,36);assert(job.stats.expanded>2000);assert(phases.has('edges')&&phases.has('detach'));assert.equal(grid.lastSearch,job.stats);assert.equal(job._advance,null);assert.equal(job._release,null);
 const plan=job.result;job.cancel();assert.equal(job.result,null);assert.equal(job.cancelled,true);safe(grid,plan,36);
});

test('interleaved incremental requests and synchronous targeting own independent numeric workspaces',()=>{
 const grid=new NavigationGrid([box(-10,-40,10,40)],bounds,10),a={x:-70,y:0},b={x:70,y:0},c={x:-70,y:70},d={x:70,y:-70};
 const expectedA=new NavigationGrid([box(-10,-40,10,40)],bounds,10).findPath(a,b,5),expectedB=new NavigationGrid([box(-10,-40,10,40)],bounds,10).findPath(c,d,5),one=grid.createSearch(a,b,5),two=grid.createSearch(c,d,5);
 while(!one.done||!two.done){one.step(17);grid.findPath({x:-80,y:-70},{x:-80,y:70},5);two.step(29);}
 assert.deepEqual(one.result,expectedA);assert.deepEqual(two.result,expectedB);safe(grid,one.result,5);safe(grid,two.result,5);
});

test('cancellation drops all search closures, never invalidates shared geometry, and permits a fresh request',()=>{
 const grid=new NavigationGrid([box(-5,-100,5,100)],bounds,10),job=grid.createSearch({x:-70,y:0},{x:70,y:0},5,true);job.step(1000);assert(!job.done);job.cancel();assert(job.done&&job.cancelled);assert.equal(job._advance,null);assert.equal(job._release,null);assert.equal(job.step(10),null);assert.equal(job.lastWork,0);safe(grid,finish(grid.createSearch({x:-70,y:0},{x:70,y:0},5,true)),5);
});

test('time budgets, invalid budgets and worker exceptions are bounded and release request state',()=>{
 const grid=new NavigationGrid([box(-10,-40,10,40)],bounds,10),job=grid.createSearch({x:-70,y:0},{x:70,y:0},5);
 for(const work of [-1,.5,NaN])assert.throws(()=>job.step(work),/budget/);for(const ms of [-1,NaN])assert.throws(()=>job.step(10,ms),/budget/);assert.equal(job.step(0),null);assert.equal(job.lastWork,0);assert.equal(job.step(10,0),null);
 const now=Date.now;let clock=0;try{Date.now=()=>clock++;job.step(4096,2);}finally{Date.now=now;}assert(job.lastWork>0&&job.lastWork<=2);safe(grid,finish(job),5);
 const failed=grid.createSearch({x:0,y:80},{x:60,y:80},5),walk=grid.isWalkable;grid.isWalkable=()=>{throw Error('controlled geometry failure');};try{assert.throws(()=>failed.step(1),/controlled geometry/);assert(failed.done&&failed.cancelled);assert.equal(failed._advance,null);assert.equal(failed._release,null);}finally{grid.isWalkable=walk;}
});

test('a cold gate portal stays unpublished while incomplete and tolerates synchronous callers between slices',()=>{
 const {map01GateEnvironment,PhysicsBoxCollider}=require('./runtime-harness.cjs'),e=map01GateEnvironment(3,null),u=e.unit(-600,940);u.navigationTeam='friendly';u.node.addComponent(PhysicsBoxCollider).size={width:22,height:22};const nav=e.nav.get(e.game),source=nav.gridFor(u),radius=nav.radius(u),grid=new NavigationGrid(source.polygons.map(p=>p.vertices),source.bounds,source.cellSize,source._passages),start={x:-600,y:940},goal={x:-300,y:600};
 assert(grid._passages.length);const job=grid.createSearch(start,goal,radius);job.step(70);assert(!job.done);assert(!grid._cache(radius).bridges,'partially built portals are not valid shared caches');safe(grid,grid.findPath(goal,start,radius),radius);const bridges=grid._cache(radius).bridges;safe(grid,finish(job,41),radius);assert.equal(grid._cache(radius).bridges,bridges);assert.equal(job._advance,null);
});

test('large finite passage extents choose a bounded fine-grid resolution directly',()=>{
 const grid=new NavigationGrid([],{minX:-1e19,minY:-1e19,maxX:1e19,maxY:1e19},1e18,[box(-1e18,-1e18,1e18,1e18)]);assert(grid._passageBridges(grid._cache(1)) instanceof Map);
 const job=grid.createSearch({x:-2e18,y:0},{x:2e18,y:0},1);safe(grid,finish(job),1);
 const big=new NavigationGrid([],{minX:1e308,minY:1e308,maxX:1.0000000000000002e308,maxY:1.0000000000000002e308},1e292);assert(Number.isFinite(big._center(0).x)&&Number.isFinite(big._center(0).y));
});

test('nearby formation destinations reuse checked corridor links without another A* flood or endpoint drift',()=>{
 const b={minX:-200,minY:-200,maxX:200,maxY:200},grid=new NavigationGrid([box(-10,-70,10,70)],b,16),first=grid.findPath({x:-150,y:0},{x:150,y:0},8);safe(grid,first,8);
 for(const p of first.points)p.x=99999;first.goal.y=99999;
 const start={x:-145,y:5},goal={x:155,y:5},job=grid.createSearch(start,goal,8),plan=finish(job,3);safe(grid,plan,8);assert.equal(job.stats.reused,true);assert.equal(job.stats.expanded,0);assert.deepEqual(plan.points[0],start);assert.deepEqual(plan.goal,goal);
 const wider=grid.createSearch(start,goal,16);safe(grid,finish(wider),16);assert(!wider.stats.reused,'another body clearance cannot borrow a narrower route');
});

test('completed route reuse cannot cross an unrelated nearby wall or retain unbounded radius variants',()=>{
 const b={minX:-200,minY:-200,maxX:200,maxY:200},grid=new NavigationGrid([box(-10,-50,10,50),box(100,-200,110,200)],b,16);
 safe(grid,grid.findPath({x:-150,y:0},{x:75,y:0},8),8);assert.equal(grid.findPath({x:-145,y:5},{x:125,y:5},8),null);assert(!grid.lastSearch.reused);
 const many=new NavigationGrid([box(-10,-100,10,100)],{minX:-1000,minY:-1000,maxX:1000,maxY:1000},20);for(let radius=0;radius<40;radius++)safe(many,many.findPath({x:-600,y:0},{x:600,y:0},radius),radius);assert.equal(many._routes.size,32);assert.equal(many._caches.size,8);assert(Array.from(many._routes.values()).reduce((n,entry)=>n+entry.points.length,0)<=4096);
});

test('high-detail overlapping starts sample outward clearance cooperatively rather than blocking one slice',()=>{
 const corners=[[-50,-500],[50,-500],[50,500],[-50,500]],vertices=[];for(let edge=0;edge<4;edge++){const a=corners[edge],b=corners[(edge+1)%4];for(let i=0;i<1000;i++)vertices.push({x:a[0]+(b[0]-a[0])*i/1000,y:a[1]+(b[1]-a[1])*i/1000});}
 const grid=new NavigationGrid([vertices],{minX:-1000,minY:-1000,maxX:1000,maxY:1000},20),job=grid.createSearch({x:-25,y:0},{x:-600,y:0},400);let escapeSlices=0,total=0;
 while(!job.done){job.step(256,2);assert(job.lastWork<=256);if(job.phase==='escape')escapeSlices++;assert(++total<10000);}assert(escapeSlices>10);safe(grid,job.result,400);assert(job.result.escape);assert(grid._escapeClear(job.result.escape.from,job.result.escape.to,400));
});
