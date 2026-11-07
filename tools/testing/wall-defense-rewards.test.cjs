'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),rules=require('../../assets/_script/GAD_RewardRules');
const mode=require('../../assets/gad_configs/GameJsonCfg.json'),{harness,config,clone}=require('./persistence-harness.cjs');
const settings=mode.wallDefenseRewards;
function result(sequence=1,cleared=40,active=600000,random=()=>0,inventory=[]) {
  return rules.createResult({id:'wall-test-'+sequence,sequence,endReason:'wall-destroyed',activeMilliseconds:active,clearedWaves:cleared},settings,config.TreasureCfg,inventory,random);
}
function runtime() {
  const h=harness();let now=0;
  h.globals.performance={now:()=>now};
  h.modules.GAD_Configs={emGADGameState:{Game:1,Pause:2,Over:3}};
  h.modules.GAD_DataMgr={default:{getInstance:()=>({data:mode})}};
  h.modules.GAD_UserData={default:function(){}};
  h.modules.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfg=()=>config.TreasureCfg;
  const player=h.load('GAD_PlayerMgr').default.getInstance();player.beginRun();player.setState(1);
  return {...h,run:player,setTime:value=>{now=value;},advance:ms=>{while(ms>0){const step=Math.min(500,ms);now+=step;player.tickRun();ms-=step;}}};
}

test('Wall Defense pays 5000 gold/5 crystals for ten active minutes and one item every five clears',()=>{
  for(const [waves,drops]of [[0,0],[4,0],[5,1],[9,1],[10,2],[40,8],[100,20]]){
    const r=result(1,waves);assert(rules.validResult(r));assert.equal(r.baseGold,5000);assert.equal(r.crystals,5);assert.equal(r.drops.length,drops);
  }
  assert.equal(result(1,0,119999).crystals,0);assert.equal(result(1,0,120000).crystals,1);
  assert.equal(result(1,0,599999).baseGold,4999);
});
test('rarity percentages sum to 100 and every checkpoint uses its own wave band',()=>{
  settings.rarityBands.forEach(b=>assert(Math.abs(b.weights.reduce((a,b)=>a+b,0)-100)<1e-10));
  const r=result(1,100,0,()=>.999);
  assert.deepEqual(r.drops.map(x=>x.quality),[3,3,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4,4]);
  assert.equal(result(1,5,0,()=>.99995).drops[0].quality,4);
  assert.equal(result(1,20,0,()=>.95).drops[0].quality,2);
});
test('an exhausted low rarity converts within that tier without improving its roll',()=>{
  const owned=config.TreasureCfg.filter(t=>t.Quality===1).map(t=>({id:t.ID,level:t.levelInfo.length,frame:0}));
  const r=result(1,100,0,()=>0,owned);assert(r.drops.every(d=>d.quality===1));
  const h=harness();h.player.udata.data.treasureInfo=owned;const receipt=h.player.settleWallDefense(r);
  assert(receipt);assert.equal(receipt.unlockedGoods.length,0);assert.equal(h.player.udata.getGoldNum(),20*config.TreasureCfg[0].Conversion[1]);
});
test('active clock excludes pauses, background, results and stalled update gaps',()=>{
  const h=runtime();h.advance(60000);h.run.setState(2);h.setTime(240000);h.run.setState(1);h.advance(30000);
  h.run.setRunSuspended(true);h.setTime(500000);h.run.setRunSuspended(false);h.advance(30000);
  assert.equal(h.run._run.activeMilliseconds,120000);
  h.setTime(535000);h.run.tickRun();assert.equal(h.run._run.activeMilliseconds,120000);
  h.run.finishRun('wall-destroyed');h.advance(60000);h.run.setState(1);
  assert.equal(h.run.getState(),3);assert.equal(h.run.getResult().activeMilliseconds,120000);
});

