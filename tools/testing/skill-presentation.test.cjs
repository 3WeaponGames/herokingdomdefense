'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Settings=require('../../assets/_script/HeroSkillSettings');
function fixture(){
 const calls=[],loads=[],released=[];let effectVolume=.5;
 const manager={getAudioSource:key=>({key}),getEffectVolume:()=>effectVolume,playSource(source,config,key,loop,music,volume,_done,_cache,options){calls.push({source,config,key,loop,music,volume,options});},stopSource(source){source.stopped=true;},releaseAudioSource(key,source){released.push(key);source.stopped=true;},channelState:source=>({active:!source.stopped})};
 class Node{constructor(name){this.name=name;this.children=[];this.x=this.y=0;this.scale=1;}setParent(parent){this.parent=parent;parent.children.push(this);}setPosition(p){this.x=p.x;this.y=p.y;}getPosition(){return{x:this.x,y:this.y};}destroy(){this.destroyed=true;}convertToNodeSpaceAR(p){return{x:p.x/2,y:p.y/2};}addComponent(Type){const component=new Type();component.node=this;this.component=component;return component;}}
 const cc={Node,Sprite:class{},SpriteFrame:class{},isValid:n=>!!n&&!n.destroyed,v2:(x,y)=>({x,y}),color:value=>value,assetManager:{
  getBundle:()=>null,
  loadBundle(bundle,done){done(null,{load(resource,type,callback){loads.push({bundle,resource,type,callback});}});},
  loadAny(request,callback){loads.push({request,callback});}
 }};
 const sp={Skeleton:class{setAnimation(track,name,loop){return this.animation={track,name,loop,trackTime:0,timeScale:1};}update(){this.appliedTime=this.animation.trackTime;}},SkeletonData:class{}};
 const exports={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroSkillPresentation.js'),'utf8'),{exports,cc,sp,require:name=>name==='AudioMgr'?{AudioMgr:{getInstance:()=>manager}}:Settings});
 const target={hp:10,node:{getPosition:()=>({x:100,y:20})}},root=new Node('VFX');
 const rt={heroGeneration:3,hero:{node:{}},state:{style:'mystic',time:0},settings:Settings.defaults('mystic'),game:{_combatEpoch:7,ndMain:{convertToWorldSpaceAR:p=>({x:p.x*2,y:p.y*2})}},ui:{speed:1},projectiles:[],effects:[],available:()=>true};
 return {P:exports,rt,target,root,cc,sp,calls,loads,released,manager,setVolume:v=>effectVolume=v};
}
const uuid='a9ed4a1a-a37a-44ab-af0c-7be941a3de18';

test('absent authored overrides retain procedural defaults and do not request any audio or custom assets',()=>{
 const f=fixture();f.P.update(f.rt);f.P.attachments({visual:{node:f.root}},f.rt);
 assert.equal(f.calls.length,0);assert.equal(f.loads.length,0);assert.equal(f.P.visual(f.rt).scale,1);assert.equal(f.P.width(f.rt,4),4);assert.equal(f.P.color(f.rt,'#7134a4'),'#7134a4');
});
test('authored sound cue waits for gameplay delay, respects effect volume and retains owner and battle guards',()=>{
 const f=fixture();f.rt.settings.audio.cast={clip:uuid,bundle:'KinghtFallAudio',path:'sfx/fire',volume:.4,delay:.5};
 f.P.queue(f.rt,'cast');f.P.update(f.rt);assert.equal(f.calls.length,0);f.rt.state.time=.49;f.P.update(f.rt);assert.equal(f.calls.length,0);
 f.rt.state.time=.5;f.P.update(f.rt);assert.equal(f.calls.length,1);const call=f.calls[0];assert.equal(call.config.bundle,'KinghtFallAudio');assert.equal(call.config.path,'sfx/fire');assert.equal(call.volume(),.2);f.setVolume(0);assert.equal(call.volume(),0);assert.equal(call.options.owner,f.rt.hero);assert.equal(call.options.game,f.rt.game);
});
test('stale delayed sound is discarded after state replacement or battle retirement',()=>{
 for(const replace of [f=>f.rt.state={style:'mystic',time:2},f=>{f.rt.state.time=2;f.rt.game._combatEpoch++;}]){
  const f=fixture();f.rt.settings.audio.cast={clip:uuid,volume:1,delay:1};f.P.queue(f.rt,'cast');replace(f);f.P.update(f.rt);assert.equal(f.calls.length,0);
 }
});
test('Mystic channel starts once, stops on beam loss and cannot survive explicit cleanup',()=>{
 const f=fixture();f.rt.settings.audio.channel={clip:uuid,bundle:'KinghtFallAudio',path:'sfx/beam',volume:1,delay:0};f.rt.beamTarget=f.target;
 f.P.update(f.rt);f.P.update(f.rt);assert.equal(f.calls.length,1);assert.equal(f.calls[0].loop,true);
 const source=f.calls[0].source;f.rt.beamTarget=null;f.P.update(f.rt);assert.equal(source.stopped,true);
 f.rt.beamTarget=f.target;f.P.update(f.rt);assert.equal(f.calls.length,2);f.P.clear(f.rt);assert.equal(f.rt._presentation,undefined);assert.equal(f.released.length,2);
});
test('multi-target impact sound is budgeted once per strike, and pause cannot start an authored cue',()=>{
 const f=fixture();f.rt.settings.audio.impact={clip:uuid,volume:1,delay:0};f.P.queue(f.rt,'impact',3);f.P.queue(f.rt,'impact',3);f.P.update(f.rt);assert.equal(f.calls.length,1);
 f.P.queue(f.rt,'impact',4);f.rt.available=()=>false;f.P.update(f.rt);assert.equal(f.calls.length,1);
});
test('saved sprite VFX resolves bundle identity and applies visual offsets without changing the projectile',()=>{
 const f=fixture(),projectile={x:10,y:20,direction:{x:1,y:0}};f.rt.projectiles=[projectile];Object.assign(f.rt.settings.visual,{resource:uuid,resourceBundle:'resources',resourcePath:'fx/spark',resourceKind:'sprite',originX:2,originY:3,offsetX:4,offsetY:5,scale:.6,rotation:30,opacity:.4});
 f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(f.loads.length,1);assert.equal(f.loads[0].resource,'fx/spark');const sprite={name:'spark'};f.loads[0].callback(null,sprite);
 const node=f.root.children[0];assert.equal(node.x,16);assert.equal(node.y,28);assert.equal(node.scale,.6);assert.equal(node.angle,30);assert.equal(node.opacity,102);assert.equal(node.component.spriteFrame,sprite);assert.equal(projectile.x,10);assert.equal(projectile.y,20);
 f.rt.projectiles=[];f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(node.destroyed,true);
});
test('late VFX asset load cannot attach a component after cleanup, and Spine chooses the authored effect animation',()=>{
 const f=fixture();Object.assign(f.rt.settings.visual,{resource:uuid,resourceKind:'spine',resourceAnimation:'burst'});f.rt.effects=[{x:10,y:20}];f.P.attachments({visual:{node:f.root}},f.rt);const node=f.root.children[0];f.P.clear(f.rt);f.loads[0].callback(null,{skeletonJson:{animations:{burst:{}}}});assert.equal(node.component,undefined);
 f.rt.effects=[{x:5,y:7}];f.P.attachments({visual:{node:f.root}},f.rt);const current=f.root.children[1];f.loads[1].callback(null,{skeletonJson:{animations:{idle:{},burst:{}}}});assert.equal(current.component.animation.name,'burst');assert.equal(current.component.animation.loop,false);
});
test('visual rotation, tint and linewidth are authored values while defaults remain unchanged',()=>{
 const f=fixture();Object.assign(f.rt.settings.visual,{rotation:90,color:'#ff0000',lineWidth:9,scale:.5});const d=f.P.rotated({x:1,y:0},90);assert(Math.abs(d.x)<1e-10);assert.equal(d.y,1);assert.equal(f.P.width(f.rt,4),4.5);assert.equal(f.P.color(f.rt,'#000000'),'#ff0000');assert.equal(Settings.defaults('mystic').visual.lineWidth,0);
});

test('a late Spine VFX starts at the current hit age and stays on the gameplay clock',()=>{
 const f=fixture();Object.assign(f.rt.settings.visual,{resource:uuid,resourceKind:'spine',resourceAnimation:'burst'});
 const effect={x:10,y:20,duration:1,remaining:1};f.rt.effects=[effect];f.P.attachments({visual:{node:f.root}},f.rt);
 effect.remaining=.65;f.P.attachments({visual:{node:f.root}},f.rt);f.loads[0].callback(null,{skeletonJson:{animations:{burst:{}}}});
 const skeleton=f.root.children[0].component;assert(Math.abs(skeleton.appliedTime-.35)<1e-10);assert.equal(skeleton.animation.timeScale,0);assert.equal(skeleton.animation.loop,false);
 f.rt.ui.speed=3;effect.remaining=.2;f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(skeleton.appliedTime,.8,'the already scaled gameplay clock is not multiplied a second time');
 f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(skeleton.appliedTime,.8,'no clock advance means no visual advance');
});

test('custom effects preload once and reuse the asset across repeated multi-target strikes',()=>{
 const f=fixture();Object.assign(f.rt.settings.visual,{resource:uuid,resourceKind:'spine',resourceAnimation:'burst'});
 f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(f.loads.length,1);assert.equal(f.root.children.length,0);
 f.loads[0].callback(null,{skeletonJson:{animations:{burst:{}}}});
 for(let strike=0;strike<20;strike++){
  f.rt.effects=[{x:strike,y:0,duration:.35,remaining:.2}];f.P.attachments({visual:{node:f.root}},f.rt);
  assert.equal(f.rt._presentation.nodes.size,1);assert.equal(f.loads.length,1);
 }
 const live=f.root.children.filter(n=>!n.destroyed);assert.equal(live.length,1);f.P.clear(f.rt);assert(live[0].destroyed);
});
