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
 const context={BattleSounds:sounds,require:name=>{assert.equal(name,'UnitVoices');return voices;}};
 method('KinghtFallGameCtrl','onPauseGame',context).call(g);method('KinghtFallGameCtrl','onResumeGame',context).call(g);
 assert.deepEqual(calls,[['battle',true],['voice',true],['hero',true],['enemy',true],['ally',true],['battle',false],['voice',false],['hero',false],['enemy',false],['ally',false]]);
});

test('stage initialization retires old voices before adopting a new combat epoch or loading its hero',()=>{
 const calls=[],game={_battleSounds:{},_unitVoices:{},_combatEpoch:4,ctrPlay:{initData:()=>calls.push('hero'),ndAgg:{}},buildBullet:{node:{}},ndAggFlag:{}};
 const saved={hasSave:()=>false},manager={getGameData:()=>saved};
 const context={BattleSounds:{dispose:()=>calls.push('battle')},GameToolsOverrides:{clear:()=>calls.push('clear')},
  require:name=>name==='UnitVoices'?{dispose:g=>{calls.push('voice');delete g._unitVoices;}}:{restore:()=>calls.push('relic')},
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
 f.modules.KinghtFallUIGame={default:{instance:{ctrGame:game}}};const named=f.load('KinghtFallAudioMgr').KinghtFallAudioMgr.getInstance(),context={BattleSounds:{suspend(){}}};
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
