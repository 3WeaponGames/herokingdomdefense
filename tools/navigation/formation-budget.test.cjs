'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {environment,PhysicsBoxCollider}=require('./runtime-harness.cjs');
function fixture(){const e=environment(),g=e.game;Object.setPrototypeOf(g,e.load('KinghtFallGameCtrl').default.prototype);Object.assign(g,{pathIndex:0,isAgg:true,_separateArmyCommands:true,mapSize:{width:2000,height:2000}});g.ctrPlay.node.setPosition(0,0);
 const units=Array.from({length:16},(_,i)=>{const id=i%4+1,u=e.actor('KinghtFallSoldierItem'+String(id).padStart(2,'0'),i*20-150,-180);u.cfg={...u.cfg,ID:90000+id,AttackType:id===3?2:1};u.isAgg=true;u.node.addComponent(PhysicsBoxCollider).size={width:22,height:22};g.gameData.soldiers.push(u);return u;});
 const nav=e.nav.get(g);nav.refresh();return{...e,g,units,navigation:nav};}
function clock(e){let ms=0,checks=0;const grid=e.navigation.grid,original=grid.isWalkable;grid.isWalkable=function(...args){checks++;e.setTime(++ms);return original.apply(this,args);};return()=>checks;}
test('formation placement yields at its frame deadline, advances once per frame and keeps exact synchronous destinations',()=>{
 const expected=fixture(),e=fixture(),anchor={x:0,y:0};expected.nav.beginFrame(expected.g);const points=expected.units.map(u=>expected.g.getArmyOrderGoal(u,anchor).pos);
 const checks=clock(e);e.nav.beginFrame(e.g);const result=e.g.getArmyOrderGoal(e.units[0],anchor);assert(result.pending);assert(e.g._followFormationJob);const count=checks();e.units.slice(1).forEach(u=>assert(e.g.getArmyOrderGoal(u,anchor).pending));assert.equal(checks(),count,'the same group must not consume another slice for each soldier');
 let frames=0;while(e.g._followFormationJob&&frames++<200){e.nav.beginFrame(e.g);e.g.getArmyOrderGoal(e.units[0],{x:frames*3,y:0});}
 assert(frames<200,'a moving follow target starved an in-flight layout');const formation=e.g._followFormation;assert(formation);near(formation.anchor.x,0);
 e.units.forEach((u,i)=>{const p=formation.slots.get(u).pos;near(p.x,points[i].x);near(p.y,points[i].y);});
});
function near(a,b){assert(Math.abs(a-b)<.00001,`${a} != ${b}`);}
test('geometry changes cancel unfinished formation work before publishing destinations and new orders release pending work',()=>{
 const e=fixture();clock(e);e.nav.beginFrame(e.g);e.g.getArmyOrderGoal(e.units[0],{x:0,y:0});const first=e.g._followFormationJob;assert(first);
 e.box(220,100,40,60);e.nav.beginFrame(e.g);e.g.getArmyOrderGoal(e.units[0],{x:0,y:0});assert.notEqual(e.g._followFormationJob,first);assert.equal((e.g._followFormationJob||e.g._followFormation).revision,e.navigation.revision);
 clock(e);e.nav.beginFrame(e.g);e.g.getArmyOrderGoal(e.units[0],{x:60,y:0});assert(e.g._followFormationJob);
 e.g.holdSelectedFollowers();assert.equal(e.g._followFormationJob,null);assert.equal(e.g._rallyFormationJob,null);
});
test('a pooled unit reused in the same roster invalidates an unfinished layout',()=>{
 const e=fixture();clock(e);e.nav.beginFrame(e.g);e.g.getArmyOrderGoal(e.units[0],{x:0,y:0});const old=e.g._followFormationJob;assert(old);
 e.units[0]._combatGeneration=(e.units[0]._combatGeneration||0)+1;e.nav.beginFrame(e.g);e.g.getArmyOrderGoal(e.units[0],{x:0,y:0});const next=e.g._followFormationJob;assert(next&&next!==old);assert.equal(next.generations[0],e.units[0]._combatGeneration);
});
