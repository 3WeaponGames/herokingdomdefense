'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Units=require('../../packages/game-data-editor/lib/unit-assets'),Weapons=require('../../assets/_script/HeroWeapons'),spine=require(Units.enginePath());
const keys=['spAniMa','spAniBody','spAniDrap','spAniHead','spAniBow','spAniArrow','spAniHand'];
function setup(style='fighter'){
 const exports={},modules={HeroWeapons:Weapons,KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getHeroWeapon:()=>Weapons.find(style)})})}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroMakerRider.js'),'utf8'),{exports,cc:{v2:(x,y)=>({x,y})},require:name=>modules[name]});
 const rider=exports,controlExports={};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallPlayGameAniCtrl.js'),'utf8'),{exports:controlExports,require:name=>name==='HeroMakerRider'?rider:name==='KinghtFallModle'?{KinghtFallPlayAniEnum:{Idle:'idle',Move:'move',Die:'wqyl_lead_die'}}:{},cc:{Component:function(){},_decorator:{ccclass:T=>T,property:()=>()=>{}}},sp:{Skeleton:function(){}},__extends(C,P){C.prototype=Object.create(P.prototype);},__decorate:(_decorators,T,key)=>key===undefined?T:undefined});
 const actor=new controlExports.default(),descriptions=Units.describe(root,{type:'hero',id:'hero',heroStyle:style,noRuntime:true}).layers;
 const renderers=descriptions.map((description,index)=>{
  const atlas=new spine.TextureAtlas(description.atlas,name=>{const b=fs.readFileSync(require('node:url').fileURLToPath(description.pages[name]));return new spine.FakeTexture({width:b.readUInt32BE(16),height:b.readUInt32BE(20)});});
  const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(description.json),skeleton=new spine.Skeleton(data),mix=new spine.AnimationStateData(data),state=new spine.AnimationState(mix);
  skeleton.setSkinByName(description.skin);skeleton.setToSetupPose();skeleton.updateWorldTransform();
  const renderer={node:{x:0,y:0,scaleX:1,scaleY:1},skeletonData:{skeletonJson:description.json},state,skeleton,setMix:(a,b,t)=>mix.setMix(a,b,t),setAnimation:(...args)=>state.setAnimation(...args),addAnimation:(...args)=>state.addAnimation(...args),getCurrent:i=>state.getCurrent(i),findBone:n=>skeleton.findBone(n),setEventListener:fn=>state.addListener({event:(track,event)=>fn(track,event)}),setCompleteListener:fn=>state.addListener({complete:fn}),setTrackCompleteListener:(track,fn)=>track.listener={complete:fn}};
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
 const exports={},events=[];vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroMakerRider.js'),'utf8'),{exports,require:name=>name==='HeroWeapons'?Weapons:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getHeroWeapon:()=>Weapons.find('mystic')})})}}});
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

test('gameplay can defer pose synchronization to the one animation lateUpdate pass',()=>{
 const h=setup('vanguard'),{actor,rider}=h,interval=2.5/7;let follows=0;
 const original=actor.spAniMa.findBone;actor.spAniMa.findBone=function(bone){follows++;return original.call(this,bone);};
 rider.setCombatState(actor,{moving:true,rapid:{elapsed:interval,duration:2.5,strikes:7},deferUpdate:true});
 assert.equal(follows,0,'simulation must not repeat its seven-layer render traversal');close(track(actor).trackTime,0);
 actor.lateUpdate();assert.equal(follows,1);close(track(actor).trackTime,rider.attackPoseTime(actor));assert.equal(name(actor,'spAniMa'),'move');
 rider.setCombatState(actor,{moving:false,rapid:{elapsed:interval*2,duration:2.5,strikes:7},deferUpdate:true});
 assert.equal(follows,1);actor.lateUpdate();assert.equal(follows,2);assert.equal(name(actor,'spAniMa'),'attack_vanguard');close(track(actor,'spAniMa').trackTime,track(actor).trackTime);
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
