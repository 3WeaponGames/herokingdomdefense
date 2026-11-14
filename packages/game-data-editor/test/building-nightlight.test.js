'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const T=require('../../../assets/_script/BuildingNightlight'),Data=require('../buildings/nightlight-data'),{Store}=require('../lib/store'),{Service}=require('../worlds/service'),root=path.resolve(__dirname,'../../..'),copy=v=>JSON.parse(JSON.stringify(v));
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('the dim option preserves the shipped tier-one Archer ray pixels and the full option keeps its original sprite',()=>{
 const P=require('../../hkd-characters/lib/png-atlas'),atlas=P.decode(fs.readFileSync(path.join(root,'assets/KinghtFallIconMap/com/Ani/jt/jt.png'))),original=P.crop(atlas,659,151,68,116,false),dim=P.decode(fs.readFileSync(path.join(root,'assets/resources/'+T.lightType('dim').sprite+'.png')));
 assert.deepEqual([dim.width,dim.height],[116,116]);
 for(let y=0;y<116;y++){assert.deepEqual(dim.rgba.subarray((y*116+24)*4,(y*116+92)*4),original.rgba.subarray(y*68*4,(y+1)*68*4));assert(dim.rgba.subarray(y*116*4,(y*116+24)*4).every(v=>v===0));assert(dim.rgba.subarray((y*116+92)*4,(y+1)*116*4).every(v=>v===0));}
 assert.equal(T.lightType().sprite,T.sprite);assert.equal(T.lightType('full').sprite,'buildings/lighting/native-window-ray');assert.equal(T.lightType('dim').id,'dim');
 const mill=P.decode(fs.readFileSync(path.join(root,'assets/KinghtFallIconMap/com/Ani/mf/mf.png'))),round=P.crop(mill,487,197,79,70,false),circle=P.decode(fs.readFileSync(path.join(root,'assets/resources/'+T.lightType('circle').sprite+'.png')));assert.deepEqual([circle.width,circle.height],[79,79]);
 for(let y=0;y<70;y++)assert.deepEqual(circle.rgba.subarray((y+4)*79*4,(y+5)*79*4),round.rgba.subarray(y*79*4,(y+1)*79*4));assert(circle.rgba.subarray(0,4*79*4).every(v=>v===0));assert(circle.rgba.subarray(74*79*4).every(v=>v===0));assert.deepEqual(T.types.map(t=>t.id),['full','dim','circle']);
});
test('mixed full and dim emitters round-trip through the draft without changing old lights, IDs, transforms or unknown fields',()=>{
 const store=new Store(root),config=store.documents.A.data,service=new Service(root,{previewConfig:()=>store.documents.A.data}),request={id:'2',levelIndex:0},row=config.BuildEnum[2].levelList[0],original=copy(T.layout(row)),data=Data.describe(service,request),dim=Data.add(original,{x:12,y:34},'dim'),full=Data.add(dim.value,{x:-19,y:7},'full');
 assert.deepEqual(Data.remove(dim.value,dim.id).lights,original.lights);assert.deepEqual(dim.value.emitters.slice(0,-1),original.emitters);assert.equal(dim.value.emitters.at(-1).type,'dim');assert.equal(full.value.emitters.at(-1).type,undefined);
 full.value.emitters.at(-2).future='keep';const W=require('../../../assets/_script/WindowLightWarp').forType('dim'),warp=W.controls();warp[1].x+=1;full.value.lights[dim.id]={...full.value.lights[dim.id],warp,warpNodes:W.addNode(warp,[],0,.5),scaleX:1.3,angle:15,future:'keep'};
 assert.deepEqual(T.issues(full.value),[]);const renders=Data.render(data,full.value).sprites.filter(s=>s.nightlight);assert.equal(renders.at(-2).frame,'nightlight:'+T.lightType('dim').sprite);assert.equal(renders.at(-2).lightType,'dim');assert.equal(renders.at(-1).frame,'nightlight:'+T.sprite);assert(data.images[renders.at(-2).frame]);assert(data.images[renders.at(-1).frame]);
 const baseline=store.draftState();store.change({version:store.version,edits:Data.edits(config,request,full.value,original)});const reopened=Data.describe(service,request);assert.deepEqual(reopened.value,full.value);assert.equal(reopened.entries.at(-2).glow.sprite,T.lightType('dim').sprite);store.undo({version:store.version});assert.deepEqual(store.draftState(),baseline);
 assert.throws(()=>Data.add(original,{x:0,y:0},'other'),/Full, Dim or Circle light/);assert(T.issues({...full.value,emitters:[{id:dim.id,type:'other'}]}).length);assert.doesNotThrow(()=>T.issues({...full.value,emitters:{}}));
});
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
test('buildings without authored emitters open with no legacy lights and Add Light uses the exact square sprite without writes',()=>{
 const store=new Store(root),config=copy(store.documents.A.data);for(const cat of Object.values(config.BuildEnum))for(const row of cat.levelList||[])delete row.Nightlight;
 const service=new Service(root,{previewConfig:()=>config}),baseline=store.draftState();
 for(const [id,levelIndex]of [['1',1],['3',12],['4',0],['5',0],['2',4],['6',0]]){const d=Data.describe(service,{id,levelIndex});assert.equal(d.entries.length,0);assert.equal(Data.render(d,d.value).sprites.filter(s=>s.nightlight).length,0);const added=Data.add(d.value,{x:24,y:-16}),value=added.value,r=Data.render(d,value),sprite=r.sprites.find(s=>s.nightlight);assert.equal(sprite.frame,'nightlight:buildings/lighting/native-window-ray');assert.equal(sprite.width,70);assert.equal(sprite.height,70);assert.deepEqual(sprite.color,{r:255,g:255,b:255,a:255});for(let i=0;i<r.skeletons.length;i++){assert.deepEqual(r.skeletons[i].json,T.withoutLegacy(d.record.skeletons[i].json));assert.equal(r.skeletons[i].animation,'idle_night');}assert(Data.edits(store.documents.A.data,{id,levelIndex},value)[0].path.includes('Nightlight'));}
 assert.deepEqual(store.draftState(),baseline);assert.equal(store.changes().length,0);
});
test('nightlight drafts preserve unknown settings and other tiers, undo, and reject stale rows and invalid transforms',()=>{
 const store=new Store(root),config=store.documents.A.data,request={id:'1',levelIndex:1,expectedIndex:2},row=config.BuildEnum[1].levelList[1],before=store.draftState(),value={version:1,lights:{'mesh:building_aperture_rays:0':{x:8,scaleX:1.4,flipX:true,future:'keep'}},future:'keep'};
 const edits=Data.edits(config,request,value);store.change({version:store.version,edits});assert.deepEqual(store.documents.A.data.BuildEnum[1].levelList[1].Nightlight,value);store.undo({version:store.version});assert.deepEqual(store.draftState(),before);assert.throws(()=>Data.edits(config,{...request,expectedIndex:999},value),/changed/);
 for(const bad of [{scaleX:0},{scaleY:Infinity},{x:NaN},{flipY:1}])assert(T.issues({version:1,lights:{'sprite:0:0':bad}}).length);
 const changed=copy(config);changed.BuildEnum[1].levelList[1].Nightlight=value;assert.throws(()=>Data.edits(changed,request,value,{version:1,lights:{}}),/another draft/);
});

