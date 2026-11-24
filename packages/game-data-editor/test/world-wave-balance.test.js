'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Balance=require('../worlds/wave-balance');
const Pacing=require('../worlds/wave-pacing');
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

test('suggests the same cap by wave number and holds at 50 starting at wave 10',()=>{
 const caps=Array.from({length:12},(_,index)=>Balance.suggestedPeakCap(index+1));
 assert.deepEqual(caps,[5,9,14,18,22,27,33,39,45,50,50,50]);
});

test('suggests one to four pushes by stage and calculates their peak times',()=>{
 assert.deepEqual([1,3,4,6,7,10,11,24].map(Pacing.defaultCount),[1,1,2,2,3,3,4,4]);
 assert.deepEqual(Pacing.suggestedPeaks(2,26,27,2,null),[5,20]);
 assert.deepEqual(Pacing.suggestedPeaks(4,55,45,2,null),[5,20,35,50]);
 assert.deepEqual(Pacing.suggestedPeaks(2,26,27,2,12),[3,12]);
});

test('Spawn 1 leads a small opening and both sides take part in the two pushes',()=>{
 const source=wave(...[2,3,4,5,6,1].map(spawn=>row('spawn-'+spawn,spawn,spawn===1?4:5,0,.5)));
 const original=structuredClone(source);
 const result=plan(source,{peakCap:26,lastSpawnLimit:23,pushPeaks:[5,20],spawnGroups:[[4,5,6],[3,2,1]]});
 assert.equal(result.ok,true);
 assert.equal(result.tactical.after.pacing.distinct,2);
 const pacing=result.tactical.after.pacing;
 assert(pacing.opening.value<result.tactical.before.pacing.opening.value);
 assert(pacing.opening.value<=3);
 assert(pacing.peaks.every((peak,index)=>Math.abs(peak.time-[5,20][index])<=2));
 assert(pacing.lulls[0].value<Math.min(...pacing.peaks.map(peak=>peak.value)));
 const entries=Waves.entries(result.afterWave,.5),first=entries.find(row=>row.spawnId===1);
 const sides=[entries.filter(row=>row.spawnId<=3),entries.filter(row=>row.spawnId>=4)];
 assert.equal(first.startSeconds,0);
 assert(entries.every(row=>row.spawnId===1||row.startSeconds>first.startSeconds));
 const lastArrival=row=>row.startSeconds+(row.count-1)*row.intervalSeconds;
 const otherSide=Math.min(...sides[1].map(row=>row.startSeconds));
 assert(otherSide<=5&&otherSide<Math.max(...sides[0].map(lastArrival)));
 assert(sides.every(side=>side.some(row=>row.startSeconds<12.5)&&side.some(row=>lastArrival(row)>12.5)));
 assert(result.after.peak<=26&&result.after.lastSpawn<=23);
 assert.deepEqual(source,original);
});

test('finds four separate pushes while preserving the Manual row and validating the final schedule',()=>{
 const counts=[4,5,5,5,5,5,3,4,5],pushPeaks=[5,20,35,50];
 const source=wave(...counts.map((count,index)=>row('spawn-'+(index+1),index+1,count,0,.5)),
  row('manual',5,2,35.25,.75,{editorManualTiming:true,routeGraphId:'keep'}));
 const options={peakCap:19,lastSpawnLimit:53,pushPeaks,spawnGroups:[[1,2,3],[4,5,6],[7,8,9]]};
 const result=plan(source,options);
 assert.equal(result.ok,true);
 const pacing=result.tactical.after.pacing;
 assert.equal(pacing.distinct,4);
 assert(pacing.peaks.every((peak,index)=>Math.abs(peak.time-pushPeaks[index])<=3));
 const projection=Pressure.build(result.afterWave,[],.5);
 assert(projection.peaks.units.value<=options.peakCap&&projection.duration<=options.lastSpawnLimit);
 for(const [index,lull] of pacing.lulls.entries()){
  assert.equal(lull.value,projection.at(lull.time).units);
  assert(lull.value<Math.min(pacing.peaks[index].value,pacing.peaks[index+1].value));
 }
 const applied=result.afterWave.SpawnTimeline;
 assert.deepEqual(applied.at(-1),source.SpawnTimeline.at(-1));
 assert.equal(projection.totals.units,counts.reduce((sum,count)=>sum+count,2));
 assert(result.changes.every(change=>Number.isInteger(2*change.startSeconds)&&Number.isInteger(2*change.intervalSeconds)));
});

