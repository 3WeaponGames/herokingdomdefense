'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,Node}=require('./backend-gameplay-harness.cjs');
function fixture(){
 const h=setup(),heals=[];
 const hero={node:new Node('hero',h.g.ndMain),hp:500,hpMax:1000,_relicHero:true,_heroSecondary:{lifeSteal:.5},isDead(){return this.hp<=0;},ctrHp:{setHp(...args){heals.push(args);}},_styleRuntime:{onImpact(){}}};
 const target={node:new Node('enemy',h.g.ndMain,100,0),hp:1000,hpMax:1000,isDead(){return this.hp<=0;}};
 hero.node._combatGeneration=target.node._combatGeneration=1;h.g.ctrPlay=hero;h.d.enemyList.push(target);
 const combat=h.load('RelicCombat');
 function impact(damage){const context=combat.primaryContext(hero,target,damage,false);const received=combat.enemyDamage(target,damage,hero,false,context);target.hp-=received;combat.primaryImpact(target,hero,context,received);return context;}
 return{...h,hero,target,heals,impact};
}
test('primary impact cannot heal a new hero lifetime after the skill callback recycles its owner',()=>{
 const h=fixture();h.hero._styleRuntime.onImpact=()=>{h.hero.node._combatGeneration++;h.hero.hp=300;};h.impact(100);
 assert.equal(h.hero.hp,300);assert.equal(h.heals.length,0);
});
test('primary impact cannot apply lifesteal after its skill callback retires the battle epoch',()=>{
 const h=fixture();h.hero._styleRuntime.onImpact=()=>{h.g._combatEpoch=(h.g._combatEpoch||0)+1;};h.impact(100);
 assert.equal(h.hero.hp,500);assert.equal(h.heals.length,0);
});
test('a recycled target cannot supply its replacement HP to old impact healing',()=>{
 const h=fixture();h.hero._styleRuntime.onImpact=()=>{h.target.node._combatGeneration++;h.target.hp=10000;};h.impact(100);
 assert.equal(h.hero.hp,500);assert.equal(h.heals.length,0);
});
test('normal and lethal impacts retain lifesteal from actual removed HP and cannot double process',()=>{
 const h=fixture();h.impact(100);assert.equal(h.hero.hp,550);
 const lethal=fixture();lethal.target.hp=50;const context=lethal.impact(100);assert.equal(lethal.hero.hp,525);assert.equal(lethal.target.hp,-50);
 lethal.load('RelicCombat').primaryImpact(lethal.target,lethal.hero,context,100);assert.equal(lethal.hero.hp,525);
});
