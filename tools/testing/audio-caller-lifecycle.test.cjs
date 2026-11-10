'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const scripts=path.resolve(__dirname,'../../assets/_script');
const source=name=>fs.readFileSync(path.join(scripts,name+'.js'),'utf8').replace(/\r\n/g,'\n');
function method(file,name,context={}){
 const text=source(file),start=text.indexOf('  _ctor.prototype.'+name+' = function '),end=text.indexOf('\n  };',start);assert(start>=0&&end>=0);
 return vm.runInNewContext('('+text.slice(text.indexOf('function ',start),end+4)+')',context,{filename:file+'.'+name});
}

test('campaign pause and resume immediately suspend speech along with actors, without relying on another game tick',()=>{
 const calls=[],voices={suspend(game,paused){calls.push(['voice',paused]);}},sounds={suspend(game,paused){calls.push(['battle',paused]);}};
 const actor=name=>({setPause:paused=>calls.push([name,paused])}),g={_unitVoices:{},ctrPlay:actor('hero'),gameData:{getEnemyList:()=>[actor('enemy')],getSoldierList:()=>[actor('ally')]}};
 const context={BattleSounds:sounds,require:name=>name==='AudioMgr'?{AudioMgr:{getInstance:()=>({stopOwnedEffects(){}})}}:voices};
 g.setAudioPaused=method('KinghtFallGameCtrl','setAudioPaused',context);
 method('KinghtFallGameCtrl','onPauseGame',context).call(g);method('KinghtFallGameCtrl','onResumeGame',context).call(g);
 assert.deepEqual(calls,[['battle',true],['voice',true],['hero',true],['enemy',true],['ally',true],['battle',false],['voice',false],['hero',false],['enemy',false],['ally',false]]);
});

test('stage initialization retires old voices before adopting a new combat epoch or loading its hero',()=>{
 const calls=[],game={_battleSounds:{},_unitVoices:{},_combatEpoch:4,ctrPlay:{initData:()=>calls.push('hero'),ndAgg:{}},buildBullet:{node:{}},ndAggFlag:{}};
 const saved={hasSave:()=>false},manager={getGameData:()=>saved};
 const context={BattleSounds:{dispose:()=>calls.push('battle')},GameToolsOverrides:{clear:()=>calls.push('clear')},
  require:name=>name==='AudioMgr'?{AudioMgr:{getInstance:()=>({stopOwnedEffects(){}})}}:name==='UnitVoices'?{dispose:g=>{calls.push('voice');delete g._unitVoices;}}:{restore:()=>calls.push('relic')},
  $z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>manager}},$z1KinghtFallGameCtrlData:{default:function(g,id,restoring){calls.push('data');this.id=id;}}};
 method('KinghtFallGameCtrl','initData',context).call(game,9);
 assert.deepEqual(calls,['battle','voice','clear','data','relic','hero']);assert.equal(game._combatEpoch,5);assert.equal(game._unitVoices,undefined);assert.equal(game.gameData.id,9);
});

test('game over releases voices before pausing updates for the delayed result dialog',()=>{
 const calls=[],dialog={isCurrent:()=>true},g={_unitVoices:{},moveFun:()=>calls.push('move'),onPauseGame:()=>calls.push('pause')},scheduled=[];
 const ui={ctrGame:g,beginBattleDialog:()=>dialog,ctrUI:{setRevive:()=>calls.push('revive')},scheduleOnce:(callback,delay)=>scheduled.push({callback,delay})};
 const context={BattleSounds:{dispose:()=>calls.push('battle')},require:name=>{assert.equal(name,'UnitVoices');return{dispose:game=>{calls.push('voice');delete game._unitVoices;}};},$z1KinghtFallModle:{KinghtFallGameStage:{End:3}}};
 method('KinghtFallUIGame','onGameOver',context).call(ui,true);
 assert.deepEqual(calls,['battle','voice','move','pause','revive']);assert.equal(g._unitVoices,undefined);assert.equal(g.gameStatus,3);assert.equal(scheduled.length,1);assert.equal(scheduled[0].delay,1);
});

