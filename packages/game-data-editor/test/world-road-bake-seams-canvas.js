'use strict';
// Exact export coverage is per-call. All source pixels and drafts stay untouched.
const M=require('../worlds/model'),Paint=require('../worlds/paint'),Baker=require('../worlds/baker'),Roads=require('../worlds/roads');
async function verify(){
 const checks=[],reports=[],assert=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 function tile(w,h,color){const c=Paint.canvas(w,h),g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,w,h);return c.toDataURL();}
 const library=[{id:'road',url:tile(32,32,'#ac8d69'),width:32,height:32,anchor:{x:.5,y:0}},{id:'edge',url:tile(64,12,'#425741'),width:64,height:12,anchor:{x:.5,y:0}},{id:'field',url:tile(16,16,'#6d9754'),width:16,height:16,anchor:{x:.5,y:0}}],images=await Paint.loadImages({images:Object.fromEntries(library.map(a=>[a.id,a]))});
 let map=M.createMap('seams','Export seams','forest');map.size={width:2304,height:512};map.playable=M.clone(map.size);map.ground.foundation.baseAsset='field';map=M.stroke(map,'roads',{mode:'road',assetId:'road',edgeAssetId:'edge',edgeStyle:'textured',edgeSmoothing:.6,edgeWidthMode:'fixed',size:120,shape:'round',hardness:1,opacity:1,op:'paint',points:[{x:-1060,y:-100},{x:-300,y:-70},{x:320,y:130},{x:930,y:-90},{x:1100,y:30}]});
 async function exportCheck(value,label){
  const before=JSON.stringify(value),W=value.size.width,H=value.size.height,full=Paint.canvas(W,H),g=full.getContext('2d'),view=[1,0,0,-1,W/2,H/2];g.setTransform.apply(g,view);Paint.ground(g,value,images,view,null,{canonicalCoverage:true});
  const baked=await Paint.bake(Baker.spec('',value,library)),stitched=Paint.canvas(W,H),s=stitched.getContext('2d');
  for(const part of baked.ground){const file=baked.files.find(f=>f.name===part.name),image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=file.png;});s.drawImage(image,part.x+W/2-part.width/2,H/2-part.y-part.height/2);}
  const a=g.getImageData(0,0,W,H).data,b=s.getImageData(0,0,W,H).data;let bad=0,max=0;
  for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d>3)bad++;max=Math.max(max,d);}
  assert(bad===0,label+': actual baked PNG chunks match the complete export render');assert(baked.ground.length===2,label+': output uses bounded2048px ground textures');assert(JSON.stringify(value)===before,label+': per-call accuracy never modifies or serializes the map');
  reports.push({label,bad,max});full.width=full.height=stitched.width=stitched.height=1;
 }
 await exportCheck(map,'identity');
 let rotated=M.clone(map);rotated.ground.roads.transform={x:15,y:-5,scale:1.1,angle:9};await exportCheck(rotated,'rotated scaled layer');
 let erased=M.stroke(map,'roads',{op:'erase',size:70,shape:'round',hardness:.4,opacity:.5,points:[{x:840,y:-130},{x:980,y:70}]});await exportCheck(erased,'partial soft erase');
 assert(Roads.stats().bytes<=24*1024*1024,'accurate baking retains the bounded road material cache');Roads.clear();return {checks,reports};
}
module.exports={verify};
