'use strict';
// Actual extension modules, inert processes/sockets/Electron objects, temporary
// project fixtures only. Never opens a server, browser, Creator or game session.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),flush=()=>new Promise(resolve=>setImmediate(resolve));
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-tools3-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function write(dir,name,bytes){const file=path.join(dir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);return file;}
function moduleVM(relative,globals={},overrides={}){const file=path.join(root,relative),local=createRequire(file),context={module:{exports:{}},exports:{},Buffer,URL,process,__dirname:path.dirname(file),console:{log(){},warn(){},error(){}},setTimeout,clearTimeout,setImmediate,...globals,require:id=>Object.hasOwn(overrides,id)?overrides[id]:local(id)};vm.createContext(context);vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:relative});return context;}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function serverFixture(){
 const state={children:[],killed:[],probes:[],delays:[],probeMode:'manual',now:0};
 const childProcess={spawn(...args){const child=new EventEmitter();Object.assign(child,{pid:100+state.children.length,exitCode:null,signalCode:null,stdout:new EventEmitter(),stderr:new EventEmitter(),args});state.children.push(child);return child;},execFile(_exe,args,_options,done){state.killed.push(+args[1]);done();}};
 const context=moduleVM('packages/cocos-mcp-2x/main.js',{Editor:{log(){}},process:{platform:'win32'},Date:{now:()=>state.now},probe(port){if(state.probeMode!=='manual')return Promise.resolve(state.probeMode==='up');const wait=deferred();state.probes.push({port,...wait});return wait.promise;},delay(){const wait=deferred();state.delays.push(wait);return wait.promise;}},{net:{Socket(){assert.fail('real port probe forbidden');}},http:{createServer(){assert.fail('unexpected server');}},fs:{existsSync:()=>true},child_process:childProcess});
 vm.runInContext('_probePort=probe;_delay=delay;',context);
 return {state,context,call:code=>vm.runInContext(code,context)};
}
test('MCP start coalesces requests and retains ownership of a child that never listens',async()=>{
 const f=serverFixture(),a=f.call('_startServer()'),b=f.call('_startServer()');assert.equal(a,b);assert.equal(f.state.probes.length,1);
 f.state.probeMode='down';f.state.probes[0].resolve(false);await flush();assert.equal(f.state.children.length,1);assert.equal(f.state.children[0].args[2].windowsHide,true);
 f.state.now=13000;f.state.delays[0].resolve();const result=await a;assert.equal(result.managed,true);assert.match(result.lastError,/did not start listening/);
 await f.call('_startServer()');assert.equal(f.state.children.length,1,'slow owned child was replaced');
 const one=f.call('_stopServer()'),two=f.call('_stopServer()');assert.equal(one,two);await one;assert.deepEqual(f.state.killed,[100]);assert.equal(f.call('_serverProc'),null);
});
test('MCP stop during a pending probe prevents launch and does not kill an unmanaged listener',async()=>{
 const f=serverFixture(),start=f.call('_startServer()'),stop=f.call('_stopServer()');f.state.probeMode='up';f.state.probes[0].resolve(false);await Promise.all([start,stop]);
 assert.equal(f.state.children.length,0);assert.deepEqual(f.state.killed,[]);assert.match((await f.call('_serverStatus()')).lastError,/unmanaged listener/);
});
test('MCP unload cancels a pending launch and a start queued behind Stop',async()=>{
 for(const queued of [false,true]){
  const f=serverFixture(),pending=[];
  if(queued){pending.push(f.call('_stopServer()'));pending.push(f.call('_startServer()'));}
  else pending.push(f.call('_startServer()'));
  f.context.module.exports.unload();f.state.probeMode='down';f.state.probes[0].resolve(false);await flush();
  // Resolve a buggy launch loop without leaving the test waiting indefinitely.
  if(f.state.delays.length){f.state.now=13000;f.state.delays.forEach(x=>x.resolve());}
  await Promise.all(pending);assert.equal(f.state.children.length,0,queued?'queued start escaped unload':'pending probe escaped unload');
 }
});
test('MCP start after Stop waits for the old child and ignores its late exit/error events',async()=>{
 const f=serverFixture(),first=f.call('_startServer()');f.state.probeMode='down';f.state.probes[0].resolve(false);await flush();
 const old=f.state.children[0],stop=f.call('_stopServer()'),replacement=f.call('_startServer()');assert.deepEqual(f.state.killed,[100]);assert.equal(f.state.children.length,1);
 f.state.delays[0].resolve();await Promise.all([first,stop]);await flush();assert.equal(f.state.children.length,2);
 old.emit('error',Error('late old error'));old.emit('exit',1,null);assert.equal(f.call('_serverProc.pid'),101);
 f.state.now=13000;f.state.delays[1].resolve();await replacement;await f.call('_stopServer()');assert.deepEqual(f.state.killed,[100,101]);
});
test('MCP runtime log receiver checks Host/Origin before accepting log messages',async()=>{
 let handler;const srv=new EventEmitter();srv.listen=(_port,host,done)=>{assert.equal(host,'127.0.0.1');done();};srv.close=()=>{};
 const c=moduleVM('packages/cocos-mcp-2x/main.js',{Editor:{log(){}}},{http:{createServer(fn){handler=fn;return srv;}}});
 vm.runInContext('_installConsoleHook()',c);await vm.runInContext('_startLogServer(6021)',c);
 function send(host,origin,method='POST'){const req=new EventEmitter();req.headers={host,...origin===undefined?{}:{origin}};req.method=method;req.destroy=()=>{};let code,headers;
  handler(req,{writeHead(status,head){code=status;headers=head||{};},end(){}});if(code===undefined){req.emit('data',JSON.stringify({message:'accepted'}));req.emit('end');}return {code,headers};}
 for(const pair of [['foreign.test:6021','http://localhost:7456'],['localhost:6022','http://localhost:7456'],['user@localhost:6021',undefined],['localhost:6021','null'],['localhost:6021','file://'],['localhost:6021','http://remote.test:7456'],['localhost:6021','http://localhost:7456/'],['localhost:6021','http://u@localhost:7456']])assert.equal(send(...pair).code,403);
 assert.equal(vm.runInContext('_consoleBuffer.entries.length',c),0);
 for(const host of ['127.0.0.1:6021','localhost:6021','[::1]:6021']){const result=send(host,'http://localhost:7456');assert.equal(result.code,204);assert.equal(result.headers['Access-Control-Allow-Origin'],'http://localhost:7456');}
 assert.equal(send('localhost:6021',undefined).code,204);assert.equal(send('localhost:6021','http://localhost:7456','OPTIONS').code,204);
 assert.equal(vm.runInContext('_consoleBuffer.entries.length',c),4);vm.runInContext('_stopLogServer()',c);
});
test('MCP unload closes a runtime log receiver whose listen callback is still pending',async()=>{
 let ready,closed=0;const srv=new EventEmitter();srv.listen=(_port,_host,done)=>ready=done;srv.close=()=>closed++;
 const c=moduleVM('packages/cocos-mcp-2x/main.js',{Editor:{}},{http:{createServer(){return srv;}}});const waiting=vm.runInContext('_startLogServer(6021)',c),cancelled=assert.rejects(waiting,/cancelled/);c.module.exports.unload();ready();await cancelled;
 assert(closed>0);assert.equal(vm.runInContext('_logServer',c),null);
});
test('MCP pending log starts coalesce and stale receiver callbacks cannot replace the current owner',async()=>{
 const servers=[],c=moduleVM('packages/cocos-mcp-2x/main.js',{Editor:{}},{http:{createServer(){const server=new EventEmitter();server.closed=0;server.listen=(_port,_host,done)=>server.ready=done;server.close=()=>server.closed++;servers.push(server);return server;}}});
 const first=vm.runInContext('_startLogServer(6021)',c),same=vm.runInContext('_startLogServer(6021)',c);assert.equal(first,same);assert.equal(servers.length,1);const cancelled=assert.rejects(first,/cancelled/);
 const next=vm.runInContext('_startLogServer(6022)',c);await cancelled;assert.equal(servers.length,2);servers[0].ready();servers[0].emit('error',Error('old bind failure'));servers[1].ready();assert.equal(await next,6022);servers[0].emit('error',Error('old late error'));
 assert.equal(vm.runInContext('_logServer',c),servers[1]);assert.equal(vm.runInContext('_logServerPort',c),6022);vm.runInContext('_stopLogServer()',c);assert(servers[1].closed>0);
});
test('MCP resolved log enable cannot write after unload, disable, or a project switch',async()=>{
 for(const action of ['unload','disable','project']){
  let ready,writes=0;const srv=new EventEmitter();srv.listen=(_port,_host,done)=>ready=done;srv.close=()=>{};
  const Editor={Project:{path:'/first-project'},log(){}},c=moduleVM('packages/cocos-mcp-2x/main.js',{Editor,recordWrite(){writes++;}},{http:{createServer(){return srv;}}});
  vm.runInContext('_writePreviewTemplate=recordWrite;_removePreviewTemplate=()=>{};_runtimeLogsStatus=()=>({enabled:_runtimeLogsOn});',c);
  const pending=vm.runInContext('_enableRuntimeLogs()',c),cancelled=assert.rejects(pending,/cancelled/);ready();
  if(action==='unload')c.module.exports.unload();else if(action==='disable')await vm.runInContext('_disableRuntimeLogs()',c);else Editor.Project.path='/second-project';await cancelled;
  assert.equal(writes,0,action);assert.equal(vm.runInContext('_runtimeLogsOn',c),false,action);
 }
});
test('Legacy Jade marker removal retains trailing same-line bytes and exact authored whitespace',t=>{
 const dir=temp(t),before=Buffer.from('doctype html\r\nbody\r\n'),after=Buffer.concat([Buffer.from(' \tcustom-tail\r\n  \t'),Buffer.from([255])]);
 const old=Buffer.from('  //- COCOS-MCP-LOG-START old\r\n  script.\r\n    console.log("old");\r\n  //- COCOS-MCP-LOG-END');
 const file=write(dir,'preview-templates/index.jade',Buffer.concat([before,old,after])),api=moduleVM('packages/cocos-mcp-2x/template-ownership.js').module.exports;
 api.remove(path.dirname(file),file);assert.deepEqual(fs.readFileSync(file),Buffer.concat([before,after]));
 const original=fs.readFileSync(file);api.install(path.dirname(file),file,'jade','  //- new owned reporter','unused');api.remove(path.dirname(file),file);assert.deepEqual(fs.readFileSync(file),original);
});

