'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../worlds/model'),{Timeline}=require('../../../assets/_script/AuthoredSpawnPlan');
const root=path.resolve(__dirname,'../../..');
const files=['assets/KinghtFallConfig/GameJsonCfg.json','assets/KinghtFallConfigB/GameJsonCfg.json','assets/KinghtFallConfigD/GameJsonCfg.json','assets/configs/GameJsonCfg.json'];
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''));

// An independent simulation of the original runtime queue. Repeated spawn rows
// replace the lane; -1 consumes a spawn tick without creating an enemy.
function legacyQueue(rows){
 const queue={};
 for(const row of rows||[]){if(!row)continue;const [spawn,groups]=row.split('#');queue[parseInt(spawn,10)]=groups.split(';').map(group=>{const [id,num]=group.split(',').map(Number);return{id,num};});}
 return queue;
}
function visibleQueue(queue){return Object.fromEntries(Object.entries(queue).map(([spawn,groups])=>[spawn,groups.filter(group=>group.id!==-1).map(group=>({...group}))]).filter(([,groups])=>groups.length));}
function assertEquivalent(rows,entries,interval,label){
 const before=JSON.stringify({rows,entries}),queue=legacyQueue(rows),timeline=new Timeline(entries),duration=Math.max(0,...Object.values(queue).map(groups=>groups.reduce((sum,group)=>sum+group.num,0)));
 assert.deepEqual(timeline.queue(),visibleQueue(queue),label+' initial queue');
 for(let tick=1;tick<=duration;tick++){
  const expected=[];
  for(const spawn of Object.keys(queue)){const groups=queue[spawn],group=groups[0];if(!group)continue;if(group.id!==-1)expected.push([group.id,Number(spawn),null]);if(--group.num<=0)groups.shift();}
  const actual=[];timeline.advance(interval,(unit,spawn,route)=>actual.push([unit,spawn,route]));
  assert.deepEqual(actual,expected,label+' tick '+tick+' units/order/default route');
  assert.deepEqual(timeline.queue(),visibleQueue(queue),label+' tick '+tick+' remaining queues');
 }
 assert.equal(timeline.pending(),false,label+' completes after its last enemy');
 assert.equal(JSON.stringify({rows,entries}),before,label+' never mutates source data');
}

test('all campaign and fallback waves expose explicit schedules and legacy conversion preserves every lane tick',()=>{
 const base=read(files[0]),baseInterval=Number(base.ParameterCfg['60018'].Value);let stages=0,waves=0,enemies=0;
 for(const file of files){const doc=read(file),interval=Number(doc.ParameterCfg&&doc.ParameterCfg['60018']&&doc.ParameterCfg['60018'].Value)||baseInterval;
  for(const stage of doc.LevelCfg){stages++;for(const wave of stage.WaveCfg){waves++;const label=file+' stage '+stage.Level+' wave '+wave.Wave;
   assert(Array.isArray(wave.SpawnTimeline),label+' is still a legacy-only wave');
   // Saved schedules are now the editable source of truth. Replay conversion
   // from retained original strings independently, without freezing future
   // intentional schedule edits to those historical strings.
   for(const entry of wave.SpawnTimeline){assert(Number.isInteger(entry.spawnId)&&entry.spawnId>0,label+' spawn');assert(Number.isInteger(entry.unitId)&&entry.unitId>0,label+' unit');assert(Number.isInteger(entry.count)&&entry.count>0,label+' count');assert(Number.isFinite(entry.startSeconds)&&entry.startSeconds>=0,label+' start');assert(Number.isFinite(entry.intervalSeconds)&&entry.intervalSeconds>=(entry.count>1?Number.MIN_VALUE:0),label+' interval');}
   const converted=M.legacyTimeline(wave.RefreshSoldierKind,interval);
   enemies+=converted.reduce((sum,entry)=>sum+entry.count,0);
   assertEquivalent(wave.RefreshSoldierKind,converted,interval,label);
  }}
 }
 assert.equal(stages,80);assert.equal(waves,800);assert.equal(enemies,21584);
});

test('conversion keeps last duplicate lane, independent waits, unit groups and numeric spawn order',()=>{
 const rows=['10#90001,99','2#-1,2;90002,2;-1,1;90003,1','10#90004,2;-1,2;90005,1','1#90006,1;90007,2'];
 const before=JSON.stringify(rows),entries=M.legacyTimeline(rows,.5);
 assert.deepEqual(entries,[
  {id:'legacy-1-0',spawnId:1,unitId:90006,count:1,startSeconds:.5,intervalSeconds:.5},
  {id:'legacy-1-1',spawnId:1,unitId:90007,count:2,startSeconds:1,intervalSeconds:.5},
  {id:'legacy-2-1',spawnId:2,unitId:90002,count:2,startSeconds:1.5,intervalSeconds:.5},
  {id:'legacy-2-3',spawnId:2,unitId:90003,count:1,startSeconds:3,intervalSeconds:.5},
  {id:'legacy-10-0',spawnId:10,unitId:90004,count:2,startSeconds:.5,intervalSeconds:.5},
  {id:'legacy-10-2',spawnId:10,unitId:90005,count:1,startSeconds:2.5,intervalSeconds:.5}
 ]);
 assertEquivalent(rows,entries,.5,'duplicate/wait fixture');assert.equal(JSON.stringify(rows),before);
});