function adFixture(options={}){
 const timers=new Map(),requests=[],logs=[],writes=[],events=[],pending=[];let nextTimer=0;
 const state={ERROR:-1,PLAYING:1,PAUSED:2,STOPPED:3};
 class Source{
  constructor(){this.state=state.STOPPED;this.mute=true;this.audio={getState:()=>this.state};}
  get isPlaying(){return this.state===state.PLAYING;}play(){this.state=state.PLAYING;}pause(){if(this.isPlaying)this.state=state.PAUSED;}resume(){if(this.state===state.PAUSED)this.state=state.PLAYING;}stop(){this.state=state.STOPPED;}
 }
 const platform={showVideoAd(unit,type,yes,no){requests.push({kind:'rewarded',yes,no});},playMultitonVideo(a,b,c,yes,no){requests.push({kind:'multi',yes,no});},showInsertAd(id,done){requests.push({kind:'insert',done});}};
 const modules={BaseMgr:{default:function(){}},CacheUtils:{CacheUtils:{getData:()=>null,saveData:(...args)=>writes.push(args),canPlayMusin:()=>true,canPlayEffect:()=>true}},
  ResourceMgr:{ResourceMgr:{getInstance:()=>({loadRes(bundle,file,type,done){if(options.deferEffects&&file!=='bg')pending.push({file,done});else done({path:file});}})}},LogMgr:{LogMgr:{getInstance:()=>({error:(...args)=>logs.push(args),debug:(...args)=>logs.push(args)})}},
  Config:{UIID:{UITips:'tips'}},PlatformManager:{PlatformManager:{getInstance:()=>platform}},UIMgr:{UIMgr:{getInstance:()=>({openUI(){}})}},EventMgr:{EventMgr:{getInstance:()=>({emit:(...args)=>events.push(args)})}},
  Appcfg:{BaseEventName:{blocktouch:'block',AdStart:'ad'}},KinghtFallConfig:{KinghtFallEventName:{PlayVideoSucc:'result'}},Main:{default:{instance:{onPlayVideo(){}}}},TestMode:{TestMode:{getInstance:()=>({isEnabled:()=>false})}},AdPlacements:require('../../assets/_script/AdPlacements')};
 const cc={AudioSource:Source,AudioClip:function(){},_Audio:{State:state},game:{EVENT_HIDE:'hide',EVENT_SHOW:'show',on(){}},isValid:()=>true};
 function load(name){const context={exports:{},require:key=>modules[key]||{},cc,console,setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),__extends(C,B){C.prototype=Object.create(B.prototype);C.prototype.constructor=C;}};vm.runInNewContext(source(name),context,{filename:name+'.js'});return context.exports;}
 modules.AudioMgr=load('AudioMgr');const audio=modules.AudioMgr.AudioMgr.getInstance();audio.init({bg:{bundle:'audio',path:'bg'},hit:{bundle:'audio',path:'hit'}});audio.playMusic('bg','bg');const bg=audio.getAudioSource('bg'),sdk=load('SdkMgr').SdkMgr.getInstance();
 return{audio,bg,sdk,requests,platform,timers,logs,writes,events,modules,load,pending,cc,finish(){while(pending.length){const item=pending.shift();item.done({path:item.file});}},timeout(){for(const [id,timer] of [...timers]){timers.delete(id);timer.fn();}}};
}

test('interstitial and rewarded/multi ads keep independent audio pause ownership in either completion order',()=>{
 for(const multi of [false,true])for(const insertFirst of [false,true]){
  const f=adFixture();if(multi)f.sdk.playMultitonVideo(1,2,3,()=>{},()=>{});else f.sdk.playVideo(1,()=>{},()=>{},'test');
  f.sdk.showInsert('insert');assert.equal(f.bg.isPlaying,false);const [reward,insert]=f.requests;
  if(insertFirst){insert.done();insert.done();assert.equal(f.bg.isPlaying,false);reward.yes();}else{reward.yes();assert.equal(f.bg.isPlaying,false);insert.done();}
  assert.equal(f.bg.isPlaying,true);assert.equal(f.timers.size,0);assert.deepEqual(f.writes,[]);
 }
});

test('interstitial exceptions, absent completion and stale callbacks cannot strand or steal music pauses',()=>{
 for(const mode of ['throw','timeout']){
  const f=adFixture();let old;
  if(mode==='throw')f.platform.showInsertAd=()=>{throw Error('SDK unavailable');};
  f.sdk.showInsert('old');if(mode==='timeout'){old=f.requests[0];assert.equal(f.bg.isPlaying,false);f.timeout();}
  assert.equal(f.bg.isPlaying,true);assert.equal(f.timers.size,0);
  f.sdk.playVideo(1,()=>{},()=>{},'new');assert.equal(f.bg.isPlaying,false);if(old){old.done();old.done();assert.equal(f.bg.isPlaying,false);}
  f.requests.at(-1).yes();assert.equal(f.bg.isPlaying,true);assert.equal(f.timers.size,0);
 }
});

test('ad completion cannot release a legacy global or explicit per-channel music pause',()=>{
 for(const manual of [false,true]){
  const f=adFixture();if(manual)f.audio.pauseMusic('bg');else f.audio.pauseAllMusic();f.sdk.showInsert('insert');f.requests[0].done();
  assert.equal(f.bg.isPlaying,false);if(manual)f.audio.resumeMusic('bg');else f.audio.resumeAllMusic();assert.equal(f.bg.isPlaying,true);assert.equal(f.timers.size,0);assert.deepEqual(f.writes,[]);
 }
});

