'use strict';
const Order=require('./stage-card-order');

// CSS grid rows start together but can have very different card heights.
// Resolve a slot even when the pointer lands in a gutter or under a short card.
function gridSlot(rows,x,y){
 const lines=[];
 for(const row of rows){
  const {left,top,width,height}=row.node.getBoundingClientRect();
  let line=lines[lines.length-1];
  if(!line||Math.abs(top-line.top)>1){line={top,bottom:top,cards:[]};lines.push(line);}
  line.bottom=Math.max(line.bottom,top+height);
  line.cards.push({row,left,right:left+width,middle:left+width/2,top,height});
 }
 const inline=lines.some(line=>line.cards.length>1);
 for(const [i,line] of lines.entries()){
  const next=lines[i+1],cards=line.cards;
  if(next&&y>line.bottom&&y<next.top){
   const after=y<(line.bottom+next.top)/2;
   return {row:after?cards[cards.length-1].row:next.cards[0].row,after,inline};
  }
  if(!next||y<=line.bottom){
   const card=cards.find((box,index)=>index===cards.length-1||x<(box.right+cards[index+1].left)/2);
   return {row:card.row,after:inline?x>=card.middle:y>=card.top+card.height/2,inline};
  }
 }
 return null;
}

function bind(list,rows,options){
 let drag=null,marker=null;
 const stage=options.stage,items=options.items,ids=value=>Order.ordered(items(value)).map(item=>item.id),same=(a,b)=>a.length===b.length&&a.every((id,index)=>id===b[index]);
 const move=options.move||((value,sourceId,targetId,after)=>Order.move(items(value),sourceId,targetId,after));
 function mark(target){
  if(marker?.row===target?.row&&marker?.after===target?.after&&marker?.inline===target?.inline)return;
  if(marker)marker.row.node.classList.remove('world-card-drop-before','world-card-drop-after');
  list.classList.remove('world-card-drag-inline');
  marker=target;
  if(!marker)return;
  marker.row.node.classList.add(marker.after?'world-card-drop-after':'world-card-drop-before');
  if(marker.inline)list.classList.add('world-card-drag-inline');
 }
 function end(){
  if(drag)drag.row.node.classList.remove('world-card-drag-source');
  drag=null;
  mark(null);
  list.classList.remove('world-card-dragging');
 }
 function valid(){
  if(!drag||options.busy())return false;
  const current=stage();
  return current.id===drag.stageId&&(current===drag.value||same(ids(current),drag.before));
 }
 function targetAt(event,row){
  if(options.grid&&Number.isFinite(event.clientX)&&Number.isFinite(event.clientY))return gridSlot(rows,event.clientX,event.clientY);
  if(row){
   const rect=row.node.getBoundingClientRect();
   return {row,after:event.clientY>=rect.top+rect.height/2,inline:false};
  }
 }
 function place(sourceId,targetId,after,stageId,before){
  if(sourceId===targetId)return;
  options.cancelDrag();
  if(options.commit)return options.commit({sourceId,targetId,after,stageId,before});
  return options.edit(value=>{if(value.id!==stageId||!same(ids(value),before))throw Error('This card list changed while you were dragging. Review the latest list and try again.');move(value,sourceId,targetId,after);});
 }
 function dragOver(event,row){
  if(!valid()){mark(null);return;}
  const target=targetAt(event,row);
  if(!target)return;
  event.preventDefault();event.stopPropagation();
  if(event.dataTransfer)event.dataTransfer.dropEffect='move';
  mark(drag.row===target.row?null:target);
 }
 function drop(event,row){
  if(!drag)return;
  event.preventDefault();event.stopPropagation();
  const active=drag,target=valid()?targetAt(event,row):null;
  end();
  if(target)return place(active.row.id,target.row.id,target.after,active.stageId,active.before);
 }
 for(const row of rows){
  const node=row.node,handle=row.handle||node;
  handle.draggable=!options.busy();if(handle===node)node.classList.add('world-stage-draggable');
  handle.title='Drag to reorder cards. Alt + ↑ / ↓ moves one position.';
  handle.ondragstart=event=>{
   if(options.busy()){event.preventDefault();return;}
   options.cancelDrag();end();
   const value=stage();
   drag={row,value,stageId:value.id,before:ids(value)};
   node.classList.add('world-card-drag-source');list.classList.add('world-card-dragging');
   if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(row.id));}
   event.stopPropagation();
  };
  node.ondragover=event=>dragOver(event,row);
  node.ondrop=event=>drop(event,row);
  handle.ondragend=end;
  handle.onkeydown=event=>{if(!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!['ArrowUp','ArrowDown'].includes(event.key)||options.busy())return;const before=ids(stage()),at=before.indexOf(row.id),step=event.key==='ArrowUp'?-1:1,target=before[at+step];if(target===undefined)return;event.preventDefault();event.stopPropagation();return place(row.id,target,step>0,stage().id,before);};
 }
 if(options.grid){list.ondragover=dragOver;list.ondrop=drop;}
 list.ondragleave=event=>{
  if(list.contains(event.relatedTarget))return;
  if(options.grid){
   const {left,right,top,bottom}=list.getBoundingClientRect(),{clientX:x,clientY:y}=event;
   if(x>=left&&x<right&&y>=top&&y<bottom)return;
  }
  mark(null);
 };
 return {cancel:end};
}
module.exports={bind};
