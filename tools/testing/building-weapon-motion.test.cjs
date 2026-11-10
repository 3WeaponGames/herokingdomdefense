'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Motion=require('../../assets/_script/BuildingWeaponMotion');
function weapon(reload=true){return{sprite:'loaded',emptySprite:reload?'empty':undefined,motion:{type:'spring',distance:16,speed:20,damping:5,reloadTime:reload?1:0}};}
test('source spring settles at rest while a ballista stays empty until its independent reload',()=>{
 const value=weapon(),before=JSON.stringify(value),state=Motion.start(value,4);
 assert.equal(state.loaded,false);assert(Motion.factor(state)>0);
 Motion.step(state,.2);assert.equal(Motion.factor(state),0);assert.equal(state.loaded,false);assert.equal(state.active,true);
 Motion.step(state,.79);assert.equal(state.loaded,false);Motion.step(state,.01);assert.equal(state.loaded,true);assert(Motion.factor(state)>0,'reloading produces the second authored kick');
 Motion.step(state,.21);assert.equal(Motion.factor(state),0);assert.equal(state.active,false);assert.equal(JSON.stringify(value),before);
});
test('cannons settle without reload and a fast attack cadence shortens only the visual reload',()=>{
 const cannon=Motion.start(weapon(false),4);assert.equal(cannon.loaded,true);Motion.step(cannon,.21);assert.equal(cannon.active,false);assert.equal(Motion.factor(cannon),0);
 const fast=Motion.start(weapon(),.1);Motion.step(fast,.049);assert.equal(fast.loaded,false);Motion.step(fast,.001);assert.equal(fast.loaded,true);
 const next=Motion.start(weapon(),.1);assert.equal(next.loaded,false);assert.equal(next.age,0,'each shot starts a fresh visual cycle');
});
test('legacy appearances opt out and malformed time deltas cannot corrupt or prolong a spring',()=>{
 assert.equal(Motion.start({},1),null);assert.equal(Motion.start({motion:{type:'legacy'}},1),null);
 const state=Motion.start(weapon(),4);for(const delta of [-1,NaN,Infinity,undefined])Motion.step(state,delta);assert.equal(state.age,0);
 Motion.step(state,Number.MAX_VALUE);assert.equal(state.loaded,true);assert.equal(state.active,false);assert.equal(Motion.factor(state),0);
});
