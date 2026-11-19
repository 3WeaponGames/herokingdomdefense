'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,config}=require('./persistence-harness.cjs');
const rules=require('../../assets/_script/GAD_RewardRules');
const settings=require('../../assets/gad_configs/GameJsonCfg.json').wallDefenseRewards;
function settle(h,id,sequence=1){const result=rules.createResult({id:'admission-test-'+sequence,sequence,endReason:'return-home',activeMilliseconds:0,clearedWaves:0},settings,config.TreasureCfg,[],()=>0);result.admissionId=id;return h.player.settleWallDefense(result);}
test('Campaign costs 5 energy while Wall Defense retains its separate 10 energy admission',()=>{
 assert.equal(Number(config.ParameterCfg['60010'].Value),5);
 assert.equal(require('../../assets/_script/GAD_Configs').GADConfig.EnergyCost,10);
});

test('the Wall Defense button stays gray and tappable with Coming soon while entry is unavailable',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),exports={};
 const gad=require('../../assets/_script/GAD_Configs'),label={string:''},caption={string:''};
 const catalog=require('../../assets/resources/localization/catalog.json');
 const sprite={setMaterial(index,material){assert.equal(index,0);this.material=material;}}, button={}, title={};
 const graphics={clear(){},roundRect(){},fill(){}};
 const cc={Sprite:'sprite',Button:'button',Graphics:'graphics',Label:'label',color:s=>s,Material:{getBuiltinMaterial:s=>s}};
 const cost={getComponent:type=>type===cc.Graphics?graphics:null,getChildByName:()=>({getComponent:()=>label})};
 const defense={getComponent:type=>type===cc.Sprite?sprite:button,getChildByName:name=>name==='Layout'?cost:title};
 const modules={GAD_Configs:{...gad},LanguageMgr:{LanguageMgr:{getInstance:()=>({bindLabel(target,key){target.string=catalog.entries[key].en;}})}}};
 const context={exports,require:name=>modules[name],cc};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HomeLobbyLayout.js'),'utf8'),context);
 const defenseCaption={getComponent:()=>caption},home={costEnergy:5,_lobby:{defense,defenseCaption}};
 for(const unlocked of [false,true]){
  exports.modeState(home,unlocked,12,4);
  assert.equal(sprite.material,'2d-gray-sprite');assert.equal(defenseCaption.active,true);
  assert.equal(caption.string,'Coming soon');assert.equal(button.interactable,true);
  assert.equal(cost.active,false);assert.equal(title.y,0);
 }
 modules.GAD_Configs.GADConfig={...gad.GADConfig,LobbyAvailable:true};
 exports.modeState(home,true,12,4);
 assert.equal(sprite.material,'2d-sprite');assert.equal(cost.active,true);
 assert.equal(label.string,'10');
});
test('Wall Defense charges once, retains an unused entry through reload, and consumes it at settlement',()=>{
 const h=harness(),u=h.player.udata;
 u.data.powerNum=30;u.saveData();const before=u.getPowerNum();assert.equal(before,30);
 const id=h.player.admitWallDefense(10,()=>true);assert.equal(typeof id,'string');assert.equal(u.getPowerNum(),20);
 assert.equal(h.player.admitWallDefense(10,()=>true),id);assert.equal(u.getPowerNum(),20);
 const reboot=harness(h.persist());assert.equal(reboot.player.admitWallDefense(10,()=>true),id);assert.equal(reboot.player.udata.getPowerNum(),20);
 assert(settle(reboot,id));assert.equal(reboot.player.udata.data.wallDefenseAdmission.used,true);
 const next=reboot.player.admitWallDefense(10,()=>true);assert.notEqual(next,id);assert.equal(reboot.player.udata.getPowerNum(),10);
});
test('locked, cancelled and unaffordable Wall Defense admissions do not debit energy',()=>{
 const h=harness(),u=h.player.udata;const before=u.getPowerNum();
 assert.equal(h.player.admitWallDefense(10,()=>false),null);assert.equal(u.getPowerNum(),before);
 u.data.powerNum=9;assert.equal(h.player.admitWallDefense(10,()=>true),null);assert.equal(u.getPowerNum(),9);assert.equal(u.data.wallDefenseAdmission,undefined);
});
test('a failed entry save can be retried without a duplicate energy debit',()=>{
 const h=harness(),u=h.player.udata;u.data.powerNum=30;u.saveData();
 h.state.failAll=true;assert.equal(h.player.admitWallDefense(10,()=>true),null);
 h.state.failAll=false;const id=h.player.admitWallDefense(10,()=>true);assert(id);assert.equal(u.getPowerNum(),20);
 assert.equal(harness(h.persist()).player.udata.getPowerNum(),20);
});

