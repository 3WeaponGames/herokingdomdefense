'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {environment,Node}=require('../navigation/runtime-harness.cjs');
function fixture(){
 const e=environment(),requests=[],returned=[],sounds=[];let onSound=null;
 e.game._combatEpoch=1;e.game.gameStatus=1;
 e.stubs.BattleSounds={effect(...args){sounds.push(args);if(onSound)onSound();}};
 e.stubs.PoolMgr={PoolMgr:{getInstance:()=>({freeNode:(_pool,node)=>returned.push(node)})}};
 const ui=e.stubs.KinghtFallUIGame.default.instance;ui.ctrEffect.onBuff=(_asset,_pool,callback)=>requests.push(callback);
 const I=e.load('KinghtFallInterface'),actor=new I.KinghtFallInterface();Object.assign(actor,{node:new Node('target',e.game.ndMain),ndEffect:new Node('status'),hp:50,hpMax:100,isDead(){return this.hp<=0;}});actor.node._combatGeneration=1;
 function effect(){const node=new Node('status FX');node.getComponentInChildren=()=>({setAnimation(){}});return node;}
 return{e,ui,I,actor,requests,returned,sounds,effect,onSound:callback=>{onSound=callback;}};
}
const retirements={generation:f=>f.actor.node._combatGeneration++,node:f=>{const next=new Node('replacement',f.e.game.ndMain);next._combatGeneration=1;f.actor.node=next;},statuses:f=>{f.actor.debuffInfo=[];},pooled:f=>{f.actor._isPooled=true;},dead:f=>{f.actor.hp=0;},actorPending:f=>{f.actor.destroyed=true;},epoch:f=>f.e.game._combatEpoch++,data:f=>{f.e.game.gameData={};},stage:f=>f.e.game.gameStatus++,uiPending:f=>{f.ui.destroyed=true;},uiClosed:f=>{f.ui.isclose=true;}};
test('status registration captures recipient and battle before sound callbacks',()=>{
 for(const type of ['DamageCut','MoveSpeed'])for(const [name,retire]of Object.entries(retirements)){
  const f=fixture(),input={subNum:.2,time:2,future:{retain:true}},before=JSON.stringify(input);f.onSound(()=>retire(f));f.actor.addBuff(f.I.KinghtFallEnemyBuffType[type],input);assert.equal(f.actor.debuffInfo.length,0,type+' / '+name);assert.equal(f.requests.length,0);assert.equal(JSON.stringify(input),before);
 }
});
test('pending status artwork returns to the pool after recipient or battle retirement',()=>{
 for(const [name,retire]of Object.entries({...retirements,dispatcher:f=>{f.ui.ctrEffect={};},effectsPending:f=>{f.ui.ctrEffect.destroyed=true;}})){
  const f=fixture();f.actor.addBuff(f.I.KinghtFallEnemyBuffType.DamageCut,{subNum:.2,time:2});assert.equal(f.requests.length,1);retire(f);const effect=f.effect();f.requests[0](effect);assert.equal(effect.parent,null,name);assert.deepEqual(f.returned,[effect],name);
 }
});
test('valid synchronous and delayed statuses retain data, lifetime and owned artwork cleanup',()=>{
 for(const synchronous of [false,true]){
  const f=fixture(),effect=f.effect(),input={subNum:.2,time:-1,future:{retain:true}};if(synchronous)f.ui.ctrEffect.onBuff=(_asset,_pool,callback)=>callback(effect);
  f.actor.addBuff(f.I.KinghtFallEnemyBuffType.DamageCut,input);assert.equal(f.actor.debuffInfo.length,1);assert.equal(f.actor.debuffInfo[0].data,input);assert.equal(f.actor.debuffInfo[0].timeMax,-1);if(!synchronous)f.requests[0](effect);assert.equal(effect.parent,f.actor.ndEffect);assert.equal(f.actor.debuffInfo[0].node,effect);f.actor.delBuffIdx(0);assert.deepEqual(f.returned,[effect]);assert.equal(f.actor.debuffInfo.length,0);
 }
});
test('missing optional status artwork does not prevent a valid gameplay status',()=>{
 const f=fixture();f.ui.ctrEffect.destroyed=true;f.actor.addBuff(f.I.KinghtFallEnemyBuffType.DamageCut,{subNum:.2,time:2});assert.equal(f.actor.debuffInfo.length,1);assert.equal(f.requests.length,0);
});