function png(tag){const bytes=Buffer.alloc(25);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(8,16);bytes.writeUInt32BE(8,20);bytes[24]=tag;return bytes;}
function artFixture(t,options={}){
 const dir=temp(t),catalog={version:1,defaultLanguage:'en',languages:[{code:'en',nameKey:'language.en'},{code:'fr',nameKey:'language.fr'}],entries:{title:{en:'Hello',fr:'Salut'}},future:{preserve:true},artTemplates:{title:{width:8,height:8,source:'assets/source.png',regions:[{key:'title',rect:{x:0,y:0,width:8,height:8},font:'assets/font.ttf'}]}}};
 const catalogFile=write(dir,'assets/resources/localization/catalog.json',JSON.stringify(catalog,null,2)+'\n'),sourceFile=write(dir,'assets/source.png',png(1));write(dir,'assets/font.ttf','font-bytes');
 const targets=['en','fr'].map(locale=>write(dir,'assets/resources/localization/generated/'+locale+'/title.png',png(2)));
 const state={windows:[],writes:[],renames:[],mkdirs:[],request:null,result:{outputs:['en','fr'].map(locale=>({locale,template:'title',width:8,height:8,data:png(options.noop?2:3).toString('base64')})),metrics:[]}};
 const wrapped={...fs,readFileSync(file,...args){const bytes=fs.readFileSync(file,...args);if(options.read)options.read({file,bytes,sourceFile,catalogFile,state,dir});return bytes;},mkdirSync(...args){state.mkdirs.push(args[0]);return fs.mkdirSync(...args);},writeFileSync(...args){state.writes.push(args[0]);return fs.writeFileSync(...args);},renameSync(from,to){state.renames.push({from,to});if(options.rename)return options.rename({from,to,targets,sourceFile,catalogFile,state,dir});return fs.renameSync(from,to);}};
 class Window{constructor(){this.events=[];this.destroyed=false;this.webContents=new EventEmitter();this.webContents.setAudioMuted=value=>{assert.equal(value,true);this.events.push('mute');};this.webContents.executeJavaScript=async script=>{this.events.push('execute');state.request=JSON.parse(script.slice('window.LocalizationArtRenderer.compile('.length,-1));if(options.render)return options.render({state,targets,sourceFile,catalogFile,dir,catalog});return state.result;};state.windows.push(this);}loadURL(){assert.deepEqual(this.events,['mute']);this.events.push('load');this.webContents.emit('did-finish-load');}isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;}}
 const api=moduleVM('packages/localization-editor/lib/art-compiler.js',{}, {fs:wrapped,electron:{BrowserWindow:Window}}).module.exports;
 return {dir,catalog,catalogFile,sourceFile,targets,state,compile:inputRoot=>api.compile(catalog,inputRoot||dir),journals:()=>{const base=path.join(dir,'local/localization-backups/artwork');return fs.existsSync(base)?fs.readdirSync(base).map(folder=>JSON.parse(fs.readFileSync(path.join(base,folder,'transaction.json')))):[];}};
}
test('Artwork snapshot is muted before load, preserves inputs, backs up writes and performs zero writes for equal outputs',async t=>{
 for(const noop of [false,true]){const f=artFixture(t,{noop}),before=fs.readFileSync(f.catalogFile),result=await f.compile();assert.equal(result.count,2);assert(result.outputs.every(x=>x.changed===!noop));assert.deepEqual(fs.readFileSync(f.catalogFile),before);assert.equal(f.state.request.templates.title.sourceData,'data:image/png;base64,'+png(1).toString('base64'));assert.equal(f.state.request.fonts['assets/font.ttf'],'data:font/ttf;base64,'+Buffer.from('font-bytes').toString('base64'));assert(f.state.windows[0].destroyed);
  if(noop){assert.equal(f.state.writes.length,0);assert.equal(f.state.mkdirs.length,0);assert.equal(f.state.renames.length,0);}else{const journal=f.journals()[0];assert.equal(journal.status,'committed');assert(journal.files.every(file=>/^[a-f0-9]{64}$/.test(file.before)&&/^[a-f0-9]{64}$/.test(file.after)));const base=path.join(f.dir,'local/localization-backups/artwork'),backup=path.join(base,fs.readdirSync(base)[0]);journal.files.forEach(file=>assert.deepEqual(fs.readFileSync(path.join(backup,file.path)),png(2)));}
 }
});
test('Artwork rejects every invalid renderer output before writing any asset',async t=>{
 for(const mode of ['dimension','duplicate','missing','unexpected']){const f=artFixture(t,{render({state}){if(mode==='dimension')state.result.outputs[1].width=9;if(mode==='duplicate')state.result.outputs[1]=state.result.outputs[0];if(mode==='missing')state.result.outputs.pop();if(mode==='unexpected')state.result.outputs[1].template='../escape';return state.result;}});await assert.rejects(f.compile(),/invalid PNG|duplicate|omitted|Unexpected/);assert.equal(f.state.writes.length,0);assert.equal(f.state.renames.length,0);assert(f.state.windows[0].destroyed);f.targets.forEach(file=>assert.deepEqual(fs.readFileSync(file),png(2)));}
});
test('Artwork preserves concurrent catalog, source, font and destination edits made during rendering',async t=>{
 for(const field of ['catalog','source','font','output']){let edited;const f=artFixture(t,{render({state,catalogFile,sourceFile,targets,dir}){edited=field==='catalog'?catalogFile:field==='source'?sourceFile:field==='font'?path.join(dir,'assets/font.ttf'):targets[1];fs.writeFileSync(edited,'external edit');return state.result;}});await assert.rejects(f.compile(),/changed while rendering/);assert.equal(fs.readFileSync(edited,'utf8'),'external edit');assert.equal(f.state.writes.length,0);assert.equal(f.state.renames.length,0);assert(f.state.windows[0].destroyed);}
});
test('Templates sharing one canonical source use one captured snapshot and reject an intervening edit',async t=>{
 let sourceReads=0;
 const f=artFixture(t,{read({file,sourceFile}){if(file===sourceFile&&++sourceReads===1)fs.writeFileSync(sourceFile,png(4));},render({state}){assert.equal(sourceReads,1,'shared source was reread while preparing templates');return state.result;}});
 f.catalog.artTemplates.second={...f.catalog.artTemplates.title,source:'assets/../assets/source.png'};
 fs.writeFileSync(f.catalogFile,JSON.stringify(f.catalog,null,2)+'\n');
 f.state.result.outputs.push(...['en','fr'].map(locale=>({locale,template:'second',width:8,height:8,data:png(3).toString('base64')})));
 await assert.rejects(f.compile(),/Artwork input changed while rendering/);
 const captured='data:image/png;base64,'+png(1).toString('base64');
 assert.equal(f.state.request.templates.title.sourceData,captured);assert.equal(f.state.request.templates.second.sourceData,captured);
 assert.deepEqual(fs.readFileSync(f.sourceFile),png(4));assert.equal(f.state.writes.length,0);assert.equal(f.state.mkdirs.length,0);assert.equal(f.state.renames.length,0);assert(f.state.windows[0].destroyed);
 f.targets.forEach(file=>assert.deepEqual(fs.readFileSync(file),png(2)));
});
test('Artwork rolls back an earlier rename after EBUSY and preserves a concurrently edited committed output',async t=>{
 for(const external of [false,true]){const f=artFixture(t,{rename({from,to,targets}){if(to===targets[1]){if(external)fs.writeFileSync(targets[0],'external first');const error=Error('second output busy');error.code='EBUSY';throw error;}return fs.renameSync(from,to);}});await assert.rejects(f.compile(),/second output busy.*Artwork backups/);assert.equal(f.journals()[0].status,external?'recovery-required':'rolled-back');assert.deepEqual(fs.readFileSync(f.targets[0]),external?Buffer.from('external first'):png(2));assert.deepEqual(fs.readFileSync(f.targets[1]),png(2));assert(f.state.windows[0].destroyed);}
});
test('Artwork rechecks source revisions between output renames and after the final rename',async t=>{
 for(const at of [0,1]){const f=artFixture(t,{rename({from,to,targets,sourceFile}){const result=fs.renameSync(from,to);if(to===targets[at]&&from.endsWith('.tmp'))fs.writeFileSync(sourceFile,'external source');return result;}});await assert.rejects(f.compile(),/input changed while rendering/);assert.equal(fs.readFileSync(f.sourceFile,'utf8'),'external source');f.targets.forEach(file=>assert.deepEqual(fs.readFileSync(file),png(2)));assert.equal(f.journals()[0].status,'rolled-back');}
});
test('Artwork opened through a project junction keeps backups under the canonical transaction folder',async t=>{
 const f=artFixture(t),alias=path.join(temp(t),'project');fs.symlinkSync(f.dir,alias,'junction');await f.compile(alias);
 const base=path.join(f.dir,'local/localization-backups/artwork'),folder=path.join(base,fs.readdirSync(base)[0]),journal=f.journals()[0];
 assert(journal.files.every(file=>!file.path.startsWith('..')&&!path.isAbsolute(file.path)));
 journal.files.forEach(file=>assert.deepEqual(fs.readFileSync(path.join(folder,file.path)),png(2)));
});
test('Queued artwork captures the requesting project and catalog rather than later editor state',async t=>{
 const first=temp(t),second=temp(t),requests=[],Editor={Project:{path:first}},held=deferred();
 const c=moduleVM('packages/localization-editor/main.js',{Editor},{'./lib/art-compiler':{compile(catalog,dir){requests.push({catalog,dir});return requests.length===1?held.promise:Promise.resolve({count:0});}}});
 c.catalog={entries:{title:{en:'first'}}};const one=vm.runInContext('compile(catalog)',c);await flush();const two=vm.runInContext('compile(catalog)',c);c.catalog.entries.title.en='later draft';Editor.Project.path=second;held.resolve({count:0});await Promise.all([one,two]);
 assert.equal(requests.length,2);assert(requests.every(request=>request.dir===first));assert(requests.every(request=>request.catalog.entries.title.en==='first'));
});
