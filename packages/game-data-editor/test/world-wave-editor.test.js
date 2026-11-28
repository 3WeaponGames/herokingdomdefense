'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),W=require('../worlds/wave-editor');
const clone=value=>JSON.parse(JSON.stringify(value));
function stage(){return{level:99,spawns:[{id:1,enabled:true},{id:2,enabled:true},{id:3,enabled:false}],graphs:[{id:'one',spawnIds:[1]},{id:'shared',spawnIds:[1,2]},{id:'two',spawnIds:[2]}],config:{Level:7,FutureStage:{keep:true},WaveCfg:[{id:7,Wave:1,HealthCoefficient:1.2,AttackCoefficient:.8,StartSliver:4,CommerceSliver:3,WaveReward:[[2001,10]],future:{keep:[1]},RefreshSoldierKind:['2#90001,99','1#90002,2;-1,1;90003,1','2#-1,1;90004,2']}]}};}
function timed(){const s=stage();s.config.WaveCfg[0].SpawnTimeline=[{id:'first',spawnId:1,unitId:90002,count:2,startSeconds:.5,intervalSeconds:.5,routeGraphId:'one',future:{keep:[1]}},{id:'shared',spawnId:1,unitId:90003,count:1,startSeconds:3,intervalSeconds:0,routeGraphId:'shared'},{id:'other-lane',spawnId:2,unitId:90004,count:3,startSeconds:1,intervalSeconds:.5}];return s;}

test('draft timing batches keep each change undoable with one recovery update',()=>{
 const {Service}=require('../worlds/service'),original=timed(),key='stage:A-7';
 const doc={key,data:original},source=original.config.WaveCfg[0],draft=clone(original);
 let recoveryWrites=0;
 const service=Object.assign(Object.create(Service.prototype),{
  version:1,undo:[],redo:[],doc:()=>doc,persist:()=>recoveryWrites++,snapshot:()=>clone(doc.data)
 });
 W.editGroup(draft,0,'first',{startSeconds:1},.5);
 const first=clone(draft.config.WaveCfg[0]);
 W.editGroup(draft,0,'first',{intervalSeconds:2.5},.5);
 const wave=draft.config.WaveCfg[0],change={key,version:1,waveIndex:0,intermediateWaves:[first],wave};
 assert.throws(()=>service.changeWave({...change,wave:{...wave,Wave:2}}),/wave changed/);
 assert.equal(doc.data,original);assert.equal(recoveryWrites,0);assert.equal(service.version,1);
 service.changeWave(change);
 assert.deepEqual(doc.data,draft);assert.equal(recoveryWrites,1);assert.equal(service.version,3);
 assert.equal(service.undo.length,2);
 assert.throws(()=>service.changeWave(change),/Another panel changed/);
 const undo=()=>service.history({key,version:service.version},false).config.WaveCfg[0];
 assert.deepEqual(undo(),first);assert.deepEqual(undo(),source);
 assert.deepEqual(service.history({key,version:service.version},true).config.WaveCfg[0],first);
 assert.deepEqual(service.history({key,version:service.version},true).config.WaveCfg[0],wave);
});

test('wave display reads all lanes and summaries without changing or aliasing timed or legacy sources',()=>{
 for(const s of [stage(),timed()]){const wave=s.config.WaveCfg[0],before=JSON.stringify(s),rows=W.entries(wave,.5),stats=W.summary(wave,.5);assert.equal(JSON.stringify(s),before);assert(rows.some(entry=>entry.spawnId===1));assert(rows.some(entry=>entry.spawnId===2));assert.deepEqual(stats.spawnIds,[1,2]);assert.equal(stats.groups,rows.length);assert.equal(stats.units,rows.reduce((sum,entry)=>sum+entry.count,0));assert.equal(stats.duration,Math.max(...rows.map(entry=>entry.startSeconds+(entry.count-1)*entry.intervalSeconds)));rows[0].count=1000;if(rows[0].future)rows[0].future.keep.push(5);assert.equal(JSON.stringify(s),before);}
 const wave=stage().config.WaveCfg[0];assert.deepEqual(W.summary(wave,.5),{units:5,groups:3,spawnIds:[1,2],duration:2});assert(!wave.SpawnTimeline);
});

