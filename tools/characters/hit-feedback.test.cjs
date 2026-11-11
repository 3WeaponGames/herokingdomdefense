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
function feedbackFixture(native){
 const tracks=[],plays=[],entries=new WeakMap(),actor={node:{_combatGeneration:1},rigidBody:{linearVelocity:{x:20,y:0}},isDead:()=>false};
 const baseTrack=tracks[0]={animation:{name:'attack'},trackTime:.31};
 function wrap(entry){
  if(!entry||!native)return entry;
  function live(){assert.equal(entry.disposed,false,'a disposed native TrackEntry was dereferenced');}
  const value={getAnimation(){live();return{getName:()=>entry.animation.name};},getTrackTime(){live();return entry.trackTime;},getAnimationEnd(){live();return entry.animationEnd;},
   setMixDuration(value){live();entry.mixDuration=value;},setTrackEnd(value){live();entry.trackEnd=value;},setTimeScale(value){live();entry.timeScale=value;}};
  entries.set(value,entry);return value;
 }
 function original(value){return native?entries.get(value):value;}
 const renderer=actor.spAni={skeletonData:{},findAnimation:name=>name==='hit',
  setAnimation(index,name,loop){assert.equal(index,1);assert.equal(name,'hit');assert.equal(loop,false);const entry={animation:{name},trackTime:0,animationEnd:.24,disposed:false};tracks[1]=entry;plays.push(entry);return wrap(entry);},
  getCurrent:index=>wrap(tracks[index]),setTrackCompleteListener(entry,done){original(entry).complete=done;},setTrackDisposeListener(entry,done){original(entry).dispose=done;},
  clearTrack(index){const old=tracks[index];tracks[index]=null;if(old){old.disposed=true;if(old.dispose)old.dispose();}},setSlotsToSetupPose(){}};
 const context={exports:{},cc:{Vec2:{ZERO:{x:0,y:0}},Component:class{},isValid:value=>!!value&&!value.destroyed,Class:d=>{function C(){}Object.assign(C.prototype,d);return C;}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/UnitHitFeedback.js'),'utf8'),context);
 let feedback;actor.node.getComponent=()=>feedback;actor.node.addComponent=C=>(feedback=new C());
 return{actor,renderer,tracks,plays,baseTrack,hit:()=>context.exports.play(actor),reset:()=>context.exports.reset(actor),feedback:()=>feedback,
  complete(){const entry=tracks[1];entry.trackTime=entry.animationEnd;entry.complete();},dispose(){renderer.clearTrack(1);}};
}

for(const native of [false,true])test((native?'native':'browser')+' hit bursts finish once before another hit can start, without changing attack timing',()=>{
 const f=feedbackFixture(native);f.hit();const first=f.tracks[1];
 assert.equal(first.timeScale,1.5);assert.equal(first.trackEnd,.24);assert.equal(f.renderer.useTint,true);assert.equal(f.actor._hitReactionPlaying,true);assert.equal(f.actor.rigidBody.linearVelocity.x,0);
 first.trackTime=.1;
 for(let i=0;i<100;i++)f.hit();
 assert.equal(f.plays.length,1);assert.equal(f.tracks[1],first);assert.equal(first.trackTime,.1,'damage restarted the hit clock');
 f.renderer.paused=true;for(let i=0;i<10;i++)f.hit();f.feedback().update();assert.equal(f.plays.length,1);assert.equal(f.actor._hitReactionPlaying,true);f.renderer.paused=false;
 f.complete();assert.equal(f.actor._hitReactionPlaying,false);
 for(let i=0;i<10;i++)f.feedback().update();assert.equal(f.plays.length,1,'intervening hits were queued for later replay');
 f.hit();const second=f.tracks[1];assert.notEqual(second,first);assert.equal(f.plays.length,2);assert.equal(f.actor._hitReactionPlaying,true);
 first.complete();first.dispose();assert.equal(f.actor._hitReactionPlaying,true,'an obsolete callback released the new hit');
 assert.equal(f.tracks[0],f.baseTrack);assert.equal(f.baseTrack.trackTime,.31);
 f.dispose();assert.equal(f.actor._hitReactionPlaying,false);f.feedback().update();assert.equal(f.plays.length,2);
 f.hit();assert.equal(f.plays.length,3);assert.equal(f.tracks[0],f.baseTrack);
});

for(const native of [false,true])test((native?'native':'browser')+' hit polling and pool reuse release only the owned reaction',()=>{
 const f=feedbackFixture(native);f.hit();const first=f.tracks[1];
 first.trackTime=.24;f.feedback().update();assert.equal(f.actor._hitReactionPlaying,false);
 f.hit();const second=f.tracks[1];assert.equal(f.plays.length,2);
 f.actor.node._combatGeneration++;f.hit();const reused=f.tracks[1];assert.notEqual(reused,second);assert.equal(f.plays.length,3);
 first.complete();second.complete();second.dispose();assert.equal(f.actor._hitReactionPlaying,true);
 f.feedback().onDisable();assert.equal(f.tracks[1],null);assert.equal(f.actor._hitReactionPlaying,false);
 f.actor._isPooled=true;f.hit();assert.equal(f.plays.length,3);f.actor._isPooled=false;f.actor.node._combatGeneration++;f.hit();
 assert.equal(f.plays.length,4);reused.complete();reused.dispose();assert.equal(f.actor._hitReactionPlaying,true);
 f.reset();assert.equal(f.tracks[1],null);assert.equal(f.actor._hitReactionPlaying,false);assert.equal(f.tracks[0],f.baseTrack);assert.equal(f.baseTrack.trackTime,.31);
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