function boundaryResult(sequence,id='boundary-'+sequence){
 return rules.createResult({id,sequence,endReason:'return-home',activeMilliseconds:0,clearedWaves:0},settings,config.TreasureCfg,[],()=>0);
}
function boundaryReceipt(sequence){
 const result=boundaryResult(sequence);result.futureResult={preserve:'result'};
 return {id:result.id,sequence,result,awarded:[],unlockedGoods:[],futureReceipt:{preserve:'receipt'}};
}
function boundaryRuntime(h){
 h.modules.GAD_Configs=require('../../assets/_script/GAD_Configs');
 h.modules.GAD_DataMgr={default:{getInstance:()=>({data:{wallDefenseRewards:settings}})}};
 h.modules.GAD_UserData={default:function(){}};
 h.modules.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfg=()=>config.TreasureCfg;
 return h.load('GAD_PlayerMgr').default.getInstance();
}
function savedBoundary(sequence,reserved=false){
 const h=harness(),u=h.player.udata;
 u.data.powerNum=30;u.data.futureField={preserve:['player',7]};
 u.data.wallDefenseReceipt=boundaryReceipt(sequence);
 if(reserved)u.data.wallDefenseAdmission={id:'retained-paid-entry',cost:10,used:false,futureAdmission:{preserve:true}};
 assert.equal(u.saveData(),true);
 const reload=harness(h.persist());
 assert.equal(reload.player.udata.data.wallDefenseReceipt.sequence,sequence,'actual record validator accepts the saved receipt');
 return reload;
}

test('accepted terminal Wall Defense receipts cannot start another run, without rewriting saved state',()=>{
 for(const sequence of [Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1]){
  const h=savedBoundary(sequence),run=boundaryRuntime(h),before=JSON.stringify(h.player.udata.data),saved=h.persist(),writes=h.state.writes;
  assert.equal(run.readyForRun(),false);
  assert.equal(JSON.stringify(h.player.udata.data),before);assert.deepEqual(h.persist(),saved);assert.equal(h.state.writes,writes);
 }
});

test('terminal Wall Defense admission neither charges Energy nor consumes an existing unused entry',()=>{
 for(const sequence of [Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1])for(const reserved of [false,true]){
  const h=savedBoundary(sequence,reserved),before=JSON.stringify(h.player.udata.data),saved=h.persist(),writes=h.state.writes;
  assert.equal(h.player.admitWallDefense(10,()=>true),null);
  assert.equal(h.player.udata.getPowerNum(),30);assert.equal(JSON.stringify(h.player.udata.data),before);
  assert.deepEqual(h.persist(),saved);assert.equal(h.state.writes,writes);
 }
});

test('the last safe Wall Defense successor settles normally before further admission stops',()=>{
 const h=savedBoundary(Number.MAX_SAFE_INTEGER-1),run=boundaryRuntime(h);
 assert.equal(run.readyForRun(),true);
 const admission=h.player.admitWallDefense(10,()=>true);assert(admission);assert.equal(h.player.udata.getPowerNum(),20);
 assert.equal(run.beginRun(admission).sequence,Number.MAX_SAFE_INTEGER);
 const result=run.finishRun('return-home');assert.equal(result.saved,true);
 assert.equal(h.player.udata.data.wallDefenseAdmission.used,true);
 assert.deepEqual(cloneBoundary(h.player.udata.data.futureField),{preserve:['player',7]});
 const before=JSON.stringify(h.player.udata.data),saved=h.persist();
 assert.equal(run.readyForRun(),false);assert.equal(h.player.admitWallDefense(10,()=>true),null);
 assert.equal(JSON.stringify(h.player.udata.data),before);assert.deepEqual(h.persist(),saved);
});