test('first explicit legacy group edit converts only that wave and preserves strings, IDs and unknown metadata',()=>{
 const s=stage(),source=s.config.WaveCfg[0];s.config.WaveCfg.push({...clone(source),Wave:2});const before=clone(s),id=W.entries(source,.5)[0].id;
 W.editGroup(s,0,id,{count:4},.5);assert(Array.isArray(source.SpawnTimeline));assert.equal(source.SpawnTimeline.find(entry=>entry.id===id).count,4);assert.deepEqual(source.RefreshSoldierKind,before.config.WaveCfg[0].RefreshSoldierKind);assert.deepEqual(s.config.WaveCfg[1],before.config.WaveCfg[1]);assert.deepEqual(source.future,before.config.WaveCfg[0].future);assert.deepEqual(s.config.FutureStage,before.config.FutureStage);
});

test('unit card sorting saves only display order for both timed and legacy waves',()=>{
 for(const s of [stage(),timed()]){
  const wave=s.config.WaveCfg[0],before=clone(s);
  const [first,second,third]=W.entries(wave,.5).map(entry=>entry.id);
  assert.equal(W.moveGroup(s,0,first,second,false,.5),false);
  assert.deepEqual(s,before);
  assert(W.moveGroup(s,0,third,first,false,.5));
  const expected=[third,first,second];
  assert.deepEqual(wave,{...before.config.WaveCfg[0],editorUnitOrder:expected});
  assert.deepEqual(W.unitGroups(W.entries(wave,.5),wave.editorUnitOrder).map(group=>group[0].id),expected);
  assert.deepEqual(W.summary(wave,.5),W.summary(before.config.WaveCfg[0],.5));
 }
});

test('sorting a spawn filter moves the linked card and preserves its slot after removing the first spawn',()=>{
 const s=timed(),wave=s.config.WaveCfg[0];
 const linked=W.addSpawn(s,0,'first',.5);
 const timeline=clone(wave.SpawnTimeline);
 assert(W.moveGroup(s,0,'other-lane','first',false,.5,'2'));
 assert.deepEqual(wave.editorUnitOrder,['other-lane','shared','first']);
 assert.deepEqual(wave.SpawnTimeline,timeline);
 assert.deepEqual(W.unitGroups(W.entries(wave,.5),wave.editorUnitOrder).at(-1).map(row=>row.id),['first',linked]);
 W.removeGroup(s,0,'first',.5);
 assert.deepEqual(wave.editorUnitOrder,['other-lane','shared',linked]);
 W.removeGroup(s,0,linked,.5,{allSpawns:true});
 assert.deepEqual(wave.editorUnitOrder,['other-lane','shared']);
 const added=W.addGroup(s,0,{unitId:90006,spawnId:2},.5);
 assert.deepEqual(W.unitGroups(W.entries(wave,.5),wave.editorUnitOrder).map(group=>group[0].id),['other-lane','shared',added]);

 const blank=W.addWave(s,0),duplicate=W.duplicateWave(s,0);
 assert(!Object.hasOwn(s.config.WaveCfg[blank],'editorUnitOrder'));
 assert.deepEqual(s.config.WaveCfg[duplicate].editorUnitOrder,wave.editorUnitOrder);
 W.copyWaveFrom(s,0,blank,{groups:true,paths:false,multipliers:false,settings:false});
 assert.deepEqual(s.config.WaveCfg[blank].editorUnitOrder,wave.editorUnitOrder);
});

test('group creation supplies defaults and stable unique IDs without aliases; removals affect only the selected group',()=>{
 const s=timed(),wave=s.config.WaveCfg[0],input={unitId:90005,spawnId:2,count:2,startSeconds:4,intervalSeconds:.75,future:{keep:[2]}};
 const id=W.addGroup(s,0,input,.5),again=W.addGroup(s,0,{unitId:90006,spawnId:1},.5);assert.notEqual(id,again);assert.equal(new Set(wave.SpawnTimeline.map(entry=>entry.id)).size,wave.SpawnTimeline.length);
 input.future.keep.push(3);assert.deepEqual(wave.SpawnTimeline.find(entry=>entry.id===id).future,{keep:[2]});assert.deepEqual(wave.SpawnTimeline.find(entry=>entry.id===again),{id:again,unitId:90006,spawnId:1,count:1,startSeconds:0,intervalSeconds:.5,inheritSpawnTiming:['startSeconds','intervalSeconds']});
 const keep=clone(wave.SpawnTimeline.filter(entry=>entry.id!==id));W.removeGroup(s,0,id,.5);assert.deepEqual(wave.SpawnTimeline,keep);assert.equal(W.entries(wave,.5).find(entry=>entry.unitId===90006).id,again);
});

