'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Balance=require('../worlds/wave-balance');
const Pressure=require('../worlds/wave-pressure');
const Waves=require('../worlds/wave-editor');

const row=(id,spawnId,count,startSeconds,intervalSeconds,fields={})=>({id,spawnId,unitId:99,count,startSeconds,intervalSeconds,...fields});
const wave=(...SpawnTimeline)=>({SpawnTimeline,HealthCoefficient:1,AttackCoefficient:1});
const plan=(source,options)=>Balance.plan(source,{interval:.5,...options});

const roleThreats=new Map([
 [1,{weight:1.3,frontline:true,phase:0}],
 [2,{weight:1.5,backline:true,phase:2}],
 [3,{weight:5,frontline:true,phase:6,enemyClass:'boss'}],
 [4,{weight:4,backline:true,area:true,phase:5,enemyClass:'elite'}],
 [5,{weight:1,phase:1}],
 [6,{weight:2.2,flight:true,phase:4}],
 [7,{weight:1.4,backline:true,support:true,phase:3}],
 [8,{weight:2.5,area:true,backline:true,heavy:true,phase:3}]
]);

test('role-aware timing spaces dangerous opening arrivals while preserving locks and the deadline',()=>{
 const source=wave(
  row('boss',1,1,0,0,{unitId:3,editorManualTiming:true}),
  row('elite',1,1,0,0,{unitId:4}),
  row('air',2,1,0,0,{unitId:6}),
  row('heavy splash',2,1,0,0,{unitId:8}),
  row('end',3,1,8,0,{unitId:5,editorManualTiming:true})
 );
 const options={peakCap:4,lastSpawnLimit:8,spawnGroups:[[1,2],[3]],unitThreats:roleThreats};
 assert.equal(plan(source,{...options,unitThreats:undefined}).changes.length,0);
 const before=structuredClone(source),result=plan(source,options);
 assert.equal(result.ok,true);
 assert.equal(result.tactical.matchedRows,5);
 assert.equal(result.tactical.totalRows,5);
 assert(result.tactical.after.peakThreat<result.tactical.before.peakThreat);
 assert(result.tactical.after.peakBurst<result.tactical.before.peakBurst);
 assert.equal(result.tactical.after.coveredBackliners,0,'a boss is a threat and is not used as ordinary cover');
 assert.equal(result.after.lastSpawn,8);
 assert(result.changes.every(change=>['elite','air','heavy splash'].includes(change.id)));
 assert.deepEqual(source,before);
 assert.deepEqual(plan(source,options),result);
});

test('a ground frontline leads ranged singles and Mystic support from its spawn group',()=>{
 const source=wave(
  row('screen',8,1,0,0,{unitId:1,editorManualTiming:true}),
  row('straight shot',7,1,0,0,{unitId:2}),
  row('mystic',7,1,0,0,{unitId:7}),
  row('next group',9,1,3,0,{unitId:5})
 );
 const result=plan(source,{lastSpawnLimit:4,peakCap:3,unitThreats:roleThreats,spawnGroups:[[8,7],[9]]});
 assert.equal(result.ok,true);
 assert.equal(result.tactical.before.coveredBackliners,0);
 assert.equal(result.tactical.after.coveredBackliners,2);
 const [screen,shot,mystic,next]=result.afterWave.SpawnTimeline;
 assert.equal(screen.startSeconds,0);
 assert(shot.startSeconds>0&&shot.startSeconds<2);
 assert(mystic.startSeconds>0&&mystic.startSeconds<2);
 assert(Math.min(shot.startSeconds,mystic.startSeconds)<=next.startSeconds);
 assert(result.after.peak<=3);
});

test('tactical timing spreads a large row inside the authored window',()=>{
 const source=wave(
  row('crowd',1,8,0,.25,{unitId:5}),
  row('end',2,1,6,0,{unitId:5,editorManualTiming:true})
 );
 const result=plan(source,{lastSpawnLimit:6,unitThreats:roleThreats});
 assert.equal(result.ok,true);
 assert.equal(result.after.lastSpawn,6);
 assert(result.afterWave.SpawnTimeline[0].intervalSeconds>.25);
 assert.equal(Pressure.build(result.afterWave,[],.5).totals.units,9);
 assert(result.tactical.after.peakBurst<result.tactical.before.peakBurst);
});

