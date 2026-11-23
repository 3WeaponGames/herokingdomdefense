'use strict';
// Removing a map never removes its shared Environment-pack source artwork or
// rewrites a stage. Every saved removal uses the normal backup transaction.
const fs=require('fs'),path=require('path'),M=require('./model'),L=require('./legacy'),JSONDoc=require('../lib/json-document');
const Builtins=require('../lib/map-catalog').IDS;
const realpath=fs.realpathSync.native||fs.realpathSync;
function safe(root,file){const absolute=path.resolve(root,file),relative=path.relative(root,absolute);if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Map path leaves the project.');if(fs.existsSync(absolute)){const resolved=path.relative(realpath(root),realpath(absolute));if(!resolved||resolved==='..'||resolved.startsWith('..'+path.sep)||path.isAbsolute(resolved))throw Error('Map path resolves outside the project.');}return absolute;}
const fingerprint=file=>fs.existsSync(file)?L.hash(fs.readFileSync(file)):null;
function files(root,directory,owned){const folder=safe(root,directory),result=[];if(!fs.existsSync(folder))return result;function visit(file){const absolute=safe(root,file);if(fs.lstatSync(absolute).isSymbolicLink()){if(owned)throw Error('Linked map output must be removed from its folder before deletion: '+file);return;}for(const item of fs.readdirSync(absolute,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const child=file+'/'+item.name;if(item.isSymbolicLink()){if(owned)throw Error('Linked map output must be removed from its folder before deletion: '+child);continue;}if(item.isDirectory())visit(child);else result.push(child);}}visit(directory);return result;}
const read=(root,file)=>JSON.parse(fs.readFileSync(safe(root,file),'utf8').replace(/^\uFEFF/,''));
function build(service,request){
 service.expect(request.version);
 const mapId=request.mapId||String(request.key||'').replace(/^map:/,''),key='map:'+mapId;
 if(!/^[A-Za-z0-9_-]+$/.test(mapId)||request.key&&request.key!==key)throw Error('Choose a map to delete.');
 const root=service.root,catalog=service.index().maps,entry=catalog.find(m=>m.id===mapId),doc=service.docs[key],file='authoring/worlds/maps/'+mapId+'.json',revisions={},capture=f=>revisions[f]=fingerprint(safe(root,f));
 capture(file);const saved=revisions[file]!==null?read(root,file):null,map=doc&&doc.data||saved||entry;
 if(!map||!saved&&!entry&&!(doc&&doc.original===null))throw Error('This map was already deleted. Refresh the map list.');
 if(saved&&saved.id!==mapId)throw Error('The map identifier does not match its file.');
 const blocked=[],stages=new Map();
 if(Builtins.includes(mapId))blocked.push('Original maps are shared source prefabs. Keep these sources; copied maps and Terrain concepts can be deleted when unused.');
 if(service.availableMaps().every(candidate=>candidate.id===mapId))blocked.push('Keep at least one map in the project.');
 if(doc&&doc.original!==null&&doc.revision!==revisions[file])blocked.push('The map changed on disk. Refresh it before deleting.');
 const folder='assets/KinghtFallIconMap/Generated/Maps/'+mapId,owned=files(root,folder,true),removals=[file,file+'.meta',...owned,folder+'.meta'].filter(f=>{capture(f);if(revisions[f]!==null&&fs.lstatSync(safe(root,f)).isSymbolicLink())throw Error('Linked map files must be removed before deletion: '+f);return revisions[f]!==null;});
 const used=value=>value&&(value.mapId===mapId||value.EnvironmentMapId===mapId||value.prefab===mapId||typeof value.prefab==='string'&&value.prefab.startsWith('Generated/Maps/'+mapId+'/')||typeof value.Map==='string'&&value.Map.startsWith('Generated/Maps/'+mapId+'/'));
 const cfg=L.configFile('A');capture(cfg);
 if(revisions[cfg]!==null)for(const stage of read(root,cfg).LevelCfg||[])if(used(stage)){const id='A-'+stage.Level;stages.set(id,{id,source:'saved stage'});}
 const stageFiles=files(root,'authoring/worlds/stages').filter(f=>/^A-\d+\.json$/.test(path.basename(f)));
 for(const f of stageFiles){capture(f);const stage=read(root,f);if(used(stage))stages.set(stage.id||path.basename(f,'.json'),{id:stage.id||path.basename(f,'.json'),source:'saved layout'});}
 for(const d of Object.values(service.docs))if(/^stage:A-\d+$/.test(d.key)&&(used(d.data)||used(d.original)))stages.set(d.key.slice(6),{id:d.key.slice(6),source:JSONDoc.equal(d.data,d.original)?'open stage':'stage draft'});
 if(stages.size)blocked.push('Used by stages '+Array.from(stages.keys()).join(', ')+'. Choose another map for those stages and save them first.');
 // Catch direct references to generated sprite UUIDs, even in a prefab that
 // does not have a corresponding authored stage layout.
 const uuids=new Set(),removing=new Set(removals);
 for(const f of removals.filter(f=>f.endsWith('.meta'))){const meta=read(root,f);(function visit(v){if(!v||typeof v!=='object')return;if(typeof v.uuid==='string')uuids.add(v.uuid);for(const child of Object.values(v))visit(child);})(meta);}
 const assetReferences=[];
 const manifestFile='authoring/worlds/library/manifest.json';capture(manifestFile);
 if(revisions[manifestFile]!==null)for(const asset of read(root,manifestFile).assets||[])if(typeof asset.file==='string'){
  const relative=path.relative(path.resolve(root,folder),path.resolve(root,asset.file));
  if(relative&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))assetReferences.push('library asset “'+(asset.name||asset.id)+'”');
 }
 if(uuids.size)for(const f of files(root,'assets').filter(f=>/\.(?:prefab|fire|json)$/.test(f)&&!removing.has(f))){const content=fs.readFileSync(safe(root,f));revisions[f]=L.hash(content);for(const match of content.toString('utf8').matchAll(/"__uuid__"\s*:\s*"([^"]+)"/g))if(uuids.has(match[1])){assetReferences.push(f);break;}}
 if(assetReferences.length)blocked.push('Generated artwork is still referenced by '+assetReferences.join(', ')+'. Remove those references before deleting this map.');
 const plan={map:{id:mapId,name:map.name||mapId,saved:!!saved,dirty:!!(doc&&!JSONDoc.equal(doc.data,doc.original))},stages:Array.from(stages.values()),files:removals,blocked,assetReferences};
 plan.token=L.hash(JSON.stringify({version:service.version,plan,revisions,draft:doc&&doc.data,stageDrafts:Object.values(service.docs).filter(d=>d.key.startsWith('stage:')).map(d=>[d.key,d.data.mapId,d.original&&d.original.mapId])}));
 return {plan,revisions,key,folder};
}
function inspect(service,request){return build(service,request).plan;}
function remove(service,request){
 const data=build(service,request),plan=data.plan;
 if(request.token!==plan.token)throw Error('The map or its references changed. Close this dialog and review Delete map again.');
 if(plan.blocked.length)throw Error(plan.blocked.join('\n'));
 if(service.recoveries().length)throw Error('Recover the interrupted save before deleting a map.');
 service.busy=true;
 try{
  const result=service.commit(plan.files.map(file=>({file,bytes:null})),data.revisions);
  // Only empty owned output directories are removed. All contents were backed
  // up by commit; an unexpected or concurrently created file is retained.
  let warning;
  try{const prune=folder=>{const absolute=safe(service.root,folder);if(!fs.existsSync(absolute))return;if(fs.lstatSync(absolute).isSymbolicLink())return;for(const name of fs.readdirSync(absolute))if(fs.lstatSync(safe(service.root,folder+'/'+name)).isDirectory())prune(folder+'/'+name);if(!fs.readdirSync(absolute).length)fs.rmdirSync(absolute);};prune(data.folder);}catch(error){warning='Map deleted; an empty output folder could not be removed: '+error.message;}
  delete service.docs[data.key];service.undo=service.undo.filter(e=>e.key!==data.key);service.redo=service.redo.filter(e=>e.key!==data.key);
  if(service.stageClipboard&&service.stageClipboard.value.mapId===plan.map.id)service.stageClipboard=null;
  if(service.indexData)service.indexData.maps=service.indexData.maps.filter(m=>m.id!==plan.map.id);service.palette=null;service.sources={};service.version++;
  try{service.persist();}catch(error){warning=[warning,'The external draft recovery copy could not be updated: '+error.message].filter(Boolean).join('; ');}
  const available=service.availableMaps(),next=available.find(m=>m.id==='Map01')||available[0];
  return Object.assign(service.snapshot('map:'+next.id),{busy:false,result:Object.assign(result,{mapDeleted:true,mapId:plan.map.id,mapName:plan.map.name},warning?{warning}:null)});
 }finally{service.busy=false;}
}
module.exports={inspect,remove};
