'use strict';
// Render-only poses, shared across placements. No Cocos scene or gameplay runs.
const Spine=require('../preview/spine-renderer'),Paint=require('./paint'),M=require('./model'),Shadow=require('../../../assets/_script/BuildingShadow');
function create(options){
 const cache=new Map(),shadows=new Map();let closed=false,shadowBytes=0;
 const key=(d,runtime)=>JSON.stringify([runtime,d.source,d.uuid,d.revision,d.skin,d.animation,d.poseTime,d.pages]);
 function release(entry){if(entry.canvas){entry.canvas.width=entry.canvas.height=1;entry.canvas=null;}}
 function ensure(d,runtime){
  const id=key(d,runtime);if(closed||cache.has(id)||!runtime)return;
  const entry={};cache.set(id,entry);
  (async()=>{
   const spine=require(runtime),layers=await Spine.createLayers(spine,[Object.assign({},d,{x:0,y:0,scaleX:1,scaleY:1,rotation:0})]);
   if(closed||cache.get(id)!==entry)return;
   const animation=d.animation||'idle',clip=layers[0].data.findAnimation(animation),time=d.poseTime==='end'&&clip?clip.duration:0;
   Spine.seek(spine,layers,animation,time,false);
   const b=Spine.bounds(spine,layers),padding=2,scale=Math.min(1,2044/b.width,2044/b.height),canvas=Paint.canvas(Math.ceil(b.width*scale)+padding*2,Math.ceil(b.height*scale)+padding*2),ctx=canvas.getContext('2d');
   ctx.setTransform(scale,0,0,-scale,padding-b.minX*scale,padding+b.maxY*scale);Spine.drawWorld(spine,ctx,layers);
   entry.canvas=canvas;entry.bounds={minX:b.minX-padding/scale,maxY:b.maxY+padding/scale,width:canvas.width/scale,height:canvas.height/scale};
   if(options&&options.onLoad)options.onLoad();
  })().catch(error=>{if(!closed&&cache.get(id)===entry&&options&&options.onError)options.onError(error);});
 }
 function prepare(records,runtime){const keep=new Set();for(const r of records)for(const d of r.skeletons||[]){keep.add(key(d,runtime));ensure(d,runtime);}for(const [id,e] of cache)if(!keep.has(id)){release(e);cache.delete(id);}}
 function parts(building,record){
  if(!record)return [];
  const origin=record.origin||building.origin||{x:0,y:0},result=[];
  if(record.shadow&&record.shadow.regions.length)result.push({building,record,shadow:record.shadow,ground:true,y:building.y||0});
  for(const sprite of record.sprites||[])result.push({building,record,sprite,ground:!!sprite.ground,y:M.toWorld(building,{x:sprite.matrix[4]-origin.x,y:sprite.matrix[5]-origin.y}).y});
  for(const skeleton of record.skeletons||[])result.push({building,record,skeleton,ground:!!skeleton.ground,y:M.toWorld(building,{x:skeleton.matrix[4]-origin.x,y:skeleton.matrix[5]-origin.y}).y});
  return result;
 }
 function draw(ctx,part,images,runtime){
  const b=part.building,r=part.record,origin=r.origin||b.origin||{x:0,y:0};ctx.save();Paint.apply(ctx,Paint.matrix(b));ctx.translate(-origin.x,-origin.y);
  if(part.shadow){
   const d=part.shadow,id=JSON.stringify([d.regions,d.opacity]);let entry=shadows.get(id);
   if(!entry){const image=Shadow.raster(d.regions,d.opacity);if(image){const canvas=Paint.canvas(image.pixelWidth,image.pixelHeight),g=canvas.getContext('2d'),pixels=g.createImageData(canvas.width,canvas.height);pixels.data.set(image.pixels);g.putImageData(pixels,0,0);entry={canvas,image:{x:image.x,y:image.y,width:image.width,height:image.height},bytes:canvas.width*canvas.height*4};shadows.set(id,entry);shadowBytes+=entry.bytes;while((shadowBytes>32*1024*1024||shadows.size>8)&&shadows.size>1){const first=shadows.keys().next().value,old=shadows.get(first);shadowBytes-=old.bytes;release(old);shadows.delete(first);}}}
   if(entry){Paint.apply(ctx,d.matrix);ctx.translate(entry.image.x,entry.image.y+entry.image.height);ctx.scale(entry.image.width/entry.canvas.width,-entry.image.height/entry.canvas.height);ctx.drawImage(entry.canvas,0,0);}
  }
  else if(part.sprite)Paint.sprites(ctx,[part.sprite],images);
  else {const d=part.skeleton,e=cache.get(key(d,runtime));if(e&&e.canvas){Paint.apply(ctx,d.matrix);const a=e.bounds;ctx.translate(a.minX,a.maxY);ctx.scale(a.width/e.canvas.width,-a.height/e.canvas.height);ctx.drawImage(e.canvas,0,0);}}
  ctx.restore();
 }
 function hit(building,record,point,images,runtime){
  if(!record)return false;
  const origin=record.origin||building.origin||{x:0,y:0},p=M.toLocal(building,point);p.x+=origin.x;p.y+=origin.y;
  const local=matrix=>{const det=matrix[0]*matrix[3]-matrix[1]*matrix[2];if(Math.abs(det)<1e-9)return null;const x=p.x-matrix[4],y=p.y-matrix[5];return {x:(matrix[3]*x-matrix[2]*y)/det,y:(matrix[0]*y-matrix[1]*x)/det};};
  for(const s of record.sprites||[]){const q=local(s.matrix),a=s.anchor||{x:.5,y:0};if(q&&q.x>=-a.x*s.width&&q.x<=(1-a.x)*s.width&&q.y>=-a.y*s.height&&q.y<=(1-a.y)*s.height)return true;}
  for(const d of record.skeletons||[]){const e=cache.get(key(d,runtime)),q=local(d.matrix);if(!e||!e.canvas||!q)continue;const a=e.bounds,x=(q.x-a.minX)/a.width*e.canvas.width,y=(a.maxY-q.y)/a.height*e.canvas.height;if(x>=0&&y>=0&&x<e.canvas.width&&y<e.canvas.height){try{if(e.canvas.getContext('2d').getImageData(Math.floor(x),Math.floor(y),1,1).data[3]>10)return true;}catch(_){return true;}}}
  return false;
 }
 function clear(){for(const e of cache.values())release(e);cache.clear();for(const e of shadows.values())release(e);shadows.clear();shadowBytes=0;}
 return {prepare,parts,draw,hit,clear,destroy(){closed=true;clear();},stats:()=>({poses:cache.size,ready:Array.from(cache.values()).filter(e=>e.canvas).length,shadowMasks:shadows.size,shadowBytes})};
}
module.exports={create};
