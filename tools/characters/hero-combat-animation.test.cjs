'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Units=require('../../packages/game-data-editor/lib/unit-assets'),Weapons=require('../../assets/_script/HeroWeapons'),spine=require(Units.enginePath());
const keys=['spAniMa','spAniBody','spAniDrap','spAniHead','spAniBow','spAniArrow','spAniHand'];
function setup(style='fighter'){
 const exports={},modules={HeroWeapons:Weapons,HeroSkillPose:require('../../assets/_script/HeroSkillPose'),KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getHeroWeapon:()=>Weapons.find(style)})})}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroMakerRider.js'),'utf8'),{exports,cc:{v2:(x,y)=>({x,y})},require:name=>modules[name]});
 const rider=exports,controlExports={};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallPlayGameAniCtrl.js'),'utf8'),{exports:controlExports,require:name=>name==='HeroMakerRider'?rider:name==='KinghtFallModle'?{KinghtFallPlayAniEnum:{Idle:'idle',Move:'move',Die:'wqyl_lead_die'}}:{},cc:{Component:function(){},_decorator:{ccclass:T=>T,property:()=>()=>{}}},sp:{Skeleton:function(){}},__extends(C,P){C.prototype=Object.create(P.prototype);},__decorate:(_decorators,T,key)=>key===undefined?T:undefined});
 const actor=new controlExports.default(),descriptions=Units.describe(root,{type:'hero',id:'hero',heroStyle:style,noRuntime:true}).layers;
 const renderers=descriptions.map((description,index)=>{
  const atlas=new spine.TextureAtlas(description.atlas,name=>{const b=fs.readFileSync(require('node:url').fileURLToPath(description.pages[name]));return new spine.FakeTexture({width:b.readUInt32BE(16),height:b.readUInt32BE(20)});});
  const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(description.json),skeleton=new spine.Skeleton(data),mix=new spine.AnimationStateData(data),state=new spine.AnimationState(mix);
  skeleton.setSkinByName(description.skin);skeleton.setToSetupPose();skeleton.updateWorldTransform();
  const renderer={node:{x:0,y:0,scaleX:1,scaleY:1},skeletonData:{skeletonJson:description.json},state,skeleton,setMix:(a,b,t)=>mix.setMix(a,b,t),setAnimation:(...args)=>state.setAnimation(...args),addAnimation:(...args)=>state.addAnimation(...args),getCurrent:i=>state.getCurrent(i),findBone:n=>skeleton.findBone(n),findSlot:n=>skeleton.findSlot(n),update(dt){state.update(dt);state.apply(skeleton);skeleton.updateWorldTransform();},updateWorldTransform(){skeleton.updateWorldTransform();},setEventListener:fn=>state.addListener({event:(track,event)=>fn(track,event)}),setCompleteListener:fn=>state.addListener({complete:fn}),setTrackCompleteListener:(track,fn)=>track.listener={complete:fn}};
  actor[keys[index]]=renderer;renderer.setAnimation(0,'idle',true);return renderer;
 });
 actor.spAniSmoke={node:{},setAnimation(){},addAnimation(){}};
 for(const key of ['spAniSoulFire','spAniRevive','spAniLevelUp'])actor[key]={node:{active:false},setAnimation(){return{};},addAnimation(){},setTrackCompleteListener(){}};
 actor.ndReviveTail={};actor.setIdle();
 return {actor,rider,renderers,step(dt){renderers.forEach(r=>{r.state.update(dt);r.state.apply(r.skeleton);r.skeleton.updateWorldTransform();});rider.update(actor);}};
}
const track=(actor,key='spAniBody')=>actor[key].getCurrent(0),name=(actor,key)=>track(actor,key).animation.name;
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('moving mounted hero attacks without replacing the horse stride or restarting its rider clock',()=>{
 const h=setup(),{actor,rider}=h;let hits=0;actor.setAttackEvent(()=>hits++);
 rider.setCombatState(actor,{moving:true});actor.setAttack();const body=track(actor),horse=track(actor,'spAniMa');
 assert.equal(name(actor),'attack_fighter');assert.equal(name(actor,'spAniMa'),'move');assert.equal(horse.loop,true);
 for(let i=0;i<30;i++){h.step(1/60);rider.setCombatState(actor,{moving:true});assert.equal(track(actor),body);assert.equal(track(actor,'spAniMa'),horse);for(const key of keys.slice(2))close(track(actor,key).trackTime,body.trackTime);}
 assert.equal(hits,1,'only the rider emits one authored basic impact');
});

test('stopping during a live attack synchronizes the stationary horse without replaying the rider',()=>{
 const h=setup('vanguard'),{actor,rider}=h;rider.setCombatState(actor,{moving:true});actor.setAttack();h.step(.25);const body=track(actor),elapsed=body.trackTime;
 rider.setCombatState(actor,{moving:false});assert.equal(track(actor),body);assert.equal(name(actor,'spAniMa'),'attack_vanguard');close(track(actor,'spAniMa').trackTime,elapsed);
 h.step(.1);close(track(actor,'spAniMa').trackTime,track(actor).trackTime);
 rider.setCombatState(actor,{moving:true});assert.equal(track(actor),body);assert.equal(name(actor,'spAniMa'),'move');assert(track(actor).trackTime>=elapsed);
});

