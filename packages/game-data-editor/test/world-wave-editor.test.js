'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),W=require('../worlds/wave-editor');
const clone=value=>JSON.parse(JSON.stringify(value));
function stage(){return{level:99,spawns:[{id:1,enabled:true},{id:2,enabled:true},{id:3,enabled:false}],graphs:[{id:'one',spawnIds:[1]},{id:'shared',spawnIds:[1,2]},{id:'two',spawnIds:[2]}],config:{Level:7,FutureStage:{keep:true},WaveCfg:[{id:7,Wave:1,HealthCoefficient:1.2,AttackCoefficient:.8,StartSliver:4,CommerceSliver:3,WaveReward:[[2001,10]],future:{keep:[1]},RefreshSoldierKind:['2#90001,99','1#90002,2;-1,1;90003,1','2#-1,1;90004,2']}]}};}
function timed(){const s=stage();s.config.WaveCfg[0].SpawnTimeline=[{id:'first',spawnId:1,unitId:90002,count:2,startSeconds:.5,intervalSeconds:.5,routeGraphId:'one',future:{keep:[1]}},{id:'shared',spawnId:1,unitId:90003,count:1,startSeconds:3,intervalSeconds:0,routeGraphId:'shared'},{id:'other-lane',spawnId:2,unitId:90004,count:3,startSeconds:1,intervalSeconds:.5}];return s;}

test('wave display reads all lanes and summaries without changing or aliasing timed or legacy sources',()=>{
 for(const s of [stage(),timed()]){const wave=s.config.WaveCfg[0],before=JSON.stringify(s),rows=W.entries(wave,.5),stats=W.summary(wave,.5);assert.equal(JSON.stringify(s),before);assert(rows.some(entry=>entry.spawnId===1));assert(rows.some(entry=>entry.spawnId===2));assert.deepEqual(stats.spawnIds,[1,2]);assert.equal(stats.groups,rows.length);assert.equal(stats.units,rows.reduce((sum,entry)=>sum+entry.count,0));assert.equal(stats.duration,Math.max(...rows.map(entry=>entry.startSeconds+(entry.count-1)*entry.intervalSeconds)));rows[0].count=1000;if(rows[0].future)rows[0].future.keep.push(5);assert.equal(JSON.stringify(s),before);}
 const wave=stage().config.WaveCfg[0];assert.deepEqual(W.summary(wave,.5),{units:5,groups:3,spawnIds:[1,2],duration:2});assert(!wave.SpawnTimeline);
});

test('first explicit legacy group edit converts only that wave and preserves strings, IDs and unknown metadata',()=>{
 const s=stage(),source=s.config.WaveCfg[0];s.config.WaveCfg.push({...clone(source),Wave:2});const before=clone(s),id=W.entries(source,.5)[0].id;
 W.editGroup(s,0,id,{count:4},.5);assert(Array.isArray(source.SpawnTimeline));assert.equal(source.SpawnTimeline.find(entry=>entry.id===id).count,4);assert.deepEqual(source.RefreshSoldierKind,before.config.WaveCfg[0].RefreshSoldierKind);assert.deepEqual(s.config.WaveCfg[1],before.config.WaveCfg[1]);assert.deepEqual(source.future,before.config.WaveCfg[0].future);assert.deepEqual(s.config.FutureStage,before.config.FutureStage);
});

test('group creation supplies defaults and stable unique IDs without aliases; removals affect only the selected group',()=>{
 const s=timed(),wave=s.config.WaveCfg[0],input={unitId:90005,spawnId:2,count:2,startSeconds:4,intervalSeconds:.75,future:{keep:[2]}};
 const id=W.addGroup(s,0,input,.5),again=W.addGroup(s,0,{unitId:90006,spawnId:1},.5);assert.notEqual(id,again);assert.equal(new Set(wave.SpawnTimeline.map(entry=>entry.id)).size,wave.SpawnTimeline.length);
 input.future.keep.push(3);assert.deepEqual(wave.SpawnTimeline.find(entry=>entry.id===id).future,{keep:[2]});assert.deepEqual(wave.SpawnTimeline.find(entry=>entry.id===again),{id:again,unitId:90006,spawnId:1,count:1,startSeconds:0,intervalSeconds:.5});
 const keep=clone(wave.SpawnTimeline.filter(entry=>entry.id!==id));W.removeGroup(s,0,id,.5);assert.deepEqual(wave.SpawnTimeline,keep);assert.equal(W.entries(wave,.5).find(entry=>entry.unitId===90006).id,again);
});