test('short resource pauses and overlapping background pauses never earn time or resume each other',()=>{
  const h=runtime();h.advance(200);h.run.setRunSuspended(true,'resources');h.setTime(450);h.run.setRunSuspended(true);
  h.setTime(500);h.run.setRunSuspended(false,'resources');h.run.tickRun();
  assert.equal(h.run._run.activeMilliseconds,200);assert.equal(h.run._suspended,true);
  h.setTime(600);h.run.setRunSuspended(false);h.advance(200);
  assert.equal(h.run._run.activeMilliseconds,400);
});
test('overlapping spawned waves count only the fully resolved prefix, once',()=>{
  const h=runtime();h.run.registerWave(1,2);h.run.registerWave(2,1);
  const a={_rewardWave:1},b={_rewardWave:1},c={_rewardWave:2};
  h.run.resolveWaveRole(c);assert.equal(h.run._run.clearedWaves,0);
  h.run.resolveWaveRole(a);h.run.resolveWaveRole(a);assert.equal(h.run._run.clearedWaves,0);
  h.run.resolveWaveRole(b);assert.equal(h.run._run.clearedWaves,2);
  h.run.registerWave(3,1);h.run.finishRun('wall-destroyed');h.run.resolveWaveRole({_rewardWave:3});assert.equal(h.run.getResult().clearedWaves,2);
});
test('Wall Defense rewards unlock summon items, then add pieces, without advancing campaign progress',()=>{
  const h=harness(),r=result(1,10);h.player.gameData.setLevelInfo(2,3,42);const campaign=clone(h.player.gameData.data);
  h.player.udata.data.unknownField={preserve:123};
  const receipt=h.player.settleWallDefense(r);assert(receipt);
  const item=h.player.udata.getTreasureLevel(r.drops[0].itemID);assert.equal(item.level,1);assert.equal(item.frame,1);
  assert.equal(h.player.udata.getGoldNum(),5000);assert.equal(h.player.udata.getDiamondNum(),5);assert.equal(h.player.udata.data.wallDefenseBestWave,10);
  assert.deepEqual(clone(h.player.gameData.data),campaign);assert.equal(h.player.udata.getMaxStage(),1);assert.deepEqual(clone(h.player.udata.data.unknownField),{preserve:123});
  h.player.settleWallDefense(r);assert.equal(h.player.udata.getGoldNum(),5000);assert.equal(item.frame,1);
  const reload=harness(h.persist());assert.equal(reload.player.udata.data.wallDefenseBestWave,10);reload.player.settleWallDefense(r);assert.equal(reload.player.udata.getGoldNum(),5000);
});
test('best wave never decreases and stale results cannot overwrite a newer receipt',()=>{
  const h=harness(),first=result(1,29),second=result(2,10);
  h.player.settleWallDefense(first);h.player.settleWallDefense(second);
  assert.equal(h.player.udata.data.wallDefenseBestWave,29);const saved=clone(h.persist());
  assert.equal(h.player.settleWallDefense(first),false);assert.deepEqual(h.persist(),saved);
  h.player.udata.data.wallDefensePending=result(3,30);
  const other=result(3,40);other.id='stale-overlap';assert.equal(h.player.settleWallDefense(other),false);
  assert.equal(h.player.udata.data.wallDefenseReceipt.id,'wall-test-3');assert.equal(h.player.udata.data.wallDefensePending,undefined);
});
test('every Wall Defense settlement write boundary recovers the frozen roll exactly once',()=>{
  const r=result(1,40),baseline=harness();baseline.player.settleWallDefense(r);const writes=baseline.state.writes;
  for(let step=1;step<=writes;step++){
    const h=harness();h.state.crashAt=step;assert.throws(()=>h.player.settleWallDefense(r),/interruption/);
    const reload=harness(h.persist());reload.player.retryRewardRecovery();reload.player.retryRewardRecovery();reload.player.settleWallDefense(r);
    assert.equal(reload.player.udata.getGoldNum(),5000,'gold at boundary '+step);assert.equal(reload.player.udata.getDiamondNum(),5);
    assert.equal(reload.player.udata.data.wallDefenseBestWave,40);assert.deepEqual(clone(reload.player.udata.data.wallDefenseReceipt.result.drops),clone(r.drops));
  }
});
test('failed saves keep an unpaid result for durable retry and no duplicate award',()=>{
  for(const target of ['initial','journal','mission']){
    const h=harness(),r=result();const key=target==='initial'?h.player.udata.gameKey:target==='journal'?h.player.rewardJournalKey():h.player.missionData.gameKey;
    h.state.failKeys.add(key);assert.equal(h.player.settleWallDefense(r),false);
    if(target!=='mission')assert.equal(h.player.udata.getGoldNum(),0);
    h.state.failKeys.clear();h.player.retryRewardRecovery();h.player.retryRewardRecovery();h.player.settleWallDefense(r);
    assert.equal(h.player.udata.getGoldNum(),5000);assert.equal(h.player.udata.data.wallDefenseBestWave,40);
  }
});
test('legacy saves default the high score to zero and quarantine malformed mode records',()=>{
  const h=harness(),r=h.player.udata.validateSaveRecord(Object.assign({},h.player.udata.data,{wallDefenseBestWave:undefined,wallDefensePending:{id:'bad'},futureField:7}));
  assert.equal(r.wallDefenseBestWave,0);assert.equal(r.wallDefensePending,undefined);assert.equal(r.futureField,7);
  for(const bad of [null,{},result(0),{...result(),activeMilliseconds:-1},{...result(),drops:[{wave:200}]}])assert.equal(rules.validResult(bad),false);
});
