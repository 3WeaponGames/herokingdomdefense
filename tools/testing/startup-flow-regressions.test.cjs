'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),test=require('node:test');
const single=x=>({getInstance:()=>x}),noop=()=>{};
function load(name,deps,extra={}) {
  function Base(){}
  const cc={Component:Base,Node:{EventType:{TOUCH_END:'end'}},_decorator:{ccclass:x=>x,property:()=>noop},
    isValid:x=>!!x&&!x.destroyed,winSize:{width:750},macro:{MAX_ZINDEX:32767},Label:{Overflow:{SHRINK:1},HorizontalAlign:{CENTER:1}},...extra};
  const context={exports:{},require:id=>deps[id]||{},cc,sp:{Skeleton:Base},console:{log:noop,error:noop},
    __extends(C,B){Object.setPrototypeOf(C,B);C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},
    __decorate:(_ds,t,k)=>k===undefined?t:undefined,__spreadArrays:(...a)=>[].concat(...a)};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script',name+'.js'),'utf8'),context,{filename:name+'.js'});
  return context.exports;
}
function mainFixture() {
  const queue=[],opened=[],events={on:noop,off:noop},track={getCrunetDay:()=>1,youmengTrack:noop};let hidden=0;
  const deps={KinghtFallRenderGuard:{install:noop},EventMgr:{EventMgr:single(events)},
    UIMgr:{UIMgr:single({openUI:noop,openUIOfCallback:(id,_from,done)=>{opened.push(id);queue.push(done);}})},
    UIUtils:{UIUtils:{schedule:noop}},Config:{UIID:{UITouch:'touch',UIReportTop:'report',UINONE:'none'}},
    KinghtFallConfig:{KinghtFallUIID:{UITop:'top',UIHome:'home'}},PlayerMgr:{PlayerMgr:single({getTrackData:()=>track})},GameTrackDataEvent:{TrackId:{}}};
  const C=load('Main',deps,{Camera:{main:{}},game:{on:noop,off:noop},director:{getScheduler:()=>({unschedule:noop})}}).default;
  const owner=new C();owner.scheduleOnce=noop;owner.hideLoading=()=>hidden++;
  return {owner,queue,opened,get hidden(){return hidden;}};
}
test('Every Main startup continuation stops after its owner is destroyed',()=>{
  for(const stage of [0,1,2]){
    const f=mainFixture();f.owner.start();for(let i=0;i<stage;i++)f.queue.shift()({});
    const count=f.opened.length;f.owner.onDestroy();f.queue.shift()({});
    assert.equal(f.opened.length,count);assert.equal(f.hidden,0);
  }
  const live=mainFixture();live.owner.start();while(live.queue.length)live.queue.shift()({});
  assert.deepEqual(live.opened,['top','report','home']);assert.equal(live.hidden,1);
});
function loadingFixture() {
  const versions=[],servers=[],processes=[],resources={};
  const deps={PlatformManager:{PlatformManager:single({init:noop})},ResCacheMgr:{ResCacheMgr:single({init:noop})},
    UIMgr:{UIMgr:single({addUICnf:noop,Init:noop})},TestMode:{TestMode:single({init:noop})},AudioMgr:{AudioMgr:single({init:noop})},
    EventMgr:{EventMgr:single({on:noop,off:noop})},Appcfg:{BaseEventName:{Loading:'loading'},LoadingProcess:{StartLoading:10}},
    LanguageMgr:{LanguageMgr:single({ready:true,t:key=>key})},SdkMgr:{SdkMgr:single({requestCheckVersion:done=>versions.push(done)})},
    ServerDataMgr:{ServerdataMgr:{init:done=>servers.push(done)}},PlatformSetting:{PlatformSetting:{}},Config:{},ResourceMgr:{ResourceMgr:single(resources)}};
  const C=load('Loading',deps,{debug:{setDisplayStats:noop},game:{addPersistRootNode:noop}}).default,owner=new C();
  owner.labPro={node:{off:noop,width:100,height:20,scaleX:1}};owner.progressBar={};owner.node={off:noop};
  owner.setProcessLoad=value=>processes.push(value);
  return {owner,versions,servers,processes};
}
test('Destroyed Loading cancels version checks, server completions and saved retry callbacks',()=>{
  const f=loadingFixture();f.owner.startGame();f.owner.onDestroy();f.versions[0]();assert.equal(f.servers.length,0);
  const g=loadingFixture();g.owner.startGame();g.versions[0]();g.servers[0](Error('offline'));
  const retry=g.owner.loadingRetries[0];assert.equal(typeof retry,'function');g.owner.onDestroy();retry();g.servers[0]();
  assert.equal(g.servers.length,1);assert.deepEqual(g.processes,[]);
});
test('Loading server retry still progresses once its current initialization succeeds',()=>{
  const f=loadingFixture();f.owner.startGame();f.versions[0]();f.servers[0](Error('offline'));
  f.owner.retryLoading();assert.equal(f.servers.length,2);f.servers[1]();assert.deepEqual(f.processes,[10]);
});
test('A throwing startup retry retains its failure and cannot discard another retry',()=>{
  const f=loadingFixture();let first=0,second=0;
  const retry=()=>{if(++first===1)throw Error('retry failure');};f.owner.loadingRetries=[retry,()=>second++];
  assert.doesNotThrow(()=>f.owner.retryLoading());assert.equal(second,1);assert.equal(f.owner.loadingRetries.length,1);
  assert.equal(f.owner.loadingRetries[0],retry);assert.equal(f.owner.labPro.string,'loading.failed');
  f.owner.retryLoading();assert.equal(first,2);assert.equal(f.owner.loadingRetries.length,0);
});
function legacyFixture() {
  const data=[],preloads=[],uis=[],opened=[],canvas={children:[]};let resets=0,music=0,exits=0;
  class Node {setContentSize(){}addComponent(){return {};}set parent(value){this._parent=value;value.children.push(this);}get parent(){return this._parent;}
    destroy(){this.destroyed=true;if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);}}
  const deps={AudioMgr:{AudioMgr:single({addAdConf:noop,playMusic:()=>music++,playEffect:noop})},EventMgr:{EventMgr:single({})},
    UIMgr:{UIMgr:single({addUICnf:noop,closeById:noop,openUIWithOwner:(id,_none,owner)=>{let done=false;opened.push(id);uis.push(()=>{if(!done&&owner.isCurrent()){done=true;owner.onOpened();}});return{cancel(){if(!done){done=true;owner.onCancel();}}};}})},
    Config:{UIID:{}},GAD_Configs:{GAD_UIID:{UIGame:'legacy-game'},GADConfig:{},GAD_AudioId:{}},
    GAD_DataMgr:{default:single({load:done=>data.push(done),initCfgData:noop})},
    GAD_PlayerMgr:{default:single({reset:()=>resets++,preload:done=>preloads.push(done)})}};
  const C=load('GAD_App',deps,{Node,Canvas:{instance:{node:canvas}},systemEvent:{on:noop,off:noop},SystemEvent:{EventType:{KEY_UP:'up'}}}).default;
  const app=new C();return {app,canvas,Node,data,preloads,uis,opened,exit:()=>exits++,get resets(){return resets;},get music(){return music;},get exits(){return exits;}};
}
test('Legacy exit releases only its blocker and rejects each pending entry stage',()=>{
  for(const stage of [0,1,2]){
    const f=legacyFixture(),unrelated=new f.Node();unrelated.name='block_touch_event';unrelated.parent=f.canvas;
    f.app.enter_App(null,f.exit);assert.equal(f.canvas.children.length,2);
    assert.equal(f.app._touchBlocker.zIndex,32767);
    if(stage>=1)f.data.shift()();if(stage>=2)f.preloads.shift()();
    const opens=f.opened.length,resets=f.resets;f.app.exit_App();assert.equal(f.exits,1);assert.deepEqual(f.canvas.children,[unrelated]);
    [f.data,f.preloads,f.uis][stage].shift()();assert.equal(f.opened.length,opens);assert.equal(f.resets,resets);assert.equal(f.music,0);
    f.app.exit_App();assert.equal(f.exits,1);
  }
});
test('New legacy entry wins over obsolete requests and reentrant completion can exit without starting music',()=>{
  const f=legacyFixture();let completes=0;f.app.enter_App(()=>completes++);f.app.enter_App(()=>completes++);
  assert.equal(f.canvas.children.length,1);f.data[0]();assert.equal(f.preloads.length,0);
  f.data[1]();f.preloads[0]();f.uis[0]();assert.equal(completes,1);assert.equal(f.music,1);assert.equal(f.canvas.children.length,0);
  f.app.enter_App(()=>f.app.exit_App());f.uis[1]();assert.equal(f.music,1);assert.equal(f.canvas.children.length,0);
});
