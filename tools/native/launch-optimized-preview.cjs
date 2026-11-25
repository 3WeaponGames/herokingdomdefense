'use strict';

// Prepare an isolated normal Start preview from Creator's current compiled
// project and a verified Release simulator. This tool never builds or edits
// the active project/SDK, copies normal save data, or drives game UI.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),vm=require('node:vm');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const posix=value=>value.split(path.sep).join('/');
const normalized=value=>value.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
function check(value,message){if(!value)throw Error(message);}
function inside(file,root){const relative=path.relative(root,file);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
function resolved(file){let current=path.resolve(file),tail=[];while(!fs.existsSync(current)){tail.unshift(path.basename(current));const parent=path.dirname(current);check(parent!==current,'Cannot resolve path: '+file);current=parent;}return path.join(fs.realpathSync(current),...tail);}
function external(file,protectedRoots){const full=resolved(file);check(!protectedRoots.some(root=>inside(full,root)),'Preview output must stay outside project, Creator SDK and Release runtime: '+full);return full;}
function json(buffer,label){try{return JSON.parse(normalized(buffer.toString('utf8')));}catch(error){throw Error('Invalid JSON '+label+': '+error.message);}}
function readRevision(file,revisions){const before=fs.statSync(file),bytes=fs.readFileSync(file),after=fs.statSync(file);check(before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs,'File changed while reading: '+file);const record={file,bytes:bytes.length,sha256:hash(bytes)};if(revisions){const previous=revisions.get(file);check(!previous||previous.sha256===record.sha256,'Input changed between preparation steps: '+file);revisions.set(file,record);}return bytes;}
function assertRevisions(revisions){for(const record of revisions.values())check(hash(fs.readFileSync(record.file))===record.sha256,'Input changed while preparing preview; let Creator finish importing, then relaunch: '+record.file);}
function walk(root){const files=[],pending=[root];while(pending.length){const dir=pending.pop();for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);check(!entry.isSymbolicLink(),'Snapshot does not follow filesystem links: '+file);if(entry.isDirectory())pending.push(file);else{check(entry.isFile(),'Unknown filesystem entry: '+file);const stat=fs.statSync(file);files.push({path:path.relative(root,file),bytes:stat.size,mtimeMs:stat.mtimeMs,ctimeMs:stat.ctimeMs});}}}return files.sort((a,b)=>a.path.localeCompare(b.path));}
async function snapshotTree(source,target,transform){
  const entries=walk(source),records=new Array(entries.length);let index=0;
  await fs.promises.mkdir(target,{recursive:true});
  await Promise.all(Array.from({length:4},async()=>{
    for(;;){
      const at=index++;
      if(at>=entries.length)return;
      const entry=entries[at],from=path.join(source,entry.path),to=path.join(target,entry.path),before=await fs.promises.stat(from);
      check(before.size===entry.bytes&&before.mtimeMs===entry.mtimeMs&&before.ctimeMs===entry.ctimeMs,'Import changed before snapshot: '+from);
      const bytes=await fs.promises.readFile(from);
      if(path.extname(from).toLowerCase()==='.json')json(bytes,from);
      const deployed=transform?transform(entry.path,bytes):bytes;
      await fs.promises.mkdir(path.dirname(to),{recursive:true});
      await fs.promises.writeFile(to,deployed,{flag:'wx'});
      const after=await fs.promises.stat(from);
      check(before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs,'Import changed during snapshot: '+from);
      const digest=hash(deployed);
      check(hash(await fs.promises.readFile(to))===digest,'Snapshot copy mismatch: '+to);
      const record={path:posix(entry.path),bytes:deployed.length,sha256:digest,sourceMtimeMs:entry.mtimeMs,sourceCtimeMs:entry.ctimeMs};
      if(deployed!==bytes)Object.assign(record,{sourceBytes:bytes.length,sourceSha256:hash(bytes)});
      records[at]=record;
    }
  }));
  check(JSON.stringify(walk(source))===JSON.stringify(entries),'Input tree changed while preparing preview: '+source);
  return{source,target,count:records.length,totalBytes:records.reduce((sum,file)=>sum+file.bytes,0),files:records};
}
function sdkRuntime(root){const full=resolved(root),runtime=fs.existsSync(path.join(full,'simulator/win32/main.js'))?path.join(full,'simulator/win32'):full;check(fs.existsSync(path.join(runtime,'main.js'))&&fs.existsSync(path.join(runtime,'src/settings.js')),'Creator SDK must contain simulator/win32 native preview files');return{root:runtime===full?path.resolve(full,'../..'):full,runtime};}
function verifyRelease(manifestFile,revisions){
  const manifest=json(readRevision(manifestFile,revisions),manifestFile);
  check(manifest.kind==='hkd-native-preview-release'&&manifest.manifestVersion===1&&manifest.creatorVersion==='2.4.13','Expected a version1 Creator2.4.13 native-preview Release manifest');
  check(manifest.build&&manifest.build.configuration==='Release'&&manifest.build.platform==='Win32'&&manifest.build.architecture==='x86'&&path.isAbsolute(manifest.build.outputRoot),'Native preview requires Release Win32 x86 and its build output root');
  check(manifest.features&&manifest.features.highResolutionPacing===false,'Use a stock Release manifest; experimental pacing builds are unsupported');
  const abi=manifest.abi||{};check(abi.CC_STATIC===1&&abi.COCOS2D_DEBUG===0&&abi.USE_V8_DEBUGGER===0&&abi.NDEBUG===1,'Release manifest ABI flags do not match the supported simulator');
  check(manifest.runtime&&path.isAbsolute(manifest.runtime.directory)&&path.isAbsolute(manifest.runtime.executable)&&Array.isArray(manifest.runtime.files),'Release manifest is missing runtime files');
  const directory=resolved(manifest.runtime.directory),seen=new Set();
  for(const record of manifest.runtime.files){check(typeof record.relativePath==='string'&&!path.isAbsolute(record.relativePath),'Runtime file must be relative');const file=resolved(path.join(directory,record.relativePath));check(inside(file,directory)&&!seen.has(file),'Invalid/duplicate Release runtime file: '+record.relativePath);seen.add(file);const bytes=readRevision(file,revisions);check(bytes.length===record.bytes&&hash(bytes)===record.sha256,'Release runtime hash mismatch: '+record.relativePath);}
  const executable=resolved(manifest.runtime.executable);check(inside(executable,directory)&&seen.has(executable),'Release executable is absent from runtime file manifest');check(hash(readRevision(executable,revisions))===manifest.runtime.executableSha256,'Release executable hash mismatch');
  check(manifest.sdk&&path.isAbsolute(manifest.sdk.sourceRoot)&&path.isAbsolute(manifest.sdk.cloneRoot)&&path.isAbsolute(manifest.sdk.sharedResourceRoot),'Release manifest is missing SDK resources');
  const buildRoot=resolved(manifest.build.outputRoot),cloneRoot=resolved(manifest.sdk.cloneRoot);check(inside(directory,buildRoot)&&inside(cloneRoot,buildRoot)&&inside(resolved(manifest.sdk.sharedResourceRoot),cloneRoot),'Release runtime/SDK clone must belong to the declared build root');
  return{manifest,directory,executable,buildRoot,cloneRoot,sharedResourceRoot:resolved(manifest.sdk.sharedResourceRoot)};
}
function verifyCompiled(project,quick,revisions){
  const boot=readRevision(path.join(quick,'__quick_compile__.js'),revisions).toString('utf8'),declarations=[...boot.matchAll(/(?:^|\n)[ \t]*var scripts\s*=\s*(\[[^\r\n]*\]);/g)];check(declarations.length===1,'Unknown Creator quick-compile bootstrap');const scripts=json(Buffer.from(declarations[0][1]),'Creator script registry');check(Array.isArray(scripts),'Creator script registry must be an array');
  const registry=new Set(scripts.map(record=>path.posix.basename(record.path||'','.js'))),proof=[],pending=[path.join(project,'assets/_script')];
  while(pending.length){const dir=pending.pop();for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const sourceFile=path.join(dir,entry.name);check(!entry.isSymbolicLink(),'Script directory links are unsupported: '+sourceFile);if(entry.isDirectory()){pending.push(sourceFile);continue;}if(!entry.isFile()||!entry.name.endsWith('.js'))continue;const metaFile=sourceFile+'.meta',meta=json(readRevision(metaFile,revisions),metaFile);if(meta.isPlugin)continue;const relative=path.relative(project,sourceFile),source=readRevision(sourceFile,revisions).toString('utf8'),compiledFile=path.join(quick,relative);check(registry.has(path.basename(entry.name,'.js'))&&fs.existsSync(compiledFile),'Creator registration missing; refresh scripts in Creator: '+relative);const compiled=readRevision(compiledFile,revisions).toString('utf8'),match=compiled.match(/sourceMappingURL=data:[^,]+,([A-Za-z0-9+/=]+)/);check(match,'Creator source map missing; refresh scripts in Creator: '+relative);const map=json(Buffer.from(match[1],'base64'),compiledFile+' source map');check(Array.isArray(map.sourcesContent)&&map.sourcesContent.some(value=>typeof value==='string'&&normalized(value)===normalized(source)),'Creator has stale compiled source; refresh scripts in Creator: '+relative);proof.push({file:posix(relative),sourceSha256:hash(source),compiledSha256:hash(compiled)});}}
  check(proof.length>0,'No compiled game scripts found');return proof;
}
function verifyRuntimeResources(project,bundles,revisions){
  const resources=bundles.find(bundle=>bundle.name==='resources').config,expected=[];
  const effectFile=path.join(project,'assets/resources/GateOverlayBatch.effect.meta'),effect=json(readRevision(effectFile,revisions),effectFile);
  expected.push({uuid:effect.uuid,resource:'GateOverlayBatch',type:'cc.EffectAsset'});
  const atlasFile=path.join(project,'assets/resources/gui-pro/health/health-atlas.plist.meta'),atlas=json(readRevision(atlasFile,revisions),atlasFile),resource='gui-pro/health/health-atlas';
  expected.push({uuid:atlas.uuid,resource,type:'cc.SpriteAtlas'},{uuid:atlas.rawTextureUuid,resource,type:'cc.Texture2D'});
  for(const[name,frame]of Object.entries(atlas.subMetas||{}))expected.push({uuid:frame.uuid,resource:resource+'/'+name,type:'cc.SpriteFrame',subframe:true,name,atlasUuid:atlas.uuid,textureUuid:atlas.rawTextureUuid});
  for(const item of expected){const found=resources.paths&&resources.paths[item.uuid],listed=typeof item.uuid==='string'&&Array.isArray(resources.uuids)&&resources.uuids.includes(item.uuid);check(listed&&(item.subframe?(found===undefined||Array.isArray(found)&&found[0]===item.resource&&found[1]===item.type):Array.isArray(found)&&found[0]===item.resource&&found[1]===item.type),'Creator resource manifest is stale; refresh imported assets in Creator: '+item.resource);const imported=path.join(project,'library/imports',item.uuid.slice(0,2),item.uuid+'.json');check(fs.existsSync(imported),'Creator import is missing: '+item.resource);const value=json(readRevision(imported,revisions),imported);if(item.subframe)check(value.__type__==='cc.SpriteFrame'&&value.content&&value.content.name===item.name&&value.content.atlas===item.atlasUuid&&value.content.texture===item.textureUuid,'Creator atlas-frame import is stale: '+item.resource);}
  return expected;
}
function relocateEntry(entry,project,quick,imports,run){
  const projectPrefix=posix(project)+'/',quickPrefix=posix(quick)+'/',importsPath=posix(imports),plugins="return '"+projectPrefix+"' + x;";
  check(entry.includes(quickPrefix)&&entry.includes(importsPath),'Creator native entry belongs to another project; prepare the specified project native preview first');check(entry.split(plugins).length===2,'Unknown Creator plugin-loader wrapper');
  return entry.replaceAll(quickPrefix,posix(path.join(run,'quick'))+'/').replaceAll(importsPath,posix(path.join(run,'library-imports'))).replace(plugins,"return '"+posix(path.join(run,'plugins'))+"/' + x;");
}
const groupedMaskAdapter='jsb-engine.js';
function routeGroupedMaskAdapter(entry,run){
  const request=/^([ \t]*)require\('jsb-adapter\/jsb-engine\.js'\);[ \t]*(\r?)$/gm;
  check([...entry.matchAll(request)].length===1,'Grouped mask queue requires the standard Creator native adapter import');
  const file=JSON.stringify(posix(path.join(run,'jsb-adapter',groupedMaskAdapter)));
  return entry.replace(request,(_,indent,cr)=>indent+'require('+file+');'+cr);
}
async function prepare(options){
  check(options&&options.creatorProjectRoot&&options.creatorSDKRoot&&options.releaseManifest&&options.outputRoot,'Required options: creatorProjectRoot, creatorSDKRoot, releaseManifest, outputRoot');
  const revisions=new Map(),project=resolved(options.creatorProjectRoot),sdk=sdkRuntime(options.creatorSDKRoot),release=verifyRelease(resolved(options.releaseManifest),revisions);check(resolved(release.manifest.sdk.sourceRoot)===resolved(sdk.root),'Release SDK source does not match creatorSDKRoot');
  const protectedRoots=[project,resolved(sdk.root),release.buildRoot,release.cloneRoot,release.directory,release.sharedResourceRoot],output=external(options.outputRoot,protectedRoots),quick=path.join(project,'temp/quick-scripts/dst'),imports=path.join(project,'library/imports');
  const scripts=verifyCompiled(project,quick,revisions),sceneFile=path.join(sdk.runtime,'preview-scene.json'),sceneBytes=readRevision(sceneFile,revisions),scene=json(sceneBytes,sceneFile);check(Array.isArray(scene)&&scene[0]&&scene[0]._name==='Start','Prepare the normal Start scene in Creator native preview before launching');
  const originalEntry=readRevision(path.join(sdk.runtime,'main.js'),revisions).toString('utf8'),settingsBytes=readRevision(path.join(sdk.runtime,'src/settings.js'),revisions),context={window:{}};vm.runInNewContext(settingsBytes.toString('utf8'),context,{timeout:1000});const settings=context.window._CCSettings;check(settings&&Array.isArray(settings.jsList),'Unknown Creator native settings');relocateEntry(originalEntry,project,quick,imports,path.join(output,'preflight'));
  const adapterSource=path.join(release.sharedResourceRoot,'jsb-adapter');
  let adapterTransform;
  if(options.groupedMaskQueue===true){
    routeGroupedMaskAdapter(originalEntry,path.join(output,'preflight'));
    const file=path.join(adapterSource,groupedMaskAdapter);
    check(fs.lstatSync(file).isFile()&&inside(resolved(file),adapterSource),'Grouped mask queue requires a regular adapter in the Release SDK copy');
    const input=readRevision(file,revisions),sourceSha256=hash(input);
    const deployed=require('./grouped-mask-queue.cjs').patch(input);
    check(Buffer.isBuffer(deployed)&&hash(deployed)!==sourceSha256,'Grouped mask queue did not produce a patched adapter');
    adapterTransform=(relative,bytes)=>{
      if(relative!==groupedMaskAdapter)return bytes;
      check(hash(bytes)===sourceSha256,'Grouped mask queue adapter changed while preparing the preview');
      return deployed;
    };
  }
  const url=new URL(options.creatorPreviewURL||'http://127.0.0.1:7456/');check(['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.protocol==='http:','Creator preview URL must use local HTTP');
  const bundles=[];for(const entry of fs.readdirSync(path.join(sdk.runtime,'assets'),{withFileTypes:true})){const dir=path.join(sdk.runtime,'assets',entry.name);if(!fs.statSync(dir).isDirectory())continue;const index=readRevision(path.join(dir,'index.js'),revisions);check(/^\s*$/.test(index.toString('utf8')),'Unsupported nonblank native bundle script; refresh Creator preview: '+entry.name);const response=await fetch(new URL('assets/'+encodeURIComponent(entry.name)+'/config.json',url),{signal:AbortSignal.timeout(10000)});check(response.ok,'Current Creator bundle manifest unavailable: '+entry.name);const config=await response.json();check(config&&typeof config==='object'&&!Array.isArray(config),'Invalid Creator bundle manifest: '+entry.name);bundles.push({name:entry.name,index,config});}
  check(bundles.some(bundle=>bundle.name==='main')&&bundles.some(bundle=>bundle.name==='resources')&&bundles.some(bundle=>bundle.name==='internal'),'Creator bundle manifests are incomplete');
  const requiredResources=verifyRuntimeResources(project,bundles,revisions);
  const requiredBytes=walk(imports).reduce((sum,file)=>sum+file.bytes,0)+walk(quick).reduce((sum,file)=>sum+file.bytes,0);fs.mkdirSync(output,{recursive:true});const disk=fs.statfsSync(output);check(Number(disk.bavail)*Number(disk.bsize)>requiredBytes+1024**3,'Insufficient space for isolated preview snapshot');
  const run=external(fs.mkdtempSync(path.join(output,'session-')),protectedRoots),save=external(path.join(output,'separate-preview-save',hash(project).slice(0,12)),protectedRoots);fs.mkdirSync(save,{recursive:true});
  const snapshots=[];snapshots.push(await snapshotTree(imports,path.join(run,'library-imports')));snapshots.push(await snapshotTree(quick,path.join(run,'quick')));
  const adapterSnapshot=await snapshotTree(adapterSource,path.join(run,'jsb-adapter'),adapterTransform);
  snapshots.push(adapterSnapshot);
  fs.mkdirSync(path.join(run,'src'),{recursive:true});for(const name of ['settings.js','simulator-config.js','asset-record-pipe.js'])fs.writeFileSync(path.join(run,'src',name),readRevision(path.join(sdk.runtime,'src',name),revisions),{flag:'wx'});fs.writeFileSync(path.join(run,'src/cocos2d-jsb.js'),readRevision(path.join(release.sharedResourceRoot,'src/cocos2d-jsb.js'),revisions),{flag:'wx'});
  for(const item of settings.jsList){check(typeof item==='string'&&!path.isAbsolute(item)&&!item.split(/[\\/]/).includes('..'),'Invalid Creator plugin path');const target=path.join(run,'plugins',item);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,readRevision(path.join(project,item),revisions),{flag:'wx'});}
  const bundleProof=[];for(const bundle of bundles){bundle.config.importBase='';bundle.config.nativeBase='';const dir=path.join(run,'assets',bundle.name);fs.mkdirSync(dir,{recursive:true});const config=JSON.stringify(bundle.config);fs.writeFileSync(path.join(dir,'config.json'),config,{flag:'wx'});fs.writeFileSync(path.join(dir,'index.js'),bundle.index,{flag:'wx'});bundleProof.push({name:bundle.name,configSha256:hash(config),indexSha256:hash(bundle.index)});}
  const cfgFile=path.join(sdk.runtime,'config.json'),cfg=json(readRevision(cfgFile,revisions),cfgFile);check(cfg.init_cfg,'Unknown Creator simulator configuration');Object.assign(cfg.init_cfg,{name:'Optimized Preview - MUTED - Separate Save',isWindowTop:false,waitForConnect:false,debugPort:0,consolePort:0,uploadPort:0});fs.writeFileSync(path.join(run,'config.json'),JSON.stringify(cfg));fs.writeFileSync(path.join(run,'preview-scene.json'),sceneBytes);
  let appEntry=relocateEntry(originalEntry,project,quick,imports,run);
  const patches={};
  if(adapterTransform){
    appEntry=routeGroupedMaskAdapter(appEntry,run);
    const record=adapterSnapshot.files.find(file=>file.path===groupedMaskAdapter);
    check(record&&record.sourceSha256,'Grouped mask queue adapter was not deployed');
    patches.groupedMaskQueue={path:'jsb-adapter/'+record.path,sourceSha256:record.sourceSha256,sha256:record.sha256,bytes:record.bytes,entrySha256:hash(appEntry)};
  }
  fs.writeFileSync(path.join(run,'app-main.js'),appEntry,{flag:'wx'});
  const entry="jsb.AudioEngine.stopAll();jsb.AudioEngine.play2d=function(){return -1;};jsb.AudioEngine.play2d.__hkdPreviewMuted=true;\nif(!jsb.fileUtils)require('jsb-adapter/jsb-builtin.js');\njsb.fileUtils.setWritablePath("+JSON.stringify(posix(save)+'/')+");\njsb.fileUtils.addSearchPath("+JSON.stringify(posix(release.sharedResourceRoot))+");\nrequire("+JSON.stringify(posix(path.join(run,'app-main.js')))+");\n";fs.writeFileSync(path.join(run,'main.js'),entry);
  assertRevisions(revisions);for(const snapshot of snapshots)check(JSON.stringify(walk(snapshot.source))===JSON.stringify(snapshot.files.map(file=>({path:file.path.split('/').join(path.sep),bytes:file.sourceBytes??file.bytes,mtimeMs:file.sourceMtimeMs,ctimeMs:file.sourceCtimeMs}))),'Snapshot source changed after copy: '+snapshot.source);
  const proof={manifestVersion:1,project,sdkRoot:sdk.root,releaseManifest:resolved(options.releaseManifest),executable:release.executable,executableSha256:release.manifest.runtime.executableSha256,run,save,normalStart:true,mutedBeforeLoad:true,progressIsolation:'Separate persistent preview save. Normal project progress is never copied.',scripts,requiredResources,bundles:bundleProof,inputs:[...revisions.values()],snapshots,patches};fs.writeFileSync(path.join(run,'preview-proof.json'),JSON.stringify(proof,null,2));return{run,save,executable:release.executable,proof};
}
function launch(prepared){
  verifyRelease(prepared.proof.releaseManifest);
  const adapterPatch=prepared.proof.patches?.groupedMaskQueue;
  if(adapterPatch){
    const root=resolved(prepared.run),file=path.join(root,'jsb-adapter',groupedMaskAdapter),entry=path.join(root,'app-main.js');
    check(root===prepared.proof.run&&inside(resolved(file),root)&&inside(resolved(entry),root)&&fs.lstatSync(file).isFile()&&fs.lstatSync(entry).isFile(),'Grouped mask queue files must belong to the prepared preview');
    const bytes=readRevision(file);
    check(bytes.length===adapterPatch.bytes&&hash(bytes)===adapterPatch.sha256&&hash(readRevision(entry))===adapterPatch.entrySha256,'Grouped mask queue adapter or Start entry changed after preparation');
  }
  const logPath=path.join(prepared.run,'simulator.log'),log=fs.openSync(logPath,'w');let child;try{child=cp.spawn(prepared.executable,['-workdir',prepared.run,'-writable-path',posix(prepared.save)+'/','-entry','main.js','-resolution','750x1334','-position','550,20','-console','disable'],{cwd:prepared.run,windowsHide:false,stdio:['ignore',log,log]});}finally{fs.closeSync(log);}
  const info={pid:child.pid,executable:prepared.executable,run:prepared.run,save:prepared.save,startedAt:new Date().toISOString(),muted:true,normalStart:true};const processFile=path.join(prepared.run,'process.json');fs.writeFileSync(processFile,JSON.stringify(info,null,2));
  child.once('error',error=>{info.endedAt=new Date().toISOString();info.error=error.message;fs.writeFileSync(processFile,JSON.stringify(info,null,2));});
  child.once('exit',(code,signal)=>{info.endedAt=new Date().toISOString();info.exitCode=code;info.signal=signal||null;fs.writeFileSync(processFile,JSON.stringify(info,null,2));});
  return child;
}
function parseArgs(argv){const result={};const names={'--creator-project-root':'creatorProjectRoot','--creator-sdk-root':'creatorSDKRoot','--release-manifest':'releaseManifest','--output-root':'outputRoot','--creator-preview-url':'creatorPreviewURL'};for(let i=0;i<argv.length;i++){const arg=argv[i];if(arg==='--prepare-only')result.prepareOnly=true;else if(arg==='--grouped-mask-queue')result.groupedMaskQueue=true;else if(arg==='--help')result.help=true;else{check(names[arg]&&argv[i+1]&&!argv[i+1].startsWith('--'),'Unknown or incomplete argument: '+arg);result[names[arg]]=argv[++i];}}return result;}
const usage='node tools/native/launch-optimized-preview.cjs --creator-project-root <project> --creator-sdk-root <cocos2d-x> --release-manifest <release-manifest.json> --output-root <external-folder> [--creator-preview-url http://127.0.0.1:7456/] [--prepare-only] [--grouped-mask-queue]';
if(require.main===module){let options;try{options=parseArgs(process.argv.slice(2));}catch(error){console.error(error.message+'\n'+usage);process.exitCode=1;}if(options){if(options.help)console.log(usage);else{console.log('Preparing normal optimized preview: MUTED, SEPARATE SAVE.');prepare(options).then(prepared=>{console.log('Save: '+prepared.save+'\nLogs: '+path.join(prepared.run,'simulator.log'));if(options.prepareOnly){console.log('Prepared only; simulator not started.');return;}const child=launch(prepared),stop=()=>{if(!child.killed)child.kill();};process.once('SIGINT',stop);child.once('error',error=>{process.removeListener('SIGINT',stop);console.error(error.message);process.exitCode=1;});child.once('exit',code=>{process.removeListener('SIGINT',stop);console.log('Preview closed.');process.exitCode=code||0;});}).catch(error=>{console.error(error.message);process.exitCode=1;});}}}
module.exports={prepare,launch,parseArgs};
