'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./backend-ui-harness.cjs');
const {setup,Node,authored}=require('./backend-gameplay-harness.cjs');
const single=x=>({getInstance:()=>x}),noop=()=>{};

function branch(initial=false){
 const h=fixture(),e=require('../navigation/runtime-harness.cjs').environment(),ui=e.stubs.KinghtFallUIGame.default.instance;
 Object.assign(h.modules,{TestMode:{TestMode:single({clearGameplayInput:noop})},KinghtFallConfig:{KinghtFallEventName:{PlayVideoSucc:'video'},KinghtFallParameter:{}},KinghtFallGameCtrl:{default:function(){}},KinghtFallGameCtrlData:{},KinghtFallGameEffect:{},KinghtFallGameUICtrl:{},KinghtFallModle:{},KinghtFallEnum:{},KinghtFallPlayerMgr:{},KinghtFallDataMgr:{},KinghtFallTextConfig:{},SdkMgr:{},PlayerMgr:{},GameTrackDataEvent:{},PlatformSetting:{},AudioMgr:{},Utils:{}});
 const U=h.load('KinghtFallUIGame').default;ui.onPauseGame=U.prototype.onPauseGame;ui.scheduleOnce=fn=>h.scheduled.push(fn);ui._stopTestMovement=noop;ui.sendEvent=noop;ui.initView=noop;ui.canStart=true;ui.isPauset=false;
 const game=ui.ctrGame;game._combatEpoch=1;game.gameData.coin=20;game.gameData.levelCfg={Level:1};game.onPauseGame=game.onResumeGame=noop;
 e.stubs.UIMgr={UIMgr:single(h.ui)};e.stubs.EventMgr={EventMgr:single({emit:noop})};e.stubs.PlayerMgr={PlayerMgr:single({getTrackData:()=>({youmengTrack:noop})})};e.stubs.GameTrackDataEvent={TrackId:{}};e.stubs.AudioMgr={AudioMgr:single({playEffectFree:noop})};e.stubs.KinghtFallPlayerMgr={KinghtFallPlayerMgr:single({getMissionData:()=>({getTaskInfo:()=>({}),setTaskInfo:noop})})};
 e.stubs.KinghtFallConfig.KinghtFallUIID={UIBuildSel:'choice',UIGame:'game'};e.stubs.KinghtFallConfig.KinghtFallEventName={};e.stubs.KinghtFallConfig.KinghtFallAudioId={};
 e.stubs.KinghtFallBuildInfo={KinghtFallBuildInfo:function(id,cfg){this.cfg=cfg;this.standTime=0;}};
 const B=e.load('KinghtFallBuildBase').default,b=new B();Object.assign(b,{node:new Node(),buildCfg:{enumValue:'Barracks',levelList:[{level:1,BranchBuild:[2,3]},{level:2},{level:2}]},buildInfo:{standTime:0,cfg:{level:1,BranchBuild:[2,3]}},getSell:()=>5,getLevel(){return this.buildInfo.cfg.level;},ndLockList:[null,{getChildByName:()=>null},{getChildByName:()=>null}],doUpgreadAni:noop,scheduleOnce:fn=>h.scheduled.push(fn)});ui.addTask=noop;
 if(initial){
  b.buildCfg.InitialChoices=[11,14,17,20];
  while(b.buildCfg.levelList.length<10)b.buildCfg.levelList.push({level:3});
  for(const [type,start] of b.buildCfg.InitialChoices.entries())for(let level=1;level<=3;level++)b.buildCfg.levelList.push({level,Data:[4,90001+type,8],ColliderIndex:level===1?1:type===0?2:type===1?3:type===2?6:9,BranchBuild:level<3?[start+level]:[]});
  b.buildInfo={standTime:0,cfg:undefined};b.index=0;b.getLevel=function(){return this.buildInfo.cfg?this.buildInfo.cfg.level:0;};
  b.ndLockList[0]={getChildByName:()=>null};b.sendEvent=noop;
 }
 const S=h.load('KinghtFallUIBuildSel').default;
 h.ui.setConf({choice:{bundleName:'ui',prefab:'choice',name:'Choice',zIndex:10},other:{bundleName:'ui',prefab:'other',name:'Other',zIndex:1}});
 h.cc.instantiate=()=>{const n=new h.cc.Node('Choice'),s=new S();n.ui=s;s.node=n;return n;};
 return{...h,b,battleUI:ui,game,begin:()=>b.doUpgrade(2,true),choose(index=2){const s=h.ui.uistatck.get('choice');return s.finishDecision(s.callBack,index);}};
}

