'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module'),http=require('http'),{EventEmitter}=require('events');
test('world preview backend: each map uses a linked stage layout instead of unrelated Stage 1',async()=>{
 const catalog=[{id:'A-1',variant:'A',level:1,mapId:'Map01'},{id:'B-1',variant:'B',level:1,mapId:'test'},{id:'A-5',variant:'A',level:5,mapId:'test'}],f=fixture({catalog});
 f.service.loadStage=id=>{throw Error('selected '+id);};
 await assert.rejects(f.start(),/selected A-5/);assert.equal(f.windows.length,0);assert.equal(catalog[0].id,'A-1');
});
test('world preview backend: current stage draft map assignments take precedence over saved catalog rows',async()=>{
 const f=fixture({catalog:[{id:'A-1',variant:'A',level:1,mapId:'test'},{id:'B-1',variant:'B',level:1,mapId:'test'}]});
 f.service.docs={'stage:A-1':{key:'stage:A-1',data:{id:'A-1',variant:'A',level:1,mapId:'other'}},'stage:A-10':{key:'stage:A-10',data:{id:'A-10',variant:'A',level:10,mapId:'test'}}};
 const before=JSON.stringify(f.service.docs);f.service.loadStage=id=>{throw Error('selected '+id);};
 await assert.rejects(f.start(),/selected A-10/);assert.equal(JSON.stringify(f.service.docs),before);assert.equal(f.windows.length,0);
});

test('world preview backend: unloaded authored map assignments use the same effective catalog as map usage',async()=>{
 const f=fixture({catalog:[{id:'A-1',variant:'A',level:1,mapId:'test'},{id:'B-1',variant:'B',level:1,mapId:'other'}]}),effective=[{id:'A-1',variant:'A',level:1,mapId:'other'},{id:'A-7',variant:'A',level:7,mapId:'test'},{id:'B-1',variant:'B',level:1,mapId:'test'}];let reads=0;
 f.service.stageCatalog=()=>{reads++;return effective;};f.service.loadStage=id=>{throw Error('selected '+id);};const before=JSON.stringify(effective);await assert.rejects(f.start(),/selected A-7/);assert.equal(reads,1);assert.equal(JSON.stringify(effective),before);assert.equal(f.windows.length,0);
});

test('world preview backend: editable stage schema errors reject before baking or opening gameplay',async()=>{
 let bakes=0,checks=0;const f=fixture({bake:async()=>{bakes++;return f.baked;}});f.service.stageIssues=()=>{checks++;return['Wave rewards must be an array.'];};await assert.rejects(f.start(),/Wave rewards must be an array/);assert.equal(checks,1);assert.equal(bakes,0);assert.equal(f.windows.length,0);assert.equal(f.preview._sessions.size,0);
});
test('world preview backend: unassigned maps require an authored stage and never launch an unrelated layout',async()=>{
 let bakes=0;const f=fixture({catalog:[],bake:async()=>{bakes++;return f.baked;}});
 await assert.rejects(f.start(),/Assign this map to a stage/);assert.equal(bakes,0);assert.equal(f.windows.length,0);
});
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
test('world preview backend: owner teardown cancels its pending startup before any game window opens',async()=>{
 const gate=deferred(),f=fixture({bake:()=>gate.promise}),work=f.start('maps-panel'),rejected=assert.rejects(work,/cancelled/);
 assert.equal(f.preview.shutdown('maps-panel'),true);gate.resolve(f.baked);await rejected;assert.equal(f.windows.length,0);assert.equal(f.preview._sessions.size,0);
});
test('world preview backend: closing an older owner cannot cancel a newer panel startup',async()=>{
 const gates=[deferred(),deferred()];let at=0;const f=fixture({bake:()=>gates[at++].promise}),old=f.start('maps-panel'),rejected=assert.rejects(old,/cancelled/),latest=f.start('stages-panel');
 assert.equal(f.preview.shutdown('maps-panel'),false);gates[1].resolve(f.baked);await latest;gates[0].resolve(f.baked);await rejected;
 assert.equal(f.windows.filter(w=>!w.destroyed).length,1);assert.equal(f.windows[0].shown,true);assert.equal(f.preview.shutdown('stages-panel'),true);assert.equal(f.preview._sessions.size,0);
});
test('world preview backend: owner close preserves another active preview while global unload still closes it',async()=>{
 const f=fixture();try{await f.start('stages-panel');assert.equal(f.preview.shutdown('maps-panel'),false);assert.equal(f.windows[0].destroyed,false);assert.equal(f.preview._sessions.size,1);}finally{f.preview.shutdown();}
 assert.equal(f.windows[0].destroyed,true);assert.equal(f.preview._sessions.size,0);
});
test('world preview backend: malformed ownership cannot take over an existing panel preview',async()=>{
 const f=fixture();try{await f.start('stages-panel');await assert.rejects(f.start({invalid:true}),/owner/);assert.equal(f.preview._sessions.size,1);assert.equal(f.windows[0].destroyed,false);}finally{f.preview.shutdown();}
});
test('world preview main process forwards panel ownership without changing legacy global close',()=>{
 const file=path.resolve(__dirname,'../main.js'),unit=new Module(file,module),calls=[];unit.filename=file;unit.paths=Module._nodeModulePaths(path.dirname(file));unit.require=name=>name==='./worlds/preview'?{shutdown(owner){calls.push(owner);return owner===undefined||owner==='maps-panel';}}:Module.prototype.require.call(unit,name);
 unit._compile(fs.readFileSync(file,'utf8'),file);const handler=unit.exports.messages['world-preview-close'],replies=[],event={reply(error,value){assert.equal(error,null);replies.push(value);}};
 handler(event,{owner:'maps-panel'});handler(event,{owner:'stages-panel'});handler(event);handler(event,null);
 assert.deepEqual(calls,['maps-panel','stages-panel',undefined,undefined]);assert.deepEqual(replies,[{closed:true},{closed:false},{closed:true},{closed:true}]);
});

