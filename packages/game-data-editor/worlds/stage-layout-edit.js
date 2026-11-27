'use strict';
const CardOrder=require('./stage-card-order');
const SpawnBounds=require('./spawn-bounds'),SpawnGroups=require('./spawn-groups'),Waves=require('./wave-editor');

// Keep placement edits local to their positions and spawn radii. Share templates
// and unrelated draft records so a drag can avoid copying the entire stage.
function move(stage, moves, graphId, checkPositions, map){
 if(!Array.isArray(moves))throw Error('Choose placements to move.');
 const changes=new Map();
 for(const change of moves){
  if(!change||typeof change.id!=='string'||!Number.isFinite(change.x)||!Number.isFinite(change.y))throw Error('Placement coordinates must be finite.');
  if(checkPositions&&changes.has(change.id))throw Error('Choose each placement only once.');
  changes.set(change.id,change);
 }
 if(!changes.size)return stage;
 let result=stage,matched=0;
 function update(placements,kind){
  let changed=false;
  const entries=placements.map(placement=>{
   const change=changes.get(kind+':'+placement.id);
   if(!change)return placement;
   matched++;
   const resize=Object.prototype.hasOwnProperty.call(change,'radius');
   if(resize&&(kind!=='spawn'||!Number.isFinite(change.radius)||change.radius<0||change.radius>1500))throw Error('Choose a spawn radius between 0 and 1500.');
   if(checkPositions&&(placement.x!==change.beforeX||placement.y!==change.beforeY||resize&&placement.radius!==change.beforeRadius))throw Error('This placement changed while you were dragging. Review its latest position and try again.');
   if(placement.x===change.x&&placement.y===change.y&&(!resize||placement.radius===change.radius))return placement;
   const next={...placement,x:change.x,y:change.y};
   if(resize)next.radius=change.radius;
   if(kind==='spawn')SpawnBounds.constrain(next,map,resize);
   if(placement.x===next.x&&placement.y===next.y&&placement.radius===next.radius)return placement;
   changed=true;
   return next;
  });
  return changed?entries:placements;
 }
 if(graphId==null){
  for(const [kind,field] of [['building','buildings'],['special','specials'],['spawn','spawns']]){
   const placements=stage[field]||[],updated=update(placements,kind);
   if(updated!==placements)result={...result,[field]:updated};
  }
 }else{
  const index=stage.graphs.findIndex(graph=>graph.id===graphId),graph=stage.graphs[index];
  if(graph){
   const nodes=update(graph.nodes,'node');
   if(nodes!==graph.nodes){const graphs=stage.graphs.slice();graphs[index]={...graph,nodes};result={...stage,graphs};}
  }
 }
 if(checkPositions&&matched!==changes.size)throw Error('A selected placement is no longer available.');
 return result;
}
function reorder(stage,edit,checkPositions){
 if(!['graphs','buildings','specials'].includes(edit.collection))throw Error('Choose a stage card list to reorder.');
 const items=stage[edit.collection],before=CardOrder.ordered(items).map(item=>item.id);
 if(!Array.isArray(edit.before)||edit.before.length!==before.length||!edit.before.every((id,i)=>id===before[i])){
  if(checkPositions)throw Error('The cards changed while you were dragging. Review their latest order and try again.');
  return stage;
 }
 const reordered=items.map(item=>({...item}));
 return CardOrder.move(reordered,edit.sourceId,edit.targetId,edit.after)?{...stage,[edit.collection]:reordered}:stage;
}
function transferSpawn(stage,edit,strict){
 const {spawnId,fromGroupId,toGroupId}=edit,groups=SpawnGroups.list(stage);
 const owner=groups.find(group=>group.spawnIds.includes(spawnId))?.id||'';
 if(owner!==fromGroupId||!stage.spawns.some(spawn=>spawn.id===spawnId)||
    toGroupId!==''&&!groups.some(group=>group.id===toGroupId)){
  if(strict)throw Error('This spawn point or its group changed while you were dragging. Try again.');
  return stage;
 }
 if(fromGroupId===toGroupId)return stage;
 const next={...stage,spawnGroups:stage.spawnGroups.map(group=>({...group}))};
 return SpawnGroups.assign(next,spawnId,toGroupId)?next:stage;
}
function reorderWave(stage,edit,interval,strict){
 const {waveIndex,waveId,waveNumber,before}=edit,waves=stage.config.WaveCfg;
 const wave=Array.isArray(waves)&&Number.isInteger(waveIndex)&&waves[waveIndex];
 if(!wave||wave.Wave!==waveNumber||wave.id!==waveId||!Array.isArray(before)){
  if(strict)throw Error('This wave changed while you were dragging. Select it again before moving cards.');
  return stage;
 }
 const order=Waves.movedGroupOrder(wave,edit,interval,strict);
 if(!order)return stage;
 const WaveCfg=waves.slice();
 WaveCfg[waveIndex]={...wave,editorUnitOrder:order};
 return {...stage,config:{...stage.config,WaveCfg}};
}
function apply(stage,edit,checkPositions=false,{map,interval=.5}={}){
 if(edit?.type==='move')return move(stage,edit.moves,edit.graphId,checkPositions,map);
 if(edit?.type==='order')return reorder(stage,edit,checkPositions);
 if(edit?.type==='spawn-group')return transferSpawn(stage,edit,checkPositions);
 if(edit?.type==='wave-order')return reorderWave(stage,edit,interval,checkPositions);
 throw Error('Choose a stage item to move.');
}
module.exports={apply};