test('Mystic holds the actual authored impact pose while the stationary mount finishes one attack and idles',()=>{
 const h=setup('mystic'),{actor,rider}=h;rider.setCombatState(actor,{moving:false,beam:true});const body=track(actor),horse=track(actor,'spAniMa');
 assert.equal(name(actor),'attack_mystic');assert.equal(name(actor,'spAniMa'),'attack_mystic');
 for(let i=0;i<70;i++){h.step(1/60);rider.setCombatState(actor,{moving:false,beam:true});}
 assert.equal(track(actor),body,'a held cast does not restart for every damage tick');close(body.trackTime,rider.attackPoseTime(actor));assert.equal(body.timeScale,0);
 assert(horse.trackTime>.8,'horse progresses through the attack independently of the held pose');assert.equal(name(actor,'spAniMa'),'idle');assert.equal(track(actor,'spAniMa').timeScale,1);
 for(const key of keys.slice(2)){assert.equal(name(actor,key),'attack_mystic');close(track(actor,key).trackTime,body.trackTime);assert.equal(track(actor,key).timeScale,0);}
});

test('moving during a sustained beam animates the horse and endpoints without releasing the held rider',()=>{
 const h=setup('mystic'),{actor,rider}=h;rider.setCombatState(actor,{moving:false,beam:true});h.step(.25);const body=track(actor);
 rider.setCombatState(actor,{moving:true,beam:true});assert.equal(name(actor,'spAniMa'),'move');const horse=track(actor,'spAniMa');
 for(let i=0;i<20;i++){h.step(.05);rider.setCombatState(actor,{moving:true,beam:true});}
 assert.equal(track(actor),body);close(body.trackTime,rider.attackPoseTime(actor));assert(horse.trackTime>.9);assert.equal(horse.timeScale,1);
 rider.setCombatState(actor,{moving:true,beam:false});assert.equal(name(actor),'move');assert.equal(track(actor).timeScale,1,'ordinary rider playback is unfrozen after range breaks');
});

test('Mystic beam origin stays on the visible scepter attachment through the held pose and independent saddle movement',()=>{
 const h=setup('mystic'),{actor,rider}=h,renderer=actor.spAniBow;
 renderer.node.scaleX=-1;
 renderer.node.convertToWorldSpaceAR=p=>({x:400+renderer.node.x+p.x*renderer.node.scaleX*.75,y:200+renderer.node.y+p.y*.75});
 rider.setCombatState(actor,{moving:true,beam:true});
 for(let frame=0;frame<40;frame++){
  h.step(.025);if(frame<10)continue;
  const slot=renderer.skeleton.findSlot('Rider/HandRight/Staff'),attachment=slot.getAttachment(),vertices=new Float32Array(8);
  attachment.computeWorldVertices(slot.bone,vertices,0,2);
  const center=renderer.node.convertToWorldSpaceAR({x:(vertices[0]+vertices[2]+vertices[4]+vertices[6])/4,y:(vertices[1]+vertices[3]+vertices[5]+vertices[7])/4}),origin=rider.projectileOrigin(actor);
  assert(Math.hypot(center.x-origin.x,center.y-origin.y)<1e-4,'beam follows the equipped staff center, not the head, horse, or its initial idle pose');
 }
});

test('rapid spear pose samples seven complete attack cycles over 2.5 seconds while moving horse stays independent',()=>{
 const h=setup('vanguard'),{actor,rider}=h,duration=2.5,strikes=7,interval=duration/strikes;
 rider.setCombatState(actor,{moving:true,rapid:{elapsed:0,duration,strikes}});close(track(actor).trackTime,0);
 for(let strike=1;strike<=strikes;strike++){
  rider.setCombatState(actor,{moving:true,rapid:{elapsed:strike*interval,duration,strikes}});close(track(actor).trackTime,rider.attackPoseTime(actor));assert.equal(track(actor).timeScale,0);assert.equal(name(actor,'spAniMa'),'move');
  if(strike<strikes){rider.setCombatState(actor,{moving:true,rapid:{elapsed:strike*interval+interval*.4,duration,strikes}});assert(Math.abs(track(actor).trackTime-rider.attackPoseTime(actor))>.1);}
  h.step(.02);
 }
 rider.setCombatState(actor,{moving:false,rapid:{elapsed:duration-.01,duration,strikes}});assert.equal(name(actor,'spAniMa'),'attack_vanguard');close(track(actor,'spAniMa').trackTime,track(actor).trackTime);
 rider.setCombatState(actor,{moving:false});assert.equal(name(actor),'idle');assert.equal(name(actor,'spAniMa'),'idle');assert.equal(track(actor).timeScale,1);
});

test('rapid pulse input restarts only on a new impact token, with an attack-speed-independent seven-hit interval',()=>{
 const h=setup('vanguard'),{actor,rider}=h;rider.setCombatState(actor,{moving:false,rapid:true,pulse:1});const first=track(actor);close(first.trackTime,rider.attackPoseTime(actor));close(first.timeScale,.8333/(2.5/7));
 h.step(.05);rider.setCombatState(actor,{moving:false,rapid:true,pulse:1});assert.equal(track(actor),first);
 rider.setCombatState(actor,{moving:false,rapid:true,pulse:2});assert.notEqual(track(actor),first);close(track(actor).trackTime,rider.attackPoseTime(actor));
});

test('death and restart clear a held combat pose without overriding death or freezing the revived hero',()=>{
 const h=setup('mystic'),{actor,rider}=h;rider.setCombatState(actor,{moving:false,beam:true});h.step(.25);assert.equal(track(actor).timeScale,0);
 actor.setDie();rider.update(actor);assert.equal(name(actor),'wqyl_lead_die');assert.equal(name(actor,'spAniMa'),'wqyl_lead_die');
 actor.onRestart();rider.update(actor);assert.equal(name(actor),'idle');assert.equal(name(actor,'spAniMa'),'idle');assert.equal(track(actor).timeScale,1);
});

