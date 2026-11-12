'use strict';
// Shipped cooldown and release callbacks run against inert scene/audio doubles.
const assert=require('node:assert/strict'),{test}=require('node:test');
const Config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),Loadout=require('../../assets/_script/HeroLoadout'),Cadence=require('../../assets/_script/CombatCadence');
const {setup,hero,Node}=require('./backend-gameplay-harness.cjs');
const user={personLevel:[1,1,1,1,1,1]},close=(a,b,epsilon=1e-10)=>assert(Math.abs(a-b)<epsilon,`${a} != ${b}`);
function config(settings){return {...Config,GameTools:settings};}
function simulate(settings,relative,nominal=1,seconds=12){
 const h=setup({CharacterAppearance:{animationSpeed:()=>relative},BattleSounds:{attack(){}}}),p=hero(h),releases=[];
 h.e.cc.resources={};h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data={GameTools:settings};
 p.time.Attack=0;p._regenerationDisabled=true;p.getAttSpeed=()=>nominal;p.getAttack=()=>20;p.debuffInfo=[];
 h.d.enemyList=[{node:new Node('target',null,20,0),hp:1000,isDead:()=>false}];h.g.onPlayAttack=()=>releases.push(now);
 const overrides=h.load('GameToolsOverrides'),dt=.001;let now=0;
 for(let i=0;i<Math.round(seconds/dt);i++){now=i*dt;overrides.tick(dt,true);p.onUpdata(dt);}
 return {releases,p,h};
}

test('hero CP follows the actual release clock at normal, slow, fast and frozen playback',()=>{
 const settings={timingDefaults:{'hero:hero:default':{attack:.4}}};
 for(const speed of [.5,1,2]){
  const value=Loadout.calculate(config(settings),user,undefined,{unitAnimationSpeed:speed,duration:100}),run=simulate(settings,speed),hits=run.releases;
  assert(hits.length>3);const period=(hits.at(-1)-hits[0])/(hits.length-1);
  close(period,1+.4/speed,.002);close(value.effectiveAttackRate,1/period,.002);close(value.directDps,20/(1+.4/speed));
  assert.equal(value.attackRate,1,'the equipment cooldown stat remains unchanged');
 }
 const paused=Loadout.calculate(config(settings),user,undefined,{unitAnimationSpeed:0}),run=simulate(settings,0);
 assert.equal(run.releases.length,0);assert.equal(run.p.time.Attack,-1);assert.equal(paused.effectiveAttackRate,0);assert.equal(paused.directDps,0);assert.equal(paused.cp,0);assert.equal(paused.reason,null);
});

test('custom timings and whole-unit speed take runtime precedence while absent timings stay synchronous',()=>{
 const key='hero:hero:default',settings={timingDefaults:{[key]:{attack:.6}},timings:{[key]:{attack:.2}},animationSpeeds:{[key]:2}},before=JSON.stringify(settings);
 const ordinary=Loadout.calculate(config(settings),user),custom=Loadout.calculate(config(settings),user,undefined,{unitAnimationSpeed:.5});
 close(ordinary.effectiveAttackRate,1/1.1);close(custom.effectiveAttackRate,1/1.4);assert.equal(custom.attackTiming.hitTime,.2);assert.equal(custom.attackTiming.animationSpeed,.5);
 let run=simulate(settings,undefined);close((run.releases.at(-1)-run.releases[0])/(run.releases.length-1),1.1,.002);
 for(const marker of [0,-1,11,'0.2',null]){
  const immediate={...settings,timings:{[key]:{attack:marker}}},power=Loadout.calculate(config(immediate),user);
  assert.equal(power.effectiveAttackRate,1);assert.equal(power.attackTiming.hitTime,0);
 }
 const legacy=Loadout.calculate(config({}),user,undefined,{unitAnimationSpeed:.5,duration:10});assert.equal(legacy.effectiveAttackRate,1,'an authored clip or event cannot seed a new delay');
 assert.equal(simulate({},0).releases.length,0,'saved zero also freezes eventless attacks');assert.equal(JSON.stringify(settings),before);
});

