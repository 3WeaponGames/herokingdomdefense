'use strict';
// Actual modules/functions; transports, SDKs and timers are inert mocks. No game,
// browser, sockets, user storage or Creator process is started by this suite.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),flush=()=>new Promise(r=>setImmediate(r));
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-tools2-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function write(dir,name,bytes){const file=path.join(dir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);return file;}
function moduleVM(relative,globals={},overrides={}){const file=path.join(root,relative),local=createRequire(file),c={module:{exports:{}},exports:{},Buffer,URL,process,__dirname:path.dirname(file),console:{log(){},warn(){},error(){}},setTimeout,clearTimeout,setImmediate,...globals,require:id=>Object.hasOwn(overrides,id)?overrides[id]:local(id)};vm.createContext(c);vm.runInContext(fs.readFileSync(file,'utf8'),c,{filename:relative});return c;}
function timers(){let id=0;const jobs=new Map();return{jobs,setTimeout(fn,ms){const key=++id;jobs.set(key,{fn,ms});return key;},clearTimeout:key=>jobs.delete(key)};}

test('item-look catalogs retry only failed dependencies, throttle repeated failures and notify waiters once',()=>{
  let now=0;const requests=[],calls=[],c=moduleVM('assets/_script/HeroItemLooks.js',{Date:{now:()=>now},cc:{JsonAsset:function(){},resources:{load(file,type,done){requests.push({file,done});}}}},{HeroWeapons:require('../../assets/_script/HeroWeapons'),EquipmentTiers:require('../../assets/_script/EquipmentTiers'),KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getEquipCfgList:()=>require('../../assets/KinghtFallConfig/GameJsonCfg.json').EquipCfg})}},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({})})}}}),api=c.exports;
  const data={assignments:{'2:1':'hat'},profiles:{hat:{parts:[{sprite:'hat'}]}}};
  api.whenReady(()=>calls.push('ready'));requests[0].done(Error('catalog failed'));for(let i=0;i<20;i++)api.image(2,1);assert.equal(requests.length,1);
  now=1000;api.image(2,1);requests[1].done(null,{json:data});assert.equal(requests[2].file,'hero-maker/catalog');requests[2].done(null,{json:{icons:{}}});requests[3].done(Error('parts failed'));assert.deepEqual(calls,[]);
  for(let i=0;i<20;i++)api.image(2,1);assert.equal(requests.length,4);
  now=2000;api.image(2,1);api.image(2,1);assert.equal(requests.length,5);assert.equal(requests[4].file,'character-parts/catalog');
  requests[4].done(null,{json:{parts:[{id:'hat',image:'hat.png'}]}});assert.equal(api.image(2,1).image,'hat.png');assert.deepEqual(calls,['ready']);assert.equal(requests.length,5);
});

test('custom HTML/EJS/Jade preview templates retain exact bytes across enable, reinject and disable',t=>{
  for(const kind of ['html','ejs','jade']){
    const dir=temp(t),file=write(dir,'preview-templates/index.'+kind,kind==='jade'?'doctype html\r\nhtml\r\n  body\r\n    script(src=cocos2d)\r\n  \t':Buffer.concat([Buffer.from('<html><body>custom <%=cocos2d%></body></html>\r\n \t'),Buffer.from([255])]));
    const original=fs.readFileSync(file),c=moduleVM('packages/cocos-mcp-2x/main.js',{Editor:{Project:{path:dir}}});
    vm.runInContext('_writePreviewTemplate(6021); _writePreviewTemplate(6022); _removePreviewTemplate();',c);
    assert.deepEqual(fs.readFileSync(file),original);assert(fs.existsSync(path.join(dir,'local/cocos-mcp-2x/backups')));
  }
});