for(const [unit,index] of [[90001,11],[90002,14],[90003,17],[90004,20]])test(`new barracks selects unit ${unit} immediately and preserves its level path/save index`,()=>{
 const h=branch(true),previous=h.b.buildInfo;h.begin();h.begin();
 assert.equal(h.requests.length,1);assert.equal(h.game.gameData.coin,15);assert.equal(h.b.buildInfo,previous,'no default squad is constructed while choosing');
 h.requests[0].done(null,h.asset);const panel=h.ui.uistatck.get('choice');
 assert.equal(panel.initialChoice,true);assert.deepEqual(Array.from(panel.choiceIndexes),[11,14,17,20]);
 h.choose(index);h.b.cancelUpgrade();h.flush();
 assert.equal(h.b.buildInfo.cfg.level,1);assert.equal(h.b.buildInfo.cfg.Data[1],unit);assert.equal(h.b.index,index);
 assert.deepEqual(Array.from(h.b.getUpgradeChoices()),[index+1]);assert.equal(h.game.gameData.coin,15);
 const save=h.b.getSave();let restored;h.b.setLevel=value=>restored=value;h.b.setSave(save);assert.equal(restored,index);
 assert.equal(h.battleUI.isPauset,false);assert.equal(h.battleUI.canStart,true);
});

test('new tower uses the same initial chooser; closing it refunds once and cannot build from a late click',()=>{
 const h=branch(true);h.b.buildCfg.enumValue='ArrowTower';h.b.buildCfg.InitialChoices=[1,4,7];
 for(const index of [1,4,7])h.b.buildCfg.levelList[index-1].level=1;
 h.begin();h.requests[0].done(null,h.asset);const panel=h.ui.uistatck.get('choice'),callback=panel.callBack;
 assert.deepEqual(Array.from(panel.choiceIndexes),[1,4,7]);h.ui.closeUI(panel.node);h.b.cancelUpgrade();callback(4);
 assert.equal(h.game.gameData.coin,20);assert.equal(h.b.index,0);assert.equal(h.b.buildInfo.cfg,undefined);assert.equal(h.battleUI.isPauset,false);
});

test('initial chooser rejects invalid callbacks and filters duplicate/missing/non-level-one options',()=>{
 const h=branch(true);h.b.buildCfg.InitialChoices=[11,11,12,999,-1,14];
 assert.deepEqual(Array.from(h.b.getUpgradeChoices()),[11,14]);h.begin();h.requests[0].done(null,h.asset);h.choose(12);h.flush();
 assert.equal(h.b.index,0);assert.equal(h.game.gameData.coin,20);assert.equal(h.battleUI.isPauset,false);
});

test('build families without an initial choice field retain the original first-row construction',()=>{
 const h=branch(true);delete h.b.buildCfg.InitialChoices;
 assert.deepEqual(Array.from(h.b.getUpgradeChoices()),[1]);h.begin();h.flush();
 assert.equal(h.requests.length,0);assert.equal(h.b.index,1);assert.equal(h.game.gameData.coin,15);
});

