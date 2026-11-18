'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Timeline=require('../../assets/_script/HeroSkillTimeline');
const {setup,Node}=require('./backend-gameplay-harness.cjs');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(onHit){
 const h=setup({HeroMakerRider:{setCombatState(){},clearCombatState(){},skillTiming(){return{hit:.1667};},skillOrigin(){return{x:0,y:0};}},HeroSkillPresentation:{queue(){},release(){},update(){},clear(){},advanceVFX(){}}});h.g.gameStatus=1;h.ui.isPauset=false;
 const hero={heroStyle:'skirmisher',node:new Node('hero',h.g.ndMain),hp:1000,hpMax:1000,attackRange:500,crit:-1,time:{Attack:0},ctrPlayAni:{setAttack(){},setBodyLeft(){}},isDead:()=>false,getAttack:()=>100,getSpeed:()=>300,getAttSpeed:()=>1,onUpdata(){},doAttack(){},doAttackFinish(){},onRestart(){},endRoundGame(){},onDead(){},onDestroy(){}};
 hero.node._combatGeneration=1;h.g.ctrPlay=hero;h.load('HeroStyleRuntime').install(hero,{});const rt=hero._styleRuntime,events=[],actors={};rt.state.tuning.chargeRate=0;
 function enemy(id,x,y){const actor={id,node:new Node(id,h.g.ndMain,x,y),hp:10000,isDead(){return this.hp<=0;},onAttacked(damage,_hero,_secondary,context){this.hp-=damage;events.push({id,at:context.styleImpactAt,damage});if(onHit)onHit(id,actor,actors,hero,rt);return damage;}};actor.node._combatGeneration=1;h.d.enemyList.push(actor);return actor;}
 actors.A=enemy('A',100,20);actors.B=enemy('B',120,-20);return{h,hero,rt,events,actors};
}
function run(frames,onHit){const f=fixture(onHit);assert(f.rt.cast({x:1,y:0}));for(const dt of frames)f.rt.update(dt);return f;}
test('one simultaneous volley strike preserves target order, damage and actual hit time under every frame partition',()=>{
 const long=run([2]),split=run([.05,.15,1.8]),fine=run(Array(120).fill(1/60));assert.deepEqual(long.events.map(e=>e.id),['A','B']);
 for(const f of [long,split,fine]){assert.deepEqual(f.events,long.events);for(const e of f.events)near(e.at,Timeline.skirmisherHitTime(f.rt.state.tuning,f.rt.settings.visual));}
});
test('a simultaneous strike keeps its pre-hit geometry snapshot when its first callback moves another captured target',()=>{
 const move=(id,_actor,actors)=>{if(id==='A')actors.B.node.setPosition(-1500,-1500);};
 assert.deepEqual(run([2],move).events.map(e=>e.id),['A','B']);assert.deepEqual(run([.1,1.9],move).events.map(e=>e.id),['A','B']);
});
test('replacement nodes and retired casts cannot receive hits captured for earlier identities',()=>{
 const replaced=run([2],(id,_actor,actors,_hero,rt)=>{if(id==='A'){actors.B.node=new Node('replacement',rt.game.ndMain,120,-20);actors.B.node._combatGeneration=1;}});assert.deepEqual(replaced.events.map(e=>e.id),['A']);
 const retired=run([2],(id,_actor,_actors,hero)=>{if(id==='A')hero.onRestart();});assert.deepEqual(retired.events.map(e=>e.id),['A']);assert.equal(retired.rt.skillCast,null);
});
test('single-strike gameplay leaves retired arrow-frontier APIs absent',()=>{
 assert.equal(Timeline.nextArrowContact,undefined);assert.equal(Timeline.arrowSegments,undefined);const f=fixture();assert.equal(f.rt.updateAuthoredArrows,undefined);
});
test('the captured volley aim remains fixed when its selected target moves before the hit',()=>{
 const f=fixture();assert(f.rt.cast({x:1,y:0}));const captured={...f.rt.state.active.direction};f.actors.A.node.setPosition(0,400);f.rt.aimDirection={x:0,y:1};f.rt.update(.1);near(f.rt.state.active.direction.x,captured.x);near(f.rt.state.active.direction.y,captured.y);
});
test('reentrant recycling cannot rescan a simultaneous strike or create unbounded replacement hits',()=>{
 const f=run([2],(_id,actor)=>{actor.hp=10000;actor.node._combatGeneration++;});assert.deepEqual(f.events.map(e=>e.id),['A','B']);f.rt.resolveVolley({time:2,damageMultiplier:1});assert.equal(f.events.length,2);
});
