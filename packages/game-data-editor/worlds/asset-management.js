'use strict';
// Explicit asset-library edits. Inspection never writes; deletion prepares every
// map bake before publishing references, generated artwork and removals together.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),M=require('./model'),L=require('./legacy'),JSONDoc=require('../lib/json-document'),History=require('./history'),Library=require('./library');
const MANIFEST='authoring/worlds/library/manifest.json',GROUPS=Library.FILE,clone=M.clone,equal=JSONDoc.equal;
const bytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n'),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function safe(root,file){const result=path.resolve(root,file),relative=path.relative(root,result);if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Asset path leaves the project.');return result;}
const fingerprint=file=>fs.existsSync(file)?hash(fs.readFileSync(file)):null;
const parse=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function sourceKey(root,file){const absolute=path.resolve(root,file);return (fs.existsSync(absolute)?fs.realpathSync(absolute):absolute).toLowerCase();}
function listJSON(root,folder){const directory=safe(root,folder);return fs.existsSync(directory)?fs.readdirSync(directory).filter(file=>file.endsWith('.json')&&fs.statSync(path.join(directory,file)).isFile()).sort().map(file=>folder+'/'+file):[];}
function cleanMap(value,id){
 const map=clone(value),stats={placements:0,strokes:0,foundation:false};
 const objects=list=>(list||[]).filter(object=>{if(object.assetId===id){stats.placements++;return false;}return true;});
 for(const layer of map.layers||[])layer.objects=objects(layer.objects);
 const layers=M.fixedGround.map(key=>map.ground&&map.ground[key]).concat(map.ground&&map.ground.custom||[]).filter(Boolean);
 for(const layer of layers){
  if(layer.baseAsset===id){layer.baseAsset=null;stats.foundation=true;}
  for(const key of ['images','tiles'])if(layer[key])layer[key]=objects(layer[key]);
  if(layer.strokes)layer.strokes=layer.strokes.filter(stroke=>{
   if(stroke.op==='erase'){if(stroke.assetId===id)delete stroke.assetId;if(stroke.edgeAssetId===id)delete stroke.edgeAssetId;return true;}
   if(stroke.assetId===id||stroke.edgeAssetId===id){stats.strokes++;return false;}return true;
  });
 }
 if(map.images)delete map.images[id];
 return {value:map,stats};
}
function cleanGroups(value,id){
 const data=clone(value),groups=[];
 data.groups=(data.groups||[]).filter(group=>{const count=(group.objects||[]).length;group.objects=(group.objects||[]).filter(object=>object.assetId!==id);const removed=count-group.objects.length;if(removed)groups.push({id:group.id,name:group.name,placements:removed});return group.objects.length||(group.polygons||[]).length;});
 return {value:data,groups};
}
function unsupported(value,id,trail,result){
 trail=trail||[];result=result||[];if(!value||typeof value!=='object')return result;
 for(const key of Object.keys(value)){if(['id','name','description','label','notes','source'].includes(key))continue;const next=trail.concat(key);if(value[key]===id)result.push(next.join('.'));else unsupported(value[key],id,next,result);}return result;
}
function build(service,request){
 service.expect(request.version);
 const root=service.root,manifestText=fs.readFileSync(safe(root,MANIFEST),'utf8'),manifest=JSON.parse(manifestText.replace(/^\uFEFF/,'')),asset=manifest.assets.find(record=>record.id===request.assetId)||service.stagedAssets.get(request.assetId);
 if(!asset)throw Error('This asset is no longer in the project library. Refresh the panel.');
 const blocked=[],files=[],revisions={[MANIFEST]:hash(Buffer.from(manifestText))},mapPlans=[],groupPlans=[],maps=[],groups=[],draftKeys=new Set(),sharedAssets=[],mapFiles=listJSON(root,'authoring/worlds/maps');
 for(const variant of ['A','B','D'])revisions[L.configFile(variant)]=fingerprint(safe(root,L.configFile(variant)));
 let source;
 try{
  source=safe(root,asset.file);
  const owned=safe(root,'authoring/worlds/library/images'),relative=path.relative(owned,source),inside=value=>value&&value!=='..'&&!value.startsWith('..'+path.sep)&&!path.isAbsolute(value);
  if(!inside(relative))blocked.push('This source is shared with native game assets. Delete or replace its native references before removing it.');
  else if(fs.existsSync(source)&&!inside(path.relative(fs.realpathSync(root),fs.realpathSync(source))))blocked.push('This source resolves outside the project. Remove the external link before deleting the asset.');
  else if(fs.existsSync(owned)&&fs.existsSync(source)&&!inside(path.relative(fs.realpathSync(owned),fs.realpathSync(source))))blocked.push('This source resolves outside the owned image folder. Remove the external link before deleting the asset.');
  for(const record of manifest.assets)if(record.id!==asset.id&&sourceKey(root,record.file)===sourceKey(root,asset.file))sharedAssets.push({id:record.id,name:record.name});
  if(sharedAssets.length)blocked.push('The same source image is used by other library entries: '+sharedAssets.map(record=>record.name).join(', ')+'.');
  for(const file of [asset.file,asset.file+'.meta']){const absolute=safe(root,file);if(fs.existsSync(absolute)&&(!inside(path.relative(fs.realpathSync(root),fs.realpathSync(absolute)))||!inside(path.relative(fs.realpathSync(owned),fs.realpathSync(absolute)))))blocked.push('This source or metadata resolves outside the owned image folder: '+file+'.');revisions[file]=fingerprint(absolute);if(revisions[file]!==null)files.push(file);}
 }catch(error){blocked.push(error.message);}
 for(const file of mapFiles){
  const content=fs.readFileSync(safe(root,file)),before=JSON.parse(content.toString('utf8').replace(/^\uFEFF/,'')),cleaned=cleanMap(before,asset.id);revisions[file]=hash(content);
  if(equal(before,cleaned.value))continue;
  const item={id:before.id,name:before.name||before.id,...cleaned.stats};maps.push(item);mapPlans.push({file,before,after:cleaned.value});
  const doc=service.docs['map:'+before.id];if(doc&&!equal(doc.data,doc.original))draftKeys.add(doc.key);
  for(const stageId of service.affected(before.id)){const staged=service.docs['stage:'+stageId];if(staged&&!equal(staged.data,staged.original))draftKeys.add(staged.key);}
  for(const location of unsupported(cleaned.value,asset.id))blocked.push('Map '+before.id+' has an additional asset reference at '+location+'. Remove that reference before deleting this asset.');
 }
 revisions[GROUPS]=fingerprint(safe(root,GROUPS));
 if(revisions[GROUPS]!==null){const before=parse(safe(root,GROUPS)),cleaned=cleanGroups(before,asset.id);groups.push(...cleaned.groups);if(!equal(before,cleaned.value))groupPlans.push({file:GROUPS,before,after:cleaned.value});for(const location of unsupported(cleaned.value,asset.id))blocked.push('The group library has an additional asset reference at '+location+'.');}
 // A new unsaved map can also use the source. Never discard or save that work
 // implicitly while executing a project-wide library command.
 for(const doc of Object.values(service.docs)){
  if(equal(doc.data,doc.original))continue;
  if(doc.key.startsWith('map:')){const cleaned=cleanMap(doc.data,asset.id);if(!equal(doc.data,cleaned.value))draftKeys.add(doc.key);}
  else if(doc.key===Library.KEY&&!equal(doc.data,cleanGroups(doc.data,asset.id).value))draftKeys.add(doc.key);
 }
 const groupDoc=service.docs[Library.KEY];if(groupPlans.length&&groupDoc&&!equal(groupDoc.data,groupDoc.original))draftKeys.add(Library.KEY);
 const plan={asset:{id:asset.id,name:asset.name,file:asset.file,staged:!!asset.stagedFile},maps,groups,files,sharedAssets,blocked:Array.from(new Set(blocked)),draftKeys:Array.from(draftKeys),totalPlacements:maps.reduce((n,m)=>n+m.placements,0)+groups.reduce((n,g)=>n+g.placements,0),totalStrokes:maps.reduce((n,m)=>n+m.strokes,0)};
 plan.token=hash(JSON.stringify({version:service.version,asset,revisions,plan}));
 return {plan,manifest,manifestText,asset,revisions,mapPlans,groupPlans,mapFiles};
}
function inspect(service,request){return build(service,request).plan;}
function checked(service,request){const data=build(service,request);if(request.token!==data.plan.token)throw Error('The asset or its references changed. Review the updated asset details and try again.');return data;}
function patchJSON(text,before,after){return Buffer.from(JSONDoc.patch(text,before,after));}
function finish(service,request,result,touched){
 const affected=new Set(touched||[]);
 for(const key of affected)delete service.docs[key];
 if(result.assetDeleted){
  const mentions=entry=>JSON.stringify(entry.edits).includes(JSON.stringify(request.assetId));
  service.undo=service.undo.filter(entry=>!affected.has(entry.key)&&!mentions(entry));service.redo=service.redo.filter(entry=>!affected.has(entry.key)&&!mentions(entry));
  for(const doc of Object.values(service.docs))for(const value of [doc.data,doc.original])if(value&&value.images)delete value.images[request.assetId];
  delete service.images[request.assetId];service.stagedAssets.delete(request.assetId);
 }
 service.indexData=null;service.palette=null;service.sources={};service.version++;
 let warning;try{service.persist();}catch(error){warning='The asset change was saved, but the external draft recovery copy could not be updated: '+error.message;}
 return Object.assign(service.snapshot(request.key),{busy:false,result:Object.assign(result,warning?{warning}:null)});
}
function rename(service,request){
 const data=checked(service,request),name=String(request.name||'').trim();if(!name||name.length>160||/[\u0000-\u001f]/.test(name))throw Error('Enter an asset name between 1 and 160 characters.');
 if(data.asset.name===name)return Object.assign(service.snapshot(request.key),{result:{saved:false,assetRenamed:false,files:[]}});
 const next=clone(data.manifest),asset=next.assets.find(record=>record.id===request.assetId)||clone(data.asset);
 if(!asset.terrainRole){if(asset.category==='field')asset.terrainRole='field';else if(asset.category==='roads'&&/^road\s+up\s+/i.test(asset.name||''))asset.terrainRole='edge';else if(asset.category==='roads'&&/^road\s+/i.test(asset.name||''))asset.terrainRole='road';}
 if(asset.terrainRole&&!asset.terrainName)asset.terrainName=asset.name;asset.name=name;
 if(data.asset.stagedFile&&!next.assets.some(record=>record.id===request.assetId)){service.stagedAssets.set(asset.id,asset);return finish(service,request,{saved:false,assetRenamed:true,assetId:request.assetId,staged:true,files:[]},[]);}
 const result=service.commit([{file:MANIFEST,bytes:patchJSON(data.manifestText,data.manifest,next)}],{[MANIFEST]:data.revisions[MANIFEST]});
 return finish(service,request,Object.assign(result,{assetRenamed:true,assetId:request.assetId}),[]);
}
function readAt(value,keys){let next=value;for(const key of keys){if(!next||typeof next!=='object')return undefined;next=next[key];}return next;}
function mergeWrites(root,plans){
 const writes=new Map(),originals={};
 for(const plan of plans){
  for(const [file,revision]of Object.entries(plan.originals||{})){if(Object.prototype.hasOwnProperty.call(originals,file)&&originals[file]!==revision)throw Error('Conflicting source revisions for '+file+'.');originals[file]=revision;}
  for(const incoming of plan.writes){
   const old=writes.get(incoming.file);if(!old){writes.set(incoming.file,incoming);continue;}if(old.bytes===null||incoming.bytes===null){if(old.bytes!==incoming.bytes)throw Error('Conflicting removal for '+incoming.file+'.');continue;}if(old.bytes.equals(incoming.bytes))continue;
   const file=safe(root,incoming.file);if(!fs.existsSync(file)||!/(?:\.json|\.prefab)$/.test(incoming.file))throw Error('Conflicting generated output for '+incoming.file+'.');
   const text=fs.readFileSync(file,'utf8');let baseline,value,next;try{baseline=JSON.parse(text.replace(/^\uFEFF/,''));value=JSON.parse(old.bytes);next=JSON.parse(incoming.bytes);}catch(_){throw Error('Conflicting generated output for '+incoming.file+'.');}
   const incomingEdits=JSONDoc.diff(baseline,next);
   for(const edit of incomingEdits){if(!edit.path.length)throw Error('Conflicting whole-document updates for '+incoming.file+'.');const current=readAt(value,edit.path);if(!equal(current,edit.before)&&!equal(current,edit.after))throw Error('Conflicting map updates at '+incoming.file+':'+edit.path.join('.')+'.');}
   History.apply(value,incomingEdits,true);writes.set(incoming.file,{file:incoming.file,bytes:patchJSON(text,baseline,value)});
  }
 }
 return {writes:Array.from(writes.values()),originals};
}
function managedOutput(name){return /^(?:ground-\d+-\d+\.png|objects-\d+\.(?:png|plist)|thumbnail\.png)(?:\.meta)?$/.test(name);}
async function remove(service,request){
 const data=checked(service,request);if(data.plan.blocked.length)throw Error(data.plan.blocked.join('\n'));if(data.plan.draftKeys.length)throw Error('Save or discard these affected drafts before deleting the asset from the project: '+data.plan.draftKeys.join(', ')+'.');if(service.recoveries().length)throw Error('Recover the interrupted save before deleting an asset.');
 service.busy=true;
 try{
  const plans=[],affected=new Set(),touched=[];
  for(const item of data.mapPlans){
   if(fingerprint(safe(service.root,item.file))!==data.revisions[item.file])throw Error('Concurrent change in '+item.file+'. Review the updated asset references before deleting.');
   const Child=require('./service').Service,child=new Child(service.root,Object.assign({},service.options,{prepareOnly:true,artifacts:path.join(service.artifacts,'asset-preparation',data.plan.token,item.before.id)}));
   const doc=child.loadMap(item.before.id);if(doc.revision!==data.revisions[item.file])throw Error('Concurrent change in '+item.file+'. Review the updated asset references before deleting.');doc.data=clone(item.after);const prepared=await child.save({key:doc.key,version:child.version});if(!prepared.writes)throw Error('Map preparation did not return a write plan.');plans.push(prepared);touched.push(doc.key);for(const id of prepared.affected){affected.add(id);touched.push('stage:'+id);}
  }
  const merged=mergeWrites(service.root,plans),writes=new Map(merged.writes.map(write=>[write.file,write])),originals=Object.assign({},data.revisions);
  for(const [file,revision]of Object.entries(merged.originals)){if(Object.prototype.hasOwnProperty.call(originals,file)&&originals[file]!==revision)throw Error('Concurrent change in '+file+'. Review the updated asset references before deleting.');originals[file]=revision;}
  for(const item of data.groupPlans){writes.set(item.file,{file:item.file,bytes:patchJSON(fs.readFileSync(safe(service.root,item.file),'utf8'),item.before,item.after)});touched.push(Library.KEY);}
  const manifest=clone(data.manifest);manifest.assets=manifest.assets.filter(asset=>asset.id!==request.assetId);
  for(const asset of manifest.assets)if(asset.source&&asset.source.assetId===request.assetId)delete asset.source.assetId;
  writes.set(MANIFEST,{file:MANIFEST,bytes:patchJSON(data.manifestText,data.manifest,manifest)});
  for(const file of data.plan.files)writes.set(file,{file,bytes:null});
  // A smaller bake must not leave old texture pages containing deleted artwork.
  // Unknown files are preserved; only this baker's named products are managed.
  for(const item of data.mapPlans){const folder='assets/KinghtFallIconMap/Generated/Maps/'+item.before.id,absolute=safe(service.root,folder);if(!fs.existsSync(absolute))continue;for(const name of fs.readdirSync(absolute))if(managedOutput(name)){const file=folder+'/'+name;if(!writes.has(file)){if(!Object.prototype.hasOwnProperty.call(originals,file))throw Error('Generated assets changed during asset deletion: '+file+'.');writes.set(file,{file,bytes:null});}}}
  for(const write of writes.values())if(!Object.prototype.hasOwnProperty.call(originals,write.file))originals[write.file]=fingerprint(safe(service.root,write.file));
  if(!equal(listJSON(service.root,'authoring/worlds/maps'),data.mapFiles))throw Error('The project map list changed during asset deletion. Review the updated asset references before deleting.');
  const result=service.commit(Array.from(writes.values()),originals);
  return finish(service,request,Object.assign(result,{assetDeleted:true,assetId:request.assetId,affected:Array.from(affected)}),touched);
 }finally{service.busy=false;}
}
module.exports={inspect,rename,remove,cleanMap,cleanGroups,mergeWrites,managedOutput};