test('native TrackEntry setter-only APIs receive the held pose without freezing the mount track',()=>{
 const exports={},events=[];vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroMakerRider.js'),'utf8'),{exports,require:name=>name==='HeroSkillPose'?require('../../assets/_script/HeroSkillPose'):name==='HeroWeapons'?Weapons:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getHeroWeapon:()=>Weapons.find('mystic')})})}}});
 function renderer(mount){let entry;return {node:{scaleX:1,scaleY:1},skeletonData:{skeletonJson:mount?{_heroMakerMount:{}}:{_heroMaker:{},animations:{attack_mystic:{events:[{time:.2,name:'attack'}],bones:{body:{rotate:[{time:.8}]}}}}}},getCurrent:()=>entry,setMix(){},setAnimation(_i,animation,loop){entry={animation:{name:animation},loop,getTrackTime:()=>.4,getTimeScale:()=>1,setTrackTime:v=>events.push([mount?'mount':'rider','time',v]),setTimeScale:v=>events.push([mount?'mount':'rider','speed',v])};return entry;},addAnimation(){}};}
 const actor={spAniBody:renderer(false),spAniMa:renderer(true),isMove:false};exports.setCombatState(actor,{beam:true,moving:false});
 assert(events.some(e=>e[0]==='rider'&&e[1]==='time'&&e[2]===.2));assert(events.some(e=>e[0]==='rider'&&e[1]==='speed'&&e[2]===0));assert(!events.some(e=>e[0]==='mount'&&e[1]==='speed'&&e[2]===0));
});

test('skill timing reads the equipped rider attack event and converts saved playback into gameplay seconds',()=>{
 for(const style of Weapons.styles){
  const {actor,rider}=setup(style.id),animation=style.id==='skirmisher'?'attack':'attack_'+style.id;
  for(const speed of [.25,.65,1,1.5,4]){
   const timing=rider.skillTiming(actor,animation,speed);
   assert.equal(timing.animation,animation);close(timing.sourceHit,.1667);close(timing.sourceDuration,.8333);
   close(timing.hit,.1667/speed);close(timing.duration,.8333/speed);assert.equal(timing.frozen,false);
  }
  const frozen=rider.skillTiming(actor,animation,0);assert.equal(frozen.frozen,true);assert.equal(frozen.hit,Infinity);
  assert.equal(rider.skillTiming(actor,'not-in-rider',1).animation,animation,'invalid custom pose falls back without changing saved settings');
 }
});

test('Skirmisher authored arrow pose and stationary mount land on the active windup, even after a playback override',()=>{
 const h=setup('skirmisher'),{actor,rider}=h;let hits=0,hitTime=0,time=0;
 actor.setAttackEvent(()=>{hits++;hitTime=time;});rider.setCombatState(actor,{moving:false});actor.setAttack();
 assert.equal(rider.retimeAttack(actor,.35),true);
 const body=track(actor);close(body.timeScale,.1667/.35);
 for(let i=0;i<30;i++){
  time=(i+1)/120;
  for(const key of keys)track(actor,key).timeScale=2;
  rider.update(actor);h.step(1/120);
  assert.equal(hits,0,'active windup cannot release at the ordinary .1667s marker');
  close(track(actor,'spAniMa').trackTime,body.trackTime);close(track(actor,'spAniBow').trackTime,body.trackTime);
 }
 for(let i=30;i<44;i++){time=(i+1)/120;h.step(1/120);}
 assert.equal(hits,1);assert(Math.abs(hitTime-.35)<=1/120+.0001);
 rider.setCombatState(actor,{moving:true});assert.equal(name(actor,'spAniMa'),'move');
 rider.setCombatState(actor,{moving:false});close(track(actor,'spAniMa').trackTime,body.trackTime);close(track(actor,'spAniMa').timeScale,body.timeScale);
 actor.setDie();rider.update(actor);assert.equal(track(actor).timeScale,1,'retimed cast cannot leak into death');
 actor.onRestart();actor.setAttack();assert.equal(track(actor).timeScale,1,'ordinary attacks retain original playback after restart');
});

test('zero-windup arrow samples its source release pose without an infinite animation speed',()=>{
 const h=setup('skirmisher'),{actor,rider}=h;rider.setCombatState(actor,{moving:false});actor.setAttack();
 assert.equal(rider.retimeAttack(actor,0),true);close(track(actor).trackTime,.1667);assert.equal(track(actor).timeScale,1);
 assert.equal(rider.retimeAttack(actor,Infinity),false);assert.equal(rider.retimeAttack(actor,-1),false);
});

