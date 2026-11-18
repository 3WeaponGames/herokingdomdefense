'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sourceDir=path.resolve(__dirname,'../../assets/_script');
function method(file,name){const text=fs.readFileSync(path.join(sourceDir,file+'.js'),'utf8'),start=text.indexOf('_ctor.prototype.'+name+' = function '),b=text.indexOf('{',start);assert(start>=0);let d=1,end=b+1;while(d){if(text[end]==='{')d++;if(text[end]==='}')d--;end++;}return text.slice(text.indexOf('function ',start),end);}
function fixture(kind,options={}){
 const calls={saves:0,init:0,roster:0,tracks:0,cosmetics:[],pauses:[],reinitializations:0,closed:0},pending=[],dialogs=[];
 function node(){return {_combatGeneration:1,active:true,activeInHierarchy:true,x:0,y:0,position:{x:0,y:0},children:[],setParent(){},setPosition(){},getPosition(out){out.x=out.y=0;},destroy(){},convertToWorldSpaceAR:p=>p,convertToNodeSpaceAR:p=>p};}
 function point(name){return {node:node(),coinNum:30,getInClick:()=>name===kind,init(){calls.reinitializations++;}};}
 function data(){return {coin:10,businessAdd:{weapon:kind==='weapon2'?1:0,horse:kind==='horse2'?1:0},appearBusinessPoints:point('silver'),weaponBusinessPoints:point(kind==='weapon2'?'weapon2':'weapon1'),horseBusinessPoints:point(kind==='horse2'?'horse2':'horse1')};}
 const K={FlagWeapon:'weapon',FlagHorse:'horse',Attack:'attack',AttackSpeed:'attackSpeed',Speed:'speed'};
 const game={node:node(),gameData:data(),_combatEpoch:1,gameStatus:0,ctrPlay:{node:node(),ctrPlayAni:{setBus:n=>calls.cosmetics.push(n)}},vec2_1:{},saveGame(){calls.saves++;},T:x=>x,camera:{getWorldToScreenPoint:p=>p}};
 const coin=node();coin.children=[node()];const ui={node:node(),_resourceGeneration:1,ctrGame:game,ndCoin:coin,ctrUI:{node:node()},initView(){},_pauseOwners:new Set(),onPauseGame(value,owner){assert(owner,'Every gameplay ad pause must have an owner');calls.pauses.push(value);if(value)this._pauseOwners.add(owner);else this._pauseOwners.delete(owner);this.isPauset=this._pauseOwners.size>0;if(options.onPause)options.onPause(value,{game,ui});}};
 const holder={default:{instance:ui}},cc={isValid:v=>!!v&&!v.destroyed,Sprite:function(){},v2:(x=0,y=0)=>({x,y}),v3:(x=0,y=0,z=0)=>({x,y,z}),Vec2:{random(){}},instantiate:()=>node(),tween(){const x={set:()=>x,by:()=>x,to:()=>x,call:()=>x,start:()=>x};return x;}};
 const manager={openUI(){if(options.onTips)options.onTips({game,ui});},closeUI(){calls.closed++;},openUIWithOwner(id,from,callbacks,type,callback){const dialog={cancelled:false,cancel(){if(this.cancelled)return;this.cancelled=true;callbacks.onCancel();}};dialogs.push({dialog,callbacks,type,callback});return dialog;}};
 const noop=()=>{},mods={cc,t:{prototype:{onDestroy(){},reset(){}}},BattleSounds:{},GameToolsOverrides:{clear(){}},r:{Reborn:'Reborn',RebornMax:'RebornMax'},$z1KinghtFallGameCtrlData:{KinghtFallCommerceKeyType:K},$z1KinghtFallModle:{KinghtFallGameStage:{Prepare:0},KinghtFallSwitch:{isMapShopOpen:()=>!!options.confirm,isMapShopSecondOpen:()=>true}},$z1KinghtFallUIGame:holder,$z1KinghtFallConfig:{KinghtFallEventName:{GamePause:'pause'},KinghtFallUIID:{UIVideoTips:1}},$z1KinghtFallTextConfig:{KinghtFallTextConfig:{}},$z1PlayerMgr:{PlayerMgr:{getInstance:()=>({getTrackData:()=>({youmengTrack(){calls.tracks++;if(options.onTrack)options.onTrack({game,ui});}})})}},$z1GameTrackDataEvent:{TrackId:{}},$z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getMaxStage:()=>1})})}},$z1UIMgr:{UIMgr:{getInstance:()=>manager}},$z1Config:{UIID:{}},$z1Utils:{Utils:{StringFormat:noop}},$z1SdkMgr:{AdType:{AdFreeTime:0},SdkMgr:{getInstance:()=>({playVideo(type,success,failure){pending.push({success,failure});if(options.synchronous)success();}})}},TestMode:{getInstance:()=>({shouldBypassAdLimits:()=>false})}};
 mods.require=name=>name==='AudioMgr'?{AudioMgr:{getInstance:()=>({stopOwnedEffects(){}})}}:name==='GameplayAdOwner'?helper.exports:{};
 const helper={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(sourceDir,'GameplayAdOwner.js'),'utf8'),{cc,module:helper,exports:helper.exports,require:name=>({KinghtFallUIGame:holder,UIMgr:mods.$z1UIMgr})[name]});mods.GameplayAdOwner=helper.exports;
 let owner=game,run;
 if(kind==='barracks'){
   owner={node:node(),buildInfo:{cfg:{Data:[3,90001,5]}},VideoTimes:0,_rosterRetryTime:1,_spawnRetryTime:1,enemyList:[],waitEnemy:[],time:{},keepTime:0,standTimeMax:1.5,vec2_1:{},getIsWork:()=>false,canAddVideoSoldier:()=>true,getInClick:()=>true,ndVideoSoldier:{getChildByName:()=>({getComponent:()=>({})})},init(){calls.init++;if(options.onInit)options.onInit({game,ui,owner});},initBuffData(){calls.roster++;},T:x=>x};
   run=vm.runInNewContext('('+method('KinghtFallBuildBarracks','doTime')+')',mods);
 }else run=vm.runInNewContext('('+method('KinghtFallGameCtrl','onCommerce')+')',mods);
 return {game,ui,owner,calls,pending,dialogs,holder,data,helper:helper.exports,run:()=>run.call(owner,.016),node,invoke:(file,name,args=[])=>vm.runInNewContext('('+method(file,name)+')',mods).apply(owner,args)};
}
const kinds=['silver','weapon1','weapon2','horse1','horse2','barracks'];
function unchanged(f){assert.equal(f.game.gameData.coin,10);assert.equal(f.calls.saves,0);assert.deepEqual(f.calls.cosmetics,[]);assert.equal(f.calls.roster,0);assert.equal(f.owner.VideoTimes||0,0);}
for(const kind of kinds)test(kind+' rewards once and preserves unrelated pause owners',()=>{
 const f=fixture(kind),other={};f.ui._pauseOwners.add(other);f.run();assert.equal(f.pending.length,1);f.pending[0].success();f.pending[0].success();f.pending[0].failure();
 assert.deepEqual([...f.ui._pauseOwners],[other]);assert.equal(f.game._gameplayAds.size,0);assert.equal(f.owner._gameplayAdRequest,null);assert.equal(f.calls.tracks,2);
 if(kind==='silver')assert.equal(f.game.gameData.coin,40);else if(kind==='barracks'){assert.equal(f.owner.VideoTimes,1);assert.equal(f.calls.roster,1);assert.equal(f.calls.init,1);}else {assert.equal(f.calls.saves,1);assert.equal(f.calls.cosmetics.length,1);}
});
for(const kind of kinds)test(kind+' ignores retired success/cancellation without replacement writes or stuck pause',()=>{
 for(const change of ['data','epoch','hero','owner-generation','ui-generation','closed','ui-replaced','game-replaced'])for(const result of ['success','failure']){
  const f=fixture(kind);f.run();const oldOwners=f.ui._pauseOwners;
  if(change==='data')f.game.gameData=f.data();if(change==='epoch')f.game._combatEpoch++;if(change==='hero')f.game.ctrPlay={node:f.node()};if(change==='owner-generation')f.owner.node._combatGeneration++;
  if(change==='ui-generation')f.ui._resourceGeneration++;if(change==='closed')f.ui.isclose=true;if(change==='ui-replaced')f.holder.default.instance={node:f.node()};if(change==='game-replaced')f.ui.ctrGame={};
  f.pending[0][result]();unchanged(f);assert.equal(f.calls.tracks,0,change);assert.equal(f.calls.init,0);assert.equal(oldOwners.size,0);assert.equal(f.calls.reinitializations,0);assert.equal(f.game._gameplayAds.size,0);
 }
});
test('same retained UI retirement clears only old pause tokens before the next epoch',()=>{
 const f=fixture('weapon1'),other={};f.ui._pauseOwners.add(other);f.run();f.helper.retire(f.game);f.game._combatEpoch++;f.game.gameData=f.data();f.pending[0].success();assert.deepEqual([...f.ui._pauseOwners],[other]);unchanged(f);assert.equal(f.game._gameplayAds.size,0);
});
test('synchronous SDK callbacks grant exactly one valid offer',()=>{for(const kind of kinds){const f=fixture(kind,{synchronous:true});f.run();assert.equal(f.calls.tracks,2);assert.equal(f.game._gameplayAds.size,0);assert.equal(f.ui._pauseOwners.size,0);}});
test('retirement during analytics, reward UI, init or owned unpause stops remaining effects',()=>{
 for(const at of ['onTrack','onTips','onPause']){
  const opts={};opts[at]=at==='onPause'?(paused,{game})=>{if(!paused)game._combatEpoch++;}:({game})=>{game._combatEpoch++;};
  const f=fixture('weapon1',opts);f.run();f.pending[0].success();assert.equal(f.calls.saves,0);assert.deepEqual(f.calls.cosmetics,[]);assert.equal(f.ui._pauseOwners.size,0);
 }
 const f=fixture('barracks',{onInit:({game})=>game._combatEpoch++});f.run();f.pending[0].success();assert.equal(f.calls.init,1);assert.equal(f.calls.roster,0);assert.equal(f.owner.VideoTimes,0);assert.equal(f.ui._pauseOwners.size,0);
});
test('retirement remains effective inside an already consuming reward callback',()=>{
 let f;f=fixture('weapon1',{onTrack:()=>f.helper.retire(f.game)});f.run();f.pending[0].success();assert.equal(f.calls.tracks,1);unchanged(f);assert.equal(f.ui._pauseOwners.size,0);
});
test('pending and opened confirmation UI belong to the captured offer',()=>{
 for(const opened of [false,true]){const f=fixture('barracks',{confirm:true});f.run();assert.equal(f.dialogs.length,1);const d=f.dialogs[0];if(opened)d.callbacks.onOpened(f.node());f.helper.retire(f.game);assert(d.dialog.cancelled);assert.equal(f.calls.closed,opened?1:0);d.callback(true);unchanged(f);assert.equal(f.ui._pauseOwners.size,0);}
});
test('confirmation cancellation releases its token and a valid confirmed reward still grants once',()=>{
 for(const kind of kinds){const f=fixture(kind,{confirm:true});f.run();f.dialogs[0].dialog.cancel();f.dialogs[0].callback(true);unchanged(f);assert.equal(f.ui._pauseOwners.size,0);const g=fixture(kind,{confirm:true});g.run();g.dialogs[0].callback(true);assert.equal(g.calls.tracks,2);assert.equal(g.ui._pauseOwners.size,0);}
});
test('real battle cleanup/disable/destroy retire pending offers and preserve another pause owner',()=>{
 for(const name of ['cleanMap','onDisable','onDestroy']){
  const f=fixture('weapon1'),other={};f.ui._pauseOwners.add(other);f.run();for(const key of ['ndPlayArr1','ndPlayArr2','ndEnemyArr','ndSoldArr','ndBuildArr1','ndBuildArr2'])f.game[key]=[];
  f.invoke('KinghtFallGameCtrl',name);f.pending[0].success();unchanged(f);assert.deepEqual([...f.ui._pauseOwners],[other]);assert.equal(f.game._gameplayAds.size,0);
 }
});
test('real barracks reset/disable/destroy retire the old offer before late SDK completion',()=>{
 for(const name of ['reset','onDisable','onDestroy']){
  const f=fixture('barracks');f.run();f.invoke('KinghtFallBuildBarracks',name,[false]);const rosterBefore=f.calls.roster;f.pending[0].success();assert.equal(f.owner.VideoTimes,0);assert.equal(f.calls.roster,rosterBefore);assert.equal(f.ui._pauseOwners.size,0);assert.equal(f.game._gameplayAds.size,0);
 }
});