test('preview ownership deletes only an unchanged created scaffold and preserves external template edits',t=>{
  const dir=temp(t),c=moduleVM('packages/cocos-mcp-2x/main.js',{Editor:{Project:{path:dir}}}),file=path.join(dir,'preview-templates/index.html');
  vm.runInContext('_writePreviewTemplate(6021); _removePreviewTemplate();',c);assert.equal(fs.existsSync(file),false);
  write(dir,'preview-templates/index.html','<body>owned content</body>');vm.runInContext('_writePreviewTemplate(6021)',c);
  fs.appendFileSync(file,'\r\nexternal edit');vm.runInContext('_removePreviewTemplate()',c);assert.equal(fs.readFileSync(file,'utf8'),'<body>owned content</body>\r\nexternal edit');
  vm.runInContext('_writePreviewTemplate(6021)',c);const changed=fs.readFileSync(file,'utf8').replace('runtime log reporter','edited runtime log reporter');fs.writeFileSync(file,changed);
  assert.throws(()=>vm.runInContext('_removePreviewTemplate()',c),/edited/);assert.equal(fs.readFileSync(file,'utf8'),changed);
});

test('preview template replacement checks revisions after staging and keeps conflict bytes',t=>{
  const dir=temp(t),file=write(dir,'preview-templates/index.html','<body>original</body>');let raced=false;
  const wrapped=Object.assign({},fs,{writeFileSync(name,...args){fs.writeFileSync(name,...args);if(String(name).startsWith(file+'.cocos-mcp-')){fs.writeFileSync(file,'external revision');raced=true;}}});
  const api=moduleVM('packages/cocos-mcp-2x/template-ownership.js',{}, {fs:wrapped}).module.exports;
  assert.throws(()=>api.install(path.dirname(file),file,'html','<!-- reporter -->','scaffold'),/changed during update/);assert(raced);assert.equal(fs.readFileSync(file,'utf8'),'external revision');
});

test('failed preview reinjection restores prior ownership and remains removable and retryable',t=>{
  const dir=temp(t),file=write(dir,'preview-templates/index.html','<body>original</body>');let fail=false;
  const wrapped=Object.assign({},fs,{renameSync(from,to){if(fail&&to===file){fail=false;throw Error('template busy');}return fs.renameSync(from,to);}});
  const api=moduleVM('packages/cocos-mcp-2x/template-ownership.js',{}, {fs:wrapped}).module.exports,folder=path.dirname(file),record=path.join(dir,'local/cocos-mcp-2x/preview-template.json');
  api.install(folder,file,'html','block-one','scaffold');const before=fs.readFileSync(file),ownership=fs.readFileSync(record);fail=true;
  assert.throws(()=>api.install(folder,file,'html','block-two','scaffold'),/template busy/);assert.deepEqual(fs.readFileSync(file),before);assert.deepEqual(fs.readFileSync(record),ownership);
  api.install(folder,file,'html','block-two','scaffold');api.remove(folder,file);assert.equal(fs.readFileSync(file,'utf8'),'<body>original</body>');
});

test('pending MCP disconnect, replacement, deadline and stale replies retain connection ownership',async()=>{
  const clock=timers(),c=moduleVM('packages/cocos-mcp-2x/main.js',{...clock,Editor:{},clients:[]});
  vm.runInContext('WsClient.prototype.connect=function(){clients.push(this);this.sent=[];};WsClient.prototype.close=function(){this.closed=true;};WsClient.prototype.send=function(value){this.sent.push(value);};',c);
  const first=vm.runInContext('_connect("ws://127.0.0.1:6020/x")',c);vm.runInContext('_disconnect()',c);c.clients[0].emit('open');assert.equal((await first).connected,false);assert(c.clients[0].closed);assert.equal(clock.jobs.size,0);
  const second=vm.runInContext('_connect()',c);c.clients[1].emit('open');assert.equal((await second).connected,true);
  vm.runInContext('handlers.test_wait=()=>new Promise(resolve=>{globalThis.finishRequest=resolve;});',c);c.clients[1].emit('message',JSON.stringify({id:'old-request',command:'test_wait'}));await flush();
  const third=vm.runInContext('_connect()',c);c.clients[2].emit('open');await third;c.clients[1].emit('close');c.finishRequest('late');await flush();
  assert.equal(vm.runInContext('_connectionState().connected',c),true);assert(c.clients[2].sent.every(value=>!value.includes('old-request')));
  const fourth=vm.runInContext('_connect()',c);const deadline=[...clock.jobs.values()][0];assert.equal(deadline.ms,10000);deadline.fn();assert.match((await fourth).lastError,/timed out/);assert(c.clients[3].closed);assert.equal(clock.jobs.size,0);
});