test('a hard deadline can keep an existing safe composition, while available slack allows one tactical beat',()=>{
 const source=wave(
  row('boss',1,1,0,0,{unitId:3,editorManualTiming:true}),
  row('elite',2,1,0,0,{unitId:4})
 );
 const tight=plan(source,{lastSpawnLimit:0,unitThreats:roleThreats});
 assert.equal(tight.ok,true);
 assert.deepEqual(tight.changes,[]);
 assert.equal(tight.after.lastSpawn,0);
 const free=plan(source,{lastSpawnLimit:5,unitThreats:roleThreats});
 assert.equal(free.ok,true);
 assert(free.tactical.after.peakThreat<free.tactical.before.peakThreat);
 assert(free.after.lastSpawn>0&&free.after.lastSpawn<=2);
});

test('tactical spacing reduces excessive downtime and anchors the opening',()=>{
 const source=wave(
  row('opening',1,1,0,0,{unitId:5,editorManualTiming:true}),
  row('after gap',1,1,6,0,{unitId:5}),
  row('end',1,1,8,0,{unitId:5,editorManualTiming:true})
 );
 const result=plan(source,{unitThreats:roleThreats});
 assert.equal(result.ok,true);
 assert.equal(result.after.lastSpawn,8);
 assert.equal(result.afterWave.SpawnTimeline[0].startSeconds,0);
 assert(result.afterWave.SpawnTimeline[1].startSeconds<6);
 assert.equal(result.tactical.after.peakThreat,result.tactical.before.peakThreat);
});

test('balances against all fixed rows and previews exactly what the draft operation will apply',()=>{
 const source=wave(
  row('early',9,3,0,.5,{editorManualTiming:true,untouched:{custom:'data'}}),
  row('late',9,3,7,.5,{editorManualTiming:true}),
  row('move',1,3,0,.5,{routeGraphId:'custom-path',unitGroupId:'group-1',futureField:'keep',inheritSpawnTiming:['startSeconds','intervalSeconds']}),
  row('trailing',2,1,8,.5)
 );
 const original=structuredClone(source),options={peakCap:4,lastSpawnLimit:12,spawnGroups:[[1,4,5],[2],[9]]};
 const result=plan(source,options);
 assert.equal(result.ok,true);
 assert.equal(result.before.peak,6);
 assert.equal(result.after.peak,4);
 assert.equal(result.after.lastSpawn,12);
 assert.deepEqual(result.changes.map(edit=>edit.id),['move','trailing']);
 assert(result.changes[0].startSeconds<result.changes[1].startSeconds);
 assert.equal(result.changes[0].intervalSeconds,.5);
 assert.deepEqual(source,original);
 assert.deepEqual(plan(source,options),result);

 const stage={config:{WaveCfg:[structuredClone(source)]}},draft=stage.config.WaveCfg[0];
 assert(Waves.applyBalancedTiming(stage,0,result.changes,.5));
 assert.deepEqual(draft.SpawnTimeline.slice(0,2),original.SpawnTimeline.slice(0,2));
 assert.equal(draft.SpawnTimeline[2].routeGraphId,'custom-path');
 assert.equal(draft.SpawnTimeline[2].unitGroupId,'group-1');
 assert.equal(draft.SpawnTimeline[2].futureField,'keep');
 assert.deepEqual(draft,result.afterWave);
 assert.equal(Pressure.build(draft,[],.5).peaks.units.value,4);
});

test('increases a dense interval when start staggering alone cannot meet the cap',()=>{
 const result=plan(wave(row('dense',1,5,0,.5)),{peakCap:2,lastSpawnLimit:6});
 assert.equal(result.ok,true);
 assert.deepEqual(result.changes,[{id:'dense',startSeconds:0,intervalSeconds:1.5}]);
 assert.deepEqual(result.after,{peak:2,peakTime:1.5,lastSpawn:6});
});

test('respects customized spawn group order for Auto rows with arbitrary group sizes',()=>{
 const source=wave(
  row('manual',2,1,0,0,{editorManualTiming:true}),
  row('ungrouped',3,2,.5,.5),
  row('group-2',4,2,1,1),
  row('group-1-secondary',7,2,4,1),
  row('group-1-primary',8,2,3,1)
 );
 const spawnGroups=[{id:'first',spawnIds:[8,7,10]},{id:'next',spawnIds:[4]}];
 const result=plan(source,{spawnGroups});
 assert.equal(result.ok,true);
 const byId=Object.fromEntries(result.afterWave.SpawnTimeline.map(entry=>[entry.id,entry]));
 assert.deepEqual(byId.manual,source.SpawnTimeline[0]);
 assert(Math.min(byId['group-1-primary'].startSeconds,byId['group-1-secondary'].startSeconds)<=byId['group-2'].startSeconds);
 assert(byId['group-2'].startSeconds<=byId.ungrouped.startSeconds);
 assert.equal(result.after.lastSpawn,result.before.lastSpawn);
});

