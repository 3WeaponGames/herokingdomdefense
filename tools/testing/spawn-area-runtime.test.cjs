'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),Grid=require('../../assets/_script/NavigationGrid').NavigationGrid;
function fixture(radius=55){
 let seed=9,randoms=0,resets=0,navCalls=0;const math=Object.create(Math);math.random=()=>{randoms++;seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 const grid=new Grid([],{minX:-500,minY:-500,maxX:500,maxY:500},16),nav={grid,refresh(){},radius(unit,sleeping){assert(unit.node);return 12;}};
 const Navigation={get(){navCalls++;return nav;},positionOf(n){return n.position;},reset(){resets++;},prepareTerrainExit(){}},spec={id:1,radius,FutureField:{keep:1}},paths={spawnSpec:()=>spec},center={position:{x:-150,y:0}},game={ndPath:{getChildByName(name){return name==='Authored routes'?{getComponent:()=>paths}:center;}},ndMain:{convertToWorldSpaceAR:p=>p}};
 const points=[{position:{x:-50,y:0}},{position:{x:80,y:0}},{position:{x:200,y:40}}],unit={node:{position:{x:-150,y:0},setPosition(x,y){this.position={x,y};}},rigidBody:{active:true},bornInfo:{pathList:points,nodeIndex:0}};
 const context={exports:{},require(name){assert.equal(name,'KinghtFallNavigation');return Navigation;},Math:math,cc:{v2:(x,y)=>({x,y})}};vm.runInNewContext(fs.readFileSync(require.resolve('../../assets/_script/SpawnArea'),'utf8'),context);return {area:context.exports,game,unit,grid,spec,points,counts:()=>({randoms,resets,navCalls})};
}
test('runtime uses one safe area sample and detached per-enemy route points while preserving source waypoints',()=>{
 const f=fixture(),before=JSON.stringify(f.points),prepared=f.area.prepare(f.unit,f.game,1,true),n=f.counts().randoms;assert(prepared);assert(Math.hypot(prepared.start.x+150,prepared.start.y)<=55);assert(f.grid.isWalkable(prepared.start,12));
 assert(f.area.apply(f.unit,f.game,1,prepared));assert.equal(f.counts().randoms,n,'placement is not sampled again after initialization');assert.equal(f.counts().resets,1);assert.equal(JSON.stringify(f.points),before);
 assert(f.unit.bornInfo.pathList[0]._authoredSpread);assert.notEqual(f.unit.bornInfo.pathList[0],f.points[0]);assert.deepEqual(JSON.parse(JSON.stringify(f.unit.bornInfo.pathList.at(-1).convertToWorldSpaceAR({x:0,y:0}))),f.points.at(-1).position);
});
test('point spawns preserve RNG and route node identities; blocked terrain does not reject an area spawn',()=>{
 const f=fixture(0);assert.equal(f.area.prepare(f.unit,f.game,1,true),undefined);assert(f.area.apply(f.unit,f.game,1));assert.equal(f.unit.bornInfo.pathList,f.points);assert.deepEqual(f.counts(),{randoms:0,resets:0,navCalls:0});
 f.spec.radius=40;f.grid.isWalkable=()=>false;const prepared=f.area.prepare(f.unit,f.game,1,true);assert(prepared);assert(Math.hypot(prepared.start.x+150,prepared.start.y)<=40);assert(f.area.apply(f.unit,f.game,1,prepared));assert.equal(f.unit.node.position.x,prepared.start.x);assert.equal(f.unit.node.position.y,prepared.start.y);assert.equal(f.counts().resets,1);
});
test('custom zero-width routes still randomize an area spawn, and flying units retain terrain crossing',()=>{
 const f=fixture();f.unit.bornInfo.pathList.routeSpread=0;const prepared=f.area.prepare(f.unit,f.game,1,true);assert(f.area.apply(f.unit,f.game,1,prepared));assert.equal(f.unit.bornInfo.pathList,f.points);
 const flying=fixture();flying.grid.isWalkable=()=>{throw Error('Flying unit should retain terrain crossing');};flying.grid.segmentClear=()=>{throw Error('Flying lane should retain terrain crossing');};flying.unit.rigidBody.active=false;const point=flying.area.prepare(flying.unit,flying.game,1,false);assert(point);assert(flying.area.apply(flying.unit,flying.game,1,point));
 assert.equal(flying.counts().navCalls,0,'Flying-only waves must not build or refresh an unused ground planner');
});

test('direct area application stays in body bounds and wholly off-map circles retain their wave actor',()=>{
 const f=fixture(55),marker=f.game.ndPath.getChildByName('ndEnemy1');marker.position={x:-900,y:-900};f.unit.bornInfo.pathList.routeSpread=0;
 assert(f.area.apply(f.unit,f.game,1));
 assert.deepEqual(f.unit.node.position,{x:-488,y:-488});
 assert(f.grid._inBounds(f.unit.node.position,12));
 assert.equal(f.counts().resets,1);
});

test('noncolliding off-map circles spawn inside the map and missing radii retain the point-spawn RNG sequence',()=>{
 const flying=fixture(55),marker=flying.game.ndPath.getChildByName('ndEnemy1');marker.position={x:-900,y:-900};flying.unit.rigidBody.active=false;flying.unit.bornInfo.pathList.routeSpread=0;
 flying.game.mapSize={width:1000,height:1000};
 const prepared=flying.area.prepare(flying.unit,flying.game,1,false);
 assert(prepared&&prepared.start.x===-500&&prepared.start.y===-500);
 assert(flying.area.apply(flying.unit,flying.game,1,prepared));
 assert.equal(flying.unit.node.position.x,prepared.start.x);assert.equal(flying.unit.node.position.y,prepared.start.y);
 assert.deepEqual(flying.counts(),{randoms:128,resets:1,navCalls:0});
 const point=fixture();delete point.spec.radius;
 assert.equal(point.area.prepare(point.unit,point.game,1,true),undefined);
 assert(point.area.apply(point.unit,point.game,1));
 assert.equal(point.unit.bornInfo.pathList,point.points);
 assert.deepEqual(point.counts(),{randoms:0,resets:0,navCalls:0});
});

test('ground and flying legacy point spawns outside each map edge stay inside without randomizing',()=>{
 for(const collides of [true,false])for(const center of [{x:-900,y:0},{x:900,y:0},{x:0,y:-900},{x:0,y:900}])for(const prepared of [true,false]){
  const f=fixture(0);f.game.mapSize={width:1000,height:1000};f.game.ndPath.getChildByName('ndEnemy1').position=center;f.unit.rigidBody.active=collides;
  const sample=prepared?f.area.prepare(f.unit,f.game,1,collides):undefined;assert(f.area.apply(f.unit,f.game,1,sample));
  const p=f.unit.node.position,edge=collides?488:500;assert(Math.abs(p.x)<=edge&&Math.abs(p.y)<=edge);assert.equal(f.counts().randoms,0);if(!collides)assert.equal(f.counts().navCalls,0);
 }
 const inside=fixture(0);inside.game.mapSize={width:1000,height:1000};assert.equal(inside.area.prepare(inside.unit,inside.game,1,true),undefined);assert(inside.area.apply(inside.unit,inside.game,1));assert.deepEqual(inside.counts(),{randoms:0,resets:0,navCalls:0});
});
test('native spawn marker radii work without authored paths and explicit authored zero still overrides them',()=>{
 const f=fixture(0),lookup=f.game.ndPath.getChildByName.bind(f.game.ndPath),marker=lookup('ndEnemy1'),native={radius:150};marker.getComponent=name=>{assert.equal(name,'SpawnPointArea');return native;};
 assert.equal(f.area.radius(f.game,1),0,'an explicit point spawn overrides the native radius');
 delete f.spec.radius;assert.equal(f.area.radius(f.game,1),150);
 f.game.ndPath.getChildByName=name=>name==='Authored routes'?null:lookup(name);
 const prepared=f.area.prepare(f.unit,f.game,1,true);assert(prepared);assert(Math.hypot(prepared.start.x+150,prepared.start.y)<=150);assert(f.area.apply(f.unit,f.game,1,prepared));assert.equal(f.unit.node.position.x,prepared.start.x);
});
test('an unusable area returns an uninitialized node to its pool without registering an enemy or recording a kill',()=>{
 const {setup,Node}=require('./backend-gameplay-harness.cjs'),h=setup({SpawnArea:{prepare:()=>null,apply(){throw Error('Blocked spawn must stop before initialization');}}});
 let initialized=0,recycled=0;h.e.cc.warn=()=>{};h.e.stubs.PoolMgr.PoolMgr.getInstance().freeNode=()=>recycled++;
 const prefab=()=>{const node=new Node();node.getComponent=()=>({node,initData(){initialized++;}});return node;};
 const before=JSON.stringify(h.d.addTime);h.g.addEnemy(90001,1);assert.equal(h.d.pendingEnemySpawns,1);h.pending[0](prefab);
 assert.equal(initialized,0);assert.equal(recycled,1);assert.equal(h.d.enemyList.length,0);assert.equal(h.d.pendingEnemySpawns,0);assert.equal(JSON.stringify(h.d.addTime),before);
});
