'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture:earnedFixture,method,node}=require('./global-ad-fixture.cjs');
function fixture(){
 const f=earnedFixture('currency'),ui=f.ui,player=f.player,game=player.gameData,closed=[];
 game.setLevelInfo(1,1,0);const settlement=game.beginSettlement([{id:2001,num:125}],1,0,true);
 const original={node:node('original game UI'),_resourceGeneration:4,isclose:false,ctrGame:{_combatEpoch:12,gameData:{}}},stack=new Map([[99,original]]);
 const manager={getUIById:id=>stack.get(id),closeUI(target){closed.push(target);if(target===original.node)original.isclose=true;}};
 manager.uistatck=stack;manager.closeById=method('UIMgr','closeById',{$z1LogMgr:{LogMgr:{getInstance:()=>({debug(){}})}}});
 f.scope.$z1UIMgr={UIMgr:{getInstance:()=>manager}};f.scope.$z1Config={UIID:{UINONE:0}};
 Object.assign(ui,{settlement,finished:false,adPending:false,fromId:99,btnBreak:node('continue'),btnNewGame:node('new game')});
 method('KinghtFallUIGameEnd','initBtnEvent',f.scope).call(ui);
 return{...f,resultClosed:f.closed,game,settlement,original,stack,closed,trigger:()=>ui.btnVideo.events.touch(),continue:()=>ui.btnBreak.events.touch(),success:()=>f.pending[0].success(),cancel:()=>f.pending[0].cancel(),gold:()=>player.udata.getGoldNum()};
}
test('current victory double completes once and closes only its original game and result',()=>{
 const f=fixture();f.trigger();f.trigger();f.continue();assert.equal(f.pending.length,1);assert.equal(f.gold(),125);f.success();f.success();f.cancel();
 assert.equal(f.gold(),250);assert.deepEqual(f.closed,[f.original.node]);assert.equal(f.resultClosed.length,1);assert.equal(f.ui.finished,true);assert.equal(f.timers.size,0);assert.equal(f.tracking.length,2);
});
for(const retired of ['close','actual SDK destruction'])test('earned victory remains eligible after result '+retired+' without closing a replacement game',()=>{
 const f=fixture();f.trigger();const replacement={node:node('replacement game UI'),isclose:false};f.stack.set(99,replacement);if(retired==='close'){f.ui.isclose=true;f.ui._resourceGeneration++;}else f.destroy();
 assert.doesNotThrow(f.success);f.success();assert.equal(f.gold(),250);assert.equal(f.closed.length,0);assert.equal(f.resultClosed.length,0);assert.equal(replacement.isclose,false);assert.equal(f.timers.size,0);assert.equal(f.tracking.length,2);
});
test('a live result cannot close a new game UI registered under the original shared ID',()=>{
 const f=fixture();f.trigger();const replacement={node:node('replacement game UI'),isclose:false};f.stack.set(99,replacement);f.success();assert.equal(f.gold(),250);assert.equal(f.closed.length,0);assert.equal(f.ui.isclose,true);assert.equal(replacement.isclose,false);
});
test('same UI/component identity with a new combat epoch is also preserved',()=>{
 const f=fixture();f.trigger();f.original.ctrGame._combatEpoch++;f.success();assert.equal(f.gold(),250);assert.equal(f.closed.length,0);assert.equal(f.original.isclose,false);assert.equal(f.ui.isclose,true);
});
test('receipt inputs are immutable across result rebinding and actual destruction',()=>{
 const f=fixture();f.trigger();f.ui.settlement.rewards[0].num=9000;f.ui.settlement={id:'replacement',rewards:[]};f.destroy();f.success();assert.equal(f.gold(),250);assert.equal(f.timers.size,0);
});
for(const boundary of ['gameData','udata','missionData'])test('earned victory retries a failed '+boundary+' save after actual SDK destruction without another ad or duplicate payout',()=>{
 const f=fixture();f.trigger();f.destroy();f.state.failKeys.add(f.player[boundary].gameKey);f.success();assert.equal(f.timers.size,1);const first=f.gold();f.tick();assert.equal(f.gold(),first);assert.equal(f.pending.length,1);
 f.state.failKeys.clear();f.tick();f.tick();f.success();assert.equal(f.gold(),250);assert.equal(f.timers.size,0);assert.equal(f.tracking.length,2);assert.equal(f.closed.length,0);
});
test('a newer saved run makes the earned request terminal without tracking, payout or presentation',()=>{
 const f=fixture();f.trigger();f.game.setLevelInfo(2,3,42);f.game.saveData();const before=f.persist();f.success();f.success();assert.equal(f.gold(),125);assert.equal(f.timers.size,0);assert.equal(f.tracking.length,0);assert.equal(f.closed.length,0);assert.equal(f.ui.adPending,false);assert.deepEqual(f.persist(),before);
});
test('a different current receipt makes the earned request terminal',()=>{
 const f=fixture();f.trigger();f.player.udata.data.battleSettlement={id:'newer receipt',multiplier:1};f.success();assert.equal(f.gold(),125);assert.equal(f.timers.size,0);assert.equal(f.tracking.length,0);assert.equal(f.ui.adPending,false);
});
test('a different current pending settlement is terminal even when its initial save failed before replacing the old receipt',()=>{
 const f=fixture();f.trigger();f.state.failKeys.add(f.game.gameKey);
 f.game.beginSettlement([{id:2001,num:300}],2,0,true);
 const pending=f.game.data.pendingSettlement;assert(pending&&pending.id!==f.settlement.id);assert.equal(f.player.udata.data.battleSettlement.id,f.settlement.id);
 f.success();assert.equal(f.gold(),125);assert.equal(f.timers.size,0);assert.equal(f.tracking.length,0);assert.equal(f.ui.adPending,false);assert.equal(f.game.data.pendingSettlement,pending);
});
test('a settlement cleanup callback starting another battle cannot close its retained UI',()=>{
 const f=fixture();f.trigger();const events=f.modules.EventMgr.EventMgr.getInstance(),emit=events.emit;let changed=false;events.emit=(...args)=>{emit(...args);if(!changed){changed=true;f.original.ctrGame._combatEpoch++;f.game.setLevelInfo(2,1,7);f.game.saveData();}};
 f.success();assert.equal(f.gold(),250);assert.equal(f.closed.length,0);assert.equal(f.original.isclose,false);assert.equal(f.game.hasSave(2),true);f.tick();assert.equal(f.gold(),250);
});
test('cancelled unearned offer releases its UI pending state and permits a new SDK request',()=>{
 const f=fixture();f.trigger();f.cancel();assert.equal(f.ui.adPending,false);assert.equal(f.timers.size,0);assert.equal(f.gold(),125);f.trigger();assert.equal(f.pending.length,2);f.pending[1].success();assert.equal(f.gold(),250);
});
test('Continue preserves a replacement by shared ID even without a pending ad',()=>{
 const f=fixture();const replacement={node:node('replacement game UI')};f.stack.set(99,replacement);f.continue();assert.equal(f.closed.length,0);assert.equal(f.ui.isclose,true);
});
