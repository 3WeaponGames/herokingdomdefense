'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Core=require('../../assets/_script/CharacterPartsCore');
const engine=process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const runtime=path.join(engine,'extensions/spine/lib/spine.js');
test('appearance keys isolate allies, enemies, hero and all boss forms',()=>{
  assert.equal(Core.actorKey({cfg:{ID:90001}},'ally'),'ally:90001:default');assert.equal(Core.actorKey({cfg:{ID:90001}},'enemy'),'enemy:90001:default');
  assert.equal(Core.actorKey({},'hero'),'hero:hero:default');assert.equal(Core.actorKey({cfg:{ID:90011},spIdx:1},'enemy'),'enemy:90011:2');
});
if(!fs.existsSync(runtime)&&!process.env.COCOS_ENGINE_ROOT)test('real Spine character part integration',{skip:'Install Creator 2.4.13 or set COCOS_ENGINE_ROOT'},()=>{});
else{
const spine=require(runtime),manifest=require('../../assets/resources/character-parts/catalog.json'),looks=require('../../assets/resources/characters/catalog.json');
const assets=Object.fromEntries(manifest.parts.map(v=>[v.id,v])),example=looks.profiles['royal-guard'];
function rig(){
  const dir=path.join(root,'assets/KinghtFallEnemyAni/wqyl_bb'),png=fs.readFileSync(path.join(dir,'wqyl_bb.png'));
  const atlas=new spine.TextureAtlas(fs.readFileSync(path.join(dir,'wqyl_bb.atlas'),'utf8'),()=>new spine.FakeTexture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)}));
  const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(fs.readFileSync(path.join(dir,'wqyl_bb.json'))));
  const skeleton=new spine.Skeleton(data);skeleton.setSkinByName('lan');skeleton.setToSetupPose();skeleton.updateWorldTransform();
  const textures=Object.fromEntries(example.parts.map(p=>[p.sprite,new spine.FakeTexture({width:assets[p.sprite].width,height:assets[p.sprite].height})]));
  return {data,skeleton,textures};
}
function vertices(slot){const a=slot.getAttachment(),out=[];if(a instanceof spine.RegionAttachment)a.computeWorldVertices(slot.bone,out,0,2);else if(a instanceof spine.MeshAttachment)a.computeWorldVertices(slot,0,a.worldVerticesLength,out,0,2);return out;}
test('helmet and weapon follow selected bones through idle, move, attack and mirrored poses without changing animations',()=>{
  const f=rig(),source=f.data,definition=JSON.stringify(source.bones.map(b=>({name:b.name,x:b.x,y:b.y}))),state=new spine.AnimationState(new spine.AnimationStateData(f.data));
  const fitted=Core.prepare(spine,f.skeleton,example.parts,assets,f.textures);
  for(const animation of ['idle','move','attack'])for(const direction of [-1,1])for(const time of [0,.17,.53]){
    Core.restore(fitted);f.skeleton.setToSetupPose();f.skeleton.scaleX=direction;state.setAnimation(0,animation,true);state.update(time);state.apply(f.skeleton);f.skeleton.updateWorldTransform();const current=state.getCurrent(0),trackTime=current.trackTime;
    Core.apply(fitted);
    for(const entry of fitted.entries){assert.equal(entry.slot.getAttachment(),entry.attachment);assert.equal(entry.attachment._characterBone,f.skeleton.findBone(entry.part.bone));const expected=[];spine.RegionAttachment.prototype.computeWorldVertices.call(entry.attachment,entry.attachment._characterBone,expected,0,2);assert.deepEqual(vertices(entry.slot),expected);}
    assert.equal(state.getCurrent(0),current);assert.equal(current.trackTime,trackTime);
  }
  assert.equal(JSON.stringify(source.bones.map(b=>({name:b.name,x:b.x,y:b.y}))),definition);
});
test('draw-order offsets do not accumulate, and restore leaves original skins and other instances intact',()=>{
  const f=rig(),other=new spine.Skeleton(f.data);other.setSkinByName('lan');other.setToSetupPose();const original=f.skeleton.slots.map(s=>s.getAttachment()),order=f.skeleton.drawOrder.slice(),parts=JSON.parse(JSON.stringify(example.parts));parts[0].order=2;
  const fitted=Core.prepare(spine,f.skeleton,parts,assets,f.textures);Core.apply(fitted);const once=f.skeleton.drawOrder.slice();for(let i=0;i<100;i++)Core.apply(fitted);assert.deepEqual(f.skeleton.drawOrder,once);
  assert.deepEqual(other.slots.map(s=>s.getAttachment()),original);Core.restore(fitted);assert.deepEqual(f.skeleton.slots.map(s=>s.getAttachment()),original);assert.deepEqual(f.skeleton.drawOrder,order);assert.equal(f.skeleton.skin.name,'lan');
});
test('fitted parts remain present in the existing depth and silhouette renderer',()=>{
  const f=rig(),fitted=Core.prepare(spine,f.skeleton,example.parts,assets,f.textures);Core.apply(fitted);
  class Skeleton{}const context={exports:{},cc:{v2:(x,y)=>({x,y})},sp:{Skeleton,spine}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallDepthView.js'),'utf8'),context);
  const source=Object.assign(new Skeleton(),{_skeleton:f.skeleton,skeletonData:f.data,node:{activeInHierarchy:true,convertToWorldSpaceAR:p=>p},enabled:true}),target={_skeleton:new spine.Skeleton(f.data),skeletonData:f.data,markForRender(){}};
  const cache={poses:new Set(),bounds:new Map(),transforms:new Map(),vertexStore:new WeakMap()};
  context.exports.bounds(source,{convertToNodeSpaceAR:p=>p},cache);context.exports.copyPose(source,target,{},cache);
  for(const entry of fitted.entries)assert.deepEqual(vertices(target._skeleton.findSlot(entry.part.slot)),vertices(entry.slot));
});
function componentFixture(options){
  options=options||{};const f=rig(),requests=[],pending=[],config=JSON.parse(JSON.stringify(looks));
  if(options.unassigned)config.assignments={};if(options.hero){config.assignments={'hero:hero:default':'royal-guard'};config.profiles['royal-guard'].base={type:'hero',id:'hero'};}
  config.profiles['royal-guard'].scale=options.scale||1;
  const renderer={_skeleton:f.skeleton,skeletonData:{uuid:example.parts[0].layer},uuid:'renderer',node:{activeInHierarchy:true,scaleX:.5,scaleY:.5},setSkin(name){this._skeleton.setSkinByName(name);this._skeleton.setSlotsToSetupPose();},setSlotsToSetupPose(){this._skeleton.setSlotsToSetupPose();}};
  const components=[],node={activeInHierarchy:true,getComponent(Type){return components.find(c=>c instanceof Type);},addComponent(Type){const value=new Type();components.push(value);return value;}};
  const actor=options.hero?{node,ctrPlayAni:{spAniBody:renderer},hp:100,attack:12}:{node,spAni:renderer,cfg:{ID:90001},hp:100,attack:12,navigationTeam:'friendly'};
  class Component{}class SkeletonTexture extends spine.FakeTexture{setRealTexture(value){this.real=value;}}
  const cc={Component,JsonAsset:class{},Texture2D:class{},isValid:()=>true,warn(){},resources:{load(resource,type,callback){requests.push(resource);const call=()=>{if(resource==='character-parts/catalog')callback(null,{json:manifest});else if(resource==='characters/catalog')callback(null,{json:config});else if(resource==='hero-items/catalog')callback(null,{json:{version:1,profiles:{},assignments:{}}});else{const asset=manifest.parts.find(a=>a.resource===resource);callback(null,{width:asset.width,height:asset.height});}};options.async?pending.push(call):call();}},Class(def){function C(){}C.prototype=Object.assign(Object.create(def.extends.prototype),def);return C;}};
  const itemContext={exports:{},cc,require(){throw Error('An unassigned item must not access player progress');}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroItemLooks.js'),'utf8'),itemContext);
  const context={exports:{},require:id=>{if(id==='CharacterPartsCore')return Core;if(id==='HeroItemLooks')return itemContext.exports;throw Error('Unexpected module '+id);},cc,sp:{spine,SkeletonTexture}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/CharacterAppearance.js'),'utf8'),context);
  return {f,actor,renderer,config,requests,bind:()=>context.exports.bind(actor,options.hero?'hero':'ally'),flush(){while(pending.length)pending.shift()();}};
}
test('runtime equips the saved example and pooling restores original visuals without touching combat state',()=>{
  const f=componentFixture({scale:1.3}),original=f.f.skeleton.slots.map(s=>s.getAttachment()),component=f.bind();component.lateUpdate();component.lateUpdate();
  assert(example.parts.every(p=>f.f.skeleton.findSlot(p.slot).getAttachment().name==='character:'+p.id));assert.equal(f.renderer.node.scaleY,.65);assert.equal(f.actor.hp,100);assert.equal(f.actor.attack,12);
  f.actor.cfg.ID=90002;component.lateUpdate();assert.deepEqual(f.f.skeleton.slots.map(s=>s.getAttachment()),original);assert.equal(f.renderer.node.scaleY,.5);
  f.actor.cfg.ID=90001;component.lateUpdate();component.onDisable();assert.deepEqual(f.f.skeleton.slots.map(s=>s.getAttachment()),original);assert.equal(f.renderer.node.scaleY,.5);
});
test('unassigned units keep their exact original slots and never load part textures',()=>{
  const f=componentFixture({unassigned:true}),before=f.f.skeleton.slots.map(s=>s.getAttachment()),c=f.bind();for(let i=0;i<3;i++)c.lateUpdate();assert.deepEqual(f.f.skeleton.slots.map(s=>s.getAttachment()),before);assert.equal(f.requests.filter(p=>p.startsWith('character-parts/Parts/')).length,0);
});
test('late texture completion cannot equip an inactive actor and the full hero path is supported',()=>{
  const f=componentFixture({async:true}),before=f.f.skeleton.slots.map(s=>s.getAttachment()),c=f.bind();f.flush();c.lateUpdate();f.actor.node.activeInHierarchy=false;f.flush();c.lateUpdate();assert.deepEqual(f.f.skeleton.slots.map(s=>s.getAttachment()),before);f.actor.node.activeInHierarchy=true;c.lateUpdate();assert.equal(f.f.skeleton.findSlot(example.parts[0].slot).getAttachment().name,'character:helmet');
  const hero=componentFixture({hero:true}),h=hero.bind();h.lateUpdate();h.lateUpdate();assert.equal(hero.f.skeleton.findSlot(example.parts[0].slot).getAttachment().name,'character:helmet');h.onDestroy();
});
test('saved hero items equip on the real seven-layer hero, follow every animation, and revert on upgrade without changing progress',()=>{
  const Units=require('../../packages/game-data-editor/lib/unit-assets'),description=Units.describe(root,{type:'hero',id:'hero',noRuntime:true});
  const role={wqyl_lead_ma:'spAniMa',wqyl_lead_shenti:'spAniBody',wqyl_lead_doupeng:'spAniDrap',wqyl_lead_tou:'spAniHead',wqyl_lead_gong:'spAniBow',wqyl_lead_jian:'spAniArrow',wqyl_lead_shou:'spAniHand'},ctrPlayAni={},requests=[];
  for(const layer of description.layers){
    const atlas=new spine.TextureAtlas(layer.atlas,name=>{const png=fs.readFileSync(require('node:url').fileURLToPath(layer.pages[name]));return new spine.FakeTexture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)});});
    const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(layer.json),skeleton=new spine.Skeleton(data);skeleton.setSkinByName(layer.skin);skeleton.setToSetupPose();skeleton.updateWorldTransform();
    ctrPlayAni[role[layer.name]]={_skeleton:skeleton,skeletonData:{uuid:layer.uuid},uuid:layer.name,node:{activeInHierarchy:true,x:layer.x,y:layer.y,scaleX:layer.scaleX,scaleY:layer.scaleY,angle:0,opacity:255},setSkin(name){this._skeleton.setSkinByName(name);this._skeleton.setSlotsToSetupPose();},setSlotsToSetupPose(){this._skeleton.setSlotsToSetupPose();}};
  }
  const helmet=JSON.parse(JSON.stringify(require('../../assets/resources/hero-items/catalog.json').profiles['new-item']));assert(helmet,'The saved item example must exist');
  helmet.models={[ctrPlayAni.spAniHead.skeletonData.uuid]:{x:8,y:-3,scaleX:1.1,scaleY:.9,rotation:4,opacity:.8}};
  const items={version:1,profiles:{helmet},assignments:{'2:1':'helmet'}},components=[],node={activeInHierarchy:true,getComponent(Type){return components.find(c=>c instanceof Type);},addComponent(Type){const component=new Type();components.push(component);return component;}};
  let headLevel=1;const user=Object.freeze({getPersonLevel:slot=>slot===2?headLevel:1});
  const actor={node,ctrPlayAni,hp:100,attack:12};class Component{}class SkeletonTexture extends spine.FakeTexture{setRealTexture(image){this.real=image;}}
  const cc={Component,JsonAsset:class{},Texture2D:class{},isValid:()=>true,warn(message){throw Error(message);},resources:{load(resource,type,callback){requests.push(resource);if(resource==='character-parts/catalog')return callback(null,{json:manifest});if(resource==='characters/catalog')return callback(null,{json:{version:1,profiles:{},assignments:{}}});if(resource==='hero-items/catalog')return callback(null,{json:items});const entry=manifest.parts.find(a=>a.resource===resource);assert(entry);callback(null,{width:entry.width,height:entry.height});}},Class(def){function C(){}C.prototype=Object.assign(Object.create(def.extends.prototype),def);return C;}};
  const itemContext={exports:{},cc,require(id){assert.equal(id,'KinghtFallPlayerMgr');return{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user})}};}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroItemLooks.js'),'utf8'),itemContext);
  const context={exports:{},require:id=>id==='CharacterPartsCore'?Core:itemContext.exports,cc,sp:{spine,SkeletonTexture}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/CharacterAppearance.js'),'utf8'),context);
  const head=ctrPlayAni.spAniHead,original=head._skeleton.slots.map(s=>s.getAttachment()),initial={...head.node},source=JSON.stringify(head._skeleton.data.bones),component=context.exports.bind(actor,'hero');component.lateUpdate();component.lateUpdate();
  for(const animation of ['idle','move','attack'])for(const time of [0,.2,.6]){
    for(const renderer of Object.values(ctrPlayAni)){renderer._skeleton.setToSetupPose();const clip=renderer._skeleton.data.findAnimation(animation);if(clip)clip.apply(renderer._skeleton,0,time,true,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);renderer._skeleton.updateWorldTransform();}
    component.lateUpdate();assert.equal(head._skeleton.findSlot(helmet.parts[0].slot).getAttachment().name,'character:helmet');
    assert.equal(head.node.x,initial.x+8);assert.equal(head.node.y,initial.y-3);assert.equal(head.node.scaleX,initial.scaleX*1.1);assert.equal(head.node.scaleY,initial.scaleY*.9);assert.equal(head.node.angle,4);assert.equal(head.node.opacity,204);
  }
  assert.equal(itemContext.exports.item(2,1).name,helmet.name);assert.equal(itemContext.exports.image(2,1).id,helmet.parts[0].sprite);
  assert.equal(JSON.stringify(head._skeleton.data.bones),source);assert.equal(actor.hp,100);assert.equal(actor.attack,12);assert.equal(requests.filter(p=>p.startsWith('character-parts/Parts/')).length,1);
  headLevel=2;head._skeleton.setToSetupPose();component.lateUpdate();assert.deepEqual(head._skeleton.slots.map(s=>s.getAttachment()),original);assert.deepEqual(head.node,initial);assert.equal(itemContext.exports.item(2,2),null);
  headLevel=1;component.lateUpdate();context.exports.reset(actor);head.setSkin('lv2');headLevel=11;context.exports.bind(actor,'hero').lateUpdate();
  const upgraded=new spine.Skeleton(head._skeleton.data);upgraded.setSkinByName('lv2');upgraded.setSlotsToSetupPose();assert.deepEqual(head._skeleton.slots.map(s=>s.getAttachment()),upgraded.slots.map(s=>s.getAttachment()));assert.deepEqual(head.node,initial);
});
}
