'use strict';
// Draft-only wave operations. Reading a legacy schedule never converts or saves
// it; the first explicit group edit materializes that wave's displayed schedule.
const M=require('./model'),CardOrder=require('./stage-card-order'),own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const {equal}=require('../lib/json-document');
const clone=value=>M.clone(value);
const TIMING_FIELDS=['startSeconds','intervalSeconds'];
function fallbackInterval(interval){if(!Number.isFinite(interval)||interval<=0)throw Error('Spawn interval must be greater than zero.');return interval;}
const validDefault=(field,seconds)=>Number.isFinite(seconds)&&(field==='intervalSeconds'?seconds>0:seconds>=0);
function spawnTiming(spawn,interval,fallback={startSeconds:interval,intervalSeconds:interval}){
 const defaults=spawn?.defaultTiming;
 return Object.fromEntries(TIMING_FIELDS.map(field=>[
  field,validDefault(field,defaults?.[field])?defaults[field]:fallback[field]
 ]));
}
function inheritsTiming(entry,field){
 return Array.isArray(entry.inheritSpawnTiming)&&entry.inheritSpawnTiming.includes(field);
}
function usesSpawnDefaults(entry,defaults){
 return TIMING_FIELDS.every(field=>inheritsTiming(entry,field)&&entry[field]===defaults[field]);
}
function storeInheritance(entry,fields){
 if(fields.length)entry.inheritSpawnTiming=fields;
 else delete entry.inheritSpawnTiming;
}
function updateInheritedTiming(stage,defaultsBySpawn){
 const changes=[];
 const waves=stage.config.WaveCfg;
 for(const wave of Array.isArray(waves)?waves:[]){
  if(!Array.isArray(wave?.SpawnTimeline))continue;
  for(const entry of wave.SpawnTimeline){
   const defaults=defaultsBySpawn.get(entry?.spawnId);
   if(!defaults)continue;
   const patch={};
   for(const field of TIMING_FIELDS){
    if(inheritsTiming(entry,field)&&validDefault(field,defaults[field])&&entry[field]!==defaults[field])patch[field]=defaults[field];
   }
   if(!Object.keys(patch).length)continue;
   validTiming({...entry,...patch});
   changes.push({entry,patch});
  }
 }
 for(const {entry,patch} of changes)Object.assign(entry,patch);
}
function setSpawnTiming(stage,spawnId,field,seconds){
 const spawn=(stage.spawns||[]).find(item=>item.id===spawnId);
 if(!spawn)throw Error('The selected spawn no longer exists.');
 if(!TIMING_FIELDS.includes(field)||!validDefault(field,seconds)){
  throw Error(field==='intervalSeconds'?'Default spawn interval must be greater than zero.':'Default start time must be zero or greater.');
 }
 updateInheritedTiming(stage,new Map([[spawnId,{[field]:seconds}]]));
 spawn.defaultTiming={...spawn.defaultTiming,[field]:seconds};
}
function refreshSpawnTiming(stage){
 const defaults=(stage.spawns||[]).filter(spawn=>spawn.defaultTiming).map(spawn=>[spawn.id,spawn.defaultTiming]);
 if(defaults.length)updateInheritedTiming(stage,new Map(defaults));
}
function preserveTimingOverrides(before,rows){
 if(!Array.isArray(before))return;
 const previousById=new Map(before.filter(row=>typeof row?.id==='string'&&row.id).map(row=>[row.id,row]));
 for(const row of rows){
  const previous=previousById.get(row.id);
  if(!previous||!Array.isArray(row.inheritSpawnTiming))continue;
  const remaining=row.inheritSpawnTiming.filter(field=>!TIMING_FIELDS.includes(field)||row[field]===previous[field]);
  if(remaining.length!==row.inheritSpawnTiming.length)storeInheritance(row,remaining);
 }
}
function uniqueEntries(source){
 const result=clone(source),reserved=new Set(result.map(entry=>entry.id).filter(id=>typeof id==='string'&&id.trim())),used=new Set();let next=1;
 for(const entry of result){if(typeof entry.id==='string'&&entry.id.trim()&&!used.has(entry.id)){used.add(entry.id);continue;}while(reserved.has('entry-'+next)||used.has('entry-'+next))next++;entry.id='entry-'+next++;used.add(entry.id);}
 return result;
}
function schedule(wave,interval){
 if(!wave||typeof wave!=='object'||Array.isArray(wave))throw Error('A wave must be an object.');
 let result;if(wave.SpawnTimeline!==undefined){if(!Array.isArray(wave.SpawnTimeline))throw Error('SpawnTimeline must be an array.');result=wave.SpawnTimeline;}
 else{if(wave.RefreshSoldierKind!==undefined&&(!Array.isArray(wave.RefreshSoldierKind)||wave.RefreshSoldierKind.some(row=>typeof row!=='string')))throw Error('The legacy spawn schedule must be an array of strings.');result=M.legacyTimeline(wave.RefreshSoldierKind,fallbackInterval(interval));}
 for(let index=0;index<result.length;index++)if(!result[index]||typeof result[index]!=='object'||Array.isArray(result[index]))throw Error('Spawn entry '+(index+1)+' must be an object.');
 return result;
}
function entries(wave,interval){return uniqueEntries(schedule(wave,interval));}
const linkedId=entry=>typeof entry.unitGroupId==='string'&&entry.unitGroupId.trim()?entry.unitGroupId:null;
const groupKey=entry=>linkedId(entry)?JSON.stringify([entry.unitGroupId,entry.unitId]):JSON.stringify([entry.id]);
function unitGroups(rows,order){
 const groups=new Map();
 for(const row of rows){const key=groupKey(row);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 const result=Array.from(groups.values());
 if(!Array.isArray(order))return result;
 const byId=new Map(result.map(group=>[group[0].id,group])),ordered=[];
 for(const id of order){
  const group=byId.get(id);
  if(group){ordered.push(group);byId.delete(id);}
 }
 return ordered.concat(Array.from(byId.values()));
}
function visibleRows(group,spawnFilter){
 return spawnFilter==='all'?group:group.filter(entry=>String(entry.spawnId)===String(spawnFilter));
}
function availableSpawns(stage,rows){
 const used=new Set(rows.map(row=>String(row.spawnId)));
 return (stage.spawns||[]).filter(spawn=>spawn.enabled!==false&&!used.has(String(spawn.id)));
}
function summary(wave,interval){
 // Statistics do not need display IDs or detached metadata copies. A single
 // read-only pass also avoids spread-argument limits on large authored waves.
 const groups=schedule(wave,interval),spawns=new Set();let units=0,duration=0;
 for(let index=0;index<groups.length;index++){const entry=groups[index],count=Number(entry.count),start=Number(entry.startSeconds),gap=Number(entry.intervalSeconds);if(![count,start,gap].every(Number.isFinite))throw Error('Spawn entry '+(index+1)+' needs numeric counts and times.');units+=count;spawns.add(entry.spawnId);duration=Math.max(duration,start+(count-1)*gap);if(!Number.isFinite(units)||!Number.isFinite(duration))throw Error('Spawn summary totals and final times must be finite.');}
 return{units,groups:groups.length,spawnIds:Array.from(spawns).sort((a,b)=>a-b),duration};
}
function waves(stage){if(!stage||!stage.config||!Array.isArray(stage.config.WaveCfg)||!stage.config.WaveCfg.length)throw Error('A stage needs at least one wave.');return stage.config.WaveCfg;}
function waveAt(stage,index){const list=waves(stage);if(!Number.isInteger(index)||index<0||index>=list.length)throw Error('Select an existing wave.');return list[index];}
function moveGroup(stage,index,sourceId,targetId,after,interval,spawnFilter='all'){
 const wave=waveAt(stage,index),groups=unitGroups(entries(wave,interval),wave.editorUnitOrder);
 const visible=groups.filter(group=>visibleRows(group,spawnFilter).length).map(group=>({id:group[0].id}));
 if(!CardOrder.move(visible,sourceId,targetId,after))return false;
 const moved=CardOrder.ordered(visible),visibleIds=new Set(visible.map(card=>card.id));
 // Keep filtered-out cards in their slots and keep scheduling arrays in runtime order.
 let at=0;
 wave.editorUnitOrder=groups.map(([first])=>visibleIds.has(first.id)?moved[at++].id:first.id);
 return true;
}
function validTiming(entry){
 if(!Number.isFinite(entry.startSeconds)||entry.startSeconds<0)throw Error('Start time must be zero or greater.');
 if(!Number.isFinite(entry.intervalSeconds)||entry.intervalSeconds<0||(entry.count>1&&entry.intervalSeconds===0))throw Error('Spawn interval must be greater than zero for multiple units.');
 if(!Number.isFinite(entry.startSeconds+(entry.count-1)*entry.intervalSeconds))throw Error('The final spawn time must be finite.');
}
function applySpawnDefaults(stage,spawnId,interval){
 const spawn=(stage.spawns||[]).find(item=>item.id===spawnId);
 if(!spawn)throw Error('The selected spawn no longer exists.');
 const defaults=spawnTiming(spawn,interval),updates=[];
 for(const wave of waves(stage)){
  const rows=schedule(wave,interval);
  let changed=false;
  const next=rows.map(entry=>{
   if(entry.spawnId!==spawnId||usesSpawnDefaults(entry,defaults))return entry;
   const updated={...entry,...defaults};
   storeInheritance(updated,TIMING_FIELDS.slice());
   validTiming(updated);
   changed=true;
   return updated;
  });
  if(changed)updates.push({wave,next});
 }
 for(const {wave,next} of updates)wave.SpawnTimeline=next;
}
function validGroup(stage,entry,newGroup){
 for(const field of ['unitId','spawnId','count'])if(!Number.isSafeInteger(entry[field])||entry[field]<=0)throw Error(field==='count'?'Unit count must be a positive whole number.':field==='spawnId'?'Choose a valid spawn.':'Choose a valid unit.');
 const spawn=(stage.spawns||[]).find(value=>value.id===entry.spawnId);if(!spawn)throw Error('The selected spawn no longer exists.');if(newGroup&&spawn.enabled===false)throw Error('Enable the selected spawn before adding a unit group.');
 validTiming(entry);
}
function validRoute(stage,entry){if(entry.routeGraphId===undefined||entry.routeGraphId===null||entry.routeGraphId==='')return;const graph=(stage.graphs||[]).find(graph=>graph.id===entry.routeGraphId);if(!graph||!(graph.spawnIds||[]).includes(entry.spawnId))throw Error('Choose a path assigned to this spawn.');}
function nextId(rows,field,prefix){
 const ids=new Set(rows.map(row=>row[field]));let suffix=1;while(ids.has(prefix+suffix))suffix++;return prefix+suffix;
}
function appendGroup(stage,rows,value,interval){
 const settings=clone(value||{}),spawn=(stage.spawns||[]).find(item=>item.id===settings.spawnId);
 const defaults=spawnTiming(spawn,interval,{startSeconds:0,intervalSeconds:fallbackInterval(interval)});
 const entry={count:1,...defaults,...settings};
 const inherited=TIMING_FIELDS.filter(field=>own(settings,'inheritSpawnTiming')?inheritsTiming(settings,field):!own(settings,field));
 storeInheritance(entry,inherited);
 entry.id=nextId(rows,'id','entry-');
 validGroup(stage,entry,true);validRoute(stage,entry);rows.push(entry);return entry.id;
}
function addGroup(stage,index,value,interval){
 const wave=waveAt(stage,index),next=entries(wave,interval),id=appendGroup(stage,next,value,interval);
 wave.SpawnTimeline=next;return id;
}
function groupRows(rows,entry){
 if(!linkedId(entry))return [entry];
 const key=groupKey(entry);return rows.filter(row=>groupKey(row)===key);
}
function addSpawn(stage,index,id,interval){
 const wave=waveAt(stage,index),next=entries(wave,interval),source=next.find(row=>row.id===id);
 if(!source)throw Error('This unit group no longer exists.');
 const spawn=availableSpawns(stage,groupRows(next,source))[0];
 if(!spawn)throw Error('This unit group already uses every enabled spawn point.');
 // Keep the runtime timeline flat. The link is used by the wave editor.
 const unitGroupId=linkedId(source)||nextId(next,'unitGroupId','unit-group-');
 const timing=spawnTiming(spawn,interval,{startSeconds:source.startSeconds,intervalSeconds:source.intervalSeconds===0?interval:source.intervalSeconds});
 const added=appendGroup(stage,next,{unitId:source.unitId,spawnId:spawn.id,...timing,unitGroupId,inheritSpawnTiming:TIMING_FIELDS},interval);
 source.unitGroupId=unitGroupId;
 wave.SpawnTimeline=next;return added;
}
function editGroup(stage,index,id,patch,interval,{useSpawnDefaults=false}={}){
 const wave=waveAt(stage,index),next=entries(wave,interval),entry=next.find(entry=>entry.id===id);if(!entry)throw Error('This unit group no longer exists.');
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('Supply the unit group changes.');if(own(patch,'id')&&patch.id!==id)throw Error('Unit group IDs cannot be changed.');
 const rows=groupRows(next,entry),previousSpawn=entry.spawnId;
 const inherited=useSpawnDefaults?TIMING_FIELDS.slice():TIMING_FIELDS.filter(field=>
  own(patch,'inheritSpawnTiming')?inheritsTiming(patch,field):!own(patch,field)&&inheritsTiming(entry,field));
 Object.assign(entry,clone(patch));
 const moved=entry.spawnId!==previousSpawn;
 if((moved||useSpawnDefaults)&&inherited.length){
  const timing=spawnTiming((stage.spawns||[]).find(spawn=>spawn.id===entry.spawnId),interval);
  for(const field of inherited)entry[field]=timing[field];
 }
 storeInheritance(entry,inherited);
 validGroup(stage,entry,moved);
 if(moved&&rows.some(row=>row!==entry&&String(row.spawnId)===String(entry.spawnId)))throw Error('This unit group already uses that spawn point.');
 if(moved&&!own(patch,'routeGraphId')&&entry.routeGraphId){const graph=(stage.graphs||[]).find(graph=>graph.id===entry.routeGraphId);if(!graph||!(graph.spawnIds||[]).includes(entry.spawnId))entry.routeGraphId=null;}
 if(own(patch,'routeGraphId'))validRoute(stage,entry);
 if(own(patch,'unitId'))for(const row of rows)row.unitId=entry.unitId;
 wave.SpawnTimeline=next;return id;
}
function removeGroup(stage,index,id,interval,{allSpawns=false}={}){
 const wave=waveAt(stage,index),next=entries(wave,interval),entry=next.find(row=>row.id===id);
 if(!entry)throw Error('This unit group no longer exists.');
 const group=groupRows(next,entry),removed=new Set(allSpawns?group:[entry]),first=group[0];
 if(Array.isArray(wave.editorUnitOrder)&&removed.has(first)){
  // The next spawn row takes over as the card's identity.
  const remaining=group.find(row=>!removed.has(row));
  wave.editorUnitOrder=wave.editorUnitOrder.flatMap(key=>key!==first.id?[key]:remaining?[remaining.id]:[]);
 }
 wave.SpawnTimeline=next.filter(row=>!removed.has(row));return id;
}
function chooseGroups(stage,index,unitIds,settings,interval,replaceId){
 const chosen=Array.from(new Set(unitIds));if(!chosen.length)throw Error('Select at least one unit model.');
 const source=waveAt(stage,index),next=Object.assign({},stage,{config:Object.assign({},stage.config,{WaveCfg:stage.config.WaveCfg.slice()})});next.config.WaveCfg[index]=clone(source);
 const original=replaceId===undefined?null:entries(source,interval).find(entry=>entry.id===replaceId);if(replaceId!==undefined&&!original)throw Error('This unit group no longer exists.');
 let additions=chosen,updated=null,template=null;
 if(original){const retained=chosen.includes(original.unitId),unitId=retained?original.unitId:chosen[0],patch=Object.assign({},settings,{unitId});additions=chosen.filter(id=>id!==unitId);
  if(Object.keys(patch).some(key=>JSON.stringify(original[key])!==JSON.stringify(patch[key]))){editGroup(next,index,replaceId,patch,interval);updated=replaceId;}
  template=entries(next.config.WaveCfg[index],interval).find(entry=>entry.id===replaceId);
 }
 const added=[];for(const unitId of additions){const value=Object.assign({},settings,{unitId});if(template&&template.routeGraphId)value.routeGraphId=template.routeGraphId;added.push(addGroup(next,index,value,interval));}
 stage.config.WaveCfg[index]=next.config.WaveCfg[index];return {updated,added};
}
function stageLevel(stage){const level=stage.config.Level===undefined?stage.level:stage.config.Level;if(!Number.isSafeInteger(level)||level<=0)throw Error('The stage needs a valid level ID.');return level;}
function appendWave(stage,sourceIndex,blank){const source=waveAt(stage,sourceIndex);if(!source||typeof source!=='object'||Array.isArray(source))throw Error('Repair the selected wave before copying its settings.');const level=stageLevel(stage),next=clone(source),list=waves(stage);next.Wave=list.length+1;next.id=level;if(blank){next.SpawnTimeline=[];next.RefreshSoldierKind=[];delete next.editorUnitOrder;}list.push(next);return list.length-1;}
function addWave(stage,sourceIndex){const list=waves(stage);return appendWave(stage,sourceIndex===undefined?list.length-1:sourceIndex,true);}
function duplicateWave(stage,index){return appendWave(stage,index,false);}
function copyWaveFrom(stage,sourceIndex,destinationIndex,{groups=true,paths=true,multipliers=true,settings=true}={}){
 if(sourceIndex===destinationIndex)throw Error('Choose a different source wave.');
 const source=waveAt(stage,sourceIndex),destination=waveAt(stage,destinationIndex);
 if([source,destination].some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw Error('Choose valid source and destination waves.');
 if(!groups&&!multipliers&&!settings)throw Error('Select at least one option to copy.');
 const copies=key=>{
  if(key==='id'||key==='Wave')return false;
  if(key==='SpawnTimeline'||key==='RefreshSoldierKind'||key==='editorUnitOrder')return groups;
  if(key==='HealthCoefficient'||key==='AttackCoefficient')return multipliers;
  return settings;
 };
 const retained=Object.entries(destination).filter(([key])=>!copies(key));
 const copied=Object.entries(source).filter(([key])=>copies(key));
 const next=clone(Object.fromEntries(retained.concat(copied)));
 // Both schedule fields retain their authored format. Routes belong to the stage;
 // dropping an override makes the copied group follow its spawn's default path.
 if(groups&&!paths&&Array.isArray(next.SpawnTimeline)){
  for(const entry of next.SpawnTimeline)if(entry&&typeof entry==='object')delete entry.routeGraphId;
 }
 if(equal(destination,next))return false;
 stage.config.WaveCfg[destinationIndex]=next;
 return true;
}
function removeWave(stage,index){waveAt(stage,index);const list=waves(stage);if(list.length===1)throw Error('Keep at least one wave in the stage.');const remaining=list.filter((wave,at)=>at!==index);if(remaining.some(wave=>!wave||typeof wave!=='object'||Array.isArray(wave)))throw Error('Repair the other malformed wave rows before removing this wave.');list.splice(index,1);list.forEach((wave,index)=>{wave.Wave=index+1;});return Math.min(index,list.length-1);}
module.exports={schedule,entries,summary,unitGroups,visibleRows,availableSpawns,spawnTiming,inheritsTiming,usesSpawnDefaults,setSpawnTiming,applySpawnDefaults,refreshSpawnTiming,preserveTimingOverrides,addGroup,addSpawn,editGroup,moveGroup,removeGroup,chooseGroups,addWave,duplicateWave,copyWaveFrom,removeWave};
