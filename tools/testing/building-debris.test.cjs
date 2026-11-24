'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function setup(width=200,delayed=false){
 class Node{
  constructor(name){this.name=name;this.active=true;this.x=this.y=0;this.width=this.height=0;this.anchorX=this.anchorY=.5;}
  setAnchorPoint(x,y){this.anchorX=x;this.anchorY=y;}
  setPosition(x,y){this.x=typeof x==='number'?x:x.x;this.y=typeof x==='number'?y:x.y;}
  setParent(parent){this.parent=parent;}
  setContentSize(w,h){this.width=w;this.height=h;}
  addComponent(T){return new T();}
  convertToWorldSpaceAR(p){return{x:p.x+this.x,y:p.y+this.y};}
  convertToNodeSpaceAR(p){return{x:p.x-this.x,y:p.y-this.y};}
  destroy(){this.destroyed=true;}
 }
 class Sprite{}Sprite.SizeMode={CUSTOM:1};const listeners=new Set(),requests=[],frame={name:'shared'};
 const cc={Node,Sprite,color:(r,g,b)=>({r,g,b}),v2:(x,y)=>({x,y}),isValid:n=>!!n&&!n.destroyed,Director:{EVENT_BEFORE_DRAW:'draw'},director:{on:(e,f)=>listeners.add(f),off:(e,f)=>listeners.delete(f)}};
 const m={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingDebris.js'),'utf8'),{cc,exports:m.exports,require:name=>require(path.join(root,'assets/_script',name))});
 const image=new Node('body');image.width=width;image.height=180;image.y=90;
 const native={color:{a:1}},secondary={color:{a:1}},smoke={color:{a:1}};
 const slots={fx:native,fx2:secondary,Smoke_04_00034:smoke};
 const owner={node:new Node('owner'),_buildingAppearance:{node:image},ndAniMain:{timeScale:1,_skeleton:{findSlot:n=>slots[n]}},loadSpriteFrame(bundle,name,done){requests.push({bundle,name,done});if(!delayed)done(frame);}};
 return{api:m.exports,owner,listeners,requests,frame,native,secondary,smoke,Node,cc};
}
test('one native debris texture scales uniformly to the original structure footprint',()=>{
 for(const width of [80,200,500]){const e=setup(width);e.api.capture(e.owner);e.owner.isDestroyed=true;e.api.update(e.owner,.2);const r=e.owner._sharedBuildingDebris.building;assert(!r.node.active);e.api.update(e.owner,.07);assert(r.node.active);assert.equal(r.node.width,width*.7);assert.equal(r.node.height/r.node.width,66/115);assert.equal(r.node.y,0);assert.equal(r.node.color.r,167);assert.equal(e.requests[0].name,'buildings/shared/debris');assert.equal(e.native.color.a,0);assert.equal(e.smoke.color.a,1);e.api.destroy(e.owner);assert.equal(e.listeners.size,0);}
});
test('only one native rubble slot remains while the shared sprite loads',()=>{
 const e=setup(200,true);e.api.capture(e.owner);e.owner.isDestroyed=true;e.api.update(e.owner,1);const r=e.owner._sharedBuildingDebris.building;
 assert(!r.node.active);assert.equal(e.native.color.a,1);assert.equal(e.secondary.color.a,0);
 e.requests[0].done(e.frame);assert(r.node.active);for(const fn of e.listeners)fn();
 assert.equal(e.native.color.a,0);assert.equal(e.secondary.color.a,0);assert.equal(e.smoke.color.a,1);
 e.api.clear(e.owner);assert(r.node.destroyed);assert.equal(e.listeners.size,0);
});
test('farm debris uses the same resource and repairs remove old nodes without altering shared attachments',()=>{
 const e=setup(),attachment={computeWorldVertices(b,out){out.push(-40,0,40,0,40,30,-40,30);}},field={attachment,slot:{bone:{}}},source={node:new e.Node('plots')};
 e.api.field(e.owner,source,field,true);const r=field.debris;assert(r.node.active);assert.equal(r.sprite.spriteFrame,e.frame);assert.equal(r.node.width,56);e.api.field(e.owner,source,field,false);assert(!r.node.active);assert.equal(field.attachment,attachment);e.api.discard(e.owner,r);assert(r.node.destroyed);assert.equal(e.owner._sharedBuildingDebris.records.length,0);
});
test('a mill collapse retires existing crop debris and keeps a single building pile', () => {
 const e=setup(), attachment={computeWorldVertices(_bone,out){out.push(-40,0,40,0,40,30,-40,30);}};
 const source={node:new e.Node('plots')}, crop={attachment,slot:{bone:{}}};
 e.api.field(e.owner,source,crop,true);
 const old=crop.debris;
 assert(old.node.active);
 e.api.capture(e.owner);e.owner.isDestroyed=true;e.api.update(e.owner,1);
 e.api.field(e.owner,source,crop,true);
 assert(old.node.destroyed);assert.equal(crop.debris,null);
 const state=e.owner._sharedBuildingDebris;
 assert.equal(state.records.length,1);assert(state.building.node.active);
 e.api.clear(e.owner);
 e.owner.isDestroyed=false;e.api.field(e.owner,source,crop,true);
 assert(crop.debris.node.active,'an individually destroyed crop can show rubble again after repair');
});
test('native crop regions use four current offset vertices and sample each live bone field once',()=>{
 const e=setup(),offsets=new Float32Array([-40,0,40,0,40,30,-40,30]),matrix={a:0,b:-2,c:1,d:0,worldX:30,worldY:40},reads={},bone={};
 for(const key of Object.keys(matrix))Object.defineProperty(bone,key,{get(){reads[key]=(reads[key]||0)+1;return matrix[key];}});
 let offsetReads=0;const attachment={getOffset(){offsetReads++;return offsets;}},field={attachment,slot:{bone}},source={node:new e.Node('plots')};
 source.node.setPosition(10,20);e.owner.node.setPosition(100,-10);
 e.api.field(e.owner,source,field,true);const record=field.debris;
 assert(record.node.active);assert.equal(record.node.width,42);assert.equal(record.node.x,-90);assert.equal(record.node.y,30);
 assert.equal(offsetReads,1);for(const key of Object.keys(matrix))assert.equal(reads[key],1,key+' sampled once');
 Object.assign(matrix,{a:-1,b:.5,c:0,d:2,worldX:-5,worldY:7});
 e.api.field(e.owner,source,field,true);
 assert.equal(field.debris,record);assert.equal(record.node.width,66.5);assert.equal(record.node.x,-87.5);assert.equal(record.node.y,37);
 assert.equal(offsetReads,2);for(const key of Object.keys(matrix))assert.equal(reads[key],2,key+' refreshed on the next evaluation');
 assert.deepEqual(Array.from(offsets),[-40,0,40,0,40,30,-40,30]);assert.equal(field.attachment,attachment);
});
test('web crop region and mesh vertex APIs retain their arguments and precedence over native offsets',()=>{
 for(const mesh of [false,true]){
  const e=setup(),bone={},slot={bone},calls=[],attachment={getOffset(){throw Error('Web attachments must keep their own vertex method');},computeWorldVertices(...args){calls.push(args);const output=args[mesh?3:1];output.push(-40,0,40,0,40,30,-40,30);}};
  if(mesh)attachment.worldVerticesLength=8;
  const field={attachment,slot};e.api.field(e.owner,{node:new e.Node('plots')},field,true);
  assert(field.debris.node.active);assert.equal(field.debris.node.width,56);assert.equal(field.debris.node.x,0);assert.equal(field.debris.node.y,0);
  assert.equal(calls.length,1);const args=calls[0];assert.equal(args[0],mesh?slot:bone);assert.equal(args.length,mesh?6:4);
  if(mesh){assert.equal(args[1],0);assert.equal(args[2],8);assert.equal(args[4],0);assert.equal(args[5],2);}else{assert.equal(args[2],0);assert.equal(args[3],2);}
 }
});
test('unsupported native crop attachments and malformed offsets leave debris hidden without inventing bounds',()=>{
 for(const attachment of [{},{getVertices:()=>[-1,-1,1,-1,1,1,-1,1]},{getOffset:()=>[]},{getOffset:()=>[1,2,3,4]},{getOffset:()=>[0,0,1,0,1,1,NaN,1]},{getOffset:()=>[0,0,1,0,1,1,'0',1]}]){
  const e=setup(),field={attachment,slot:{bone:{a:1,b:0,c:0,d:1,worldX:0,worldY:0}}};
  assert.doesNotThrow(()=>e.api.field(e.owner,{node:new e.Node('plots')},field,true));
  assert.equal(field.debris.node.active,false);assert.equal(field.debris.visible,false);assert.equal(field.debris.node.width,0);
 }
});