test('account credits affect cooldown before timing while gameplay keeps its full matching style talents',()=>{
 const data={personLevel:[1,1,10,10,1,1],heroWeapon:{selected:'vanguard',levels:{skirmisher:{3:10,4:10},vanguard:{3:1,4:1}}},talentInfo:Config.TalentLevelCfg.filter(row=>row.HeroStyle==='vanguard').map(row=>({id:row.ID,isLock:true}))},before=JSON.stringify(data);
 const value=Loadout.calculate(Config,data,undefined,{unitAnimationSpeed:.5}),actual=Loadout.snapshot(Config,data, {unitAnimationSpeed:.5});close(value.attackRate,1.01);close(value.damage,20.2);close(value.effectiveAttackRate,1/(1/1.01+.1667/.5));close(actual.attackRate,1.05);close(actual.damage,21);
 const run=simulate(Config.GameTools,.5,1.05);close((run.releases.at(-1)-run.releases[0])/(run.releases.length-1),1/actual.effectiveAttackRate,.002);assert.equal(JSON.stringify(data),before);
});

test('shared resolution preserves each controller policy and zero playback without nonfinite CP inputs',()=>{
 const settings={timingDefaults:{'enemy:1:default':{attack:.5}}},base={type:'enemy',id:1,cooldownRate:10,duration:2,modelAnimationSpeed:1};
 close(Cadence.resolve(settings,{...base,cooldownStart:'hit'}).rate,.5);
 close(Cadence.resolve(settings,{...base,cooldownStart:'start'}).rate,.5);
 close(Cadence.resolve(settings,{...base,cooldownStart:'hit-unblocked'}).rate,1/.6);
 const frozen=Cadence.resolve(settings,{...base,unitAnimationSpeed:0});assert.equal(frozen.rate,0);assert.equal(frozen.cycle,null);assert.equal(frozen.reason,null);
 const ally={type:'ally',id:1,level:2,cooldownRate:1,duration:0,cooldownStart:'hit-unblocked'},scoped={animationSpeeds:{'ally:1:default':1,'ally:1:level:2':2},timingDefaults:{'ally:1:default':{attack:.5}}};
 close(Cadence.resolve(scoped,ally).rate,1/1.25);assert.equal(Cadence.resolve(scoped,{...ally,unitAnimationSpeed:.5}).animationSpeed,.5);
});

test('the emergency flask adds combat healing while the next-wave reset still restores full HP',()=>{
 const run=simulate({},undefined,1,0),p=run.p;p.hp=20;p.delAllBuff=()=>{};p.endRoundGame();assert.equal(p.hp,p.hpMax);
 for(const level of [1,2,3]){
  const data={...user,treasureInfo:[{id:120043,level}]},before=JSON.stringify(data),base=Loadout.calculate(Config,user),value=Loadout.calculate(Config,data);
  assert.equal(value.waveHealingHps,0);assert(value.emergencyHealingHps>0);assert(value.cp>base.cp);assert.equal(Loadout.calculate(Config,data,{heroIncomingDps:0}).emergencyHealingHps,0);assert.equal(JSON.stringify(data),before);
 }
});

test('kill healing requires primary damage releases while passive defense remains useful during a freeze',()=>{
 const data={...user,treasureInfo:[{id:120042,level:3},{id:120033,level:1},{id:120040,level:1}]},moving=Loadout.calculate(Config,data),paused=Loadout.calculate(Config,data,undefined,{unitAnimationSpeed:0});
 assert(moving.killHealingHps>0);assert.equal(paused.killHealingHps,0);assert.equal(paused.directDps,0);assert.equal(paused.splashDps,0);assert(paused.preventedDps>0);assert(paused.reflectionDps>0);assert(paused.cp>0);
 const harmless=structuredClone(Config);harmless.EquipCfg.find(row=>row.id===3).levelInfo[0].Parameters=0;assert.equal(Loadout.calculate(harmless,data).killHealingHps,0);
});