test('both authoring HTTP modes reject foreign Host/Origin before invoking their service',async()=>{
  for(const kind of ['characters','items']){
    let handler,calls=0;class Service{load(){calls++;return{loaded:true};}save(){calls++;return{saved:true};}}
    const api=moduleVM('tools/characters/serve-editor.cjs',{}, {'node:http':{createServer(fn){handler=fn;return{address:()=>({port:9123})};}},'../../packages/hkd-characters/lib/service':{Service},'../../packages/hkd-items/service':{ItemsService:Service}}).module.exports;
    api.createServer('/mock',{kind});
    async function request(host,origin,method='POST'){let status;await handler({method,url:'/api/save',headers:{host,origin,'content-type':'application/json'},async *[Symbol.asyncIterator](){yield Buffer.from('{}');}},{writeHead(code){status=code;},end(){}});return status;}
    for(const [host,origin]of [['foreign.invalid:9123','http://foreign.invalid:9123'],['127.0.0.1:9124','http://127.0.0.1:9124'],['localhost:9123','null'],['localhost:9123','http://foreign.invalid:9123'],['user@localhost:9123','http://localhost:9123']])assert.equal(await request(host,origin),400);
    assert.equal(await request('foreign.invalid:9123',undefined,'GET'),400);assert.equal(calls,0);
    assert.equal(await request('127.0.0.1:9123','http://127.0.0.1:9123'),200);assert.equal(await request('localhost:9123','http://localhost:9123'),200);assert.equal(calls,2);
  }
});

test('localization save and compile reply once on thrown, timed-out and duplicate import completions',async t=>{
  for(const mode of ['throw','timeout','duplicate']){
    const dir=temp(t),file=write(dir,'assets/resources/localization/catalog.json',JSON.stringify({version:1,defaultLanguage:'en',languages:[{code:'en',nameKey:'language.en'}],entries:{'language.en':{en:'English'}}})),clock=timers();let done;
    const api=moduleVM('packages/localization-editor/main.js',{...clock,Editor:{Project:{path:dir},assetdb:{refresh(url,callback){done=callback;if(mode==='throw')throw Error('import failed');if(mode==='duplicate'){callback();callback(Error('late'));}}}}},{'./lib/art-compiler':{compile:async()=>({count:0})}}).module.exports;
    const current=api._read(),replies=[];current.catalog.entries['language.en'].en='Changed';await api.messages.save({reply:(error,value)=>replies.push({error,value})},current.catalog,current.revision);
    if(mode==='timeout'){assert.equal(replies.length,0);[...clock.jobs.values()][0].fn();done();}
    assert.equal(replies.length,1);assert.equal(replies[0].error,null);assert.equal(replies[0].value.saved,true);assert.equal(JSON.parse(fs.readFileSync(file)).entries['language.en'].en,'Changed');assert.equal(clock.jobs.size,0);
    if(mode!=='duplicate')assert(replies[0].value.warning);
    const compile=[];await api.messages.compile({reply:(error,value)=>compile.push({error,value})});if(mode==='timeout'){[...clock.jobs.values()][0].fn();done();}assert.equal(compile.length,1);assert.equal(clock.jobs.size,0);
  }
});

test('failed unit preview layers can retry without editing timing or loading a game',async()=>{
  const file=path.join(root,'packages/game-data-editor/test/unit-preview-client.test.js'),prefix=fs.readFileSync(file,'utf8').split('const source=')[0];let attempts=0;
  const c={require:createRequire(file),__dirname:path.dirname(file),exports:{},module:{exports:{}},requestAnimationFrame(){throw Error('No playback requested');},cancelAnimationFrame(){}};vm.createContext(c);vm.runInContext(prefix,c);c.document={createElement:tag=>vm.runInContext('new Element('+JSON.stringify(tag)+')',c)};
  const artwork=moduleVM('packages/game-data-editor/preview/building-artwork.js',{document:c.document}).module.exports;
  const pure={'../../../assets/_script/AttackCadence':require('../../assets/_script/AttackCadence'),'../lib/attack-profile':require('../../packages/game-data-editor/lib/attack-profile')};
  c.require=id=>Object.hasOwn(pure,id)?pure[id]:id==='./spine-renderer'?{async createLayers(spine,layers){attempts++;if(attempts===1)throw Error('temporary image failure');return layers.map(description=>({description,data:{findAnimation:()=>({duration:1})}}));},seek(){},bounds(){return{};},drawCanvas(){},destroyCanvas(){}}:id==='./projectile'?{simulate:()=>null}:id==='./building-artwork'?artwork:{};
  vm.runInContext('(function(){'+fs.readFileSync(path.join(root,'packages/game-data-editor/preview/client.js'),'utf8')+'})()',c);
  const description={type:'enemy',id:'90001',key:'enemy:90001:default',form:'default',effect:'Melee hit',defaultTiming:.4,runtimePath:'mock',shared:[],layers:[{json:{animations:{attack:{events:[]}}},animations:['idle','attack'],skins:['default']}]};
  const client=c.module.exports.mount(vm.runInContext('new Element("div")',c),{ipc:async()=>description,onChange(){assert.fail('Preview changed a draft');}}),request={type:'enemy',id:'90001'};
  client.setUnit(request);await flush();assert.equal(client.getState().loaded,false);client.setUnit(request);await flush();assert.equal(attempts,2);assert.equal(client.getState().loaded,true);client.setUnit(request);assert.equal(attempts,2);client.destroy();
});