test('campaign actor effects cannot start after recycling, a wave/stage change or closing the battle',()=>{
 for(const retirement of ['actor','wave','data','closed']){
  const f=adFixture({deferEffects:true}),actor={node:{activeInHierarchy:true,_combatGeneration:1},_resourceGeneration:0},game={node:{activeInHierarchy:true},_combatEpoch:4,gameData:{},gameStatus:1};
  f.modules.KinghtFallUIGame={default:{instance:{ctrGame:game}}};const named=f.load('KinghtFallAudioMgr').KinghtFallAudioMgr.getInstance();
  named.playEffectFree('hit',actor);assert.equal(f.pending.length,1);
  if(retirement==='actor')actor.node._combatGeneration++;if(retirement==='wave')game._combatEpoch++;if(retirement==='data')game.gameData={};if(retirement==='closed')game.node.activeInHierarchy=false;
  f.finish();assert.equal(f.audio.getAudioSource('effect1').isPlaying,false,retirement);assert.equal(f.bg.isPlaying,true);assert.deepEqual(f.writes,[]);
 }
});

test('same-lifetime death cues remain audible while pooled Wall Defense identities reject obsolete hits',()=>{
 const f=adFixture({deferEffects:true}),actor={node:{activeInHierarchy:true,_combatGeneration:1},_resourceGeneration:0,isDead:()=>true};
 f.modules.KinghtFallUIGame={default:{instance:{ctrGame:{node:{activeInHierarchy:true},_combatEpoch:1,gameData:{},gameStatus:1}}}};
 f.load('KinghtFallAudioMgr').KinghtFallAudioMgr.getInstance().playEffectFree('hit',actor);f.finish();assert.equal(f.audio.getAudioSource('effect1').isPlaying,true,'death does not retire the current death sound');
 const g=adFixture({deferEffects:true}),enemy={node:{activeInHierarchy:true},_tagID:7,_resourceGeneration:0};
 g.audio.playEffectFree('hit',undefined,undefined,{owner:enemy});enemy._tagID++;g.finish();assert.equal(g.audio.getAudioSource('effect1').isPlaying,false);
});

test('hero death gain survives the actual music slider setter and revival restores the newly selected volume',()=>{
 const f=adFixture(),game={node:{activeInHierarchy:true},_combatEpoch:1,gameData:{getGameBuff:()=>null},gameStatus:1,gameTag:{}};
 const ui={default:{instance:{ctrGame:game}}};f.modules.KinghtFallUIGame=ui;
 const named=f.load('KinghtFallAudioMgr').KinghtFallAudioMgr.getInstance();let die,revive;
 const hero={node:{activeInHierarchy:true,_combatGeneration:1},time:{RebornTime:5},rigidBody:{},hpMax:100,hp:0,ctrHp:{setHp(){}},delAllBuff(){},sendEvent(){},ctrPlayAni:{setDie:fn=>{die=fn;},setRevive:fn=>{revive=fn;}}};
 const context={cc:f.cc,GameToolsOverrides:{cancel(){}},r:{Alive:0,Dead:1,Reborn:2},C:{RebornTime:'RebornTime',Reborn:'Reborn',hpRecover:'hpRecover',Attack:'Attack',RebornBuff1:'RebornBuff1',RebornBuff2:'RebornBuff2'},
  $z1AudioMgr:f.modules.AudioMgr,$z1KinghtFallAudioMgr:{KinghtFallAudioMgr:{getInstance:()=>named}},$z1KinghtFallUIGame:ui,$z1KinghtFallConfig:{KinghtFallParameter:{BGMusic:'bg',RunMusic:'run'},KinghtFallAudioId:{death:'hit',rebirth:'hit'},KinghtFallEventName:{ReviveShow:'revive'}},$z1KinghtFallEnum:{KinghtFallEnumLevelChalType:{NoDie:'NoDie'},KinghtFallEnumBuffCfg:{Buff13:'buff'}}};
 f.audio.setMusicVolume(.6);const writes=f.writes.length;
 method('KinghtFallGamePlayCtrl','onDead',context).call(hero);assert.equal(f.bg.volume,.3);assert.equal(f.writes.length,writes,'death is a transient gain, not a saved setting');die();
 f.audio.setMusicVolume(.8);assert.equal(f.bg.volume,.4,'the slider keeps the dead hero attenuation');method('KinghtFallGamePlayCtrl','onReborn',context).call(hero);assert.equal(f.bg.volume,.4);
 f.audio.setMusicVolume(.4);assert.equal(f.bg.volume,.2);revive();assert.equal(f.bg.volume,.4);assert.equal(f.audio.getMusicVolume(),.4);assert.equal(f.writes.length,writes+2);assert.equal(hero.hp,100);
});

