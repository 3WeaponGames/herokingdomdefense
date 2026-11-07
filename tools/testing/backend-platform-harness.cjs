// Silent actual-module platform harness; every host, transport, timer and store is in memory.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'assets/_script');
const files=['SdkMgr','PlatformManager','Platform4399Manager','EditorManager','SubscribeManager','FeedCardMgr','FeedPlayableMgr','LiveMgr','WechatPayMgr'];
function harness(platform='editor',options={}){
 let now=0; const modules={},requests=[],intervals=[],timeouts=[],events=[],storage=new Map(),sounds={pause:0,resume:0},toasts=[],payments=[];
 const singleton=value=>({getInstance:()=>value}),noop=()=>{};
 const wx={showToast:x=>toasts.push(x),showLoading:noop,hideLoading:noop,getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),getAccountInfoSync:()=>({miniProgram:{appId:'test-app'}}),getSystemInfoSync:()=>({SDKVersion:'2.20.0'}),login:o=>o.fail({}),request:o=>requests.push(o),requestMidasPaymentGameItem:o=>payments.push(o)};
 const tt={login:o=>o.fail({}),request:o=>requests.push(o),getSystemInfoSync:()=>({appName:'Douyin'}),getLaunchOptionsSync:()=>({extra:{appId:'test-app'},query:{},scene:'023041'}),reportScene:noop};
 const window={location:{href:'about:blank'}},localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v))};
 const stubs={PlatformSetting:{PlatformSetting:{currentPlatform:platform}},Config:{UIID:{},SystemPlatform:{}},KinghtFallConfig:{KinghtFallEventName:{PlayVideoSucc:'videoResult'}},UIUtils:{UIUtils:{scheduleOnce:cb=>timeouts.push(cb)}},Utils:{Utils:{getWebUrlParams:()=>({})}},
  AudioMgr:{AudioMgr:singleton({pauseAllMusic:()=>sounds.pause++,resumeAllMusic:()=>sounds.resume++})},EventMgr:{EventMgr:singleton({emit:(...a)=>events.push(a)})},Appcfg:{BaseEventName:{blocktouch:'blocktouch'}},
  LogMgr:{LogMgr:singleton({debug:noop})},UIMgr:{UIMgr:singleton({openUI:noop})},PlayerMgr:{PlayerMgr:singleton({getTrackData:()=>({getToAppStore:()=>false})})},Main:{default:{instance:{onPlayVideo:noop}}},TestMode:{TestMode:singleton({isEnabled:()=>false})},AdPlacements:{RewardedAdPlacements:{},REWARDED_AD_TIMEOUT_MS:100},
  HttpMgr:{HttpMgr:singleton({httpPost:(data,cb,url)=>requests.push({data,cb,url})})},LanguageMgr:{LanguageMgr:singleton({T:x=>x})},TimeUtils:{TimeUtils:{GetTimeBySecond:()=>100}},SocketMgr:{default:singleton({startSocket:noop,setOnMsg:noop})}};
 function load(name){if(stubs[name])return stubs[name];if(modules[name])return modules[name];if(!files.includes(name)&&name!=='BasePlatform')return {};
  const ex={};modules[name]=ex;vm.runInNewContext(fs.readFileSync(path.join(source,name+'.js'),'utf8'),{exports:ex,require:load,window,localStorage,wx,tt,console:{log:noop,error:noop},setInterval:(cb,delay)=>{const id={cb,delay,active:true};intervals.push(id);return id;},clearInterval:id=>{if(id)id.active=false;},setTimeout:(cb,delay)=>{const timer={cb,delay,at:now+delay,active:true};timeouts.push(timer);return timer;},clearTimeout:timer=>{if(timer)timer.active=false;},...options.globals},{filename:name+'.js'});return ex;}
 function tick(ms){ const end=now+ms; let count=0; for(;;){const next=timeouts.filter(t=>t.active&&t.at<=end).sort((a,b)=>a.at-b.at)[0]; if(!next)break; if(++count>1000)throw Error('unbounded timer loop'); now=next.at; next.active=false; next.cb();} now=end; }
 return {load,stubs,requests,intervals,timeouts,events,storage,sounds,toasts,payments,wx,tt,window,tick};
}
module.exports={harness};
