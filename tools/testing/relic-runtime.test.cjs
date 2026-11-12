'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Runtime=require('../../assets/_script/RelicRuntime');
const {harness,clone}=require('./persistence-harness.cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function runtimeMethod(file,name,globals){
 const source=fs.readFileSync(path.join(root,'assets/_script',file+'.js'),'utf8'),start=source.indexOf('_ctor.prototype.'+name+' = function'),end=source.indexOf('\n  };',start);
 assert(start>=0&&end>start);return vm.runInNewContext('('+source.slice(source.indexOf('function',start),end+4)+')',globals);
}
function loadBattle(){
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/RelicBattle.js'),'utf8'),{module,exports:module.exports,require:name=>name==='RelicRuntime'?Runtime:require('../../assets/_script/'+name)});return module.exports;
}

test('legacy or invalid ownership is a no-op and does not create battle state',()=>{
 const data={treasureAdd:{120028:[NaN],120031:[-1],120032:['.2']}};
 assert.equal(Runtime.active(data),false);assert.equal(Runtime.value(data,120029),0);
 assert.equal(Runtime.snapshot(data),undefined);assert.equal(Object.hasOwn(data,'relicState'),false);
});

test('battle checkpoints preserve spent charges, reward ledgers and unknown legacy fields per stage',()=>{
 const h=harness(),game=h.player.getGameData();
 const state={phoenixUsed:true,hourglassUsed:true,completedWaves:{3:true},productionRemainder:.8,heroAttackCount:7,vampireHealedByWave:{3:.08},futureField:{retained:true}};
 assert.equal(game.setCheckpoint({levelNum:1,roundNum:3,coin:24,relicState:state}),true);
 assert.equal(game.setCheckpoint({levelNum:2,roundNum:2,coin:9,relicState:{phoenixUsed:false}}),true);
 const reloaded=harness(h.persist()).player.getGameData();
 assert.deepEqual(clone(reloaded.getCheckpoint(1).relicState),state);
 assert.deepEqual(clone(reloaded.getCheckpoint(2).relicState),{phoenixUsed:false});
 const runtime={treasureAdd:{120028:[.25]}};
 Runtime.restore(runtime,reloaded.getCheckpoint(1).relicState);
 runtime.relicState.completedWaves[4]=true;
 assert.equal(reloaded.getCheckpoint(1).relicState.completedWaves[4],undefined,'runtime state must not alias the saved checkpoint');
 const copy=Runtime.snapshot(runtime);copy.productionRemainder=0;
 assert.equal(runtime.relicState.productionRemainder,.8);
 Runtime.restore(runtime,null);assert.equal(Runtime.snapshot(runtime),undefined,'a new battle gets fresh charges and reward ledger');
});

test('freeze duration accounts for partial simulation frames and boss control never becomes a full freeze',()=>{
 const normal={cfg:{ID:90001},node:{_combatGeneration:1},isDead:()=>false};
 Runtime.applyControl(normal,.8,.15);
 assert.deepEqual(Runtime.controlDelta(normal,.5),{dt:0,frozen:true,moveScale:1,attackScale:1});
 const remainder=Runtime.controlDelta(normal,.5);assert(Math.abs(remainder.dt-.2)<1e-9);assert.equal(remainder.frozen,false);
 const boss={cfg:{ID:90011},node:{_combatGeneration:1},isDead:()=>false};
 Runtime.applyControl(boss,2,.5);assert.equal(Runtime.controlDelta(boss,1).dt,.5);
 assert.equal(Runtime.controlDelta(boss,2).dt,1.5);assert.equal(Runtime.controlDelta(boss,1).dt,1);
 boss.node._combatGeneration++;assert.equal(Runtime.controlDelta(boss,1).dt,1);
 Runtime.clearControl(boss);assert.equal(boss._relicControl,undefined);
});

test('Frost recognizes actual movement reductions, not unrelated buffs, and healing never revives a dead actor',()=>{
 assert.equal(Runtime.slowed({debuffInfo:[{type:3,data:{subNum:.2}}]},{}),true);
 assert.equal(Runtime.slowed({debuffInfo:[{type:4,data:{subNum:.2}}]},{}),false);
 assert.equal(Runtime.slowed({debuffInfo:[]},{treasureAdd:{120002:[.5]}}),true);
 const dead={hp:0,hpMax:100,isDead:()=>true};assert.equal(Runtime.heal(dead,.25),0);assert.equal(dead.hp,0);
 const live={hp:95,hpMax:100,isDead:()=>false};assert.equal(Runtime.heal(live,.25),5);assert.equal(live.hp,100);
});

