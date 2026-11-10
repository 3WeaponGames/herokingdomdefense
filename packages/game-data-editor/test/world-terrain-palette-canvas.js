'use strict';
// Generated caps use the same exact Field palette in thumbnails, editing and baking.
const Paint=require('../worlds/paint'),M=require('../worlds/model');
async function verify(){
 const checks=[],assert=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);},source=Paint.canvas(6,1),g=source.getContext('2d'),pixels=g.createImageData(6,1);
 pixels.data.set([122,146,72,253,110,105,103,253,0,255,0,6,122,146,72,128,215,250,249,254,255,170,62,228]);g.putImageData(pixels,0,0);
 const before=source.toDataURL(),read=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data,raw=read(source),rule={rgb:[0,0,0],alphaCutoff:12,solidAlpha:246,palette:[{min:[70,100,30],max:[175,200,150],to:[120,151,82],greenOnly:true},{min:[200,230,230],max:[255,255,255],to:[229,255,254]},{min:[220,130,15],max:[255,215,130],to:[255,172,65],opaque:true}]},prepared=Paint.prepareImage(source,{colorShift:rule}),p=read(prepared);
 assert([...p.slice(0,4)].join(',')==='120,151,82,255','Generated Forest cap becomes the exact opaque #789752 Field colour');
 assert([...p.slice(4,7)].join(',')===[...raw.slice(4,7)].join(',')&&p[7]===255,'Rock facets retain their colours while near-opaque generated pixels become solid');
 assert(p[11]===0&&p[15]===128,'Faint fringe is discarded while ordinary translucent edge coverage remains');
 assert([...p.slice(16,20)].join(',')==='229,255,254,255','Snow caps match the exact #e5fffe Field colour');
 assert([...p.slice(20,24)].join(',')==='255,172,65,255','Autumn caps match the exact #ffac41 Field colour');
 assert(source.toDataURL()===before,'Palette preparation never changes the generated source artwork');
 assert(Paint.prepareImage(source,{})===source,'Assets without palette adjustments retain their original image');
 const legacy=read(Paint.prepareImage(source,{colorShift:{rgb:[1,2,3],greenOnly:true}}));assert(legacy[7]===raw[7]&&legacy[4]===raw[4]&&legacy[0]===raw[0]+1&&legacy[1]===raw[1]+2,'Existing RGB colour shifts preserve their alpha and selective tint behavior');
 const image={id:'terrain',url:before,width:6,height:1,anchor:{x:.5,y:.5},colorShift:rule},loaded=await Paint.loadImages({images:{terrain:image}});assert([...read(loaded.terrain.image).slice(0,4)].join(',')==='120,151,82,255','The bake image loader applies the same exact palette adjustment');
 const map=M.createMap('palette','Palette','forest','terrain');map.size=map.playable={width:6,height:1};const bake=await Paint.bake({map,images:{terrain:image}}),baked=new Image();await new Promise((resolve,reject)=>{baked.onload=resolve;baked.onerror=reject;baked.src=bake.files.find(f=>f.name==='ground-0-0').png;});const target=Paint.canvas(6,1);target.getContext('2d').drawImage(baked,0,0);const out=read(target);assert(Array.from({length:6},(_,i)=>[...out.slice(i*4,i*4+4)].join(',')).includes('120,151,82,255'),'Saved ground artwork retains the exact matched Field colour');
 return {checks,projectWrites:0};
}
module.exports={verify};
