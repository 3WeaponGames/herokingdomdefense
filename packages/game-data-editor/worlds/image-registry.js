'use strict';
const Paint=require('./paint');
// Panel-owned decoded artwork. Unreferenced or replaced images are cancelled,
// and late image events cannot redraw a different map or a closed panel.
let serial=0;
function create(options){
 const records=Object.create(null),entries=new Map(),prefix=Date.now().toString(36)+'-'+(++serial).toString(36);
 let epoch=0,destroyed=false;
 function url(value,revision){
  if(typeof value!=='string')return value;
  try{const parsed=new URL(value);if(!['file:','http:','https:'].includes(parsed.protocol))return value;parsed.searchParams.set('hkd-preview',prefix+'-'+epoch);if(revision)parsed.searchParams.set('hkd-source',String(revision));return parsed.href;}catch(_){return value;}
 }
 function signature(source){
  const a=source.anchor||{x:.5,y:0};
  return JSON.stringify([source.url,source.sha256,source.x,source.y,source.width,source.height,source.rawWidth,source.rawHeight,source.offsetX,source.offsetY,source.rotated,source.textureWidth,source.textureHeight,a.x,a.y,source.maxMaskEdge,source.colorShift,source.nativeScale]);
 }
 function current(id,entry){return !destroyed&&entries.get(id)===entry;}
 function notify(id,error){if(!destroyed&&options.onError)options.onError(id,error);}
 function cancel(id,entry){
  entry.image.onload=null;entry.image.onerror=null;entry.callbacks.clear();
  try{entry.image.src='';}catch(_){}
  entries.delete(id);delete records[id];
 }
 function ensure(id,onload){
  if(destroyed)return;
  const source=options.lookup(id),old=entries.get(id);
  if(!source||typeof source.url!=='string'){if(old)cancel(id,old);return;}
  const key=signature(source);
  if(old&&old.signature===key){if(onload&&!old.ready&&!old.failed)old.callbacks.add(onload);return old.record;}
  if(old)cancel(id,old);
  const image=new Image(),record=Object.assign({},source,{image,maxMaskEdge:Number.isFinite(source.maxMaskEdge)&&source.maxMaskEdge>0?Math.min(2048,source.maxMaskEdge):2048}),entry={image,record,signature:key,callbacks:new Set(),ready:false,failed:false};
  if(onload)entry.callbacks.add(onload);entries.set(id,entry);records[id]=record;
  image.onload=()=>{
   if(!current(id,entry))return;
   try{record.image=Paint.prepareImage(image,source);}catch(error){entry.failed=true;entry.callbacks.clear();notify(id,error);return;}
   entry.ready=true;const callbacks=Array.from(entry.callbacks);entry.callbacks.clear();
   if(options.onLoad)try{options.onLoad(id,record);}catch(error){notify(id,error);}
   for(const callback of callbacks){if(!current(id,entry))break;try{callback();}catch(error){notify(id,error);}}
  };
  image.onerror=()=>{if(!current(id,entry))return;entry.failed=true;entry.callbacks.clear();notify(id,Error('Unable to load image '+id));};
  image.src=url(source.url,source.sha256);return record;
 }
 function retain(wanted){if(destroyed)return;for(const [id,entry]of entries)if(!wanted.has(id))cancel(id,entry);}
 function clear(){for(const [id,entry]of entries)cancel(id,entry);epoch++;}
 function destroy(){if(destroyed)return;destroyed=true;clear();}
 return {records,ensure,retain,clear,url,destroy};
}
module.exports={create};
