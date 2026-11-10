'use strict';
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { NavigationGrid } = require('../../assets/_script/NavigationGrid');
const fixture = require('./fixtures/map01-live.json');
const bounds = { minX: -100, minY: -100, maxX: 100, maxY: 100 };
function box(x0,y0,x1,y1) { return [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}]; }
function safePath(grid,result,radius) {
  assert(result, 'Expected a path'); assert(result.points.length > 0);
  let previous=result.escape?result.escape.from:result.points[0],exited=grid.isWalkable(previous,radius);
  for(const p of result.points){if(exited){assert(grid.isWalkable(p,radius),'Unsafe path point '+JSON.stringify(p));assert(grid.segmentClear(previous,p,radius),'Unsafe smoothed segment');}else assert(grid.canExitBlocked(previous,p,radius),'An escape entered or re-entered blocked terrain');if(grid.isWalkable(p,radius))exited=true;previous=p;}
  assert.deepEqual(result.points[result.points.length-1],result.goal);
  assert(grid.lastSearch.expanded<=grid.count,'A* must expand each numeric cell at most once');
  if(result.escape) {
    assert(result.points.some(p=>p.x===result.escape.to.x&&p.y===result.escape.to.y),'The exit must remain on the movement route');
  }
}
let passed=0;
function test(name,run) { run();passed++;console.log('PASS '+name); }