test('a quick campaign pause/resume retires delayed actor cues while allowing new paused construction feedback',()=>{
 const f=adFixture({deferEffects:true}),actor={node:{activeInHierarchy:true,_combatGeneration:1}},game={node:{activeInHierarchy:true},_combatEpoch:1,gameData:{getEnemyList:()=>[],getSoldierList:()=>[]},gameStatus:1,ctrPlay:{setPause(){}}};
 f.modules.KinghtFallUIGame={default:{instance:{ctrGame:game}}};const named=f.load('KinghtFallAudioMgr').KinghtFallAudioMgr.getInstance(),context={BattleSounds:{suspend(){}},require:name=>f.modules[name]};
 game.setAudioPaused=method('KinghtFallGameCtrl','setAudioPaused',context);
 named.playEffectFree('hit',actor);method('KinghtFallGameCtrl','onPauseGame',context).call(game);method('KinghtFallGameCtrl','onResumeGame',context).call(game);f.finish();assert.equal(f.audio.getAudioSource('effect1').isPlaying,false);
 method('KinghtFallGameCtrl','onPauseGame',context).call(game);named.playEffectFree('hit',actor);method('KinghtFallGameCtrl','onResumeGame',context).call(game);assert.equal(f.audio.getAudioSource('effect1').isPlaying,true);
});

test('closing a battle while the hero is dead restores menu music to the selected volume without rewriting preferences',()=>{
 const f=adFixture();f.audio.ADConf.menu={bundle:'audio',path:'menu'};f.audio.setMusicVolume(.6);f.audio.setChannelGain('bg',.5);assert.equal(f.bg.volume,.3);const writes=f.writes.length;
 const config={KinghtFallParameter:{BGMusic:'bg'},KinghtFallAudioId:{menu_bgm:'menu'},KinghtFallUIID:{UIHome:'home'}},home={initViewTogg(){},showRed(){}};
 const enable=method('KinghtFallUIHome','onEnable',{$z1Main:{default:{instance:{uiTop:{}}}},$z1AudioMgr:f.modules.AudioMgr,$z1KinghtFallConfig:config,$z1PoolMgr:{PoolMgr:{getInstance:()=>({clearPool(){}})}}});
 const node={};Object.defineProperty(node,'active',{set(value){if(value)enable.call(home);}});
 const ui={ctrGame:{},cancelBattleDialog(){},_stopTestMovement(){}};
 method('KinghtFallUIGame','onClose',{BattleSounds:{dispose(){}},$z1AudioMgr:f.modules.AudioMgr,$z1KinghtFallConfig:config,TestMode:{getInstance:()=>({removeGameplayTarget(){}})},$z1UIMgr:{UIMgr:{getInstance:()=>({getUIById:()=>({node})})}}}).call(ui);
 assert.equal(f.bg.clip.path,'menu');assert.equal(f.bg.volume,.6);assert.equal(f.audio.getMusicVolume(),.6);assert.equal(f.writes.length,writes);
});

test('Wall Defense entry replaces menu music only after opening, and exit restores a single menu loop',()=>{
 for(const cancelled of [false,true]){
  const f=adFixture(),config={KinghtFallParameter:{BGMusic:'bg'},KinghtFallAudioId:{menu_bgm:'menu'},KinghtFallUIID:{UIHome:'home'}};
  Object.assign(f.audio.ADConf,{menu:{bundle:'audio',path:'menu'},wall:{bundle:'audio',path:'wall'}});
  const gad={GAD_UIID:{UIGame:'wall-game',UIResult:'wall-result',UIPause:'wall-pause'},GAD_AudioId:{bgm:'wall',mission:'hit'},GADConfig:{BgMusic:'wall-bg',EnergyCost:10},emGADGameState:{Over:3}};
  f.modules.GAD_Configs=gad;f.modules.KinghtFallConfig=config;
  f.modules.GAD_PlayerMgr={default:{getInstance:()=>({readyForRun:()=>true,reset(){},setState(){},finishRun(){}})}};
  f.cc.systemEvent={on(){},off(){}};f.cc.SystemEvent={EventType:{KEY_UP:'keyup'}};
  let opened;const home={initViewTogg(){},showRed(){}},homeEnable=method('KinghtFallUIHome','onEnable',{$z1Main:{default:{instance:{uiTop:{}}}},$z1AudioMgr:f.modules.AudioMgr,$z1KinghtFallConfig:config,$z1PoolMgr:{PoolMgr:{getInstance:()=>({clearPool(){}})}}});
  const homeNode={};Object.defineProperty(homeNode,'active',{set(value){if(value)homeEnable.call(home);}});
  f.modules.UIMgr={UIMgr:{getInstance:()=>({getUIById:()=>({node:homeNode}),closeById(){},openUIWithOwner(_id,_from,owner){opened=owner.onOpened;return{cancel(){}};}})}};
  const app=f.load('GAD_App').default.instance;app._isInited=true;app.addTouchEvent=app.removeTouchEvent=()=>{};
  const player={getUserData:()=>({getMaxStage:()=>10,getPowerNum:()=>10,data:{}}),getDailyData:()=>({getSubTimeByIndex:()=>0,setSubTimeByIndex(){}})};
  const context={$z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>player}},$z1GAD_App:{default:{instance:app}},$z1AudioMgr:f.modules.AudioMgr,$z1KinghtFallConfig:config,$z1UIMgr:f.modules.UIMgr,require:name=>f.modules[name]};
  method('KinghtFallHomeBattleCtrl','EnterSubPlay',context).call({subPlayStage:[2],subPlayTime:[0],refreshSubView(){}},0);
  assert.equal(f.bg.isPlaying,true,'pending entry keeps the menu loop');
  if(cancelled)app.exit_App();opened();
  if(cancelled){assert.equal(f.bg.isPlaying,true);assert.equal(f.audio.audioSourceMap.has('wall-bg'),false,'late entry cannot start another loop');}
  else{assert.equal(f.bg.isPlaying,false,'menu must stop once Wall Defense owns the screen');assert.equal(f.audio.getAudioSource('wall-bg').isPlaying,true);app.exit_App();assert.equal(f.bg.isPlaying,true);assert.equal(f.bg.clip.path,'menu');assert.equal(f.audio.getAudioSource('wall-bg').isPlaying,false);}
  assert.deepEqual(f.writes,[]);
 }
});

