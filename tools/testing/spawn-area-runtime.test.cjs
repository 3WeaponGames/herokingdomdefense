'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),Grid=require('../../assets/_script/NavigationGrid').NavigationGrid;
function fixture(radius=55){
 let seed=9,randoms=0,resets=0,navCalls=0;const math=Object.create(Math);math.random=()=>{randoms++;seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 const grid=new Grid([],{minX:-500,minY:-500,maxX:500,maxY:500},16),nav={grid,refresh(){},radius(unit,sleeping){assert(unit.node);return 12;}};
 const Navigation={get(){navCalls++;return nav;},positionOf(n){return n.position;},reset(){resets++;}},spec={id:1,radius,FutureField:{keep:1}},paths={spawnSpec:()=>spec},center={position:{x:-150,y:0}},game={ndPath:{getChildByName(name){return name==='Authored routes'?{getComponent:()=>paths}:center;}},ndMain:{convertToWorldSpaceAR:p=>p}};
 const points=[{position:{x:-50,y:0}},{position:{x:80,y:0}},{position:{x:200,y:40}}],unit={node:{position:{x:-150,y:0},setPosition(x,y){this.position={x,y};}},rigidBody:{active:true},bornInfo:{pathList:points,nodeIndex:0}};
 const context={exports:{},require(name){assert.equal(name,'KinghtFallNavigation');return Navigation;},Math:math,cc:{v2:(x,y)=>({x,y})}};vm.runInNewContext(fs.readFileSync(require.resolve('../../assets/_script/SpawnArea'),'utf8'),context);return {area:context.exports,game,unit,grid,spec,points,counts:()=>({randoms,resets,navCalls})};
}
test('runtime uses one safe area sample and detached per-enemy route points while preserving source waypoints',()=>{
 const f=fixture(),before=JSON.stringify(f.points),prepared=f.area.prepare(f.unit,f.game,1,true),n=f.counts().randoms;assert(prepared);assert(Math.hypot(prepared.start.x+150,prepared.start.y)<=55);assert(f.grid.isWalkable(prepared.start,12));
 assert(f.area.apply(f.unit,f.game,1,prepared));assert.equal(f.counts().randoms,n,'placement is not sampled again after initialization');assert.equal(f.counts().resets,1);assert.equal(JSON.stringify(f.points),before);
 assert(f.unit.bornInfo.pathList[0]._authoredSpread);assert.notEqual(f.unit.bornInfo.pathList[0],f.points[0]);assert.deepEqual(JSON.parse(JSON.stringify(f.unit.bornInfo.pathList.at(-1).convertToWorldSpaceAR({x:0,y:0}))),f.points.at(-1).position);
});
test('point spawns preserve RNG and route node identities; a blocked circle is rejected before unit initialization',()=>{
 const f=fixture(0);assert.equal(f.area.prepare(f.unit,f.game,1,true),undefined);assert(f.area.apply(f.unit,f.game,1));assert.equal(f.unit.bornInfo.pathList,f.points);assert.deepEqual(f.counts(),{randoms:0,resets:0,navCalls:0});
 f.spec.radius=40;f.grid.isWalkable=()=>false;assert.equal(f.area.prepare(f.unit,f.game,1,true),null);assert.deepEqual(f.unit.node.position,{x:-150,y:0});assert.equal(f.unit.bornInfo.pathList,f.points);
});
test('custom zero-width routes still randomize an area spawn, and flying units retain terrain crossing',()=>{
 const f=fixture();f.unit.bornInfo.pathList.routeSpread=0;const prepared=f.area.prepare(f.unit,f.game,1,true);assert(f.area.apply(f.unit,f.game,1,prepared));assert.equal(f.unit.bornInfo.pathList,f.points);
 const flying=fixture();flying.grid.isWalkable=()=>{throw Error('Flying unit should retain terrain crossing');};flying.grid.segmentClear=()=>{throw Error('Flying lane should retain terrain crossing');};flying.unit.rigidBody.active=false;const point=flying.area.prepare(flying.unit,flying.game,1,false);assert(point);assert(flying.area.apply(flying.unit,flying.game,1,point));
 assert.equal(flying.counts().navCalls,0,'Flying-only waves must not build or refresh an unused ground planner');
});
test('an unusable area returns an uninitialized node to its pool without registering an enemy or recording a kill',()=>{
 const {setup,Node}=require('./backend-gameplay-harness.cjs'),h=setup({SpawnArea:{prepare:()=>null,apply(){throw Error('Blocked spawn must stop before initialization');}}});
 let initialized=0,recycled=0;h.e.cc.warn=()=>{};h.e.stubs.PoolMgr.PoolMgr.getInstance().freeNode=()=>recycled++;
 const prefab=()=>{const node=new Node();node.getComponent=()=>({node,initData(){initialized++;}});return node;};
 const before=JSON.stringify(h.d.addTime);h.g.addEnemy(90001,1);assert.equal(h.d.pendingEnemySpawns,1);h.pending[0](prefab);
 assert.equal(initialized,0);assert.equal(recycled,1);assert.equal(h.d.enemyList.length,0);assert.equal(h.d.pendingEnemySpawns,0);assert.equal(JSON.stringify(h.d.addTime),before);
});
