'use strict';
// Every transport, SDK, storage and timer is in memory; these tests never connect.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const nodeTest=require('node:test'),root=path.resolve(__dirname,'../..');
const quiet={log(){},warn(){},error(){}};
const language={LanguageMgr:{getInstance:()=>({T:x=>x})}};
function timers(){let next=1;const jobs=new Map();return{jobs,setTimeout(fn,ms){let id=next++;jobs.set(id,{fn,ms,kind:'timeout'});return id;},setInterval(fn,ms){let id=next++;jobs.set(id,{fn,ms,kind:'interval'});return id;},clearTimeout(id){jobs.delete(id);},clearInterval(id){jobs.delete(id);}};}
function load(name,globals={},deps={}){let context={exports:{},console:quiet,require(id){if(id==='LanguageMgr')return language;if(id in deps)return deps[id];throw Error('Unexpected dependency '+id);},...globals};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/'+name+'.js'),'utf8'),context,{filename:name});return context.exports;}
function xhrs(){const instances=[];class XHR{constructor(){this.readyState=0;this.status=0;this.timeout=0;this.headers={};instances.push(this);}open(method,url){this.method=method;this.url=url;}setRequestHeader(k,v){this.headers[k]=v;}send(data){this.data=data;}done(status,text=''){this.status=status;this.responseText=text;this.readyState=4;this.onreadystatechange?.();}}return{XHR,instances};}
function test(id,fn){nodeTest(id,fn);}
test('NET-HTTP-COMPLETION',()=>{const x=xhrs(),Http=load('HttpMgr',{XMLHttpRequest:x.XHR},{BasePlatform:{Platform:{KuaiShou:1}},PlatformSetting:{PlatformSetting:{currentPlatform:0}}}).HttpMgr;const http=new Http(),get=[],post=[];http.httpGet('/read',null,(...args)=>get.push(args));x.instances[0].done(0);x.instances[0].onerror();http.httpPost({},value=>post.push(value),'/write',true);x.instances[1].done(0);x.instances[1].ontimeout();assert.equal(get.length,1);assert.equal(post.length,1);assert.equal(x.instances[0].timeout,7000);});
function queueFixture(){const time=timers(),x=xhrs(),api=load('SfSendQueue',{...time,XMLHttpRequest:x.XHR}),requests=[];api.SfTrackHttp.httpPost=(url,data,callback)=>requests.push({url,data,callback});return{api,time,requests,x};}
test('NET-SF-COALESCE',()=>{const f=queueFixture(),q=new f.api.SfTrackSendQueue(),calls=[];q.enqueue({key:'user',value:'old'},'/saveData',{maxRetries:3,callback:x=>calls.push('old')});q.enqueue({key:'user',value:'new'},'/saveData',{maxRetries:3,callback:x=>calls.push('new')});q.items[0].createtime=1;q.items[1].createtime=2;q._runNext();assert.equal(f.requests.length,1);assert.equal(f.requests[0].data.value,'new');f.requests[0].callback({code:0});assert.deepEqual(calls,['old','new']);});
test('NET-SF-SAME-TIME',()=>{const f=queueFixture(),q=new f.api.SfTrackSendQueue();q.enqueue({key:'user',value:'old'},'/saveData',{});q.enqueue({key:'user',value:'new'},'/saveData',{});q.items[0].createtime=q.items[1].createtime=1;q._runNext();assert.equal(f.requests[0].data.value,'new');assert.equal(q.items.length,0);});
test('NET-SF-RETRY',()=>{const f=queueFixture(),calls=[],task=new f.api.SfTrackHttpTask({},'/saveData',3,r=>calls.push(r));task.run();f.requests[0].callback({code:-1});assert.equal(calls.length,0);assert.equal(task.tryCount,2);for(let attempt=1;attempt<3;attempt++){const [id,job]=[...f.time.jobs][0];f.time.jobs.delete(id);job.fn();f.requests[attempt].callback({code:-1});}assert.equal(calls.length,1);assert.equal(calls[0].code,-3);assert.equal(f.requests.length,3);assert.equal(f.time.jobs.size,0);});
test('NET-SF-THROWN-CALLBACK',()=>{const f=queueFixture(),q=new f.api.SfTrackSendQueue();q.enqueue({key:'a'},'/saveData',{callback(){throw Error('consumer');}});q.enqueue({key:'b'},'/saveData',{callback(){}});q._runNext();f.time.jobs.clear();assert.doesNotThrow(()=>f.requests[0].callback({code:0}));assert.equal(f.requests.length,2);assert.equal(q.items.length,0);assert.equal(q.isRunning,true);f.requests[1].callback({code:0});assert.equal(q.isRunning,false);});
test('NET-SF-UNQUEUED',()=>{const f=queueFixture(),q=new f.api.SfTrackSendQueue();for(const key of ['first','second'])q.enqueue({key},'/saveData',{callback(){}});q._runNext();q.enqueue({key:'unqueued'},'/other',{callback(){}},false);assert.equal(f.requests.length,2);f.requests[1].callback({code:0});assert.equal(f.requests.length,2);f.requests[0].callback({code:0});assert.equal(f.requests.length,3);assert.equal(f.requests[2].data.key,'second');});
test('NET-SF-XHR',()=>{const time=timers(),x=xhrs(),api=load('SfSendQueue',{...time,XMLHttpRequest:x.XHR}),calls=[];api.SfTrackHttp.httpPost('/a',{},v=>calls.push(['a',v]));api.SfTrackHttp.httpPost('/b',{},v=>calls.push(['b',v]));assert.equal(x.instances.length,2);x.instances[0].done(200,'{"code":0}');x.instances[1].done(200,'invalid-json');assert.equal(calls[0][0],'a');assert.equal(calls[1][0],'b');assert.equal(calls[1][1].code,-1);x.instances[1].onerror();assert.equal(calls.length,2);});
test('NET-SF-GET-DEADLINE',()=>{const time=timers(),x=xhrs(),api=load('SfSendQueue',{...time,XMLHttpRequest:x.XHR});api.SfTrackHttp.httpGet('/loginData',{},()=>{});assert.equal(x.instances[0].timeout,7000);});
function webFixture(){const sockets=[];class WS{constructor(url){this.url=url;this.readyState=0;sockets.push(this);}close(){this.closeCalls=(this.closeCalls||0)+1;}send(){}}WS.CONNECTING=0;WS.OPEN=1;const WebSock=load('WebSock',{WebSocket:WS}).WebSock;return{sock:new WebSock(),sockets,WS};}
test('NET-WEB-LIFETIME',()=>{const f=webFixture(),s=f.sock;assert.equal(s.send('x'),false);assert.doesNotThrow(()=>s.close());let closed=0;s.onClosed=()=>closed++;s.connect({url:'ws://first.invalid'});const first=f.sockets[0];first.readyState=1;const oldClose=first.onclose;s.connect({url:'ws://second.invalid'});oldClose({});assert.equal(closed,0);assert.equal(first.closeCalls,1);f.sockets[1].onclose({});assert.equal(closed,1);});
function netFixture(connectResult=true){const time=timers(),api=load('NetNode',{...time}),tips=[],socket={connect(){return connectResult;},send(){return true;},close(){}},node=new api.NetNode();node.init(socket,{checkPackage:()=>true,getPackageId:x=>x,getHearbeat:()=>''},{connectTips(){},reconnectTips(){},requestTips:x=>tips.push(x)});return{time,api,node,socket,tips};}
test('NET-CONNECT-FAIL',()=>{const f=netFixture(false);assert.equal(f.node.connect({autoReconnect:0}),false);assert.equal(f.node._state,f.api.NetNodeState.Closed);assert.equal(f.node.connect({autoReconnect:0}),false);});
test('NET-CLOSE-RECONNECT',()=>{const f=netFixture();f.node.connect({autoReconnect:-1});f.node.onConnected();f.node.close();f.node.onClosed();assert.equal(f.node._reconnectTimer,null);assert.equal(f.node._isSocketOpen,false);});
test('NET-TIMERS',()=>{const f=netFixture();f.node.connect({autoReconnect:0});f.node.onConnected();f.node.onConnected();f.node.resetFixSeedMsgTimer();f.node.clearTimer();const values=[...f.time.jobs.values()];assert.equal(values.length,0);assert.equal(f.node._fixSeedTimer,null);});
test('NET-REQUEST-STATE',()=>{const f=netFixture();f.node.connect({autoReconnect:0});f.node.send('queued-send-only');f.node.onChecked();assert.equal(f.node._requests.length,0);assert.equal(f.tips.at(-1),false);let result;f.node.request('first',42,{callback(){result=f.node.requestUnique('next',42,{callback(){}},false);}},false);f.node.onMessage(42);assert.equal(result,true);assert.equal(f.node._requests.length,1);});
test('NET-REQUEST-REENTRANT-CLOSE',()=>{const f=netFixture();f.node._state=f.api.NetNodeState.Working;f.node.request('old',42,{callback(){f.node.close();f.node.request('new',43,{callback(){}},false);}},false);f.node.onMessage(42);assert.equal(f.node._requests.length,1);assert.equal(f.node._requests[0].rspCmd,43);});
function cloudFixture(name){const calls=[],loads=[],saves=[],sdk={onHide(){},getStorageSync(){return null;},setStorageSync(){},getLaunchOptionsSync:()=>({extra:{appId:'app'}}),getAccountInfoSync:()=>({miniProgram:{appId:'app'}}),showModal:o=>calls.push(o),login:o=>calls.push(o),restartMiniProgramSync(){},restartMiniProgram(){}};const queue={SfTrackHttp:{httpGet(url,data,callback){loads.push({url,data,callback});}},SendConfig:function(){},SendQueue:{enqueue(data,url,config){saves.push({data,url,config});}}};const deps={Config:{GameConfig:{AppCacheName:'app'}},Appcfg:{BaseEventName:{onHide:'hide'}},EventMgr:{EventMgr:{getInstance:()=>({emit(){}})}},SfSendQueue:queue};const api=load(name,{tt:sdk,wx:sdk,window:{openId:'user'},localStorage:{getItem(){},setItem(){}}},deps);return{server:new api[name]('/mock','app',true),loads,saves,calls,sdk};}
test('NET-CLOUD-COMPLETION',()=>{const rows=[];for(const name of ['ByteDanceServerMgr','WeachatServerMgr']){const f=cloudFixture(name),s=f.server;let loaded=0,saved=0,loadError,saveError;s.loadData((data,error)=>{loaded++;loadError=error;});f.loads[0].callback({code:-2});assert.equal(loaded,1);assert.equal(loadError.code,-2);assert.equal(s.canUpdate,false);s.canUpdate=true;s.openId='user';s.userId='user';s.saveData('appuser','{}',(data,error)=>{saved++;saveError=error;});f.saves[0].config.callback({code:-10});assert.equal(saved,1);assert.equal(saveError.code,-10);assert.equal(s.isOpened,false);rows.push({adapter:name,blockedLoadCallbacks:loaded,rejectedSaveCallbacks:saved,modalCount:f.calls.length});}});
test('NET-SERVER-COALESCED-INIT',()=>{let finishLogin,finishLoad;function Server(){}Server.prototype.init=function(cb){finishLogin=cb;};Server.prototype.loadData=function(cb){finishLoad=cb;};const deps={BasePlatform:{Platform:{WECHAT:1,BYTEDANCE:2}},PlatformConfig:{ServerDataCfg:{Main:{wechatOpened:true}}},PlatformSetting:{PlatformSetting:{currentApp:'Main'}},EventMgr:{},PlatformManager:{PlatformManager:{currentPlatform:1}},CacheUtils:{},ByteDanceServerMgr:{ByteDanceServerMgr:Server},WeachatServerMgr:{WeachatServerMgr:Server}};const server=load('ServerDataMgr',{localStorage:{getItem(){}}},deps).ServerdataMgr,calls=[];server.init(()=>calls.push('first'));server.init(()=>calls.push('second'));assert.deepEqual(calls,[]);finishLogin();assert.deepEqual(calls,[]);finishLoad();assert.deepEqual(calls,['first','second']);});
test('failed cloud initialization completes all waiters once and retries on the same adapter',()=>{let login,loaded,instances=0,loads=0;function Server(){instances++;}Server.prototype.init=function(cb){login=cb;};Server.prototype.loadData=function(cb){loads++;loaded=cb;};const deps={BasePlatform:{Platform:{WECHAT:1,BYTEDANCE:2}},PlatformConfig:{ServerDataCfg:{Main:{wechatOpened:true}}},PlatformSetting:{PlatformSetting:{currentApp:'Main'}},EventMgr:{},PlatformManager:{PlatformManager:{currentPlatform:1}},CacheUtils:{},ByteDanceServerMgr:{ByteDanceServerMgr:Server},WeachatServerMgr:{WeachatServerMgr:Server}};const server=load('ServerDataMgr',{localStorage:{getItem(){}}},deps).ServerdataMgr,calls=[],denied=Object.assign(Error('restricted'),{code:-2});server.init(error=>calls.push(error));server.init(error=>calls.push(error));login();loaded(null,denied);loaded(null,denied);assert.equal(calls.length,2);assert(calls.every(x=>x===denied));assert.equal(server.isInited,false);server.init(error=>calls.push(error));login();loaded({user:'saved'},null);assert.equal(calls.length,3);assert.equal(calls[2],null);assert.equal(server.isInited,true);assert.equal(instances,1);assert.equal(loads,2);});
test('successful HTTP signatures, payload encoding and terminal application errors remain compatible',()=>{const x=xhrs(),Http=load('HttpMgr',{XMLHttpRequest:x.XHR}).HttpMgr,http=new Http(),values=[];http.httpGet('/read?existing=1',{'a b':'c&d'},(...args)=>values.push(args));assert.equal(x.instances[0].url,'/read?existing=1&a%20b=c%26d');x.instances[0].done(200,'hello');assert.deepEqual(values[0],[true,'hello']);http.httpPost({key:'a b'},v=>values.push(v),'/post',false);assert.equal(x.instances[1].data,'key=a%20b');x.instances[1].done(200,'saved');assert.equal(values[1],'saved');const q=queueFixture(),seen=[],task=new q.api.SfTrackHttpTask({},'/save',5,value=>seen.push(value));task.run();q.requests[0].callback({code:-10});assert.equal(seen.length,1);assert.equal(seen[0].code,-10);assert.equal(q.time.jobs.size,0);});
test('consumer callback exceptions are never caught as parse failures or delivered twice',()=>{const time=timers(),x=xhrs(),api=load('SfSendQueue',{...time,XMLHttpRequest:x.XHR});let calls=0;api.SfTrackHttp.httpPost('/write',{},()=>{calls++;throw Error('consumer');});assert.throws(()=>x.instances[0].done(200,'{"code":0}'),/consumer/);x.instances[0].onerror();assert.equal(calls,1);});
test('failed SDK login is terminal and cannot proceed to cloud loading or saving',()=>{for(const name of ['ByteDanceServerMgr','WeachatServerMgr']){const f=cloudFixture(name);f.server.getOpenId=callback=>callback(null,Object.assign(Error('login failed'),{code:9}));let initError,saveError;f.server.init(error=>initError=error);assert.equal(initError.code,9);f.server.openId=null;f.server.saveData('user','{}',(data,error)=>saveError=error);assert.equal(saveError.code,9);assert.equal(f.saves.length,0);assert.equal(f.loads.length,0);}});
test('late connection verification cannot reopen a deliberately closed channel',()=>{const f=netFixture();let checked;f.node._connectedCallback=callback=>{checked=callback;};f.node.connect({autoReconnect:-1});f.node.onConnected();f.node.close();checked();assert.equal(f.node._state,f.api.NetNodeState.Closed);assert.equal(f.time.jobs.size,0);});
test('intentional close releases reconnect policy so a fresh connection uses its own options',()=>{const f=netFixture();f.node.connect({autoReconnect:-1});f.node.onConnected();f.node.close();f.node.connect({autoReconnect:0});f.node.onConnected();f.node.onClosed();assert.equal(f.node._reconnectTimer,null);assert.equal(f.node._state,f.api.NetNodeState.Closed);});
test('an explicit reconnect cancels an old delayed reconnect before it can close the new socket',()=>{const f=netFixture();f.node.connect({autoReconnect:-1});f.node.onConnected();f.node.onClosed();const pending=f.node._reconnectTimer;assert(f.time.jobs.has(pending));f.node.connect({autoReconnect:-1});assert.equal(f.time.jobs.has(pending),false);assert.equal(f.node._reconnectTimer,null);});

test('close callbacks may reconnect without the old close handler changing the replacement channel', () => {
  for (const source of ['status', 'disconnect']) for (const reconnect of [0, -1]) {
    const f = netFixture(); f.node.connect({ autoReconnect: reconnect }); f.node.onConnected();
    const replace = () => { assert.equal(f.node.connect({ autoReconnect: 0 }), true); return true; };
    if (source === 'status') f.node.setOnServerStatus(status => { if (status === -1) replace(); });
    else f.node._disconnectCallback = replace;
    f.node.onClosed(); assert.equal(f.node._state, f.api.NetNodeState.Connecting);
    assert.equal(f.node._reconnectTimer, null); assert.equal(f.node.send('new queued packet'), true);
  }
});

test('close callbacks and obsolete reconnect timers cannot reopen an intentionally closed or replaced channel', () => {
  for (const source of ['status', 'disconnect']) {
    const f = netFixture(); f.node.connect({ autoReconnect: -1 }); f.node.onConnected();
    if (source === 'status') f.node.setOnServerStatus(status => { if (status === -1) f.node.close(); });
    else f.node._disconnectCallback = () => { f.node.close(); return true; };
    f.node.onClosed(); assert.equal(f.node._state, f.api.NetNodeState.Closed); assert.equal(f.time.jobs.size, 0);
  }
  const f = netFixture(); let closes = 0; f.socket.close = () => closes++;
  f.node.connect({ autoReconnect: -1 }); f.node.onConnected(); f.node.onClosed();
  const oldTimer = f.time.jobs.get(f.node._reconnectTimer).fn;
  f.node.connect({ autoReconnect: 0 }); oldTimer();
  assert.equal(closes, 0); assert.equal(f.node._state, f.api.NetNodeState.Connecting);
});

function resetFixture(adapter) {
  const q = queueFixture(), requests = q.requests, events = [], remote = new Map(), local = new Map([['user', 'local-progress']]);
  let modal, restarts = 0;
  const host = { showModal(options) { modal = options; }, restartMiniProgram() { restarts++; }, restartMiniProgramSync() { restarts++; } };
  q.api.SfTrackHttp.httpGet = (url, data, callback) => requests.push({ url, data, callback, remove: true });
  const deps = { Config: { GameConfig: { AppCacheName: 'app:' } }, Appcfg: {},
    SfSendQueue: q.api, EventMgr: { EventMgr: { getInstance: () => ({ emit: (...args) => events.push(args) }) } },
    BasePlatform: { Platform: { WECHAT: 1, BYTEDANCE: 2 } }, PlatformConfig: {}, PlatformSetting: {},
    PlatformManager: { PlatformManager: { currentPlatform: adapter === 'WeachatServerMgr' ? 1 : 2 } },
    CacheUtils: { CacheUtils: { clearAll() { local.clear(); return true; } } }, ByteDanceServerMgr: {}, WeachatServerMgr: {} };
  const Server = load(adapter, { wx: host, tt: host }, deps)[adapter], server = new Server('/fake', 'app', true);
  Object.assign(server, { canUpdate: true, openId: 'identity', userId: 'identity' });
  const manager = load('ServerDataMgr', { ...q.time, wx: host, tt: host }, deps).ServerdataMgr; manager.curServer = server;
  function complete(request, code = 0) {
    if (code === 0) { if (request.remove) remote.clear(); else remote.set(request.data.key, request.data.value); }
    request.callback({ code, data: true });
  }
  return { ...q, manager, server, host, events, remote, local, complete, confirm: () => modal.success({ confirm: true }), restarts: () => restarts };
}

test('cloud reset waits for in-flight, queued, coalesced, and login-pending saves before removal on both adapters', () => {
  for (const adapter of ['WeachatServerMgr', 'ByteDanceServerMgr']) {
    const f = resetFixture(adapter), saved = [], reset = []; let login;
    f.manager.saveData('app:user', 'first', (data, error) => saved.push([data, error])); f.api.SendQueue._runNext();
    const inFlight = f.requests.shift();
    f.manager.saveData('app:other', 'older', (data, error) => saved.push([data, error]));
    f.manager.saveData('app:other', 'newer', (data, error) => saved.push([data, error]));
    f.server.checkLogin = callback => { login = callback; };
    f.manager.saveData('app:late', 'late login save', (data, error) => saved.push([data, error]));
    f.manager.clearAllData((...args) => reset.push(args)); f.confirm();
    assert.equal(f.local.size, 1); assert.equal(f.requests.length, 0); assert.equal(f.manager.isPause, true);
    let denied; f.manager.saveData('app:blocked', 'skip', (data, error) => denied = error); assert(denied);
    f.complete(inFlight); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].data.value, 'newer');
    f.complete(f.requests.shift()); assert.equal(f.requests.length, 0); assert.equal(f.local.size, 1);
    login(); f.api.SendQueue._runNext(); f.complete(f.requests.shift());
    assert.equal(saved.length, 4); assert(saved.every(([data, error]) => data === true && !error));
    assert.equal(f.local.size, 0); const remove = f.requests.shift(); assert.equal(remove.remove, true);
    assert.equal(f.remote.size, 3); f.complete(remove);
    assert.equal(f.remote.size, 0); assert.equal(f.restarts(), 1); assert.deepEqual(reset, [[true, undefined]]);
  }
});