test('Wall Defense result plays the configured success or failure cue for its actual outcome',()=>{
 for(const win of [false,true]){
  const f=adFixture();Object.assign(f.audio.ADConf,{victory:{bundle:'audio',path:'victory'},failure:{bundle:'audio',path:'failure'}});
  const panel={node:{activeInHierarchy:true},_resourceGeneration:1,resultSp:{setAnimation(){},setCompleteListener(){}},btnExit:{on(){}},addEvent(){},refreshResult(){},loadPrefab(){}};
  method('GAD_UIResult','init').call(panel,win);
  method('GAD_UIResult','start',{$z1AudioMgr:f.modules.AudioMgr,$z1GAD_Configs:{GADConfig:{BgMusic:'wall-bg'},GAD_AudioId:{victory:'victory',fail:'failure'}},$z1KinghtFallConfig:{KinghtFallBundelName:{IconGood:'goods'},KinghtFallPrefabName:{ItemGood:'good'}},cc:{Node:{EventType:{TOUCH_END:'end'}}}}).call(panel);
  assert.equal(f.audio.getAudioSource('effect1').clip.path,win?'victory':'failure');assert.deepEqual(f.writes,[]);
 }
});

test('the campaign UI cancels actor audio immediately even if pause/resume happens before the scheduled physics step',()=>{
 for(const quickResume of [false,true]){
  const f=adFixture({deferEffects:true}),scheduled=[],actor={node:{activeInHierarchy:true,_combatGeneration:1}},game={node:{activeInHierarchy:true},_combatEpoch:1,gameStatus:1,gameData:{getEnemyList:()=>[],getSoldierList:()=>[]},ctrPlay:{setPause(){}}};
  f.modules.KinghtFallUIGame={default:{instance:{ctrGame:game}}};const named=f.load('KinghtFallAudioMgr').KinghtFallAudioMgr.getInstance(),context={BattleSounds:{suspend(){}},require:name=>f.modules[name]};
  game.setAudioPaused=method('KinghtFallGameCtrl','setAudioPaused',context);
  game.onPauseGame=method('KinghtFallGameCtrl','onPauseGame',context);game.onResumeGame=method('KinghtFallGameCtrl','onResumeGame',context);
  const ui={ctrGame:game,scheduleOnce:callback=>scheduled.push(callback),_stopTestMovement(){},sendEvent(){}};
  ui.onPauseGame=method('KinghtFallUIGame','onPauseGame',{$z1KinghtFallConfig:{KinghtFallEventName:{PlayVideoSucc:'ad'}},TestMode:{getInstance:()=>({clearGameplayInput(){}})}});
  named.playEffectFree('hit',actor);ui.onPauseGame(true);if(quickResume)ui.onPauseGame(false);f.finish();
  assert.equal(f.audio.getAudioSource('effect1').isPlaying,false,'a pending shot cannot cross the UI pause boundary');
  for(const callback of scheduled.splice(0))callback();
  if(!quickResume){named.playEffectFree('hit',actor);ui.onPauseGame(true);for(const callback of scheduled.splice(0))callback();f.finish();assert.equal(f.audio.getAudioSource('effect1').isPlaying,true,'repeated pause does not retire new paused construction feedback');}
 }
});