test('Covenant free building keeps its choice through cancellation and never charges or refunds silver',()=>{
 const h=branch(true);h.b.ID=9;h.b.canLock=true;h.b.buildInfo.canUpgrade=true;h.game.gameData.coin=0;
 h.game.gameData.treasureAddTime={CovenantOfPatriarchs:9};
 h.b.getSell=Object.getPrototypeOf(h.b).getSell;
 assert.equal(h.b.hasFreeInitialChoice(),true);assert.equal(h.b.getSell(),0);
 h.begin();h.requests[0].done(null,h.asset);h.ui.closeUI(h.ui.uistatck.get('choice').node);h.flush();
 assert.equal(h.game.gameData.coin,0);assert.equal(h.b.hasFreeInitialChoice(),true);assert.equal(h.b.index,0);
 h.begin();h.requests[1].done(null,h.asset);h.choose(17);h.flush();
 assert.equal(h.game.gameData.coin,0);assert.equal(h.b.hasFreeInitialChoice(),false);assert.equal(h.b.buildInfo.cfg.Data[1],90003);
});

test('Covenant auto-build remains unchanged for legacy families while typed families await selection',()=>{
 for(const typed of [false,true]){
  const h=branch(true);h.b.ID=9;if(!typed)delete h.b.buildCfg.InitialChoices;
  h.game.gameData.canLock=()=>true;h.game.gameData.treasureAddTime={CovenantOfPatriarchs:9};
  h.b.upHpView=noop;let requested;h.b.setLevel=value=>requested=value;h.b.upData();
  assert.equal(requested,typed?0:1);
 }
});

test('free upgrades follow the chosen linear family and safely ignore a completed building',()=>{
 const h=branch(true);h.b.buildInfo.cfg=h.b.buildCfg.levelList[16];h.b.index=17;
 assert.equal(h.b.onBuffUpgrade(),true);assert.equal(h.b.index,18);
 h.b.buildInfo.cfg=h.b.buildCfg.levelList[18];h.b.index=19;
 assert.equal(h.b.onBuffUpgrade(),false);assert.equal(h.b.index,19);
});

test('level-three tower can update its price view without an unused upgrade-plot node',()=>{
 const h=branch(true);h.b.index=19;h.b.buildInfo.cfg=h.b.buildCfg.levelList[18];h.b.ndLockList.length=3;
 assert.doesNotThrow(()=>h.b.upSellView());
});

test('random free-upgrade perk includes a one-branch tower and excludes completed or castle buildings',()=>{
 const h=setup({Utils:{Utils:{randomRang:()=>0}}});let selected=0;
 const build=(kind,branches,level)=>({buildCfg:{enumValue:kind},buildInfo:{cfg:{BranchBuild:branches}},getIsLock:()=>true,getLevel:()=>level,onBuffUpgrade(){selected++;}});
 h.d.baseBuild={getLevel:()=>3};h.d.bulidPointMap={1:build('CastleCenter',[2],1),2:build('ArrowTower',[5],1),3:build('Barracks',[],3)};
 h.d.addGameBuff('Buff11');assert.equal(selected,1);
});

for(const perk of ['Buff12','Buff24'])test(`${perk} grants an unbuilt tower choice whose zero-cost entitlement survives checkpoint and cancellation`,()=>{
 const world=setup({Utils:{Utils:{randomRang:()=>0}}}),h=branch(true);h.b.buildCfg.enumValue='ArrowTower';h.b.canLock=true;h.b.buildInfo.canUpgrade=true;
 h.game.gameData.coin=0;h.b.getSell=Object.getPrototypeOf(h.b).getSell;h.b.getIsLock=()=>false;
 world.d.bulidPointMap={9:h.b};world.d.baseBuild={getLevel:()=>3};world.d.canLockBuild=()=>true;world.d.addGameBuff(perk);
 assert.equal(h.b.index,0);assert.equal(h.b._freeInitialBuild,true);assert.equal(h.b.getSell(),0);
 const save=h.b.getSave();assert.equal(save.freeInitialBuild,true);
 const next=branch(true);next.b.canLock=true;next.b.buildInfo.canUpgrade=true;next.b.getSell=Object.getPrototypeOf(next.b).getSell;
 next.b.setLevel=value=>{next.b.index=value;};next.b.setSave(save);assert.equal(next.b.getSell(),0);
 next.game.gameData.coin=0;next.begin();next.requests[0].done(null,next.asset);next.ui.closeUI(next.ui.uistatck.get('choice').node);next.flush();
 assert.equal(next.b._freeInitialBuild,true);assert.equal(next.game.gameData.coin,0);assert.equal(next.b.index,0);
 next.begin();next.requests[1].done(null,next.asset);next.choose(14);next.flush();
 assert.equal(next.b.index,14);assert.equal(next.b._freeInitialBuild,false);assert.equal(next.game.gameData.coin,0);assert.equal(next.b.getSave().freeInitialBuild,undefined);
});

