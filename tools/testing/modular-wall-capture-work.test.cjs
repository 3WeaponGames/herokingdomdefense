'use strict';
// CPU-only regression checks using the project's real authored gate and Spine runtime.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),vm=require('node:vm');
const assert=require('node:assert/strict'),test=require('node:test');
const project=process.env.HKD_TEST_PROJECT_ROOT||path.resolve(__dirname,'../..');
const owning=path.join(project,'assets/_script/KinghtFallDepthView.js'),source=fs.readFileSync(owning,'utf8');
const testFile=path.join(project,'tools/testing/gate-unit-depth.test.cjs'),local=Module.createRequire(testFile);
const helpers=new Function('require','__dirname',fs.readFileSync(testFile,'utf8')+'\nreturn{parse,Kit,Facing,Adjust,Assembly,engine,json};')(
  name=>name==='node:test'?()=>{}:local(name),path.dirname(testFile));
const engineAvailable={skip:!fs.existsSync(helpers.engine)};
function load(cc={v2:(x,y)=>({x,y})}){const exports={};vm.runInNewContext(source,{exports,cc,sp:{},require:name=>local(path.resolve(project,'assets/_script',name))});return exports;}
function cache(){return{poses:new Set(),transforms:new Map(),bounds:new Map()};}
function shape(list){return Array.from(list,x=>({kind:x.kind,order:x.order,key:x.key,slot:x.slot.data.name,attachment:x.attachment,vertices:Array.from(x.vertices),box:{...x.box},start:{...x.start},end:{...x.end},floor:x.floor&&Array.from(x.floor,p=>({...p}))}));}
function observe(skeleton){
  const calls={order:0,slotName:0,attachment:0,attachmentName:0,color:0};let order=skeleton.drawOrder;
  Object.defineProperty(skeleton,'drawOrder',{configurable:true,get(){calls.order++;return order;},set(value){order=value;}});
  const seen=new WeakSet();
  for(const slot of skeleton.slots){
    let name=slot.data.name,color=slot.color;const get=slot.getAttachment.bind(slot);
    Object.defineProperty(slot.data,'name',{configurable:true,get(){calls.slotName++;return name;},set(value){name=value;}});
    Object.defineProperty(slot,'color',{configurable:true,get(){calls.color++;return color;},set(value){color=value;}});
    slot.getAttachment=function(){calls.attachment++;const attachment=get();if(attachment&&!seen.has(attachment)){seen.add(attachment);let value=attachment.name;Object.defineProperty(attachment,'name',{configurable:true,get(){calls.attachmentName++;return value;},set(next){value=next;}});}return attachment;};
  }
  return{calls,clear(){for(const key of Object.keys(calls))calls[key]=0;}};
}

test('72 real gate poses share one current draw-order read and avoid redundant native-style surface getters',engineAvailable,t=>{
  const spine=require(helpers.engine),api=load(),main={convertToNodeSpaceAR:p=>p};let poses=0,orderReads=0;
  for(const face of ['NE','NW','SE','SW'])for(const tier of [1,2,3]){
    let json=helpers.Kit.install(helpers.json,helpers.json.wallKit.layout,undefined,{mirrorX:helpers.Facing.mirrorX(face),face,tier,adjustmentsData:helpers.Adjust.getData(),forceSplitClosed:true});
    if(helpers.Facing.reverse(face))json=helpers.Facing.mirrorJson(json);
    const data=helpers.parse(spine,json),skeleton=new spine.Skeleton(data),state=new spine.AnimationState(new spine.AnimationStateData(data));
    skeleton.setSkinByName('cq-rts-'+tier);skeleton.setToSetupPose();
    const observed=observe(skeleton),sign=helpers.Facing.mirrorX(face)?-1:1,renderer={enabled:true,node:{activeInHierarchy:true,convertToWorldSpaceAR:p=>({x:317+sign*p.x*1.7,y:-191+p.y*1.7})},skeletonData:{skeletonJson:json},_skeleton:skeleton};
    for(const night of [false,true])for(const direction of ['inward','outward','closed']){
      state.setAnimation(0,(direction==='closed'?'shut_outward':'open_'+direction)+(night?'_night':''),false);state.update(.3);state.apply(skeleton);skeleton.updateWorldTransform();
      // Separate caches supply an uncoupled geometry oracle for the shared-draw path.
      const expected=api.gateLeaves(renderer,main,cache()).concat(api.wallSurfaces(renderer,main,cache()));
      observed.clear();const shared=cache(),leaves=api.gateLeaves(renderer,main,shared),walls=api.wallSurfaces(renderer,main,shared),counts={...observed.calls};
      assert.deepEqual(shape(leaves.concat(walls)),shape(expected));assert.equal(leaves.length,2);
      assert.equal(counts.order,1,'A single frame crosses the draw-order getter once for both consumers');
      assert.equal(counts.attachmentName,2,'Only actual door attachments need their authored name');
      assert(counts.attachment<=skeleton.slots.length+walls.length,'Surface geometry reuses the attachment already read for each wall');
      assert(counts.color<=leaves.length*2+walls.length,'Unrelated slots do not need color reads');
      poses++;orderReads+=counts.order;
    }
  }
  assert.equal(poses,72);assert.equal(orderReads,72);t.diagnostic('72 real Spine poses; one draw-order read per draw; exact shared/independent geometry');
});

