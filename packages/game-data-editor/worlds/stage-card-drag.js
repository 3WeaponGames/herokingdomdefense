'use strict';
const Order=require('./stage-card-order');
function bind(list,rows,options){
 let drag=null;
 const stage=options.stage,items=options.items,ids=value=>Order.ordered(items(value)).map(item=>item.id),same=(a,b)=>a.length===b.length&&a.every((id,index)=>id===b[index]);
 function clear(){for(const row of rows)row.node.classList.remove('world-card-drag-source','world-card-drop-before','world-card-drop-after');list.classList.remove('world-card-dragging');}
 function valid(){return drag&&stage().id===drag.stageId&&same(ids(stage()),drag.before);}
 function place(sourceId,targetId,after,stageId,before){
  if(sourceId===targetId)return;
  options.cancelDrag();
  return options.edit(value=>{if(value.id!==stageId||!same(ids(value),before))throw Error('This card list changed while you were dragging. Review the latest list and try again.');Order.move(items(value),sourceId,targetId,after);});
 }
 for(const row of rows){
  const node=row.node;node.draggable=!options.busy();node.classList.add('world-stage-draggable');node.title='Drag above or below another card to rearrange. Alt + ↑ / ↓ also moves this card.';
  node.ondragstart=event=>{if(options.busy()){event.preventDefault();return;}options.cancelDrag();drag={id:row.id,stageId:stage().id,before:ids(stage())};clear();node.classList.add('world-card-drag-source');list.classList.add('world-card-dragging');if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(row.id));}event.stopPropagation();};
  node.ondragover=event=>{clear();if(!valid()||options.busy()||drag.id===row.id)return;event.preventDefault();event.stopPropagation();if(event.dataTransfer)event.dataTransfer.dropEffect='move';const rect=node.getBoundingClientRect();node.classList.add(event.clientY<rect.top+rect.height/2?'world-card-drop-before':'world-card-drop-after');const source=rows.find(item=>item.id===drag.id);if(source)source.node.classList.add('world-card-drag-source');list.classList.add('world-card-dragging');};
  node.ondrop=event=>{event.preventDefault();event.stopPropagation();const active=valid()&&!options.busy()?drag:null,rect=node.getBoundingClientRect(),after=event.clientY>=rect.top+rect.height/2;drag=null;clear();if(active)return place(active.id,row.id,after,active.stageId,active.before);};
  node.ondragend=()=>{drag=null;clear();};
  node.onkeydown=event=>{if(!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!['ArrowUp','ArrowDown'].includes(event.key)||options.busy())return;const before=ids(stage()),at=before.indexOf(row.id),step=event.key==='ArrowUp'?-1:1,target=before[at+step];if(target===undefined)return;event.preventDefault();event.stopPropagation();return place(row.id,target,step>0,stage().id,before);};
 }
 list.ondragleave=event=>{if(!list.contains(event.relatedTarget))clear();};
 return {cancel(){drag=null;clear();}};
}
module.exports={bind};
