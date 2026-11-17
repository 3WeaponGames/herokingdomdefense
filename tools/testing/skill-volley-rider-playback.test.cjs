'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Settings=require('../../assets/_script/HeroSkillSettings'),Timeline=require('../../assets/_script/HeroSkillTimeline');
const {Model}=require('../../packages/hkd-skills/preview-model');
const close=(a,b,epsilon=1e-7)=>assert(Math.abs(a-b)<epsilon,`${a} != ${b}`);

function controllerFixture(native){
  const pose={removeAim(){},applyAim(){},commitWorld(){},arrowAimAngle:()=>0},Weapons=require('../../assets/_script/HeroWeapons'),rider={},shared={HeroWeapons:Weapons,HeroSkillPose:pose,HeroSkillAnimation:require('../../assets/_script/HeroSkillAnimation'),KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getHeroWeapon:()=>Weapons.find('skirmisher')})})}}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/HeroMakerRider.js'),'utf8'),{exports:rider,require:name=>shared[name]||{}});
  const result={},enums={Idle:'idle',Move:'move'};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/KinghtFallPlayGameAniCtrl.js'),'utf8'),{exports:result,require:name=>name==='HeroMakerRider'?rider:name==='KinghtFallModle'?{KinghtFallPlayAniEnum:enums}:{},cc:{Component:function(){},Node:function(){},_decorator:{ccclass:Type=>Type,property:()=>()=>{}}},sp:{Skeleton:function(){}},__extends(C,P){Object.setPrototypeOf(C,P);C.prototype=Object.create(P.prototype);C.prototype.constructor=C;},__decorate:(_decorators,Type,key)=>key===undefined?Type:undefined});
  const actor=new result.default(),renderers=[],json={_heroMaker:{role:0},animations:{attack:{events:[{name:'attack',time:.1667}],bones:{root:{rotate:[{time:.8333}]}}},idle:{bones:{root:{rotate:[{time:1}]}}},move:{bones:{root:{rotate:[{time:1}]}}}}};
  for(const key of ['spAniMa','spAniBody','spAniDrap','spAniHead','spAniArrow','spAniBow','spAniHand']){
    const renderer={node:{x:0,y:0,scaleX:1,scaleY:1,parent:null},skeletonData:{skeletonJson:key==='spAniMa'?{...json,_heroMakerMount:{}}:json},mixes:[],sets:[],queue:[],track:null,setMix(from,to,duration){this.mixes.push({from,to,duration});},setAnimation(_index,name,loop){const prior=this.track,track={animation:{name,duration:name==='attack'?.8333:1},animationEnd:name==='attack'?.8333:1,loop,trackTime:0,timeScale:1,mixingFrom:prior};if(native)for(const prop of ['animation','loop','trackTime','timeScale','animationEnd']){const cap=prop[0].toUpperCase()+prop.slice(1);track['get'+cap]=()=>track[prop];track['set'+cap]=value=>{track[prop]=value;};}this.queue=[];this.track=track;this.sets.push(track);return track;},addAnimation(_index,name,loop,delay){const item={name,loop,delay};this.queue.push(item);return item;},getCurrent(){return this.track;},setEventListener(fn){this.event=fn;},setCompleteListener(fn){this.complete=fn;},setTrackCompleteListener(track,fn){track.complete=fn;},update(){},step(dt){const track=this.track;if(!track)return;const before=track.trackTime;track.trackTime+=dt*track.timeScale;if(!track.loop&&track.animation.name==='attack'){if(before<.1667&&track.trackTime>=.1667&&this.event)this.event(track,{data:{name:'attack'}});if(before<.8333&&track.trackTime>=.8333){if(this.complete)this.complete(track);if(track.complete)track.complete(track);}}if(!track.loop&&track.trackTime>=track.animationEnd&&this.queue.length){const item=this.queue.shift();this.setAnimation(0,item.name,item.loop);}}};
    actor[key]=renderer;renderer.setAnimation(0,'idle',true);renderers.push(renderer);
  }
  actor.spAniSmoke={setAnimation(){},addAnimation(){}};actor.isMove=false;actor.isDie=false;rider.enableCombatMotion(actor);
  return{actor,rider,renderers,step(dt){for(const renderer of renderers)renderer.step(dt);rider.update(actor);}};
}

test('Skirmisher has one release and retains no presentation-only repeat entry points',()=>{
 const settings=Settings.defaults('skirmisher');assert.deepEqual(Timeline.skirmisherSchedule(settings),[.2]);assert.equal(Timeline.riderVolleys,undefined);const f=controllerFixture(false);for(const key of ['playSkillPulse','isPresentationPulse','isPresentationPulseEntry'])assert.equal(f.rider[key],undefined);
});

test('the retimed rider preserves the ordinary attack event and completion lifecycle while the horse remains idle on JS and native getters',()=>{
 for(const native of [false,true]){const f=controllerFixture(native),{actor,rider}=f;let attacks=0,completions=0;actor.setAttackEvent(()=>attacks++);actor.setAttackEnd(()=>completions++);actor.setAttack();assert(rider.retimeAttack(actor,.6));for(const renderer of f.renderers)close(renderer.track.timeScale,renderer===actor.spAniMa?1:.1667/.6);assert.equal(actor.spAniMa.track.animation.name,'idle');f.step(.3);assert.equal(attacks,0);f.step(.3001);assert.equal(attacks,1);rider.releaseChargedAttack(actor,1);f.step(3);assert.equal(attacks,1);assert.equal(completions,1);actor.setAttack();f.step(1);assert.equal(attacks,2);assert.equal(completions,2);}
});

test('a moving horse keeps its locomotion source clock during retimed rider attacks and cleanup permits the next ordinary attack',()=>{
 for(const native of [false,true]){const f=controllerFixture(native),{actor,rider}=f;actor.setMove();actor.spAniMa.track.timeScale=.8;actor.spAniMa.track.trackTime=.4;actor.setAttack();assert(rider.retimeAttack(actor,.6));assert.equal(actor.spAniMa.track.animation.name,'move');close(actor.spAniMa.track.timeScale,.8);close(actor.spAniMa.track.trackTime,.4);for(const key of ['spAniBody','spAniDrap','spAniHead','spAniArrow','spAniBow','spAniHand'])close(actor[key].track.timeScale,.1667/.6);f.step(.2);close(actor.spAniMa.track.trackTime,.56);rider.clearCombatState(actor);actor.setAttack();assert(rider.setAttackPlayback(actor,1.4));close(actor.spAniBody.track.timeScale,1.4);close(actor.spAniMa.track.timeScale,.8);}
});

test('the preview owns only the single cast recovery and resumes ordinary attacks without any hidden late repeats',()=>{
 const settings=Settings.defaults('skirmisher'),model=new Model('skirmisher',settings,{mode:'active',targets:1,targetDistance:100,attackRate:20,attackSourceHit:.1667,attackSourceDuration:.8333,attackPlayback:1,impactDelay:.1667});model.advance(.5);assert(model.state.active);assert.equal(model.events.filter(e=>e.kind==='release'&&e.skill).length,1);assert.equal(model.events.filter(e=>e.kind==='release'&&!e.skill).length,0);model.advance(2);assert.equal(model.state.active,null);assert(model.events.some(e=>e.kind==='release'&&!e.skill));assert.equal(model.riderVolleyPose,undefined);assert.equal(model.events.filter(e=>e.kind==='release'&&e.skill).length,1);
});
