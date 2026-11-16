'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSpineCache}=require('../../packages/hkd-projectiles/client');
const bounds=(x=0)=>({minX:x-20,minY:-10,maxX:x+20,maxY:10,width:40,height:20});
const asset=(index,resource=index)=>({id:'native:'+index,kind:'spine',bundle:'resources',resource:'projectiles/spine/fly'+resource,skin:'default',animation:'loop_'+index,thumbnail:'assets/resources/projectiles/spine/thumb-'+index+'.png',previewBounds:bounds(index),rotation:index%3*45});
function fixture(options){
 const calls=[],errors=[],changes=[];let serial=0;
 const api={async ipc(name,request){calls.push([name,request]);return{layers:[{name:request.id,rotation:0}]};},runtime(){return{id:++serial};},renderer:{async createLayers(runtime,descriptions){calls.push(['create',runtime.id]);return descriptions.map(description=>({description:{...description}}));},seek(runtime,layers,animation,time,loop){calls.push(['seek',animation,time,loop]);},bounds(){return bounds();}}};
 return{api,calls,errors,changes,cache:createSpineCache(api,{onError:error=>errors.push(error.message),onChange:()=>changes.push(true),...options})};
}
test('static-thumbnail variants construct no rigs until selected and share only six resource/skin runtimes across 67 flights',async()=>{
 const f=fixture(),assets=Array.from({length:67},(_,index)=>asset(index,index%6));
 for(const item of assets)assert.equal(f.cache.get(item),null);assert.deepEqual(f.calls,[],'library browsing does not describe, parse or create any Spine rig');
 for(const item of assets){const entry=await f.cache.load(item);assert(entry);assert.deepEqual(entry.bounds,item.previewBounds);assert.equal(entry.layers[0].description.rotation,item.rotation);}
 assert.equal(f.calls.filter(call=>call[0]==='describe').length,6);assert.equal(f.calls.filter(call=>call[0]==='create').length,6);assert.equal(f.changes.length,6);assert.equal(f.cache.status().resources,6);
 assert.equal(f.cache.get(assets[0]).layers,f.cache.get(assets[6]).layers);assert.notEqual(f.cache.get(assets[0]).layers,f.cache.get(assets[1]).layers);assert(f.calls.every(call=>['describe','create','seek'].includes(call[0])),'preview loads never send authoring or Save requests');f.cache.destroy();
});
test('concurrent variant loads share one in-flight resource request and retain per-entry calibration',async()=>{
 const f=fixture();let resolve;f.api.ipc=(name,request)=>{f.calls.push([name,request]);return new Promise(ready=>resolve=ready);};
 const a=asset(1,0),b=asset(2,0),first=f.cache.load(a),second=f.cache.load(b);assert.equal(f.calls.length,1);
 resolve({layers:[{name:'shared'}]});const [left,right]=await Promise.all([first,second]);assert.equal(left.layers,right.layers);assert.deepEqual(left.bounds,a.previewBounds);assert.deepEqual(right.bounds,b.previewBounds);
 f.cache.get(a);assert.equal(left.layers[0].description.rotation,a.rotation);f.cache.get(b);assert.equal(left.layers[0].description.rotation,b.rotation);f.cache.get(a);assert.equal(left.layers[0].description.rotation,a.rotation,'selecting a prior direction restores its own orientation');f.cache.destroy();
});
test('the imported-rig LRU bounds pending and completed resources and evicts unused variant bindings',async()=>{
 const f=fixture({limit:2}),a=asset(1),b=asset(2),c=asset(3);await f.cache.load(a);await f.cache.load(b);f.cache.get(a);await f.cache.load(c);
 assert(f.cache.get(a));assert.equal(f.cache.get(b),null);assert(f.cache.get(c));assert.equal(f.cache.status().resources,2);assert.equal(f.cache.status().bindings,2);await f.cache.load(b);assert.equal(f.calls.filter(call=>call[0]==='create').length,4);assert.equal(f.cache.status().resources,2);f.cache.destroy();
});
test('rapid requests evicted before their descriptions arrive do not allocate textures or publish stale previews',async()=>{
 const f=fixture({limit:2}),pending=[];f.api.ipc=()=>new Promise(resolve=>pending.push(resolve));const promises=[1,2,3,4].map(index=>f.cache.load(asset(index)));
 assert.equal(f.cache.status().resources,2);pending.forEach(resolve=>resolve({layers:[{}]}));const result=await Promise.all(promises);
 assert.deepEqual(result.slice(0,2),[null,null]);assert(result[2]&&result[3]);assert.equal(f.calls.filter(call=>call[0]==='create').length,2);assert.equal(f.changes.length,2);f.cache.destroy();
});
test('reload and close suppress late descriptions and texture completions without writes',async()=>{
 const f=fixture();let describe;f.api.ipc=()=>new Promise(resolve=>describe=resolve);const stale=f.cache.load(asset(1));f.cache.invalidate();describe({layers:[{}]});assert.equal(await stale,null);assert.equal(f.calls.length,0);assert.equal(f.changes.length,0);
 let textures;f.api.ipc=async()=>({layers:[{}]});f.api.renderer.createLayers=()=>new Promise(resolve=>textures=resolve);const late=f.cache.load(asset(2));await Promise.resolve();f.cache.destroy();textures([{description:{}}]);assert.equal(await late,null);assert.equal(f.changes.length,0);assert.deepEqual(f.cache.status(),{resources:0,legacy:0,bindings:0});assert.equal(await f.cache.load(asset(3)),null);
});
test('failed imported resources warn once until an explicit Reload, which allows recovery',async()=>{
 const f=fixture();let attempts=0;f.api.ipc=async()=>{if(++attempts===1)throw Error('Unavailable atlas');return{layers:[{}]};};const item=asset(1);
 for(let i=0;i<20;i++)assert.equal(await f.cache.load(item),null);assert.equal(attempts,1);assert.deepEqual(f.errors,['Unavailable atlas']);f.cache.invalidate();assert(await f.cache.load(item));assert.equal(attempts,2);f.cache.destroy();
});
test('legacy animated library cards keep independent skin/animation rigs and no new calibration requirement',async()=>{
 const f=fixture(),a={...asset(1,0),thumbnail:undefined,previewBounds:undefined},b={...asset(2,0),thumbnail:undefined,previewBounds:undefined};
 const first=await f.cache.load(a),second=await f.cache.load(b);assert.notEqual(first.layers,second.layers);assert.equal(f.cache.status().legacy,2);assert.equal(f.cache.status().resources,0);assert.deepEqual(first.bounds,bounds());assert.equal(f.calls.filter(call=>call[0]==='create').length,2);f.cache.destroy();
});
