'use strict';
// Exercise the runtime lookup and actual delayed-hit queue without a scene or audio.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const script=path.resolve(__dirname,'../../assets/_script/GameToolsOverrides.js');
function fixture(settings={}){
  const data={GameTools:settings},modules={
    KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({data})}},
    HeroWeapons:require('../../assets/_script/HeroWeapons'),
    HeroSkillPose:require('../../assets/_script/HeroSkillPose'),
    HeroSkillAnimation:require('../../assets/_script/HeroSkillAnimation')
  },context={exports:{},cc:{isValid:actor=>!!actor&&!actor.destroyed},require(name){
    if(modules[name])return modules[name];
    assert.equal(name,'HeroMakerRider');
    const rider={exports:{},cc:context.cc,require:context.require};
    vm.runInNewContext(fs.readFileSync(path.join(path.dirname(script),'HeroMakerRider.js'),'utf8'),rider,{filename:'HeroMakerRider.js'});
    return modules[name]=rider.exports;
  }};
  vm.runInNewContext(fs.readFileSync(script,'utf8'),context,{filename:script});
  return {api:context.exports,settings};
}
function ally(level=1,track={animation:{name:'attack',duration:1},timeScale:1,trackTime:0}){
  return {cfg:{ID:90004,AttackInterval:.2},outBuild:{index:900+level,buildInfo:{cfg:{level}}},node:{active:true,activeInHierarchy:true},time:{Attack:-1},spAni:{getCurrent:()=>track},isDead:()=>false,track};
}

test('each ally level independently controls its attack clip and actual hit delay while shared timings stay unchanged',()=>{
  const settings={timingDefaults:{'ally:90004:default':{attack:.5}},timings:{'ally:90004:default':{attack:.4}},animationSpeeds:{'ally:90004:default':.8,'ally:90004:level:1':1,'ally:90004:level:2':2,'ally:90004:level:3':.5},future:{retain:true}};
  const before=JSON.stringify(settings),f=fixture(settings),hits=[];
  for(const [level,speed]of [[1,1],[2,2],[3,.5]]){
    const actor=ally(level),release=.4/speed;
    f.api.attack(actor,'ally',function(){hits.push(this);this.time.Attack=0;});
    assert.equal(actor.track.timeScale,speed);
    f.api.tick(release-.00001,true);assert(!hits.includes(actor));
    f.api.tick(.00001,true);assert(hits.includes(actor));assert(!f.api.isPending(actor));
    assert.equal(actor.cfg.AttackInterval,.2,'Playback must not rewrite the existing cooldown rate');
  }
  assert.equal(hits.length,3);assert.equal(JSON.stringify(settings),before);
});

test('missing or malformed level speeds inherit shared unit values, with default and side/form isolation',()=>{
  const f=fixture({animationSpeeds:{'ally:90004:default':1.25,'ally:90004:level:2':2,'enemy:90004:default':.75,'enemy:90004:2':1.5,'hero:hero:default':.6}}),actor=ally(1);
  assert.equal(f.api.attackPlayback(actor,'ally'),1.25);
  actor.outBuild.buildInfo.cfg.level=2;assert.equal(f.api.attackPlayback(actor,'ally'),2);
  actor.outBuild.buildInfo.cfg.level=3;assert.equal(f.api.attackPlayback(actor,'ally'),1.25);
  for(const invalid of [null,'2',0,-1,NaN,Infinity,.09,4.01]){f.settings.animationSpeeds['ally:90004:level:3']=invalid;assert.equal(f.api.attackPlayback(actor,'ally'),1.25);}
  delete actor.outBuild;assert.equal(f.api.attackPlayback(actor,'ally'),1.25);
  actor.outBuild={getLevel:()=>2};assert.equal(f.api.attackPlayback(actor,'ally'),2,'The same authored-level fallback as stats remains supported');
  actor.outBuild={buildInfo:{cfg:{level:'2'}},getLevel:()=>2};assert.equal(f.api.attackPlayback(actor,'ally'),1.25,'An invalid authored level cannot borrow another tier');
  assert.equal(f.api.attackPlayback(actor,'enemy'),.75);actor.spIdx=1;assert.equal(f.api.attackPlayback(actor,'enemy'),1.5);
  assert.equal(f.api.attackPlayback(actor,'hero'),.6);
  delete f.settings.animationSpeeds;assert.equal(f.api.attackPlayback(actor,'ally'),1);
});

test('retained and pooled attack tracks restore normal speed when their next level has no speed override',()=>{
  const f=fixture({animationSpeeds:{'ally:90004:level:1':2,'ally:90004:level:3':.5}}),actor=ally(1);
  f.api.applyAttackPlayback(actor,'ally');assert.equal(actor.track.timeScale,2);
  actor.outBuild.buildInfo.cfg.level=2;f.api.applyAttackPlayback(actor,'ally');assert.equal(actor.track.timeScale,1);
  actor.outBuild.buildInfo.cfg.level=3;f.api.applyAttackPlayback(actor,'ally');assert.equal(actor.track.timeScale,.5);
  delete actor.outBuild;f.api.applyAttackPlayback(actor,'ally');assert.equal(actor.track.timeScale,1,'A pooled actor cannot retain the previous Barracks tier speed');
  const untouched=ally(2);untouched.track.timeScale=.7;f.api.applyAttackPlayback(untouched,'ally');assert.equal(untouched.track.timeScale,.7,'Unconfigured authored tracks retain their original behavior');
});

