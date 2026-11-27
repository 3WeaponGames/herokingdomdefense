'use strict';
const CardOrder=require('./stage-card-order');

// A placement move touches only coordinates. Leave templates and unrelated draft
// records shared so a drag does not copy or transfer the entire stage.
function move(stage, moves, graphId, checkPositions){
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
   if(checkPositions&&(placement.x!==change.beforeX||placement.y!==change.beforeY))throw Error('This placement changed while you were dragging. Review its latest position and try again.');
   if(placement.x===change.x&&placement.y===change.y)return placement;
   changed=true;
   return {...placement,x:change.x,y:change.y};
  });
  return changed?entries:placements;
 }
 if(graphId==null){
  for(const [kind,field] of [['building','buildings'],['special','specials']]){
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
function apply(stage,edit,checkPositions=false){
 if(edit?.type==='move')return move(stage,edit.moves,edit.graphId,checkPositions);
 if(edit?.type==='order')return reorder(stage,edit,checkPositions);
 throw Error('Choose a placement, path point, or card to move.');
}
module.exports={apply};