function cloneBoundary(value){return JSON.parse(JSON.stringify(value));}

test('Wall Defense readiness recovers an already-earned terminal result before blocking the next run',()=>{
 const h=savedBoundary(Number.MAX_SAFE_INTEGER-1),run=boundaryRuntime(h),pending=boundaryResult(Number.MAX_SAFE_INTEGER,'earned-last-result');
 h.player.udata.data.wallDefensePending=pending;assert.equal(h.player.udata.saveData(),true);
 h.state.failKeys.add(h.player.udata.gameKey);
 assert.equal(run.readyForRun(),false);assert.equal(h.player.udata.data.wallDefenseReceipt.sequence,Number.MAX_SAFE_INTEGER-1);
 assert.equal(h.player.udata.data.wallDefensePending.id,pending.id);
 h.state.failKeys.clear();assert.equal(run.readyForRun(),false);
 assert.equal(h.player.udata.data.wallDefenseReceipt.id,pending.id);assert.equal(h.player.udata.data.wallDefensePending,undefined);
 assert.equal(h.player.udata.getPowerNum(),30);assert.equal(h.player.pendingRewardJournal,null);
 const before=JSON.stringify(h.player.udata.data),saved=h.persist();
 assert.equal(run.readyForRun(),false);assert.equal(JSON.stringify(h.player.udata.data),before);assert.deepEqual(h.persist(),saved);
});

test('paid admission checks the receipt installed by actual pending journal recovery',()=>{
 const h=savedBoundary(Number.MAX_SAFE_INTEGER-1);
 h.state.failKeys.add(h.player.udata.gameKey);
 assert.equal(h.player.transact(()=>{h.player.udata.data.wallDefenseReceipt=boundaryReceipt(Number.MAX_SAFE_INTEGER);}),null);
 assert(h.player.pendingRewardJournal);assert(h.storage.get(h.player.rewardJournalKey()));
 const reload=harness(h.persist());assert.equal(reload.player.udata.data.wallDefenseReceipt.sequence,Number.MAX_SAFE_INTEGER-1);
 assert.equal(reload.player.admitWallDefense(10,()=>true),null);
 assert.equal(reload.player.udata.data.wallDefenseReceipt.sequence,Number.MAX_SAFE_INTEGER);
 assert.equal(reload.player.udata.getPowerNum(),30);assert.equal(reload.player.udata.data.wallDefenseAdmission,undefined);
 assert.equal(reload.player.pendingRewardJournal,null);assert.equal(reload.storage.get(reload.player.rewardJournalKey()),'');
 assert.deepEqual(cloneBoundary(reload.player.udata.data.wallDefenseReceipt.futureReceipt),{preserve:'receipt'});
});

test('staged paid eligibility rejects a terminal settlement that reenters after the initial admission check',()=>{
 const h=savedBoundary(Number.MAX_SAFE_INTEGER-1),purchase=h.player.purchase,terminal=boundaryResult(Number.MAX_SAFE_INTEGER,'reentrant-last-result');
 let reentries=0;
 // Preserve the real purchase/journal path, but deliver one actual settlement
 // at its boundary to exercise the second eligibility check independently.
 h.player.purchase=function(){reentries++;assert(h.player.settleWallDefense(terminal));return purchase.apply(this,arguments);};
 assert.equal(h.player.admitWallDefense(10,()=>true),null);assert.equal(reentries,1);
 assert.equal(h.player.udata.getPowerNum(),30);assert.equal(h.player.udata.data.wallDefenseAdmission,undefined);
 assert.equal(h.player.udata.data.wallDefenseReceipt.id,terminal.id);
 assert.deepEqual(cloneBoundary(h.player.udata.data.futureField),{preserve:['player',7]});
});