test('preserves a valid ordered proposal and keeps the default cap at 50',()=>{
 const source=wave(row('entry-5',8,2,1,1),row('entry-8',1,2,2,1));
 const result=plan(source,{spawnGroups:[[8],[1]]});
 assert.equal(Balance.DEFAULT_PEAK_CAP,50);
 assert.equal(result.ok,true);
 assert.deepEqual(result.changes,[]);
 assert.deepEqual(result.before,result.after);
 assert.equal(result.afterWave,source);
});

test('leaves an already compliant wave alone when groups have no Auto rows in it',()=>{
 const source=wave(row('later',1,1,4,0),row('earlier',2,1,0,0),row('manual',3,1,1,0,{editorManualTiming:true}));
 const result=plan(source,{spawnGroups:[[],[3],[4,5]]});
 assert.equal(result.ok,true);
 assert.deepEqual(result.changes,[]);
 assert.equal(result.afterWave,source);
});

test('rejects hard conflicts from the manual rows before suggesting edits',()=>{
 const locked=wave(row('manual',1,5,0,.5,{editorManualTiming:true}),row('auto',2,2,1,.5));
 const cap=plan(locked,{peakCap:2});
 assert.equal(cap.reason,'locked-peak');
 assert.deepEqual(cap.fixed,{peak:4,peakTime:1.5,lastSpawn:2});
 const deadline=plan(locked,{lastSpawnLimit:1});
 assert.equal(deadline.reason,'locked-deadline');
 assert.deepEqual(deadline.changes,[]);
});

test('shows the mathematical deadline lower bound for the current enemy total and defeat rate',()=>{
 const source=wave(row('a',1,70,0,.5),row('b',2,51,1,.5));
 const baseline=plan(source,{lastSpawnLimit:45});
 assert.equal(baseline.reason,'deadline-too-short');
 assert.equal(baseline.minimumLastSpawn,142);
 const quicker=plan(source,{lastSpawnLimit:35,defeatSeconds:.5});
 assert.equal(quicker.reason,'deadline-too-short');
 assert.equal(quicker.minimumLastSpawn,35.5);
});

test('balances a campaign-sized 121-unit wave within its exact throughput deadline',()=>{
 const spawns=[[1,15,.5,.5],[2,10,.5,.5],[3,12,.5,.5],[7,8,.5,.5],[8,10,.5,.5],[4,8,.5,.5],
  [5,10,4.5,4.5],[13,8,.5,1.5],[1,10,.5,.5],[6,10,.5,.5],[1,10,.5,.5],[1,8,3.5,2.5],
  [2,1,6.5,.5],[6,1,5.5,.5]];
 const source=wave(...spawns.map((args,index)=>row('row-'+index,...args)));
 const result=plan(source,{lastSpawnLimit:142,spawnGroups:[[1,2,3],[4,5,6],[7,8,9]]});
 assert.equal(result.ok,true);
 assert.equal(result.before.peak,105);
 assert.equal(result.after.peak,50);
 assert.equal(result.after.lastSpawn,142);
 assert.equal(Pressure.build(result.afterWave,[],.5).totals.units,121);
});

test('prefers keeping the current spawn window when it can meet the peak cap',()=>{
 const counts=[8,7,5,5,5,5,10,5,5];
 const source=wave(...counts.map((count,index)=>row('row-'+index,index+1,count,index>=3&&index<=5?8:.5,.5)));
 const result=plan(source,{spawnGroups:[[1,2,3],[4,5,6],[7,8,9]]});
 assert.equal(result.ok,true);
 assert.equal(result.before.lastSpawn,10);
 assert.equal(result.after.lastSpawn,10);
 assert(result.after.peak<=50);
});

test('handles fractional defeat boundaries on the last-spawn deadline',()=>{
 const source=wave(row('early',1,3,0,.1,{editorManualTiming:true}),row('move',2,1,.2,0));
 const result=plan(source,{peakCap:1,lastSpawnLimit:.3,defeatSeconds:.1});
 assert.equal(result.ok,true);
 assert.equal(result.after.peak,1);
 assert.equal(result.changes[0].startSeconds,.3);
 assert.equal(Pressure.build(result.afterWave,[],.5,.1).at(.3).units,1);
});