test('gameplay commits sampled geometry before depth capture and lateUpdate keeps the same impact pose',()=>{
 const h=setup('vanguard'),{actor,rider}=h,interval=2.5/7;let follows=0;
 const original=actor.spAniMa.findBone;actor.spAniMa.findBone=function(bone){follows++;return original.call(this,bone);};
 rider.setCombatState(actor,{moving:true,rapid:{elapsed:interval,duration:2.5,strikes:7},deferUpdate:true});
 assert.equal(follows,1,'the saddle position is committed before a scene depth copy can run');close(track(actor).trackTime,rider.attackPoseTime(actor));
 const renderer=actor.spAniBow,bone=renderer.skeleton.findBone('Rider/HandRight/Spear'),before={x:bone.worldX,y:bone.worldY};
 renderer.state.apply(renderer.skeleton);renderer.skeleton.updateWorldTransform();close(bone.worldX,before.x);close(bone.worldY,before.y);
 actor.lateUpdate();assert.equal(follows,2);close(track(actor).trackTime,rider.attackPoseTime(actor));assert.equal(name(actor,'spAniMa'),'move');
 rider.setCombatState(actor,{moving:false,rapid:{elapsed:interval*2,duration:2.5,strikes:7},deferUpdate:true});
 assert.equal(follows,3);actor.lateUpdate();assert.equal(follows,4);assert.equal(name(actor,'spAniMa'),'attack_vanguard');close(track(actor,'spAniMa').trackTime,track(actor).trackTime);
 rider.setCombatState(actor,{moving:false,deferUpdate:true});actor.lateUpdate();assert.equal(name(actor),'idle');assert.equal(track(actor).timeScale,1);
});

test('Mystic source windup and its one stationary horse attack honor saved slow, fast and frozen playback',()=>{
 for(const playback of [.5,2,0]){
  const h=setup('mystic'),{actor,rider}=h;
  rider.setCombatState(actor,{moving:false,beam:true,playback,deferUpdate:true});
  close(track(actor).timeScale,playback);close(track(actor,'spAniMa').timeScale,playback);
  const elapsed=playback?.1667/playback*.8:.5;h.step(elapsed);
  close(track(actor).trackTime,playback?elapsed*playback:0);
  if(playback){
   h.step(.1667/playback*.3);close(track(actor).trackTime,.1667);assert.equal(track(actor).timeScale,0);
   for(let frame=0;frame<120;frame++){h.step(1/60);rider.setCombatState(actor,{moving:false,beam:true,playback,deferUpdate:true});}
   assert.equal(name(actor,'spAniMa'),'idle');assert.equal(track(actor,'spAniMa').timeScale,1);
  }else {assert.equal(name(actor,'spAniMa'),'attack_mystic');close(track(actor,'spAniMa').trackTime,0);}
 }
});

test('left-hand ordering caches immutable slot metadata but keeps live visibility and sibling changes correct',()=>{
 const {actor,rider}=setup('guardian'),parent={children:[]};let slotsRead=0,siblingReads=0,reorders=0,attached=true;
 const json=actor.spAniArrow.skeletonData.skeletonJson,slots=json.slots;
 Object.defineProperty(json,'slots',{get(){slotsRead++;return slots;},configurable:true});
 for(const key of keys){const node=actor[key].node;node.parent=parent;node.zIndex=0;node.getSiblingIndex=()=>{siblingReads++;return parent.children.indexOf(node);};node.setSiblingIndex=index=>{reorders++;parent.children.splice(parent.children.indexOf(node),1);parent.children.splice(index,0,node);};parent.children.push(node);}
 actor.spAniArrow.findSlot=()=>({getAttachment:()=>attached?{}:null});
 rider.orderLeftHand(actor);const firstReorders=reorders;
 for(let frame=0;frame<100;frame++)rider.orderLeftHand(actor);
 assert.equal(slotsRead,1);assert.equal(siblingReads,0);assert.equal(reorders,firstReorders,'stable draw order avoids native sibling calls');assert.equal(parent.children[0],actor.spAniArrow.node);
 attached=false;rider.orderLeftHand(actor);assert.equal(parent.children.at(-1),actor.spAniArrow.node);
 attached=true;rider.orderLeftHand(actor);assert.equal(parent.children[0],actor.spAniArrow.node);
 parent.children.reverse();rider.orderLeftHand(actor);assert.equal(parent.children[0],actor.spAniArrow.node,'external sibling reorder is still repaired');
});

test('all six first-frame mounted attacks keep a walking horse before the first skill simulation update',()=>{
 for(const style of Weapons.styles){
  const h=setup(style.id),{actor,rider}=h;let riderHits=0,horseAttacks=0;
  actor.setAttackEvent(()=>riderHits++);const horseSet=actor.spAniMa.setAnimation;actor.spAniMa.setAnimation=function(index,animation,loop){if(/^attack(?:_|$)/.test(animation))horseAttacks++;return horseSet(index,animation,loop);};
  rider.enableCombatMotion(actor);actor.setMove();const stride=track(actor,'spAniMa');actor.setAttack();const body=track(actor);
  assert.equal(name(actor,'spAniMa'),'move',style.id+' moving horse never enters attack at cast start');assert.equal(track(actor,'spAniMa'),stride);assert.equal(horseAttacks,0);
  for(let frame=0;frame<15;frame++)h.step(1/60);
  assert.equal(track(actor),body);assert.equal(track(actor,'spAniMa'),stride);assert.equal(horseAttacks,0);assert.equal(riderHits,1);
  actor.setIdle();assert.equal(track(actor),body);assert.equal(name(actor,'spAniMa'),body.animation.name);close(track(actor,'spAniMa').trackTime,body.trackTime);assert.equal(horseAttacks,1,'stopping joins only the current attack phase');
  const joined=track(actor,'spAniMa');for(let frame=0;frame<6;frame++)h.step(1/60);assert.equal(track(actor,'spAniMa'),joined);assert.equal(horseAttacks,1);
  actor.setMove();assert.equal(track(actor),body);assert.equal(name(actor,'spAniMa'),'move');assert.equal(track(actor,'spAniMa').mixingFrom,joined);assert.equal(track(actor,'spAniMa').mixDuration,.1,'horse blends out while rider attack continues');
 }
});