test('linked spawn rows keep independent schedules and run through the existing timeline',()=>{
 const s=timed(),wave=s.config.WaveCfg[0];wave.SpawnTimeline[0].count=5;
 const before=clone(wave),id=W.addSpawn(s,0,'first',.5);
 const link=wave.SpawnTimeline[0].unitGroupId;
 assert(link);
 assert.deepEqual(wave.SpawnTimeline.slice(0,3),[{...before.SpawnTimeline[0],unitGroupId:link},...before.SpawnTimeline.slice(1)]);
 assert.deepEqual(wave.SpawnTimeline[3],{id,unitId:90002,unitGroupId:link,spawnId:2,count:1,startSeconds:.5,intervalSeconds:.5,inheritSpawnTiming:['startSeconds','intervalSeconds']});
 W.editGroup(s,0,id,{count:4,startSeconds:2,routeGraphId:'two'},.5);
 const saved=clone(wave),groups=W.unitGroups(W.entries(saved,.5));
 assert.equal(groups.length,3);
 assert.deepEqual(groups[0].map(row=>[row.id,row.spawnId,row.count]),[['first',1,5],[id,2,4]]);
 const {Timeline}=require('../../../assets/_script/AuthoredSpawnPlan'),spawned=[];
 const runtime=new Timeline(saved.SpawnTimeline);
 runtime.advance(10,(unitId,spawnId,route)=>{if(unitId===90002)spawned.push([spawnId,route]);});
 assert.equal(runtime.pending(),false);
 assert.deepEqual(spawned.filter(([spawnId])=>spawnId===1),Array(5).fill([1,'one']));
 assert.deepEqual(spawned.filter(([spawnId])=>spawnId===2),Array(4).fill([2,'two']));

 assert.throws(()=>W.addSpawn(s,0,'first',.5),/every enabled spawn/);
 assert.throws(()=>W.editGroup(s,0,id,{spawnId:1},.5),/already uses that spawn point/);
 assert.deepEqual(wave,saved);
 const settings={spawnId:1,count:5,startSeconds:.5,intervalSeconds:.5};
 W.chooseGroups(s,0,[90005],settings,.5,'first');
 const updated=s.config.WaveCfg[0],linked=W.unitGroups(W.entries(updated,.5))[0];
 assert.deepEqual(linked,groups[0].map(row=>({...row,unitId:90005})));
 W.removeGroup(s,0,id,.5,{allSpawns:true});
 assert.deepEqual(updated.SpawnTimeline,before.SpawnTimeline.slice(1));
});

test('edits preserve route and unknown fields until a spawn change makes that route unrelated',()=>{
 const s=timed(),wave=s.config.WaveCfg[0],patch={count:4,future:{keep:[4]}};W.editGroup(s,0,'first',patch,.5);patch.future.keep.push(8);assert.equal(wave.SpawnTimeline[0].routeGraphId,'one');assert.deepEqual(wave.SpawnTimeline[0].future,{keep:[4]});
 W.editGroup(s,0,'first',{spawnId:1},.5);assert.equal(wave.SpawnTimeline[0].routeGraphId,'one');W.editGroup(s,0,'first',{spawnId:2},.5);assert.equal(wave.SpawnTimeline[0].routeGraphId,null);W.editGroup(s,0,'shared',{spawnId:2},.5);assert.equal(wave.SpawnTimeline[1].routeGraphId,'shared');
 W.editGroup(s,0,'first',{spawnId:2,routeGraphId:'two'},.5);assert.equal(wave.SpawnTimeline[0].routeGraphId,'two');assert.equal(wave.SpawnTimeline[0].id,'first');
});

