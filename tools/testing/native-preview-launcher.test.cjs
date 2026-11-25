'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),Module=require('node:module'),crypto=require('node:crypto'),{EventEmitter}=require('node:events'),test=require('node:test'),assert=require('node:assert/strict');
const filename=process.env.HKD_NATIVE_LAUNCHER_SOURCE||path.join(__dirname,'../native/launch-optimized-preview.cjs'),code=fs.readFileSync(filename,'utf8'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),fixtures=new Set();
const terrainRevision=require('../native/terrain-geometry-revision.cjs'),groupedMasks=require('../native/grouped-mask-queue.cjs');
const sdkRoot=process.env.HKD_CREATOR_SDK_ROOT||(process.platform==='win32'?'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/cocos2d-x':null);
const terrainSDK=!!sdkRoot&&terrainRevision.PATCHES.every(patch=>fs.existsSync(path.join(sdkRoot,patch.file)));
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(value));}
function tree(root){const result={};function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())scan(f);else result[path.relative(root,f)]=sha(fs.readFileSync(f));}}scan(root);return result;}
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-native-launcher-')),project=path.join(root,'project with spaces'),sdk=path.join(root,'sdk'),native=path.join(sdk,'simulator/win32'),build=path.join(root,'release'),clone=path.join(build,'source'),shared=path.join(clone,'simulator/win32'),bin=path.join(build,'bin'),output=path.join(root,'preview-output'),quick=path.join(project,'temp/quick-scripts/dst'),imports=path.join(project,'library/imports'),metaIds={effect:'aa-effect',atlas:'bb-atlas',texture:'cc-texture',frame:'dd-frame'},source='module.exports = { current: true };\n',sourceFile=path.join(project,'assets/_script/Main.js');
 write(sourceFile,source);write(sourceFile+'.meta',{});write(path.join(project,'assets/_script/NativeTextureFormatCompat.js'),'// plugin\n');write(path.join(project,'assets/_script/NativeTextureFormatCompat.js.meta'),{isPlugin:true});
 const registry=[{path:'preview-scripts/assets/_script/Main.js',deps:{}}];write(path.join(quick,'__quick_compile__.js'),'var scripts = '+JSON.stringify(registry)+';\n');write(path.join(quick,'assets/_script/Main.js'),'// Creator wrapper\n'+source+'\n//# sourceMappingURL=data:application/json;base64,'+Buffer.from(JSON.stringify({sourcesContent:[source]})).toString('base64'));
 const imported=path.join(imports,'ee/ee-data.json');write(imported,{a:1});write(path.join(imports,'ff/native.bin'),Buffer.from([0,255,6,82]));
 write(path.join(project,'assets/resources/GateOverlayBatch.effect.meta'),{uuid:metaIds.effect});write(path.join(project,'assets/resources/gui-pro/health/health-atlas.plist.meta'),{uuid:metaIds.atlas,rawTextureUuid:metaIds.texture,subMetas:{frame:{uuid:metaIds.frame}}});for(const uuid of Object.values(metaIds))write(path.join(imports,uuid.slice(0,2),uuid+'.json'),{uuid});write(path.join(imports,metaIds.frame.slice(0,2),metaIds.frame+'.json'),{__type__:'cc.SpriteFrame',content:{name:'frame',atlas:metaIds.atlas,texture:metaIds.texture}});
 const resources={paths:{[metaIds.effect]:['GateOverlayBatch','cc.EffectAsset'],[metaIds.atlas]:['gui-pro/health/health-atlas','cc.SpriteAtlas'],[metaIds.texture]:['gui-pro/health/health-atlas','cc.Texture2D'],[metaIds.frame]:['gui-pro/health/health-atlas/frame','cc.SpriteFrame',1]},uuids:Object.values(metaIds)};
 for(const name of ['main','resources','internal']){write(path.join(native,'assets',name,'index.js'),' ');write(path.join(native,'assets',name,'config.json'),{});}
 write(path.join(native,'preview-scene.json'),[{_name:'Start'}]);write(path.join(native,'config.json'),{init_cfg:{name:'Simulator',debugPort:5086,consolePort:5087,uploadPort:5088,isWindowTop:true}});
 write(path.join(native,'src/settings.js'),"window._CCSettings={jsList:['assets/_script/NativeTextureFormatCompat.js']};");write(path.join(native,'src/simulator-config.js'),'// current Creator simulator settings');write(path.join(native,'src/asset-record-pipe.js'),'// current Creator record pipe');
 const p=project.split(path.sep).join('/'),q=quick.split(path.sep).join('/'),i=imports.split(path.sep).join('/');
 write(path.join(native,'main.js'),"window.__quick_compile_project__.destPath = '"+q+"/';cc.assetManager.init({importBase:'"+i+"/',nativeBase:'"+i+"/'});function plugin(x){return '"+p+"/' + x;}require('"+q+"/' + '__quick_compile__.js');\n    require('jsb-adapter/jsb-engine.js');\ncc.game.resume();");
 write(path.join(shared,'src/cocos2d-jsb.js'),'// cloned SDK engine');write(path.join(shared,'jsb-adapter/jsb-engine.js'),'// cloned native adapter');write(path.join(shared,'jsb-adapter/jsb-builtin.js'),'// cloned native builtin');
 const executable=path.join(bin,'simulator.exe');write(executable,'MZ fixture release executable - never launched');write(path.join(bin,'dependency.dll'),'fixture DLL');const runtimeFiles=['simulator.exe','dependency.dll'].map(relativePath=>{const bytes=fs.readFileSync(path.join(bin,relativePath));return{relativePath,bytes:bytes.length,sha256:sha(bytes)};});
 const manifest={kind:'hkd-native-preview-release',manifestVersion:1,creatorVersion:'2.4.13',sdk:{sourceRoot:sdk,cloneRoot:clone,sharedResourceRoot:shared},build:{configuration:'Release',platform:'Win32',architecture:'x86',outputRoot:build},features:{highResolutionPacing:false},runtime:{directory:bin,executable,executableSha256:sha(fs.readFileSync(executable)),files:runtimeFiles},abi:{CC_STATIC:1,COCOS2D_DEBUG:0,USE_V8_DEBUGGER:0,NDEBUG:1}},manifestFile=path.join(build,'build-manifest.json');write(manifestFile,manifest);
 const f={root,project,sdk,native,build,clone,shared,bin,output,quick,imports,imported,sourceFile,resources,manifest,manifestFile,executable,metaIds,calls:[],logs:[],fetchHook:null,copyHook:null,options:{creatorProjectRoot:project,creatorSDKRoot:sdk,releaseManifest:manifestFile,outputRoot:output}};fixtures.add(f);return f;
}
function load(f,{cli=false,prepareOnly=false,groupedMaskQueue=false,patchAdapter}={}){
 const child=new EventEmitter();child.pid=4321;child.killed=false;child.kill=function(){this.killed=true;f.kills=(f.kills||0)+1;this.emit('exit',0,'SIGTERM');return true;};f.child=child;
 const processMock=new EventEmitter();processMock.argv=['node',filename,...Object.entries(f.options).flatMap(([key,value])=>[({creatorProjectRoot:'--creator-project-root',creatorSDKRoot:'--creator-sdk-root',releaseManifest:'--release-manifest',outputRoot:'--output-root'})[key],value]),...(prepareOnly?['--prepare-only']:[]),...(groupedMaskQueue?['--grouped-mask-queue']:[])];processMock.exitCode=0;f.process=processMock;
 const host=Object.create(fs),promises={...fs.promises,async writeFile(file,...rest){if(f.copyHook)f.copyHook(file);return fs.promises.writeFile(file,...rest);}};Object.defineProperty(host,'promises',{value:promises});
 const module={exports:{}},local=Module.createRequire(filename),requireMock=name=>name==='node:fs'?host:name==='node:child_process'?{spawn(exe,args,options){f.calls.push({exe,args,options});return child;}}:name==='./grouped-mask-queue.cjs'&&patchAdapter?{patch:patchAdapter}:local(name);requireMock.main=cli?module:{};
 vm.runInNewContext(code,{require:requireMock,module,__dirname:path.dirname(filename),Buffer,URL,AbortSignal,process:processMock,console:{log:s=>f.logs.push(s),error:s=>f.logs.push(s)},fetch:async url=>{if(f.fetchHook)f.fetchHook(url);const name=decodeURIComponent(new URL(url).pathname.split('/')[2]);return{ok:true,json:async()=>JSON.parse(JSON.stringify(name==='resources'?f.resources:{}))};}},{filename});return module.exports;
}
async function waitFor(fn){for(let i=0;i<200;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Timed out waiting for fixture launcher');}
test.afterEach(()=>{for(const f of fixtures){const actual=fs.realpathSync(f.root),temp=fs.realpathSync(os.tmpdir()),relative=path.relative(temp,actual);assert(!relative.startsWith('..')&&!path.isAbsolute(relative)&&path.basename(actual).startsWith('hkd-native-launcher-'),'Delete only this test-owned external fixture');fs.rmSync(actual,{recursive:true,force:true});}fixtures.clear();});

test('normal Start preparation mutes before Creator code, isolates progress, and snapshots all native extensions without starting a game',async()=>{const f=fixture(),api=load(f),before=tree(f.root),p=await api.prepare(f.options),entry=fs.readFileSync(path.join(p.run,'main.js'),'utf8'),app=fs.readFileSync(path.join(p.run,'app-main.js'),'utf8');assert.equal(f.calls.length,0);assert(entry.indexOf('play2d=function(){return -1;}')<entry.indexOf('/app-main.js'));assert(entry.indexOf('setWritablePath')<entry.indexOf('/app-main.js'));assert(p.save.startsWith(f.output)&&!p.save.startsWith(f.project));assert(p.proof.normalStart&&p.proof.mutedBeforeLoad);assert(app.includes(p.run.split(path.sep).join('/')+'/library-imports/'));assert(!app.includes(f.project.split(path.sep).join('/')+'/library/imports'));assert.deepEqual(fs.readFileSync(path.join(p.run,'library-imports/ff/native.bin')),Buffer.from([0,255,6,82]));assert.equal(fs.readFileSync(path.join(p.run,'quick/assets/_script/Main.js'),'utf8'),fs.readFileSync(path.join(f.quick,'assets/_script/Main.js'),'utf8'));for(const[name,digest]of Object.entries(before))assert.equal(sha(fs.readFileSync(path.join(f.root,name))),digest);for(const name of ['main','resources','internal'])assert.equal(fs.readFileSync(path.join(p.run,'assets',name,'index.js'),'utf8'),' ');assert.equal(p.proof.requiredResources.length,4);assert(!/setInterval|createServer|command\.json|__perf|beginLoading|openUI|\.pause\s*=/.test(entry+app));});

test('stale compiled source and missing source map fail before output writes',async()=>{for(const kind of ['stale','no map']){const f=fixture();if(kind==='stale')write(f.sourceFile,'module.exports={newRevision:true};');else write(path.join(f.quick,'assets/_script/Main.js'),'// no source map');await assert.rejects(load(f).prepare(f.options),/stale compiled source|source map missing/);assert(!fs.existsSync(f.output));assert.equal(f.calls.length,0);}});

test('only Start scene and a native entry belonging to this project are accepted',async()=>{for(const kind of ['scene','entry']){const f=fixture();if(kind==='scene')write(path.join(f.native,'preview-scene.json'),[{_name:'Map03'}]);else write(path.join(f.native,'main.js'),'// another project');await assert.rejects(load(f).prepare(f.options),/normal Start|another project/);assert(!fs.existsSync(f.output));}});

test('Release runtime hash, manifest ABI/configuration/features and SDK association are verified',async()=>{for(const kind of ['exe','dll','debug','abi','timer','sdk']){const f=fixture();if(kind==='exe')write(f.executable,'changed exe');else if(kind==='dll')write(path.join(f.bin,'dependency.dll'),'changed DLL');else{if(kind==='debug')f.manifest.build.configuration='Debug';if(kind==='abi')f.manifest.abi.CC_STATIC=0;if(kind==='timer')f.manifest.features.highResolutionPacing=true;if(kind==='sdk')f.manifest.sdk.sourceRoot=f.build;write(f.manifestFile,f.manifest);}await assert.rejects(load(f).prepare(f.options),/hash mismatch|Release Win32|ABI flags|stock Release|SDK source/);assert.equal(f.calls.length,0);assert(!fs.existsSync(f.output));}});

test('output containment protects project, active SDK, complete build root and SDK clone',async()=>{for(const choose of [f=>f.project,f=>f.sdk,f=>f.build,f=>f.clone,f=>f.shared,f=>f.bin]){const f=fixture(),output=path.join(choose(f),'forbidden-preview');await assert.rejects(load(f).prepare({...f.options,outputRoot:output}),/outside project/);assert(!fs.existsSync(output));assert.equal(f.calls.length,0);}});

test('current source changes during manifest collection refuse launch',async()=>{const f=fixture();let changed=false;f.fetchHook=()=>{if(!changed){changed=true;write(f.sourceFile,'module.exports={changedDuringPreparation:true};');}};await assert.rejects(load(f).prepare(f.options),/Input changed/);assert.equal(f.calls.length,0);});

test('repeated settings reads detect an SDK revision change instead of mixing plugin lists',async()=>{const f=fixture();let changed=false;f.fetchHook=()=>{if(!changed){changed=true;write(path.join(f.native,'src/settings.js'),'window._CCSettings={jsList:[]};');}};await assert.rejects(load(f).prepare(f.options),/Input changed/);assert.equal(f.calls.length,0);});

test('late imported JSON mutation after its snapshot is detected even when byte size stays equal',async()=>{const f=fixture();let changed=false;f.copyHook=file=>{if(!changed&&String(file).includes(path.join('quick','__quick_compile__.js'))){changed=true;write(f.imported,{a:2});const t=new Date(Date.now()+5000);fs.utimesSync(f.imported,t,t);}};await assert.rejects(load(f).prepare(f.options),/Snapshot source changed/);assert(changed);assert.equal(f.calls.length,0);});

test('stale Creator resource config fails strictly rather than silently omitting current batch shader/health assets',async()=>{const f=fixture();delete f.resources.paths[f.metaIds.effect];await assert.rejects(load(f).prepare(f.options),/resource manifest is stale.*GateOverlayBatch/);assert(!fs.existsSync(f.output));assert.equal(f.calls.length,0);});

test('nonblank SDK bundle entry is rejected and explicit simulator/win32 SDK path remains supported',async()=>{const f=fixture();write(path.join(f.native,'assets/main/index.js'),'unexpected bundle code');await assert.rejects(load(f).prepare(f.options),/nonblank native bundle script/);assert(!fs.existsSync(f.output));const g=fixture(),p=await load(g).prepare({...g.options,creatorSDKRoot:g.native});assert(p.proof.normalStart);});

test('launch uses only the verified owned executable/save and closes its log descriptor and process record on exit',async()=>{const f=fixture(),api=load(f),p=await api.prepare(f.options),child=api.launch(p);assert.equal(f.calls.length,1);assert.equal(f.calls[0].exe,f.executable);assert(f.calls[0].args.includes(p.save.split(path.sep).join('/')+'/'));assert.equal(f.calls[0].options.cwd,p.run);assert.throws(()=>fs.fstatSync(f.calls[0].options.stdio[1]),/bad file descriptor|EBADF/);assert.equal(child,f.child);child.emit('exit',0,null);const processInfo=JSON.parse(fs.readFileSync(path.join(p.run,'process.json')));assert(processInfo.endedAt);assert.equal(processInfo.exitCode,0);assert(fs.existsSync(p.save));assert(fs.existsSync(path.join(p.run,'preview-proof.json')));});

test('binary drift between prepare and launch refuses to spawn',async()=>{const f=fixture(),api=load(f),p=await api.prepare(f.options);write(f.executable,'changed after preparation');assert.throws(()=>api.launch(p),/hash mismatch/);assert.equal(f.calls.length,0);});

test('grouped mask queue is opt-in, isolated and verified against the actual deployed adapter',async()=>{
 const f=fixture(),stock=fs.readFileSync(path.join(f.shared,'jsb-adapter/jsb-engine.js')),patched=Buffer.from('// supported grouped mask queue fixture\n');
 let calls=0;const api=load(f,{patchAdapter(input){calls++;assert.deepEqual(input,stock);return patched;}});
 const before=tree(f.root),normal=await api.prepare(f.options);
 assert.equal(calls,0);assert.equal(normal.proof.patches.groupedMaskQueue,undefined);
 assert(fs.readFileSync(path.join(normal.run,'app-main.js'),'utf8').includes("require('jsb-adapter/jsb-engine.js');"));
 const prepared=await api.prepare({...f.options,groupedMaskQueue:true}),proof=prepared.proof.patches.groupedMaskQueue;
 assert.equal(calls,1);assert.equal(f.calls.length,0);
 const adapter=path.join(prepared.run,proof.path),entry=path.join(prepared.run,'app-main.js');
 assert.deepEqual(fs.readFileSync(adapter),patched);
 assert.equal(proof.sourceSha256,sha(stock));assert.equal(proof.sha256,sha(fs.readFileSync(adapter)));
 assert.equal(proof.entrySha256,sha(fs.readFileSync(entry)));
 assert(fs.readFileSync(entry,'utf8').includes('require('+JSON.stringify(adapter.split(path.sep).join('/'))+');'));
 const snapshot=prepared.proof.snapshots[2].files.find(row=>row.path==='jsb-engine.js');
 assert.equal(snapshot.sourceBytes,stock.length);assert.equal(snapshot.bytes,patched.length);assert.equal(snapshot.sha256,proof.sha256);
 for(const [file,digest]of Object.entries(before))assert.equal(sha(fs.readFileSync(path.join(f.root,file))),digest);
 api.launch(prepared);assert.equal(f.calls.length,1);
 write(adapter,stock);
 assert.throws(()=>api.launch(prepared),/Grouped mask queue adapter or Start entry changed/);
 write(adapter,patched);write(entry,'// modified entry after preparation');
 assert.throws(()=>api.launch(prepared),/Grouped mask queue adapter or Start entry changed/);
 assert.equal(f.calls.length,1);
});

test('grouped mask queue rejects unsupported adapter and unknown Creator import before creating output',async()=>{
 const f=fixture(),failed=load(f,{patchAdapter(){throw Error('Unsupported grouped mask queue adapter');}});
 await assert.rejects(failed.prepare({...f.options,groupedMaskQueue:true}),/Unsupported grouped mask queue adapter/);
 const nativeEntry=path.join(f.native,'main.js');
 write(nativeEntry,fs.readFileSync(nativeEntry,'utf8').replace("    require('jsb-adapter/jsb-engine.js');","    // require('jsb-adapter/jsb-engine.js');"));
 const unknown=load(f,{patchAdapter(){assert.fail('Unknown entry should be rejected before patching');}});
 await assert.rejects(unknown.prepare({...f.options,groupedMaskQueue:true}),/standard Creator native adapter import/);
 assert(!fs.existsSync(f.output));assert.equal(f.calls.length,0);
});

test('grouped mask queue rejects adapter source drift after the preflight check',async()=>{
 const f=fixture();
 f.fetchHook=()=>write(path.join(f.shared,'jsb-adapter/jsb-engine.js'),'edited after preflight');
 const api=load(f,{patchAdapter:()=>Buffer.from('// isolated patch')});
 await assert.rejects(api.prepare({...f.options,groupedMaskQueue:true}),/Grouped mask queue adapter changed/);
 assert.equal(f.calls.length,0);
});

function terrainFixture(f){
 const records=terrainRevision.PATCHES.map(patch=>{
  const bytes=fs.readFileSync(path.join(sdkRoot,patch.file)),patched=terrainRevision.patchSource(bytes,patch);
  write(path.join(f.build,'source-patch-backups',terrainRevision.DIRECTORY,patch.file),bytes);
  write(path.join(f.clone,patch.file),patched);
  return{...patch,feature:terrainRevision.FEATURE};
 });
 const builder=require('../native/build-native-preview.cjs');
 const diff=builder.sourcePatchDiff(records),diffFile=path.join(f.build,terrainRevision.DIRECTORY+'-diff.json');
 write(diffFile,diff);
 f.manifest.features.terrainGeometryRevision=true;
 f.manifest.terrainGeometryRevisionDiff={file:diffFile,format:'exact-replacement-v1',sha256:sha(diff)};
 write(f.manifestFile,f.manifest);
 const entry=path.join(f.native,'main.js');
 write(entry,fs.readFileSync(entry,'utf8').replace("    require('jsb-adapter/jsb-engine.js');",
    "    require('src/cocos2d-jsb.js');\n    require('jsb-adapter/jsb-engine.js');"));
 return diffFile;
}

test('terrain build resources load in the private muted preview and compose with grouped masks',{skip:!terrainSDK},async()=>{
 const f=fixture();terrainFixture(f);
 const before=tree(f.root),api=load(f);
 const normal=await api.prepare(f.options);
 const grouped=await api.prepare({...f.options,groupedMaskQueue:true});
 const input=fs.readFileSync(path.join(sdkRoot,terrainRevision.ADAPTER));
 const expected=terrainRevision.patchGroupedAdapter(groupedMasks.patch(input));
 for(const [prepared,compose] of [[normal,false],[grouped,true]]){
  const proof=prepared.proof.patches.terrainGeometryRevision;
  const core=path.join(prepared.run,proof.core.path),adapter=path.join(prepared.run,proof.adapter.path),app=path.join(prepared.run,'app-main.js');
  const entry=fs.readFileSync(app,'utf8'),requireFor=file=>'require('+JSON.stringify(file.split(path.sep).join('/'))+');';
  assert(entry.includes(requireFor(core))&&entry.includes(requireFor(adapter)));
  assert(entry.indexOf(requireFor(core))<entry.indexOf(requireFor(adapter)));
  assert.equal(sha(fs.readFileSync(core)),terrainRevision.PATCHES[0].afterSha256);
  assert.equal(sha(fs.readFileSync(adapter)),compose?sha(expected):terrainRevision.PATCHES[1].afterSha256);
  assert.equal(proof.entrySha256,sha(fs.readFileSync(app)));
  assert.equal(!!prepared.proof.patches.groupedMaskQueue,compose);
 }
 for(const [filename,digest] of Object.entries(before))assert.equal(sha(fs.readFileSync(path.join(f.root,filename))),digest);
 api.launch(grouped);
 write(path.join(grouped.run,'src/cocos2d-jsb.js'),'edited after preparation');
 assert.throws(()=>api.launch(grouped),/Terrain geometry revision engine changed/);
 assert.equal(f.calls.length,1);
});

test('terrain preview rejects missing receipt, clone drift and unsupported Creator import before output',{skip:!terrainSDK},async()=>{
 for(const drift of ['receipt','resource','entry']){
  const f=fixture(),diff=terrainFixture(f);
  if(drift==='receipt')write(diff,'changed');
  if(drift==='resource')write(path.join(f.clone,terrainRevision.CORE),'changed');
  if(drift==='entry'){
    const entry=path.join(f.native,'main.js');
    write(entry,fs.readFileSync(entry,'utf8').replace('require(\'src/cocos2d-jsb.js\');','// alternate engine import'));
  }
  await assert.rejects(load(f).prepare(f.options),/Terrain geometry revision.*(?:hash mismatch|standard Creator native core import)/);
  assert(!fs.existsSync(f.output));
  assert.equal(f.calls.length,0);
 }
});

test('CLI prepares a grouped mask queue session without launching when requested',async()=>{
 const f=fixture();let calls=0;
 load(f,{cli:true,prepareOnly:true,groupedMaskQueue:true,patchAdapter(){calls++;return Buffer.from('// grouped preview');}});
 await waitFor(()=>f.logs.some(s=>String(s).includes('Prepared only')));
 assert.equal(calls,1);assert.equal(f.calls.length,0);
});

test('CLI prepare-only starts no child and SIGINT stops only its exact owned child with listener cleanup',async()=>{const f=fixture();load(f,{cli:true,prepareOnly:true});await waitFor(()=>f.logs.some(s=>String(s).includes('Prepared only')));assert.equal(f.calls.length,0);const g=fixture();load(g,{cli:true});await waitFor(()=>g.calls.length===1&&g.process.listenerCount('SIGINT')===1);g.process.emit('SIGINT');assert.equal(g.kills,1);assert.equal(g.process.listenerCount('SIGINT'),0);assert(g.child.killed);});

test('CLI argument parsing is parameterized and rejects missing/unknown flags',()=>{const f=fixture(),api=load(f);const parsed=api.parseArgs(['--creator-project-root','project','--creator-sdk-root','sdk','--release-manifest','manifest','--output-root','outside','--prepare-only','--grouped-mask-queue']);assert.equal(parsed.creatorProjectRoot,'project');assert(parsed.prepareOnly);assert(parsed.groupedMaskQueue);assert(!api.parseArgs([]).groupedMaskQueue);assert.throws(()=>api.parseArgs(['--battle-fixture','1']),/Unknown/);assert.throws(()=>api.parseArgs(['--creator-sdk-root']),/incomplete/);});

 test('Creator bootstrap template comments are ignored when locating the actual script registry',async()=>{const f=fixture(),boot=path.join(f.quick,'__quick_compile__.js');fs.appendFileSync(boot,'// var scripts = ${scripts};\n');const p=await load(f).prepare(f.options);assert.equal(p.proof.scripts.length,1);});

test('Creator private atlas frame dependencies require UUID membership and current imported owner rather than a public resource path',async()=>{const f=fixture();delete f.resources.paths[f.metaIds.frame];const prepared=await load(f).prepare(f.options);assert(prepared.proof.requiredResources.some(r=>r.uuid===f.metaIds.frame));const g=fixture();delete g.resources.paths[g.metaIds.frame];write(path.join(g.imports,g.metaIds.frame.slice(0,2),g.metaIds.frame+'.json'),{__type__:'cc.SpriteFrame',content:{name:'frame',atlas:'old-atlas',texture:g.metaIds.texture}});await assert.rejects(load(g).prepare(g.options),/atlas-frame import is stale/);assert.equal(g.calls.length,0);});

test('present public atlas-frame mappings must retain their current path/type and cannot masquerade as an omitted private mapping',async()=>{for(const mapping of [['wrong/resource','cc.SpriteFrame'],['gui-pro/health/health-atlas/frame','cc.Texture2D'],null,false,0,[]]){const f=fixture();f.resources.paths[f.metaIds.frame]=mapping;await assert.rejects(load(f).prepare(f.options),/resource manifest is stale/);assert.equal(f.calls.length,0);assert(!fs.existsSync(f.output));}});


// Creator2.4.13 urlTransformer.combine prefixes nonempty bundle bases. The
// actual installed function is checked separately during delivery acceptance;
// this dependency contract keeps maintained fixtures independent of an SDK.
test('generated bundle config resolves JSON/native PNG/fonts through frozen global roots; absolute bundle bases are a negative control',async()=>{
 const f=fixture(),png='ab-texture',font='ac-font';write(path.join(f.imports,'ab',png+'.png'),Buffer.from([1,2,3]));write(path.join(f.imports,'ac',font,'fixture.ttf'),Buffer.from([4,5,6]));
 const p=await load(f).prepare(f.options),base=path.join(p.run,'library-imports').split(path.sep).join('/'),config=JSON.parse(fs.readFileSync(path.join(p.run,'assets/internal/config.json')));assert.equal(config.importBase,'');assert.equal(config.nativeBase,'');
 function url(item,config){const override=item.isNative?config.nativeBase:config.importBase,root=override?config.base+override:base;return root+'/'+item.uuid.slice(0,2)+'/'+item.uuid+(item.ext==='.ttf'?'/'+item.options.__nativeName__:item.ext);}
 const rows=[{uuid:'ee-data',ext:'.json',isNative:false,options:{}},{uuid:png,ext:'.png',isNative:true,options:{}},{uuid:font,ext:'.ttf',isNative:true,options:{__nativeName__:'fixture.ttf'}}];
 for(const row of rows){const actual=url(row,{...config,base:'assets/internal/'});assert(fs.existsSync(actual));assert(path.resolve(actual).startsWith(path.resolve(p.run,'library-imports')+path.sep));const old=url(row,{...config,base:'assets/internal/',importBase:base+'/',nativeBase:base+'/'});assert(old.startsWith('assets/internal/'));assert(!fs.existsSync(old));}
});