test('rapid thrust movement input switches the horse immediately and stopping resumes its current sampled phase once',()=>{
 const h=setup('vanguard'),{actor,rider}=h;const options={rapid:{elapsed:.2,duration:2.5,strikes:7},moving:false};
 rider.setCombatState(actor,options);h.step(1/60);const body=track(actor),firstHorse=track(actor,'spAniMa');assert.equal(firstHorse.animation.name,'attack_vanguard');
 actor.setMove();assert.equal(name(actor,'spAniMa'),'move');assert.equal(track(actor,'spAniMa').mixingFrom,firstHorse);assert.equal(track(actor),body);
 for(let frame=0;frame<8;frame++){h.step(1/60);rider.setCombatState(actor,{moving:true,rapid:{elapsed:.2+(frame+1)/60,duration:2.5,strikes:7}});assert.equal(name(actor,'spAniMa'),'move');assert.equal(track(actor),body);}
 actor.setIdle();const joined=track(actor,'spAniMa');assert.equal(name(actor,'spAniMa'),'attack_vanguard');close(joined.trackTime,body.trackTime);assert.equal(joined.timeScale,0);
 for(let frame=0;frame<8;frame++){rider.setCombatState(actor,{moving:false,rapid:{elapsed:.4+(frame+1)/60,duration:2.5,strikes:7}});assert.equal(track(actor,'spAniMa'),joined);assert.equal(track(actor),body);close(joined.trackTime,body.trackTime);}
});

test('Mystic movement blends out its one horse attack and stopping never replays it during the same beam',()=>{
 for(const startsMoving of [false,true]){
  const h=setup('mystic'),{actor,rider}=h;let horseAttacks=0;const original=actor.spAniMa.setAnimation;
  actor.spAniMa.setAnimation=function(index,animation,loop){if(animation==='attack_mystic')horseAttacks++;return original(index,animation,loop);};
  rider.setCombatState(actor,{moving:startsMoving,beam:true});h.step(.1);const body=track(actor);
  if(!startsMoving){const cast=track(actor,'spAniMa');actor.setMove();assert.equal(name(actor,'spAniMa'),'move');assert.equal(track(actor,'spAniMa').mixingFrom,cast);}
  else assert.equal(name(actor,'spAniMa'),'move');
  h.step(.1);actor.setIdle();assert.equal(name(actor,'spAniMa'),'idle');assert.equal(track(actor),body);
  for(let frame=0;frame<90;frame++){h.step(1/60);rider.setCombatState(actor,{moving:false,beam:true});}
  assert.equal(horseAttacks,startsMoving?0:1);assert.equal(name(actor,'spAniMa'),'idle');assert.equal(track(actor),body);close(body.trackTime,.1667);
 }
});

function slotVertices(renderer,name){
 const slot=renderer.skeleton.findSlot(name),attachment=slot.getAttachment(),out=new Float32Array(attachment.worldVerticesLength||8);
 if(attachment.worldVerticesLength)attachment.computeWorldVertices(slot,0,attachment.worldVerticesLength,out,0,2);else attachment.computeWorldVertices(slot.bone,out,0,2);
 return [...out];
}

test('Vanguard visible spear and horse geometry use the current impact sample at low and high frame rates',()=>{
 for(const dt of [1/120,1/60,.05,.1]){
  const h=setup('vanguard'),{actor,rider}=h,interval=2.5/7;
  rider.setCombatState(actor,{moving:false,rapid:{elapsed:interval*2-dt,duration:2.5,strikes:7}});h.step(0);
  rider.setCombatState(actor,{moving:false,rapid:{elapsed:interval*2,duration:2.5,strikes:7},deferUpdate:true});
  h.step(dt);const rendered=slotVertices(actor.spAniBow,'Rider/HandRight/Spear');
  actor.spAniBow.state.apply(actor.spAniBow.skeleton);actor.spAniBow.skeleton.updateWorldTransform();
  const actual=slotVertices(actor.spAniBow,'Rider/HandRight/Spear');assert(rendered.every((v,i)=>Math.abs(v-actual[i])<1e-5),'track assignment must be applied before drawing, not one frame later');
  const horse=actor.spAniMa.skeleton.findBone('bone2'),before={x:horse.worldX,y:horse.worldY};actor.spAniMa.state.apply(actor.spAniMa.skeleton);actor.spAniMa.skeleton.updateWorldTransform();close(horse.worldX,before.x);close(horse.worldY,before.y);
 }
});

test('logical Mystic elapsed time commits its clamped visible hold pose before scene capture',()=>{
 const {actor,rider}=setup('mystic');rider.setCombatState(actor,{beam:true,beamElapsed:.7,playback:2,moving:false,deferUpdate:true});
 const rendered=slotVertices(actor.spAniBow,'Rider/HandRight/Staff');close(track(actor).trackTime,.1667);assert.equal(track(actor).timeScale,0);
 actor.spAniBow.state.apply(actor.spAniBow.skeleton);actor.spAniBow.skeleton.updateWorldTransform();const actual=slotVertices(actor.spAniBow,'Rider/HandRight/Staff');assert(rendered.every((v,i)=>Math.abs(v-actual[i])<1e-5));
});

