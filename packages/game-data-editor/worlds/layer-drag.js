'use strict';
// Native, panel-local drag/drop. Hover never edits a map or creates history.
const MIME='application/x-hkd-layer-tree';
function create(list,options){
 let gesture=null,finishing=false,destroyed=false,frame=null,expandTimer=null,expandKey=null,indicator=null,lastPoint=null;
 const win=list.ownerDocument.defaultView,doc=list.ownerDocument;
 const context=()=>JSON.stringify(options.context());
 function describe(row){if(!row||!list.contains(row))return null;return row.dataset.object?{kind:'object',id:row.dataset.object,layerId:row.dataset.ownerLayer,ground:row.dataset.ground==='true'}:row.dataset.layer?{kind:'layer',id:row.dataset.layer,ground:row.dataset.ground==='true'}:null;}
 function rowAt(target){return target&&target.closest&&target.closest('.world-object-row,.world-layer');}
 function clearIndicator(){if(indicator){indicator.classList.remove('world-layer-drop-before','world-layer-drop-after','world-layer-drop-inside');indicator=null;}}
 function clearExpand(){if(expandTimer!==null)win.clearTimeout(expandTimer);expandTimer=null;expandKey=null;}
 function stopScroll(){if(frame!==null)win.cancelAnimationFrame(frame);frame=null;lastPoint=null;}
 function clear(){clearIndicator();clearExpand();stopScroll();if(gesture){gesture.row.classList.remove('world-layer-drag-source');gesture.row.removeAttribute('aria-grabbed');}gesture=null;list.classList.remove('world-layer-dragging');}
 function cancel(){if(!gesture)return;clear();if(options.end)options.end();}
 function valid(){return !!gesture&&!destroyed&&gesture.context===context()&&options.enabled();}
 function targetAt(target,y){
  if(!gesture)return null;let row=rowAt(target),entry=describe(row);if(!entry||entry.ground!==gesture.payload.ground)return null;
  let marker=row,position='inside',result;
  if(gesture.payload.kind==='layer'){
   const group=row.closest('.world-layer-group');if(!group)return null;
   const header=group.querySelector('.world-layer'),rect=entry.kind==='layer'?header.getBoundingClientRect():group.getBoundingClientRect();
   position=y<rect.top+rect.height/2?'before':'after';marker=group;
   result={kind:'layer',targetId:header.dataset.layer,ground:entry.ground,position};
  }else{
   if(entry.kind==='object'){const rect=row.getBoundingClientRect();position=y<rect.top+rect.height/2?'before':'after';}
   result={kind:'object',targetLayerId:entry.kind==='layer'?entry.id:entry.layerId,targetObjectId:entry.kind==='object'?entry.id:null,ground:entry.ground,position};
  }
  return options.accept(gesture.payload,result)?{request:result,marker,row}:null;
 }
 function mark(target){clearIndicator();if(!target){clearExpand();return;}indicator=target.marker;indicator.classList.add('world-layer-drop-'+target.request.position);
  const request=target.request,key=request.kind==='object'&&!request.targetObjectId?request.targetLayerId:null;
  if(!key||options.expanded(key,request.ground)){clearExpand();return;}
  if(expandKey===key)return;clearExpand();expandKey=key;
  expandTimer=win.setTimeout(()=>{expandTimer=null;expandKey=null;if(!valid())return;options.expand(key,request.ground);},500);
 }
 function scroll(){frame=null;if(!valid()||!lastPoint)return;
  const rect=list.getBoundingClientRect(),p=lastPoint;if(p.x<rect.left||p.x>rect.right||p.y<rect.top-10||p.y>rect.bottom+10)return;
  const edge=Math.min(42,rect.height/3),delta=p.y<rect.top+edge?-Math.ceil((rect.top+edge-p.y)/edge*16):p.y>rect.bottom-edge?Math.ceil((p.y-rect.bottom+edge)/edge*16):0;
  if(!delta)return;const before=list.scrollTop;list.scrollTop+=delta;if(list.scrollTop===before)return;mark(targetAt(doc.elementFromPoint(p.x,p.y),p.y));
  frame=win.requestAnimationFrame(scroll);
 }
 function track(event){lastPoint={x:event.clientX,y:event.clientY};if(frame===null)frame=win.requestAnimationFrame(scroll);}
 function start(event){
  if(destroyed||finishing||!options.enabled())return;const row=rowAt(event.target),entry=describe(row);
  const control=event.target.closest&&event.target.closest('button,input,textarea,select,[contenteditable=true]');
  if(!entry||control&&!control.classList.contains('world-layer-name')&&!control.classList.contains('world-object-name')){event.preventDefault();return;}
  if(!event.dataTransfer)return;cancel();
  try{
   const payload=options.begin(entry);if(!payload){event.preventDefault();return;}
   const token=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
   event.dataTransfer.setData(MIME,token);event.dataTransfer.effectAllowed='move';
   gesture={payload,context:context(),token,row};row.classList.add('world-layer-drag-source');row.setAttribute('aria-grabbed','true');list.classList.add('world-layer-dragging');event.stopPropagation();
  }catch(error){event.preventDefault();clear();options.error(error);}
 }
 function over(event){
  if(!gesture)return;if(!valid()){cancel();return;}
  const target=targetAt(event.target,event.clientY);event.preventDefault();event.stopPropagation();if(event.dataTransfer)event.dataTransfer.dropEffect=target?'move':'none';mark(target);track(event);
 }
 function leave(event){if(gesture&&(!event.relatedTarget||!list.contains(event.relatedTarget))){clearIndicator();clearExpand();stopScroll();}}
 function drop(event){
  event.preventDefault();if(!gesture)return;event.stopPropagation();
  if(!valid()||!event.dataTransfer||event.dataTransfer.getData(MIME)!==gesture.token){cancel();return;}
  const target=targetAt(event.target,event.clientY);if(!target){cancel();return;}
  const payload=gesture.payload,stamp=gesture.context;clear();finishing=true;
  Promise.resolve().then(()=>options.commit(payload,target.request,stamp)).catch(options.error).finally(()=>{finishing=false;if(options.end)options.end();});
 }
 function key(event){if(gesture&&event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();}}
 const blur=()=>cancel(),dragend=()=>cancel();
 list.addEventListener('dragstart',start);list.addEventListener('dragover',over);list.addEventListener('dragleave',leave);list.addEventListener('drop',drop);
 win.addEventListener('dragend',dragend);win.addEventListener('keydown',key,true);win.addEventListener('blur',blur);
 return {active:()=>!!gesture||finishing,cancel,destroy(){if(destroyed)return;destroyed=true;cancel();stopScroll();clearExpand();list.removeEventListener('dragstart',start);list.removeEventListener('dragover',over);list.removeEventListener('dragleave',leave);list.removeEventListener('drop',drop);win.removeEventListener('dragend',dragend);win.removeEventListener('keydown',key,true);win.removeEventListener('blur',blur);}};
}
module.exports={create,MIME};
