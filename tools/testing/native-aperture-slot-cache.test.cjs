'use strict';
// CPU regressions: no game, Cocos import or source/asset writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
function load(native=true){const context=vm.createContext({exports:{},cc:{sys:{isNative:native}},sp:{}});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/KinghtFallDepthView.js'),'utf8'),context);return vm.runInContext('({tail:trailingApertures,bounds:nativePhysicalBounds,physical:capturePhysical})',context);}
function slot(index,name='body'+index){return{data:{index,name},bone:{active:true},attachment:{index},deform:[],time:index,getAttachment(){this.attachReads=(this.attachReads||0)+1;return this.attachment;},getDeform(){this.deformReads=(this.deformReads||0)+1;return this.deform.slice();},getAttachmentTime(){return this.time;},setAttachment(value){this.attachment=value;this.deform=[];this.time=0;},setAttachmentTime(value){this.time=value;}};}
function fixture(apertures=false){const slots=Array.from({length:128},(_,index)=>slot(index));if(apertures){slots[126].data.name='building_aperture_rays';slots[127].data.name='building_aperture_cores';}let reads=0,identities=0,copies=0,bounds=0;const skeleton={drawOrder:slots.slice(),getSlots(){reads++;copies+=slots.length;return slots.slice();}};Object.defineProperty(skeleton,'slots',{get(){return skeleton.getSlots();}});const renderer={skeletonData:{},_skeleton:skeleton,node:{getChildByName(){return null;}},_startSlotIndex:-1,_endSlotIndex:-1,ranges:[],setSlotsRange(a,b){this.ranges.push([a,b]);},_nativeSkeleton:{getSkeleton(){identities++;return renderer._skeleton;},getBoundingBox(){bounds++;return{width:slots.some(s=>/building_aperture/.test(s.data.name)&&s.attachment)?500:40};}}};return{renderer,skeleton,slots,counts:()=>({reads,identities,copies,bounds})};}

test('native 128-slot NPCs copy the vector once across sixty bounds/capture frames and cache null',()=>{
 const api=load(),f=fixture();let draws=0;
 for(let frame=0;frame<60;frame++){assert.equal(api.tail(f.renderer),null);assert.equal(api.bounds(f.renderer).width,40);api.physical(f.renderer,()=>draws++);}
 assert.deepEqual(f.counts(),{reads:1,identities:1,copies:128,bounds:60});assert.equal(draws,60);
});
test('aperture handles stay cached while attachments, deform guards, timestamps and draw order remain live',()=>{
 const api=load(),f=fixture(true),ray=f.slots[126],core=f.slots[127],originalRay=ray.attachment,originalCore=core.attachment;
 for(let frame=0;frame<60;frame++){assert.equal(api.bounds(f.renderer).width,40);assert.equal(ray.attachment,originalRay);assert.equal(core.attachment,originalCore);assert.equal(ray.time,126);assert.equal(core.time,127);}
 assert.equal(f.counts().reads,1);assert.equal(ray.deformReads,60);assert.equal(core.deformReads,60);
 ray.deform=[3,4];assert.equal(api.bounds(f.renderer).width,500);assert.deepEqual(ray.deform,[3,4]);assert.equal(core.attachment,originalCore);
 ray.deform=[];ray.attachment=null;assert.equal(api.bounds(f.renderer).width,40);assert.equal(ray.attachment,null);ray.attachment=originalRay;
 f.skeleton.drawOrder=[...f.slots.slice(0,126),core,ray];api.physical(f.renderer,()=>{});assert.deepEqual(f.renderer.ranges.at(-2),[0,125]);assert.deepEqual(f.renderer.ranges.at(-1),[-1,-1]);assert.equal(f.counts().reads,1);
});
test('native handle/data identity changes invalidate both null and positive cached suffixes',()=>{
 const api=load(),f=fixture();assert.equal(api.tail(f.renderer),null);f.renderer.skeletonData={};assert.equal(api.tail(f.renderer),null);assert.equal(f.counts().reads,2);
 const previous=f.renderer._nativeSkeleton;f.renderer._nativeSkeleton={...previous};assert.equal(api.tail(f.renderer),null);assert.equal(f.counts().reads,3);
 const next=fixture(true);f.renderer._skeleton=next.skeleton;const tail=api.tail(f.renderer);assert.equal(tail.length,2);assert.equal(tail[0],next.slots[126]);assert.equal(next.counts().reads,1);
});
test('ordinary mutable JS/fake slots retain fresh scans rather than caching a missing suffix',()=>{
 for(const nativeMode of [false,true]){const api=load(nativeMode),slots=[slot(0)],skeleton={slots},renderer={_skeleton:skeleton,_nativeSkeleton:{}};assert.equal(api.tail(renderer),null);slots.push(slot(1,'building_aperture_rays'));assert.equal(api.tail(renderer).length,1);slots.pop();assert.equal(api.tail(renderer),null);}
 const api=load(false),f=fixture();assert.equal(api.tail(f.renderer),null);f.slots.push(slot(128,'building_aperture_rays'));assert.equal(api.tail(f.renderer).length,1);assert.equal(f.counts().reads,2,'Web fake native-shaped handles must still rescan');
});
test('unknown native identity/getter APIs fall back without changing mutable-slot semantics',()=>{
 for(const throwing of [false,true]){const api=load(),f=fixture();f.renderer._nativeSkeleton.getSkeleton=()=>{if(throwing)throw Error('unsupported identity');return{};};assert.equal(api.tail(f.renderer),null);f.slots.push(slot(128,'building_aperture_cores'));assert.equal(api.tail(f.renderer).length,1);assert.equal(f.counts().reads,2);}
 for(const result of [null,undefined,{}]){const api=load(),slots=[slot(0)],skeleton={slots,getSlots(){return result;}},renderer={_skeleton:skeleton,_nativeSkeleton:{getSkeleton:()=>skeleton}};assert.equal(api.tail(renderer),null);slots.push(slot(1,'building_aperture_rays'));assert.equal(api.tail(renderer).length,1);}
});
test('cached native apertures still restore attachments and timestamp after bounds failures',()=>{
 const api=load(),f=fixture(true),originals=f.slots.slice(126).map(value=>value.attachment);api.tail(f.renderer);f.renderer._nativeSkeleton.getBoundingBox=()=>{throw Error('native bounds failed');};assert.throws(()=>api.bounds(f.renderer),/native bounds failed/);for(let index=126;index<128;index++){assert.equal(f.slots[index].attachment,originals[index-126]);assert.equal(f.slots[index].time,index);}assert.equal(f.counts().reads,1);
});
