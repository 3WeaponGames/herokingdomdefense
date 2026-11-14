'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Settings=require('../../assets/_script/HeroSkillSettings');
function fixture(audioManager){
 const calls=[],loads=[],released=[],defaults=[],hitReactions=[];let effectVolume=.5;
 const manager=audioManager||{getAudioSource:key=>({key}),getEffectVolume:()=>effectVolume,playSource(source,config,key,loop,music,volume,_done,_cache,options){calls.push({source,config,key,loop,music,volume,options});},stopSource(source){source.stopped=true;},releaseAudioSource(key,source){released.push(key);source.stopped=true;},channelState:source=>({active:!source.stopped})};
 class Node{constructor(name){this.name=name;this.children=[];this.x=this.y=0;this.scaleX=this.scaleY=1;}get scale(){return this.scaleX;}set scale(value){this.scaleX=this.scaleY=value;}setParent(parent){this.parent=parent;parent.children.push(this);}setPosition(p){this.x=p.x;this.y=p.y;}getPosition(){return{x:this.x,y:this.y};}destroy(){this.destroyed=true;}convertToNodeSpaceAR(p){return{x:p.x/2,y:p.y/2};}addComponent(Type){const component=new Type();component.node=this;this.component=component;return component;}}
 const cc={Node,Sprite:class{},SpriteFrame:class{},isValid:n=>!!n&&!n.destroyed,v2:(x,y)=>({x,y}),rect:(x,y,width,height)=>({x,y,width,height}),size:(width,height)=>({width,height}),color:value=>value,assetManager:{
  getBundle:()=>null,
  loadBundle(bundle,done){done(null,{load(resource,type,callback){loads.push({bundle,resource,type,callback});}});},
  loadAny(request,callback){loads.push({request,callback});}
 }};
 const sp={Skeleton:class{setAnimation(track,name,loop){return this.animation={track,name,loop,trackTime:0,timeScale:1};}update(){this.appliedTime=this.animation.trackTime;}},SkeletonData:class{}};
 const exports={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroSkillPresentation.js'),'utf8'),{exports,cc,sp,require:name=>name==='UnitHitFeedback'?{play:actor=>hitReactions.push(actor)}:name==='./HeroSkillVFXState'?require('../../assets/_script/HeroSkillVFXState'):name==='./HeroSkillVFXLayout'?require('../../assets/_script/HeroSkillVFXLayout'):name==='./HeroSkillPose'?require('../../assets/_script/HeroSkillPose'):name==='AudioMgr'?{AudioMgr:{getInstance:()=>manager}}:name==='BattleSounds'?{attack:(hero,side)=>defaults.push({hero,side}),effect:(id,hero)=>defaults.push({id,hero})}:Settings});
 const target={hp:10,node:{getPosition:()=>({x:100,y:20})}},root=new Node('VFX');
 const rt={heroGeneration:3,hero:{node:{}},state:{style:'mystic',time:0},settings:Settings.defaults('mystic'),game:{_combatEpoch:7,ndMain:{convertToWorldSpaceAR:p=>({x:p.x*2,y:p.y*2})}},ui:{speed:1},projectiles:[],effects:[],available:()=>true};
 Object.assign(rt.settings.visual,{passiveResource:'',beamResource:'',markResource:'',buffResource:'',tauntResource:'',shieldResource:''});
 return {P:exports,rt,target,root,cc,sp,calls,loads,released,defaults,hitReactions,manager,setVolume:v=>effectVolume=v};
}
const uuid='a9ed4a1a-a37a-44ab-af0c-7be941a3de18';
test('the default on-hit burst reuses HUD Graphics for six expanding fading rays without custom assets',()=>{
 const f=fixture(),ops=[],g={moveTo(x,y){ops.push(['from',x,y]);},lineTo(x,y){ops.push(['to',x,y]);},stroke(){ops.push(['stroke',this.strokeColor,this.lineWidth]);}},hud={visual:{node:f.root,g}};f.cc.color=hex=>({hex,a:255});
 f.P.impact(f.rt,f.target,{point:{x:100,y:20}});assert.equal(f.P.hasImpactVisual(f.rt),true);f.P.draw(hud,f.rt);assert.equal(f.loads.length,0);assert.equal(f.root.children.length,0);assert.equal(ops.filter(row=>row[0]==='stroke').length,6);assert.equal(ops[0][1],106);assert.equal(ops[1][1],115);assert.deepEqual(ops[2][1],{hex:'#fff3a2',a:255});
 ops.length=0;f.rt.state.time=.175;f.P.draw(hud,f.rt);assert.equal(ops[0][1],110.5);assert.equal(ops[1][1],122.5);assert.equal(ops[2][1].a,128);f.rt.settings.visual.impactOpacity=0;assert.equal(f.P.hasImpactVisual(f.rt),false);ops.length=0;f.P.draw(hud,f.rt);assert.equal(ops.length,0);
 f.rt.settings.visual.impactOpacity=1;f.rt.state.time=.35;f.P.update(f.rt);assert.equal(f.P.hasImpactVisual(f.rt),false);
});
test('on-hit delay schedules exactly one existing reaction and independent target-position VFX on gameplay time',()=>{
 const f=fixture();Object.assign(f.rt.settings.visual,{impactResource:uuid,impactResourceKind:'spine',impactResourceAnimation:'hit',impactDelay:.5,impactDuration:1,impactScale:2,impactOffsetX:5,impactOffsetY:9});
 assert.equal(f.P.deferHitReaction(f.rt,f.target),true);f.P.impact(f.rt,f.target,{point:{x:100,y:20}});f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(f.loads.length,1);assert.equal(f.root.children.length,0);
 f.loads[0].callback(null,{skeletonJson:{animations:{hit:{}}}});f.rt.state.time=.499;f.P.update(f.rt);f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(f.hitReactions.length,0);assert.equal(f.root.children.length,0);
 f.rt.state.time=.5;f.P.update(f.rt);f.P.attachments({visual:{node:f.root}},f.rt);assert.deepEqual(f.hitReactions,[f.target]);const node=f.root.children[0];assert.equal(node.x,105);assert.equal(node.y,29);assert.equal(node.scale,2);assert.equal(node.component.animation.name,'hit');
 f.target.node.getPosition=()=>({x:999,y:999});f.rt.state.time=.8;f.P.update(f.rt);f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(f.hitReactions.length,1);assert.equal(node.x,105);assert(Math.abs(node.component.appliedTime-.3)<1e-9);
 f.rt.state.time=1.5;f.P.update(f.rt);f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(node.destroyed,true);f.P.clear(f.rt);assert.equal(f.rt._presentation,undefined);
});
test('delayed hit feedback rejects dead, pooled, recycled, retired and replaced identities without affecting unrelated reactions',()=>{
 for(const change of [f=>f.target.hp=0,f=>f.target._isPooled=true,f=>f.target.node._combatGeneration=1,f=>f.rt.hero.node._combatGeneration=1,f=>f.rt.game._combatEpoch++,f=>f.rt.game.gameData={},f=>f.rt.state={style:'mystic',time:1}]){
  const f=fixture();f.rt.settings.visual.impactDelay=.5;assert(f.P.deferHitReaction(f.rt,f.target));change(f);f.rt.state.time=1;f.P.update(f.rt);assert.equal(f.hitReactions.length,0);assert.equal(f.rt._presentation.feedback.length,0);
 }
 const f=fixture();assert.equal(f.P.deferHitReaction(f.rt,f.target),false,'Default immediate feedback remains on the ordinary enemy path');assert.equal(f.rt._presentation,undefined);
});
test('main and on-hit VFX keep independent resources, flipbook caches and cleanup',()=>{
 const f=fixture();Object.assign(f.rt.settings.visual,{resource:uuid,resourceKind:'sprite',impactResource:'a9ed4a1a-a37a-44ab-af0c-7be941a3de19',impactResourceKind:'sprite',impactResourceFrames:1,impactResourceColumns:1,impactResourceCell:16,impactResourceFps:24,impactResourceLoop:false});f.rt.effects=[{x:0,y:0,duration:1,remaining:1}];f.P.impact(f.rt,f.target,{});f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(f.loads.length,2);
 let cloned=0,destroyed=0;const main={name:'main'},hit={getRect:()=>({x:0,y:0,width:16,height:16}),clone:()=>{cloned++;return{setRect(){},setOriginalSize(){},setOffset(){},destroy(){destroyed++;}};}};f.loads[0].callback(null,main);f.loads[1].callback(null,hit);assert.equal(f.root.children.length,2);assert.equal(f.root.children[0].component.spriteFrame,main);assert.equal(cloned,1);f.P.clear(f.rt);assert(f.root.children.every(n=>n.destroyed));assert.equal(destroyed,1);
});
test('late impact assets do not create expired visuals and both per-hit queues remain bounded',()=>{
 const f=fixture();Object.assign(f.rt.settings.visual,{impactResource:uuid,impactDelay:30,impactDuration:.1});let accepted=0;for(let i=0;i<10000;i++){if(f.P.deferHitReaction(f.rt,f.target))accepted++;f.P.impact(f.rt,f.target,{});}assert.equal(accepted,f.P.limits.feedback);assert.equal(f.rt._presentation.feedback.length,256);assert.equal(f.rt._presentation.impacts.length,128);
 f.P.attachments({visual:{node:f.root}},f.rt);f.rt.state.time=31;f.P.update(f.rt);f.P.attachments({visual:{node:f.root}},f.rt);f.loads[0].callback(null,{name:'late'});assert.equal(f.root.children.length,0);assert.equal(f.rt._presentation.feedback.length,0);assert.equal(f.rt._presentation.impacts.length,0);
});

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

test('interleaved strikes retain independent impact budgets and delayed audio storage is bounded',()=>{
 const f=fixture();f.rt.settings.audio.impact={clip:uuid,volume:1,delay:30};
 f.P.queue(f.rt,'impact',10);f.P.queue(f.rt,'impact',11);f.P.queue(f.rt,'impact',10);
 assert.equal(f.rt._presentation.pending.length,2);
 for(let i=12;i<10000;i++)f.P.queue(f.rt,'impact',i);
 assert.equal(f.rt._presentation.pending.length,512);assert.equal(f.rt._presentation.impactKeys.size,512);
});

test('a launch offset follows the actual bow tip without moving the gameplay path',()=>{
 const f=fixture(),arrow={x:10,y:20,visualOffset:{x:30,y:114}};const at=f.P.projectilePoint(arrow,f.rt.settings.visual);
 assert.equal(at.x,40);assert.equal(at.y,134);assert.equal(arrow.x,10);assert.equal(arrow.y,20);
});

test('a stale saved VFX clip falls back to an existing asset clip without throwing',()=>{
 const f=fixture();Object.assign(f.rt.settings.visual,{resource:uuid,resourceKind:'spine',resourceAnimation:'removed'});
 f.rt.effects=[{x:0,y:0,duration:1,remaining:1}];f.P.attachments({visual:{node:f.root}},f.rt);
 assert.doesNotThrow(()=>f.loads[0].callback(null,{skeletonJson:{animations:{burst:{}}}}));assert.equal(f.root.children[0].component.animation.name,'burst');
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

test('built-in skill release cues occur once per marker and authored cast cues replace them',()=>{
 const f=fixture();f.rt.state.style='vanguard';f.P.release(f.rt,1);f.P.release(f.rt,1);assert.equal(f.defaults.length,1);
 f.rt.settings.audio.cast={clip:uuid,volume:1,delay:0};f.P.release(f.rt,2);assert.equal(f.defaults.length,1);
 f.rt.settings.audio.cast.clip='';f.rt.state.style='guardian';f.P.release(f.rt,3);assert.equal(f.defaults[1].id,'shield-activate');
 f.rt.available=()=>false;f.P.release(f.rt,4);assert.equal(f.defaults.length,2);
});
test('an uncustomized beam has one release cue while a persistent target remains visible',()=>{
 const f=fixture();f.rt.beamTarget=f.target;f.P.update(f.rt);f.P.update(f.rt);assert.equal(f.defaults.length,1);
 f.rt.beamTarget=null;f.P.update(f.rt);f.rt.beamTarget=f.target;f.P.update(f.rt);assert.equal(f.defaults.length,2);
});

test('JSB VFX commits its sampled pose through the native renderer rather than debug-only component update',()=>{
 const f=fixture();Object.assign(f.rt.settings.visual,{resource:uuid,resourceKind:'spine',resourceAnimation:'burst'});
 const effect={x:0,y:0,duration:1,remaining:1};f.rt.effects=[effect];f.P.attachments({visual:{node:f.root}},f.rt);f.loads[0].callback(null,{skeletonJson:{animations:{burst:{}}}});
 const skeleton=f.root.children[0].component;let native=0,component=0;
 skeleton._nativeSkeleton={update(dt){assert.equal(dt,0);native++;skeleton.appliedTime=skeleton.animation.trackTime;}};skeleton.update=()=>component++;
 effect.remaining=.4;f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(native,1);assert.equal(component,0);assert.equal(skeleton.appliedTime,.6);
});

test('flipbook VFX caches visited immutable frames, follows gameplay age, and releases them without touching the shared asset',()=>{
 const f=fixture(),original={x:16,y:32,width:1024,height:512},changes=[];let cloned=0,destroyed=0;
 const asset={getRect:()=>original,clone(){cloned++;return{setRect:r=>changes.push(r),setOriginalSize(s){this.size=s;},setOffset(o){this.offset=o;},destroy(){destroyed++;}};}};
 Object.assign(f.rt.settings.visual,{resource:uuid,resourceKind:'sprite',resourceFrames:32,resourceColumns:8,resourceCell:128,resourceFps:24,resourceLoop:false});
 const e={x:0,y:0,duration:3,remaining:3};f.rt.effects=[e];f.P.attachments({visual:{node:f.root}},f.rt);f.loads[0].callback(null,asset);
 assert.equal(cloned,1);assert.deepEqual(changes[0],{x:16,y:32,width:128,height:128});
 e.remaining=2.5;f.P.attachments({visual:{node:f.root}},f.rt);assert.deepEqual(changes.at(-1),{x:528,y:160,width:128,height:128});
 e.remaining=0;f.P.attachments({visual:{node:f.root}},f.rt);assert.deepEqual(changes.at(-1),{x:912,y:416,width:128,height:128});
 assert.deepEqual(original,{x:16,y:32,width:1024,height:512});assert.equal(cloned,3);f.P.clear(f.rt);assert.equal(destroyed,3);
});
test('looping flipbooks wrap on their saved FPS and unchanged frames allocate no new crop',()=>{
 const f=fixture(),rects=[];const asset={getRect:()=>({x:0,y:0,width:64,height:32}),clone:()=>({setRect:r=>rects.push(r),setOriginalSize(){},setOffset(){},destroy(){}})};
 Object.assign(f.rt.settings.visual,{resource:uuid,resourceKind:'sprite',resourceFrames:8,resourceColumns:4,resourceCell:16,resourceFps:8,resourceLoop:true});
 const p={x:0,y:0,direction:{x:1,y:0},travelled:10,speed:8};f.rt.projectiles=[p];f.P.attachments({visual:{node:f.root}},f.rt);f.loads[0].callback(null,asset);
 assert.deepEqual(rects[0],{x:32,y:0,width:16,height:16});f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(rects.length,1);
 p.travelled=12;f.P.attachments({visual:{node:f.root}},f.rt);assert.deepEqual(rects.at(-1),{x:0,y:16,width:16,height:16});
});
test('browser Spine VFX commits world matrices after the realtime component update',()=>{
 const f=fixture();Object.assign(f.rt.settings.visual,{resource:uuid,resourceKind:'spine'});f.rt.effects=[{x:0,y:0,duration:1,remaining:.5}];
 f.P.attachments({visual:{node:f.root}},f.rt);f.loads[0].callback(null,{skeletonJson:{animations:{burst:{}}}});
 const renderer=f.root.children[0].component;let commits=0;renderer._skeleton={updateWorldTransform(){commits++;}};
 f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(commits,1);assert.equal(renderer.appliedTime,.5);
});

test('flipbook crop precedes Sprite autosizing and changes the frame to invalidate cached UVs safely',()=>{
 const f=fixture();let frame,dirty=0,assignments=0;
 Object.defineProperty(f.cc.Sprite.prototype,'spriteFrame',{set(value){this._frame=value;assignments++;if(value)this.node.width=value.getRect().width;},get(){return this._frame;}});
 f.cc.Sprite.prototype.setVertsDirty=function(){dirty++;};
 const asset={getRect:()=>({x:0,y:0,width:1024,height:512}),clone(){frame={rect:{x:0,y:0,width:1024,height:512},getRect(){return this.rect;},setRect(rect){this.rect=rect;},setOriginalSize(){},setOffset(){},destroy(){}};return frame;}};
 Object.assign(f.rt.settings.visual,{resource:uuid,resourceKind:'sprite',resourceFrames:32,resourceColumns:8,resourceCell:128,resourceFps:24,resourceLoop:false});
 const e={x:0,y:0,duration:2,remaining:2};f.rt.effects=[e];f.P.attachments({visual:{node:f.root}},f.rt);f.loads[0].callback(null,asset);
 assert.equal(f.root.children[0].width,128);assert.equal(assignments,1);const firstFrame=frame;
 e.remaining=1.5;f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(assignments,2);assert.notEqual(frame,firstFrame);assert.equal(f.root.children[0].width,128);
});

test('flipbook cells remain correct when the shared source migrates into a dynamic atlas',()=>{
 const f=fixture();let base={x:0,y:0,width:64,height:32},last;
 const asset={getRect:()=>base,clone:()=>({setRect(r){last=r;},setOriginalSize(){},setOffset(){},destroy(){}})};
 Object.assign(f.rt.settings.visual,{resource:uuid,resourceKind:'sprite',resourceFrames:8,resourceColumns:4,resourceCell:16,resourceFps:8,resourceLoop:false});
 const e={x:0,y:0,duration:2,remaining:2};f.rt.effects=[e];f.P.attachments({visual:{node:f.root}},f.rt);f.loads[0].callback(null,asset);
 assert.deepEqual(last,{x:0,y:0,width:16,height:16});base={x:200,y:300,width:64,height:32};e.remaining=1.5;f.P.attachments({visual:{node:f.root}},f.rt);
 assert.deepEqual(last,{x:200,y:316,width:16,height:16});
 const before=f.rt._presentation.frames.size;f.rt.effects.push({x:10,y:10,duration:2,remaining:1.5});f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(f.rt._presentation.frames.size,before,'simultaneous effects reuse each immutable cell');
});

test('channel delay starts at the logical visible onset even when first paint is later',()=>{
 const f=fixture();f.rt.settings.audio.channel={clip:uuid,volume:1,delay:.1};f.rt.beamTarget=f.target;f.rt.beamVisibleSince=.2;f.rt.state.time=.27;f.P.update(f.rt);assert.equal(f.calls.length,0);assert(Math.abs(f.rt._presentation.pending[0].at-.3)<1e-8);
 f.rt.state.time=.299;f.P.update(f.rt);assert.equal(f.calls.length,0);f.rt.state.time=.3;f.P.update(f.rt);assert.equal(f.calls.length,1);
 const late=fixture();late.rt.settings.audio.channel={clip:uuid,volume:1,delay:.1};late.rt.beamTarget=late.target;late.rt.beamVisibleSince=.2;late.rt.state.time=.5;late.P.update(late.rt);assert.equal(late.calls.length,1,'an already due cue starts without another artificial delay');
});

test('same-object target recycling and a missed visible gap restart channel audio and VFX together',()=>{
 const f=fixture();f.rt.settings.audio.channel={clip:uuid,volume:1,delay:.1};Object.assign(f.rt.settings.visual,{resource:uuid,resourceKind:'spine'});f.target.node._combatGeneration=1;f.rt.beamTarget=f.target;f.rt.beamVisibleSince=.2;f.rt.state.time=.31;f.P.update(f.rt);f.P.attachments({visual:{node:f.root}},f.rt);f.loads[0].callback(null,{skeletonJson:{animations:{beam:{}}}});
 const first=f.calls[0].source,oldNode=f.root.children[0];f.target.node._combatGeneration=2;f.rt.beamVisibleSince=.4;f.rt.state.time=.45;f.P.update(f.rt);f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(first.stopped,true);assert.equal(f.calls.length,1);assert.equal(oldNode.destroyed,true);assert(Math.abs(f.rt._presentation.pending[0].at-.5)<1e-8);assert(Math.abs([...f.rt._presentation.nodes.values()][0].entity.age-.05)<1e-8);
 f.rt.state.time=.51;f.P.update(f.rt);assert.equal(f.calls.length,2);const second=f.calls[1].source,node=[...f.rt._presentation.nodes.values()][0].node;
 f.rt.beamVisibleSince=.6;f.rt.state.time=.65;f.P.update(f.rt);f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(second.stopped,true);assert.equal(node.destroyed,true);assert.equal(f.rt._presentation.pending.length,1);assert(Math.abs([...f.rt._presentation.nodes.values()][0].entity.age-.05)<1e-8);f.P.clear(f.rt);assert.equal(f.rt._presentation,undefined);
});

test('a one-frame authored flipbook crops its single cell and releases only the owned clone',()=>{
 const f=fixture(),visual=Settings.effective('guardian',{HeroSkills:{guardian:{visual:{resource:uuid,resourceKind:'sprite',resourceFrames:1,resourceColumns:1,resourceCell:16,resourceFps:24,resourceLoop:false}}}}).visual;Object.assign(visual,{passiveResource:'',beamResource:'',markResource:'',buffResource:'',tauntResource:'',shieldResource:''});f.rt.settings.visual=visual;
 let clones=0,destroyed=0,last;const asset={getRect:()=>({x:32,y:48,width:64,height:32}),clone(){clones++;return{setRect(value){last=value;},setOriginalSize(){},setOffset(){},destroy(){destroyed++;}};}};
 f.rt.effects=[{x:0,y:0,duration:1,remaining:.5}];f.P.attachments({visual:{node:f.root}},f.rt);f.loads[0].callback(null,asset);assert.deepEqual(last,{x:32,y:48,width:16,height:16});assert.equal(clones,1);f.rt.effects[0].remaining=0;f.P.attachments({visual:{node:f.root}},f.rt);assert.equal(clones,1);f.P.clear(f.rt);assert.equal(destroyed,1);
});

// Real AudioMgr state transitions, with an inert resource/audio platform.
function realAudio(){
 const pending=[],preferences={effects:true};
 class Source{constructor(){this.volume=1;this.loop=false;this.plays=0;this.audio={destroy(){}};}play(){this.plays++;this.isPlaying=true;}stop(){this.isPlaying=false;}pause(){this.isPlaying=false;}resume(){this.isPlaying=true;}}
 const cc={AudioSource:Source,AudioClip:class{},isValid:value=>!!value&&!value.destroyed};
 const modules={BaseMgr:{default:function(){}},CacheUtils:{CacheUtils:{getData(){return null;},saveData(){},canPlayEffect:()=>preferences.effects,canPlayMusin:()=>true}},ResourceMgr:{ResourceMgr:{getInstance:()=>({loadRes(bundle,path,type,callback,options){pending.push({bundle,path,callback,options});}})}},LogMgr:{LogMgr:{getInstance:()=>({error(){}})}}};
 const context={exports:{},cc,setTimeout,clearTimeout,require:name=>modules[name],__extends(ctor,base){ctor.prototype=Object.create(base.prototype);ctor.prototype.constructor=ctor;}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/AudioMgr.js'),'utf8'),context);
 const manager=context.exports.AudioMgr.getInstance();manager.init({});
 return {manager,pending,preferences,fail(request){request.options.onError(Error('silent failed clip'),null,()=>{});},finish(request){request.callback({loaded:true});}};
}
function withRealAudio(){const a=realAudio(),f=fixture(a.manager);f.rt.game.node={};f.rt.beamTarget=f.target;f.rt.settings.audio.channel={clip:uuid,bundle:'audio',path:'beam',volume:1,delay:0};return{...f,a};}

test('failed channel loads back off on the gameplay clock and recover with the real AudioMgr',()=>{
 const f=withRealAudio();
 for(let frame=0;frame<600;frame++){f.rt.state.time=frame/60;f.P.update(f.rt);for(const request of f.a.pending)if(!request.done){request.done=true;f.a.fail(request);}}
 assert(f.a.pending.length<=6,'failed optional audio must not load once per frame');assert.equal(f.a.manager.pendingClips.size,0);assert.equal(f.a.manager.audioSourceMap.size,1);
 const prior=f.a.pending.length;f.rt.state.time=30;f.P.update(f.rt);assert.equal(f.a.pending.length,prior+1);f.a.finish(f.a.pending.at(-1));f.P.update(f.rt);
 const source=f.rt._presentation.channel.source;assert.equal(source.plays,1);f.a.manager.stopSource(source);f.P.update(f.rt);assert.equal(source.plays,2,'an observed playing channel resumes immediately after interruption');
 f.P.clear(f.rt);assert.equal(f.a.manager.audioSourceMap.size,0);
});

test('channel retry state resets for target, cue and permission changes and cannot survive cleanup or pause',()=>{
 const f=withRealAudio();f.P.update(f.rt);f.a.fail(f.a.pending[0]);f.rt.state.time=.1;f.P.update(f.rt);assert.equal(f.a.pending.length,1);
 f.rt.available=()=>false;f.rt.state.time=5;f.P.update(f.rt);assert.equal(f.a.pending.length,1);f.rt.available=()=>true;f.P.update(f.rt);assert.equal(f.a.pending.length,2);f.a.fail(f.a.pending[1]);f.P.update(f.rt);
 f.target.node._combatGeneration=2;f.P.update(f.rt);assert.equal(f.a.pending.length,3);f.a.fail(f.a.pending[2]);f.P.update(f.rt);
 f.rt.settings.audio.channel={...f.rt.settings.audio.channel,path:'replacement'};f.P.update(f.rt);assert.equal(f.a.pending.length,4);f.a.fail(f.a.pending[3]);f.P.update(f.rt);
 f.a.manager.effectEpoch++;f.P.update(f.rt);assert.equal(f.a.pending.length,5);const obsolete=f.a.pending[4];f.P.clear(f.rt);f.a.finish(obsolete);assert.equal(f.a.manager.audioSourceMap.size,0);assert.equal(f.rt._presentation,undefined);
 f.rt.beamTarget=null;f.P.update(f.rt);assert.equal(f.a.pending.length,5);
});

test('disabled custom channel sound retries stay bounded and resume after effects become available',()=>{
 const f=withRealAudio();f.a.preferences.effects=false;f.P.update(f.rt);f.a.finish(f.a.pending[0]);
 for(let frame=1;frame<=120;frame++){f.rt.state.time=frame/60;f.P.update(f.rt);}
 assert.equal(f.a.pending.length,1,'the valid cached clip must not issue repeated loads');assert.equal([...f.a.manager.audioSourceMap.values()][0].plays,0);
 f.a.preferences.effects=true;f.rt.state.time=20;f.P.update(f.rt);assert.equal([...f.a.manager.audioSourceMap.values()][0].plays,1);f.P.clear(f.rt);
});
