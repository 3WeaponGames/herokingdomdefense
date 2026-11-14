'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Pose=require('../../assets/_script/HeroSkillPose'),Weapons=require('../../assets/_script/HeroWeapons');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('aim cleanup never dereferences a bone wrapper after its native skeleton asset was replaced',()=>{
 let disposed=false,rotation=0;const bone={getRotation(){if(disposed)throw Error('Disposed native Bone');return rotation;},setRotation(v){if(disposed)throw Error('Disposed native Bone');rotation=v;}};
 const renderer={skeletonData:{},findBone:()=>bone,updateWorldTransform(){}};
 Pose.applyAim(renderer,{x:0,y:1},1,{fresh:true});near(rotation,90);disposed=true;renderer.skeletonData={};assert.doesNotThrow(()=>Pose.removeAim(renderer));
});

test('native-style fresh TrackEntry wrappers retain skill-owned retiming and aim until a new attack begins',()=>{
 const exports={},json={_heroMaker:{},animations:{attack:{events:[{time:.1667,name:'attack'}],bones:{body:{rotate:[{time:.8333,angle:0}]}}}}};
 const player={KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getHeroWeapon:()=>Weapons.find('skirmisher')})})}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroMakerRider.js'),'utf8'),{exports,cc:{v2:(x,y)=>({x,y})},require:name=>name==='HeroSkillAnimation'?require('../../assets/_script/HeroSkillAnimation'):name==='HeroSkillPose'?Pose:name==='HeroWeapons'?Weapons:player});
 let wrappers=0;function renderer(mount){const hand={rotation:0};let entry={animation:{name:'attack'},time:.05,speed:1,loop:false};
  function wrap(){wrappers++;return{getAnimation:()=>entry.animation,getTrackTime:()=>entry.time,setTrackTime:v=>entry.time=v,getTimeScale:()=>entry.speed,setTimeScale:v=>entry.speed=v,getAnimationEnd:()=>.8333,get loop(){return entry.loop;}};}
  return{node:{x:0,y:0,scaleX:1,scaleY:1},skeletonData:{skeletonJson:mount?{_heroMakerMount:{}}:json},getCurrent:()=>wrap(),setAnimation(_track,name,loop){entry={animation:{name},time:0,speed:1,loop};return wrap();},addAnimation(){},setMix(){},findBone:name=>name==='Rider/HandRight'?hand:null,update(){},updateWorldTransform(){},entry:()=>entry,hand};
 }
 const c={isMove:false};for(const key of ['spAniBody','spAniDrap','spAniHead','spAniBow','spAniArrow','spAniHand'])c[key]=renderer(false);c.spAniMa=renderer(true);
 exports.prepareAttack(c,'attack');assert(exports.retimeAttack(c,.35));
 for(let i=0;i<10;i++){c.spAniBody.entry().speed=2;exports.update(c);near(c.spAniBody.entry().speed,.1667/.35);assert(exports.ownsAttackClock(c,c.spAniBody));}
 exports.setCombatState(c,{moving:false,aimDirection:{x:0,y:1}});near(c.spAniBow.hand.rotation,90);
 for(let i=0;i<10;i++){exports.setCombatState(c,{moving:false});near(c.spAniBow.hand.rotation,90);}
 assert(wrappers>100,'fixture returns a distinct native wrapper for every access');
 exports.prepareAttack(c,'attack');c.spAniBody.setAnimation(0,'attack',false);exports.update(c);assert.equal(exports.ownsAttackClock(c,c.spAniBody),false);near(c.spAniBow.hand.rotation,0);
});

test('JSON marker sampling supports native attachment getters without modifying live bone pose or callbacks',()=>{
 const json={bones:[{name:'root',x:10,y:20},{name:'Rider/HandRight',parent:'root'},{name:'Rider/HandRight/Bow/Arrow',parent:'Rider/HandRight',x:5}],animations:{attack:{bones:{'Rider/HandRight/Bow/Arrow':{translate:[{time:0,x:0},{time:.2,x:10}]}}}}};
 let reads=0;const target={findSlot(){reads++;return{getAttachment:()=>({getWidth:()=>20,getHeight:()=>4,getX:()=>0,getY:()=>0,getRotation:()=>0,getScaleX:()=>1,getScaleY:()=>1})};},findBone(){throw Error('Marker sampler must not inspect live native bones');}};
 const p=Pose.arrowTipAt(target,json,'attack',.1,{x:1,y:0},1);near(p.x,30);near(p.y,20);
 const north=Pose.arrowTipAt(target,json,'attack',.1,{x:0,y:1},1);near(north.x,10);near(north.y,40);assert.equal(reads,2);
});

test('missing source clips and JSON safely fall back to the current live arrow pose',()=>{
 const target={findBone:()=>({worldX:17,worldY:23}),findSlot:()=>null};
 for(const json of [undefined,{}, {bones:[],animations:{}}]){
  const point=Pose.arrowTipAt(target,json,'missing',.2,{x:0,y:1},1);near(point.x,17);near(point.y,23);near(Pose.arrowAimAngle(target,json,'missing',.2),0);
 }
});

test('world commits use the actual native renderer and the browser skeleton behind cache-only wrappers',()=>{
 let native=0,browser=0,publicCalls=0;
 Pose.commitWorld({_nativeSkeleton:{updateWorldTransform(){native++;}},_skeleton:{updateWorldTransform(){throw Error('Native wrapper must use its renderer');}},updateWorldTransform(){publicCalls++;}});
 Pose.commitWorld({_skeleton:{updateWorldTransform(){browser++;}},updateWorldTransform(){publicCalls++;}});
 assert.equal(native,1);assert.equal(browser,1);assert.equal(publicCalls,0);
});