test('branch resource Cancel refunds once and releases only its pause/input ownership',()=>{
 const h=branch();h.battleUI.onPauseGame(true);h.touch.onBlockTouch(false,'ad');h.begin();h.begin();assert.equal(h.requests.length,1);assert.equal(h.game.gameData.coin,15);
 h.requests[0].done(Error('offline'));h.resources.resolveRuntimeRecovery(false);h.resources.resolveRuntimeRecovery(false);
 assert.equal(h.game.gameData.coin,20);assert.equal(h.b.buildInfo.cfg.level,1);assert.equal(h.battleUI.canStart,true);assert.equal(h.battleUI.isPauset,true);assert.deepEqual([...h.touch._inputOwners],['ad']);
 h.battleUI.onPauseGame(false);assert.equal(h.battleUI.isPauset,false);h.requests[0].done(null,h.asset);assert.equal(h.ui.uistatck.has('choice'),false);
});
test('branch Retry spends authored cost once; selection and close cannot repeat/refund it',()=>{
 const h=branch();h.begin();h.requests[0].done(Error('offline'));h.resources.resolveRuntimeRecovery(true);assert.equal(h.requests.length,2);assert.equal(h.game.gameData.coin,15);
 h.requests[0].done(null,h.asset);assert.equal(h.ui.uistatck.has('choice'),false);h.requests[1].done(null,h.asset);h.choose();h.b.cancelUpgrade();h.flush();
 assert.equal(h.game.gameData.coin,15);assert.equal(h.b.buildInfo.cfg.level,2);assert.equal(h.battleUI.canStart,true);assert.equal(h.battleUI.isPauset,false);assert.equal(h.ui.uistatck.has('choice'),false);
 assert.equal(h.game.upBulid,h.b,'successful purchase keeps the authored leave-the-building trigger lock');
});
test('branch panel close refunds and later selection callback is ignored',()=>{
 const h=branch();h.begin();h.requests[0].done(null,h.asset);const s=h.ui.uistatck.get('choice'),cb=s.callBack;h.ui.closeUI(s.node);cb(2);assert.equal(h.game.gameData.coin,20);assert.equal(h.b.buildInfo.cfg.level,1);assert.equal(h.battleUI.isPauset,false);
});
test('cancelling a branch refunds before draining queued replacement ownership',()=>{
 const h=branch();h.begin();const manager=h.modules.UIMgr.UIMgr.getInstance();let seen;
 manager.openUIWithOwner('other','game',{onOpened(){seen=h.game.gameData.coin;h.battleUI.onPauseGame(true,'replacement');}});
 h.b.cancelUpgrade();assert.equal(h.requests.length,2);h.requests[1].done(null,h.asset);assert.equal(seen,20);assert.equal(h.battleUI.isPauset,true);h.battleUI.onPauseGame(false,'replacement');assert.equal(h.battleUI.isPauset,false);
});
test('stale battle/level operations cannot refund new data or accept old choices',()=>{
 const h=branch();h.begin();const old=h.game.gameData;h.game._combatEpoch++;h.game.gameData={coin:90};h.b.cancelUpgrade();h.requests[0].done(null,h.asset);
 assert.equal(h.game.gameData.coin,90);assert.equal(old.coin,15);assert.equal(h.b.buildInfo.cfg.level,1);assert.equal(h.battleUI.isPauset,false);
});
test('normal battle cleanup refunds before changing epoch and preserves a newer legacy pause',()=>{
 const h=branch();h.begin();h.battleUI.onPauseGame(true);Object.assign(h.game,{ndPlayArr2:[],ndEnemyArr:[],ndSoldArr:[],ndBuildArr2:[]});
 const G=setup().load('KinghtFallGameCtrl').default;G.prototype.cleanMap.call(h.game);assert.equal(h.game.gameData.coin,20);assert.equal(h.game._combatEpoch,2);assert.equal(h.battleUI.isPauset,true);h.requests[0].done(null,h.asset);assert.equal(h.ui.uistatck.has('choice'),false);
});
for(const stage of ['instantiate','init','onOpened'])test(`branch ${stage} exception refunds and drains the waiting UI before propagating`,()=>{
 const h=branch(),instantiate=h.cc.instantiate;h.begin();h.ui.openUI('other','game');
 h.cc.instantiate=()=>{if(stage==='instantiate')throw Error('controlled '+stage);const node=instantiate();node.ui[stage]=()=>{throw Error('controlled '+stage);};return node;};
 assert.throws(()=>h.requests[0].done(null,h.asset),new RegExp('controlled '+stage));
 assert.equal(h.game.gameData.coin,20);assert.equal(h.battleUI.isPauset,false);assert.equal(h.battleUI.canStart,true);assert.equal(h.ui.uistatck.has('choice'),false);assert.equal(h.requests.length,2);assert.equal(h.ui.watingOpen.length,0);
 h.cc.instantiate=instantiate;h.requests[1].done(null,h.asset);assert.equal(h.ui.uistatck.has('other'),true);
});