test('spawn defaults update inherited rows while timing edits lock the entire spawn row',()=>{
 const s=timed(),wave=s.config.WaveCfg[0],original=clone(wave.SpawnTimeline);
 s.config.WaveCfg.push({...stage().config.WaveCfg[0],Wave:2});
 const legacy=clone(s.config.WaveCfg[1]);
 W.setSpawnTiming(s,1,'startSeconds',2);
 W.setSpawnTiming(s,1,'intervalSeconds',1);
 W.setSpawnTiming(s,2,'startSeconds',4);
 W.setSpawnTiming(s,2,'intervalSeconds',.75);
 assert.deepEqual(wave.SpawnTimeline,original);
 assert.deepEqual(s.config.WaveCfg[1],legacy);
 const id=W.addGroup(s,0,{unitId:90007,spawnId:1,count:2},.5);
 const current=()=>wave.SpawnTimeline.find(entry=>entry.id===id);
 const timing=()=>[current().startSeconds,current().intervalSeconds];
 assert.deepEqual(timing(),[2,1]);
 const {Timeline}=require('../../../assets/_script/AuthoredSpawnPlan');
 const runtime=new Timeline([current()]),released=[];
 const emit=(unitId,spawnId)=>released.push([unitId,spawnId]);
 runtime.advance(1.5,emit);assert.deepEqual(released,[]);
 runtime.advance(.5,emit);assert.deepEqual(released,[[90007,1]]);
 runtime.advance(1,emit);assert.deepEqual(released,[[90007,1],[90007,1]]);
 W.editGroup(s,0,id,{startSeconds:3.25},.5);
 W.setSpawnTiming(s,1,'startSeconds',2.5);
 W.setSpawnTiming(s,1,'intervalSeconds',1.5);
 assert.deepEqual(timing(),[3.25,1]);
 assert(W.isTimingManual(current()));
 assert(!W.inheritsTiming(current(),'startSeconds'));
 assert(!W.inheritsTiming(current(),'intervalSeconds'));
 W.applySpawnDefaults(s,1,.5);
 assert.deepEqual(timing(),[3.25,1]);
 W.editGroup(s,0,id,{spawnId:2},.5);
 assert.deepEqual(timing(),[3.25,1]);
 W.editGroup(s,0,id,{},.5,{useSpawnDefaults:true});
 assert.deepEqual(timing(),[4,.75]);
 assert(!W.isTimingManual(current()));
 const nextLane=W.addSpawn(s,0,'first',.5);
 const added=wave.SpawnTimeline.find(entry=>entry.id===nextLane);
 assert.deepEqual([added.spawnId,added.startSeconds,added.intervalSeconds],[2,4,.75]);
 W.setSpawnTiming(s,2,'startSeconds',0);
 assert.deepEqual(timing(),[0,.75]);
 assert.equal(added.startSeconds,0);
 const editedSchedule=clone(wave.SpawnTimeline);
 editedSchedule.find(entry=>entry.id===id).startSeconds=6;
 W.preserveTimingOverrides(wave.SpawnTimeline,editedSchedule);
 wave.SpawnTimeline=editedSchedule;
 W.setSpawnTiming(s,2,'startSeconds',1);
 assert.deepEqual(timing(),[6,.75]);
 assert(W.isTimingManual(current()));
 assert(!Object.hasOwn(current(),'inheritSpawnTiming'));
 const before=clone(s);
 assert.throws(()=>W.setSpawnTiming(s,2,'intervalSeconds',0),/greater than zero/);
 assert.throws(()=>W.setSpawnTiming(s,2,'startSeconds',-.5),/zero or greater/);
 assert.deepEqual(s,before);
});