test('failed or uncertain cloud saves cancel reset without deleting data and permit later uploads', () => {
  for (const failure of ['terminal', 'timeout']) {
    const f = resetFixture('WeachatServerMgr'), reset = [];
    f.manager.saveData('app:user', 'latest', () => {}); f.api.SendQueue._runNext(); const pending = f.requests.shift();
    f.manager.clearAllData((...args) => reset.push(args)); f.confirm();
    if (failure === 'terminal') f.complete(pending, -2);
    else [...f.time.jobs.values()].find(job => job.ms === 60000).fn();
    assert.equal(reset.length, 1); assert.equal(reset[0][0], false); assert(reset[0][1]);
    assert.equal(f.local.size, 1); assert.equal(f.restarts(), 0); assert.equal(f.requests.length, 0); assert.equal(f.manager.isPause, false);
    if (failure === 'timeout') f.complete(pending);
    assert.equal(f.requests.some(request => request.remove), false, 'late acknowledgement cannot revive cancelled reset');
    f.manager.saveData('app:user', 'retry', () => {}); f.api.SendQueue._runNext(); assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].remove, undefined);
  }
});

test('prior uncertain save failure and thrown confirmation cannot leave reset ownership stuck', () => {
  const f = resetFixture('WeachatServerMgr'), results = [];
  f.manager.saveData('app:user', 'unacknowledged', () => {}); f.api.SendQueue._runNext();
  for (let attempt = 0; attempt < 5; attempt++) {
    f.complete(f.requests.shift(), -1);
    if (attempt < 4) { const [id, job] = [...f.time.jobs].find(([, value]) => value.ms === 1000); f.time.jobs.delete(id); job.fn(); }
  }
  f.manager.clearAllData((...args) => results.push(args)); f.confirm();
  assert.equal(results[0][0], false); assert(results[0][1]); assert.equal(f.local.size, 1); assert.equal(f.requests.length, 0);
  const g = resetFixture('WeachatServerMgr'), original = g.host.showModal, attempts = [];
  g.host.showModal = () => { throw Error('host unavailable'); };
  g.manager.clearAllData((...args) => attempts.push(args));
  assert.equal(attempts.length, 1); assert.equal(attempts[0][0], false); assert.match(attempts[0][1].message, /host unavailable/);
  g.host.showModal = original; g.manager.clearAllData((...args) => attempts.push(args)); g.confirm();
  assert.equal(g.requests.length, 1); g.complete(g.requests.shift()); assert.equal(attempts[1][0], true);
});
