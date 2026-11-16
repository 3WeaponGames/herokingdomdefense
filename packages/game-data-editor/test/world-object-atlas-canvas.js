'use strict';
// Real PNG/Canvas verification of packed source crops, not just rectangle plans.
const M=require('../worlds/model'),Paint=require('../worlds/paint'),Baker=require('../worlds/baker');
async function verify(){
 const checks=[],check=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 function asset(id,w,h,nativeScale){const c=Paint.canvas(w,h),g=c.getContext('2d');g.fillStyle='#f00';g.fillRect(0,0,w,h);g.fillStyle='#00f';g.fillRect(Math.floor(w/2),0,w,h);g.fillStyle='#0f0';g.fillRect(0,Math.floor(h/2),w,Math.ceil(h/2));return{id,name:id,width:w,height:h,nativeScale,anchor:{x:.3,y:.2},depth:'world',url:c.toDataURL()};}
 const assets=[asset('tall',512,700),asset('native',700,384,.45),asset('wide',2500,90)];let map=M.createLayer(M.createMap('atlas-pixels','Atlas pixels','forest'),'Objects');map.size={width:160,height:240};map.playable={...map.size};
 for(const a of assets)map=M.place(map,map.layers[1].id,a,{x:0,y:0},1,1,0).map;
 const masked=M.clone(map.layers[1].objects[0]);masked.id='masked';masked.mask=[{size:80,shape:'square',hardness:1,opacity:1,op:'erase',points:[{x:0,y:100}]}];map.layers[1].objects.push(masked);
 const spec=Baker.spec('',map,assets),before=JSON.stringify(map),images=await Paint.loadImages(spec),baked=await Paint.bake(spec),atlases={};
 for(const file of baked.files.filter(f=>f.name.startsWith('objects-'))){const img=new Image();await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src=file.png;});atlases[file.name]=img;check(img.width<=2048&&img.height<=2048,'packed image respects texture limit: '+file.name);}
 for(const o of map.layers[1].objects){const source=Paint.objectImage(o,images),small=o.nativeSize===true&&source.nativeScale<1,w=small?Math.ceil(source.width):source.image.naturalWidth||source.image.width,h=small?Math.ceil(source.height):source.image.naturalHeight||source.image.height,expected=Paint.canvas(w,h),actual=Paint.canvas(w,h);Paint.smooth(expected.getContext('2d'));expected.getContext('2d').drawImage(source.image,0,0,w,h);const frames=baked.assets[Paint.assetKey(o)].frames;
  for(const f of frames)actual.getContext('2d').drawImage(atlases[f.atlas],f.trimX,f.trimY,f.width,f.height,f.sx,f.sy,f.width,f.height);
  const a=actual.getContext('2d').getImageData(0,0,w,h).data,e=expected.getContext('2d').getImageData(0,0,w,h).data;check(a.every((value,i)=>Math.abs(value-e[i])<=1),'atlas reconstructs unchanged source pixels: '+o.id);check(Math.abs(Math.min(...frames.map(f=>f.x))+source.anchor.x*source.width)<1e-8,'atlas preserves world anchor: '+o.id);
 }
 check(baked.assets[Paint.assetKey(map.layers[1].objects[2])].frames.length===2,'oversized artwork retains separate source slices');check(JSON.stringify(map)===before,'packing never edits authoring objects, masks or transforms');
 Paint.clearMasks();return{checks};
}
module.exports={verify};