test('reports the achievable number of pushes for a single spawn row',()=>{
 const result=plan(wave(row('only',1,5,0,.5)),{peakCap:5,pushPeaks:[5,20,35,50]});
 assert.equal(result.ok,true);
 assert.equal(result.tactical.after.pacing.distinct,1);
 assert(result.after.lastSpawn<=8);
 assert(result.tactical.after.pacing.opening.value<result.before.peak);
});

test('requires a later deadline when Spawn 1 cannot lead simultaneous arrivals',()=>{
 const source=wave(row('other',4,1,0,0),row('first',1,1,0,0));
 const result=plan(source,{pushPeaks:[5],lastSpawnLimit:0,spawnGroups:[[1],[4]]});
 assert.equal(result.ok,false);
 assert.match(result.message,/Spawn 1 sending first/);
 assert.deepEqual(result.changes,[]);
});

test('pins spawn-group openings at exact times and reports deadline and Manual conflicts',()=>{
 const groups=[{id:'north',spawnIds:[1,2,3]},{id:'south',spawnIds:[4,5,6]},{id:'east',spawnIds:[7,8,9]}];
 const source=wave(...Array.from({length:9},(_,index)=>row('lane-'+index,index+1,3,0,.5)));
 const opts={peakCap:9,pushPeaks:[5,23],groupStarts:{north:0,south:5,east:20},spawnGroups:groups};
 const result=plan(source,opts);
 assert.equal(result.ok,true);
 assert.equal(result.after.peak,9);
 for(const group of groups){
  const times=result.afterWave.SpawnTimeline.filter(row=>group.spawnIds.includes(row.spawnId)).map(row=>row.startSeconds);
  assert.equal(Math.min(...times),opts.groupStarts[group.id]);
 }
 assert.match(plan(source,{...opts,lastSpawnLimit:19}).message,/group 3.*after the last-spawn limit/);
 const manual=wave(...source.SpawnTimeline,row('pinned',4,1,4,0,{editorManualTiming:true}));
 assert.match(plan(manual,opts).message,/group 2.*Manual arrival at 4 s/);
});

test('reviewing proposed row edits checks the exact schedule without running the planner again',()=>{
 const source=wave(row('first',1,2,0,.5),row('next',2,2,5,.5),row('locked',3,1,6,0,{editorManualTiming:true}));
 const opts={pushPeaks:[5],peakCap:3,lastSpawnLimit:8};
 const reviewed=plan(source,{...opts,timingEdits:[{id:'next',startSeconds:5,intervalSeconds:1.5}]});
 assert.equal(reviewed.ok,true);
 assert.deepEqual(reviewed.changes,[{id:'next',startSeconds:5,intervalSeconds:1.5}]);
 assert.equal(reviewed.after.lastSpawn,6.5);
 assert.deepEqual(reviewed.afterWave.SpawnTimeline[2],source.SpawnTimeline[2]);
 const withEdit=(startSeconds,intervalSeconds,more={})=>plan(source,{...opts,...more,
  timingEdits:[{id:'next',startSeconds,intervalSeconds}]});
 assert.equal(withEdit(5,.25).reason,'invalid-timing');
 assert.equal(withEdit(0,.5).reason,'spawn-one-order');
 assert.equal(withEdit(.5,.5).reason,'peak-exceeded');
 assert.equal(withEdit(7,2).reason,'deadline-exceeded');
 assert.equal(withEdit(4.5,1,{spawnGroups:[{id:'later',spawnIds:[2]}],groupStarts:{later:5}}).reason,'group-start-conflict');
});