function owned(){const h=fixture();h.ui.setConf({one:{bundleName:'ui',prefab:'one',name:'One',zIndex:10},two:{bundleName:'ui',prefab:'two',name:'Two',zIndex:1}});return h;}
test('owned open cancellation rejects late success/error without affecting same-UID replacement',()=>{
 const h=owned();let old=0,current=0,cancelled=0;const a=h.ui.openUIWithOwner('one','',{onOpened:()=>old++,onCancel:()=>cancelled++});
 h.ui.openUIWithOwner('one','',{onOpened:()=>current++});a.cancel();a.cancel();assert.equal(h.requests.length,2);
 h.requests[0].done(Error('obsolete'));assert.equal(h.paused(),false);h.requests[1].done(null,h.asset);assert.equal(old,0);assert.equal(current,1);assert.equal(cancelled,1);assert.equal(h.ui.uistatck.has('one'),true);
});
test('owned recovery retry is cancelled once before any queued popup can revive it',()=>{
 const h=owned();let opened=0,cancelled=0;const a=h.ui.openUIWithOwner('one','',{onOpened:()=>opened++,onCancel:()=>cancelled++});h.requests[0].done(Error('offline'));a.cancel();h.resources.resolveRuntimeRecovery(true);assert.equal(h.requests.length,1);assert.equal(cancelled,1);assert.equal(opened,0);assert.equal(h.ui.isopening,false);
});
test('a throwing input-release listener cannot strand an owned opening or its waiting replacement',()=>{
 const h=owned();let cancelled=0;const a=h.ui.openUIWithOwner('one','',{onCancel:()=>cancelled++});h.ui.openUI('two','');
 const bus=h.modules.EventMgr.EventMgr.getInstance(),emit=bus.emit;bus.emit=function(...args){emit(...args);if(args[0]==='block'&&args[1]===true)throw Error('controlled listener failure');};
 // The fixture singleton creates a fresh facade; replace its provider for this fault.
 h.modules.EventMgr.EventMgr.getInstance=()=>bus;
 assert.throws(()=>a.cancel(),/controlled listener failure/);assert.equal(cancelled,1);assert.equal(h.requests.length,2);assert.equal(h.ui.watingOpen.length,0);a.cancel();
 bus.emit=emit;h.requests[1].done(null,h.asset);assert.equal(h.ui.uistatck.has('two'),true);
});
test('owned consumer completion exceptions remain visible without deleting a usable opened screen',()=>{
 const h=owned();let cancelled=0;const owner=h.ui.openUIWithOwner('one','',{onCancel:()=>cancelled++,onOpened(){throw Error('consumer failure');}});h.ui.openUI('two','');
 assert.throws(()=>h.requests[0].done(null,h.asset),/consumer failure/);assert.equal(owner.finished,true);assert.equal(cancelled,0);assert.equal(h.ui.uistatck.has('one'),true);assert.equal(h.requests.length,2);owner.cancel();assert.equal(h.ui.uistatck.has('one'),true);
});
test('owned popup request keeps its lifetime through pop queue and cancels without closing active popup',()=>{
 const h=owned();h.ui.openUI('one','');h.requests[0].done(null,h.asset);const active=h.ui.uistatck.get('one');let cancel=0;
 const a=h.ui.openUIWithOwner('two','',{onCancel:()=>cancel++}); // begin a separate main load before queued same-layer popup
 h.ui.UIConf.two.zIndex=10;a.cancel();const b=h.ui.openUIWithOwner('two','',{onCancel:()=>cancel++});assert.equal(h.ui.popStatck.length,1);b.cancel();assert.equal(h.ui.popStatck.length,0);assert.equal(h.ui.uistatck.get('one'),active);assert.equal(cancel,2);
});