test('character fitting evicts failed image promises and throttles retry without losing the current generation',async()=>{
  const source=fs.readFileSync(path.join(root,'packages/hkd-characters/client.js'),'utf8'),requests=[],context={images:new Map(),api:{image:value=>value},Image:class{set src(value){requests.push(this);}}};vm.createContext(context);vm.runInContext(source.split('\n').find(line=>line.includes('function imageFor(asset)')),context);
  const asset={name:'Hat',image:'hat.png'},first=context.imageFor(asset);requests[0].onerror();await assert.rejects(first,/Cannot load/);const second=context.imageFor(asset);assert.notEqual(first,second);requests[1].onload();await second;assert.equal(context.imageFor(asset),second);assert.equal(requests.length,2);
  let now=0,calls=0;const fitting={api:{core:require('../../assets/_script/CharacterPartsCore')},Date:{now:()=>now},profile:()=>({parts:[{sprite:'hat',layer:'body'}]}),layers:[{description:{uuid:'body'}}],fittingRetryAfter:0,fittingKey:'',token:1,disposed:false,assets:{hat:asset},states:[],imageFor:async()=>{calls++;throw Error('retry later');},message(){}};vm.createContext(fitting);vm.runInContext(source.slice(source.indexOf('  function fittingSignature('),source.indexOf('  function draw(){')),fitting);
  fitting.prepareFitting();await flush();assert.equal(fitting.fittingKey,'');for(let i=0;i<50;i++)fitting.prepareFitting();assert.equal(calls,1);now=1000;fitting.prepareFitting();await flush();assert.equal(calls,2);
});

test('malformed diagnostic URLs return 400 while the following asset request remains usable',()=>{
  let handler,reads=0;moduleVM('tools/navigation/serve-live.cjs',{}, {'node:http':{createServer(fn){handler=fn;return{listen(){}};}},'node:fs':{readFile(file,done){reads++;done(null,Buffer.from('ok'));}}});
  function request(url,headers={host:'127.0.0.1:8787'}){let code,body;handler({url,headers},{writeHead(value){code=value;return this;},end(value){body=value;}});return{code,body};}
  assert.equal(request('/%E0%A4%A').code,400);assert.equal(request('/%2f..%2fsecret').code,403);assert.equal(request('/',{host:'foreign.invalid:8787'}).code,403);assert.equal(request('/',{host:'localhost:8787',origin:'null'}).code,403);assert.equal(reads,0);assert.equal(request('/index.html').code,200);assert.equal(reads,1);
});