test('legacy locks preserve the original queue and follow the schedule when copied or materialized',()=>{
 const s=stage(),wave=s.config.WaveCfg[0],original=clone(wave);
 const [first,second]=W.entries(wave,.5);
 assert.equal(W.setTimingMode(s,0,first.id,'auto',.5),false);
 assert.deepEqual(wave,original);
 W.setTimingMode(s,0,first.id,'manual',.5);
 assert(W.isTimingManual(W.entries(wave,.5)[0]));
 assert.deepEqual(wave,{...original,editorManualTimingIds:[first.id]});

 const duplicate=W.duplicateWave(s,0),blank=W.addWave(s,0);
 assert.deepEqual(s.config.WaveCfg[duplicate].editorManualTimingIds,[first.id]);
 assert(!Object.hasOwn(s.config.WaveCfg[blank],'editorManualTimingIds'));
 W.copyWaveFrom(s,0,blank,{groups:true,multipliers:false,settings:false});
 assert(W.isTimingManual(W.entries(s.config.WaveCfg[blank],.5)[0]));
 W.setTimingMode(s,duplicate,first.id,'auto',.5);
 assert(!W.isTimingManual(W.entries(s.config.WaveCfg[duplicate],.5)[0]));
 assert(W.isTimingManual(W.entries(wave,.5)[0]));

 W.applyBalancedTiming(s,0,[{id:second.id,startSeconds:second.startSeconds+.5,intervalSeconds:second.intervalSeconds}],.5);
 assert.deepEqual(wave.SpawnTimeline[0],{...first,editorManualTiming:true});
 assert.deepEqual(wave.RefreshSoldierKind,original.RefreshSoldierKind);
 assert(!Object.hasOwn(wave,'editorManualTimingIds'));
});

test('typing the same time preserves inheritance and keeps legacy queues in their original format',()=>{
 const s=timed(),wave=s.config.WaveCfg[0],first=wave.SpawnTimeline[0];
 first.inheritSpawnTiming=['intervalSeconds','startSeconds','futureTiming'];
 const before=clone(s);
 W.editGroup(s,0,first.id,{startSeconds:first.startSeconds},.5);
 assert.deepEqual(s,before);
 W.editGroup(s,0,first.id,{startSeconds:3},.5);
 assert(W.isTimingManual(wave.SpawnTimeline[0]));
 assert.deepEqual(wave.SpawnTimeline[0].inheritSpawnTiming,['futureTiming']);

 const legacy=stage(),legacyWave=legacy.config.WaveCfg[0],legacyEntry=W.entries(legacyWave,.5)[0],legacyBefore=clone(legacy);
 W.editGroup(legacy,0,legacyEntry.id,{startSeconds:legacyEntry.startSeconds},.5);
 assert.deepEqual(legacy,legacyBefore);
});

test('raw timing edits lock uniquely identifiable imported rows without requiring editor IDs',()=>{
 const before=[{spawnId:1,unitId:90002,count:3,startSeconds:2,intervalSeconds:.5,inheritSpawnTiming:['startSeconds','intervalSeconds','futureTiming']},
  {spawnId:2,unitId:90004,count:2,startSeconds:3,intervalSeconds:.5,inheritSpawnTiming:['startSeconds']}];
 const after=[clone(before[1]),{...clone(before[0]),startSeconds:10}];
 W.preserveTimingOverrides(before,after);
 assert.deepEqual(after[0],before[1]);
 assert(W.isTimingManual(after[1]));
 assert(!Object.hasOwn(after[1],'id'));
 assert.deepEqual(after[1].inheritSpawnTiming,['futureTiming']);

 const duplicated=before.map(entry=>({...entry,id:'imported'}));
 const unchanged=clone(duplicated);
 W.preserveTimingOverrides(duplicated,unchanged);
 assert.deepEqual(unchanged,duplicated);
});

test('raw legacy edits move surviving locks to their batches and retire removed or ambiguous locks',()=>{
 const wave={RefreshSoldierKind:['1#90002,2;90003,1','2#90004,2','3#90005,1;90005,1'],editorManualTimingIds:['legacy-1-0','legacy-1-1','legacy-2-0','legacy-3-0']};
 const next=['1#90006,1;-1,1;90002,3','2#90004,2','3#90005,1'];
 W.reconcileLegacyTimingLocks(wave,next);
 assert.deepEqual(wave.editorManualTimingIds,['legacy-1-2','legacy-2-0']);
 assert.deepEqual(wave.RefreshSoldierKind,['1#90002,2;90003,1','2#90004,2','3#90005,1;90005,1']);
 wave.RefreshSoldierKind=next;
 assert.deepEqual(W.entries(wave,.5).filter(W.isTimingManual).map(row=>row.unitId),[90002,90004]);
 assert(!Object.hasOwn(wave,'SpawnTimeline'));
 const malformed={RefreshSoldierKind:['broken','2#90004,2'],editorManualTimingIds:['legacy-2-0']};
 W.reconcileLegacyTimingLocks(malformed,['1#90001,1','2#90004,2']);
 assert.deepEqual(malformed.editorManualTimingIds,['legacy-2-0']);
});

