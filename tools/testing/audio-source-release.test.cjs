'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const scripts=path.resolve(__dirname,'../../assets/_script');
function fixture(){
 const pending=[],played=[],deferred=[],listeners=[],errors=[],writes=[],released=[];
 const states={ERROR:-1,PLAYING:1,PAUSED:2,STOPPED:3};
 class Source{
  constructor(){this.node=null;this._enabled=true;this.mute=true;this.state=3;this.audio={getState:()=>this.state,destroy:()=>{released.push(this);this.state=3;}};}
  get isPlaying(){return this.state===1;}
  play(){this.state=1;played.push(this);} stop(){this.state=3;} pause(){this.state=2;} resume(){if(this.state===2)this.state=1;}
  // Creator Component.destroy schedules deferred destruction before dereferencing
  // node._activeInHierarchy. Catching its exception leaves a poisoned queue.
  destroy(){deferred.push(this);if(this._enabled&&this.node._activeInHierarchy)this.enabled=false;}
 }
 const node=()=>({x:0,y:0,activeInHierarchy:true}),hero={node:node(),isDead:()=>false,_relicHero:true},data={round:1,levelCfg:{prefab:'Map01',EnvironmentBiome:'lava'},getSoldierList:()=>[],getEnemyList:()=>[]},game={node:node(),gameData:data,_combatEpoch:1,gameStatus:0,ctrPlay:hero},ui={node:node(),ctrGame:game,isclose:false};
 const modules={BaseMgr:{default:function(){}},CacheUtils:{CacheUtils:{getData:()=>null,saveData:(...args)=>writes.push(args),canPlayEffect:()=>true,canPlayMusin:()=>true}},ResourceMgr:{ResourceMgr:{getInstance:()=>({loadRes(bundle,file,type,done){pending.push({file,done});}})}},LogMgr:{LogMgr:{getInstance:()=>({error:(...args)=>errors.push(args)})}},BattleSoundCatalog:require('../../assets/_script/BattleSoundCatalog'),KinghtFallUIGame:{default:{instance:ui}},KinghtFallModle:{KinghtFallGameStage:{End:3,Prepare:0,Transition:2}}};
 const cc={resources:{},AudioSource:Source,AudioClip:function(){},_Audio:{State:states},isValid:o=>!!o&&!o.destroyed,game:{EVENT_HIDE:'hide',EVENT_SHOW:'show',on(event,fn,target){listeners.push({event,fn,target});},off(event,fn,target){const at=listeners.findIndex(v=>v.event===event&&v.fn===fn&&v.target===target);if(at>=0)listeners.splice(at,1);}}};
 function load(name){const context={exports:{},require:n=>modules[n],cc,Date,WeakMap,WeakSet,console,__extends(C,B){C.prototype=Object.create(B.prototype);C.prototype.constructor=C;}};vm.runInNewContext(fs.readFileSync(path.join(scripts,name+'.js'),'utf8'),context,{filename:name+'.js'});return context.exports;}
 modules.AudioMgr=load('AudioMgr');const manager=modules.AudioMgr.AudioMgr.getInstance();manager.init({});const sounds=load('BattleSounds'),voices=load('UnitVoices');modules.UnitVoices=voices;
 function finish(){while(pending.length){const request=pending.shift();request.done({path:request.file,duration:1});}}
 function method(name,file='KinghtFallGameCtrl',extra={}){const text=fs.readFileSync(path.join(scripts,file+'.js'),'utf8').replace(/\r\n/g,'\n'),start=text.indexOf('  _ctor.prototype.'+name+' = function '),end=text.indexOf('\n  };',start);assert(start>=0&&end>=0);return vm.runInNewContext('('+text.slice(text.indexOf('function ',start),end+4)+')',{cc,BattleSounds:sounds,require:n=>modules[n],$z1KinghtFallUIGame:modules.KinghtFallUIGame,...extra});}
 return {manager,sounds,voices,game,hero,data,ui,cc,modules,pending,played,released,deferred,listeners,errors,writes,finish,method};
}

