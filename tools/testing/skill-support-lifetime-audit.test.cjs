'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,Node}=require('./backend-gameplay-harness.cjs');
function fixture(kind){
 const h=setup(),hits=[],requests=[],freed=[];let sound=null,track=null;
 h.g.gameStatus=h.e.stubs.KinghtFallModle.KinghtFallGameStage.Fight;h.g._combatEpoch=1;
 h.e.stubs.BattleSounds={attack(){if(sound)sound();}};
 const pool={freeNode:(_pool,node)=>freed.push(node)};h.e.stubs.PoolMgr={PoolMgr:{getInstance:()=>pool}};
 const Support=h.load(kind).default,support=new Support();
 Object.assign(support,{node:new Node('support',h.g.ndMain),uuid:'support',hp:100,hpMax:100,isDead:()=>false,cfg:{Data:kind.endsWith('06')?[.25,2,200,2]:[.1,200,2]},vec2_1:h.e.cc.v2(),vec2_2:h.e.cc.v2(),time:{Attack:0}});support.node._combatGeneration=1;
 h.ui.ctrEffect.onMoveTrack=()=>{if(track)track();};h.ui.ctrEffect.onBuff=(_asset,_pool,callback)=>requests.push(callback);
 function target(x){const node=new Node('target-'+x,h.g.ndMain,x,0);node._combatGeneration=1;return{uuid:node.name,node,ndEffect:new Node('effects',node),hp:50,hpMax:100,isDead:()=>false,addBuff(type,data){hits.push({target:this,type,data});},addHpPro(value){hits.push({target:this,value});}};}
 const first=target(10),later=target(20);h.d.enemyList=[later,first];
 function effect(){const node=new Node('healing'),skeleton={setCompleteListener(value){this.complete=value;},setAnimation(){}};node.getComponentInChildren=()=>skeleton;return node;}
 return{h,support,first,later,hits,requests,freed,target,effect,onSound:callback=>{sound=callback;},onTrack:callback=>{track=callback;}};
}
for(const kind of ['KinghtFallEnemyItem06','KinghtFallEnemyItem09']){
 const method=kind.endsWith('06')?'addBuff':'addHpPro';
 test(kind+' retains nearest-first selection, radius, count and authored values',()=>{
  const f=fixture(kind),outside=f.target(201);f.h.d.enemyList.unshift(outside);f.support.doAttack();assert.deepEqual(f.hits.map(hit=>hit.target),[f.first,f.later]);assert.equal(f.support.tagUse,true);
  if(method==='addBuff')assert.deepEqual(JSON.parse(JSON.stringify(f.hits[0].data)),{addSpeed:.25,time:2});else assert.equal(f.hits[0].value,.1);
 });
 test(kind+' skips later snapshot recipients recycled or replaced by an earlier callback',()=>{
  for(const replace of [target=>target.node._combatGeneration++,target=>{const node=new Node('replacement',target.node.parent,20,0);node._combatGeneration=target.node._combatGeneration;target.node=node;},target=>{target._isPooled=true;}]){
   const f=fixture(kind),apply=f.first[method];f.first[method]=function(...args){apply.apply(this,args);replace(f.later);};f.support.doAttack();assert.deepEqual(f.hits.map(hit=>hit.target),[f.first]);
  }
 });
 test(kind+' cancels after sound retirement and between recipient callbacks',()=>{
  const retirements=[f=>f.support.node._combatGeneration++,f=>{f.support.time={Attack:99};},f=>f.h.g._combatEpoch++,f=>{f.h.g.gameData={};},f=>{f.h.g.gameStatus=-1;},f=>{f.h.ui.isclose=true;},f=>{f.h.ui.destroyed=true;}];
  for(const retire of retirements){
   const before=fixture(kind);before.onSound(()=>retire(before));before.support.doAttack();assert.equal(before.hits.length,0);
   const during=fixture(kind),apply=during.first[method];during.first[method]=function(...args){apply.apply(this,args);retire(during);};during.support.doAttack();assert.deepEqual(during.hits.map(hit=>hit.target),[during.first]);assert.equal(during.support.tagUse,false);
  }
 });
}
test('healing pulse stops if its launch presentation retires the battle',()=>{
 const f=fixture('KinghtFallEnemyItem09');f.onTrack(()=>f.h.g._combatEpoch++);f.support.doAttack();assert.equal(f.hits.length,0);assert.equal(f.requests.length,0);
});
test('pending destruction of the healing controller cancels the pulse and returns queued artwork',()=>{
 const before=fixture('KinghtFallEnemyItem09');before.onTrack(()=>{before.h.ui.ctrEffect.destroyed=true;});before.support.doAttack();assert.equal(before.hits.length,0);assert.equal(before.requests.length,0);
 const after=fixture('KinghtFallEnemyItem09');after.h.d.enemyList=[after.first];after.support.doAttack();after.h.ui.ctrEffect.destroyed=true;const effect=after.effect();after.requests[0](effect);assert.equal(effect.parent,null);assert.deepEqual(after.freed,[effect]);
});
test('healing callback cannot issue VFX for a recycled recipient or retired battle',()=>{
 for(const retire of [f=>f.first.node._combatGeneration++,f=>f.h.g._combatEpoch++]){const f=fixture('KinghtFallEnemyItem09');f.h.d.enemyList=[f.first];f.first.addHpPro=()=>retire(f);f.support.doAttack();assert.equal(f.requests.length,0);}
});
test('queued healing artwork returns to its pool after recipient, support or battle retirement',()=>{
 const retirements=[f=>f.first.node._combatGeneration++,f=>{f.first._isPooled=true;},f=>f.support.node._combatGeneration++,f=>{f.support._isPooled=true;},f=>f.h.g._combatEpoch++,f=>{f.h.g.gameData={};},f=>{f.h.g.gameStatus=-1;},f=>{f.h.ui.isclose=true;},f=>{f.h.ui.destroyed=true;}];
 for(const retire of retirements){const f=fixture('KinghtFallEnemyItem09');f.h.d.enemyList=[f.first];f.support.doAttack();assert.equal(f.requests.length,1);retire(f);const effect=f.effect();f.requests[0](effect);assert.equal(effect.parent,null);assert.deepEqual(f.freed,[effect]);assert.equal(f.first._healingEffects,undefined);}
});
test('current healing artwork attaches once and stale completion cannot return a reused node twice',()=>{
 const f=fixture('KinghtFallEnemyItem09');f.h.d.enemyList=[f.first];f.support.doAttack();const effect=f.effect();f.requests[0](effect);assert.equal(effect.parent,f.first.ndEffect);assert.equal(f.first._healingEffects.size,1);const complete=effect.getComponentInChildren().complete;complete();complete();assert.deepEqual(f.freed,[effect]);assert.equal(f.first._healingEffects.size,0);
});
