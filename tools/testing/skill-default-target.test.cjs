'use strict';
// Real runtime selection and hero range accessors; no game, audio, or saves.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,hero,Node}=require('./backend-gameplay-harness.cjs');
function scene(style='skirmisher'){
 const h=setup({GameToolsOverrides:{cancel(){},attackPlayback:()=>1},HeroMakerRider:{setCombatState(){},clearCombatState(){}},HeroSkillHUD:{clear(){}}}),p=hero(h);
 p.heroStyle=style;p.node.setParent(h.g.ndMain);p.node._combatGeneration=1;p.hp=100;p.getSpeed=()=>300;p.getAttack=()=>20;p.isDead=()=>false;
 h.g.gameStatus=1;h.g._combatEpoch=1;h.ui.isPauset=false;h.load('HeroStyleRuntime').install(p,{});const rt=p._styleRuntime;rt.refresh();
 function enemy(x,y=0){const e={node:new Node('enemy',h.g.ndMain,x,y),hp:100,isDead(){return this.hp<=0;}};e.node._combatGeneration=1;h.d.enemyList.push(e);return e;}
 return {...h,p,rt,enemy};
}

test('skill auto aim prefers the current attack target and otherwise selects the nearest current enemy',()=>{
 const h=scene(),near=h.enemy(20),selected=h.enemy(180);h.p.tagEnemy=selected;
 assert.equal(h.rt.nearest(),near);assert.equal(h.rt.defaultAimTarget(),selected);
 h.p.tagEnemy=null;assert.equal(h.rt.defaultAimTarget(),near);
 h.d.enemyList=[];assert.equal(h.rt.defaultAimTarget(),null);
});

test('dead, pooled, disabled or destroyed attack targets cannot bypass fresh auto acquisition',()=>{
 for(const mode of ['dead','pooled','inactive','destroyed-node','destroyed-owner']){
  const h=scene(),selected=h.enemy(10),healthy=h.enemy(80);h.p.tagEnemy=selected;
  if(mode==='dead')selected.hp=0;
  if(mode==='pooled')selected._isPooled=true;
  if(mode==='inactive')selected.node.active=false;
  if(mode==='destroyed-node')selected.node.destroyed=true;
  if(mode==='destroyed-owner')selected.destroyed=true;
  assert.equal(h.rt.defaultAimTarget(),healthy,mode);
 }
});

test('an out-of-range or removed attack target cannot auto-cast from stale retained intent',()=>{
 const h=scene(),near=h.enemy(30),selected=h.enemy(250);h.p.tagEnemy=selected;
 assert.equal(h.rt.defaultAimTarget(),near);
 selected.node.x=150;assert.equal(h.rt.defaultAimTarget(),selected);
 h.d.enemyList.splice(h.d.enemyList.indexOf(selected),1);assert.equal(h.rt.defaultAimTarget(),near);
 h.d.enemyList=[];assert.equal(h.rt.defaultAimTarget(),null);
});

test('auto acquisition uses the current range, including charged reach, movement cancellation and stat changes',()=>{
 const h=scene(),near=h.enemy(30),selected=h.enemy(275);h.p.tagEnemy=selected;
 assert.equal(h.rt.defaultAimTarget(),near);
 h.rt.state.charge=1;assert.equal(h.rt.defaultAimTarget(),selected);
 h.p._relicMoving=true;assert.equal(h.rt.defaultAimTarget(),near);
 h.p._relicMoving=false;h.p.attackRange=240;h.rt.state.charge=.5;assert.equal(h.rt.defaultAimTarget(),selected);
 h.p.attackRange=160;assert.equal(h.rt.defaultAimTarget(),near);assert.equal(h.p.attackRange,160);
});

test('auto aim uses Euclidean reach and includes the exact current range boundary',()=>{
 const h=scene(),near=h.enemy(20),selected=h.enemy(160,120);h.p.tagEnemy=selected;
 assert.equal(h.rt.defaultAimTarget(),selected);
 selected.node.x+=.001;assert.equal(h.rt.defaultAimTarget(),near);
});

test('absence of an auto target does not disable directional manual aim or untargeted buffs',()=>{
 for(const style of ['skirmisher','fighter','vanguard','guardian','bruiser']){
  const h=scene(style);assert.equal(h.rt.defaultAimTarget(),null);assert.equal(h.rt.canCast(),true,style);
 }
 const mystic=scene('mystic');assert.equal(mystic.rt.canCast(),false,'Mystic still requires its basic-attack mark');
});
