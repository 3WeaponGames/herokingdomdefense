'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {environment,Node}=require('../navigation/runtime-harness.cjs');
function fixture(){
 const e=environment(),returned=[];let onFree=null,checkout=null;
 function detach(node){if(node.parent){const parent=node.parent,index=parent.children.indexOf(node);if(index>=0)parent.children.splice(index,1);node.parent=null;}}
 e.stubs.PoolMgr={PoolMgr:{getInstance:()=>({freeNode(_pool,node){returned.push(node);detach(node);if(onFree)onFree(node);}})}};
 const ui=e.stubs.KinghtFallUIGame.default.instance;
 function effect(){const node=new Node('effect');node.getComponentInChildren=()=>({setAnimation(){}});node.removeFromParent=()=>detach(node);return node;}
 ui.ctrEffect.onBuff=(_asset,_pool,callback)=>{const node=checkout||effect();checkout=null;callback(node);};
 const I=e.load('KinghtFallInterface'),actor=new I.KinghtFallInterface();Object.assign(actor,{node:new Node('actor'),ndEffect:new Node('effects'),hp:100,hpMax:100,isDead:()=>false});actor.node._combatGeneration=1;e.cc.Color={WHITE:{white:true}};
 function add(){actor.addBuff(I.KinghtFallEnemyBuffType.DamageCut,{subNum:.2,time:1});return actor.debuffInfo.at(-1);}
 return{e,I,actor,add,effect,returned,onFree:callback=>{onFree=callback;},checkout:node=>{checkout=node;}};
}
test('indexed status cleanup removes its original record before pool callbacks and retains replacement statuses',()=>{
 const f=fixture(),old=f.add(),replacement={type:2,data:{future:true}};f.onFree(()=>{f.actor.node._combatGeneration++;f.actor.debuffInfo=[replacement];});f.actor.delBuffIdx(0);assert.deepEqual([...f.actor.debuffInfo],[replacement]);assert.equal(old.node,null);assert.equal(f.returned.length,1);
});
test('type cleanup stops its old iterator when a pool callback replaces the status lifetime',()=>{
 const f=fixture();f.add();f.add();const replacement={type:2,data:{future:true}};f.onFree(()=>{f.actor.node._combatGeneration++;f.actor.debuffInfo=[replacement];});f.actor.delBuff(2);assert.deepEqual([...f.actor.debuffInfo],[replacement]);assert.equal(f.returned.length,1);
});
test('type cleanup snapshots original records and never consumes same-list reentrant additions',()=>{
 const f=fixture();f.add();f.add();const replacements=[];f.onFree(()=>{assert(f.returned.length<=2,'Cleanup consumed a reentrant status');replacements.push(f.add());});f.actor.delBuff(2);assert.equal(f.returned.length,2);assert.deepEqual([...f.actor.debuffInfo],replacements);for(const record of replacements)assert.equal(record.node.parent,f.actor.ndEffect);
});
test('full cleanup preserves status artwork synchronously rechecked out by a pool callback',()=>{
 const f=fixture(),old=f.add(),node=old.node;let replacement;f.onFree(returned=>{f.onFree(null);f.checkout(returned);replacement=f.add();});f.actor.delAllBuff();assert.deepEqual([...f.actor.debuffInfo],[replacement]);assert.equal(replacement.node,node);assert.equal(node.parent,f.actor.ndEffect);assert.equal(node._statusBuffOwner,replacement);assert.equal(f.returned.length,1);
});
test('full cleanup cannot detach replacement effects or reset a replacement body after recycling',()=>{
 const f=fixture();f.add();let replacement,body;f.actor.body={color:'old'};f.onFree(()=>{f.onFree(null);f.actor.node._combatGeneration++;f.actor.debuffInfo=[];f.actor.ndEffect=new Node('replacement effects');body=f.actor.body={color:'new'};replacement=f.add();});f.actor.delAllBuff();assert.deepEqual([...f.actor.debuffInfo],[replacement]);assert.equal(replacement.node.parent,f.actor.ndEffect);assert.equal(body.color,'new');assert.equal(f.returned.length,1);
});
test('a stale status record cannot return an effect already owned by another checkout',()=>{
 const f=fixture(),old=f.add(),node=old.node;f.checkout(node);const replacement=f.add();f.actor.delBuffIdx(0);assert.equal(old.node,null);assert.deepEqual(f.returned,[]);assert.equal(node.parent,f.actor.ndEffect);assert.equal(node._statusBuffOwner,replacement);f.actor.delBuffIdx(0);assert.deepEqual(f.returned,[node]);
});
test('healing cleanup snapshots old release callbacks and preserves reentrant additions',()=>{
 const f=fixture(),calls=[],next=()=>calls.push('replacement'),first=()=>{calls.push('first');f.actor._healingEffects.delete(first);f.actor._healingEffects.add(next);},second=()=>{calls.push('second');f.actor._healingEffects.delete(second);};f.actor._healingEffects=new Set([first,second]);f.actor.releaseHealingEffects();assert.deepEqual(calls,['first','second']);assert.deepEqual([...f.actor._healingEffects],[next]);
});
test('normal full cleanup returns all owned nodes, restores white tint and removes old unowned children',()=>{
 const f=fixture();f.actor.body={color:'tinted'};f.add();f.add();const unowned=f.effect();unowned.setParent(f.actor.ndEffect);f.actor.delAllBuff();assert.equal(f.actor.debuffInfo.length,0);assert.equal(f.returned.length,2);assert.equal(f.actor.ndEffect.children.length,0);assert.equal(f.actor.body.color,f.e.cc.Color.WHITE);f.actor.delAllBuff();assert.equal(f.returned.length,2);
});