test('standalone audio cleanup never calls Component.destroy or poisons its deferred destruction queue',()=>{
 const f=fixture(),s=f.manager.getAudioSource('battle');f.manager.playSource(s,{bundle:'audio',path:'shot'},'battle',true,false,()=>1);f.finish();assert.equal(s.node,null);
 assert.doesNotThrow(()=>f.manager.releaseAudioSource('battle',s));assert.equal(f.deferred.length,0);assert.deepEqual(f.released,[s]);assert.equal(f.manager.audioSourceMap.size,0);assert.equal(f.manager.channelStates.size,0);assert.equal(f.manager.releaseAudioSource('battle',s),false);assert.deepEqual(f.writes,[]);assert.deepEqual(f.errors,[]);
});
test('release cancels delayed playback, ignores retired handles and cannot remove a replacement channel',()=>{
 const f=fixture(),m=f.manager,s=m.getAudioSource('effect');m.freeEffectMap.set('effect',s);m.playSource(s,{bundle:'audio',path:'late'},'effect',false,false,()=>1);m.releaseAudioSource('effect',s);f.finish();assert.equal(f.played.length,0);assert.equal(m.freeEffectMap.size,0);m.stopSource(s);assert.equal(m.channelStates.size,0);assert.equal(m.playSource(s,{bundle:'audio',path:'late'},'effect',false,false,()=>1),false);
 const next=m.getAudioSource('effect');assert.notEqual(next,s);assert.equal(m.releaseAudioSource('effect',s),false);assert.equal(m.audioSourceMap.get('effect'),next);m.freeEffectMap.set('effect',next);const replacement=m.creatreAudioSource('effect');assert.equal(m.freeEffectMap.get('effect'),replacement);assert.equal(m.audioSourceMap.get('effect'),replacement);assert.equal(f.deferred.length,0);assert.equal(f.released.filter(v=>v===next).length,1);
});
test('node-owned sources still use the component lifecycle exactly once',()=>{
 const f=fixture(),s=f.manager.getAudioSource('attached');s.node={_activeInHierarchy:true};assert.equal(f.manager.releaseAudioSource('attached',s),true);assert.equal(f.deferred.length,1);assert.equal(f.deferred[0],s);assert.equal(f.manager.releaseAudioSource('attached',s),false);
});
test('battle and voice retirement is safe on the native null-node component path and rejects late audio',()=>{
 for(const retirement of ['dispose','epoch','closed','hide']){const f=fixture();f.sounds.start(f.game);f.finish();f.sounds.tick(f.game);f.finish();const owner={node:{activeInHierarchy:true},buildCfg:{enumValue:3},index:1,buildInfo:{cfg:{level:1,Data:[4,90001,8]}}};f.voices.announce(owner);f.voices.tick(f.game);f.finish();assert(f.manager.audioSourceMap.size>=2);
  f.sounds.effect('impact-flesh-light',f.hero);const before=f.played.length;if(retirement==='epoch')f.game._combatEpoch++;if(retirement==='closed')f.ui.isclose=true;
  assert.doesNotThrow(()=>{if(retirement==='hide'){for(const event of f.listeners.slice().filter(e=>e.event==='hide'))event.fn.call(event.target);}else if(retirement==='dispose'){f.sounds.dispose(f.game);f.voices.dispose(f.game);}else{f.sounds.tick(f.game);f.voices.tick(f.game);}});f.finish();assert.equal(f.played.length,before);assert.equal(f.deferred.length,0);if(retirement!=='hide'){assert.equal(f.manager.audioSourceMap.size,0);assert.equal(f.manager.channelStates.size,0);}assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);
 }
});

