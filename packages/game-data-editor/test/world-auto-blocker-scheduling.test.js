'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
function raster(cost,cancel){
 let now=0,yields=0,traces=0,cleared=0;
 const Paint={
  canvas(width,height){return {width,height,getContext(){return {drawImage(){},getImageData(){const data=new Uint8ClampedArray(width*height*4);for(let i=3;i<data.length;i+=4)data[i]=255;return {data};}};}};},
  loadImages:async spec=>Object.fromEntries(Object.entries(spec.images).map(([id,source])=>[id,Object.assign({},source,{image:{complete:true,naturalWidth:source.width,naturalHeight:source.height}})])),
  objectImage(object,images){now+=cost;return images[object.assetId];},
  matrix(t){return [1,0,0,1,t.x||0,t.y||0];},
  clearMasks(){cleared++;}
 },filename=path.resolve(__dirname,'../worlds/auto-blocker-raster.js'),contours=require('../worlds/alpha-contours'),scope={module:{exports:{}},performance:{now:()=>now},setTimeout(callback){yields++;if(cancel)throw Error('renderer canceled');callback();},require(name){if(name==='./paint')return Paint;if(name==='./alpha-contours')return {trace(...args){traces++;return contours.trace(...args);}};return require(require.resolve(name,{paths:[path.dirname(filename)]}));}};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),scope,{filename});
 return {render:scope.module.exports.render,state:()=>({yields,traces,cleared})};
}
function spec(count){return {layers:[{id:'layer',objects:Array.from({length:count},(_,i)=>({id:'object-'+i,assetId:'same',x:0,y:0,scale:1,angle:0}))}],images:{same:{width:2,height:2,anchor:{x:0,y:0}}},mask:[],op:'paint',precision:100};}
test('cached alpha placements avoid a timer pause per object while retaining exact geometry',async()=>{
 const r=raster(0),value=await r.render(spec(500));assert.equal(value.stats.objects,500);assert.equal(value.stats.images,1);assert.equal(r.state().traces,1);assert.equal(r.state().yields,0);assert.equal(r.state().cleared,1);assert.equal(value.mask.length,1);assert.equal(value.mask[0][0].length,5);
});
test('long auto-blocker work still yields cooperatively at a bounded work budget',async()=>{
 const r=raster(3),value=await r.render(spec(20));assert.equal(value.stats.objects,20);assert.equal(r.state().yields,6);assert.equal(r.state().traces,1);assert.equal(r.state().cleared,1);
});
test('canceled cooperative raster work releases masks and never returns a partial blocker result',async()=>{
 const r=raster(10,true);await assert.rejects(r.render(spec(20)),/renderer canceled/);assert.equal(r.state().yields,1);assert.equal(r.state().cleared,1);
});
