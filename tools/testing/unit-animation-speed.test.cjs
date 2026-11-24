'use strict';
// Real runtime helpers, with resource/Spine doubles only. No game or audio runs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Core=require('../../assets/_script/CharacterPartsCore'),Levels=require('../../assets/_script/UnitLevelStats');
const source=name=>fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8');
function appearance(resolve = () => undefined){
 const jobs=[],cc={Component:function(){},JsonAsset:function(){},Class(definition){function Component(){}Component.prototype=definition;return Component;},resources:{load(name,_type,done){jobs.push({name,done});}}},context={exports:{},cc,require:name=>({CharacterPartsCore:Core,UnitLevelStats:Levels})[name] || resolve(name)};
 vm.runInNewContext(source('CharacterAppearance'),context);return{api:context.exports,cc,jobs};
}
function fixture(catalog={},settings={}){
 const a=appearance();a.api.preload();a.jobs.shift().done(null,{json:catalog});
 const owned=new WeakSet(),fightingTypes=require('../../assets/_script/FightingTypeDamage'),context={exports:{},cc:{resources:{},isValid:(value,strict)=>!!value&&!value.destroyed&&(!strict||!value.pendingDestroy)},require(name){if(name==='HeroMakerRider')return{ownsAttackClock:(_controller,renderer)=>owned.has(renderer)};if(name==='CharacterAppearance')return a.api;if(name==='./FightingTypeDamage')return fightingTypes;assert.equal(name,'KinghtFallDataMgr');return{KinghtFallDataMgr:{getInstance:()=>({data:{GameTools:settings}})}};}};
 vm.runInNewContext(source('GameToolsOverrides'),context);return{api:context.exports,appearance:a.api,catalog,settings,owned,cc:context.cc};
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

test('whole-unit playback preserves held and retimed rider clocks until their skill ownership ends',()=>{
 const f=fixture({unitAnimationSpeeds:{'hero:hero:default':.8}}),unit=actor(),body={track:{animation:{name:'attack'},timeScale:0},getCurrent(){return this.track;}},horse={track:{animation:{name:'move'},timeScale:1},getCurrent(){return this.track;}};
 unit.ctrPlayAni={spAniBody:body,spAniMa:horse};f.owned.add(body);f.api.applyAnimationPlayback(unit,'hero');assert.equal(body.track.timeScale,0);assert.equal(horse.track.timeScale,.8);
 body.track.timeScale=.476;f.api.applyAttackPlayback(unit,'hero');assert.equal(body.track.timeScale,.476);
 f.owned.delete(body);f.api.applyAnimationPlayback(unit,'hero');assert.equal(body.track.timeScale,.8);
});
test('0% freezes delayed and eventless hits, resumes from source time, and pooling cancels frozen work',()=>{
 const catalog={unitAnimationSpeeds:{'enemy:94001:default':0,'enemy:94002:default':0}},f=fixture(catalog,{timingDefaults:{'enemy:94001:default':{attack:.52}}}),unit=actor();let hits=0;
 f.api.attack(unit,'enemy',()=>hits++);assert.equal(unit.tracks[0].timeScale,0);f.api.tick(1000,true);assert.equal(hits,0);assert(f.api.isPending(unit));catalog.unitAnimationSpeeds['enemy:94001:default']=1;f.api.tick(.52/.25-.00001,true);assert.equal(hits,0);f.api.tick(.00001,true);assert.equal(hits,1);
 const eventless=actor(94002,'monster3');f.api.attack(eventless,'enemy',()=>hits++);f.api.tick(100,true);assert.equal(hits,1);catalog.unitAnimationSpeeds['enemy:94002:default']=.5;f.api.tick(.001,true);assert.equal(hits,2);
 catalog.unitAnimationSpeeds['enemy:94001:default']=0;f.api.attack(unit,'enemy',()=>hits++);unit.node.active=false;f.api.tick(1,true);assert(!f.api.isPending(unit));assert.equal(unit.time.Attack,0);assert.equal(hits,2);
});
test('in-flight Barracks playback changes retain elapsed source time when whole-unit control appears or disappears',()=>{
 const catalog={unitAnimationSpeeds:{'ally:94001:level:2':2}},settings={timingDefaults:{'ally:94001:default':{attack:.2}}},f=fixture(catalog,settings),unit=actor(94001,'monster3');unit.outBuild={buildInfo:{cfg:{level:1}}};let hits=0;
 f.api.attack(unit,'ally',()=>hits++);f.api.tick(.05,true);unit.outBuild.buildInfo.cfg.level=2;f.api.tick(.075,true);assert.equal(hits,1,'the remaining .15 source seconds take .075 seconds at2x');assert.equal(unit.tracks[0].timeScale,2);
 unit.time.Attack=-1;f.api.attack(unit,'ally',()=>hits++);f.api.tick(.05,true);unit.outBuild.buildInfo.cfg.level=3;f.api.tick(.0999,true);assert.equal(hits,1);f.api.tick(.0001,true);assert.equal(hits,2,'removing2x retains the .1 source seconds already elapsed');assert.equal(unit.tracks[0].timeScale,1);
});
test('attack-only speed changes use the same cumulative source clock and refresh the visible track',()=>{
 const settings={timingDefaults:{'enemy:94001:default':{attack:.4}},animationSpeeds:{'enemy:94001:default':1}},f=fixture({},settings),unit=actor(94001,'monster3');let hits=0;
 f.api.attack(unit,'enemy',()=>hits++);f.api.tick(.1,true);settings.animationSpeeds['enemy:94001:default']=2;f.api.tick(.1499,true);assert.equal(hits,0);f.api.tick(.0001,true);assert.equal(hits,1);assert.equal(unit.tracks[0].timeScale,2);
});
test('scheduler counts a partial relic-freeze release before the later actor update and preserves independent pauses',()=>{
 for(const wasPaused of [false,true]){
  const f=fixture({}, {timingDefaults:{'enemy:94001:default':{attack:.07}}}),unit=actor(94001,'monster3');unit.node._combatGeneration=1;unit.spAni.paused=true;unit._relicControl={generation:1,freeze:.03,slow:0,duration:0};unit._relicPausedRenderers=[{renderer:unit.spAni,wasPaused}];let hits=0;
  f.api.attack(unit,'enemy',()=>hits++);f.api.tick(.1,true);assert.equal(hits,wasPaused?0:1);
 }
});

test('pending authored hits belong to their exact node and generation without changing replacement cooldowns',()=>{
 for(const change of [unit=>{unit.node={...unit.node};},unit=>{unit.node._combatGeneration++;}]){
  const f=fixture({}, {timingDefaults:{'enemy:94001:default':{attack:.2}}}),unit=actor(94001,'monster3');unit.node._combatGeneration=1;let hits=0;f.api.attack(unit,'enemy',()=>hits++);change(unit);f.api.tick(.5,true);
  assert.equal(hits,0);assert.equal(f.api.isPending(unit),false);assert.equal(unit.time.Attack,-1,'An old entry must not release a replacement life cooldown');
 }
 const f=fixture({}, {timingDefaults:{'enemy:94001:default':{attack:.2}}}),unit=actor(94001,'monster3');f.api.attack(unit,'enemy',()=>{});unit.time={Attack:-1};f.api.cancel(unit);assert.equal(unit.time.Attack,-1);
});

test('a legitimate delayed callback cannot release a new node lifetime cooldown after it returns',()=>{
 const f=fixture({}, {timingDefaults:{'enemy:94001:default':{attack:.2}}}),unit=actor(94001,'monster3');unit.node._combatGeneration=1;let hits=0;
 f.api.attack(unit,'enemy',()=>{hits++;unit.node={...unit.node};});f.api.tick(.2,true);assert.equal(hits,1);assert.equal(unit.time.Attack,-1);assert.equal(f.api.isPending(unit),false);
});

test('scheduler snapshots keep callback replacement attacks for the next tick in release order',()=>{
 const f=fixture({}, {timingDefaults:{'enemy:94001:default':{attack:.2}}}),first=actor(94001,'monster3'),second=actor(94001,'monster3'),third=actor(94001,'monster3'),hits=[];
 f.api.attack(first,'enemy',()=>{hits.push('first');f.api.attack(second,'enemy',()=>hits.push('replacement'));});
 f.api.attack(second,'enemy',()=>hits.push('obsolete'));f.api.attack(third,'enemy',()=>hits.push('third'));
 f.api.tick(.2,true);assert.deepEqual(hits,['first','third']);assert(f.api.isPending(second));f.api.tick(.2,true);assert.deepEqual(hits,['first','third','replacement']);assert.equal(f.api.isPending(second),false);
 first.time.Attack=-1;second.time.Attack=-1;f.api.attack(first,'enemy',()=>{hits.push('clear');f.api.clear();});f.api.attack(second,'enemy',()=>hits.push('cleared'));
 f.api.tick(.2,true);assert.equal(hits.at(-1),'clear');assert.equal(f.api.isPending(second),false);assert.equal(second.time.Attack,0);
});

test('retired native renderer windups cancel before any disposed component access',()=>{
 for(const replace of ['destroy','destroy-and-replace','replace']){
  const f=fixture({}, {timingDefaults:{'enemy:94001:default':{attack:.2}}}),unit=actor(94001,'monster3'),renderer=unit.spAni,track=unit.tracks[0];f.cc.sys={isNative:true};let hits=0;
  renderer.getCurrent=()=>{if(renderer.destroyed)throw Error('Disposed native getCurrent');return track;};Object.defineProperty(renderer,'paused',{get(){if(renderer.destroyed)throw Error('Disposed native paused');return false;}});
  f.api.attack(unit,'enemy',()=>hits++);renderer.destroyed=replace!=='replace';if(replace!=='destroy')unit.spAni={getCurrent:()=>({animation:{name:'attack'},trackTime:0,timeScale:1})};
  assert.doesNotThrow(()=>f.api.tick(.5,true));assert.equal(hits,0);assert.equal(f.api.isPending(unit),false);assert.equal(unit.time.Attack,0);
 }
});

test('pending-destroy owners, pooled owners and missing configs cancel without issuing delayed hits',()=>{
 for(const change of [unit=>{unit.pendingDestroy=true;},unit=>{unit.node.pendingDestroy=true;},unit=>{unit._isPooled=true;},unit=>{unit.cfg=undefined;}]){
  const f=fixture({}, {timingDefaults:{'enemy:94001:default':{attack:.2}}}),unit=actor(94001,'monster3');let hits=0;f.api.attack(unit,'enemy',()=>hits++);change(unit);
  assert.doesNotThrow(()=>f.api.tick(.5,true));assert.equal(hits,0);assert.equal(f.api.isPending(unit),false);
 }
});

test('playback updates ignore disposed native renderer layers without reading their tracks or metadata',()=>{
 const f=fixture({unitAnimationSpeeds:{'enemy:94001:default':.5}}),unit=actor(),renderer=unit.spAni;unit.cfg.MonsterPack='fantasy-bosses';renderer.destroyed=true;
 renderer.getCurrent=()=>{throw Error('Disposed native track');};Object.defineProperty(renderer,'skeletonData',{get(){throw Error('Disposed native metadata');}});
 assert.doesNotThrow(()=>f.api.applyAttackPlayback(unit,'enemy'));assert.doesNotThrow(()=>f.api.applyAnimationPlayback(unit,'enemy'));assert.equal(f.api.attackPlayback(unit,'enemy'),.125);
});
test('catalog preload coalesces callers, exposes speeds before completion callbacks and completes failures for startup retry',()=>{
 const f=appearance(),order=[];f.api.preload(()=>order.push(f.api.animationSpeed(actor(),'enemy')));f.api.preload(()=>order.push('second'));assert.equal(f.jobs.length,1);assert.equal(f.jobs[0].name,'characters/catalog');f.jobs.shift().done(null,{json:{unitAnimationSpeeds:{'enemy:94001:default':.6}}});assert.deepEqual(order,[.6,'second']);f.api.preload(()=>order.push('cached'));assert.equal(f.jobs.length,0);assert.equal(order.at(-1),'cached');
 const failure=appearance();let completed=false;failure.api.preload(()=>{completed=true;});failure.jobs.shift().done(Error('temporary'));assert(completed);failure.api.preload();assert.equal(failure.jobs.length,1);failure.jobs.shift().done(null,{json:{unitAnimationSpeeds:{'enemy:94001:default':0}}});assert.equal(failure.api.animationSpeed(actor(),'enemy'),0);
});
test('game loading readiness and EndLoading wait for character speeds and VFX GPU readiness',()=>{
 const match=source('KinghtFallModle').match(/_ctor\.prototype\.preload = (function \(t\) \{[\s\S]*?\n  \});/),events=[];let complete,vfxComplete,ready=0;
 const singleton=value=>({getInstance:()=>value}),context={cc:{director:{getPhysicsManager:()=>({}),getCollisionManager:()=>({})},v2:()=>({})},$z1UIMgr:{UIMgr:singleton({addUICnf(){}})},$z1AudioMgr:{AudioMgr:singleton({addAdConf(){},setButtonNomalAudio(){}})},$z1KinghtFallConfig:{KinghtFallAudioCF:{},KinghtFallAudioId:{},KinghtFallBundelName:{}},$z1KinghtFallDataMgr:{KinghtFallDataMgr:singleton({preload:done=>done()})},$z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:singleton({preload:done=>done()})},$z1Appcfg:{BaseEventName:{Loading:'loading'},LoadingProcess:{EndLoading:'end'}},$z1EventMgr:{EventMgr:singleton({emit:(_name,value)=>events.push(value)})},$z1ResourceMgr:{ResourceMgr:singleton({loadBundle:(_name,done)=>done()})},require:name=>{if(name==='StartupProgress')return require('../../assets/_script/StartupProgress');if(name==='BuildingAssetWarmup')return{preload:done=>done()};if(name==='HeroSkillAssetWarmup')return{preload:done=>{vfxComplete=done;}};assert.equal(name,'CharacterAppearance');return{preload:done=>{complete=done;}};}};
 const preload=vm.runInNewContext('('+match[1]+')',context),model={isLoad:false};preload.call(model,()=>ready++);assert.equal(ready,0);assert.equal(model.isLoad,false);assert(!events.includes('end'));complete();assert.equal(ready,0);assert.equal(model.isLoad,false);assert(!events.includes('end'));assert.equal(typeof vfxComplete,'function');vfxComplete(null);assert.equal(ready,1);assert.equal(model.isLoad,true);assert(events.includes('end'));
});
test('ambient playback updates an existing track without restarting it, including a 0% freeze',()=>{
 const Fx=require('../../assets/_script/FantasyEffects'),tracks={0:{animation:{name:'attack'}}};let starts=0;const unit=actor();unit.spAni={skeletonData:{skeletonJson:{_fantasy:{pack:'fantasy-bosses',effects:{ambientAnimation:'ambient',ambientSlots:[]}}}},getCurrent:i=>tracks[i],setAnimation(i,name){starts++;return tracks[i]={animation:{name},setTimeScale(value){this.timeScale=value;}};},clearTrack(i){delete tracks[i];}};
 Fx.ambient(unit,.125);assert.equal(tracks[2].timeScale,.125);Fx.ambient(unit,0);assert.equal(tracks[2].timeScale,0);Fx.ambient(unit,.5);assert.equal(tracks[2].timeScale,.5);assert.equal(starts,1);assert.equal(tracks[0].animation.name,'attack');Fx.reset(unit);
});
test('each pending animation update samples live character speed once and subsequent public calls observe edits immediately',()=>{
 const catalog={unitAnimationSpeeds:{'enemy:94001:default':2}},f=fixture(catalog,{timingDefaults:{'enemy:94001:default':{attack:10}}}),unit=actor();
 const original=f.appearance.animationSpeed;let reads=0;f.appearance.animationSpeed=(...args)=>{reads++;return original(...args);};
 f.api.attack(unit,'enemy',()=>assert.fail('windup is not due'));assert.equal(reads,1);assert.equal(unit.tracks[0].timeScale,.5);
 reads=0;f.api.tick(.1,true);assert.equal(reads,1);assert.equal(unit.tracks[0].timeScale,.5);
 catalog.unitAnimationSpeeds['enemy:94001:default']=0;reads=0;assert.equal(f.api.attackPlayback(unit,'enemy'),0);assert.equal(reads,1);
 catalog.unitAnimationSpeeds['enemy:94001:default']=1;reads=0;assert.equal(f.api.animationPlayback(unit,'enemy'),.25);assert.equal(reads,1);
 reads=0;f.api.tick(.1,true);assert.equal(reads,1);assert.equal(unit.tracks[0].timeScale,.25);
 f.api.clear();delete catalog.unitAnimationSpeeds['enemy:94001:default'];unit.tracks[0].animation.name='idle';reads=0;f.api.applyAnimationPlayback(unit,'enemy');assert.equal(reads,1,'idle updates do not add attack-speed metadata probes');
});

