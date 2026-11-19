'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,Node}=require('./backend-gameplay-harness.cjs');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(onHit){
 const h=setup({HeroMakerRider:{setCombatState(){},clearCombatState(){},skillTiming(){return{hit:.1667};},skillOrigin(){return{x:0,y:0};}},HeroSkillPresentation:{queue(){},release(){},update(){},clear(){},advanceVFX(){}}});h.g.gameStatus=1;h.ui.isPauset=false;
 const hero={heroStyle:'skirmisher',node:new Node('hero',h.g.ndMain),hp:1000,hpMax:1000,attackRange:500,crit:-1,time:{Attack:0},ctrPlayAni:{setAttack(){},setBodyLeft(){}},isDead:()=>false,getAttack:()=>100,getSpeed:()=>300,getAttSpeed:()=>1,onUpdata(){},doAttack(){},doAttackFinish(){},onRestart(){},endRoundGame(){},onDead(){},onDestroy(){}};
 hero.node._combatGeneration=1;h.g.ctrPlay=hero;h.load('HeroStyleRuntime').install(hero,{HeroSkills:{skirmisher:{volleyRange:350,visual:{arcDegrees:120}}}});const rt=hero._styleRuntime,events=[],actors={};rt.state.tuning.chargeRate=0;
 function enemy(id,x,y){const actor={id,node:new Node(id,h.g.ndMain,x,y),hp:10000,isDead(){return this.hp<=0;},onAttacked(damage,_hero,_secondary,context){this.hp-=damage;events.push({id,at:context.styleImpactAt,damage});if(onHit)onHit(id,actor,actors,hero,rt);return damage;}};actor.node._combatGeneration=1;h.d.enemyList.push(actor);return actor;}
 actors.A=enemy('A',100,0);actors.B=enemy('B',140,-80);return{h,hero,rt,events,actors};
}
function run(frames,onHit){const f=fixture(onHit);assert(f.rt.cast({x:1,y:0}));for(const dt of frames)f.rt.update(dt);return f;}
test('arrow contacts use travel time and stable order across frame partitions',()=>{
 const reference=run([2]).events;
 assert.deepEqual(reference.map(hit=>hit.id),['A','B']);near(reference[0].at,.35);assert(reference[1].at>reference[0].at);
 for(const frames of [[.05,.15,1.8],Array(120).fill(1/60)]){
  const actual=run(frames).events;
  assert.deepEqual(actual.map(hit=>hit.id),['A','B']);
  actual.forEach((hit,i)=>{near(hit.at,reference[i].at);assert.equal(hit.damage,100);});
 }
});

test('a pooled or replaced enemy cannot inherit a pending contact and teardown stops other arrows',()=>{
 const replaced=run([2],(id,_actor,actors,_hero,rt)=>{
  if(id==='A'){actors.B.node=new Node('replacement',rt.game.ndMain,140,-80);actors.B.node._combatGeneration=1;}
 });
 assert.deepEqual(replaced.events.map(hit=>hit.id),['A']);
 const retired=run([2],(id,_actor,_actors,hero)=>{if(id==='A')hero.onRestart();});
 assert.deepEqual(retired.events.map(hit=>hit.id),['A']);assert.equal(retired.rt.projectiles.length,0);
});

test('replacement shots cannot damage twice after a contact callback recycles its target',()=>{
 const f=run([2],(_id,actor)=>{actor.node._combatGeneration++;});
 assert.deepEqual(f.events.map(hit=>hit.id),['A','B']);
 f.rt.update(1);assert.equal(f.events.length,2);
});
