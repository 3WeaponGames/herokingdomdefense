'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Skills=require('../../assets/_script/HeroStyleSkills');
const close=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('Steady Aim charges only standing and first basic shot snapshots then clears charge',()=>{
 const s=Skills.createState('skirmisher');
 Skills.step(s,2,{moving:false});close(s.charge,.5);
 const fire=Skills.onBasicFire(s);close(fire.charge,.5);close(fire.damageMultiplier,1.25);assert.equal(s.charge,0);
 assert.equal(Skills.onBasicFire(s).damageMultiplier,1);
 Skills.step(s,10,{moving:false});assert.equal(s.charge,1);
 Skills.step(s,.001,{moving:true});assert.equal(s.charge,0);
});
test('aim confirmation does not consume charge before Skirmisher actually fires',()=>{
 const s=Skills.createState('skirmisher');s.charge=.5;
 assert.equal(Skills.beginActive(s,{direction:{x:0,y:5}}).ok,true);close(s.charge,.5);
 assert.equal(Skills.step(s,.1,{moving:false}).length,0);
 const events=Skills.step(s,.25,{moving:false});assert.equal(events.length,1);
 assert.equal(events[0].type,'skirmisher-arrow');close(events[0].charge,.5875);close(s.charge,0);
 assert.deepEqual(events[0].direction,{x:0,y:1});
 assert.equal(Skills.step(s,1,{moving:false}).length,0);
});
test('Skirmisher movement during wind-up clears charge and distance always increases shot damage',()=>{
 const s=Skills.createState('skirmisher');s.charge=1;Skills.beginActive(s,{});
 const [arrow]=Skills.step(s,.35,{moving:true});assert.equal(arrow.charge,0);
 assert(Skills.projectileMultiplier(s,600,arrow.damageMultiplier)>Skills.projectileMultiplier(s,100,arrow.damageMultiplier));
});
test('Skirmisher wind-up and passive result do not depend on frame partition',()=>{
 function run(frames){const s=Skills.createState('skirmisher');Skills.beginActive(s,{});return {s,events:frames.flatMap(dt=>Skills.step(s,dt,{moving:false}))};}
 const a=run([1]),b=run(Array(100).fill(.01));
 close(a.events[0].charge,b.events[0].charge);close(a.events[0].time,b.events[0].time);close(a.s.charge,b.s.charge);
});
test('Vanguard momentum grows moving, decays standing, and is consumed on a hit rather than firing',()=>{
 const s=Skills.createState('vanguard');Skills.step(s,3,{moving:true});close(s.charge,.6);
 Skills.onBasicFire(s);close(s.charge,.6);Skills.step(s,1,{moving:false});close(s.charge,.45);
 const hit=Skills.onHit(s,{},{});close(hit.charge,.45);assert.equal(s.charge,0);assert.equal(s.buffRemaining,10);
 close(Skills.bonuses(s).move,.45);close(Skills.bonuses(s).attackRate,.1575);
});
test('Vanguard buff refreshes from newly built momentum without stacking and multi-target strike consumes once',()=>{
 const s=Skills.createState('vanguard');s.charge=1;Skills.onHit(s,{}, {strikeId:'one'});
 Skills.step(s,2,{moving:true});close(s.charge,.4);
 Skills.onHit(s,{}, {strikeId:'two'});assert.equal(s.buffRemaining,10);close(s.buffStrength,1);
 s.charge=.1;Skills.onHit(s,{}, {strikeId:'two'});close(s.charge,.1);close(s.buffStrength,1);
 Skills.step(s,10,{moving:false});assert.equal(Skills.bonuses(s).move,0);
 s.charge=.3;Skills.onHit(s,{}, {strikeId:'three'});close(s.buffStrength,.3);
});
test('Vanguard emits exactly seven independently resolvable thrusts by 2.5 seconds with fixed aim',()=>{
 const s=Skills.createState('vanguard'),cast=Skills.beginActive(s,{direction:{x:3,y:4},moveSpeed:300,attackRate:1});
 assert.equal(cast.strikes,7);assert.equal(Skills.step(s,.35,{moving:true}).length,0);
 const events=Skills.step(s,2.15,{moving:true,moveSpeed:600,attackRate:2});
 assert.equal(events.length,7);assert.deepEqual(events.map(e=>e.index),[1,2,3,4,5,6,7]);
 close(events[6].elapsed,2.5);assert.equal(s.active,null);assert.equal(Skills.step(s,100,{}).length,0);
 for(const event of events){assert.deepEqual(event.direction,{x:.6,y:.8});assert(event.damageMultiplier>cast.damageMultiplier);}
});
test('Vanguard timing is frame independent and no first target list is stored',()=>{
 function run(frames){const s=Skills.createState('vanguard');Skills.beginActive(s,{});return frames.flatMap(dt=>Skills.step(s,dt,{}));}
 const slow=run([2.5]),fast=run(Array(250).fill(.01));assert.equal(fast.length,7);
 fast.forEach((e,i)=>{close(e.time,slow[i].time);assert(!('targets' in e));});
});
test('Fighter landed melee hits stack damage, reduction and tenacity and all expire',()=>{
 const s=Skills.createState('fighter');Skills.onHit(s,{}, {hit:false});assert.equal(s.stacks,0);
 Skills.onHit(s,{}, {melee:false});assert.equal(s.stacks,0);
 for(let i=0;i<10;i++)Skills.onHit(s,{}, {strikeId:i});assert.equal(s.stacks,5);
 const bonus=Skills.bonuses(s);close(bonus.damage,.15);close(bonus.damageReduction,.125);close(bonus.tenacity,.4);
 Skills.step(s,5,{});assert.equal(s.stacks,0);assert.equal(Skills.bonuses(s).damage,0);
});
test('Fighter active grants ten-second attack speed and damage, then expires',()=>{
 const s=Skills.createState('fighter'),cast=Skills.beginActive(s,{});assert.equal(cast.buffDuration,10);assert(cast.knockback>0);
 assert(Skills.bonuses(s).damage>0);assert(Skills.bonuses(s).attackRate>0);
 Skills.step(s,9.99,{});assert(Skills.bonuses(s).attackRate>0);Skills.step(s,.01,{});close(Skills.bonuses(s).attackRate,0);
});
test('Bruiser passive increases both damage and attack speed only as HP is lost',()=>{
 const s=Skills.createState('bruiser');assert.equal(Skills.bonuses(s,{hp:100,maxHp:100}).damage,0);
 const hurt=Skills.bonuses(s,{hp:25,maxHp:100}),lessHurt=Skills.bonuses(s,{hp:75,maxHp:100});
 assert(hurt.damage>lessHurt.damage);assert(hurt.attackRate>lessHurt.attackRate);
 assert.equal(Skills.bonuses(s,{hp:NaN,maxHp:0}).damage,0);
});
test('Blood Cleave sacrifices half current HP then derives multiplier from post-cost missing HP',()=>{
 const s=Skills.createState('bruiser'),context={hp:500,maxHp:1000,damage:100},cast=Skills.beginActive(s,context);
 assert.equal(cast.hpCost,250);assert.equal(cast.hpAfterCost,250);assert.equal(cast.damageMultiplier,1.75);
 assert.equal(context.hp,500,'the engine returns the cost; the gameplay adapter applies it before damage/lifesteal');
 const tiny=Skills.beginActive(Skills.createState('bruiser'),{hp:1,maxHp:1000});assert.equal(tiny.hpAfterCost,.5);
});
test('Mystic requires an actually hit marked enemy and skill hits do not charge the basic passive',()=>{
 const s=Skills.createState('mystic'),target={};Skills.setTarget(s,target);
 assert.equal(Skills.canActivate(s),false);assert.equal(Skills.beginActive(s,{}).ok,false);assert.equal(s.cooldown,0);
 Skills.onHit(s,target,{kind:'skill'});assert.equal(s.marked,false);
 const hit=Skills.onHit(s,target,{kind:'basic'});assert.equal(hit.marked,true);assert(hit.slow>0);assert.equal(s.mysticCharges,1);
 assert.equal(Skills.canActivate(s,{target}),true);assert.equal(Skills.canActivate(s,{target:{}}),false);
});
test('Mystic charge is capped, increases active damage and scales with Crystal Orb without a basic splash event',()=>{
 const s=Skills.createState('mystic'),target={};for(let i=0;i<20;i++)Skills.onHit(s,target,{});
 assert.equal(s.mysticCharges,10);
 const cast=Skills.beginActive(s,{target,splashDamage:.5});assert.equal(cast.ok,true);assert.equal(cast.target,target);
 assert.equal(cast.damageMultiplier,4.5);assert.equal(s.mysticCharges,0);assert.equal(s.marked,true);
 assert.deepEqual(Skills.step(s,1,{}),[],'continuous basic tick cadence belongs to gameplay and has no projectile events');
});
test('Mystic target change/death clears mark and charge, while time/range pause alone does not',()=>{
 const s=Skills.createState('mystic'),a={},b={};Skills.onHit(s,a,{});Skills.step(s,3,{});assert.equal(s.marked,true);
 Skills.setTarget(s,b);assert.equal(s.marked,false);assert.equal(s.mysticCharges,0);
 Skills.onHit(s,b,{});Skills.step(s,.1,{targetAlive:false});assert.equal(s.target,null);assert.equal(s.marked,false);
});
test('Guardian shield absorbs damage once, has an expiry and exposes ally protection',()=>{
 const s=Skills.createState('guardian'),cast=Skills.beginActive(s,{maxHp:1000});assert.equal(cast.shieldAmount,250);assert(cast.tauntDuration>0);
 assert.deepEqual(Skills.absorbDamage(s,100),{damage:0,absorbed:100});
 assert.deepEqual(Skills.absorbDamage(s,200),{damage:50,absorbed:150});assert(Skills.bonuses(s).allyDamageReduction>0);
 const another=Skills.createState('guardian');Skills.beginActive(another,{maxHp:1000});Skills.step(another,5,{});assert.equal(another.shield,0);
});
test('dead heroes cannot cast or emit scheduled skill impacts and cooldown blocks double activation',()=>{
 const s=Skills.createState('vanguard');assert.equal(Skills.beginActive(s,{hp:0}).ok,false);
 assert.equal(Skills.beginActive(s,{hp:10}).ok,true);assert.equal(Skills.beginActive(s,{}).ok,false);
 assert.deepEqual(Skills.step(s,10,{alive:false}),[]);assert.equal(s.active,null);
});
test('tuning overrides are local and invalid values cannot poison timers or state',()=>{
 const s=Skills.createState('fighter',{stackDamage:.1,cooldown:NaN,unrelated:100}),normal=Skills.createState('fighter');
 Skills.onHit(s,{},{});Skills.onHit(normal,{},{});assert.equal(Skills.bonuses(s).damage,.1);assert.equal(Skills.bonuses(normal).damage,.03);
 assert.equal(s.tuning.cooldown,12);Skills.step(s,NaN,{});assert.equal(s.time,0);assert(!('unrelated' in s.tuning));
});

test('authored delayed active impacts emit one payload at the marker and remain cancellable',()=>{
 for(const style of ['fighter','bruiser','mystic']){
  const s=Skills.createState(style),target={};if(style==='mystic')Skills.onHit(s,target,{});
  const cast=Skills.beginActive(s,{hp:500,maxHp:1000,target,impactDelay:.4});assert(cast.ok);assert(s.active);assert.equal(Skills.step(s,.39,{}).length,0);
  const [event]=Skills.step(s,.01,{});assert.equal(event.type,style+'-impact');assert.equal(event.cast,cast);assert.equal(event.context.target,target);close(event.time,.4);assert.equal(s.active,null);
  assert.equal(Skills.step(s,1,{}).length,0);
  const cancelled=Skills.createState(style);if(style==='mystic')Skills.onHit(cancelled,target,{});Skills.beginActive(cancelled,{hp:500,maxHp:1000,target,impactDelay:.4});Skills.cancelActive(cancelled);assert.equal(Skills.step(cancelled,1,{}).length,0);
 }
});
