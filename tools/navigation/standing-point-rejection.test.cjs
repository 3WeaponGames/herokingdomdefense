'use strict';
// The real geometry adapter and NavigationGrid decide placement. In particular,
// an impossible anchor must not repeat the unbudgeted crowd/ring scan each frame.
const assert=require('node:assert/strict'),{test}=require('node:test');
const {environment,PhysicsBoxCollider,Node}=require('./runtime-harness.cjs');

function fixture(){
 const e=environment(),unit=e.unit(-90,0);unit.navigationTeam='friendly';
 unit.node.addComponent(PhysicsBoxCollider).size={width:22,height:22};
 const nav=e.nav.get(e.game);nav.refresh();
 return {...e,unitFactory:e.unit,unit,navigation:nav};
}
function counters(e){
 const counts={radii:0,actors:0,walkable:0,segments:0},nav=e.navigation;
 const radius=nav.radius;nav.radius=function(...args){counts.radii++;return radius.apply(this,args);};
 for(const name of ['getSoldierList','getEnemyList']){const original=e.game.gameData[name];e.game.gameData[name]=function(){counts.actors++;return original.call(this);};}
 for(const [name,key]of [['isWalkable','walkable'],['segmentClear','segments']]){const original=nav.grid[name];nav.grid[name]=function(...args){counts[key]++;return original.apply(this,args);};}
 return counts;
}

test('blocked point, polygon boundary and out-of-bounds anchors reject before crowd or body scans',()=>{
 for(const anchor of [{x:0,y:0},{x:10,y:0},{x:201,y:0},{x:-201,y:0},{x:0,y:201}]){
  const e=fixture();e.box(0,0,20,80);e.nav.beginFrame(e.game);e.navigation.refresh();
  assert.equal(e.navigation.grid.isWalkable(anchor,0),false);
  // Every segment starts in the same blocked point, regardless of where the
  // standing candidate lies. This is the existing placement rule, not a delay.
  for(const end of [{x:-150,y:0},{x:150,y:0},{x:0,y:150},anchor])assert.equal(e.navigation.grid.segmentClear(anchor,end,0),false);
  const cost=counters(e);
  assert.equal(e.nav.findStandingPoint(e.unit,e.game,anchor,{x:-100,y:100}),null);
  assert.equal(cost.radii,0,'an impossible anchor traversed body colliders');
  assert.equal(cost.actors,0,'an impossible anchor scanned the complete live roster');
  assert.equal(cost.walkable,1,'the 216 candidate ring was scanned despite the blocked origin');
  assert.equal(cost.segments,0);
 }
});

test('four nearby soldiers retrying a blocked post across many frames keep placement work constant',()=>{
 const e=fixture();e.box(0,0,20,80);e.nav.beginFrame(e.game);e.navigation.refresh();
 const units=[e.unitFactory(-25,0),e.unitFactory(-25,20),e.unitFactory(25,0),e.unitFactory(25,20)];
 e.game.gameData.soldiers=units;
 const cost=counters(e);
 for(let frame=0;frame<120;frame++){
  e.nav.beginFrame(e.game);
  for(const unit of units)assert.equal(e.nav.findStandingPoint(unit,e.game,{x:0,y:0},{x:0,y:0}),null);
 }
 assert.equal(cost.walkable,480);assert.equal(cost.radii,0);assert.equal(cost.actors,0);assert.equal(cost.segments,0);
});

test('a legal preferred point remains exact, and an unoccupied legal anchor remains the fallback',()=>{
 const e=fixture(),anchor={x:0,y:0},preferred={x:50,y:0};
 assert.deepEqual({...e.nav.findStandingPoint(e.unit,e.game,anchor,preferred)},preferred);
 const occupied=e.unitFactory(50,0);e.game.gameData.soldiers.push(occupied);
 assert.deepEqual({...e.nav.findStandingPoint(e.unit,e.game,anchor,preferred)},anchor);
});

test('anchor rejection uses zero radius, preserving body-clear standing choices beside terrain',()=>{
 const e=fixture(),anchor={x:11,y:0};e.box(0,0,20,80);e.nav.beginFrame(e.game);e.navigation.refresh();
 const radius=e.navigation.radius(e.unit),grid=e.navigation.grid;
 assert(grid.isWalkable(anchor,0));assert.equal(grid.isWalkable(anchor,radius),false);
 const result=e.nav.findStandingPoint(e.unit,e.game,anchor,anchor);
 assert(result,'a free anchor beside a wall must still search for body clearance');
 const angle=Math.atan2(e.unit.node.y-anchor.y,e.unit.node.x-anchor.x)+2*Math.PI/3;
 assert(Math.abs(result.x-(anchor.x+Math.cos(angle)*(radius*2+6)))<1e-8);
 assert(Math.abs(result.y-(anchor.y+Math.sin(angle)*(radius*2+6)))<1e-8);
 assert(grid.isWalkable(result,radius));assert(grid.segmentClear(anchor,result,0));
});

test('an intact gate stays forbidden as a standing origin without blocking its friendly passage',()=>{
 const e=fixture(),node=new Node('gate',e.game.ndMain),shape=node.addComponent(PhysicsBoxCollider),anchor={x:0,y:0};
 shape.size={width:20,height:80};let intact=true;
 const points=[{x:-10,y:-40},{x:10,y:-40},{x:10,y:40},{x:-10,y:40}];
 e.game.gameData.buildings.push({node,getNavigationGateShapes:()=>intact?[{collider:shape,points}]:[]});
 e.nav.beginFrame(e.game);e.navigation.refresh();
 assert.equal(e.navigation.grid.isWalkable(anchor,0),false);
 const friendly=e.navigation.gridFor(e.unit);
 assert(friendly.isWalkable(anchor,20),'friendly path planning still admits the open passage');
 assert(friendly.findPath({x:-90,y:0},{x:90,y:0},20).reached);
 assert.equal(e.nav.findStandingPoint(e.unit,e.game,anchor,anchor),null,'the full gate rule must still govern standing placement');
 intact=false;shape.enabled=false;e.nav.beginFrame(e.game);
 assert.deepEqual({...e.nav.findStandingPoint(e.unit,e.game,anchor,anchor)},anchor,'a broken gate must immediately release the origin');
});

test('moving or removing geometry changes the answer immediately without a placement cooldown',()=>{
 const e=fixture(),anchor={x:0,y:0},wall=e.box(0,0,20,80);
 e.nav.beginFrame(e.game);assert.equal(e.nav.findStandingPoint(e.unit,e.game,anchor,anchor),null);
 wall.node.setPosition(100,0);e.nav.beginFrame(e.game);
 assert.deepEqual({...e.nav.findStandingPoint(e.unit,e.game,anchor,anchor)},anchor);
 wall.node.setPosition(0,0);e.nav.beginFrame(e.game);
 assert.equal(e.nav.findStandingPoint(e.unit,e.game,anchor,anchor),null);
 wall.enabled=false;e.nav.beginFrame(e.game);
 assert.deepEqual({...e.nav.findStandingPoint(e.unit,e.game,anchor,anchor)},anchor);
});