test('new wave timings enforce the repeated-spawn save interval before changing the draft',()=>{
 const s=timed(),before=clone(s),below=W.MIN_SPAWN_INTERVAL/2;
 assert.throws(()=>W.setSpawnTiming(s,1,'intervalSeconds',below),/at least 0\.000001 seconds/);
 assert.throws(()=>W.editGroup(s,0,'first',{intervalSeconds:below},.5),/at least 0\.000001 seconds/);
 assert.throws(()=>W.applyBalancedTiming(s,0,[{id:'first',startSeconds:1,intervalSeconds:below}],.5),/at least 0\.000001 seconds/);
 assert.deepEqual(s,before);
 assert(W.applyBalancedTiming(s,0,[{id:'first',startSeconds:1,intervalSeconds:W.MIN_SPAWN_INTERVAL}],.5));
 assert.equal(s.config.WaveCfg[0].SpawnTimeline[0].intervalSeconds,W.MIN_SPAWN_INTERVAL);

 const legacy=stage(),wave=legacy.config.WaveCfg[0],rows=W.entries(wave,below);
 W.setTimingMode(legacy,0,rows[0].id,'manual',below);
 const legacyBefore=clone(legacy);
 assert.throws(()=>W.applyBalancedTiming(legacy,0,[{id:rows[1].id,startSeconds:1,intervalSeconds:W.MIN_SPAWN_INTERVAL}],below),/at least 0\.000001 seconds/);
 assert.deepEqual(legacy,legacyBefore);
});

test('balancing commits explicit timings for Auto rows and rejects stale or invalid changes atomically',()=>{
 const s=timed(),wave=s.config.WaveCfg[0];
 W.setTimingMode(s,0,'first','manual',.5);
 const id=W.addGroup(s,0,{unitId:90007,spawnId:1,count:2},.5);
 const row=()=>wave.SpawnTimeline.find(entry=>entry.id===id);
 delete wave.SpawnTimeline[1].id;
 row().future={keep:true};
 const original=clone(s),proposal={id,startSeconds:3,intervalSeconds:1};
 for(const invalid of [
  {id:'first',startSeconds:10,intervalSeconds:2},
  {id:'missing',startSeconds:10,intervalSeconds:2},
  {id,startSeconds:6,intervalSeconds:2},
  {id:'other-lane',startSeconds:-1,intervalSeconds:2}
 ]){
  assert.throws(()=>W.applyBalancedTiming(s,0,[proposal,invalid],.5));
  assert.deepEqual(s,original);
 }
 assert.equal(W.applyBalancedTiming(s,0,[row()],.5),false);
 assert.deepEqual(s,original);
 assert(W.applyBalancedTiming(s,0,[proposal],.5));
 assert.equal(row().startSeconds,3);
 assert.equal(row().intervalSeconds,1);
 assert(!W.isTimingManual(row()));
 assert(!Object.hasOwn(row(),'inheritSpawnTiming'));
 assert.deepEqual(row().future,{keep:true});
 assert.deepEqual(wave.SpawnTimeline.slice(0,3),original.config.WaveCfg[0].SpawnTimeline.slice(0,3));
 W.setSpawnTiming(s,1,'startSeconds',9);
 assert.equal(row().startSeconds,3);
});