test('fresh surface draws observe edited names, draw order and attachment offsets without retaining stale metadata',engineAvailable,()=>{
  const spine=require(helpers.engine),api=load(),json=helpers.Kit.install(helpers.json,helpers.json.wallKit.layout,undefined,{face:'NE',tier:1,adjustmentsData:helpers.Adjust.getData(),forceSplitClosed:true});
  const skeleton=new spine.Skeleton(helpers.parse(spine,json)),state=new spine.AnimationState(new spine.AnimationStateData(skeleton.data));
  skeleton.setSkinByName('cq-rts-1');skeleton.setToSetupPose();state.setAnimation(0,'open_outward',false);state.update(.3);state.apply(skeleton);skeleton.updateWorldTransform();
  const main={convertToNodeSpaceAR:p=>p},renderer={enabled:true,node:{activeInHierarchy:true,convertToWorldSpaceAR:p=>p},skeletonData:{skeletonJson:json},_skeleton:skeleton};
  function draw(){const shared=cache(),actual=api.gateLeaves(renderer,main,shared).concat(api.wallSurfaces(renderer,main,shared));assert.deepEqual(shape(actual),shape(api.gateLeaves(renderer,main,cache()).concat(api.wallSurfaces(renderer,main,cache()))));return actual;}
  const first=draw(),part=skeleton.drawOrder.find(slot=>/^rts_wall_part_/.test(slot.data.name)&&slot.getAttachment()),name=part.data.name;
  part.data.name='not_wall';assert.equal(draw().length,first.length-1);part.data.name=name;
  skeleton.drawOrder=skeleton.drawOrder.slice().reverse();assert.notDeepEqual(draw().map(surface=>surface.order),first.map(surface=>surface.order));
  const before=draw().find(surface=>surface.slot===part).vertices.slice();part.getAttachment().offset[0]+=13;
  assert.notDeepEqual(Array.from(draw().find(surface=>surface.slot===part).vertices),Array.from(before),'Changed region vertices must be recomputed');
  const door=skeleton.drawOrder.find(slot=>/^rts_wall_leaf_/.test(slot.data.name)&&slot.getAttachment());door.getAttachment().name='not_a_door';
  assert.equal(draw().filter(surface=>surface.kind==='door').length,1);
});

