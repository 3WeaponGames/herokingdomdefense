'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Travel=require('../worlds/wave-travel');
const Pressure=require('../worlds/wave-pressure');
const Balance=require('../worlds/wave-balance');

function path(id,x,fraction){
 return {id,entry:'entry',spawnIds:[1],chokepoint:{edgeId:'road',fraction},
  nodes:[{id:'entry',x:100,y:0},{id:'goal',x,y:0,goal:true}],edges:[{id:'road',from:'entry',to:'goal',weight:1}]};
}

const units=[{id:1,speed:100},{id:2,speed:200}];
const row=(unitId,routeGraphId)=>({id:'row',unitId,spawnId:1,routeGraphId,count:4,startSeconds:0,intervalSeconds:1});
const wave=entry=>({SpawnTimeline:[entry],HealthCoefficient:1,AttackCoefficient:1});

test('route travel takes the weighted median and uses each selected profile’s speed and route override',()=>{
 const blocked={...path('blocked',3000,.9),weight:100,requiresAnyBuilding:[3]};
 const stage={spawns:[{id:1,x:0,y:0}],buildings:[{id:3,enabled:false}],
  graphs:[path('short',500,.5),path('middle',1100,.6),path('long',2100,.5),blocked]};
 const source=structuredClone(stage);
 const travel=Travel.create(stage,units);
 assert.equal(travel.estimate(row(1)).seconds,7);
 assert.equal(travel.estimate(row(2)).seconds,3.5);
 assert.equal(travel.estimate(row(1,'short')).seconds,3);
 assert.equal(travel.estimate(row(1,'blocked')).seconds,7);
 assert.equal(travel.estimate(row(99)),null);
 assert.deepEqual(stage,source);
 stage.buildings[0].enabled=true;
 assert.equal(Travel.create(stage,units).estimate(row(1)).seconds,27.1);
});

test('branch travel follows the path length and uses the goal when a branch skips the marker',()=>{
 const route=path('fork',200,.5);
 route.nodes.push({id:'fork',x:100,y:400},{id:'bypass',x:300,y:400,goal:true});
 route.edges.push({id:'up',from:'entry',to:'fork',weight:1},{id:'across',from:'fork',to:'bypass',weight:1});
 const stage={spawns:[{id:1,x:0,y:0}],graphs:[route]};
 const source=wave(row(1));
 const travel=Travel.create(stage,units);
 assert.deepEqual(travel.forWave(source,.5)(row(1)),{distance:425,marked:true,usesGoal:true,seconds:4.25});
 delete route.chokepoint;
 assert.equal(Travel.create(stage,units).forWave(source,.5),null);
});

test('balance uses the same contact time, one-second defeat interval and peak cap as the wave estimate',()=>{
 const stage={spawns:[{id:1,x:0,y:0}],graphs:[path('road',1100,.6)]};
 const source=wave(row(1)),before=structuredClone(source),interval=.5;
 const travel=Travel.create(stage,units).forWave(source,interval);
 const options={interval,peakCap:2,travel};
 const blocked=Balance.plan(source,{...options,lastSpawnLimit:8});
 assert.equal(blocked.reason,'deadline-too-short');
 assert.equal(blocked.minimumLastSpawn,9);
 const opening=Balance.plan({...source,Wave:1},{...options,lastSpawnLimit:14});
 assert.equal(opening.reason,'deadline-too-short');
 assert.equal(opening.minimumLastSpawn,15);
 const result=Balance.plan(source,{...options,lastSpawnLimit:16});
 assert.equal(result.ok,true,result.message);
 const summary=Pressure.build(result.afterWave,units,interval,undefined,travel);
 assert.equal(summary.travel.firstDefeat-summary.travel.firstArrival,1);
 assert.equal(result.before.peak,4);
 assert.equal(result.after.peak,summary.peaks.units.value);
 assert(summary.peaks.units.value<=2);
 assert(summary.duration<=16);
 assert.deepEqual(source,before);
});