test('weapon-only aiming preserves upright rider and mount and rotates each active weapon through all eight directions',()=>{
 for(const style of ['skirmisher','fighter','vanguard','mystic']){
  const h=setup(style),{actor,rider}=h;rider.setCombatState(actor,{moving:false,beam:style==='mystic',beamElapsed:.2});
  if(style!=='mystic')actor.setAttack();h.step(.2);
  const renderer=actor.spAniBow,hand=renderer.skeleton.findBone('Rider/HandRight'),weapon=renderer.skeleton.findBone(style==='skirmisher'?'Rider/HandRight/Bow/Arrow':style==='vanguard'?'Rider/HandRight/Spear':style==='fighter'?'Rider/HandRight/Sword':'Rider/HandRight/Staff');
  const body=renderer.skeleton.findBone('Rider/Body'),horse=actor.spAniMa.skeleton.findBone('bone2'),bodyBefore={x:body.worldX,y:body.worldY},horseBefore={x:horse.worldX,y:horse.worldY};
  for(const angle of [-135,-90,-45,0,45,90,135,180]){
   const direction={x:Math.cos(angle*Math.PI/180),y:Math.sin(angle*Math.PI/180)},face=direction.x<-.0001?-1:1;renderer.node.scaleX=face;
   require('../../assets/_script/HeroSkillPose').removeAim(renderer);renderer.update(0);const baseHand={x:hand.worldX,y:hand.worldY},baseVector={x:weapon.worldX-hand.worldX,y:weapon.worldY-hand.worldY};
   require('../../assets/_script/HeroSkillPose').applyAim(renderer,direction,face,{fresh:true});
   const radians=Math.atan2(direction.y,direction.x*face),x=baseVector.x*Math.cos(radians)-baseVector.y*Math.sin(radians),y=baseVector.x*Math.sin(radians)+baseVector.y*Math.cos(radians);
   assert(Math.abs(weapon.worldX-baseHand.x-x)<1e-4);assert(Math.abs(weapon.worldY-baseHand.y-y)<1e-4);
   close(body.worldX,bodyBefore.x);close(body.worldY,bodyBefore.y);close(horse.worldX,horseBefore.x);close(horse.worldY,horseBefore.y);
  }
 }
});

test('marker-sampled arrow tip matches actual equipped geometry without advancing tracks or replaying attack callbacks',()=>{
 const {actor,rider}=setup('skirmisher'),Pose=require('../../assets/_script/HeroSkillPose'),renderer=actor.spAniArrow;let events=0;actor.setAttackEvent(()=>events++);
 actor.setAttack();const body=track(actor);const originalTime=body.trackTime;
 renderer.node.convertToWorldSpaceAR=p=>({x:renderer.node.x+p.x*renderer.node.scaleX,y:renderer.node.y+p.y*renderer.node.scaleY});
 for(const direction of [{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:-Math.SQRT1_2,y:-Math.SQRT1_2}]){
  renderer.node.scaleX=direction.x<0?-1:1;const snapshot=rider.skillOrigin(actor,direction);assert(snapshot);assert.equal(events,0);close(body.trackTime,originalTime);
  Pose.removeAim(renderer);renderer.getCurrent(0).trackTime=.1667;renderer.update(0);Pose.applyAim(renderer,direction,renderer.node.scaleX,{fresh:true,referenceAngle:Pose.arrowAimAngle(renderer,renderer.skeletonData.skeletonJson,'attack',.1667)});const point=Pose.arrowTip(renderer,direction,renderer.node.scaleX),expected=renderer.node.convertToWorldSpaceAR(point);
  assert(Math.abs(snapshot.x-expected.x)<1e-4);assert(Math.abs(snapshot.y-expected.y)<1e-4);
 }
 assert.equal(events,0);close(body.trackTime,originalTime);
});

test('custom Skirmisher aim predictions match all five authored release clips before and after casting',()=>{
 const Pose=require('../../assets/_script/HeroSkillPose');
 for(const animation of ['attack_fighter','attack_vanguard','attack_mystic','attack_bruiser','attack_guardian']){
  const {actor,rider}=setup('skirmisher'),renderer=actor.spAniArrow;renderer.node.convertToWorldSpaceAR=p=>({x:renderer.node.x+p.x*renderer.node.scaleX,y:renderer.node.y+p.y*renderer.node.scaleY});let hits=0;actor.setAttackEvent(()=>hits++);
  const ordinary=rider.skillOrigin(actor,{x:1,y:0}),predicted=rider.skillOrigin(actor,{x:1,y:0},animation);assert(predicted);assert(Math.hypot(ordinary.x-predicted.x,ordinary.y-predicted.y)>30,'this clip must exercise its own source geometry');
  assert.equal(name(actor),'idle');close(track(actor).trackTime,0);assert.equal(hits,0);assert.deepEqual(rider.skillOrigin(actor,{x:1,y:0},'move'),ordinary,'unprovided attack clips use the ordinary fallback');
  actor._skillAnimationOverride=animation;actor.setAttack();delete actor._skillAnimationOverride;const release=rider.skillOrigin(actor,{x:1,y:0},animation);close(predicted.x,release.x);close(predicted.y,release.y);
  renderer.state.clearTracks();const source=renderer.setAnimation(0,animation,false);source.trackTime=.1667;renderer.update(0);Pose.applyAim(renderer,{x:1,y:0},1,{fresh:true,referenceAngle:Pose.arrowAimAngle(renderer,renderer.skeletonData.skeletonJson,animation,.1667)});const actual=renderer.node.convertToWorldSpaceAR(Pose.arrowTip(renderer,{x:1,y:0},1));
  assert(Math.hypot(predicted.x-actual.x,predicted.y-actual.y)<1e-4,'prediction must match equipped region vertices');assert.equal(hits,0,'prediction never advances gameplay callbacks');
 }
});

