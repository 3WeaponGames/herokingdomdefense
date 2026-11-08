'use strict';
// Native Canvas regression checks; all data is in memory and no game is loaded.
const M=require('../worlds/model'),Paint=require('../worlds/paint'),Baker=require('../worlds/baker');
async function verify(){
 const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);},source=Paint.canvas(20,20),g=source.getContext('2d');g.fillStyle='rgba(255,30,0,.5)';g.fillRect(0,0,20,20);
 const picture=new Image();await new Promise((resolve,reject)=>{picture.onload=resolve;picture.onerror=reject;picture.src=source.toDataURL();});
 const images={a:{image:picture,width:20,height:20,anchor:{x:.5,y:.5}}},stroke={size:30,shape:'square',hardness:1,opacity:.5,op:'erase',points:[{x:0,y:0}]},original=g.getImageData(10,10,1,1).data[3];
 for(const repeats of [1,4]){const mask=[stroke];for(let i=0;i<repeats;i++)mask.push(Object.assign({},stroke,{op:'paint',opacity:1}));const output=Paint.objectImage({id:'restore-'+repeats,assetId:'a',mask},images),alpha=output.image.getContext('2d').getImageData(10,10,1,1).data[3];check(alpha===original,'image restore preserves intrinsic alpha after '+repeats+' pass(es)');}
 const partial=Paint.objectImage({id:'partial',assetId:'a',mask:[stroke,Object.assign({},stroke,{op:'paint',opacity:.5})]},images).image.getContext('2d').getImageData(10,10,1,1).data[3];check(partial>=95&&partial<=97,'partial restoration blends the mask without accumulating source opacity');
 check(g.getImageData(10,10,1,1).data[3]===original,'restoration keeps the original pixels untouched');
 const red=Paint.canvas(30,30),blue=Paint.canvas(30,30);red.getContext('2d').fillStyle='#ff0000';red.getContext('2d').fillRect(0,0,30,30);blue.getContext('2d').fillStyle='#0000ff';blue.getContext('2d').fillRect(0,0,30,30);
 let map=M.createLayer(M.createMap('thumb','Thumbnail','forest'),'Trees');map.size={width:40,height:40};map.playable={width:40,height:40};
 const assets=[{id:'red',name:'Red',url:red.toDataURL(),width:30,height:30,anchor:{x:.5,y:.5},depth:'world'},{id:'blue',name:'Blue',url:blue.toDataURL(),width:30,height:30,anchor:{x:.5,y:.5},depth:'world'}];
 map=M.place(map,map.layers[1].id,assets[0],{x:0,y:0},1,1,0).map;map.layers[1].objects[0].ground={x:0,y:-10};map=M.place(map,map.layers[1].id,assets[1],{x:0,y:-1},1,1,0).map;
 const baked=await Paint.bake(Baker.spec('',map,assets)),thumb=baked.files.find(f=>f.name==='thumbnail'),image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=thumb.png;});const preview=Paint.canvas(192,312),ctx=preview.getContext('2d');ctx.drawImage(image,0,0);const pixel=ctx.getImageData(96,156,1,1).data;
 check(pixel[0]>240&&pixel[2]<10,'thumbnail depth order follows the authored ground pivot');
 Paint.clearMasks();return {checks};
}
module.exports={verify};
