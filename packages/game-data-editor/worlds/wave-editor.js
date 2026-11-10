'use strict';
// Draft-only wave operations. Reading a legacy schedule never converts or saves
// it; the first explicit group edit materializes that wave's displayed schedule.
const M=require('./model'),own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const clone=value=>M.clone(value);
function fallbackInterval(interval){if(!Number.isFinite(interval)||interval<=0)throw Error('Spawn interval must be greater than zero.');return interval;}
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
function summary(wave,interval){
 // Statistics do not need display IDs or detached metadata copies. A single
 // read-only pass also avoids spread-argument limits on large authored waves.
 const groups=schedule(wave,interval),spawns=new Set();let units=0,duration=0;
 for(let index=0;index<groups.length;index++){const entry=groups[index],count=Number(entry.count),start=Number(entry.startSeconds),gap=Number(entry.intervalSeconds);if(![count,start,gap].every(Number.isFinite))throw Error('Spawn entry '+(index+1)+' needs numeric counts and times.');units+=count;spawns.add(entry.spawnId);duration=Math.max(duration,start+(count-1)*gap);if(!Number.isFinite(units)||!Number.isFinite(duration))throw Error('Spawn summary totals and final times must be finite.');}
 return{units,groups:groups.length,spawnIds:Array.from(spawns).sort((a,b)=>a-b),duration};
}
function waves(stage){if(!stage||!stage.config||!Array.isArray(stage.config.WaveCfg)||!stage.config.WaveCfg.length)throw Error('A stage needs at least one wave.');return stage.config.WaveCfg;}
function waveAt(stage,index){const list=waves(stage);if(!Number.isInteger(index)||index<0||index>=list.length)throw Error('Select an existing wave.');return list[index];}
function validGroup(stage,entry,newGroup){
 for(const field of ['unitId','spawnId','count'])if(!Number.isSafeInteger(entry[field])||entry[field]<=0)throw Error(field==='count'?'Unit count must be a positive whole number.':field==='spawnId'?'Choose a valid spawn.':'Choose a valid unit.');
 const spawn=(stage.spawns||[]).find(value=>value.id===entry.spawnId);if(!spawn)throw Error('The selected spawn no longer exists.');if(newGroup&&spawn.enabled===false)throw Error('Enable the selected spawn before adding a unit group.');
 if(!Number.isFinite(entry.startSeconds)||entry.startSeconds<0)throw Error('Start time must be zero or greater.');
 if(!Number.isFinite(entry.intervalSeconds)||entry.intervalSeconds<0||(entry.count>1&&entry.intervalSeconds===0))throw Error('Spawn interval must be greater than zero for multiple units.');
 if(!Number.isFinite(entry.startSeconds+(entry.count-1)*entry.intervalSeconds))throw Error('The final spawn time must be finite.');
}
function validRoute(stage,entry){if(entry.routeGraphId===undefined||entry.routeGraphId===null||entry.routeGraphId==='')return;const graph=(stage.graphs||[]).find(graph=>graph.id===entry.routeGraphId);if(!graph||!(graph.spawnIds||[]).includes(entry.spawnId))throw Error('Choose a path assigned to this spawn.');}
function addGroup(stage,index,value,interval){
 const wave=waveAt(stage,index),next=entries(wave,interval),entry=Object.assign({count:1,startSeconds:0,intervalSeconds:fallbackInterval(interval)},clone(value||{}));
 const ids=new Set(next.map(entry=>entry.id));let suffix=1;while(ids.has('entry-'+suffix))suffix++;entry.id='entry-'+suffix;
 validGroup(stage,entry,true);validRoute(stage,entry);next.push(entry);wave.SpawnTimeline=next;return entry.id;
}
function editGroup(stage,index,id,patch,interval){
 const wave=waveAt(stage,index),next=entries(wave,interval),entry=next.find(entry=>entry.id===id);if(!entry)throw Error('This unit group no longer exists.');
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('Supply the unit group changes.');if(own(patch,'id')&&patch.id!==id)throw Error('Unit group IDs cannot be changed.');
 const previousSpawn=entry.spawnId;Object.assign(entry,clone(patch));validGroup(stage,entry,entry.spawnId!==previousSpawn);
 if(own(patch,'spawnId')&&entry.spawnId!==previousSpawn&&!own(patch,'routeGraphId')&&entry.routeGraphId){const graph=(stage.graphs||[]).find(graph=>graph.id===entry.routeGraphId);if(!graph||!(graph.spawnIds||[]).includes(entry.spawnId))entry.routeGraphId=null;}
 if(own(patch,'routeGraphId'))validRoute(stage,entry);wave.SpawnTimeline=next;return id;
}
function removeGroup(stage,index,id,interval){const wave=waveAt(stage,index),next=entries(wave,interval),at=next.findIndex(entry=>entry.id===id);if(at<0)throw Error('This unit group no longer exists.');next.splice(at,1);wave.SpawnTimeline=next;return id;}
function stageLevel(stage){const level=stage.config.Level===undefined?stage.level:stage.config.Level;if(!Number.isSafeInteger(level)||level<=0)throw Error('The stage needs a valid level ID.');return level;}
function appendWave(stage,sourceIndex,blank){const source=waveAt(stage,sourceIndex);if(!source||typeof source!=='object'||Array.isArray(source))throw Error('Repair the selected wave before copying its settings.');const level=stageLevel(stage),next=clone(source),list=waves(stage);next.Wave=list.length+1;next.id=level;if(blank){next.SpawnTimeline=[];next.RefreshSoldierKind=[];}list.push(next);return list.length-1;}
function addWave(stage,sourceIndex){const list=waves(stage);return appendWave(stage,sourceIndex===undefined?list.length-1:sourceIndex,true);}
function duplicateWave(stage,index){return appendWave(stage,index,false);}
function removeWave(stage,index){waveAt(stage,index);const list=waves(stage);if(list.length===1)throw Error('Keep at least one wave in the stage.');const remaining=list.filter((wave,at)=>at!==index);if(remaining.some(wave=>!wave||typeof wave!=='object'||Array.isArray(wave)))throw Error('Repair the other malformed wave rows before removing this wave.');list.splice(index,1);list.forEach((wave,index)=>{wave.Wave=index+1;});return Math.min(index,list.length-1);}
module.exports={entries,summary,addGroup,editGroup,removeGroup,addWave,duplicateWave,removeWave};
