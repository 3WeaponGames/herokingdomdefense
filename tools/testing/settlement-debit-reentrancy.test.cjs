'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const {harness} = require('./persistence-harness.cjs');
function fixture() {
 const h = harness(), event = {};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/EventMgr.js'),'utf8'), {exports:event,console});
 h.modules.EventMgr.EventMgr = event.EventMgr; h.bus = event.EventMgr.getInstance(); return h;
}
function once(h, name, key, callback) { let called=0; const owner={}; h.bus.on(name,owner,info=>{if(called||info.key!==key)return;called++;callback(info);}); return ()=>called; }
function saved(h, record) { const raw=h.storage.get(record.gameKey);return raw ? JSON.parse(raw) : null; }
const currencies=[['goldNum',2001,'subGoldNum','getGoldNum'],['diamondNum',2002,'subDiamondNum','getDiamondNum'],['powerNum',2005,'subPowerNum','getPowerNum']];
for (const [field,id,method,getter] of currencies) {
 test('P3 '+method+': publish failed debit after rollback so nested durable award survives restart',()=>{
  const h=fixture(), user=h.player.udata;user.data[field]=100;assert.equal(user.saveData(),true);h.state.failKeys.add(user.gameKey);
  const called=once(h,'SaveFailed',user.gameKey,()=>{h.state.failKeys.clear();assert.equal(h.player.grantAdRewards([{id,num:20}]),true);});
  assert.equal(user[method](50),false);assert.equal(called(),1);assert.equal(user[getter](),120);
  assert.equal(harness(h.persist()).player.udata[getter](),120);assert.equal(user.localSavePending,false);
 });
}
test('P3 failed debit event observes restored amount and restored power time, once, with no second write',()=>{
 const h=fixture(),u=h.player.udata;u.data.powerNum=100;u.data.powerUpdateTime=17;u.maxPower=100;assert.equal(u.saveData(),true);const before=h.state.writes;h.state.failKeys.add(u.gameKey);
 let event;const called=once(h,'SaveFailed',u.gameKey,()=>{event={amount:u.data.powerNum,time:u.data.powerUpdateTime,pending:u.localSavePending};});
 assert.equal(u.subPowerNum(50),false);assert.equal(called(),1);assert.deepEqual(event,{amount:100,time:17,pending:true});assert.equal(h.state.writes,before);assert.equal(saved(h,u).powerNum,100);
});
test('P3 nested failed debit during outer SaveRecovered flushes once even when outer debit succeeds',()=>{
 const h=fixture(),u=h.player.udata;u.data.goldNum=100;u.data.diamondNum=100;assert.equal(u.saveData(),true);h.state.failKeys.add(u.gameKey);assert.equal(u.saveData(),false);h.state.failKeys.clear();
 let failure;const failed=once(h,'SaveFailed',u.gameKey,()=>{failure={gold:u.data.goldNum,diamond:u.data.diamondNum,pending:u.localSavePending};});
 const recovered=once(h,'SaveRecovered',u.gameKey,()=>{h.state.failKeys.add(u.gameKey);assert.equal(u.subDiamondNum(50),false);});
 assert.equal(u.subGoldNum(25),true);assert.equal(recovered(),1);assert.equal(failed(),1);assert.deepEqual(failure,{gold:75,diamond:100,pending:true});
 assert.equal(u._debitSaveDepth||0,0);assert.equal(harness(h.persist()).player.udata.getGoldNum(),75);assert.equal(harness(h.persist()).player.udata.getDiamondNum(),100);
});
test('P3 ordinary successful debit keeps one write and one currency refresh',()=>{
 const h=fixture(),u=h.player.udata;u.data.goldNum=100;assert.equal(u.saveData(),true);const before=h.state.writes;let failure=0;h.bus.on('SaveFailed',{},()=>failure++);
 assert.equal(u.subGoldNum(25),true);assert.equal(h.state.writes,before+1);assert.equal(failure,0);assert.equal(u.getGoldNum(),75);assert.equal(harness(h.persist()).player.udata.getGoldNum(),75);
});
for(const target of ['udata','missionData','gameData']) {
 test('P2 '+target+' SaveRecovered: nested A completes then durable pending B survives older A tail',()=>{
  const h=fixture(),p=h.player,g=p.gameData;h.state.failKeys.add(p[target].gameKey);const first=g.beginSettlement([{id:2001,num:10}],1,1,true);h.state.failKeys.clear();let second;
  const called=once(h,'SaveRecovered',p[target].gameKey,()=>{assert.equal(g.completeSettlement(first),true);h.state.failKeys.add(p.udata.gameKey);second=g.beginSettlement([{id:2002,num:20}],2,1,true);assert.equal(saved(h,g).pendingSettlement.id,second.id);});
  assert.equal(g.completeSettlement(first),false);assert.equal(called(),1);assert.equal(g.data.pendingSettlement.id,second.id);assert.equal(saved(h,g).pendingSettlement.id,second.id);
  const re=harness(h.persist());assert.equal(re.player.gameData.completeSettlement(re.player.gameData.data.pendingSettlement),true);assert.equal(re.player.udata.getDiamondNum(),20);
 });
}
test('P2 same-A recursive completion succeeds without duplicate reward',()=>{
 const h=fixture(),p=h.player,g=p.gameData;h.state.failKeys.add(p.udata.gameKey);const first=g.beginSettlement([{id:2001,num:10}],1,1,true);h.state.failKeys.clear();
 const called=once(h,'SaveRecovered',p.udata.gameKey,()=>assert.equal(g.completeSettlement(first),true));assert.equal(g.completeSettlement(first),true);assert.equal(called(),1);assert.equal(g.data.pendingSettlement,undefined);assert.equal(p.udata.getGoldNum(),10);assert.equal(harness(h.persist()).player.udata.getGoldNum(),10);
});
test('P2 legacy original settlement returned by beginSettlement can finish its cloned pending journal',()=>{
 const h=fixture(),p=h.player,g=p.gameData;h.state.failKeys.add(p.udata.gameKey);const original=g.beginSettlement([{id:2001,num:10}],1,1,true);assert.notEqual(original,g.data.pendingSettlement);h.state.failKeys.clear();assert.equal(g.completeSettlement(original),true);assert.equal(p.udata.getGoldNum(),10);assert.equal(g.data.pendingSettlement,undefined);
});
test('P2 nested same-A completion followed by newer active checkpoint preserves that checkpoint',()=>{
 const h=fixture(),p=h.player,g=p.gameData;h.state.failKeys.add(p.udata.gameKey);const first=g.beginSettlement([{id:2001,num:10}],1,1,true);h.state.failKeys.clear();
 const called=once(h,'SaveRecovered',p.udata.gameKey,()=>{assert.equal(g.completeSettlement(first),true);assert.equal(g.setCheckpoint({levelNum:2,roundNum:3,coin:777}),true);});
 assert.equal(g.completeSettlement(first),true);assert.equal(called(),1);assert.equal(g.data.levelNum,2);assert.equal(g.data.roundNum,3);assert.equal(g.data.coin,777);const re=harness(h.persist());assert.equal(re.player.gameData.data.levelNum,2);assert.equal(re.player.gameData.data.coin,777);
});
test('P2 failed cleanup callback installs durable B: old rollback cannot reinstall A',()=>{
 const h=fixture(),p=h.player,g=p.gameData;h.state.failKeys.add(p.udata.gameKey);const first=g.beginSettlement([{id:2001,num:10}],1,1,true);h.state.failKeys.clear();let second;
 once(h,'SaveRecovered',p.udata.gameKey,()=>h.state.failKeys.add(g.gameKey));const called=once(h,'SaveFailed',g.gameKey,()=>{h.state.failKeys.clear();h.state.failKeys.add(p.udata.gameKey);second=g.beginSettlement([{id:2002,num:20}],2,1,true);assert.equal(saved(h,g).pendingSettlement.id,second.id);});
 assert.equal(g.completeSettlement(first),false);assert.equal(called(),1);assert.equal(g.data.pendingSettlement.id,second.id);assert.equal(saved(h,g).pendingSettlement.id,second.id);
});
test('P3 nested failed debit fully recovered before outer depth exits does not publish a stale failure afterward',()=>{
 const h=fixture(),u=h.player.udata;u.data.goldNum=100;u.data.diamondNum=100;assert.equal(u.saveData(),true);h.state.failKeys.add(u.gameKey);assert.equal(u.saveData(),false);h.state.failKeys.clear();let failures=0;
 h.bus.on('SaveFailed',{},info=>{if(info.key===u.gameKey)failures++;});
 const recovered=once(h,'SaveRecovered',u.gameKey,()=>{h.state.failKeys.add(u.gameKey);assert.equal(u.subDiamondNum(50),false);h.state.failKeys.clear();assert.equal(u.saveData(),true);});
 assert.equal(u.subGoldNum(25),true);assert.equal(recovered(),1);assert.equal(failures,0);assert.equal(u.localSavePending,false);assert.equal(u._debitSaveDepth||0,0);const re=harness(h.persist());assert.equal(re.player.udata.getGoldNum(),75);assert.equal(re.player.udata.getDiamondNum(),100);
});
test('P2 a replacement journal created during settleBattle initial save keeps its own needs-save flag',()=>{
 const h=fixture(),p=h.player,g=p.gameData;h.state.failKeys.add(g.gameKey);const first=g.beginSettlement([{id:2001,num:10}],1,1,true);h.state.failKeys.clear();let second;
 const called=once(h,'SaveRecovered',g.gameKey,()=>{assert.equal(g.completeSettlement(first),true);h.state.failKeys.add(g.gameKey);second=g.beginSettlement([{id:2002,num:20}],2,1,true);assert.equal(g.pendingSettlementNeedsSave,true);});
 assert.equal(g.settleBattle(first,1),false);assert.equal(called(),1);assert.equal(g.data.pendingSettlement.id,second.id);assert.equal(g.pendingSettlementNeedsSave,true);h.state.failKeys.clear();assert.equal(g.completeSettlement(second),true);assert.equal(harness(h.persist()).player.udata.getDiamondNum(),20);
});
test('P2 obsolete completion cannot apply A over a different pending B',()=>{
 const h=fixture(),p=h.player,g=p.gameData;const first=g.beginSettlement([{id:2001,num:10}],1,1,true);h.state.failKeys.add(p.udata.gameKey);const second=g.beginSettlement([{id:2002,num:20}],2,1,true),pending=g.data.pendingSettlement;h.state.failKeys.clear();
 assert.equal(g.completeSettlement(first),false);assert.equal(g.data.pendingSettlement,pending);assert.equal(saved(h,g).pendingSettlement.id,second.id);assert.equal(g.completeSettlement(second),true);assert.equal(p.udata.getGoldNum(),10);assert.equal(harness(h.persist()).player.udata.getDiamondNum(),20);
});
test('P2 failed cleanup cannot roll back a new active checkpoint saved from the failure callback',()=>{
 const h=fixture(),p=h.player,g=p.gameData;h.state.failKeys.add(p.udata.gameKey);const first=g.beginSettlement([{id:2001,num:10}],1,1,true);h.state.failKeys.clear();
 once(h,'SaveRecovered',p.udata.gameKey,()=>h.state.failKeys.add(g.gameKey));const called=once(h,'SaveFailed',g.gameKey,()=>{h.state.failKeys.clear();assert.equal(g.setCheckpoint({levelNum:2,roundNum:3,coin:777}),true);});
 assert.equal(g.completeSettlement(first),true);assert.equal(called(),1);assert.equal(g.data.levelNum,2);assert.equal(g.data.coin,777);const re=harness(h.persist());assert.equal(re.player.gameData.data.levelNum,2);assert.equal(re.player.gameData.data.coin,777);assert.equal(re.player.udata.getGoldNum(),10);
});
test('P2 ordinary failed cleanup retains its original pending journal for a single durable retry',()=>{
 const h=fixture(),p=h.player,g=p.gameData;h.state.failKeys.add(p.udata.gameKey);const first=g.beginSettlement([{id:2001,num:10}],1,1,true),pending=g.data.pendingSettlement;h.state.failKeys.clear();
 once(h,'SaveRecovered',p.udata.gameKey,()=>h.state.failKeys.add(g.gameKey));assert.equal(g.completeSettlement(first),false);assert.equal(g.data.pendingSettlement,pending);h.state.failKeys.clear();assert.equal(g.completeSettlement(first),true);assert.equal(p.udata.getGoldNum(),10);assert.equal(harness(h.persist()).player.udata.getGoldNum(),10);
});
test('P2 an already completed original settlement is idempotent after a newer checkpoint starts',()=>{
 const h=fixture(),p=h.player,g=p.gameData;const first=g.beginSettlement([{id:2001,num:10}],1,1,true);assert.equal(g.setCheckpoint({levelNum:2,roundNum:3,coin:777}),true);const current=g.data,before=h.state.writes;
 assert.equal(g.completeSettlement(first),true);assert.equal(g.data,current);assert.equal(h.state.writes,before);assert.equal(g.data.coin,777);assert.equal(harness(h.persist()).player.udata.getGoldNum(),10);
});
test('P3 nested failed debit of the same currency cannot refund the successful outer debit',()=>{
 const h=fixture(),u=h.player.udata;u.data.goldNum=100;assert.equal(u.saveData(),true);h.state.failKeys.add(u.gameKey);assert.equal(u.saveData(),false);h.state.failKeys.clear();
 once(h,'SaveRecovered',u.gameKey,()=>{h.state.failKeys.add(u.gameKey);assert.equal(u.subGoldNum(50),false);});const failed=once(h,'SaveFailed',u.gameKey,()=>{assert.equal(u.getGoldNum(),75);h.state.failKeys.clear();assert.equal(h.player.grantAdRewards([{id:2001,num:20}]),true);});
 assert.equal(u.subGoldNum(25),true);assert.equal(failed(),1);assert.equal(u.getGoldNum(),95);assert.equal(harness(h.persist()).player.udata.getGoldNum(),95);assert.equal(u._debitSaveDepth,0);assert.equal(u._debitSaveFailed,false);
});
test('P3 invalid debit inputs perform no writes or failure dispatch',()=>{
 const h=fixture(),u=h.player.udata;u.data.goldNum=u.data.diamondNum=u.data.powerNum=100;assert.equal(u.saveData(),true);const before=h.state.writes;let failures=0;h.bus.on('SaveFailed',{},()=>failures++);
 for(const [, ,method]of currencies)for(const amount of [-1,NaN,Infinity,'5',101])assert.equal(u[method](amount),false);assert.equal(failures,0);assert.equal(h.state.writes,before);assert.equal(u._debitSaveDepth,undefined);
});
test('P3 a throwing failure subscriber sees the refunded balance and cannot strand debit notification ownership',()=>{
 const h=fixture(),u=h.player.udata;u.data.goldNum=100;assert.equal(u.saveData(),true);h.state.failKeys.add(u.gameKey);const owner={},listener=()=>{assert.equal(u.getGoldNum(),100);throw Error('consumer failure');};h.bus.on('SaveFailed',owner,listener);
 assert.throws(()=>u.subGoldNum(25),/consumer failure/);assert.equal(u.getGoldNum(),100);assert.equal(u._debitSaveDepth,0);assert.equal(u._debitSaveFailed,false);h.bus.off('SaveFailed',owner,listener);h.state.failKeys.clear();assert.equal(u.subGoldNum(25),true);assert.equal(harness(h.persist()).player.udata.getGoldNum(),75);
});
for(const method of ['setNewGame','setCheckpoint'])for(const replacement of ['checkpoint','pending settlement']){
 test('P2 '+method+' failed save preserves a newer '+replacement+' installed by its failure subscriber',()=>{
  const h=fixture(),p=h.player,g=p.gameData;assert.equal(g.setCheckpoint({levelNum:1,roundNum:2,coin:111}),true);h.state.failKeys.add(g.gameKey);let installed;
  const called=once(h,'SaveFailed',g.gameKey,()=>{
   h.state.failKeys.clear();
   if(replacement==='checkpoint'){assert.equal(g.setCheckpoint({levelNum:2,roundNum:3,coin:777}),true);installed=g.data;}
   else{h.state.failKeys.add(p.udata.gameKey);g.beginSettlement([{id:2002,num:20}],1,1,true);installed=g.data.pendingSettlement;assert.equal(saved(h,g).pendingSettlement.id,installed.id);}
  });
  const result=method==='setNewGame'?g.setNewGame(1):g.setCheckpoint({levelNum:1,roundNum:4,coin:222});assert.equal(result,false);assert.equal(called(),1);
  if(replacement==='checkpoint'){assert.equal(g.data,installed);assert.equal(g.data.coin,777);assert.equal(g.saveData(),true);const re=harness(h.persist());assert.equal(re.player.gameData.data.levelNum,2);assert.equal(re.player.gameData.data.coin,777);}
  else{assert.equal(g.data.pendingSettlement,installed);assert.equal(g.saveData(),true);assert.equal(saved(h,g).pendingSettlement.id,installed.id);h.state.failKeys.clear();assert.equal(g.completeSettlement(installed),true);assert.equal(harness(h.persist()).player.udata.getDiamondNum(),20);}
 });
}