test('finds a legal fractional interval when a deadline relies on decimal precision',()=>{
 const source=wave(row('auto',1,4,0,.25),row('manual',2,1,1.4,0,{editorManualTiming:true}));
 const result=plan(source,{peakCap:1,lastSpawnLimit:3.15,defeatSeconds:.7,spawnGroups:[[1],[2]]});
 assert.equal(result.ok,true);
 assert.deepEqual(result.changes.map(change=>change.id),['auto']);
 assert.equal(result.after.peak,1);
 assert(result.after.lastSpawn<=3.15||Pressure.coincident(result.after.lastSpawn,3.15));
});

test('uses available defeat slots before a tight deadline when the original group starts are too late',()=>{
 const source=wave(row('first',1,4,3,.5),row('second',2,1,2.5,0));
 const result=plan(source,{peakCap:1,lastSpawnLimit:3.5,defeatSeconds:.7,spawnGroups:[[1],[2]]});
 assert.equal(result.ok,true);
 assert.equal(result.after.peak,1);
 assert(result.after.lastSpawn<=3.5);
 assert(result.changes[0].startSeconds<result.changes[1].startSeconds);
 assert.equal(result.changes[0].intervalSeconds,.5);
});

test('stretches an Auto row to align with gaps between Manual spawns',()=>{
 const source=wave(row('auto',1,3,.5,1),row('manual',2,3,0,1.4,{editorManualTiming:true}));
 const result=plan(source,{peakCap:1,lastSpawnLimit:3.5,defeatSeconds:.7,spawnGroups:[[1],[2]]});
 assert.equal(result.ok,true);
 assert.deepEqual(result.changes.map(change=>change.id),['auto']);
 assert.equal(result.after.peak,1);
 assert(Pressure.coincident(result.after.lastSpawn,3.5));
});

test('computed timing uses a saveable interval even when the defeat period is smaller',()=>{
 const source=wave(row('rapid',1,3,0,Waves.MIN_SPAWN_INTERVAL));
 const result=plan(source,{peakCap:2,defeatSeconds:1e-7,lastSpawnLimit:1e-6});
 assert.equal(result.ok,false);
 assert.deepEqual(result.changes,[]);
 assert.equal(source.SpawnTimeline[0].intervalSeconds,Waves.MIN_SPAWN_INTERVAL);
});

test('legacy preview leaves the authored lane strings and source metadata intact',()=>{
 const source={RefreshSoldierKind:['1#99,5','2#99,5'],HealthCoefficient:1,AttackCoefficient:1,future:{retain:true}};
 const original=structuredClone(source);
 const result=plan(source,{peakCap:3});
 assert.equal(result.ok,true);
 assert(result.changes.length>0);
 assert.deepEqual(source,original);
 assert.deepEqual(result.afterWave.RefreshSoldierKind,original.RefreshSoldierKind);
 assert.deepEqual(result.afterWave.future,{retain:true});
 assert.equal(Pressure.build(result.afterWave,[],.5).totals.units,10);
 assert(Pressure.build(result.afterWave,[],.5).peaks.units.value<=3);
});

test('reports bounded-search failure separately from proven impossibility',()=>{
 const source=wave(row('one',1,2,0,1));
 const result=plan(source,{peakCap:2,lastSpawnLimit:0});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'search-limit');
 assert.match(result.message,/No valid timing proposal was found/);
 assert.deepEqual(result.changes,[]);
 assert.equal(result.minimumLastSpawn,0);
});

test('validates cap and deadline fields and declines excessively large searches',()=>{
 const source=wave(row('large',1,10000000,0,1));
 assert.throws(()=>plan(source,{peakCap:1.5}),/positive whole number/);
 assert.throws(()=>plan(source,{lastSpawnLimit:-1}),/zero or greater/);
 const result=plan(source);
 assert.equal(result.reason,'projection-unavailable');
 assert.deepEqual(result.changes,[]);
});

test('a very loose deadline still searches the practical range of possible timings',()=>{
 const source=wave(row('dense',1,5,0,.5));
 const result=plan(source,{peakCap:2,lastSpawnLimit:Number.MAX_VALUE});
 assert.equal(result.ok,true);
 assert.equal(result.after.lastSpawn,6);
 assert.equal(result.after.peak,2);
});

test('skips non-finite horizon margins while preserving representable spawn times',()=>{
 const result=plan(wave(row('dense',1,2,0,1)),{peakCap:1,defeatSeconds:1e308});
 assert.equal(result.ok,true);
 assert.equal(result.after.lastSpawn,1e308);
 assert.equal(result.after.peak,1);
});