test('combat resolves dependencies lazily and retains live exported functions and replacement managers',()=>{
 const counts={data:0,appearance:0}, unit=actor(94001,'monster3');
 const config=speed=>({data:{GameTools:{animationSpeeds:{'enemy:94001:default':speed}}}});
 const data={KinghtFallDataMgr:{getInstance:()=>config(1.2)}}, appearances={animationSpeed:()=>.4};
 const context={exports:{},cc:{isValid:value=>!!value},require(name){
   if(name==='./FightingTypeDamage')return require('../../assets/_script/FightingTypeDamage');
   if(name==='CharacterAppearance'){counts.appearance++;return appearances;}
   assert.equal(name,'KinghtFallDataMgr');
   return ++counts.data===1?{}:data;
 }};
 vm.runInNewContext(source('GameToolsOverrides'),context);
 const api=context.exports;
 assert.deepEqual(counts,{data:0,appearance:0},'loading the module must leave cyclic dependencies lazy');
 assert.throws(()=>api.attackPlayback(unit,'enemy'),/getInstance/);
 assert.equal(api.attackPlayback(unit,'enemy'),1.2);
 data.KinghtFallDataMgr={getInstance:()=>config(1.5)};
 assert.equal(api.attackPlayback(unit,'enemy'),1.5);
 context.cc.resources={};
 assert.equal(api.attackPlayback(unit,'enemy'),.4);
 appearances.animationSpeed=()=>.7;
 assert.equal(api.attackPlayback(unit,'enemy'),.7);
 assert.deepEqual(counts,{data:2,appearance:1},'a partial dependency must be retried and completed modules reused');
});

test('inherited character looks reuse their module while observing live profile tables',()=>{
 let loads=0;
 const manager=parent=>({data:{GameTools:{unitProfiles:{entries:{91001:{baseId:parent}}}}}});
 const data={KinghtFallDataMgr:{getInstance:()=>manager(91002)}};
 const f=appearance(name=>{
   if(name==='EnemyStageProfiles')return require('../../assets/_script/EnemyStageProfiles');
   assert.equal(name,'KinghtFallDataMgr');loads++;return data;
 });
 f.api.preload();
 f.jobs.shift().done(null,{json:{unitAnimationSpeeds:{'enemy:91002:default':.35,'enemy:91003:default':.65}}});
 const unit=actor(100001,'monster3');unit.cfg.ProfileBaseID=91001;
 assert.equal(loads,0);
 assert.equal(f.api.animationSpeed(unit,'enemy'),.35);
 data.KinghtFallDataMgr={getInstance:()=>manager(91003)};
 assert.equal(f.api.animationSpeed(unit,'enemy'),.65);
 assert.equal(loads,1);
});
