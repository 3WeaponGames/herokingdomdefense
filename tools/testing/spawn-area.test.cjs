'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Area=require('../../assets/_script/SpawnArea'),Grid=require('../../assets/_script/NavigationGrid').NavigationGrid;
function rng(){let seed=17;return()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
test('spawn circles sample uniform disk area and keep point-spawn RNG untouched',()=>{
 const random=rng(),center={x:100,y:-30};let square=0,counts=[0,0,0,0];
 for(let i=0;i<10000;i++){const p=Area.sample(center,60,random),dx=p.x-center.x,dy=p.y-center.y;assert(dx*dx+dy*dy<=3600+1e-6);square+=(dx*dx+dy*dy)/3600;counts[(dx<0?1:0)+(dy<0?2:0)]++;}
 assert(Math.abs(square/10000-.5)<.02);assert(counts.every(c=>c>2300&&c<2700));assert.deepEqual(Area.sample(center,0,()=>{throw Error('legacy RNG consumed');}),center);
});
test('area spawning rejects terrain, respects unit clearance and fails boundedly for a blocked circle',()=>{
 const grid=new Grid([[{x:0,y:-200},{x:200,y:-200},{x:200,y:200},{x:0,y:200}]],{minX:-200,minY:-200,maxX:200,maxY:200},16),random=rng();
 for(let i=0;i<200;i++){const p=Area.sample({x:0,y:0},70,random,p=>grid.isWalkable(p,12));assert(p&&p.x<=-12);assert(Math.hypot(p.x,p.y)<=70);}
 let calls=0;assert.equal(Area.sample({x:0,y:0},10,random,()=>{calls++;return false;}),null);assert(calls<=321);
});
test('route lanes remain coherent through bends, narrow safely, preserve the goal and input data',()=>{
 const route=[{x:100,y:0},{x:200,y:0},{x:250,y:100},{x:300,y:200}],before=JSON.stringify(route),start={x:0,y:40};
 const lane=Area.spread(route,start,{x:0,y:0},60,rng());assert(lane[0].y>30&&lane[1].y>30);assert(lane[2].x<250&&lane[2].y>100);assert.deepEqual(lane.at(-1),route.at(-1));
 const narrow=Area.spread(route,start,{x:0,y:0},60,rng(),p=>p.y<=12,(a,b)=>Math.abs(b.y-a.y)<=12);assert(narrow[0].y>0&&narrow[0].y<=12);assert(narrow[1].y>0&&narrow[1].y<=12);assert.equal(JSON.stringify(route),before);
 assert.deepEqual(Area.spread(route,start,{x:0,y:0},0,()=>{throw Error('zero spread changes RNG');}),route);
});
test('zero-offset route spread skips all repeated clearance work and preserves projected legacy waypoints',()=>{
 const route=[{x:10,y:0},{x:30,y:0}];let checks=0;
 const result=Area.spread(route,{x:0,y:0},{x:0,y:0},20,()=>.5,()=>{checks++;return false;},()=>{checks++;return false;});
 assert.deepEqual(result,route);assert.notEqual(result,route);assert.equal(checks,0);
});
test('malformed area coordinates/radii cannot produce nonfinite positions or enter rejection loops',()=>{
 for(const radius of [NaN,Infinity,-Infinity,'100'])assert.equal(Area.sample({x:0,y:0},radius,()=>{throw Error('Invalid radius consumed random numbers');}),null);
 for(const center of [null,{x:NaN,y:0},{x:0,y:Infinity}])assert.equal(Area.sample(center,10),null);
});
test('invalid spread widths and anchors preserve finite centerline waypoints without sampling',()=>{
 const points=[{x:10,y:0},{x:20,y:0}],random=()=>{throw Error('Invalid spread consumed RNG');};
 for(const width of [NaN,Infinity,-Infinity,'20',-1])assert.deepEqual(Area.spread(points,{x:0,y:0},{x:0,y:0},width,random),points);
 for(const anchor of [null,{x:NaN,y:0},{x:0,y:Infinity}])assert.deepEqual(Area.spread(points,anchor,{x:0,y:0},20,random),points);
});
