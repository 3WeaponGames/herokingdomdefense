'use strict';
const path=require('path'),http=require('http'),crypto=require('crypto');
const M=require('./model'),P=require('./prefab'),B=require('./baker'),Runtime=require('./preview-runtime');
const sessions=new Set(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
let generation=0,currentOwner=null;
async function close(entry){
 if(entry.window&&!entry.window.isDestroyed())entry.window.destroy();
 if(entry.server){entry.server.close();entry.server=null;}
 sessions.delete(entry);
}
function bounded(promise,milliseconds,message){
 let timer;return Promise.race([promise,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error(message)),milliseconds);})]).finally(()=>clearTimeout(timer));
}
function stageForMap(service,mapId){
 const candidates=new Map();
 for(const entry of service.index().stages||[])candidates.set(entry.id,entry);
 for(const doc of Object.values(service.docs||{}))if(doc.key.startsWith('stage:'))candidates.set(doc.data.id,doc.data);
 const matches=Array.from(candidates.values()).filter(stage=>stage.mapId===mapId).sort((a,b)=>Number(b.variant==='A')-Number(a.variant==='A')||a.level-b.level||String(a.id).localeCompare(String(b.id)));
 if(!matches.length)throw Error('Assign this map to a stage in Stages & Waves before starting a gameplay preview.');
 return service.loadStage(matches[0].id).data;
}
async function start(Editor,service,request){
 if(request.owner!==undefined&&typeof request.owner!=='string')throw Error('Preview owner must identify an editor panel.');
 const doc=service.doc(request.key),isMap=request.key.startsWith('map:'),map=isMap?doc.data:service.loadMap(doc.data.mapId).data,stage=M.clone(isMap?stageForMap(service,map.id):doc.data);
 stage.mapId=map.id;
 const issues=M.validateMap(map,service.assetTable()).concat(M.validateStage(stage,map,service.index().documents.A.SoldierCfg));
 if(issues.length)throw Error(issues.join('\n'));
 const port=Number(Editor.PreviewServer&&Editor.PreviewServer._previewPort);
 if(!port)throw Error('Creator preview server is unavailable.');
 const ticket=++generation,current=()=>{if(ticket!==generation)throw Error('Draft preview was cancelled.');};
 currentOwner=request.owner===undefined?null:request.owner;
 for(const entry of Array.from(sessions))await close(entry);
 current();
 const baked=await B.bake(service.root,map,service.index().library,{artifacts:service.artifacts,render:service.options.render});
 current();
 const sources=stage.templates||{};
 stage.buildings.concat(stage.specials).forEach(b=>{if(!sources[b.template.prefab])sources[b.template.prefab]=service.source(b.template.prefab);});
 const prefab=P.compact(P.compose(service.root,map,stage,baked,sources)),files=Object.create(null),textures=[],units=new Set();
 for(const wave of stage.config.WaveCfg){
  if(Array.isArray(wave.SpawnTimeline))wave.SpawnTimeline.forEach(e=>units.add(e.unitId));
  else for(const line of wave.RefreshSoldierKind||[])for(const pair of line.split('#')[1].split(';')){const unit=Number(pair.split(',')[0]);if(unit!==-1)units.add(unit);}
 }
 const neededPrefabs=Array.from(new Set(Array.from(units).map(id=>service.index().documents.A.SoldierCfg[id].prefab))),icons=[];
 for(const id of units){const cfg=service.index().documents.A.SoldierCfg[id];if(cfg.loadIcon)try{icons.push(require('../lib/asset-validation').imported(service.root,'KinghtFallIconEnemy',cfg.loadIcon,'sprite').file);}catch(_){}}
 await require('./runtime-assets').sync(Editor,service.root,neededPrefabs,icons);
 current();
 for(const write of baked.writes)if(write.file.endsWith('.png')){
  const name=path.basename(write.file);files[name]=write.bytes;
  const metaWrite=baked.writes.find(w=>w.file===write.file+'.meta'),textureMeta=JSON.parse(metaWrite.bytes),atlas=baked.writes.find(w=>w.file===write.file.replace(/\.png$/,'.plist.meta'));
  if(atlas)textureMeta.subMetas=JSON.parse(atlas.bytes).subMetas;
  textures.push({name,meta:textureMeta});
 }
 const entry={window:null,server:null,logs:[]};
 try{
  entry.server=http.createServer((req,res)=>{
   let name;try{name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname.slice(1));}catch(_){res.writeHead(400);res.end();return;}
   if(!Object.prototype.hasOwnProperty.call(files,name)){res.writeHead(404);res.end();return;}
   res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('content-type','image/png');res.end(files[name]);
  });
  await new Promise((resolve,reject)=>{const failed=error=>reject(error);entry.server.once('error',failed);entry.server.listen(0,'127.0.0.1',()=>{entry.server.removeListener('error',failed);resolve();});});
  current();
  textures.forEach(t=>t.url='http://127.0.0.1:'+entry.server.address().port+'/'+t.name);
  const BrowserWindow=require('electron').BrowserWindow;
  entry.window=new BrowserWindow({show:false,width:800,height:1050,title:'Draft stage preview · Muted · Unsaved',webPreferences:{partition:'hkd-world-'+crypto.randomBytes(8).toString('hex'),nodeIntegration:false,contextIsolation:false,backgroundThrottling:false}});
  entry.window.webContents.setAudioMuted(true);
  sessions.add(entry);
  entry.window.webContents.on('console-message',(_,level,message)=>{if(level>=2){entry.logs.push(message);if(entry.logs.length>50)entry.logs.shift();}});
  const origin='http://127.0.0.1:'+port;
  entry.window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(origin+'/'))event.preventDefault();});
  entry.window.webContents.on('new-window',event=>event.preventDefault());
  entry.window.once('closed',()=>{if(entry.server){entry.server.close();entry.server=null;}sessions.delete(entry);});
  await bounded(entry.window.loadURL(origin+'/'),45000,'The game preview page did not finish loading.');
  current();
  const execute=code=>bounded(entry.window.webContents.executeJavaScript(code),60000,'The draft preview stopped responding.');
  let ready=false;
  for(let i=0;i<120;i++){
   current();if(entry.window.isDestroyed())throw Error('Preview was closed');
   ready=await execute('(()=>{if(!window.cc||!window.__quick_compile_project__)return false;const scene=cc.director.getScene();if(!scene)return false;if(scene.name==="Start"){const starts=scene.getComponentsInChildren(window.__quick_compile_project__.require("StartScreen"));if(starts[0])starts[0].beginLoading();return false;}return scene.name==="Main";})()');
   if(ready)break;await sleep(250);
  }
  if(!ready)throw Error('Game preview did not finish loading.');
  const config=Object.assign(M.clone(stage.config),P.unlocks(stage),{prefab:'__world_draft__',EnvironmentMapId:map.id,EnvironmentBiome:map.biome});
  await execute(Runtime.source({prefab,config,textures,neededPrefabs,sourcePrefabs:Object.keys(sources),sharedConfig:service.index().documents.A,variantConfig:stage.variant==='A'?null:service.index().documents[stage.variant]}));
  current();
  for(let i=0;i<80;i++){
   current();if(entry.window.isDestroyed())throw Error('Preview was closed');
   const state=await execute('({error:window.__worldDraftError||null,ready:!!(window.__worldDraftPrefab&&window.__quick_compile_project__.require("KinghtFallUIGame").default.instance&&window.__quick_compile_project__.require("KinghtFallUIGame").default.instance.ctrGame&&window.__quick_compile_project__.require("KinghtFallUIGame").default.instance.ctrGame.ndMain)})');
   if(state.error)throw Error(state.error);
   if(state.ready){await execute('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');current();entry.window.show();return {started:true,message:'Opened a muted draft preview with an ephemeral player.'};}
   await sleep(250);
  }
  throw Error('Draft assets did not finish loading.');
 }catch(error){await close(entry);throw error;}
}
function shutdown(owner){if(owner!==undefined&&owner!==currentOwner)return false;generation++;currentOwner=null;for(const entry of Array.from(sessions))close(entry);return true;}
module.exports={start,shutdown,_sessions:sessions};
