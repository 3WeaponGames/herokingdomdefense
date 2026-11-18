'use strict';
// Native Node children can be released before the hero component's onDestroy.
// Model the actual Cocos 2.4 flag rules and throw on disposed native getters.
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,hero}=require('./backend-gameplay-harness.cjs');
const FLAGS={Destroyed:1,ToDestroy:4,Destroying:128};
function fixture(){
 const events={rider:0,hud:0,base:0,charge:0};
 const h=setup({HeroMakerRider:{clearCombatState(){events.rider++;}},HeroSkillHUD:{clear(){events.hud++;}},BattleSounds:{charge(){events.charge++;}}});
 h.e.cc.Object={Flags:FLAGS};
 h.e.cc.isValid=(value,strict)=>!!value&&!value.destroyed&&!(value._objFlags&(strict?FLAGS.Destroyed|FLAGS.ToDestroy:FLAGS.Destroyed));
 const p=hero(h);p.heroStyle='skirmisher';p.node._objFlags=0;p._objFlags=0;p.ndRange={width:400,scale:1,_objFlags:0};
 for(const key of ['onRestart','endRoundGame','onDead','onDestroy'])p[key]=()=>{events.base++;};
 h.load('HeroStyleRuntime').install(p,{});const rt=p._styleRuntime;return{...h,p,rt,events};
}
function poisonedRange(p){let reads=0;Object.defineProperty(p.ndRange,'width',{get(){reads++;throw Error('disposed native width');}});return()=>reads;}

test('destroying a hero clears owned skill state without refreshing released child nodes',()=>{
 const f=fixture(),reads=poisonedRange(f.p);f.p.ndRange._objFlags=FLAGS.Destroyed;
 f.p.node.getPosition=()=>{throw Error('native owner position during teardown');};
 f.rt.state.charge=1;f.p._styleShotRange=999;
 const enemy={},record={enemy},taunt={};enemy._heroKnockback=record;enemy._heroTaunt=taunt;
 f.rt.knockbacks.push(record);f.rt.taunted.push({enemy,taunt});
 let rangeRefreshes=0;const refresh=f.p.refreshAttackRange;f.p.refreshAttackRange=function(){rangeRefreshes++;return refresh.call(this);};
 assert.doesNotThrow(()=>f.p.onDestroy());assert.equal(rangeRefreshes,0);assert.equal(reads(),0);
 assert.equal(enemy._heroKnockback,undefined);assert.equal(enemy._heroTaunt,undefined);assert.equal(f.rt.knockbacks.length,0);assert.equal(f.rt.taunted.length,0);assert.equal(f.rt.state.charge,0);assert.equal(f.p._styleShotRange,undefined);
 assert.deepEqual(f.events,{rider:1,hud:1,base:1,charge:1});
});

for(const target of ['component','owner','range'])for(const flag of Object.keys(FLAGS))test('range refresh avoids native getters for '+target+' marked '+flag,()=>{
 const f=fixture(),reads=poisonedRange(f.p),value=target==='component'?f.p:target==='owner'?f.p.node:f.p.ndRange;value._objFlags=FLAGS[flag];
 if(flag==='Destroying')assert.equal(f.e.cc.isValid(value,true),true,'Cocos 2.4 strict validity does not include its pre-destroy flag');
 assert.doesNotThrow(()=>f.p.refreshAttackRange());assert.equal(reads(),0);
});

test('ordinary clear, death, wave end and restart still reset and refresh the live range',()=>{
 for(const action of ['clear','onDead','endRoundGame','onRestart']){
  const f=fixture();f.rt.state.charge=1;f.p.refreshAttackRange();assert.equal(f.p.ndRange.scale,1.5);
  if(action==='clear')f.rt.clear(true);else f.p[action]();
  assert.equal(f.rt.state.charge,0);assert.equal(f.p.ndRange.scale,1);assert.equal(f.events.rider,1);assert.equal(f.events.hud,1);assert.equal(f.events.base,action==='clear'?0:1);
 }
});

test('ordinary clear can retire its state after the range child is independently destroyed',()=>{
 const f=fixture(),reads=poisonedRange(f.p);f.p.ndRange._objFlags=FLAGS.Destroyed;f.rt.state.charge=1;
 assert.doesNotThrow(()=>f.rt.clear(true));assert.equal(reads(),0);assert.equal(f.rt.state.charge,0);assert.equal(f.events.hud,1);
});

for(const target of ['component','owner'])test('ordinary clear avoids a pre-destroy native position on '+target,()=>{
 const f=fixture(),value=target==='component'?f.p:f.p.node;value._objFlags=FLAGS.Destroying;
 assert.equal(f.e.cc.isValid(value,true),true);
 f.p.node.getPosition=()=>{throw Error('disposed native position');};f.rt.state.charge=1;
 assert.doesNotThrow(()=>f.rt.clear(true));assert.equal(f.rt.state.charge,0);assert.equal(f.events.hud,1);
});

test('range refresh accepts a missing child but does not suppress errors on a live native node',()=>{
 const f=fixture();f.p.ndRange=null;assert.doesNotThrow(()=>f.p.refreshAttackRange());
 f.p.ndRange={_objFlags:0,get width(){throw Error('unexpected live node failure');}};
 assert.throws(()=>f.p.refreshAttackRange(),/unexpected live node failure/);
});