test('Wall Defense pause and result boundaries retire already requested actor cues without suppressing new lottery feedback',()=>{
 for(const boundary of ['pause','quick-resume','over']){
  const f=adFixture({deferEffects:true}),game={node:{activeInHierarchy:true}},actor={node:{activeInHierarchy:true},_cards:[{addLev:()=>1,getCardCfg:()=>({id:7,cardATK:4})}],atkDamage:5};
  f.modules.GAD_UIGame={default:{script:game}};f.modules.GAD_Configs={emGADGameState:{Game:1,Pause:2,Over:3},GAD_AudioId:{Cards:'hit'}};
  const player=f.load('GAD_PlayerMgr').default.getInstance();player._audioGame=game;player.tickRun=()=>{};player.setState(1);f.modules.GAD_PlayerMgr={default:{getInstance:()=>player}};
  const add=method('GAD_Cards','addCardLev',{$z1GAD_PlayerMgr:f.modules.GAD_PlayerMgr,$z1AudioMgr:f.modules.AudioMgr,$z1GAD_Configs:f.modules.GAD_Configs,require:name=>f.modules[name]});
  add.call(actor,7,1);player.setState(boundary==='over'?3:2);if(boundary==='quick-resume')player.setState(1);f.finish();
  assert.equal(f.audio.getAudioSource('effect1').isPlaying,false,'obsolete Wall Defense feedback crossed '+boundary);
  if(boundary==='pause'){add.call(actor,7,1);player.setState(2);f.finish();assert.equal(f.audio.getAudioSource('effect1').isPlaying,true,'new lottery upgrades may sound while combat is paused');}
  assert.deepEqual(f.writes,[]);
 }
});

test('closing an obsolete Wall Defense view stops its own actor audio while preserving a newer view and its sounds',()=>{
 const f=adFixture(),old={node:{activeInHierarchy:true},_bullets:[],_collisionBounds:new Map(),_passedDoors:[],_doors:[],_hitDoorGroups:new Set(),_hitEffectRoles:new Set()},current={node:{activeInHierarchy:true}},actor=()=>({node:{activeInHierarchy:true}});
 const player=f.load('GAD_PlayerMgr').default.getInstance();player._audioGame=current;
 f.audio.playEffectFree('hit',undefined,undefined,{owner:actor(),game:old});f.audio.playEffectFree('hit',undefined,undefined,{owner:actor(),game:current});
 const oldSound=f.audio.getAudioSource('effect1'),currentSound=f.audio.getAudioSource('effect2');assert.equal(oldSound.isPlaying,true);assert.equal(currentSound.isPlaying,true);
 method('GAD_UIGame','onClose',{$z1AudioMgr:f.modules.AudioMgr,$z1GAD_PlayerMgr:{default:{getInstance:()=>player}},n:{script:current}}).call(old);
 assert.equal(oldSound.isPlaying,false);assert.equal(currentSound.isPlaying,true);assert.equal(player._audioGame,current);assert.deepEqual(f.writes,[]);
});

test('battle entry and rally cues cannot finish loading into a later menu',()=>{
 const f=adFixture({deferEffects:true}),game={node:{activeInHierarchy:true},_combatEpoch:1,gameData:{},rallyCommand(){}};
 method('KinghtFallUIGame','rallyCommand',{$z1AudioMgr:f.modules.AudioMgr,$z1KinghtFallConfig:{KinghtFallAudioId:{set_of:'hit'},KinghtFallEventName:{PlayVideoSucc:'ad'}}}).call({ctrGame:game,sendEvent(){},_refreshArmyButtons(){}});
 game.node.activeInHierarchy=false;f.finish();assert.equal(f.audio.getAudioSource('effect1').isPlaying,false,'rally cue must belong to its battle');
 const g=adFixture({deferEffects:true}),gad={GAD_UIID:{UIGame:'game',UIResult:'result',UIPause:'pause'},GAD_AudioId:{bgm:'bg',mission:'hit'},GADConfig:{BgMusic:'wall-bg'},emGADGameState:{Game:1,Over:3}};
 g.modules.GAD_Configs=gad;const player=g.load('GAD_PlayerMgr').default.getInstance();player._audioGame={node:{activeInHierarchy:true}};player.readyForRun=()=>true;player.reset=()=>{};
 g.modules.GAD_PlayerMgr={default:{getInstance:()=>player}};g.modules.UIMgr={UIMgr:{getInstance:()=>({openUIWithOwner(_id,_from,owner){owner.onOpened();return{cancel(){}};},closeById(){}})}};
 g.cc.systemEvent={on(){},off(){}};g.cc.SystemEvent={EventType:{KEY_UP:'keyup'}};
 const app=g.load('GAD_App').default.instance;app._isInited=true;app.addTouchEvent=app.removeTouchEvent=()=>{};app.enter_App();app.exit_App();g.finish();
 assert.equal(g.audio.getAudioSource('effect').isPlaying,false,'entry cue must belong to its Wall Defense run');assert.deepEqual(f.writes,[]);assert.deepEqual(g.writes,[]);
});

