'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const T=require('../../../assets/_script/BuildingNightlight'),Data=require('../buildings/nightlight-data'),{Store}=require('../lib/store'),{Service}=require('../worlds/service'),root=path.resolve(__dirname,'../../..'),copy=v=>JSON.parse(JSON.stringify(v));
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('native light edits preserve original art and body geometry, transforming animation offsets as vectors',()=>{
 const source=copy(require('../../../assets/KinghtFallIconMap/com/Ani/mf/mf.json')),skin='mf-2-1';
 // Exercise affine deformation math independently of production emitters,
 // which deliberately keep fixed geometry for native occlusion bounds.
 source.animations.idle_night.deform[skin].building_aperture_cores={building_aperture_cores:[{time:0},{time:.5,offset:2,vertices:[2,3,4,5],curve:[.25,0,.75,1]}]};
 const before=JSON.stringify(source),id='mesh:building_aperture_cores:0',v={x:13,y:21,scaleX:.6,scaleY:1.7,angle:35,flipX:true},row={Skin:skin,Nightlight:{version:1,lights:{[id]:v}}},entry=T.meshes(source,skin).find(e=>e.id===id),result=T.json(source,row);
 assert.equal(JSON.stringify(source),before);assert.equal(T.json(source,{Skin:skin}),source);assert.deepEqual(result.bones,source.bones);assert.deepEqual(result.slots,source.slots);
 const old=source.skins.find(s=>s.name===skin),next=result.skins.find(s=>s.name===skin),mesh=next.attachments[entry.slot][entry.name];assert.deepEqual(mesh.uvs,old.attachments[entry.slot][entry.name].uvs);assert.deepEqual(mesh.triangles,old.attachments[entry.slot][entry.name].triangles);
 const m=T.matrix(T.value(row,id),entry.center),p=T.point(m,entry.vertices[0],entry.vertices[1]);near(mesh.vertices[0],p[0]);near(mesh.vertices[1],p[1]);
 for(const s of source.skins)if(s.name!==skin)assert.deepEqual(result.skins.find(n=>n.name===s.name),s);
 const timeline=source.animations.idle_night.deform[skin][entry.slot][entry.name],out=result.animations.idle_night.deform[skin][entry.slot][entry.name];assert.equal(out.length,timeline.length);
 timeline.forEach((f,i)=>{assert.equal(out[i].time,f.time);assert.deepEqual(out[i].curve,f.curve);if(!f.vertices?.length)return;const full=new Array(entry.vertices.length).fill(0);f.vertices.forEach((n,j)=>full[(f.offset||0)+j]=n);const expected=T.point(m,full[0],full[1],true);near(out[i].vertices[0],expected[0]);near(out[i].vertices[1],expected[1]);});
 const untouched=copy(next.attachments);untouched[entry.slot]=old.attachments[entry.slot];assert.deepEqual(untouched,old.attachments,'only the selected original light mesh changes');
});
test('actual editor describes every current light without draft writes and uses the runtime geometry transform',()=>{
 const store=new Store(root),service=new Service(root,{previewConfig:()=>store.documents.A.data}),baseline=store.draftState();
 for(const [id,levelIndex]of [['1',1],['3',12],['4',0],['5',0],['2',4]]){const d=Data.describe(service,{id,levelIndex});assert(d.entries.length);assert.equal(new Set(d.entries.map(e=>e.id)).size,d.entries.length);const e=d.entries[0],value={version:1,lights:{[e.id]:{x:24,y:-16,scaleX:.8,scaleY:1.2,angle:-20,flipY:true}}},r=Data.render(d,value);for(let i=0;i<r.skeletons.length;i++){assert.deepEqual(r.skeletons[i].json,T.json(d.record.skeletons[i].json,{Skin:d.record.skeletons[i].skin,Nightlight:value}));assert.equal(r.skeletons[i].animation,'idle_night');}assert(Data.edits(store.documents.A.data,{id,levelIndex},value)[0].path.includes('Nightlight'));}
 assert.deepEqual(store.draftState(),baseline);assert.equal(store.changes().length,0);
});
test('nightlight drafts preserve unknown settings and other tiers, undo, and reject stale rows and invalid transforms',()=>{
 const store=new Store(root),config=store.documents.A.data,request={id:'1',levelIndex:1,expectedIndex:2},row=config.BuildEnum[1].levelList[1],before=store.draftState(),value={version:1,lights:{'mesh:building_aperture_rays:0':{x:8,scaleX:1.4,flipX:true,future:'keep'}},future:'keep'};
 const edits=Data.edits(config,request,value);store.change({version:store.version,edits});assert.deepEqual(store.documents.A.data.BuildEnum[1].levelList[1].Nightlight,value);store.undo({version:store.version});assert.deepEqual(store.draftState(),before);assert.throws(()=>Data.edits(config,{...request,expectedIndex:999},value),/changed/);
 for(const bad of [{scaleX:0},{scaleY:Infinity},{x:NaN},{flipY:1}])assert(T.issues({version:1,lights:{'sprite:0:0':bad}}).length);
 const changed=copy(config);changed.BuildEnum[1].levelList[1].Nightlight=value;assert.throws(()=>Data.edits(changed,request,value,{version:1,lights:{}}),/another draft/);
});
test('native instance clones are reused for the same pose and safely released on tier reset or destruction',()=>{
 let next=0;class SkeletonData{constructor(){this.id=++next;this.refs=0;}addRef(){this.refs++;}decRef(){this.refs--;}getRuntimeData(){return{};}}
 const source=new SkeletonData();source.skeletonJson=require('../../../assets/KinghtFallIconMap/com/Ani/cb/cb.json');source.atlasText='original';source.textures=['original'];const component={node:{},skeletonData:source},owner={ndAniMain:component,ndAniOther:[]},exports={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingNightlightRuntime.js'),'utf8'),{cc:{isValid:v=>!!v&&!v.destroyed},sp:{SkeletonData},require:()=>T,exports});
 const row={Skin:'cb-painted-2',Nightlight:{version:1,lights:{'mesh:building_aperture_rays:0':{x:10}}}};exports.apply(owner,row);const adjusted=component.skeletonData;assert.notEqual(adjusted,source);assert.equal(source.refs,1);exports.apply(owner,row);assert.equal(component.skeletonData,adjusted);assert.equal(next,2);
 const other={ndAniMain:{node:{},skeletonData:source}};exports.apply(other,row);assert.equal(other.ndAniMain.skeletonData,adjusted,'matching buildings share one parsed light layout');assert.equal(next,2);
 exports.apply(owner,{Skin:'cb-painted-3'});assert.equal(component.skeletonData,source);assert.equal(source.refs,1);const oldRelease=adjusted.decRef;adjusted.decRef=function(){assert.equal(other.ndAniMain.skeletonData,null,'a dying consumer is detached before release');oldRelease.call(this);};exports.dispose(other,true);assert.equal(source.refs,0);assert.equal(adjusted.refs,0);exports.dispose(owner);assert.equal(source.refs,0);
});
test('stage preparation parses saved tiers without changing a scene component, and later purchases reuse those layouts',()=>{
 let parsed=0;class SkeletonData{constructor(){this.refs=0;}addRef(){this.refs++;}decRef(){this.refs--;}getRuntimeData(){parsed++;return{};}}
 const source=new SkeletonData();source.skeletonJson=require('../../../assets/KinghtFallIconMap/com/Ani/cb/cb.json');const component={node:{},skeletonData:source},owner={ndAniMain:component},exports={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingNightlightRuntime.js'),'utf8'),{cc:{isValid:v=>!!v&&!v.destroyed},sp:{SkeletonData},require:()=>T,exports});
 const rows=[2,3].map(tier=>({Skin:'cb-painted-'+tier,Nightlight:{version:1,lights:{'mesh:building_aperture_rays:0':{x:tier*10}}}}));exports.prepare(owner,rows);assert.equal(component.skeletonData,source);assert.equal(parsed,2);
 exports.apply(owner,rows[0]);exports.apply(owner,rows[1]);assert.equal(parsed,2,'purchases and tier changes do not parse another skeleton');assert.equal(source.refs,2);
 exports.dispose(owner,true);assert.equal(component.skeletonData,null);assert.equal(source.refs,0);assert(owner._buildingNightlightPrepared===undefined);
});