test('unauthored tower tiers start empty and manual light sizing stays independent per tier and emitter',()=>{
 const store=new Store(root);for(const state of ['original','data'])for(const row of store.documents.A[state].BuildEnum[2].levelList)delete row.Nightlight;
 const config=store.documents.A.data,service=new Service(root,{previewConfig:()=>({...config,GameTools:store.documents.overrides.data})}),before=store.draftState(),rows=config.BuildEnum[2].levelList;assert.equal(rows.length,12);
 for(let levelIndex=0;levelIndex<rows.length;levelIndex++){const data=Data.describe(service,{id:'2',levelIndex});assert.equal(data.entries.length,0);}
 const request={id:'2',levelIndex:0,expectedIndex:rows[0].index},data=Data.describe(service,request),first=Data.add(data.value,{x:0,y:0}),second=Data.add(first.value,{x:-15,y:20}),id=first.id,value=second.value;value.lights[id]={...value.lights[id],x:12,y:-8,scaleX:1.7,scaleY:.8};store.change({version:store.version,edits:Data.edits(config,request,value,data.value)});
 const after=store.draftState(),expected=copy(before);expected.A.BuildEnum[2].levelList[0].Nightlight=value;assert.deepEqual(after,expected);assert.deepEqual(data.row.Nightlight,before.A.BuildEnum[2].levelList[0].Nightlight);const rendered=Data.render(data,value).sprites.filter(s=>s.nightlight);near(Math.hypot(rendered[0].matrix[0],rendered[0].matrix[1]),Math.hypot(data.lightMatrix[0],data.lightMatrix[1])*1.7);assert.equal(rendered.length,2);assert.equal(rendered[1].frame,rendered[0].frame);store.undo({version:store.version});assert.deepEqual(store.draftState(),before);
});
test('native instance clones are reused for the same pose and safely released on tier reset or destruction',()=>{
 let next=0;class SkeletonData{constructor(){this.id=++next;this.refs=0;}addRef(){this.refs++;}decRef(){this.refs--;}getRuntimeData(){return{};}}
 const source=new SkeletonData();source.skeletonJson=require('../../../assets/KinghtFallIconMap/com/Ani/cb/cb.json');source.atlasText='original';source.textures=['original'];const component={node:{},skeletonData:source},owner={ndAniMain:component,ndAniOther:[]},exports={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingNightlightRuntime.js'),'utf8'),{cc:{isValid:v=>!!v&&!v.destroyed},sp:{SkeletonData},require:()=>T,exports});
 const row={Skin:'cb-painted-2',Nightlight:{version:1,lights:{'mesh:building_aperture_rays:0':{x:10}}}};exports.apply(owner,row);const adjusted=component.skeletonData;assert.notEqual(adjusted,source);assert.equal(source.refs,1);exports.apply(owner,row);assert.equal(component.skeletonData,adjusted);assert.equal(next,2);
 const other={ndAniMain:{node:{},skeletonData:source}};exports.apply(other,row);assert.equal(other.ndAniMain.skeletonData,adjusted,'matching buildings share one parsed light layout');assert.equal(next,2);
 exports.apply(owner,{Skin:'cb-painted-3'});assert.equal(component.skeletonData,adjusted,'legacy lights stay removed after changing tiers');exports.apply(owner,null);assert.equal(component.skeletonData,source);assert.equal(source.refs,1);const oldRelease=adjusted.decRef;adjusted.decRef=function(){assert.equal(other.ndAniMain.skeletonData,null,'a dying consumer is detached before release');oldRelease.call(this);};exports.dispose(other,true);assert.equal(source.refs,0);assert.equal(adjusted.refs,0);exports.dispose(owner);assert.equal(source.refs,0);
});
test('stage preparation parses saved tiers without changing a scene component, and later purchases reuse those layouts',()=>{
 let parsed=0;class SkeletonData{constructor(){this.refs=0;}addRef(){this.refs++;}decRef(){this.refs--;}getRuntimeData(){parsed++;return{};}}
 const source=new SkeletonData();source.skeletonJson=require('../../../assets/KinghtFallIconMap/com/Ani/cb/cb.json');const component={node:{},skeletonData:source},owner={ndAniMain:component},exports={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingNightlightRuntime.js'),'utf8'),{cc:{isValid:v=>!!v&&!v.destroyed},sp:{SkeletonData},require:()=>T,exports});
 const rows=[2,3].map(tier=>({Skin:'cb-painted-'+tier,Nightlight:{version:1,lights:{'mesh:building_aperture_rays:0':{x:tier*10}}}}));exports.prepare(owner,rows);assert.equal(component.skeletonData,source);assert.equal(parsed,1);
 exports.apply(owner,rows[0]);exports.apply(owner,rows[1]);assert.equal(parsed,1,'all tiers share the prepared rig with old glows removed');assert.equal(source.refs,1);
 exports.dispose(owner,true);assert.equal(component.skeletonData,null);assert.equal(source.refs,0);assert(owner._buildingNightlightPrepared===undefined);
});

test('adding and deleting lights preserves IDs, unknown data and undo, and never restores legacy lights',()=>{
 const store=new Store(root),config=store.documents.A.data,request={id:'4',levelIndex:0},row=config.BuildEnum[4].levelList[0];row.Nightlight={version:1,lights:{'mesh:building_aperture_rays:0':{x:17,future:'keep'}},future:{keep:true}};
 const before=copy(row.Nightlight),first=Data.add(T.layout(row),{x:10,y:20}),second=Data.add(first.value,{x:50,y:60});assert.notEqual(first.id,second.id);assert.deepEqual(T.value({Nightlight:first.value},first.id),{x:10,y:20,scaleX:1,scaleY:1,angle:0,flipX:false,flipY:false});
 const deleted=Data.remove(second.value,first.id);assert.equal(deleted.lights[first.id],undefined);assert.deepEqual(deleted.lights[second.id],second.value.lights[second.id]);const empty=Data.remove(deleted,second.id);assert.equal(T.emitters({Nightlight:empty}).length,0);assert.deepEqual(empty.future,before.future);assert.deepEqual(empty.lights['mesh:building_aperture_rays:0'],before.lights['mesh:building_aperture_rays:0']);const third=Data.add(empty,{x:0,y:0});assert.notEqual(third.id,first.id);assert.notEqual(third.id,second.id);
 store.change({version:store.version,edits:Data.edits(config,request,second.value,T.layout(row))});const version=store.version;store.change({version,edits:Data.edits(store.documents.A.data,request,second.value,second.value)});assert.equal(store.version,version);store.undo({version});assert.deepEqual(store.documents.A.data.BuildEnum[4].levelList[0].Nightlight,before);
 assert(T.issues({...third.value,emitters:[{id:third.id},{id:third.id}]}).length);assert(T.issues({...third.value,emitters:[{id:'sprite:0:0'}]}).length);let full=third.value;for(let i=1;i<T.maxLights;i++)full=Data.add(full,{x:0,y:0}).value;assert.throws(()=>Data.add(full,{x:0,y:0}),/64/);
});

test('native night artwork retains day motion and removes the original mesh and window overlays without mutating assets',()=>{
 for(const name of ['cb','by','mz','mf']){const source=copy(require('../../../assets/KinghtFallIconMap/com/Ani/'+name+'/'+name+'.json')),before=JSON.stringify(source),result=T.withoutLegacy(source);assert.notEqual(result,source);assert.equal(T.withoutLegacy(source),result);assert.equal(JSON.stringify(source),before);assert.deepEqual(result.animations.idle,source.animations.idle);assert.deepEqual(result.skins,source.skins);assert.deepEqual(result.bones,source.bones);for(const [slot,timeline]of Object.entries(source.animations.idle.slots||{})){if(timeline.attachment)assert.deepEqual(result.animations.idle_night.slots[slot].attachment,timeline.attachment);if(timeline.color)for(let i=0;i<timeline.color.length;i++)assert.equal(result.animations.idle_night.slots[slot].color[i].color.slice(6),timeline.color[i].color.slice(6));}}
});