test('applying spawn defaults updates only matching lanes across timed and legacy waves',()=>{
 const s=timed(),wave=s.config.WaveCfg[0];
 W.addSpawn(s,0,'first',.5);
 delete wave.SpawnTimeline[1].id;
 wave.editorUnitOrder=['other-lane','first'];
 s.config.WaveCfg.push({...stage().config.WaveCfg[0],Wave:2},{id:7,Wave:3,RefreshSoldierKind:['2#90004,2']});
 const defaults={startSeconds:2,intervalSeconds:1};
 s.spawns[0].defaultTiming=defaults;
 const expected=clone(s),[timedWave,legacyWave]=expected.config.WaveCfg;
 const apply=row=>row.spawnId===1?{...row,...defaults,inheritSpawnTiming:['startSeconds','intervalSeconds']}:row;
 timedWave.SpawnTimeline=timedWave.SpawnTimeline.map(apply);
 legacyWave.SpawnTimeline=W.entries(legacyWave,.5).map(apply);

 W.applySpawnDefaults(s,1,.5);
 assert.deepEqual(s,expected);
 const applied=wave.SpawnTimeline;
 W.applySpawnDefaults(s,1,.5);
 W.applySpawnDefaults(s,3,.5);
 assert.equal(wave.SpawnTimeline,applied);
 assert.deepEqual(s,expected);
 W.setSpawnTiming(s,1,'intervalSeconds',1.5);
 assert.equal(wave.SpawnTimeline[0].intervalSeconds,1.5);
 assert.equal(s.config.WaveCfg[1].SpawnTimeline.find(row=>row.spawnId===1).intervalSeconds,1.5);
});