test('recovery conflicts preserve concurrent bytes and leave a retryable journal, including partial recovery',t=>{
  const api=require('../../packages/game-data-editor/lib/store'),dir=temp(t);for(const name of Object.values(api.files))write(dir,name,'{"value":1}');
  const names=[api.files.A,api.files.B],id='interrupted',folder='local/game-data-editor/backups/'+id;
  for(const name of names){write(dir,name,'{"value":2}');write(dir,folder+'/'+name,'{"value":1}');}
  const journalFile=write(dir,folder+'/transaction.json',JSON.stringify({status:'prepared',files:names.map(name=>({path:name,before:api.hash('{"value":1}'),after:api.hash('{"value":2}')}))}));
  let race=true;const wrapped=Object.assign({},fs,{writeFileSync(file,...args){fs.writeFileSync(file,...args);if(race&&String(file).startsWith(path.join(dir,names[1])+'.game-tools-recover-')){race=false;fs.writeFileSync(path.join(dir,names[1]),'{"value":3}');}}});
  const Store=moduleVM('packages/game-data-editor/lib/store.js',{}, {fs:wrapped}).module.exports.Store,store=new Store(dir);
  assert.throws(()=>store.recover({version:store.version,id}),/changed during recovery/);assert.equal(fs.readFileSync(path.join(dir,names[0]),'utf8'),'{"value":1}');assert.equal(fs.readFileSync(path.join(dir,names[1]),'utf8'),'{"value":3}');assert.equal(JSON.parse(fs.readFileSync(journalFile)).status,'prepared');
  fs.writeFileSync(path.join(dir,names[1]),'{"value":2}');store.recover({version:store.version,id});assert.equal(fs.readFileSync(path.join(dir,names[1]),'utf8'),'{"value":1}');assert.equal(JSON.parse(fs.readFileSync(journalFile)).status,'recovered');
});

test('explicit successful Refresh invalidates both asset indices; dirty drafts still block it',()=>{
  let invalidated=0,indexes=0,dirty=false;const store={root:path.resolve('/mock'),snapshot:()=>({version:1}),refresh(){if(dirty)throw Error('drafts');return{version:2};}};
  const api=moduleVM('packages/game-data-editor/main.js',{Editor:{Project:{path:'/mock'},Ipc:{sendToAll(){}}}},{'./lib/store':{Store:class{constructor(){return store;}}},'./lib/unit-assets':{invalidate(){invalidated++;}},'./lib/assets':{index(){return{revision:++indexes};}}}).module.exports;
  const replies=[],event={reply:(error,value)=>replies.push({error,value})};api.messages['asset-index'](event);api.messages['asset-index'](event);assert.equal(indexes,1);
  api.messages.refresh(event);api.messages['asset-index'](event);assert.equal(invalidated,1);assert.equal(indexes,2);
  dirty=true;api.messages.refresh(event);api.messages['asset-index'](event);assert.equal(invalidated,1);assert.equal(indexes,2);assert(replies.some(r=>r.error==='drafts'));
});

test('recording immediate stop and reset cancel scheduled work and ignore stale SDK completions',()=>{
  const scheduled=new Map(),stops=[];function Base(){}Base.prototype.saveData=()=>true;
  const deps={BaseData:{BaseData:Base},TimeUtils:{},Config:{GameConfig:{AppCacheName:'mock'}},LogMgr:{LogMgr:{getInstance:()=>({debug(){}})}},UIUtils:{UIUtils:{schedule(fn,target){scheduled.set(target,fn);},unSchedule(fn,target){if(scheduled.get(target)===fn)scheduled.delete(target);}}},SdkMgr:{SdkMgr:{getInstance:()=>({recordScreen(){},stopRecord(arg,done){stops.push(done);}})}}};
  const c=moduleVM('assets/_script/GameShareData.js',{__extends(ctor,base){ctor.prototype=Object.create(base.prototype);ctor.prototype.constructor=ctor;}},deps),share=new c.exports.ShareData();share.createData();
  share.startRecord();const oldTick=scheduled.get(share);let done=0;share.stopRecord(false,()=>done++);share.stopRecord(false,()=>done++);assert.equal(stops.length,1);assert.equal(scheduled.size,0);oldTick();assert.equal(share.recordTime,0);stops[0]('short.mp4');stops[0]('duplicate.mp4');assert.equal(done,2);assert.equal(share.getCanShare(),false);
  share.clearData();share.startRecord();scheduled.get(share).call(share);share.stopRecord(false,()=>assert.fail('cancelled callback'));const stale=stops[1];share.clearData();share.startRecord();stale('old.mp4');assert.equal(share.isStart,true);assert.equal(share.getSharePath(),'');
  const beforeClear=scheduled.get(share);share.clearData();beforeClear();assert.equal(scheduled.size,0);assert.equal(share.recordTime,0);assert.equal(share.isStart,false);
});