test('native track setters restore their original speed and unrelated animation layers remain unchanged',()=>{
  const f=fixture({animationSpeeds:{'ally:90004:level:1':2}}),actor=ally(1),tracks=[{name:'attack',value:1},{name:'attack_stab',value:1},{name:'idle',value:.75}];
  const renderers=tracks.map(track=>({getCurrent:()=>({getAnimation:()=>({getName:()=>track.name}),getTimeScale:()=>track.value,setTimeScale:value=>{track.value=value;}})}));
  // Native getCurrent returns the same TrackEntry wrapper throughout an attack.
  const entries=renderers.map(renderer=>renderer.getCurrent());renderers.forEach((renderer,i)=>{renderer.getCurrent=()=>entries[i];});
  actor.ctrPlayAni={spAniBody:renderers[0],spAniBow:renderers[1],spAniHead:renderers[2]};
  f.api.applyAttackPlayback(actor,'ally');assert.deepEqual(tracks.map(track=>track.value),[2,2,.75]);
  actor.outBuild.buildInfo.cfg.level=2;f.api.applyAttackPlayback(actor,'ally');assert.deepEqual(tracks.map(track=>track.value),[1,1,.75]);
});

test('unconfigured playback preserves immediate dispatch, frame order and approved timing defaults without seeding settings',()=>{
  const f=fixture(),actor=ally(),calls=[];
  f.api.attack(actor,'ally',function(){calls.push(this);});assert.deepEqual(calls,[actor]);assert.deepEqual(f.settings,{});
  f.settings.timingDefaults={'ally:90004:default':{attack:.5}};f.settings.animationSpeeds={'ally:90004:level:2':2};
  actor.outBuild.buildInfo.cfg.level=2;f.api.attack(actor,'ally',()=>calls.push('hit'));f.api.tick(.24999,true);assert.equal(calls.length,1);f.api.tick(.00001,true);assert.equal(calls.at(-1),'hit');
  assert.deepEqual(f.settings.timingDefaults,{'ally:90004:default':{attack:.5}});
});

test('Fantasy Boss defaults slow every primary action to 0.25 and keep attack release synchronized without changing saved timings',()=>{
 const settings={timingDefaults:{'enemy:94001:default':{attack:.52}}},before=JSON.stringify(settings),f=fixture(settings),actor=ally();delete actor.outBuild;actor.cfg.ID=94001;actor.spAni.skeletonData={skeletonJson:{_fantasy:{pack:'fantasy-bosses'}}};
 for(const name of ['idle','move','attack','attack_alt','die']){actor.track={animation:{name,duration:2},timeScale:1};actor.spAni.getCurrent=()=>actor.track;f.api.applyAnimationPlayback(actor,'enemy');assert.equal(actor.track.timeScale,.25,name);}
 actor.track={animation:{name:'attack',duration:2},timeScale:1};let released=false;f.api.attack(actor,'enemy',()=>{released=true;});assert.equal(actor.track.timeScale,.25);f.api.tick(.52/.25-.00001,true);assert(!released);f.api.tick(.00001,true);assert(released);assert.equal(JSON.stringify(settings),before);
 settings.animationSpeeds={'enemy:94001:default':1.2};f.api.applyAnimationPlayback(actor,'enemy');assert.equal(actor.track.timeScale,1.2,'Explicit per-unit attack edits retain precedence');
 actor.track.animation.name='move';f.api.applyAnimationPlayback(actor,'enemy');assert.equal(actor.track.timeScale,.25);actor.spAni.skeletonData.skeletonJson._fantasy.pack='fantasy-monsters';f.api.applyAnimationPlayback(actor,'enemy');assert.equal(actor.track.timeScale,.35,'A reused track picks up the Monsters default');actor.spAni.skeletonData.skeletonJson._fantasy.pack='monster3';f.api.applyAnimationPlayback(actor,'enemy');assert.equal(actor.track.timeScale,1,'A reused track cannot carry a Fantasy default to another pack');
});

test('Fantasy Monsters use 0.35 for every primary action and scale delayed hit release without rewriting timing data',()=>{
 const settings={timingDefaults:{'enemy:94002:default':{attack:.6}}},before=JSON.stringify(settings),f=fixture(settings),actor=ally();delete actor.outBuild;actor.cfg.ID=94002;actor.spAni.skeletonData={skeletonJson:{_fantasy:{pack:'fantasy-monsters'}}};actor.spAni.getCurrent=()=>actor.track;
 for(const name of ['idle','move','attack','attack_alt','run','die']){actor.track={animation:{name,duration:2},timeScale:1};f.api.applyAnimationPlayback(actor,'enemy');assert.equal(actor.track.timeScale,.35,name);}
 actor.track.animation.name='attack';let released=false;f.api.attack(actor,'enemy',()=>{released=true;});f.api.tick(.6/.35-.00001,true);assert(!released);f.api.tick(.00001,true);assert(released);assert.equal(JSON.stringify(settings),before);
});