test('fast successive basic attacks blend recovery without early or duplicate rider attack events',()=>{
 const h=setup('bruiser'),{actor,rider}=h;let hits=0;actor.setAttackEvent(()=>hits++);rider.setCombatState(actor,{moving:false});actor.setAttack();h.step(.5);
 const renderer=actor.spAniBow,previous=slotVertices(renderer,'Rider/HandRight/Axe');actor.setAttack();assert.equal(track(actor).mixDuration,.06);assert.equal(track(actor,'spAniMa').mixDuration,.06);
 h.step(1/120);const mixed=slotVertices(renderer,'Rider/HandRight/Axe');assert(Math.max(...mixed.map((v,i)=>Math.abs(v-previous[i])))<30);assert.equal(hits,1);
 for(let i=0;i<24;i++)h.step(1/120);assert.equal(hits,2);
});

test('non-attack saved animation names fall back to a real authored style attack',()=>{
 const {actor,rider}=setup('fighter');for(const invalid of ['idle','move','wqyl_lead_die','not-real']){actor._skillAnimationOverride=invalid;assert.equal(rider.attackName(actor),'attack_fighter');assert.equal(rider.skillTiming(actor,invalid,1).animation,'attack_fighter');}
});

function browserRealtime(h){
 for(const renderer of h.renderers){
  renderer._skeleton=renderer.skeleton;
  // Installed Creator's real-time update applies local animation, while its
  // public world-transform helper only serves the cached rendering path.
  renderer.update=function(dt){this.state.update(dt);this.state.apply(this.skeleton);};
  renderer.updateWorldTransform=function(){};
 }
 return h;
}

test('Creator browser wrappers commit sampled and aimed geometry before scene capture',()=>{
 const {actor,rider}=browserRealtime(setup('mystic')),Pose=require('../../assets/_script/HeroSkillPose');
 rider.setCombatState(actor,{beam:true,beamElapsed:.2,moving:false,aimDirection:{x:0,y:1},deferUpdate:true});
 const renderer=actor.spAniBow,before=slotVertices(renderer,'Rider/HandRight/Staff');
 renderer.skeleton.updateWorldTransform();const after=slotVertices(renderer,'Rider/HandRight/Staff');
 assert(before.every((v,i)=>Math.abs(v-after[i])<1e-5),'world vertices must already match the aimed sample before the renderer runs');
 const horse=actor.spAniMa;horse.getCurrent(0).trackTime=.1667;horse.update(0);rider.follow(actor);
 const saddle=horse.skeleton.findBone('bone2'),info=actor.spAniBody.skeletonData.skeletonJson._heroMaker.saddle;
 close(actor.spAniBody.node.x,saddle.worldX-info.x);close(actor.spAniBody.node.y,saddle.worldY-info.y);
 Pose.removeAim(renderer);
});

test('Skirmisher aimed release aligns the equipped arrow axis with each ray while ordinary attacks retain authored poses',()=>{
 const Pose=require('../../assets/_script/HeroSkillPose');
 for(const angle of [-135,-90,-45,0,45,90,135,180]){
  const h=browserRealtime(setup('skirmisher')),{actor,rider}=h,direction={x:Math.cos(angle*Math.PI/180),y:Math.sin(angle*Math.PI/180)},face=direction.x<-.0001?-1:1;
  for(const renderer of h.renderers)renderer.node.scaleX=face;
  actor.setAttack();for(const key of keys){track(actor,key).trackTime=.1667;actor[key].update(0);}
  rider.setCombatState(actor,{moving:false,aimDirection:direction,deferUpdate:true});
  const renderer=actor.spAniArrow,slot=renderer.skeleton.findSlot('Rider/HandRight/Bow/Arrow'),attachment=slot.getAttachment(),bone=slot.bone,rotation=attachment.rotation*Math.PI/180,x=Math.cos(rotation),y=Math.sin(rotation);
  const axis={x:(bone.a*x+bone.b*y)*face,y:bone.c*x+bone.d*y},length=Math.hypot(axis.x,axis.y);
  assert(Math.abs(axis.x/length-direction.x)<1e-4,angle+' arrow x must follow its gameplay ray');assert(Math.abs(axis.y/length-direction.y)<1e-4,angle+' arrow y must follow its gameplay ray');
  const before=slotVertices(renderer,'Rider/HandRight/Bow/Arrow');renderer.skeleton.updateWorldTransform();assert(before.every((v,i)=>Math.abs(v-slotVertices(renderer,'Rider/HandRight/Bow/Arrow')[i])<1e-5));
 }
 const {actor,rider}=setup('skirmisher');actor.setAttack();const renderer=actor.spAniArrow;track(actor,'spAniArrow').trackTime=.1667;renderer.update(0);const before=slotVertices(renderer,'Rider/HandRight/Bow/Arrow');
 track(actor).trackTime=.1667;rider.setCombatState(actor,{moving:false,deferUpdate:true});rider.update(actor);const after=slotVertices(renderer,'Rider/HandRight/Bow/Arrow');assert(before.every((v,i)=>Math.abs(v-after[i])<1e-5),'unscoped basic attacks keep the authored weapon angle');
 assert(Pose.arrowAimAngle(renderer,renderer.skeletonData.skeletonJson,'attack',.1667)>10);
});