test('failed legendary checkpoint writes retry at most once per second and retain spent charges after recovery',()=>{
 const h=harness(),record=h.player.getGameData();
 assert.equal(record.setCheckpoint({levelNum:1,roundNum:1,coin:10}),true);
 let attempts=0;
 const data={coin:10,round:1,relicState:{phoenixUsed:true,hourglassUsed:true},ctrPar:{saveGame(){attempts++;return record.setCheckpoint({levelNum:1,roundNum:data.round,coin:data.coin,relicState:Runtime.snapshot(data)});}}};
 h.state.failKeys.add(record.gameKey);
 assert.equal(Runtime.commit(data),false);assert.equal(attempts,1);assert.equal(data._relicSavePending,true);
 assert.equal(Runtime.retry(data,.5),false);assert.equal(Runtime.retry(data,.49),false);assert.equal(attempts,1);
 assert.equal(Runtime.retry(data,.01),false);assert.equal(attempts,2);
 h.state.failKeys.clear();
 assert.equal(Runtime.retry(data,.99),false);assert.equal(attempts,2);
 assert.equal(Runtime.retry(data,.01),true);assert.equal(attempts,3);assert.equal(data._relicSavePending,undefined);assert.equal(data._relicSaveRetryTime,undefined);
 const restored=harness(h.persist()).player.getGameData().getCheckpoint(1);
 assert.deepEqual(clone(restored.relicState),{phoenixUsed:true,hourglassUsed:true});
 assert.equal(Runtime.retry(data,10),false);assert.equal(attempts,3);
});

test('a failed wave-end checkpoint holds progression and retries without duplicating bank interest, house income, growth or achievements',()=>{
 const h=harness(),record=h.player.getGameData(),Battle=loadBattle();
 assert.equal(record.setCheckpoint({levelNum:1,roundNum:3,coin:10}),true);
 const hero={hp:50,hpMax:100,isDead(){return this.hp<=0;}},soldier={hp:50,hpMax:100,isDead(){return this.hp<=0;}},house={ID:2,buildInfo:{BuildID:4,cfg:{Hp:100},hp:50,hpMax:100},getIsWork:()=>true},events=[],achievements=[],passes=[];
 let attempts=0;
 const data={treasureAdd:{120004:[2],120023:[3],120047:[.04]},round:3,coin:10,enemyList:[],enemyQueue:{},soldierList:[soldier],bulidPointMap:{2:house},getBaseLevel:()=>1,pendingEnemySpawns:0,levelCfg:{Level:1,WaveCfg:Array(20).fill({})},getSoldierList(){return this.soldierList;},ctrPar:{ctrPlay:hero,saveGame(){attempts++;return record.setCheckpoint({levelNum:1,roundNum:data.round,coin:data.coin,relicState:Runtime.snapshot(data)});}}};
 const finish=runtimeMethod('KinghtFallGameCtrlData','tryEndGame',{
  require:name=>name==='RelicRuntime'?Runtime:Battle,
  $z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getMissionData:()=>({addAchNum:(...args)=>achievements.push(args)}),getUserData:()=>({passOrder:(...args)=>passes.push(args)})})}},
  $z1KinghtFallEnum:{KinghtFallEnumAchiEnum:{GetSliver:11}},
  $z1PlayerMgr:{PlayerMgr:{getInstance:()=>({getTrackData:()=>({youmengTrack(){}})})}},$z1GameTrackDataEvent:{TrackId:{}},
  $z1EventMgr:{EventMgr:{getInstance:()=>({emit:(...args)=>events.push(args)})}},$z1KinghtFallConfig:{KinghtFallEventName:{RoundEnd:'round-end',GameOver:'game-over'}}
 });
 data.tryEndGame=()=>finish.call(data);
 h.state.failKeys.add(record.gameKey);data.tryEndGame();
 assert.equal(attempts,1);assert.equal(data._relicSavePending,true);assert.equal(data._relicRoundCommitPending,true);
 assert.equal(data.coin,15);assert.equal(house.buildInfo.hp,54);assert.equal(house.buildInfo.hpMax,104);assert.equal(hero.hp,50);assert.equal(soldier.hp,50);assert.equal(events.length,0);assert.equal(achievements.length,0);assert.equal(passes.length,0);
 data.tryEndGame();assert.equal(attempts,1);assert.equal(house.buildInfo.hpMax,104);assert.equal(data.coin,15);
 assert.equal(Runtime.retry(data,1),false);assert.equal(attempts,2);
 h.state.failKeys.clear();
 // Exercise the real game-update retry integration as well as the held end.
 const update=runtimeMethod('KinghtFallGameCtrl','onUpdate',{
  require:name=>Runtime,Navigation:{beginFrame(){}},GameToolsOverrides:{tick(){}},
  $z1KinghtFallModle:{KinghtFallGameStage:{Prepare:0,Fight:1}}
 });
 data.getBulidList=()=>[];data.getSoldierList=()=>[];
 update.call({gameData:data,gameStatus:99,ctrPlay:{doMove(){}},collectFollowers(){}},1);
 assert.equal(attempts,3);assert.equal(data._relicRoundCommitPending,undefined);assert.equal(data._relicSavePending,undefined);
 assert.equal(hero.hp,50);assert.equal(soldier.hp,50);assert.equal(house.buildInfo.hpMax,104);assert.equal(data.coin,15);
 assert.deepEqual(achievements,[[11,5]]);assert.deepEqual(passes,[[1,3]]);assert.deepEqual(events,[['round-end']]);
 data.tryEndGame();assert.equal(events.length,1);assert.equal(achievements.length,1);assert.equal(data.coin,15);
 const restored=harness(h.persist()).player.getGameData().getCheckpoint(1);assert.equal(restored.coin,15);assert.equal(restored.relicState.completedWaves[3],true);
 assert.deepEqual(clone(restored.relicState.houseTierReceipts),{2:{1:true}});assert.deepEqual(clone(restored.relicState.economicGrowthByPoint),{2:1});
 const resumed={treasureAdd:data.treasureAdd,coin:restored.coin,bulidPointMap:{2:house},getBaseLevel:()=>1};Runtime.restore(resumed,restored.relicState);assert.equal(Battle.waveCleared(resumed,null,3),false);assert.equal(resumed.coin,15);assert.equal(house.buildInfo.hpMax,104);
});