test('Direct empty-space path, exact goal, immutable inputs and map boundary clearance',()=>{
  const grid=new NavigationGrid([],bounds,10),start={x:-70,y:-60},goal={x:80,y:75};
  const result=grid.findPath(start,goal,10);safePath(grid,result,10);
  assert.equal(result.reached,true);assert.equal(result.points.length,2);assert.equal(grid.lastSearch.direct,true);
  result.points[0].x=5;assert.equal(start.x,-70);
  assert.equal(grid.isWalkable({x:95,y:0},10),false);
  assert.equal(grid.segmentClear({x:0,y:0},{x:101,y:0},0),false);
  assert.throws(()=>new NavigationGrid([],bounds,0),/positive/);
  assert.throws(()=>new NavigationGrid([],{minX:0,minY:0,maxX:10000,maxY:10000},10),/65536/);
  assert.throws(()=>grid.findPath({x:NaN,y:0},goal,5),/finite/);
});
test('Polygon interior, corner radius and a thin crossing obstacle are exact',()=>{
  const polygon=box(0,0,20,20),grid=new NavigationGrid([polygon],bounds,10);
  assert.equal(grid.isWalkable({x:10,y:10},0),false);
  assert.equal(grid.isWalkable({x:0,y:10},0),false);
  assert.equal(grid.isWalkable({x:-5,y:-5},7),true);
  assert.equal(grid.isWalkable({x:-5,y:-5},8),false);
  assert.equal(grid.segmentClear({x:-20,y:10},{x:40,y:10},0),false);
  polygon[0].x=-1000;assert.equal(grid.isWalkable({x:-20,y:0},0),true);
  const thin=new NavigationGrid([box(-0.1,-80,0.1,80)],bounds,20);
  assert.equal(thin.segmentClear({x:-10,y:0},{x:10,y:0},0),false);
  safePath(thin,thin.findPath({x:-80,y:0},{x:80,y:0},2),2);
});
test('A* detours around walls and gives larger units larger clearance',()=>{
  const grid=new NavigationGrid([box(-10,-40,10,40)],bounds,10),start={x:-70,y:0},goal={x:70,y:0};
  const small=grid.findPath(start,goal,5),large=grid.findPath(start,goal,25);
  safePath(grid,small,5);safePath(grid,large,25);
  assert(Math.max(...large.points.map(p=>Math.abs(p.y)))>Math.max(...small.points.map(p=>Math.abs(p.y))));
  assert.equal(grid.findPath({x:-40,y:0},{x:40,y:0},110),null);
});
test('Diagonal cells cannot cut across touching obstacle corners',()=>{
  const grid=new NavigationGrid([box(0,10,10,20),box(10,0,20,10)],{minX:0,minY:0,maxX:20,maxY:20},10);
  assert.equal(grid.isWalkable({x:5,y:5},0),true);assert.equal(grid.isWalkable({x:15,y:15},0),true);
  assert.equal(grid.segmentClear({x:5,y:5},{x:15,y:15},0),false);
  assert.equal(grid.findPath({x:5,y:5},{x:15,y:15},0),null);
});
test('Concave U obstacle needs an outward detour rather than a convex approximation',()=>{
  const polygon=[{x:-60,y:-60},{x:60,y:-60},{x:60,y:60},{x:30,y:60},{x:30,y:-30},{x:-30,y:-30},{x:-30,y:60},{x:-60,y:60}];
  const grid=new NavigationGrid([polygon],bounds,10);
  assert.equal(grid.isWalkable({x:0,y:0},8),true);
  const result=grid.findPath({x:0,y:0},{x:0,y:-80},8);safePath(grid,result,8);
  assert(result.points.some(p=>p.y>60));assert(result.points.some(p=>Math.abs(p.x)>60));
  const reversed=new NavigationGrid([polygon.slice().reverse()],bounds,10);
  safePath(reversed,reversed.findPath({x:0,y:0},{x:0,y:-80},8),8);
});
test('Blocked targets project to an accessible boundary; unrelated walls are not mistaken for arrival',()=>{
  const grid=new NavigationGrid([box(-20,-20,20,20)],bounds,10);
  const result=grid.findPath({x:-80,y:0},{x:0,y:0},5);safePath(grid,result,5);
  assert.equal(result.reached,false);assert(result.goal.x<-20);
  const divided=new NavigationGrid([box(-5,-100,5,100),box(60,-20,90,20)],bounds,10);
  assert.equal(divided.findPath({x:-70,y:0},{x:40,y:0},5),null,'Free goal across full wall is unreachable');
  assert.equal(divided.findPath({x:-70,y:0},{x:75,y:0},5),null,'Blocked goal behind unrelated wall must not project to start-side wall');
});
test('An overlapping start has a short outward escape, not a cross-wall teleport',()=>{
  const grid=new NavigationGrid([box(-10,-60,10,60)],bounds,10);
  const start={x:-5,y:0},result=grid.findPath(start,{x:70,y:0},5);safePath(grid,result,5);
  assert(result.escape);assert(result.escape.to.x<-10);assert.equal(grid.segmentClear(start,result.escape.to,5),false);
  assert(result.points.some(p=>Math.abs(p.y)>60),'It must still route around the wall after escaping to its near side');
  const deep=new NavigationGrid([box(-80,-80,80,80)],bounds,10);
  const exit=deep.findPath({x:0,y:0},{x:90,y:90},5);assert(exit&&exit.reached&&exit.escape,'Deep placement can walk out and resume its objective');assert(deep.canExitBlocked({x:0,y:0},exit.points[0],5));assert(!deep.canExitBlocked({x:90,y:90},{x:0,y:0},5),'A cleared unit cannot enter again');
});
test('Negative world coordinates, reversed routes, and unit-sized narrow passages remain valid',()=>{
  const shifted=new NavigationGrid([box(-950,-1950,-930,-1880)],{minX:-1000,minY:-2000,maxX:-800,maxY:-1800},10);
  safePath(shifted,shifted.findPath({x:-980,y:-1900},{x:-820,y:-1900},8),8);
  safePath(shifted,shifted.findPath({x:-820,y:-1900},{x:-980,y:-1900},8),8);
  const narrow=new NavigationGrid([box(-100,-100,100,-15),box(-100,15,100,100)],bounds,10);
  safePath(narrow,narrow.findPath({x:-80,y:0},{x:80,y:0},12),12);
  const overlapping=narrow.findPath({x:-80,y:0},{x:80,y:0},20);assert(overlapping&&overlapping.reached,'An already-overlapping body can still move within the area');assert.equal(narrow.segmentClear({x:-80,y:0},{x:80,y:0},20),false,'The passage still blocks ordinary entry by an oversized unit');
});
test('Radius caches are isolated and bounded; very large off-map polygons do not inflate the index',()=>{
  const grid=new NavigationGrid([box(-10,-40,10,40)],bounds,10);
  for(let radius=0;radius<12;radius++)safePath(grid,grid.findPath({x:-70,y:0},{x:70,y:0},radius),radius);
  assert.equal(grid._caches.size,8);
  const outside=new NavigationGrid([box(1e8,1e8,1e9,1e9)],bounds,10);
  assert.equal(outside._index.size,0);assert.equal(outside.findPath({x:-80,y:0},{x:80,y:0},5).reached,true);
});
test('All captured Map01 authored segments route safely for radii12/20/30 with bounded search',()=>{
  const grid=new NavigationGrid(fixture.obstacles.flatMap(obstacle=>obstacle.polygons),{minX:-930,minY:-1610,maxX:930,maxY:1610},20);
  const began=performance.now();let count=0,escapes=0,projected=0,maxExpanded=0;
  for(const radius of [12,20,30])for(const route of fixture.routes)for(let i=1;i<route.points.length;i++) {
    const result=grid.findPath(route.points[i-1],route.points[i],radius);
    safePath(grid,result,radius);count++;if(result.escape)escapes++;if(!result.reached)projected++;
    maxExpanded=Math.max(maxExpanded,grid.lastSearch.expanded);
  }
  assert.equal(count,90);assert(escapes>0);assert(projected>0);assert.equal(grid._caches.size,3);
  const elapsed=performance.now()-began;
  assert(elapsed<5000,'90 map routes exceeded the conservative5s budget');
  console.log('  Map01: '+count+' routes, '+escapes+' outward escapes, '+projected+' projected goals, max '+maxExpanded+' expanded cells, '+Math.round(elapsed)+' ms');
});
console.log(passed+' navigation checks passed.');