const aliasFile=path.join(project,'tools/testing/gate-surface-alias.test.cjs'),aliasRequire=Module.createRequire(aliasFile);
const aliasText=fs.readFileSync(aliasFile,'utf8').split(/\r?\ntest\(/)[0];
const aliasFactory=new Function('require','__dirname',aliasText+'\nreturn fixture;')(aliasRequire,path.dirname(aliasFile));
function gateCrowd(count){
  const f=aliasFactory(source);let names=0;
  for(const slot of f.source._skeleton.slots){let name=slot.data.name;Object.defineProperty(slot.data,'name',{configurable:true,get(){names++;return name;},set(value){name=value;}});}
  const base=f.active[0],Node=base.actor.node.constructor,entries=Array.from({length:count},(_,index)=>{if(!index)return base;const actor={node:new Node('unit'+index,f.view.main)};actor.node.setPosition(base.actor.node.x,base.actor.node.y);actor.node.zIndex=base.actor.node.zIndex;return{...base,actor};});
  f.update(entries);return{f,names,keys:[...f.pass.leaves.values()].flatMap(records=>[...records.keys()]),counts:[...f.pass.leaves.values()].flatMap(records=>[...records.values()].map(record=>record.overlays.size))};
}
test('33 overlapping actors use discovered surface keys instead of repeating native slot-name reads per hit',engineAvailable,()=>{
  const one=gateCrowd(1),many=gateCrowd(33);
  assert.deepEqual(many.keys,one.keys);assert(many.keys.length>1);assert.equal(many.names,one.names,'Surface-name reads depend on discovery, not the number of actors');
  assert(many.counts.every(count=>count===33));assert.equal(many.f.pass.actors.size,33);one.f.pass.destroy();many.f.pass.destroy();
});

// Exercise the real fallback branch as a counterfactual, without keeping a copy
// of production code or changing renderer identity/ABI between the two scenes.
const fallbackSource=source.replace('var perSurfaceOnly=modular&&','var perSurfaceOnly=false&&modular&&');
assert.notEqual(fallbackSource,source,'The focused negative control must disable the actual bounds shortcut');
class NativeRenderer{}
let nativeAlias=aliasText.replace('const {GateOcclusion,gateLeaves}=helpers.load(cc)','const {GateOcclusion,gateLeaves,DepthView}=helpers.load(cc,{Skeleton:NativeRenderer})')
  .replace('const source={node,enabled:true,','const source=Object.assign(new NativeRenderer(),{node,enabled:true,')
  .replace('markForRender(){}};','markForRender(){}});').replace('return{pass,view,atlas,','return{cc,DepthView,pass,view,atlas,');
assert(nativeAlias.includes('Object.assign(new NativeRenderer()'));
const nativeFactory=new Function('require','__dirname','NativeRenderer',nativeAlias+'\nreturn fixture;')(aliasRequire,path.dirname(aliasFile),NativeRenderer);
function nativeFixture(text,kind='pure'){
  const f=nativeFactory(text),stats={pose:0,bbox:0},skeleton=f.source._skeleton,update=skeleton.updateWorldTransform.bind(skeleton);
  skeleton.updateWorldTransform=function(){stats.pose++;f.events.push('pose');return update();};
  f.source._nativeSkeleton={getBoundingBox(){stats.bbox++;f.events.push('bbox');const offset={set(x,y){this.x=x;this.y=y;}},size={set(x,y){this.x=x;this.y=y;}};skeleton.getBounds(offset,size,[]);return{x:offset.x,y:offset.y,width:size.x,height:size.y};}};
  f.cc.isValid=value=>!!value&&!value.dead;f.cc.sys={isNative:true};f.cc.ENGINE_VERSION='2.4.13';f.cc.director={getScene:()=>f.view.main};
  const actor=f.active[0].actor;actor.hp=100;f.view.game.ctrPlay=actor;f.view.game.gameData.getSoldierList=()=>[];f.view.game.gameData.getEnemyList=()=>[];
  const oldMask={node:{active:true}},overlay={node:{active:true}},object={node:f.source.node,sources:[f.source],masks:new Map([[actor,oldMask]]),overlay};
  Object.assign(f.view,{nativeCapture:true,captureSupported:true,nativeActors:new Map(),objects:[object],gateOcclusion:f.pass,sort(){}});Object.setPrototypeOf(f.view,f.DepthView.prototype);
  const passUpdate=f.pass.update;f.pass.update=function(...args){f.events.push('gate');return passUpdate.apply(this,args);};
  function sprite(){const item=new f.cc.Sprite();item.enabled=true;item.node=new f.cc.Node('mixedSprite',f.view.main);Object.assign(item.node,{width:48,height:70,anchorX:.5,anchorY:0});return item;}
  if(kind==='mixed sprite')object.sources.push(sprite());
  if(kind==='mixed non-modular Spine'){const other=new NativeRenderer();Object.assign(other,{enabled:true,node:new f.cc.Node('mixedSpine',f.view.main),_skeleton:skeleton,_nativeSkeleton:f.source._nativeSkeleton,skeletonData:{skeletonJson:{}}});object.sources.push(other);}
  if(kind==='non-modular')f.source.skeletonData={skeletonJson:{}};
  if(kind==='browser')f.view.nativeCapture=false;
  if(kind==='unsupported version')f.cc.ENGINE_VERSION='2.4.12';
  if(kind==='inactive group')object.node.activeInHierarchy=false;
  if(kind==='disabled source')f.source.enabled=false;
  if(kind==='inactive source'){object.node=new f.cc.Node('activeGroup',f.view.main);object.node.zIndex=40;f.source.node.activeInHierarchy=false;}
  if(kind==='shared in mixed group')f.view.objects.push({node:f.source.node,sources:[f.source,sprite()],masks:new Map(),overlay:{node:{active:true}}});
  function run(){f.events.length=0;f.view.update();return{stats:{...stats},events:f.events.filter(event=>event!=='bbox'),maskActive:oldMask.node.active,overlayActive:overlay.node.active,sourceRange:[f.source._startSlotIndex,f.source._endSlotIndex],captures:Array.from(f.pass.leaves.values(),records=>Array.from(records,([key,record])=>({key,center:{...record.center},size:{...record.size},signature:Array.from(record.signature).filter(value=>value===null||typeof value!=='object'),overlays:Array.from(record.overlays.values(),item=>({behind:item.behind,node:[item.node.x,item.node.y,item.node.zIndex],child:[item.child.x,item.child.y],tint:[item.tint.node.x,item.tint.node.y,item.tint.node.active]}))}))).flat()};}
  return{...f,stats,object,oldMask,run,sprite};
}
for(const kind of ['pure','mixed sprite','mixed non-modular Spine','non-modular','browser','unsupported version','inactive group','disabled source','inactive source','shared in mixed group']){
  test(kind+' keeps surface geometry and pose timing while skipping only eligible unused native bounds',engineAvailable,()=>{
    const before=nativeFixture(fallbackSource,kind),after=nativeFixture(source,kind),expected=before.run(),actual=after.run();
    assert.equal(actual.stats.pose,expected.stats.pose);
    if(kind==='pure'){assert.equal(expected.stats.bbox,1);assert.equal(actual.stats.bbox,0);assert.equal(actual.stats.pose,1);assert(actual.events.indexOf('pose')<actual.events.indexOf('gate'));}
    else assert.equal(actual.stats.bbox,expected.stats.bbox);
    delete expected.stats;delete actual.stats;assert.deepEqual(actual,expected);assert.equal(after.oldMask.node.active,false);assert.equal(after.object.overlay.node.active,false);before.pass.destroy();after.pass.destroy();
  });
}
test('72 moving draws settle the pose in the original phase and update real per-surface geometry without whole-rig native bounds',engineAvailable,t=>{
  const before=nativeFixture(fallbackSource),after=nativeFixture(source);
  for(let frame=0;frame<72;frame++){
    for(const f of [before,after]){f.source.node.x=frame*.2;f.source._skeleton.color.r=1-frame/200;f.source._skeleton.bones[0].x=frame*.1;}
    const expected=before.run(),actual=after.run();assert.equal(actual.stats.pose,frame+1);assert.equal(actual.stats.pose,expected.stats.pose);assert.equal(actual.stats.bbox,0);assert.equal(expected.stats.bbox,frame+1);
    delete expected.stats;delete actual.stats;assert.deepEqual(actual,expected);
  }
  assert.deepEqual(before.stats,{pose:72,bbox:72});assert.deepEqual(after.stats,{pose:72,bbox:0});t.diagnostic('72 real gate draws: pose settlement unchanged; unused native bounds 72 to 0; geometry, capture ordering and range restoration equal');before.pass.destroy();after.pass.destroy();
});
test('adding and removing mixed artwork restores native bounds immediately without replacing the source renderer',engineAvailable,()=>{
  const f=nativeFixture(source);f.run();assert.equal(f.stats.bbox,0);f.object.sources.push(f.sprite());f.run();assert.equal(f.stats.bbox,1);f.object.sources.pop();f.run();assert.equal(f.stats.bbox,1);assert.equal(f.stats.pose,3);f.pass.destroy();
});