function checkpoint(saved){
 const mission={num:100,writes:0,addAchNum(type,n){assert.equal(type,'GetSliver');this.num+=n;this.writes++;}};
 const record={hasSave:()=>saved,activateStage(stage){assert.equal(stage,1);return saved;},readyForNewBattle:()=>true,getRoundNum:()=>6,getCoin:()=>77,getBuffList:()=>['Buff10'],getBuildInfoList:()=>[],getBusinessList:()=>({}),getTaskInfo:()=>({index:2,list:[1,2,3],stage:1})};
 const player={getUserData:()=>({getTreasureLevel:()=>null,getTalent:()=>[]}),getMissionData:()=>mission,getGameData:()=>record};
 const h=setup({KinghtFallPlayerMgr:{KinghtFallPlayerMgr:single(player)}}),dm=h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();Object.assign(dm,{getLevelCfgById:()=>authored.LevelCfg[0],getGameTask:()=>authored.InGameTaskCfg[0],getTreasureCfg:()=>[],getParamsCfgById:()=>.5});
 h.g.ctrPlay.initData=noop;h.g.buildBullet={node:{}};
 function start(){h.g.initData(1);const d=h.g.gameData;d.upMap=d.initCom=noop;if(h.g.loadGame())d.onRestart(false);return d;}
 return{...h,start,mission,record};
}
test('actual GameCtrl startup restores round/coin/perks without any durable silver replay',()=>{
 const h=checkpoint(true);for(let n=0;n<3;n++){const d=h.start();assert.equal(d.round,6);assert.equal(d.coin,77);assert.deepEqual(Array.from(d.buffList,x=>x.id),['Buff10']);assert.equal(d.taskInfo.index,2);assert.equal(d.taskInfo.stage,1);assert.equal(h.mission.num,100);assert.equal(h.mission.writes,0);}
});
test('fresh startup and genuine new waves still grant exactly authored silver; retry is net-zero',()=>{
 const h=checkpoint(false),d=h.start();assert.equal(d.coin,6);assert.equal(h.mission.num,106);assert.equal(h.mission.writes,1);d.loadMonster();assert.equal(d.coin,7);assert.equal(h.mission.num,107);d.onRestart(false);assert.equal(d.coin,7);assert.equal(h.mission.num,107);d.onRestart(true);assert.equal(d.coin,6);assert.equal(h.mission.num,113);
});
for(const saved of [false,true])test(`actual UIGame.start map-load chain keeps ${saved?'checkpoint':'fresh'} credit semantics`,()=>{
 const h=checkpoint(saved),v=fixture();Object.assign(v.modules,h.e.stubs,{KinghtFallGameCtrl:h.load('KinghtFallGameCtrl'),KinghtFallGameCtrlData:h.load('KinghtFallGameCtrlData'),KinghtFallGameEffect:{},KinghtFallGameUICtrl:{},KinghtFallTextConfig:{KinghtFallTextConfig:{}},AudioMgr:{AudioMgr:single({playMusic:noop})},TestMode:{TestMode:single({setGameplayTarget:noop,clearGameplayInput:noop})}});
 delete v.modules.KinghtFallUIGame;
 Object.assign(v.modules,{PlatformSetting:{},SdkMgr:{},Utils:{}});
 const U=v.load('KinghtFallUIGame').default,u=new U();h.e.stubs.KinghtFallUIGame.default.instance=u;
 const widget={getComponent:()=>({}),active:true},button={getChildByName:()=>widget};let mapDone;
 Object.assign(u,{levelId:1,btnAgg:button,btnBuildInfo:{},ndCtrGame:{getComponent:Type=>Type===v.cc.Widget?null:h.g},ctrEffect:{initData:noop},ctrUI:{ndGuide:{setParent:noop},ndLight:{},setRevive:noop},initBtnEvent:noop,initEvent:noop,initView:noop,initBtnView:noop,startGuide:noop,T:x=>x,_stopTestMovement:noop,loadPrefab(_b,_p,done){mapDone=done;},sendEvent(_event,_arg,done){if(typeof done==='function')done();},scheduleOnce:fn=>v.scheduled.push(fn)});
 h.g.initMap=()=>{h.g.gameData.obstacles=[];h.g.gameData.initCom=noop;h.g.ndBg={children:[]};};h.g.onLateUpdate=noop;h.g.onPauseGame=h.g.onResumeGame=noop;v.cc.instantiate=()=>({setParent:noop});
 u.start();assert.equal(h.mission.num,saved?100:106);assert.equal(h.mission.writes,saved?0:1);mapDone({});
 assert.equal(h.g.gameData.round,saved?6:1);assert.equal(h.g.gameData.coin,saved?77:6);assert.equal(h.mission.num,saved?100:106);assert.equal(h.mission.writes,saved?0:1);
 if(saved)assert.deepEqual(Array.from(h.g.gameData.buffList,b=>b.id),['Buff10']);
});

