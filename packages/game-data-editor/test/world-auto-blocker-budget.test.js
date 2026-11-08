'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
function renderer(actualSize){
 let loads=0,allocations=0,cleared=0,contours=0;const filename=path.resolve(__dirname,'../worlds/auto-blocker-raster.js'),Paint={
  async loadImages(spec){loads++;return Object.fromEntries(Object.entries(spec.images).map(([id,source])=>{allocations++;return [id,Object.assign({},source,{image:{naturalWidth:actualSize?actualSize.width:source.textureWidth||source.width,naturalHeight:actualSize?actualSize.height:source.textureHeight||source.height}})];}));},
  clearMasks(){cleared++;}
 },scope={module:{exports:{}},performance:{now:()=>0},setTimeout,require(name){if(name==='./paint')return Paint;if(name==='./alpha-contours')return {trace(){contours++;throw Error('Unexpected contour allocation');}};return require(require.resolve(name,{paths:[path.dirname(filename)]}));}};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),scope,{filename});return {render:scope.module.exports.render,state:()=>({loads,allocations,cleared,contours})};
}
function spec(images){return {layers:[],images,mask:[],op:'paint',precision:100};}
function images(count,width,height,extra){return Object.fromEntries(Array.from({length:count},(_,i)=>['image-'+i,Object.assign({url:'source-'+i,width,height},extra)]));}
test('known overbudget source frames and source-texture selections fail before any image is allocated',async()=>{
 for(const input of [images(1,4097,4097),images(9,4096,4096),images(1,8,8,{textureWidth:16384,textureHeight:16384})]){
  const r=renderer();await assert.rejects(r.render(spec(input)),/large|image data/);assert.equal(r.state().loads,0);assert.equal(r.state().allocations,0);assert.equal(r.state().contours,0);
 }
});
test('shared atlas URLs consume one texture budget and preserve individually valid frame limits',async()=>{
 const r=renderer(),input=images(12,1024,1024,{url:'same-atlas',textureWidth:4096,textureHeight:4096}),value=await r.render(spec(input));
 assert.equal(value.mask.length,0);assert.equal(r.state().loads,1);assert.equal(r.state().allocations,12);assert.equal(r.state().contours,0);assert.equal(r.state().cleared,1);
 const largeShared=renderer(),atlas=images(12,1024,1024,{url:'same-large-atlas',textureWidth:8192,textureHeight:4096});await largeShared.render(spec(atlas));assert.equal(largeShared.state().loads,1,'32MP shared atlases remain allowed when every trace frame fits16MP');
});
test('the existing128MPaggregate boundary remains allowed without a stricter new decode limit',async()=>{
 const r=renderer();await r.render(spec(images(8,4096,4096)));assert.equal(r.state().loads,1);assert.equal(r.state().allocations,8);assert.equal(r.state().cleared,1);
});
test('actual decoded dimensions are checked before tracing when source metadata understated the size',async()=>{
 const r=renderer({width:4096,height:4096});await assert.rejects(r.render(spec(images(9,1,1))),/image data/);assert.equal(r.state().loads,1);assert.equal(r.state().contours,0);assert.equal(r.state().cleared,1);
});