test('selecting perks across repeated waves completes cleanup, unpauses, saves once and restores battle audio',()=>{
 const f=fixture(),g=f.game,ui=f.ui,d=f.data,chosen=[],scheduled=[];let saved=0,updated=0;
 const identity=p=>p,coin={x:0,y:0,destroy(){},setParent(){}},coinRoot={position:{x:0,y:0},children:[coin]},building={node:{convertToWorldSpaceAR:identity},ndHp:{getPosition:()=>({x:0,y:0})}};
 f.cc.v2=(x=0,y=0)=>({x,y});f.cc.v3=(x,y,z)=>({x,y,z});f.cc.Vec2={random(out,r){out.x=r;out.y=0;}};f.cc.instantiate=()=>({...coin});f.cc.tween=()=>({set(){return this;},by(){return this;},to(){return this;},call(){return this;},start(){}});
 Object.assign(d,{addTime:{soldier:0},coin:10,obstacles:[],addGameBuff:id=>chosen.push(id),getGameBuff:()=>null,setLight(){},upMap(){updated++;},endRoundGame:()=>[building]});
 Object.assign(g,{ndBg:{children:[]},camera:{getWorldToScreenPoint:identity},ndPlayArr2:[],ndPlayArr1:[],ndEnemyArr:[],ndSoldArr:[],ndBuildArr2:[],ndBuildArr1:[],saveGame(){saved++;}});
 g.ctrPlay.ndRange={active:true};g.ctrPlay.ctrPlayAni={setLevelUp(){}};g.ctrPlay.endRoundGame=()=>{};
 g.cleanMap=f.method('cleanMap');g.endRoundGame=f.method('endRoundGame');
 Object.assign(ui,{ndCoin:coinRoot,uid:'KinghtFallUIGame',btnBuildInfo:{active:false},ctrUI:{ndLight:{},node:{convertToNodeSpaceAR:identity}},scheduleOnce:fn=>scheduled.push(fn),playPlanningMusic(){},initView(){},initBtnView(){},onPauseGame(paused){g.paused=paused;f.sounds.suspend(g,paused);}});
 ui.beginBattleDialog=f.method('beginBattleDialog','KinghtFallUIGame');ui.finishBattleDialog=f.method('finishBattleDialog','KinghtFallUIGame');ui.cancelBattleDialog=()=>{};
 let choose;ui.openBattleDialog=(dialog,id,opened,selection)=>{opened();choose=selection;};
 const endWave=f.method('endRoundGame','KinghtFallUIGame',{$z1KinghtFallConfig:{KinghtFallParameter:{BattleNightStrength:0},KinghtFallUIID:{UIBuff:'perk'}},$z1KinghtFallModle:f.modules.KinghtFallModle,$z1KinghtFallGameCtrlData:{KinghtFallTimeType:{KillSoldier2:'soldier'}},$z1KinghtFallEnum:{KinghtFallEnumBuffCfg:{Buff04:'bonus'}}});
 f.sounds.start(g);f.finish();
 for(let round=1;round<=20;round++){
  d.round=round;f.sounds.tick(g);f.finish();assert(g._battleSounds);const beforeEpoch=g._combatEpoch;
  assert.doesNotThrow(()=>{endWave.call(ui);scheduled.shift()();});assert.equal(g.paused,true);assert.equal(ui.canBreak,false);assert.equal(typeof choose,'function');
  assert.doesNotThrow(()=>choose([50000+round]));assert.equal(g.paused,false);assert.equal(ui._battleDialog,null);assert.equal(ui.canBreak,true);assert.equal(saved,round);assert.equal(updated,round);assert.equal(chosen.at(-1),50000+round);assert.equal(g._combatEpoch,beforeEpoch+1);assert.equal(g._battleSounds.epoch,g._combatEpoch,'audio resumes on the new wave epoch');
  f.sounds.tick(g);f.finish();assert(f.played.some(source=>source.clip.path==='sfx/ambience-lava-loop'&&source.isPlaying));assert(f.manager.audioSourceMap.size<=2,'completed waves do not accumulate channels');assert.equal(f.deferred.length,0,'no detached components enter the engine destroy queue');assert.equal(f.listeners.length,4,'wave resets retain one manager and one battle lifecycle listener pair');
 }
 f.sounds.dispose(g);assert.equal(f.manager.audioSourceMap.size,0);assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);
});

test('a failing native handle release still clears ownership and lets the remaining battle cleanup finish',()=>{
 const f=fixture();f.sounds.start(f.game);f.finish();f.sounds.tick(f.game);f.finish();const source=[...f.manager.audioSourceMap.values()][0];source.audio.destroy=()=>{throw Error('device already closed');};assert.doesNotThrow(()=>f.sounds.dispose(f.game));assert.equal(f.game._battleSounds,undefined);assert.equal(f.manager.audioSourceMap.size,0);assert.equal(f.manager.channelStates.size,0);assert.equal(f.listeners.length,2);assert.equal(f.errors.length,1);assert.equal(f.deferred.length,0);
});