test('world save IPC retains committed-recovery warnings when Creator import also needs attention',async()=>{
 const file=path.resolve(__dirname,'../main.js'),unit=new Module(file,module),root=path.resolve('unused'),snapshot={version:2,result:{saved:true,files:['assets/saved.json'],warning:'Saved on disk; recovery copy needs attention.'}};unit.filename=file;unit.paths=Module._nodeModulePaths(path.dirname(file));
 unit.require=name=>name==='./worlds/service'?{Service:class{constructor(){this.root=root;}async save(){return snapshot;}}}:Module.prototype.require.call(unit,name);
 global.__worldSaveIPCEditor={Project:{path:root},assetdb:{refresh(_url,done){done(Error('Creator import needs retry'));}},Ipc:{sendToAll(){}}};
 unit._compile('const Editor=global.__worldSaveIPCEditor;'+fs.readFileSync(file,'utf8'),file);
 try{const result=await new Promise((resolve,reject)=>unit.exports.messages['world-save']({reply(error,value){if(error)reject(Error(error));else resolve(value);}},{key:'stage:A-1',version:1}));assert(result.result.saved);assert.match(result.result.warning,/recovery copy needs attention/);assert.match(result.result.warning,/Creator import needs retry/);}finally{delete global.__worldSaveIPCEditor;}
});
function fixture(options={}){
 const windows=[],stages={config:{WaveCfg:[]},mapId:'test',variant:'A',buildings:[],specials:[],spawns:[],graphs:[],hero:{x:0,y:0}},map={id:'test'},documents={A:{SoldierCfg:{}}},baked={writes:[{file:'assets/ground.png',bytes:Buffer.from('png bytes')},{file:'assets/ground.png.meta',bytes:Buffer.from(JSON.stringify({subMetas:{}}))}],ground:[],assets:{}};
 class Window extends EventEmitter{
  constructor(){super();this.destroyed=false;this.shown=false;this.muted=false;this.webContents=new EventEmitter();this.webContents.setAudioMuted=value=>this.muted=value;this.webContents.executeJavaScript=async code=>code.startsWith('({error:')?{ready:true,error:null}:true;windows.push(this);}
  async loadURL(){assert.equal(this.muted,true,'mute applies before navigation');if(options.loadError)throw options.loadError;}
  isDestroyed(){return this.destroyed;}destroy(){if(!this.destroyed){this.destroyed=true;this.emit('closed');}}show(){this.shown=true;}
 }
 const filename=path.resolve(__dirname,'../worlds/preview.js'),unit=new Module(filename,module);unit.filename=filename;unit.paths=Module._nodeModulePaths(path.dirname(filename));
 unit.require=name=>{
  if(name==='./model')return {clone:v=>JSON.parse(JSON.stringify(v)),validateMap:()=>[],validateStage:()=>[]};
  if(name==='./prefab')return {compose:()=>[],compact:v=>v,unlocks:()=>({})};
  if(name==='./baker')return {bake:options.bake||(async()=>baked)};
  if(name==='./runtime-assets')return {sync:async()=>{}};
  if(name==='./preview-runtime')return {source:()=>'"test runtime install"'};
  if(name==='electron')return {BrowserWindow:Window};
  return Module.prototype.require.call(unit,name);
 };
 unit._compile(fs.readFileSync(filename,'utf8'),filename);
 const preview=unit.exports,service={root:'unused',options:{},artifacts:'unused',doc:()=>({data:map}),loadStage:()=>({data:stages}),assetTable:()=>({}),index:()=>({documents,library:[],stages:options.catalog||[{id:'A-1',variant:'A',level:1,mapId:'test'}]})},Editor={PreviewServer:{_previewPort:7456}},start=owner=>preview.start(Editor,service,Object.assign({key:'map:test'},owner===undefined?{}:{owner}));
 return {preview,service,Editor,start,windows,baked};
}
test('world preview backend: closing while a bake is pending cancels the later window',async()=>{
 const gate=deferred(),f=fixture({bake:()=>gate.promise});const work=f.start(),rejected=assert.rejects(work,/cancelled/);f.preview.shutdown();gate.resolve(f.baked);await rejected;assert.equal(f.windows.length,0);assert.equal(f.preview._sessions.size,0);
});
test('world preview backend: a newer request wins when asynchronous bakes finish out of order',async()=>{
 const gates=[deferred(),deferred()];let at=0;const f=fixture({bake:()=>gates[at++].promise});const first=f.start(),rejected=assert.rejects(first,/cancelled/),second=f.start();gates[1].resolve(f.baked);await second;gates[0].resolve(f.baked);await rejected;assert.equal(f.windows.filter(w=>!w.destroyed).length,1);assert.equal(f.windows[0].shown,true);f.preview.shutdown();assert.equal(f.preview._sessions.size,0);
});
test('world preview backend: navigation errors close the muted window and server',async()=>{
 const f=fixture({loadError:Error('navigation failed')});await assert.rejects(f.start(),/navigation failed/);assert.equal(f.windows.length,1);assert.equal(f.windows[0].destroyed,true);assert.equal(f.preview._sessions.size,0);
});
test('world preview backend: missing preview server fails before a bake is started',async()=>{
 let bakes=0;const f=fixture({bake:async()=>{bakes++;return f.baked;}});f.Editor.PreviewServer._previewPort=0;await assert.rejects(f.start(),/unavailable/);assert.equal(bakes,0);assert.equal(f.windows.length,0);
});
function get(port,url){return new Promise((resolve,reject)=>{http.get({host:'127.0.0.1',port,path:url},res=>{const parts=[];res.on('data',b=>parts.push(b));res.on('end',()=>resolve({status:res.statusCode,bytes:Buffer.concat(parts)}));}).on('error',reject);});}
test('world preview backend: its static server rejects malformed URLs and inherited keys',async()=>{
 const f=fixture();try{await f.start();const entry=Array.from(f.preview._sessions)[0],port=entry.server.address().port;
  for(const url of ['/constructor','/__proto__','/toString','/missing.png'])assert.equal((await get(port,url)).status,404,url);
  assert.equal((await get(port,'/%E0%A4%A')).status,400);const image=await get(port,'/ground.png?cache=1');assert.equal(image.status,200);assert.equal(image.bytes.toString(),'png bytes');
 }finally{f.preview.shutdown();}assert.equal(f.preview._sessions.size,0);
});
