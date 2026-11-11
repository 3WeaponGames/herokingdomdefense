'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const pending=[],drawn=[],context={getImageData:()=>({data:new Uint8Array(384*384*4)}),clearRect(){},drawImage(){}},renderer={createLayers:async(_sp,layers)=>layers.map(layer=>({description:layer})),seek(){},bounds:()=>({}),draw(_sp,_ctx,layers){drawn.push(layers[0].description.id);},destroyCanvas(){}};
 const scope={module:{exports:{}},document:{createElement:()=>({getContext:()=>context,toDataURL:()=>'data:image/png;'+drawn.at(-1)})},require:name=>name==='../preview/spine-renderer'?renderer:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../worlds/unit-model-gallery.js'),'utf8'),scope);
 const image={hidden:false,onload:null,attributes:{},set src(value){this.attributes.src=value;queueMicrotask(()=>this.onload&&this.onload());},get src(){return this.attributes.src;},hasAttribute(name){return name in this.attributes;},getAttribute(name){return this.attributes[name];},removeAttribute(name){delete this.attributes[name];}},card={hidden:false,isConnected:true,dataset:{}},status={};
 const gallery=scope.module.exports.create({},(_name,{id})=>new Promise((resolve,reject)=>pending.push({id,resolve,reject})));gallery.watch(card,image,status,91038);return{gallery,image,card,status,pending,drawn,resolve(job){job.resolve({runtimePath:'fixture-runtime',layers:[{id:job.id}]});}};
}
test('changing a grouped profile cannot publish or cache a stale model from an earlier preview request',async()=>{
 const f=fixture();try{assert.equal(f.pending[0].id,91038);f.gallery.setUnit(f.card,92049);f.resolve(f.pending[0]);await flush();assert.deepEqual(f.drawn,[]);assert.equal(f.pending[1].id,92049);f.resolve(f.pending[1]);await flush();assert.equal(f.image.src,'data:image/png;92049');assert.equal(f.card.dataset.modelState,'ready');assert.deepEqual(f.drawn,[92049]);}finally{f.gallery.destroy();}assert.equal(f.image.src,undefined);
});
test('a superseded preview failure cannot mark the current profile as unavailable, and closing cancels queued publication',async()=>{
 const f=fixture();f.gallery.setUnit(f.card,92049);f.pending[0].reject(Error('old profile failed'));await flush();assert.notEqual(f.card.dataset.modelState,'error');assert.equal(f.pending[1].id,92049);f.gallery.destroy();f.resolve(f.pending[1]);await flush();assert.equal(f.image.src,undefined);assert.deepEqual(f.drawn,[]);
});
