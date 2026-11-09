'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const root=path.resolve(__dirname,'../..'),Bake=require('../../packages/hkd-characters/lib/native-bake');
const Units=require('../../packages/game-data-editor/lib/unit-assets'),spine=require(Units.enginePath());
function rig(file){const json=JSON.parse(fs.readFileSync(file)),atlasText=fs.readFileSync(file.replace(/\.json$/,'.atlas'),'utf8');const atlas=new spine.TextureAtlas(atlasText,name=>{const bytes=fs.readFileSync(path.join(path.dirname(file),name));return new spine.FakeTexture({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});});const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json),skeleton=new spine.Skeleton(data);skeleton.setSkinByName('default');return{json,data,skeleton,state:new spine.AnimationState(new spine.AnimationStateData(data))};}
test('all deployed units retain authored hit art or equipped-part white flashes without changing attack contracts',()=>{
 const contracts=require('../../assets/resources/unit-library/runtime/contracts.json'),catalog=require('../../assets/resources/characters/catalog.json');
 for(const [key,contract]of Object.entries(contracts.units)){
  const id=catalog.assignments[key],profile=catalog.profiles[id],r=rig(path.join(root,'assets/resources',profile.baked.resource+'.json'));
  for(const [name,original]of Object.entries(contract.animations)){if(name!=='move')assert(Math.abs(Bake.duration(r.json.animations[name])-original.duration)<1e-6);assert.deepEqual(r.json.animations[name].events||[],original.events);}
  assert(r.data.findAnimation('hit'),key);assert(!r.json.animations.hit.events);
  const attack=r.state.setAnimation(0,'attack',true),hit=r.state.setAnimation(1,'hit',false);hit.mixDuration=0;hit.trackEnd=hit.animationEnd;
  r.state.update(.02);r.state.apply(r.skeleton);r.skeleton.updateWorldTransform();assert.equal(r.state.getCurrent(0),attack);
  if(key.startsWith('enemy')){r.state.update(.06);r.state.apply(r.skeleton);assert(r.skeleton.slots.some(slot=>/Hit/.test(slot.data.name)&&slot.color.a>.1),key+' uses authored hit sprites');}
  else assert(r.skeleton.slots.some(slot=>slot.darkColor&&slot.darkColor.r>.5),key+' flashes its equipped parts');
  r.state.update(1);r.state.apply(r.skeleton);r.state.update(.01);r.state.apply(r.skeleton);assert.equal(r.state.getCurrent(0),attack);assert.equal(r.state.getCurrent(1),null,key+' releases reaction track');
  assert(r.skeleton.slots.every(slot=>!slot.darkColor||slot.darkColor.r===0),key+' has no stuck white flash');
 }
});
test('hit runtime restarts only its visual track and clears safely on death, pooling and respawn',()=>{
 const tracks=[],calls=[],actor={node:{},isDead:()=>false},renderer={skeletonData:{},findAnimation:name=>name==='hit',setAnimation(track,name,loop){calls.push([track,name,loop]);const e={animationEnd:.24};tracks[track]=e;return e;},clearTrack(track){calls.push(['clear',track]);tracks[track]=null;},setSlotsToSetupPose(){calls.push(['setup']);}};actor.spAni=renderer;
 const baseTrack=tracks[0]={animation:{name:'attack'},trackTime:.31},context={exports:{},cc:{Component:class{},isValid:()=>true,Class:d=>{function C(){}Object.assign(C.prototype,d);return C;}}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/UnitHitFeedback.js'),'utf8'),context);
 let component;actor.node.getComponent=()=>component;actor.node.addComponent=C=>(component=new C());
 context.exports.play(actor);const first=tracks[1];context.exports.play(actor);assert.notEqual(tracks[1],first);assert.equal(tracks[0],baseTrack);assert.equal(tracks[1].trackEnd,.24);assert.equal(renderer.useTint,true);
 component.onDisable();assert.equal(tracks[1],null);assert.equal(tracks[0],baseTrack);actor._isPooled=true;context.exports.play(actor);assert.equal(tracks[1],null);actor._isPooled=false;context.exports.play(actor);assert(tracks[1]);assert(calls.filter(c=>c[0]==='setup').length===1);
});

test('hit movement lock lasts for the faster reaction and an old completion cannot release a newer hit',()=>{
 const listeners=new Map(),tracks=[],actor={node:{},rigidBody:{linearVelocity:{x:20,y:0}},isDead:()=>false};
 const renderer=actor.spAni={skeletonData:{},findAnimation:()=>true,setAnimation(){const e={animationEnd:.24};tracks[1]=e;return e;},setTrackCompleteListener:(e,done)=>listeners.set(e,done),getCurrent:()=>tracks[1],clearTrack(){tracks[1]=null;},setSlotsToSetupPose(){}};
 const context={exports:{},cc:{Vec2:{ZERO:{x:0,y:0}},Component:class{},isValid:()=>true,Class:d=>{function C(){}Object.assign(C.prototype,d);return C;}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/UnitHitFeedback.js'),'utf8'),context);
 let feedback;actor.node.getComponent=()=>feedback;actor.node.addComponent=C=>(feedback=new C());
 context.exports.play(actor);const first=tracks[1];assert.equal(actor._hitReactionPlaying,true);assert.equal(first.timeScale,1.5);assert.equal(actor.rigidBody.linearVelocity.x,0);
 context.exports.play(actor);const current=tracks[1];listeners.get(first)();assert.equal(actor._hitReactionPlaying,true);
 renderer.paused=true;feedback.update();assert.equal(actor._hitReactionPlaying,true);renderer.paused=false;
 listeners.get(current)();assert.equal(actor._hitReactionPlaying,false);
 context.exports.play(actor);tracks[1].trackTime=.24;feedback.update();assert.equal(actor._hitReactionPlaying,false);
 context.exports.play(actor);context.exports.reset(actor);assert.equal(actor._hitReactionPlaying,false);
});

test('native slot reset clears interrupted white flashes at the planning boundary and preserves setup tints',()=>{
 const catalog=require('../../assets/resources/characters/catalog.json'),key=Object.keys(catalog.assignments).find(k=>k.startsWith('ally:'));
 assert(key,'deployed allied character missing');
 for(const interrupt of [.01,.02,.03]){
  const r=rig(path.join(root,'assets/resources/unit-library/runtime/default_'+catalog.assignments[key]+'.json'));
  const tinted=r.skeleton.slots.find(s=>s.darkColor);assert(tinted);
  tinted.data.darkColor.r=.04;tinted.data.darkColor.g=.03;tinted.data.darkColor.b=.02;
  const attack=r.state.setAnimation(0,'attack',true),actor={node:{color:'#c08060'},isDead:()=>false};
  const renderer=actor.spAni={skeletonData:{skeletonJson:r.json},findAnimation:n=>r.data.findAnimation(n),setAnimation:(...args)=>r.state.setAnimation(...args),
   // Native getCurrent can return another wrapper around the same track.
   getCurrent:i=>{const e=r.state.getCurrent(i);return e&&{getTrackTime:()=>e.trackTime,getAnimationEnd:()=>e.animationEnd};},
   clearTrack:i=>r.state.clearTrack(i),findSlot:name=>{const slot=r.skeleton.findSlot(name);return slot&&{getDarkColor:()=>slot.darkColor,getData:()=>({getDarkColor:()=>slot.data.darkColor})};},
   setSlotsToSetupPose(){const colors=r.skeleton.slots.map(s=>s.darkColor&&{...s.darkColor});r.skeleton.setSlotsToSetupPose();r.skeleton.slots.forEach((s,i)=>{if(s.darkColor)Object.assign(s.darkColor,colors[i]);});}};
  const context={exports:{},cc:{Component:class{},isValid:()=>true,Class:d=>{function C(){}Object.assign(C.prototype,d);return C;}}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/UnitHitFeedback.js'),'utf8'),context);
  let feedback;actor.node.getComponent=()=>feedback;actor.node.addComponent=C=>(feedback=new C());
  context.exports.play(actor);r.state.update(interrupt);r.state.apply(r.skeleton);feedback.update();
  assert(actor._hitReactionPlaying,'native wrapper identity prematurely ended a hit');assert(r.skeleton.slots.some(s=>s.darkColor&&s.darkColor.r>.5));
  context.exports.reset(actor);
  for(const slot of r.skeleton.slots)if(slot.darkColor)for(const channel of ['r','g','b'])assert.equal(slot.darkColor[channel],slot.data.darkColor[channel]);
  assert.equal(r.state.getCurrent(0),attack);assert.equal(r.state.getCurrent(1),null);assert.equal(actor._hitReactionPlaying,false);assert.equal(actor.node.color,'#c08060');
  // Respawning/reusing the component must not retain a previous flash.
  context.exports.play(actor);r.state.update(.02);r.state.apply(r.skeleton);feedback.onDisable();assert(r.skeleton.slots.every(s=>!s.darkColor||s.darkColor.r===s.data.darkColor.r));
 }
});