test('tactical timing tests eight arrivals in half-second steps inside a four-second spawn window',()=>{
 const source=wave(...[3,5,5,8,5].map((count,index)=>row('lane-'+index,index+1,count,.5,.5,{unitId:index+1})));
 const profiles=new Map([
  [1,{weight:2.28,phase:3,area:true,backline:true}],
  [2,{weight:1.28,phase:2,frontline:true}],
  [3,{weight:1.33,phase:0,frontline:true}],
  [4,{weight:1.19,phase:1,frontline:true}],
  [5,{weight:1.30,phase:1,frontline:true}]
 ]);
 const peakCap=Balance.suggestedPeakCap(6);
 const result=plan(source,{peakCap,lastSpawnLimit:4,unitThreats:profiles});
 assert.equal(result.ok,true);
 assert.equal(result.after.lastSpawn,4);
 assert(result.after.peak<=peakCap);
 assert(result.tactical.after.peakBurst<result.tactical.before.peakBurst);
 assert.equal(result.afterWave.SpawnTimeline[3].intervalSeconds,.5);
 assert(result.changes.every(change=>Number.isInteger(change.startSeconds*2)&&Number.isInteger(change.intervalSeconds*2)));
});

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

test('fits a half-second start around fractional Manual spawns and defeat times',()=>{
 const source=wave(row('early',1,3,0,.1,{editorManualTiming:true}),row('move',2,1,.2,0));
 const result=plan(source,{peakCap:1,lastSpawnLimit:.5,defeatSeconds:.1});
 assert.equal(result.ok,true);
 assert.equal(result.after.peak,1);
 assert.deepEqual(result.changes,[{id:'move',startSeconds:.5,intervalSeconds:0}]);
 assert.deepEqual(result.afterWave.SpawnTimeline[0],source.SpawnTimeline[0]);
});

test('reports failure when a deadline would require off-grid Auto timing',()=>{
 const source=wave(row('auto',1,4,0,.25),row('manual',2,1,1.4,0,{editorManualTiming:true}));
 const before=structuredClone(source);
 const result=plan(source,{peakCap:1,lastSpawnLimit:3.15,defeatSeconds:.7,spawnGroups:[[1],[2]]});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'search-limit');
 assert.match(result.message,/0\.5 s steps/);
 assert.deepEqual(result.changes,[]);
 assert.deepEqual(source,before);
});

test('uses available defeat slots before a tight deadline when the original group starts are too late',()=>{
 const source=wave(row('first',1,4,3,.5),row('second',2,1,2.5,0));
 const result=plan(source,{peakCap:1,lastSpawnLimit:3.5,defeatSeconds:.7,spawnGroups:[[1],[2]]});
 assert.equal(result.ok,true);
 assert.equal(result.after.peak,1);
 assert(result.after.lastSpawn<=3.5);
 const [first,second]=result.afterWave.SpawnTimeline;
 assert(first.startSeconds<second.startSeconds);
 assert.equal(first.intervalSeconds,1);
});

test('stretches an Auto row to align with gaps between Manual spawns',()=>{
 const source=wave(row('auto',1,3,.5,1),row('manual',2,3,0,1.4,{editorManualTiming:true}));
 const result=plan(source,{peakCap:1,lastSpawnLimit:4,defeatSeconds:.7,spawnGroups:[[1],[2]]});
 assert.equal(result.ok,true);
 assert.deepEqual(result.changes,[{id:'auto',startSeconds:1,intervalSeconds:1.5}]);
 assert.equal(result.after.peak,1);
 assert.equal(result.after.lastSpawn,4);
 assert.deepEqual(result.afterWave.SpawnTimeline[1],source.SpawnTimeline[1]);
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
