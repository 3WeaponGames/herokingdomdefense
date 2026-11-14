'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {environment,Node}=require('../navigation/runtime-harness.cjs');
function fixture(kind){
 const e=environment();let recycle=null;const returned=[];
 e.stubs.PoolMgr={PoolMgr:{getInstance:()=>({freeNode(_pool,node){returned.push(node);if(recycle)recycle();}})}};
 const actor=e.actor(kind),states=e.load('KinghtFallEnemyBase').KinghtFallEnemyStatus;
 actor.node._combatGeneration=1;actor.state=states.Wait;actor.time.Attack=1;
 actor.debuffInfo=[{type:2,time:0,timeMax:.1,node:new Node('expired status')}];actor.bornInfo={nodeIndex:0,pathList:[]};
 e.game._combatEpoch=1;e.game.gameStatus=1;
 return{e,actor,states,returned,onFree:callback=>{recycle=callback;}};
}
test('expired status callbacks cannot advance a recycled actor timer or start a new-incarnation skill',()=>{
 for(const kind of ['KinghtFallEnemyBase','KinghtFallEnemyItem06','KinghtFallEnemyItem09']){
  const f=fixture(kind);let attacks=0,targets=0;f.actor.doAttackStart=()=>attacks++;f.actor.getUpdateTarget=()=>{targets++;return null;};
  f.onFree(()=>{f.actor.node._combatGeneration++;f.actor.time={Attack:2};f.actor.debuffInfo=[];f.actor.state=f.states.Move;f.actor.bornInfo={get nodeIndex(){throw Error('Old frame read replacement route');}};});
  f.actor.onUpdate(.1);assert.equal(f.actor.time.Attack,2,kind);assert.equal(attacks,0,kind);assert.equal(targets,0,kind);
 }
});
test('status cleanup retirement stops the shared timer before rate queries or frame continuation',()=>{
 for(const retire of [f=>f.e.game._combatEpoch++,f=>{f.e.game.gameData={};},f=>{f.e.stubs.KinghtFallUIGame.default.instance.destroyed=true;}]){
  const f=fixture('KinghtFallEnemyItem06');let rates=0,attacks=0;f.actor.getAttSpeed=()=>{rates++;return 1;};f.actor.doAttackStart=()=>attacks++;f.onFree(()=>retire(f));f.actor.onUpdate(.1);assert.equal(f.actor.time.Attack,1);assert.equal(rates,0);assert.equal(attacks,0);
 }
});
test('support scheduling stops its old route frame when the skill callback recycles its source',()=>{
 for(const kind of ['KinghtFallEnemyItem06','KinghtFallEnemyItem09']){
  const f=fixture(kind);f.actor.debuffInfo=[];let starts=0;f.actor.doAttackStart=()=>{starts++;f.actor.node._combatGeneration++;f.actor.time={Attack:7};f.actor.state=f.states.Move;f.actor.bornInfo={get nodeIndex(){throw Error('Old skill frame read replacement route');}};};f.actor.onUpdate(.1);assert.equal(starts,1);assert.equal(f.actor.time.Attack,7);
 }
});
test('valid status timers retain permanent effects, expiry and the attack waiting sentinel',()=>{
 const f=fixture('KinghtFallEnemyItem06'),a=f.actor;let rates=0;a.getAttSpeed=()=>{rates++;return 2;};a.debuffInfo=[{type:1,time:0,timeMax:-1},{type:1,time:0,timeMax:.2}];a.time.Attack=-1;
 a.updateCombatTimers(.1);assert.equal(rates,0);assert.equal(a.time.Attack,-1);assert.equal(a.debuffInfo.length,2);a.time.Attack=0;a.updateCombatTimers(.1);assert.equal(rates,1);assert.equal(a.time.Attack,.2);assert.equal(a.debuffInfo.length,1);assert.equal(a.debuffInfo[0].time,0);assert.equal(a.state,f.states.Wait);
});
