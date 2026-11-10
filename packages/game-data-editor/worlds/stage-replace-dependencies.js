'use strict';
// Keep dependencies of unchecked waves, preserving their IDs and geometry.
// This pass only touches the detached replacement draft, never either input.
const {clone}=require('./model'),JSONDoc=require('../lib/json-document');
function requirements(stage){
 const lanes=new Map();
 const add=(id,route)=>{if(!Number.isSafeInteger(id)||id<1)return;if(!lanes.has(id))lanes.set(id,new Set());if(typeof route==='string'&&route)lanes.get(id).add(route);};
 for(const wave of Array.isArray(stage.config.WaveCfg)?stage.config.WaveCfg:[]){
  if(!wave||typeof wave!=='object')continue;
  if(Array.isArray(wave.SpawnTimeline)){for(const entry of wave.SpawnTimeline)if(entry&&typeof entry==='object')add(entry.spawnId,entry.routeGraphId);}
  else if(wave.SpawnTimeline===undefined&&Array.isArray(wave.RefreshSoldierKind))for(const row of wave.RefreshSoldierKind)if(typeof row==='string'&&row.includes('#'))add(Number(row.split('#')[0]));
 }
 return lanes;
}
const usable=graph=>graph&&(graph.weight===undefined||typeof graph.weight==='number'&&Number.isFinite(graph.weight)&&graph.weight>0);
const unconditional=graph=>usable(graph)&&(!graph.requiresAnyBuilding||Array.isArray(graph.requiresAnyBuilding)&&!graph.requiresAnyBuilding.length);
const bound=(graph,id)=>Array.isArray(graph.spawnIds)&&graph.spawnIds.includes(id);
function sameRoute(a,b){const left=clone(a),right=clone(b);delete left.spawnIds;delete right.spawnIds;return JSONDoc.equal(left,right);}
function retain(target,value,selected){
 const retainedSpawnIds=[],retainedGraphIds=[],placementWarnings=[],required=requirements(target),restored=new Set(),bindings=new Map();
 if(!selected.includes('waves')&&(selected.includes('spawns')||selected.includes('paths'))){
  // A preexisting broken lane cannot be invented here. Retain only original
  // enabled records whose ID is still needed by the untouched wave schedules.
  for(const [id]of required){
   const original=target.spawns.find(spawn=>spawn.id===id&&spawn.enabled!==false);if(!original)continue;
   const current=value.spawns.find(spawn=>spawn.id===id&&spawn.enabled!==false);if(current)continue;
   const at=value.spawns.findIndex(spawn=>spawn.id===id);if(at<0)value.spawns.push(clone(original));else value.spawns[at]=clone(original);
   restored.add(id);retainedSpawnIds.push(id);
  }
 }
 if(selected.includes('paths')){
   // These lanes retain their old entrances, so do not accidentally send them
   // along an imported conditional path authored for a disabled source lane.
   for(const graph of value.graphs)if(Array.isArray(graph.spawnIds))graph.spawnIds=graph.spawnIds.filter(id=>!restored.has(id));
   const need=(graph,id)=>{if(!graph||!bound(graph,id))return;if(!bindings.has(graph.id))bindings.set(graph.id,{graph,ids:new Set()});bindings.get(graph.id).ids.add(id);};
   const protectedLanes=new Map();
   if(!selected.includes('waves'))for(const [id,overrides]of required)protectedLanes.set(id,overrides);
   // Every unchanged enabled spawn needs a fallback, even when no current wave
   // uses that lane. Otherwise replacing Paths can make the draft unsaveable.
   if(!selected.includes('spawns'))for(const spawn of target.spawns)if(spawn.enabled!==false&&!protectedLanes.has(spawn.id))protectedLanes.set(spawn.id,new Set());
   for(const [id,overrides]of protectedLanes){
    const original=target.spawns.find(spawn=>spawn.id===id&&spawn.enabled!==false),current=value.spawns.find(spawn=>spawn.id===id&&spawn.enabled!==false);if(!original||!current)continue;
    for(const graphId of overrides){const incoming=value.graphs.find(graph=>graph.id===graphId&&bound(graph,id));if(!incoming)need(target.graphs.find(graph=>graph.id===graphId),id);}
    if(typeof current.graphId==='string'&&current.graphId&&!value.graphs.some(graph=>graph.id===current.graphId&&bound(graph,id)))need(target.graphs.find(graph=>graph.id===current.graphId),id);
    if(restored.has(id)||!value.graphs.some(graph=>bound(graph,id)&&unconditional(graph)))for(const graph of target.graphs)if(unconditional(graph)&&bound(graph,id))need(graph,id);
   }
   for(const original of target.graphs){
    const binding=bindings.get(original.id);if(!binding||binding.graph!==original)continue;
    const ids=original.spawnIds.filter(id=>binding.ids.has(id)),existing=value.graphs.find(graph=>graph.id===original.id);
    if(existing){
     if(!sameRoute(existing,original))throw Error('Cannot retain required route "'+original.id+'": the source stage uses the same route ID for different content. Uncheck Paths or give the routes distinct IDs before replacing.');
     for(const id of ids)if(!existing.spawnIds.includes(id))existing.spawnIds.push(id);
    }else{const graph=clone(original);graph.spawnIds=ids;value.graphs.push(graph);}
    retainedGraphIds.push(original.id);
   }
 }
 retainedSpawnIds.sort((a,b)=>a-b);
 if(value.mapId!==target.mapId){
  if(retainedSpawnIds.length)placementWarnings.push('Retained spawn points '+retainedSpawnIds.join(', ')+' keep their original positions and routes. The map changed; review placement because entrances may be blocked by scenery.');
  else if(retainedGraphIds.length)placementWarnings.push('Retained routes keep their original geometry. The map changed; review placement because entrances and paths may be blocked by scenery.');
  if(!selected.includes('spawns')||!selected.includes('paths'))placementWarnings.push('The map changed while existing '+(!selected.includes('spawns')&&!selected.includes('paths')?'spawn points and paths':!selected.includes('spawns')?'spawn points':'paths')+' were kept. Review their placement because entrances or paths may be blocked by scenery.');
 }
 return {retainedSpawnIds,retainedGraphIds,placementWarnings};
}
module.exports={requirements,retain};