test('edits preserve route and unknown fields until a spawn change makes that route unrelated',()=>{
 const s=timed(),wave=s.config.WaveCfg[0],patch={count:4,future:{keep:[4]}};W.editGroup(s,0,'first',patch,.5);patch.future.keep.push(8);assert.equal(wave.SpawnTimeline[0].routeGraphId,'one');assert.deepEqual(wave.SpawnTimeline[0].future,{keep:[4]});
 W.editGroup(s,0,'first',{spawnId:1},.5);assert.equal(wave.SpawnTimeline[0].routeGraphId,'one');W.editGroup(s,0,'first',{spawnId:2},.5);assert.equal(wave.SpawnTimeline[0].routeGraphId,null);W.editGroup(s,0,'shared',{spawnId:2},.5);assert.equal(wave.SpawnTimeline[1].routeGraphId,'shared');
 W.editGroup(s,0,'first',{spawnId:2,routeGraphId:'two'},.5);assert.equal(wave.SpawnTimeline[0].routeGraphId,'two');assert.equal(wave.SpawnTimeline[0].id,'first');
});

test('invalid groups fail atomically without materializing a legacy wave or changing any draft bytes',()=>{
 for(const patch of [{unitId:0},{unitId:NaN},{spawnId:99},{spawnId:3},{count:0},{count:1.5},{startSeconds:-1},{startSeconds:Infinity},{intervalSeconds:0},{intervalSeconds:NaN},{routeGraphId:'missing'},{routeGraphId:'two',spawnId:1}]){const s=stage(),before=JSON.stringify(s);assert.throws(()=>W.addGroup(s,0,{unitId:90001,spawnId:1,count:2,...patch},.5));assert.equal(JSON.stringify(s),before,JSON.stringify(patch));}
 for(const change of [s=>W.editGroup(s,0,'first',{count:0},.5),s=>W.editGroup(s,0,'first',{id:'different'},.5),s=>W.editGroup(s,0,'first',{spawnId:99},.5),s=>W.editGroup(s,0,'first',{routeGraphId:'two'},.5),s=>W.removeGroup(s,0,'missing',.5),s=>W.addGroup(s,99,{unitId:90001,spawnId:1},.5)]){const s=timed(),before=JSON.stringify(s);assert.throws(()=>change(s));assert.equal(JSON.stringify(s),before);}
 const s=stage(),before=JSON.stringify(s);assert.throws(()=>W.addGroup(s,0,{unitId:90001,spawnId:1},0));assert.equal(JSON.stringify(s),before);
});

test('display IDs are unique and stable even for incomplete imported IDs and only persist after explicit editing',()=>{
 const s=timed(),wave=s.config.WaveCfg[0];wave.SpawnTimeline.push({...clone(wave.SpawnTimeline[0]),id:'first'}, {...clone(wave.SpawnTimeline[0]),id:undefined});const before=JSON.stringify(s),one=W.entries(wave,.5),two=W.entries(wave,.5);assert.deepEqual(one,two);assert.equal(new Set(one.map(entry=>entry.id)).size,one.length);assert.equal(JSON.stringify(s),before);W.editGroup(s,0,one[3].id,{count:5},.5);assert.equal(wave.SpawnTimeline[0].count,2);assert.equal(wave.SpawnTimeline[3].count,5);assert.equal(new Set(wave.SpawnTimeline.map(entry=>entry.id)).size,wave.SpawnTimeline.length);
});

test('wave add/duplicate/remove preserve stage IDs, settings, routes and unknown fields with no aliases',()=>{
 const s=timed(),original=clone(s.config.WaveCfg[0]),blank=W.addWave(s,0);assert.equal(blank,1);assert.deepEqual(s.config.WaveCfg[blank],{...original,id:7,Wave:2,SpawnTimeline:[],RefreshSoldierKind:[]});s.config.WaveCfg[blank].future.keep.push(2);s.config.WaveCfg[blank].WaveReward[0][1]=99;assert.deepEqual(s.config.WaveCfg[0],original);
 const duplicate=W.duplicateWave(s,0);assert.equal(duplicate,2);assert.deepEqual(s.config.WaveCfg[duplicate],{...original,id:7,Wave:3});s.config.WaveCfg[duplicate].SpawnTimeline[0].future.keep.push(3);assert.deepEqual(s.config.WaveCfg[0],original);
 assert.equal(W.removeWave(s,1),1);assert.deepEqual(s.config.WaveCfg.map(wave=>[wave.Wave,wave.id]),[[1,7],[2,7]]);assert.equal(W.removeWave(s,1),0);const before=JSON.stringify(s);assert.throws(()=>W.removeWave(s,0),/at least one/);assert.equal(JSON.stringify(s),before);
 // An ID equal to an old wave number is still the stage ID, never renumbered.
 s.config.WaveCfg=Array.from({length:8},(_,index)=>({...clone(original),id:7,Wave:index+1}));W.removeWave(s,0);assert(s.config.WaveCfg.every((wave,index)=>wave.id===7&&wave.Wave===index+1));
});
