'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Pressure=require('../worlds/wave-pressure');

const spawn=(unitId,startSeconds,count=1,intervalSeconds=0)=>({unitId,spawnId:1,count,startSeconds,intervalSeconds});
const wave=(SpawnTimeline,overrides={})=>({SpawnTimeline,HealthCoefficient:1,AttackCoefficient:1,...overrides});
const units=[{id:1,health:8,damage:6},{id:2,health:20,damage:2},{id:3,health:4,damage:15}];

test('wave pressure separates scaled totals from the living snapshot and records independent peak times',()=>{
 const source=wave([spawn(1,0),spawn(2,1),spawn(3,2)],{HealthCoefficient:2,AttackCoefficient:.5});
 const before=JSON.stringify({source,units});
 const summary=Pressure.build(source,units,.5);
 assert.equal(summary.duration,2);
 assert.deepEqual(summary.totals,{units:3,health:64,damage:12});
 assert.deepEqual(summary.peaks,{units:{value:2,time:1},health:{value:56,time:1},damage:{value:9,time:2}});
 assert.deepEqual(summary.at(0),{units:1,health:16,damage:3});
 assert.deepEqual(summary.at(1.5),{units:2,health:56,damage:4});
 assert.deepEqual(summary.at(2),{units:2,health:48,damage:9});
 assert.deepEqual(summary.at(20),summary.at(2));
 assert.equal(JSON.stringify({source,units}),before);
});

test('coincident arrivals enter in authored row order even when floating point and card order differ',()=>{
 const source=wave([
  {...spawn(1,.1,3,.1),id:'first'},
  {...spawn(3,.3),id:'second'},
  {...spawn(2,8),id:'last'}
 ],{editorUnitOrder:['second','first','last']});
 const summary=Pressure.build(source,units,.5);
 assert.deepEqual(summary.at(.3),{units:4,health:28,damage:33});
 assert.deepEqual(summary.at(6),{units:1,health:4,damage:15});
 assert.deepEqual(summary.at(8),{units:1,health:20,damage:2});
});

test('periodic defeats skip empty ticks and occur before tied spawns',()=>{
 const source=wave([spawn(1,9),spawn(2,12),spawn(3,14)]);
 const summary=Pressure.build(source,units,1);
 assert.deepEqual(summary.at(8),{units:0,health:0,damage:0});
 assert.deepEqual(summary.at(9.5),{units:1,health:8,damage:6});
 assert.deepEqual(summary.at(10),{units:0,health:0,damage:0});
 assert.equal(summary.at(12).health,20);
 assert.equal(summary.at(14).health,4);
 assert.equal(Pressure.build(source,units,1,5).at(14).units,2);
});

test('legacy rows retain their original timing and empty rows contribute zero',()=>{
 const legacy={RefreshSoldierKind:['1#1,2;-1,1;2,1'],HealthCoefficient:1,AttackCoefficient:1};
 const summary=Pressure.build(legacy,units,.5);
 assert.equal(summary.duration,2);
 assert.deepEqual(summary.at(.4),{units:0,health:0,damage:0});
 assert.deepEqual(summary.at(1.5),{units:2,health:16,damage:12});
 assert.deepEqual(summary.at(2),{units:2,health:28,damage:8});
 const empty=Pressure.build(wave([spawn(40,300,0)]),[],.5);
 assert.equal(empty.duration,0);
 assert.deepEqual(empty.at(0),{units:0,health:0,damage:0});
 assert.deepEqual(empty.peaks.units,{value:0,time:0});
});

test('unknown and overflowing health do not lose counts or poison later survivor snapshots',()=>{
 const source=wave([spawn(1,0),spawn(1,0),spawn(2,4)]);
 const summary=Pressure.build(source,[{id:1,health:1e308,damage:42},{id:2,health:5}],.5);
 assert.equal(summary.totals.health,null);
 assert.equal(summary.totals.damage,null);
 assert.deepEqual(summary.at(0),{units:2,health:null,damage:84});
 assert.deepEqual(summary.at(2),{units:1,health:1e308,damage:42});
 assert.deepEqual(summary.at(4),{units:1,health:5,damage:null});
 assert.deepEqual(summary.peaks.health,{value:null,time:null});
 assert.deepEqual(summary.peaks.damage,{value:null,time:null});
});

test('dense and sparse single streams support large schedules without expanding each unit',()=>{
 const count=10_000_000;
 const dense=Pressure.build(wave([spawn(1,0,count,.25)]),units,.5);
 assert.equal(dense.projected,true);
 assert.equal(dense.duration,2_499_999.75);
 assert.deepEqual(dense.peaks.units,{value:8_750_001,time:dense.duration});
 assert.deepEqual(dense.at(2),{units:8,health:64,damage:48});
 assert.deepEqual(dense.at(dense.duration),{units:8_750_001,health:70_000_008,damage:52_500_006});
 const sparse=Pressure.build(wave([spawn(1,1,count,5)]),units,.5);
 assert.equal(sparse.projected,true);
 assert.deepEqual(sparse.peaks.units,{value:1,time:1});
 assert.equal(sparse.at(2).units,0);
 assert.equal(sparse.at(6).units,1);
});

test('pathologically large interleaved schedules retain totals and report an unavailable projection',()=>{
 const result=Pressure.build(wave([spawn(1,0,10_000_000,.25),spawn(2,.1,10_000_000,.25)]),units,.5);
 assert.equal(result.projected,false);
 assert.equal(result.duration,2_499_999.85);
 assert.deepEqual(result.totals,{units:20_000_000,health:280_000_000,damage:80_000_000});
 assert.deepEqual(result.at(0),{units:null,health:null,damage:null});
 assert.deepEqual(result.peaks.units,{value:null,time:null});
});

test('invalid timing is rejected without producing fake projections',()=>{
 for(const source of [wave([spawn(1,-1)]),wave([spawn(1,0,2)]),wave([spawn(1,0,1.5,.5)])]){
  assert.throws(()=>Pressure.build(source,units,.5),/timing or unit count/);
 }
 assert.throws(()=>Pressure.build(wave([]),units,.5,0),/Seconds per defeat/);
});
