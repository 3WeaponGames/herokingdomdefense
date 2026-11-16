'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../../assets/_script/HeroStyleSkills'),Timeline=require('../../assets/_script/HeroSkillTimeline'),Paths=require('../../assets/_script/HeroSkillArrowPaths');
const Stats=require('../../assets/_script/HeroEquipmentStats'),Food=require('../characters/character-plan-food.cjs');
const {setup,Node}=require('./backend-gameplay-harness.cjs');
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('authored volleys retain nine directions, one charge snapshot and cancellable end tail',()=>{
 const state=Core.createState('skirmisher',{chargeRate:0});state.charge=.8;Core.beginActive(state,{direction:{x:1,y:0}});
 const events=Core.step(state,1.9,{});assert.equal(events.length,3);assert.equal(events.reduce((n,e)=>n+e.directions.length,0),9);events.forEach(e=>near(e.charge,.8));assert(state.active);Core.step(state,.1,{});assert.equal(state.active,null);
 const cancel=Core.createState('skirmisher');Core.beginActive(cancel,{});Core.cancelActive(cancel);assert.equal(Core.step(cancel,3,{}).length,0);
});
test('native arrow paths are finite, smoothly deformed and transformed exactly like the effect',()=>{
 assert.equal(Paths.deformationSampled,true);assert.equal(Paths.trajectories.length,9);
 const t=Core.createState('skirmisher').tuning,v={castScale:.16,castRotation:Paths.defaultRotation,castOffsetX:7,castOffsetY:-3},cast={origin:{x:10,y:20},direction:{x:1,y:0}};
 assert.equal(Timeline.arrowSegments(0,.6,t,v,cast).length,0);assert.equal(Timeline.arrowSegments(2,8,t,v,cast).length,0);
 const all=Timeline.arrowSegments(0,2,t,v,cast);assert.equal(new Set(all.map(s=>s.index)).size,9);assert(all.every(s=>Number.isFinite(s.to.x)&&Number.isFinite(s.to.y)));
 const turned=Timeline.arrowSegments(0,2,t,{...v,castOffsetX:0,castOffsetY:0},{origin:{x:0,y:0},direction:{x:0,y:1}}),base=Timeline.arrowSegments(0,2,t,{...v,castOffsetX:0,castOffsetY:0},{origin:{x:0,y:0},direction:{x:1,y:0}});
 near(turned[10].to.x,-base[10].to.y);near(turned[10].to.y,base[10].to.x);
 const p=Paths.trajectories[0].points;assert(p.some((r,i)=>i&&r.x!==p[i-1].x&&r.t-p[i-1].t<.01),'deformation must not be a keyframe step function');
 for(const source of [.2,2/3,1.2,2])near(Timeline.arrowSourceTime(Timeline.arrowGameTime(source,{windup:.9,contactDelay:.2,volleyPlayback:.75},{castDelay:.1}),{windup:.9,contactDelay:.2,volleyPlayback:.75},{castDelay:.1}),source);
});
test('Vanguard source pulses retain one cast tail and scale with an explicit duration and delay',()=>{
 const s=Core.createState('vanguard',{duration:8/3,contactDelay:.25});Core.beginActive(s,{});const expected=Timeline.vanguardSchedule(s.tuning),events=Core.step(s,2.1,{});assert.equal(events.length,5);events.forEach((e,i)=>near(e.elapsed,expected[i]));assert(s.active);Core.step(s,1,{});assert.equal(s.active,null);
});
test('Mystic charges grow the target-centered area and only its active receives Orb splash damage',()=>{
 for(const charges of [1,2,5,10]){const s=Core.createState('mystic'),target={};for(let i=0;i<charges;i++)Core.onHit(s,target,{});const cast=Core.beginActive(s,{target,splashDamage:.5});near(cast.damageMultiplier,(1+.02*charges)*1.5);near(cast.radius,100+charges*10);assert.equal(s.mysticCharges,0);}
});
test('Food migration preserves progress, costs, unknown fields and legacy flat behavior',()=>{
 const cfg={HeroEquipment:{version:1},EquipCfg:[{id:3,levelInfo:[{Level:1,GoldCost:100,SecondaryStats:{fighter:{healthRegen:5,future:17}}}]}]},before=structuredClone(cfg),equipment={1:1000,2:10,3:1,4:2,5:1,6:300};
 near(Stats.raw(cfg,'fighter',equipment,1).regen,15);assert.equal(Food.migrate(cfg),true);assert.equal(Food.migrate(cfg),false);
 assert.deepEqual(cfg.EquipCfg[0].levelInfo[0],{...before.EquipCfg[0].levelInfo[0],SecondaryStats:{fighter:{healthRegen:5,healthRegenPercent:.05,future:17}}});
 const raw=Stats.raw(cfg,'fighter',equipment,1);near(raw.regen,10);near(raw.regenPercent,.05);assert.equal(Stats.fields(cfg,3,1,'fighter')[0].percent,true);
});
function fixture(){
 const h=setup({HeroMakerRider:{setCombatState(){},clearCombatState(){},skillTiming(){return{hit:.1667};},skillOrigin(){return{x:0,y:0};}},HeroSkillPresentation:{queue(){},release(){},update(){},clear(){},advanceVFX(){}}});h.g.gameStatus=1;h.g.mapSize={width:2000,height:1000};h.ui.isPauset=false;
 const hero={heroStyle:'skirmisher',node:new Node('hero',h.g.ndMain),hp:1000,hpMax:1000,attackRange:500,crit:-1,time:{Attack:0},ctrPlayAni:{setAttack(){},setBodyLeft(){}},isDead(){return false;},getAttack:()=>100,getSpeed:()=>300,getAttSpeed:()=>1,onUpdata(){},doAttack(){},doAttackFinish(){},onRestart(){},endRoundGame(){},onDead(){},onDestroy(){}};hero.node._combatGeneration=1;h.g.ctrPlay=hero;h.load('HeroStyleRuntime').install(hero,{});const rt=hero._styleRuntime;Object.assign(rt.settings.visual,{castTrajectory:'skirmisher-atx117',castScale:.16,castRotation:Paths.defaultRotation});rt.state.tuning.chargeRate=0;
 const location=Timeline.arrowSegments(.8,.81,rt.state.tuning,rt.settings.visual,{origin:{x:0,y:0},direction:{x:1,y:0}}).find(s=>s.index===0).to;
 const enemy={node:new Node('target',h.g.ndMain,location.x,location.y),hp:10000,isDead(){return this.hp<=0;},onAttacked(n){this.hp-=n;return n;}};enemy.node._combatGeneration=1;h.d.enemyList.push(enemy);return{h,hero,rt,enemy};
}
test('native barrage collision is swept, finite and independent of render frame partition',()=>{
 function run(frames){const f=fixture();assert(f.rt.cast({x:1,y:0}));for(const dt of frames)f.rt.update(dt);return f;}
 const large=run([2]),small=run(Array(120).fill(1/60));assert(large.enemy.hp<10000);near(large.enemy.hp,small.enemy.hp);assert.equal(large.rt.projectiles.length,0);const hp=large.enemy.hp;large.rt.update(10);near(large.enemy.hp,hp);
 const retired=fixture();retired.rt.cast({x:1,y:0});retired.rt.update(.7);retired.hero.onRestart();retired.rt.update(2);assert.equal(retired.rt.skillCast,null);near(retired.enemy.hp,10000);
});
