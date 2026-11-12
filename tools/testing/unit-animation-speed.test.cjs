'use strict';
// Real runtime helpers, with resource/Spine doubles only. No game or audio runs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Core=require('../../assets/_script/CharacterPartsCore'),Levels=require('../../assets/_script/UnitLevelStats');
const source=name=>fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8');
function appearance(){
 const jobs=[],cc={Component:function(){},JsonAsset:function(){},Class(definition){function Component(){}Component.prototype=definition;return Component;},resources:{load(name,_type,done){jobs.push({name,done});}}},context={exports:{},cc,require:name=>({CharacterPartsCore:Core,UnitLevelStats:Levels})[name]};
 vm.runInNewContext(source('CharacterAppearance'),context);return{api:context.exports,cc,jobs};
}
function fixture(catalog={},settings={}){
 const a=appearance();a.api.preload();a.jobs.shift().done(null,{json:catalog});
 const context={exports:{},cc:{resources:{},isValid:value=>!!value&&!value.destroyed},require(name){if(name==='CharacterAppearance')return a.api;assert.equal(name,'KinghtFallDataMgr');return{KinghtFallDataMgr:{getInstance:()=>({data:{GameTools:settings}})}};}};
 vm.runInNewContext(source('GameToolsOverrides'),context);return{api:context.exports,appearance:a.api,catalog,settings};
}
function actor(id=94001,pack='fantasy-bosses'){
 const tracks={0:{animation:{name:'attack',duration:4},timeScale:1,trackTime:0},1:{animation:{name:'hit',duration:.3},timeScale:.7}};
 return{cfg:{ID:id},node:{active:true,activeInHierarchy:true},time:{Attack:-1},isDead:()=>false,tracks,spAni:{skeletonData:{skeletonJson:{_fantasy:{pack}}},getCurrent:index=>tracks[index]}};
}
test('saved relative speeds resolve by canonical side/form and ally level without borrowing or seeding values',()=>{
 const catalog={assignments:{},profiles:{},unitAnimationSpeeds:{'enemy:94001:default':.5,'enemy:90010:1':1.3,'ally:94001:default':1.2,'ally:94001:level:2':.4,'hero:hero:default':.8}},before=JSON.stringify(catalog),f=fixture(catalog),unit=actor();
 assert.equal(f.appearance.animationSpeed(unit,'enemy'),.5);assert.equal(f.appearance.animationSpeed(unit,'ally'),1.2);unit.outBuild={buildInfo:{cfg:{level:2}}};assert.equal(f.appearance.animationSpeed(unit,'ally'),.4);unit.outBuild.buildInfo.cfg.level=3;assert.equal(f.appearance.animationSpeed(unit,'ally'),1.2);unit.cfg.ID=90010;unit.spIdx=0;assert.equal(f.appearance.animationSpeed(unit,'enemy'),1.3);unit.spIdx=1;assert.equal(f.appearance.animationSpeed(unit,'enemy'),undefined);assert.equal(f.appearance.animationSpeed({},'hero'),.8);assert.equal(JSON.stringify(catalog),before);
 for(const invalid of [null,'1',-1,2.1,Infinity,NaN]){catalog.unitAnimationSpeeds['ally:94001:level:2']=invalid;unit.cfg.ID=94001;unit.outBuild.buildInfo.cfg.level=2;assert.equal(f.appearance.animationSpeed(unit,'ally'),1.2);}
 catalog.unitAnimationSpeeds['ally:94001:level:2']=0;assert.equal(f.appearance.animationSpeed(unit,'ally'),0);
});
test('an explicit whole-unit speed controls every action and hit reaction; reset restores the existing attack-only override',()=>{
 const catalog={unitAnimationSpeeds:{'enemy:94001:default':.5}},settings={animationSpeeds:{'enemy:94001:default':1.2},timingDefaults:{'enemy:94001:default':{attack:.52}}},f=fixture(catalog,settings),unit=actor(),before=JSON.stringify(settings);
 for(const name of ['idle','move','attack','attack_alt','die']){unit.tracks[0].animation.name=name;f.api.applyAnimationPlayback(unit,'enemy');assert.equal(unit.tracks[0].timeScale,.125,name);assert.equal(unit.tracks[1].timeScale,.125,'hit reaction');}
 delete catalog.unitAnimationSpeeds['enemy:94001:default'];unit.tracks[0].animation.name='attack';f.api.applyAnimationPlayback(unit,'enemy');assert.equal(unit.tracks[0].timeScale,1.2);assert.equal(unit.tracks[1].timeScale,.7);unit.tracks[0].animation.name='move';f.api.applyAnimationPlayback(unit,'enemy');assert.equal(unit.tracks[0].timeScale,.25);assert.equal(JSON.stringify(settings),before);
});
test('hero rider, horse and native hit tracks share explicit playback and restore their authored rates when removed',()=>{
 const f=fixture({unitAnimationSpeeds:{'hero:hero:default':1}}),unit=actor(),renderers=Array.from({length:7},()=>{const track={animation:{name:'idle'},value:.7,getTimeScale(){return this.value;},setTimeScale(value){this.value=value;}};return{track,getCurrent:index=>index===0?track:null};});
 unit.ctrPlayAni=Object.fromEntries(['spAniBody','spAniDrap','spAniHead','spAniBow','spAniArrow','spAniHand','spAniMa'].map((key,i)=>[key,renderers[i]]));f.api.applyAnimationPlayback(unit,'hero');assert(renderers.every(renderer=>renderer.track.value===1),'explicit 100% is actual 1x rather than a previous authored rate');
 f.catalog.unitAnimationSpeeds['hero:hero:default']=.5;f.api.applyAnimationPlayback(unit,'hero');assert(renderers.every(renderer=>renderer.track.value===.5));delete f.catalog.unitAnimationSpeeds['hero:hero:default'];f.api.applyAnimationPlayback(unit,'hero');assert(renderers.every(renderer=>renderer.track.value===.7),'the horse also clears a retained custom rate');
});
test('native baked units without skeleton JSON use their record package for explicit saved playback',()=>{
 const f=fixture({unitAnimationSpeeds:{'enemy:94001:default':1}}),unit=actor();unit.spAni.skeletonData={uuid:'native-bake'};unit.cfg.MonsterPack='fantasy-monsters';assert.equal(f.api.animationPlayback(unit,'enemy'),.35);assert.equal(f.api.attackPlayback(unit,'enemy'),.35);f.api.applyAnimationPlayback(unit,'enemy');assert.equal(unit.tracks[0].timeScale,.35);unit.cfg.MonsterPack='fantasy-bosses';assert.equal(f.api.animationPlayback(unit,'enemy'),.25);
 delete f.catalog.unitAnimationSpeeds['enemy:94001:default'];assert.equal(f.api.attackPlayback(unit,'enemy'),1,'absent settings retain the existing runtime fallback');
});
test('0% freezes delayed and eventless hits, resumes from source time, and pooling cancels frozen work',()=>{
 const catalog={unitAnimationSpeeds:{'enemy:94001:default':0,'enemy:94002:default':0}},f=fixture(catalog,{timingDefaults:{'enemy:94001:default':{attack:.52}}}),unit=actor();let hits=0;
 f.api.attack(unit,'enemy',()=>hits++);assert.equal(unit.tracks[0].timeScale,0);f.api.tick(1000,true);assert.equal(hits,0);assert(f.api.isPending(unit));catalog.unitAnimationSpeeds['enemy:94001:default']=1;f.api.tick(.52/.25-.00001,true);assert.equal(hits,0);f.api.tick(.00001,true);assert.equal(hits,1);
 const eventless=actor(94002,'monster3');f.api.attack(eventless,'enemy',()=>hits++);f.api.tick(100,true);assert.equal(hits,1);catalog.unitAnimationSpeeds['enemy:94002:default']=.5;f.api.tick(.001,true);assert.equal(hits,2);
 catalog.unitAnimationSpeeds['enemy:94001:default']=0;f.api.attack(unit,'enemy',()=>hits++);unit.node.active=false;f.api.tick(1,true);assert(!f.api.isPending(unit));assert.equal(unit.time.Attack,0);assert.equal(hits,2);
});
test('catalog preload coalesces callers, exposes speeds before completion callbacks and completes failures for startup retry',()=>{
 const f=appearance(),order=[];f.api.preload(()=>order.push(f.api.animationSpeed(actor(),'enemy')));f.api.preload(()=>order.push('second'));assert.equal(f.jobs.length,1);assert.equal(f.jobs[0].name,'characters/catalog');f.jobs.shift().done(null,{json:{unitAnimationSpeeds:{'enemy:94001:default':.6}}});assert.deepEqual(order,[.6,'second']);f.api.preload(()=>order.push('cached'));assert.equal(f.jobs.length,0);assert.equal(order.at(-1),'cached');
 const failure=appearance();let completed=false;failure.api.preload(()=>{completed=true;});failure.jobs.shift().done(Error('temporary'));assert(completed);failure.api.preload();assert.equal(failure.jobs.length,1);failure.jobs.shift().done(null,{json:{unitAnimationSpeeds:{'enemy:94001:default':0}}});assert.equal(failure.api.animationSpeed(actor(),'enemy'),0);
});
test('game loading readiness and EndLoading wait for the character speed catalog',()=>{
 const match=source('KinghtFallModle').match(/_ctor\.prototype\.preload = (function \(t\) \{[\s\S]*?\n  \});/),events=[];let complete,ready=0;
 const singleton=value=>({getInstance:()=>value}),context={cc:{director:{getPhysicsManager:()=>({}),getCollisionManager:()=>({})},v2:()=>({})},$z1UIMgr:{UIMgr:singleton({addUICnf(){}})},$z1AudioMgr:{AudioMgr:singleton({addAdConf(){},setButtonNomalAudio(){}})},$z1KinghtFallConfig:{KinghtFallAudioCF:{},KinghtFallAudioId:{},KinghtFallBundelName:{}},$z1KinghtFallDataMgr:{KinghtFallDataMgr:singleton({preload:done=>done()})},$z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:singleton({preload:done=>done()})},$z1Appcfg:{BaseEventName:{Loading:'loading'},LoadingProcess:{EndLoading:'end'}},$z1EventMgr:{EventMgr:singleton({emit:(_name,value)=>events.push(value)})},$z1ResourceMgr:{ResourceMgr:singleton({loadBundle:(_name,done)=>done()})},require:name=>{assert.equal(name,'CharacterAppearance');return{preload:done=>{complete=done;}};}};
 const preload=vm.runInNewContext('('+match[1]+')',context),model={isLoad:false};preload.call(model,()=>ready++);assert.equal(ready,0);assert.equal(model.isLoad,false);assert(!events.includes('end'));complete();assert.equal(ready,1);assert.equal(model.isLoad,true);assert(events.includes('end'));
});
test('ambient playback updates an existing track without restarting it, including a 0% freeze',()=>{
 const Fx=require('../../assets/_script/FantasyEffects'),tracks={0:{animation:{name:'attack'}}};let starts=0;const unit=actor();unit.spAni={skeletonData:{skeletonJson:{_fantasy:{pack:'fantasy-bosses',effects:{ambientAnimation:'ambient',ambientSlots:[]}}}},getCurrent:i=>tracks[i],setAnimation(i,name){starts++;return tracks[i]={animation:{name},setTimeScale(value){this.timeScale=value;}};},clearTrack(i){delete tracks[i];}};
 Fx.ambient(unit,.125);assert.equal(tracks[2].timeScale,.125);Fx.ambient(unit,0);assert.equal(tracks[2].timeScale,0);Fx.ambient(unit,.5);assert.equal(tracks[2].timeScale,.5);assert.equal(starts,1);assert.equal(tracks[0].animation.name,'attack');Fx.reset(unit);
});