test('tutorial pause steps immediately suspend presentation without scheduling actor physics or retiring new paused feedback twice',()=>{
 const f=adFixture(),suspended=[],game={node:{activeInHierarchy:true},_combatEpoch:1,gameData:{baseBuild:{ndLockList:[{}],getLevel:()=>0}},_unitVoices:{},camera:{},onPauseGame(){throw Error('tutorial must preserve its actor physics behavior');}};
 f.modules.UnitVoices={suspend(_game,paused){suspended.push(['voices',paused]);}};
 game.setAudioPaused=method('KinghtFallGameCtrl','setAudioPaused',{BattleSounds:{suspend(_game,paused){suspended.push(['battle',paused]);}},require:name=>f.modules[name]});
 f.modules.KinghtFallUIGame={default:{instance:{ctrGame:game}}};const named=f.load('KinghtFallAudioMgr').KinghtFallAudioMgr.getInstance(),actor={node:{activeInHierarchy:true}};
 let step=0;const guide={getGroupId:()=>2,getStepId:()=>step},single=value=>({getInstance:()=>value});
 const start=method('KinghtFallUIGame','startGuide',{$z1PlatformSetting:{PlatformSetting:{currentPlatform:'editor'}},$z1BasePlatform:{Platform:{WEB_LINK:'web'}},$z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:single({getGuideData:()=>guide})},$z1KinghtFallDataMgr:{KinghtFallDataMgr:single({getGuideCfgById:()=>[{},{},{},{}]})},$z1UIGuide:{GuildCfg:function(){}},$z1PlayerMgr:{PlayerMgr:single({getTrackData:()=>({youmengTrack(){}})})},$z1GameTrackDataEvent:{TrackId:{}},$z1Config:{UIID:{UIGuide:'guide'}},cc:{v2:(x,y)=>({x,y}),Size:function(w,h){this.width=w;this.height=h;}}});
 const ui={ctrGame:game,isPauset:false,ndCoin:{},btnStartFight:{},enemyIconInfo:{},openUICallBack(){}};
 named.playEffectFree('hit',actor);const sound=f.audio.getAudioSource('effect1');assert.equal(sound.isPlaying,true);
 start.call(ui);assert.equal(ui.isPauset,true);assert.equal(sound.isPlaying,false,'the tutorial must retire active actor cues before suppressing updates');
 named.playEffectFree('hit',actor);start.call(ui);assert.equal(sound.isPlaying,true,'reopening the same paused step keeps newly requested construction feedback');assert.equal(game._audioPauseEpoch,1);
 for(step=1;step<4;step++){start.call(ui);assert.equal(ui.isPauset,step===2);}
 assert.deepEqual(suspended,[['battle',true],['voices',true],['battle',false],['voices',false],['battle',true],['voices',true],['battle',false],['voices',false]]);assert.equal(game._audioPauseEpoch,2);assert.deepEqual(f.writes,[]);
});

test('perk barracks announcements survive the actual UI wave cleanup and select the committed tier once',()=>{
 const f=perkAnnouncementFixture();f.choose([1,2]);f.voices.tick(f.game);f.finish();
 const clips=[...f.audio.audioSourceMap.values()].filter(source=>source.isPlaying&&source.clip&&/crossbowman-level-3-variant-/.test(source.clip.path));
 assert.equal(clips.length,1,'the perk announcement must be requested after old-epoch cleanup');
 assert.equal(f.audio.getAudioSource('effect1').isPlaying,true,'the generic upgrade cue must survive cleanup too');assert.equal(f.audio.getAudioSource('effect1').clip.path,'hit');
 assert.deepEqual(f.order,['unpause','level','buff:1','buff:2','cleanup','view','map','buttons','save','sound:2']);
 assert.equal(f.game._upgradeAudioQueue,undefined);assert.deepEqual(f.writes,[]);
});

