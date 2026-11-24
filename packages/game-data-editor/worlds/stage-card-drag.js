'use strict';
const Order=require('./stage-card-order');
function bind(list,rows,options){
 let drag=null;
 const stage=options.stage,items=options.items,ids=value=>Order.ordered(items(value)).map(item=>item.id),same=(a,b)=>a.length===b.length&&a.every((id,index)=>id===b[index]);
 const move=options.move||((value,sourceId,targetId,after)=>Order.move(items(value),sourceId,targetId,after));
 function clear(){for(const row of rows)row.node.classList.remove('world-card-drag-source','world-card-drop-before','world-card-drop-after');list.classList.remove('world-card-dragging','world-card-drag-inline');}
 function valid(){return drag&&stage().id===drag.stageId&&same(ids(stage()),drag.before);}
 const inline=()=>options.grid&&rows.length>1&&Number.isFinite(rows[0].node.offsetTop)&&rows[0].node.offsetTop===rows[1].node.offsetTop;
 function dropAfter(event,node,sideBySide){
  const rect=node.getBoundingClientRect();
  return sideBySide?event.clientX>=rect.left+rect.width/2:event.clientY>=rect.top+rect.height/2;
 }
 function place(sourceId,targetId,after,stageId,before){
  if(sourceId===targetId)return;
  options.cancelDrag();
  return options.edit(value=>{if(value.id!==stageId||!same(ids(value),before))throw Error('This card list changed while you were dragging. Review the latest list and try again.');move(value,sourceId,targetId,after);});
 }
 for(const row of rows){
  const node=row.node,handle=row.handle||node;
  handle.draggable=!options.busy();if(handle===node)node.classList.add('world-stage-draggable');
  handle.title='Drag to reorder cards. Alt + ↑ / ↓ moves one position.';
  handle.ondragstart=event=>{if(options.busy()){event.preventDefault();return;}options.cancelDrag();drag={id:row.id,stageId:stage().id,before:ids(stage())};clear();node.classList.add('world-card-drag-source');list.classList.add('world-card-dragging');if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(row.id));}event.stopPropagation();};
  node.ondragover=event=>{
   clear();
   if(options.busy()||!valid()||drag.id===row.id)return;
   event.preventDefault();event.stopPropagation();
   if(event.dataTransfer)event.dataTransfer.dropEffect='move';
   const sideBySide=inline();
   node.classList.add(dropAfter(event,node,sideBySide)?'world-card-drop-after':'world-card-drop-before');
   if(sideBySide)list.classList.add('world-card-drag-inline');
   const source=rows.find(item=>item.id===drag.id);
   if(source)source.node.classList.add('world-card-drag-source');
   list.classList.add('world-card-dragging');
  };
  node.ondrop=event=>{
   if(!drag)return;
   event.preventDefault();event.stopPropagation();
   const active=!options.busy()&&valid()?drag:null;
   drag=null;clear();
   if(active)return place(active.id,row.id,dropAfter(event,node,inline()),active.stageId,active.before);
  };
  handle.ondragend=()=>{drag=null;clear();};
  handle.onkeydown=event=>{if(!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!['ArrowUp','ArrowDown'].includes(event.key)||options.busy())return;const before=ids(stage()),at=before.indexOf(row.id),step=event.key==='ArrowUp'?-1:1,target=before[at+step];if(target===undefined)return;event.preventDefault();event.stopPropagation();return place(row.id,target,step>0,stage().id,before);};
 }
 list.ondragleave=event=>{if(!list.contains(event.relatedTarget))clear();};
 return {cancel(){drag=null;clear();}};
}
module.exports={bind};