const cropEngine=path.join(process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine','extensions/spine/lib/spine.js');
const cropNativeBinding=path.resolve(cropEngine,'../../../../../cocos2d-x/cocos/scripting/js-bindings/auto/jsb_cocos2dx_spine_auto.cpp');
test('shipped building destruction rigs replace both rubble slots even after native animation reapplies them', {skip:!fs.existsSync(cropEngine)}, () => {
 const spine=require(cropEngine);
 const cfg=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
 for(const native of [false,true]) for(const [name,type] of [['by',3],['cb',1],['mz',4],['mf',5],['jt',2]]){
  const e=setup(200,true), folder=path.join(root,'assets/KinghtFallIconMap/com/Ani',name);
  const label=name+(native?'/native':'/web');
  const json=JSON.parse(fs.readFileSync(path.join(folder,name+'.json'),'utf8'));
  const atlas=new spine.TextureAtlas(fs.readFileSync(path.join(folder,name+'.atlas'),'utf8'), filename=>{
   const png=fs.readFileSync(path.join(folder,filename));
   return new spine.FakeTexture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)});
  });
  const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json);
  const skeleton=new spine.Skeleton(data), animation=new spine.AnimationState(new spine.AnimationStateData(data));
  skeleton.setSkinByName(cfg.BuildEnum[type].levelList[0].Skin);
  skeleton.setToSetupPose();
  const rig=native?{
   findSlot:name=>skeleton.findSlot(name),
   findBone(name){
    const bone=skeleton.findBone(name);
    return {isActive:()=>bone.active,setActive:active=>{bone.active=active;}};
   },
   getAttachment(index,name){
    const attachment=skeleton.getAttachment(index,name);
    return attachment&&{getColor:()=>attachment.color};
   }
  }:skeleton;
  Object.assign(e.owner.ndAniMain,{node:new e.Node(name),skeletonData:{skeletonJson:json},_skeleton:rig,_nativeSkeleton:native?{}:null});
  e.api.capture(e.owner);e.owner.isDestroyed=true;
  animation.setAnimation(0,'destroy',false);animation.update(.4);animation.apply(skeleton);
  const primary=skeleton.findSlot('fx'), secondary=skeleton.findSlot('fx2'), smoke=skeleton.findSlot('Smoke_04_00034');
  function visible(slot){
   const attachment=slot.getAttachment();
   return slot.bone.active&&attachment&&slot.color.a*attachment.color.a>0;
  }
  assert(visible(primary)&&visible(secondary),label);
  const smokeAlpha=smoke.color.a;
  e.api.update(e.owner,.4);
  if(native) animation.apply(skeleton);
  assert(visible(primary)&&!visible(secondary),label);
  e.requests[0].done(e.frame);
  if(native) animation.apply(skeleton);
  assert(!visible(primary)&&!visible(secondary),label);
  assert.equal(smoke.color.a,smokeAlpha,label);
  assert.equal(e.owner._sharedBuildingDebris.records.length,1,label);
  assert(e.owner._sharedBuildingDebris.building.node.active,label);
  e.api.clear(e.owner);
  assert(primary.bone.active,label+' restores the per-instance bone for repair');
  e.api.destroy(e.owner);
 }
});
function nativeCropColor(source){
 // JSB exposes four float properties, not the web Color.set method.
 const values={},color={};for(const key of ['r','g','b','a']){values[key]=Math.fround(source[key]);Object.defineProperty(color,key,{enumerable:true,get:()=>values[key],set:value=>{values[key]=Math.fround(value);}});}
 return Object.seal(color);
}
test('native crop Color fixture matches the installed Creator JSB property surface',{skip:!fs.existsSync(cropNativeBinding)?'Creator native Spine binding supplies the ABI contract':false},()=>{
 const source=fs.readFileSync(cropNativeBinding,'utf8'),start=source.indexOf('bool js_register_cocos2dx_spine_Color('),end=source.indexOf('\n}',start),registration=source.slice(start,end);
 assert(start>=0);assert.deepEqual(Array.from(registration.matchAll(/defineProperty\("([^"]+)"/g),m=>m[1]),['r','g','b','a']);
 assert.deepEqual(Array.from(registration.matchAll(/defineFunction\("([^"]+)"/g),m=>m[1]),['clamp']);
 assert.equal(nativeCropColor({r:1,g:1,b:1,a:1}).set,undefined);
});
function authoredCrops(native){
 const e=setup(),spine=require(cropEngine),dir=path.join(root,'assets/KinghtFallIconMap/com/Ani/td'),json=JSON.parse(fs.readFileSync(dir+'/td.json'));
 const atlas=new spine.TextureAtlas(fs.readFileSync(dir+'/td.atlas','utf8'),name=>{const png=fs.readFileSync(dir+'/'+name);return{setFilters(){},setWraps(){},getImage:()=>({width:png.readUInt32BE(16),height:png.readUInt32BE(20)})};});
 const skeleton=new spine.Skeleton(new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json)),cfg=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'))).BuildEnum[5].levelList[0];
 skeleton.setSkinByName(cfg.Skin);skeleton.setToSetupPose();skeleton.updateWorldTransform();
 const copies=new WeakMap();function region(value){
  if(!value||!native)return value;if(copies.has(value))return copies.get(value);
  assert(value instanceof spine.RegionAttachment,'authored mill crop remains a native region');
  // Creator2.4.13 binds RegionAttachment.getOffset(), not computeWorldVertices.
  const copy={getOffset:()=>value.offset};for(const key of ['name','path','x','y','width','height','scaleX','scaleY'])copy[key]=value[key];copies.set(value,copy);return copy;
 }
 const slots=skeleton.slots.map(slot=>({data:slot.data,bone:slot.bone,color:native?nativeCropColor(slot.color):slot.color,getAttachment(){return this.attachment;},setAttachment(value){this.attachment=value;}}));
 const rig={slots,skin:{getAttachment:(index,name)=>region(skeleton.skin.getAttachment(index,name))},findSlot:name=>slots.find(slot=>slot.data.name===name)};
 Object.assign(e.owner,{buildInfo:{cfg},buildCfg:{enumValue:5},ndAniDown:{node:new e.Node('plots'),_skeleton:rig,skeletonData:{skeletonJson:json}},getIsWork:()=>true});
 const modules={BuildingDebris:e.api};function load(name){if(modules[name])return modules[name];if(name!=='MillFieldDefense'&&name!=='MillFieldPresentation')return require(path.join(root,'assets/_script',name));const module={exports:{}};modules[name]=module.exports;vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8'),{cc:e.cc,module,exports:module.exports,require:load});return module.exports;}
 const runtime=new(load('MillFieldDefense').Runtime)(e.owner,{ndMain:new e.Node('main'),ndUI:new e.Node('ui')});e.owner._millFields=runtime;runtime.apply();assert.equal(runtime.fields.length,cfg.MillDefense.fields);
 const mill=fs.readFileSync(path.join(root,'assets/_script/KinghtFallBuildMill.js'),'utf8');
 function method(source,name,context={}){const match=source.match(new RegExp('_ctor.prototype.'+name+' = (function \\([^)]*\\) \\{[\\s\\S]*?\\n  \\});'));assert(match,name);return vm.runInNewContext('('+match[1]+')',context);}
 const base=fs.readFileSync(path.join(root,'assets/_script/KinghtFallBuildBase.js'),'utf8');
 e.owner.restoreFieldHealth=method(mill,'restoreFieldHealth');e.owner.getBranchCfg=index=>index===cfg.index?cfg:null;
 e.owner.setLevel=index=>{e.owner.index=index;runtime.apply();};
 const setSave=method(mill,'setSave',{t:{prototype:{setSave:method(base,'setSave')}}});
 return{...e,runtime,restore:e.owner.restoreFieldHealth,setSave};
}
for(const restore of [false,true])test('actual authored '+(restore?'saved dead-crop restore':'crop death')+' shares finite matching web/native debris geometry',{skip:!fs.existsSync(cropEngine)&&!process.env.COCOS_ENGINE_ROOT?'Creator Spine runtime supplies the authored crop poses':false},()=>{
  const results=[];
  for(const native of [false,true]){
   const e=authoredCrops(native),r=e.runtime,field=r.fields[0],attachment=field.attachment;r.fighting=true;
   if(restore)e.restore.call(e.owner,[{slot:field.slot.data.name,hp:0}]);else{field.onAttacked(field.hpMax+1);r.tick(.2);}
   assert.equal(field.hp,0);assert.equal(field.slot.getAttachment(),null);assert(field.debris.node.active);assert.equal(field.attachment,attachment);assert(r.fields[1].hp>0);
   const n=field.debris.node;assert([n.width,n.height,n.x,n.y].every(Number.isFinite));assert(n.width>0&&n.height>0);results.push([n.width,n.height,n.x,n.y]);
   for(const draw of e.listeners)draw();assert(field.debris.node.active,'the normal before-draw sync keeps ruined crops visible');
   r.destroy();assert.equal(e.listeners.size,0);
  }
  assert.deepEqual(results[1],results[0],restore?'restoring a dead crop':'revealing crop death');
});
test('authored crop death colors and saved dead restore agree on web and native property colors',{skip:!fs.existsSync(cropEngine)?'Creator Spine runtime supplies the authored crop poses':false},()=>{
 const traces=[];
 for(const native of [false,true]){
  const e=authoredCrops(native),r=e.runtime,field=r.fields[0],live=r.fields[1],channels=color=>['r','g','b','a'].map(key=>color[key]),original=channels(live.slot.color);let notified=0;
  e.owner.onFieldHealthChanged=()=>notified++;r.fighting=true;
  assert.equal(field.onAttacked(field.hpMax+1),field.hpMax);assert.equal(notified,1);assert.equal(field.deathTime,0);
  const trace=[channels(field.slot.color)];assert(field.slot.getAttachment());assert.equal(field.addon.color.a,0);
  r.tick(.1);trace.push(channels(field.slot.color));assert(field.slot.getAttachment());assert(!field.debris||!field.debris.node.active);
  r.tick(.07);trace.push(channels(field.slot.color));assert.equal(field.slot.getAttachment(),null);assert(field.debris.node.active);assert.deepEqual(trace[2],[1,1,1,1]);
  assert.deepEqual(channels(live.slot.color),original,'live crop color is untouched');
  const savedSlot=field.slot.data.name;e.setSave.call(e.owner,{point:9,level:e.owner.buildInfo.cfg.index,millFields:[{slot:savedSlot,hp:0}]});
  const restored=r.fields.find(value=>value.slot.data.name===savedSlot);assert.equal(restored.hp,0);assert.equal(restored.deathTime,undefined);assert.equal(restored.slot.getAttachment(),null);assert(restored.debris.node.active);
  assert.deepEqual(channels(restored.slot.color),[1,1,1,1]);assert.equal(notified,1,'restoring dead health never replays damage/income callbacks');
  for(const draw of e.listeners)draw();assert(restored.debris.node.active);assert.equal(restored.slot.getAttachment(),null);
  traces.push(trace);r.destroy();assert.equal(e.listeners.size,0);
 }
 assert.deepEqual(traces[0][0],[167/255,167/255,167/255,240/255],'authored stepped destruction color');
 assert.deepEqual(traces[0][1],traces[0][0],'authored stepped key remains until .1667 seconds');
 traces[0].forEach((values,index)=>values.forEach((value,channel)=>assert(Math.abs(value-traces[1][index][channel])<1e-6,'native float precision preserves each authored channel')));
});
test('destroyed owners reject late resource callbacks and cannot revive retired debris',()=>{
 const e=setup(200,true);e.api.capture(e.owner);e.owner.isDestroyed=true;e.api.update(e.owner,1);const r=e.owner._sharedBuildingDebris.building;e.api.destroy(e.owner);e.requests[0].done(e.frame);assert(r.node.destroyed);assert(!r.node.active);assert.equal(e.owner._sharedBuildingDebris,null);assert.equal(e.listeners.size,0);
});
test('native destruction clocks reveal debris after combat updates stop, including castle defeat',()=>{
 const e=setup();e.owner.ndAniMain.skeletonData={skeletonJson:{animations:{destroy:{slots:{fx:{attachment:[{time:.4,name:'fx'}]}}}}}};let elapsed=.2;e.owner.ndAniMain.getCurrent=()=>({animation:{name:'destroy'},trackTime:elapsed});e.api.capture(e.owner);e.owner.isDestroyed=true;for(const fn of e.listeners)fn();assert(!e.owner._sharedBuildingDebris.building.node.active);elapsed=.41;for(const fn of e.listeners)fn();assert(e.owner._sharedBuildingDebris.building.node.active);e.api.destroy(e.owner);
});
test('retiring a tower native rubble renderer cannot hide or flicker the shared replacement',()=>{
 const e=setup();e.owner._buildingAppearance.deathRubbleFx=new e.Node('native rubble');e.owner._buildingAppearance.deathRubbleSpine={getCurrent:()=>({animation:{name:'destroy'},trackTime:.25})};e.api.capture(e.owner);e.owner.isDestroyed=true;e.api.update(e.owner,.3);assert(e.owner._sharedBuildingDebris.building.node.active);assert(!e.owner._buildingAppearance.deathRubbleFx.active);for(let i=0;i<10;i++)for(const fn of e.listeners)fn();assert(e.owner._sharedBuildingDebris.building.node.active);e.api.destroy(e.owner);
});
test('late authored ruins replace the shared rubble in the same draw', () => {
 const e=setup();
 e.api.capture(e.owner);e.owner.isDestroyed=true;e.api.update(e.owner,1);
 const record=e.owner._sharedBuildingDebris.building;
 assert(record.node.active);
 e.owner._buildingAppearance.destroyedNode=new e.Node('Authored ruins');
 e.native.color.a=e.secondary.color.a=1;
 for(const draw of e.listeners)draw();
 assert(!record.node.active);assert(e.owner._buildingAppearance.destroyedNode.active);
 assert.equal(e.native.color.a,0);assert.equal(e.secondary.color.a,0);assert.equal(e.smoke.color.a,1);
});

function wall(e,left=4,right=4,gate=true){
 const plan=require('../../assets/_script/WallAssembly').layout({nativeVersion:2,left,right,gate,start:'post',end:'post'});
 e.owner.ndAniMain.node=new e.Node('wall');e.owner.ndAniMain.skeletonData={skeletonJson:{wallKit:{layout:plan},skins:[]}};
 return plan;
}
test('a wall has one pile with the usual reveal, repair and teardown lifecycle',()=>{
 const e=setup(200,true);wall(e);e.api.capture(e.owner);const state=e.owner._sharedBuildingDebris,record=state.building;
 assert.equal(state.records.length,1);assert.equal(state.records[0],record);
 e.owner.isDestroyed=true;e.api.update(e.owner,1);assert(!record.node.active);assert.equal(e.native.color.a,1);
 e.requests[0].done(e.frame);assert(record.node.active);for(const fn of e.listeners)fn();assert.equal(e.native.color.a,0);
 e.owner.isDestroyed=false;e.api.update(e.owner,0);assert(!record.node.active);
 e.api.clear(e.owner);assert(record.node.destroyed);assert.equal(state.records.length,0);assert.equal(e.listeners.size,0);
 e.api.capture(e.owner);assert.equal(state.records.length,1);assert.notEqual(state.building,record);
 e.api.destroy(e.owner);assert.equal(e.owner._sharedBuildingDebris,null);
});
test('a second wall collapse replaces the old pile and a late frame cannot revive it',()=>{
 const e=setup(200,true);wall(e);e.api.capture(e.owner);const old=e.owner._sharedBuildingDebris.building;wall(e,1,1);e.api.capture(e.owner);
 assert(old.node.destroyed);assert.equal(e.owner._sharedBuildingDebris.records.length,1);
 e.owner.isDestroyed=true;e.api.update(e.owner,1);e.api.destroy(e.owner);e.requests[0].done(e.frame);assert(!old.node.active);assert.equal(e.owner._sharedBuildingDebris,null);assert.equal(e.listeners.size,0);
});
test('native wall debris stays compact and both legacy slots clear after reveal',()=>{
 const e=setup(),slot={color:{a:1}},down={color:{a:1}};wall(e);delete e.owner.ndAniMain._skeleton;
 e.owner.ndAniMain._nativeSkeleton={getBoundingBox(){throw Error('The aggregate wall bounds must not size its rubble');}};
 e.owner.ndAniMain.findSlot=name=>name==='fx'?slot:null;e.owner.ndAniDown={findSlot:name=>name==='fx2'?down:null};
 let time=.1;e.owner.ndAniMain.getCurrent=()=>({animation:{name:'destroy'},trackTime:time});e.api.capture(e.owner);e.owner.isDestroyed=true;
 const record=e.owner._sharedBuildingDebris.building;
 for(const fn of e.listeners)fn();assert(!record.node.active);assert.equal(slot.color.a,1);
 time=1;for(const fn of e.listeners)fn();assert(record.node.active);assert.equal(slot.color.a,0);assert.equal(down.color.a,0);e.api.destroy(e.owner);
});
test('the shared resource is the exact shipped mill debris and no tower preloads custom ruins',()=>{
 const {decode}=require('../../packages/hkd-characters/lib/png-atlas'),source=decode(fs.readFileSync(path.join(root,'assets/KinghtFallIconMap/com/Ani/mf/mf.png'))),target=decode(fs.readFileSync(path.join(root,'assets/resources/buildings/shared/debris.png')));
 assert.deepEqual([target.width,target.height],[115,66]);for(let y=0;y<66;y++)assert.deepEqual(Buffer.from(target.rgba).subarray(y*115*4,(y+1)*115*4),Buffer.from(source.rgba).subarray(((29+y)*source.width+2)*4,((29+y)*source.width+117)*4));
 for(const name of ['KinghtFallConfig','configs']){const config=JSON.parse(fs.readFileSync(path.join(root,'assets',name,'GameJsonCfg.json')));for(const row of config.BuildEnum[2].levelList)assert.equal(row.Appearance?.destroyed,undefined);}
 const atlas=fs.readFileSync(path.join(root,'assets/KinghtFallIconMap/com/Ani/td/td.atlas'),'utf8');assert(!atlas.includes('td-ruins.png'));
});