function perkAnnouncementFixture(mode='normal'){
 const f=adFixture(),order=[],scheduled=[];f.cc.resources={};f.cc.isValid=value=>!!value&&!value.destroyed;
 const game={node:{activeInHierarchy:true},_combatEpoch:1,gameStatus:1,ndPlayArr2:[],ndEnemyArr:[],ndSoldArr:[],ndBuildArr2:[],ctrPlay:{ndRange:{},endRoundGame(){},ctrPlayAni:{setLevelUp(){order.push('level');}}}},dialog={isCurrent:()=>true};
 const ui={node:{activeInHierarchy:true},_resourceGeneration:1,ctrGame:game,isPauset:false,beginBattleDialog:()=>dialog,finishBattleDialog(){order.push('unpause');this.isPauset=false;},onPauseGame(paused){this.isPauset=paused;},playPlanningMusic(){},scheduleOnce:callback=>scheduled.push(callback),openBattleDialog(_dialog,_id,_opened,choice){this.choice=choice;},btnBuildInfo:{},ctrUI:{},initView(){order.push('view');},initBtnView(){order.push('buttons');}};
 f.modules.KinghtFallUIGame={default:{instance:ui}};f.modules.KinghtFallModle={KinghtFallGameStage:{End:3,Prepare:0,Transition:2}};
 const voices=f.load('UnitVoices');f.modules.UnitVoices=voices;
 const building={node:{activeInHierarchy:true},index:2,buildCfg:{enumValue:3},buildInfo:{cfg:{Data:[4,90003,8],level:2}},getBranchCfg(){return this.buildInfo.cfg;}};
 const sounds={effect(){order.push('sound:'+game._combatEpoch);}};
 building.onUpgradeCommitted=method('KinghtFallBuildBarracks','onUpgradeCommitted',{$z1KinghtFallUIGame:f.modules.KinghtFallUIGame,BattleSounds:sounds,cc:f.cc,require:name=>f.modules[name]});
 building._playUpgradeAudio=method('KinghtFallBuildBase','_playUpgradeAudio',{$z1KinghtFallUIGame:f.modules.KinghtFallUIGame,$z1AudioMgr:f.modules.AudioMgr,$z1KinghtFallConfig:{KinghtFallAudioId:{buliding:'hit'}}});
 const data=game.gameData={coin:10,addTime:{soldier:0},getGameBuff:()=>null,upMap(){order.push('map');},addGameBuff(id){order.push('buff:'+id);building.index=3;building.buildInfo.cfg={Data:[4,90003,8],level:3};building._playUpgradeAudio();if(mode==='buff-error')throw Error('controlled perk error');}};
 game.cleanMap=method('KinghtFallGameCtrl','cleanMap',{BattleSounds:{},require:name=>f.modules[name]});
 game.endRoundGame=function(){order.push('cleanup');this.cleanMap();if(mode==='cleanup-error')throw Error('controlled cleanup error');if(mode==='closed')ui.isclose=true;if(mode==='reused')ui._resourceGeneration++;if(mode==='actor')building.node.activeInHierarchy=false;if(mode==='data')this.gameData={...data};if(mode==='game')ui.ctrGame={...game};if(mode==='other-ui')f.modules.KinghtFallUIGame.default.instance={...ui};};
 game.saveGame=()=>{order.push('save');};
 const prior=mode==='nested'||mode.endsWith('error')?new Set():undefined;game._upgradeAudioQueue=prior;
 const end=method('KinghtFallUIGame','endRoundGame',{BattleSounds:{},cc:f.cc,require:name=>f.modules[name],$z1KinghtFallConfig:{KinghtFallParameter:{BattleNightStrength:0},KinghtFallUIID:{UIBuff:'perk'}},$z1KinghtFallModle:f.modules.KinghtFallModle,$z1KinghtFallGameCtrlData:{KinghtFallTimeType:{KillSoldier2:'soldier'}},$z1KinghtFallEnum:{KinghtFallEnumBuffCfg:{Buff04:'bonus'}}});
 end.call(ui);scheduled.shift()();
 return{...f,game,ui,data,building,voices,order,prior,choose:ids=>ui.choice(ids)};
}

test('a failed perk or wave cleanup restores the outer presentation collector and never flushes upgrade audio',()=>{
 for(const mode of ['buff-error','cleanup-error']){
  const f=perkAnnouncementFixture(mode);assert.throws(()=>f.choose([1,2]),/controlled/);f.voices.tick(f.game);f.finish();
  assert.equal(f.game._upgradeAudioQueue,f.prior);assert.equal(f.prior.size,0);assert.equal(f.order.some(item=>item.startsWith('sound:')),false);assert.equal(f.order.includes('save'),false);assert.deepEqual(f.writes,[]);
 }
});

test('perk cleanup never flushes upgrade presentation through a retired UI, data scope or building',()=>{
 for(const mode of ['closed','reused','actor','data','game','other-ui']){
  const f=perkAnnouncementFixture(mode);f.choose([1,2]);f.voices.tick(f.game);f.finish();
  assert.equal(f.game._upgradeAudioQueue,undefined);assert.equal(f.order.some(item=>item.startsWith('sound:')),false,mode);assert.equal(f.order.filter(item=>item==='save').length,1,mode);assert.deepEqual(f.writes,[]);
 }
});

test('a nested perk collector restores its outer owner and deduplicates committed buildings into that owner',()=>{
 const f=perkAnnouncementFixture('nested');f.choose([1,2]);assert.equal(f.game._upgradeAudioQueue,f.prior);assert.equal(f.prior.size,1);assert.equal(f.prior.has(f.building),true);assert.equal(f.order.some(item=>item.startsWith('sound:')),false);assert.deepEqual(f.writes,[]);
});