test('an earlier failed legendary save also holds a cleared wave, while unowned retries add no fields',()=>{
 const empty={treasureAdd:{}},before=JSON.stringify(empty);assert.equal(Runtime.retry(empty,1),false);assert.equal(JSON.stringify(empty),before);
 const data={treasureAdd:{120028:[.25]},_roundCompleted:false,_relicSavePending:true,round:1,coin:0,enemyList:[],enemyQueue:{},pendingEnemySpawns:0,levelCfg:{Level:1,WaveCfg:[{}]}};
 const finish=runtimeMethod('KinghtFallGameCtrlData','tryEndGame',{require:name=>name==='RelicRuntime'?Runtime:loadBattle()});
 finish.call(data);assert.equal(data._relicRoundCommitPending,true);assert.equal(data._roundCompleted,true);
 data._relicSaveRetryTime=.9;data._relicRoundCoinPending=4;Runtime.restore(data,null);
 for(const field of ['_relicSavePending','_relicSaveRetryTime','_relicRoundCommitPending','_relicRoundCoinPending'])assert.equal(Object.hasOwn(data,field),false);
});

test('retiring the active stage removes its relic receipt without erasing another stage checkpoint',()=>{
 const h=harness(),record=h.player.getGameData();
 record.setCheckpoint({levelNum:1,roundNum:3,coin:12,relicState:{phoenixUsed:true,completedWaves:{3:true}}});
 record.setCheckpoint({levelNum:2,roundNum:2,coin:9,relicState:{hourglassUsed:true}});
 assert.equal(record.data.levelNum,2);assert.equal(record.data.relicState.hourglassUsed,true);
 assert.equal(record.setNewGame(2),true);assert.equal(Object.hasOwn(record.data,'relicState'),false);assert.equal(record.hasSave(2),false);
 const restored=harness(h.persist()).player.getGameData();
 assert.equal(Object.hasOwn(restored.data,'relicState'),false);assert.equal(restored.hasSave(2),false);
 assert.deepEqual(clone(restored.getCheckpoint(1).relicState),{phoenixUsed:true,completedWaves:{3:true}});
});
