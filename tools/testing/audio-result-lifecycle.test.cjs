'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const scripts=path.resolve(__dirname,'../../assets/_script');
function method(file,name,context){
 const text=fs.readFileSync(path.join(scripts,file+'.js'),'utf8').replace(/\r\n/g,'\n'),start=text.indexOf('  _ctor.prototype.'+name+' = function '),end=text.indexOf('\n  };',start);
 assert(start>=0&&end>=0);return vm.runInNewContext('('+text.slice(text.indexOf('function ',start),end+4)+')',context,{filename:file+'.'+name});
}
function fixture(mode,win,initializing=false){
 const states={ERROR:-1,INITIALIZING:0,PLAYING:1,PAUSED:2,STOPPED:3},pending=[],decoders=[],writes=[];let baseDestroyed=0;
 class Source{
  constructor(){this.state=states.STOPPED;this.token=0;this.plays=0;this.volume=1;this.loop=false;this.audio={getState:()=>this.state};}
  get isPlaying(){return this.state===states.PLAYING;}
  play(){this.plays++;const token=++this.token;this.state=initializing?states.INITIALIZING:states.PLAYING;if(initializing)decoders.push(()=>{if(this.token===token&&this.state===states.INITIALIZING)this.state=states.PLAYING;});}
  // JSB pause/resume handle only playing/paused IDs; stop cancels decoding IDs.
  pause(){if(this.isPlaying)this.state=states.PAUSED;}resume(){if(this.state===states.PAUSED)this.state=states.PLAYING;}
  stop(){this.token++;this.state=states.STOPPED;}
 }
 const cc={AudioSource:Source,AudioClip:function(){},_Audio:{State:states},isValid:value=>!!value&&!value.destroyed,Node:{EventType:{TOUCH_END:'end'}},SystemEvent:{EventType:{KEY_UP:'up'}},systemEvent:{off(){}},game:{EVENT_HIDE:'hide',EVENT_SHOW:'show',on(){}}};
 const modules={BaseMgr:{default:function(){}},CacheUtils:{CacheUtils:{getData:()=>null,saveData:(...args)=>writes.push(args),canPlayMusin:()=>true,canPlayEffect:()=>true}},ResourceMgr:{ResourceMgr:{getInstance:()=>({loadRes(bundle,file,type,done){pending.push({file,done});}})}},LogMgr:{LogMgr:{getInstance:()=>({error(){}})}}};
 const loaded={exports:{},cc,require:name=>modules[name],setTimeout,clearTimeout,__extends(C,B){C.prototype=Object.create(B.prototype);C.prototype.constructor=C;}};
 vm.runInNewContext(fs.readFileSync(path.join(scripts,'AudioMgr.js'),'utf8'),loaded,{filename:'AudioMgr.js'});modules.AudioMgr=loaded.exports;
 const audio=modules.AudioMgr.AudioMgr.getInstance();audio.init({victory:{bundle:'audio',path:'victory'},failure:{bundle:'audio',path:'failure'},other:{bundle:'audio',path:'other'}});
 const panel={isWin:win,isclose:false,_resourceGeneration:1,node:{activeInHierarchy:true},resultSp:{setAnimation(){},setCompleteListener(){}},spAni:{setAnimation(){return{};},addAnimation(){},setTrackCompleteListener(){}},ndReward:{init(){}},btnExit:{on(_event,callback){this.click=callback;}},addEvent(){},refreshResult(){},loadPrefab(){},initData(){},initBtnView(){},initBtnEvent(){},getSkillList:[],cancelPendingOpens(){},offEvents(){},release(){},scheduleOnce:callback=>callback()};
 const gad={GAD_UIID:{UIGame:'game',UIResult:'result',UIPause:'pause'},GAD_AudioId:{victory:'victory',fail:'failure'},GADConfig:{BgMusic:'wall-bg'},emGADGameState:{Over:3}},config={KinghtFallParameter:{BGMusic:'bg'},KinghtFallAudioId:{game_success:'victory',game_fail:'failure'},KinghtFallBundelName:{IconGood:'goods'},KinghtFallPrefabName:{ItemGood:'good'}};
 const app={removeTouchEvent(){}},controller={_battleSettlement:{},gameData:{levelCfg:{}}};
 const uiManager={closeById(id){if(id==='result')closePanel();},closeUI(node){if(node===panel.node)closePanel();}};
 const context={cc,$z1AudioMgr:modules.AudioMgr,$z1GAD_Configs:gad,$z1KinghtFallConfig:config,$z1GAD_App:{default:{instance:app}},$z1GAD_PlayerMgr:{default:{getInstance:()=>({setState(){},finishRun(){}})}},$z1UIMgr:{UIMgr:{getInstance:()=>uiManager}},$z1KinghtFallUIGame:{default:{instance:{ctrGame:controller}}},BattleSounds:{},t:{prototype:{onDestroy(){baseDestroyed++;this.destroyed=true;}}}};
 const resultFile=mode==='wall'?'GAD_UIResult':'KinghtFallUIGameEnd';
 panel.onClose=method(resultFile,'onClose',context);panel.onDestroy=method(resultFile,'onDestroy',context);panel.closeUI=method('BaseUI','closeUI',context);app.exit_App=method('GAD_App','exit_App',context);
 function closePanel(){panel.isclose=true;panel._resourceGeneration++;panel.onClose();panel.node.activeInHierarchy=false;}
 method(resultFile,'start',context).call(panel);
 return{audio,panel,pending,states,writes,close(){if(mode==='wall')panel.btnExit.click();else panel.closeUI();},destroy(){panel.onDestroy();},baseDestroyed:()=>baseDestroyed,finish(){while(pending.length){const request=pending.shift();request.done({loaded:true,path:request.file,duration:1});}},decode(){while(decoders.length)decoders.shift()();},result:()=>audio.audioSourceMap.get('effect1')};
}

for(const mode of ['wall','campaign'])for(const win of [false,true]){
 const label=mode+' '+(win?'win':'loss');
 test(label+' cold result cue cannot start after the actual exit/close path',()=>{
  const f=fixture(mode,win);assert.equal(f.pending.length,1);f.close();f.finish();assert.equal(f.panel.isclose,true);assert.equal(f.result().plays,0);assert.equal(f.result().isPlaying,false);assert.deepEqual(f.writes,[]);
 });
 test(label+' current result plays its matching cue and closes without stopping unrelated UI audio',()=>{
  const f=fixture(mode,win);f.finish();assert.equal(f.result().clip.path,win?'victory':'failure');assert.equal(f.result().isPlaying,true);
  f.audio.playNamedEffect('other','other-ui');f.finish();f.close();assert.equal(f.result().isPlaying,false);assert.equal(f.audio.getAudioSource('other-ui').isPlaying,true);assert.deepEqual(f.writes,[]);
 });
 test(label+' close cancels an INITIALIZING native result ID before its decoder can start',()=>{
  const f=fixture(mode,win,true);f.finish();assert.equal(f.result().state,f.states.INITIALIZING);f.close();f.decode();assert.equal(f.result().state,f.states.STOPPED);assert.equal(f.result().isPlaying,false);assert.deepEqual(f.writes,[]);
 });
 test(label+' direct destruction retires native result audio and retains base cleanup',()=>{
  const f=fixture(mode,win,true);f.finish();f.destroy();f.decode();assert.equal(f.result().isPlaying,false);assert.equal(f.baseDestroyed(),1);assert.deepEqual(f.writes,[]);
 });
}