test('legacy pending UI exit and reversed reentry completion never create stale scene owners',()=>{
 const h=owned();let entered=0,exits=0,audio=0;h.cc.SystemEvent={EventType:{KEY_UP:'key'}};h.cc.systemEvent={on:noop,off:noop};
 Object.assign(h.modules,{GAD_Configs:{GAD_UIID:{UIGame:'one',UIResult:'result',UIPause:'pause'},GAD_AudioId:{},GADConfig:{},emGADGameState:{Over:3}},GAD_PlayerMgr:{default:single({reset:noop,setState:noop,finishRun:noop,readyForRun:()=>true})},GAD_DataMgr:{},AudioMgr:{AudioMgr:single({playMusic(){audio++;},stopMusic:noop,playEffect(){audio++;}})}});
 const A=h.load('GAD_App').default,a=new A();a._isInited=true;a.addTouchEvent=a.removeTouchEvent=noop;
 a.enter_App(()=>entered++,()=>exits++);a.exit_App();a.enter_App(()=>entered++);h.requests[1].done(null,h.asset);const current=h.ui.uistatck.get('one');h.requests[0].done(null,h.asset);
 assert.equal(entered,1);assert.equal(exits,1);assert.equal(h.ui.uistatck.get('one'),current);assert.equal(audio,2);a.exit_App();assert.equal(h.ui.uistatck.has('one'),false);
});