test('a bulk timing change validates every affected wave before changing the draft',()=>{
 const s=timed();
 s.spawns[0].defaultTiming={startSeconds:2,intervalSeconds:1e308};
 s.config.WaveCfg.push({Wave:2,RefreshSoldierKind:['1#90002,3']});
 const before=clone(s);
 assert.throws(()=>W.applySpawnDefaults(s,1,.5),/final spawn time must be finite/);
 assert.deepEqual(s,before);
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

test('copying into a wave preserves its identity and replaces its content with a detached copy',()=>{
 const s=timed(),list=s.config.WaveCfg;
 list.push({Wave:2,id:7,SpawnTimeline:[],HealthCoefficient:4,WaveReward:[],oldWaveField:true});
 list.push({Wave:3,id:7,RefreshSoldierKind:['1#90003,1']});
 const before=clone(s);
 assert.equal(W.copyWaveFrom(s,0,1),true);
 const expected=clone(before);
 expected.config.WaveCfg[1]={...clone(before.config.WaveCfg[0]),Wave:2};
 assert.deepEqual(s,expected);
 list[1].SpawnTimeline[0].future.keep.push(2);
 list[1].WaveReward[0][1]=500;
 assert.deepEqual(list[0],before.config.WaveCfg[0]);
});

test('copy options retain unchecked wave fields and give copied groups a spawn-default route',()=>{
 const s=timed(),list=s.config.WaveCfg;
 list.push({Wave:2,id:7,SpawnTimeline:[],HealthCoefficient:4,AttackCoefficient:3,WaveReward:[],future:{destination:true}});
 const before=clone(s),source=before.config.WaveCfg[0];
 assert.equal(W.copyWaveFrom(s,0,1,{paths:false,multipliers:false,settings:false}),true);
 const groups=source.SpawnTimeline.map(({routeGraphId,...entry})=>entry);
 assert.deepEqual(list[1],{...before.config.WaveCfg[1],SpawnTimeline:groups,RefreshSoldierKind:source.RefreshSoldierKind});
 const withGroups=clone(list[1]);
 assert.equal(W.copyWaveFrom(s,0,1,{groups:false}),true);
 assert.deepEqual(list[1],{...source,Wave:2,SpawnTimeline:withGroups.SpawnTimeline});
 assert.deepEqual(list[0],source);
});

test('copying a legacy wave keeps its encoding and an identical copy is a no-op',()=>{
 const s=stage(),list=s.config.WaveCfg;
 list.push({...clone(list[0]),Wave:2,SpawnTimeline:[{id:'dest'}]});
 assert.equal(W.copyWaveFrom(s,0,1),true);
 assert.deepEqual(list[1],{...list[0],Wave:2});
 assert(!Object.hasOwn(list[1],'SpawnTimeline'));
 const destination=list[1],before=clone(s);
 list[0]=Object.fromEntries(Object.entries(list[0]).reverse());
 assert.equal(W.copyWaveFrom(s,0,1),false);
 assert.equal(list[1],destination);
 for(const apply of [()=>W.copyWaveFrom(s,1,1),()=>W.copyWaveFrom(s,5,1),()=>W.copyWaveFrom(s,0,1,{groups:false,multipliers:false,settings:false})])assert.throws(apply);
 assert.deepEqual(s,before);
});


test('explicit group edits reject unsafe integers, unreachable final emission times and newly disabled lanes atomically',()=>{
 for(const patch of [{count:1e308},{unitId:Number.MAX_SAFE_INTEGER+1},{spawnId:1e308},{count:3,intervalSeconds:1e308}]){
  const s=timed(),before=JSON.stringify(s);assert.throws(()=>W.addGroup(s,0,{unitId:90001,spawnId:1,count:2,...patch},.5));assert.equal(JSON.stringify(s),before);
  assert.throws(()=>W.editGroup(s,0,'first',patch,.5));assert.equal(JSON.stringify(s),before);
 }
 const s=timed(),before=JSON.stringify(s);assert.throws(()=>W.editGroup(s,0,'first',{spawnId:3},.5),/Enable/);assert.equal(JSON.stringify(s),before);
 // An older disabled lane can still be inspected and its unrelated values
 // edited; changing that lane intentionally to an enabled one repairs it.
 s.config.WaveCfg[0].SpawnTimeline[0].spawnId=3;W.editGroup(s,0,'first',{count:4},.5);assert.equal(s.config.WaveCfg[0].SpawnTimeline[0].spawnId,3);W.editGroup(s,0,'first',{spawnId:2},.5);assert.equal(s.config.WaveCfg[0].SpawnTimeline[0].spawnId,2);
});

test('wave summaries handle large schedules without stack overflow, display-ID repair or metadata copies',()=>{
 const entry={id:'original',spawnId:2,unitId:90001,count:1,startSeconds:5,intervalSeconds:.5,future:{keep:[1,2]}},wave={SpawnTimeline:Array(150000).fill(entry)};
 assert.deepEqual(W.summary(wave,.5),{units:150000,groups:150000,spawnIds:[2],duration:5});assert(wave.SpawnTimeline.every(row=>row===entry));assert.deepEqual(entry.future,{keep:[1,2]});assert.equal(entry.id,'original');
});


test('malformed schedule readers fail clearly without mutating or normalizing imported values',()=>{
 for(const wave of [null,[],{SpawnTimeline:null},{SpawnTimeline:{}},{SpawnTimeline:[null]},{SpawnTimeline:[42]},{SpawnTimeline:[[]]},{RefreshSoldierKind:{}},{RefreshSoldierKind:[null]}]){const before=JSON.stringify(wave);for(const read of [W.entries,W.summary])assert.throws(()=>read(wave,.5),/wave must|must be|schedule must/);assert.equal(JSON.stringify(wave),before);}
});

test('overflowing display summaries fail clearly without mutating imported schedules',()=>{
 for(const wave of [{SpawnTimeline:[{spawnId:1,count:1e308,startSeconds:0,intervalSeconds:0},{spawnId:1,count:1e308,startSeconds:0,intervalSeconds:0}]},{SpawnTimeline:[{spawnId:1,count:1e308,startSeconds:0,intervalSeconds:1e308}]}]){const before=JSON.stringify(wave);assert.throws(()=>W.summary(wave,.5),/must be finite/);assert.equal(JSON.stringify(wave),before);}
});

test('removing a wave fails atomically when another row cannot be renumbered, and can remove the malformed row itself',()=>{
 const s=timed();s.config.WaveCfg.push(null);const before=JSON.stringify(s);assert.throws(()=>W.removeWave(s,0),/malformed wave rows/);assert.equal(JSON.stringify(s),before);assert.equal(W.removeWave(s,1),0);assert.equal(s.config.WaveCfg.length,1);assert.equal(s.config.WaveCfg[0].Wave,1);assert.equal(s.config.WaveCfg[0].id,7);assert.deepEqual(s.config.WaveCfg[0].future,{keep:[1]});
});

test('copying malformed wave settings fails clearly before adding or altering a row',()=>{
 for(const value of [null,[],42])for(const copy of [W.addWave,W.duplicateWave]){const s=timed();s.config.WaveCfg.push(value);const before=JSON.stringify(s);assert.throws(()=>copy(s,1),/Repair the selected wave/);assert.equal(JSON.stringify(s),before);}
});
