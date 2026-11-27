'use strict';
const Paint=require('./paint');

// Stage artwork in backing pixels. Keep the normal world-space drawing path
// for uncached layers and views too large to fit in the editor's raster budget.
function create(){
 const layers=new Map(),budget=48*1024*1024;
 let view=null,bytes=0;
 const same=(a,b)=>a&&a.length===b.length&&a.every((value,i)=>value===b[i]);
 function remove(key,entry){entry.canvas.width=entry.canvas.height=1;bytes-=entry.bytes;layers.delete(key);}
 function clear(){for(const [key,entry] of layers)remove(key,entry);view=null;}
 function prepare(ctx,inputs){
  const {a,b,c,d,e,f}=ctx.getTransform();
  const signature=[ctx.canvas.width,ctx.canvas.height,a,b,c,d,e,f,...inputs];
  if(!same(view,signature)){clear();view=signature;}
 }
 function draw(ctx,key,inputs,paint){
  let entry=layers.get(key);
  if(entry&&!same(entry.inputs,inputs)){remove(key,entry);entry=null;}
  if(!entry){
   const width=ctx.canvas.width,height=ctx.canvas.height,size=width*height*4;
   if(bytes+size>budget){paint(ctx);return;}
   const canvas=Paint.canvas(width,height),out=canvas.getContext('2d');
   out.setTransform(ctx.getTransform());
   entry={canvas,inputs,bytes:size};layers.set(key,entry);bytes+=size;
   try{paint(out);}catch(error){remove(key,entry);throw error;}
  }
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=false;
  ctx.drawImage(entry.canvas,0,0);ctx.restore();
 }
 return {prepare,draw,clear};
}
module.exports={create};