test('saddle following rotates a mirrored and scaled horse delta without accumulating fitted offsets',()=>{
 const {actor,rider}=browserRealtime(setup('vanguard')),horse=actor.spAniMa,info=actor.spAniBody.skeletonData.skeletonJson._heroMaker.saddle;
 horse.node.angle=65;horse.node.scaleX=-1.25;horse.node.scaleY=.8;
 actor.spAniBody.node.x=13;actor.spAniBody.node.y=-4;
 rider.setCombatState(actor,{moving:false,rapid:{elapsed:2.5/7,duration:2.5,strikes:7},deferUpdate:true});
 const saddle=horse.skeleton.findBone('bone2'),x=(saddle.worldX-info.x)*horse.node.scaleX,y=(saddle.worldY-info.y)*horse.node.scaleY,r=65*Math.PI/180;
 const expected={x:13+x*Math.cos(r)-y*Math.sin(r),y:-4+x*Math.sin(r)+y*Math.cos(r)};
 close(actor.spAniBody.node.x,expected.x);close(actor.spAniBody.node.y,expected.y);for(let frame=0;frame<20;frame++)rider.follow(actor);close(actor.spAniBody.node.x,expected.x);close(actor.spAniBody.node.y,expected.y);
 rider.removeFollow(actor);close(actor.spAniBody.node.x,13);close(actor.spAniBody.node.y,-4);
});

test('custom attack clips share the body marker without duplicating events on equipment layers',()=>{
 const {actor,rider}=setup('fighter');
 for(const key of keys.slice(1)){
  const json=actor[key].skeletonData.skeletonJson;json.animations.attack_custom=JSON.parse(JSON.stringify(json.animations.attack_fighter));delete json.animations.attack_custom.events;
 }
 actor.spAniBody.skeletonData.skeletonJson.animations.attack_custom.events=[{name:'attack',time:.31}];
 actor._skillAnimationOverride='attack_custom';assert.equal(rider.attackName(actor),'attack_custom');close(rider.skillTiming(actor,'attack_custom',1).sourceHit,.31);
 delete actor.spAniHead.skeletonData.skeletonJson.animations.attack_custom;assert.equal(rider.attackName(actor),'attack_fighter','every participating equipment layer still needs the chosen clip');
});

test('cumulative Mystic source samples resume frozen rider and one horse attack without jumping after speed changes',()=>{
 const h=browserRealtime(setup('mystic')),{actor,rider}=h;
 rider.setCombatState(actor,{beam:true,beamElapsed:3,beamSourceTime:0,playback:0,moving:false,deferUpdate:true});const body=track(actor),horse=track(actor,'spAniMa');close(body.trackTime,0);close(horse.timeScale,0);
 rider.setCombatState(actor,{beam:true,beamElapsed:3.1,beamSourceTime:.05,playback:.5,moving:false,deferUpdate:true});assert.equal(track(actor),body);assert.equal(track(actor,'spAniMa'),horse);close(body.trackTime,.05);close(horse.timeScale,.5);
 rider.setCombatState(actor,{beam:true,beamElapsed:3.15,beamSourceTime:.15,playback:2,moving:false,deferUpdate:true});close(body.trackTime,.15);close(horse.timeScale,2);
 rider.setCombatState(actor,{beam:true,beamSourceTime:.25,playback:2,moving:false,deferUpdate:true});close(body.trackTime,.1667);close(body.timeScale,0);close(horse.timeScale,2);
 rider.setCombatState(actor,{beam:true,beamSourceTime:0,playback:1,animation:'attack_fighter',moving:false,deferUpdate:true});assert.equal(name(actor),'attack_fighter');close(track(actor).trackTime,0);assert.equal(name(actor,'spAniMa'),'attack_fighter');close(track(actor,'spAniMa').trackTime,0);
});

test('real Spine boss-control events and queued damage share saved playback and game speed through partial expiry',()=>{
 const r=setup('fighter').actor.spAniBody,{setup:gameplay}=require('../testing/backend-gameplay-harness.cjs');
 for(const globalSpeed of [.5,2])for(const playback of [.5,2])for(const wallStep of [1/60,.05]){
  const h=gameplay(),tools=h.load('GameToolsOverrides'),combat=h.load('RelicCombat'),control=h.load('RelicRuntime'),enemy=h.e.actor('KinghtFallEnemyBase',0,0),settings={timingDefaults:{'enemy:90010:default':{attack:.1667}},animationSpeeds:{'enemy:90010:default':playback}};
  h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data.GameTools=settings;h.ui.speed=globalSpeed;enemy.cfg={ID:90010,IsBoss:true};enemy.node._combatGeneration=1;enemy.spAni=r;enemy.time={Attack:-1};enemy.isDead=()=>false;enemy.onUpdate=()=>{};r.timeScale=globalSpeed;r.paused=false;
  r.state.clearTracks();r.state.listeners=[];r.setAnimation(0,'attack_fighter',false);let time=0,eventAt=null,damageAt=null;r.setEventListener((_track,event)=>{if(event.data.name==='attack'&&eventAt===null)eventAt=time;});
  const before=JSON.stringify(settings);control.applyControl(enemy,.23,.5);tools.attack(enemy,'enemy',()=>damageAt=time);
  for(let frame=0;frame<240&&(eventAt===null||damageAt===null);frame++){const dt=wallStep*globalSpeed;time+=dt;tools.tick(dt,true);combat.updateEnemy(enemy,dt);tools.applyAnimationPlayback(enemy,'enemy');r.update(wallStep*r.timeScale);}
  assert.notEqual(eventAt,null);assert.notEqual(damageAt,null);assert(Math.abs(eventAt-damageAt)<=wallStep*globalSpeed+1e-7,'rendered source event and hit must cross in the same simulation frame');assert.equal(JSON.stringify(settings),before);
  combat.releaseControl(enemy);close(r.timeScale,globalSpeed);
 }
});
