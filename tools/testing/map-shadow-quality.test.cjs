'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Quality=require('../../assets/_script/MapShadowQuality'),FX=require('../../assets/_script/BuildingDropShadow');
test('map shadow sampling follows the placed footprint while ordinary scenery shares a bounded texture',()=>{
 assert.deepEqual(Quality.forBounds(32,64,1),Quality.forBounds(32,64,2));assert.equal(Quality.forBounds(100,150,.7).edge,256);assert.equal(Quality.forBounds(100,150,1.3).edge,256);
 assert.equal(Quality.forBounds(1726,911,.87).edge,2048);assert.equal(Quality.forBounds(128,128,8).edge,1024);assert.equal(Quality.forBounds(20000,16000,1).edge,2048);assert.equal(Quality.forBounds(256,100,1).edge,256);
 for(const scale of [.2,.5,.87]){const quality=Quality.forBounds(1726,911,scale),worldTexel=scale/quality.density;assert(worldTexel<=1,'large cliff sampling stays within one world unit per texel');assert(quality.edge<=2048);}
});
test('large map projections retain high-resolution edges without changing the existing structure limits',()=>{
 const source={alpha:new Uint8Array(1536*128).fill(255),pixelWidth:1536,pixelHeight:128,x:-768,y:0,width:1536,height:128},preset=FX.settings({straighten:0}),before=JSON.stringify(preset),quality=Quality.forBounds(source.width,source.height,1);
 assert.throws(()=>FX.raster(source,preset),/Invalid building shadow/);const image=FX.raster(source,preset,Quality.rasterOptions(quality));assert(image.pixelWidth>1024,'map shadows no longer shrink into a 256/1024-pixel outline');assert(image.width/image.pixelWidth<1.1);assert(image.pixels.some((v,i)=>i%4===3&&v));assert.equal(JSON.stringify(preset),before);assert(image.pixelWidth<=4096&&image.pixelHeight<=4096);
});
test('edge straightening is limited in world units instead of removing proportionally larger cliff corners',()=>{
 const calls=[],api={};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/BuildingDropShadow.js'),'utf8'),{exports:api,require:name=>{assert.equal(name,'./ShadowOutline');return{raster(source){calls.push(source);return null;}};}});
 const source={alpha:new Uint8Array(1024*512).fill(255),pixelWidth:1024,pixelHeight:512,x:-1024,y:0,width:2048,height:1024};
 for(const scale of [.5,1,2]){const q=Quality.forBounds(source.width,source.height,scale);api.raster(source,FX.defaults,Quality.rasterOptions(q));const projected=calls.at(-1),unit=Math.max(projected.width/projected.pixelWidth,projected.height/projected.pixelHeight);assert(Math.abs(projected.detailScale*unit*q.metric-128)<1e-5,'the same straightening slider uses the same physical detail at scale '+scale);assert.equal(Quality.rasterOptions(q).sizeScale*q.metric,1,'softness also retains its world size');}
});
