'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),url=require('url');
const M=require('./model'),L=require('./legacy'),P=require('./prefab'),B=require('./baker'),JSONDoc=require('../lib/json-document'),History=require('./history'),Library=require('./library'),Groups=require('./groups');
const clone=M.clone,equal=JSONDoc.equal,bytes=v=>Buffer.from(JSON.stringify(v,null,2)+'\n'),fingerprint=file=>fs.existsSync(file)?L.hash(fs.readFileSync(file)):null;
function safe(root,file){const absolute=path.resolve(root,file),relative=path.relative(root,absolute);if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Path leaves project');return absolute;}
function tree(directory){const result={};function visit(dir){if(!fs.existsSync(dir))return;for(const name of fs.readdirSync(dir)){const file=path.join(dir,name);if(fs.statSync(file).isDirectory())visit(file);else result[file]=fingerprint(file);}}visit(directory);return result;}
function id(prefix){return prefix+'-'+crypto.randomBytes(6).toString('hex');}
function validJournal(journal){
 if(!journal||!['prepared','recovery-required','committed','rolled-back'].includes(journal.status)||!Array.isArray(journal.files))return false;
 const files=new Set(),hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 return journal.files.every(entry=>entry&&typeof entry.file==='string'&&entry.file&&!files.has(entry.file)&&files.add(entry.file)&&(entry.before===null||hash(entry.before))&&hash(entry.after));
}
// Keep the previous complete copy intact when a write fails or the editor stops.
function atomicWrite(file,content){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const temp=file+'.hkd-write-'+process.pid+'-'+id('temp');
 try{fs.writeFileSync(temp,content,{flag:'wx'});fs.renameSync(temp,file);}
 finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
class Service{
 constructor(root,options){this.root=path.resolve(root);L.invalidateScripts(this.root);this.options=options||{};this.artifacts=this.options.artifacts||path.join(os.homedir(),'Documents','Codex Artifacts','HeroKingdomDefense','world-builder',L.hash(this.root.toLowerCase()).slice(0,16));if(path.relative(this.root,this.artifacts).split(path.sep)[0]!=='..'&&!path.isAbsolute(path.relative(this.root,this.artifacts)))throw Error('Backups must be outside project');this.version=1;this.docs={};this.stagedAssets=new Map();this.undo=[];this.redo=[];this.busy=false;this.indexData=null;this.images={};this.sources={};this.recovery=path.join(this.artifacts,'drafts.json');this.hadRecovery=fs.existsSync(this.recovery);this.recoveryRevision=fingerprint(this.recovery);this.recoveryBackup=null;this.stageValidation=null;}
 index(){if(!this.indexData){this.stageValidation=null;this.indexData=L.index(this.root);this.images=this.indexData.images||{};const folder=path.join(this.root,'authoring/worlds/maps');if(fs.existsSync(folder))for(const file of fs.readdirSync(folder).filter(f=>f.endsWith('.json'))){const value=L.read(this.root,path.relative(this.root,path.join(folder,file)));const old=this.indexData.maps.find(m=>m.id===value.id);if(old)Object.assign(old,{name:value.name,biome:value.biome});else this.indexData.maps.push({id:value.id,name:value.name,biome:value.biome,path:null,images:{}});}for(const doc of Object.values(this.docs))if(doc.key.startsWith('map:')&&doc.original===null&&!this.indexData.maps.some(m=>m.id===doc.data.id))this.indexData.maps.push({id:doc.data.id,name:doc.data.name,biome:doc.data.biome,path:null,images:{}});this.indexData.library=L.loadLibrary(this.root);for(const a of this.stagedAssets.values())if(!this.indexData.library.some(existing=>existing.id===a.id))this.indexData.library.push(a);}return this.indexData;}
 catalog(){const index=this.index(),units=index.documents.A.SoldierCfg||{},catalog=L.read(this.root,'assets/resources/localization/catalog.json');const text=value=>{const key=/^\[\[loc:(.+)\]\]$/.exec(value||'');const entry=key&&(catalog.entries||{})[key[1]];return entry&&entry.en||value;};const validation=require('../lib/asset-validation'),unitAssets=require('../lib/unit-assets');const buildingLooks={};for(let kind=1;kind<=6;kind++)buildingLooks[kind]=unitAssets.describe(this.root,{type:'building',id:String(kind)});const unitIcon=key=>{try{return url.pathToFileURL(validation.imported(this.root,'resources',key,'sprite').file).href;}catch(_){return null;}};return {version:this.version,buildingLooks,maps:index.maps.map(m=>({id:m.id,name:m.name,biome:m.biome,thumbnail:this.thumbnail(m.id)})),stages:index.stages.map(s=>Object.assign({},s,{name:text(s.name)})),library:index.library,units:Object.keys(units).filter(k=>units[k].prefab&&![90011,90012].includes(Number(k))).map(k=>({id:Number(k),name:text(units[k].Name),icon:units[k].loadIcon,iconUrl:unitIcon(units[k].loadIcon)})),interval:Number(index.documents.A.ParameterCfg['60018'].Value)||.5,recovery:this.hadRecovery||this.recoveries().length>0,recoveries:this.recoveries(),images:this.images,collections:Library.summary(this)};}
 thumbnail(mapId){const file='assets/KinghtFallIconMap/Generated/Maps/'+mapId+'/thumbnail.png';return fs.existsSync(path.join(this.root,file))?url.pathToFileURL(path.join(this.root,file)).href:null;}
 loadMap(mapId){this.index();const key='map:'+mapId;if(!this.docs[key]){if(!/^[A-Za-z0-9_-]+$/.test(mapId))throw Error('Invalid map identifier');const file='authoring/worlds/maps/'+mapId+'.json';const data=fs.existsSync(path.join(this.root,file))?L.read(this.root,file):L.adaptMap(this.root,mapId,this.indexData.maps.find(m=>m.id===mapId));data.images=this.images;this.docs[key]={key,file,original:clone(data),data,revision:fingerprint(path.join(this.root,file)),dependencies:data.legacy?{["assets/KinghtFallIconMap/"+data.legacy.prefab+".prefab"]:fingerprint(path.join(this.root,'assets/KinghtFallIconMap/'+data.legacy.prefab+'.prefab'))}:{}};}return this.docs[key];}
 loadStage(stageId){this.index();const key='stage:'+stageId;if(!this.docs[key]){const parts=/^([ABD])-(\d+)$/.exec(stageId);if(!parts)throw Error('Invalid stage');const v=parts[1],level=Number(parts[2]),config=L.read(this.root,L.configFile(v)).LevelCfg.find(s=>s.Level===level);if(!config)throw Error('Stage was removed');const file='authoring/worlds/stages/'+stageId+'.json';const data=fs.existsSync(path.join(this.root,file))?L.read(this.root,file):L.adaptStage(this.root,v,level,config);data.config=clone(config);data.sourceRevision=L.hash(JSON.stringify(config));this.docs[key]={key,file,original:clone(data),data,revision:fingerprint(path.join(this.root,file))};this.loadMap(data.mapId);}return this.docs[key];}
 loadGroups(){return Library.load(this);}
 doc(key){if(key===Library.KEY)return this.loadGroups();return key.startsWith('map:')?this.loadMap(key.slice(4)):this.loadStage(key.slice(6));}
 snapshot(key){const doc=this.doc(key),issues=key===Library.KEY?Groups.validate(doc.data,this.assetTable()):key.startsWith('map:')?M.validateMap(doc.data,this.assetTable()):this.stageIssues(doc.data,this.loadMap(doc.data.mapId).data);return {version:this.version,key,buildingPreview:key.startsWith('stage:')?require('./building-preview').describe(this,doc.data):undefined,value:clone(doc.data),dirty:!equal(doc.data,doc.original),canUndo:this.undo.some(x=>x.key===key),canRedo:this.redo.some(x=>x.key===key),issues,busy:this.busy,affected:key.startsWith('map:')?this.affected(doc.data.id):[],drafts:Object.values(this.docs).filter(d=>!equal(d.data,d.original)).map(d=>d.key),collections:Library.summary(this),recoveryBackup:this.recoveryBackup};}
 stageIssues(stage,map,context){
  const index=context?context.index:this.index(),issues=M.validateStage(stage,map,index.documents.A.SoldierCfg),schema=require('../lib/schema'),
   content=context?context.catalogContent:fs.readFileSync(path.join(this.root,'assets/resources/localization/catalog.json')),catalogRevision=L.hash(content),
   signature=i=>JSON.stringify([i.doc,i.path,i.message]);
  let baseline=context?null:this.stageValidation;
  if(!baseline||baseline.index!==index||baseline.catalogRevision!==catalogRevision){
   const documents={catalog:{data:JSON.parse(content.toString('utf8').replace(/^\uFEFF/,''))},overrides:{data:index.documents.A.GameTools||{}}};
   for(const v of ['A','B','D'])documents[v]={data:index.documents[v]};
   // Signatures exclude severity; schema changes only severity for a touched path.
   baseline={index,catalogRevision,documents,signatures:new Set(schema.validate(documents,[]).map(signature))};
   if(!context)this.stageValidation=baseline;
  }
  // The schema is read-only. Share untouched tables and replace only this stage row.
  const base=index.documents[stage.variant],rows=base.LevelCfg.slice(),at=rows.findIndex(s=>s.Level===stage.level);
  if(at<0)throw Error('Stage was removed. Refresh before editing.');
  const original=rows[at],changes=[{doc:stage.variant,path:['LevelCfg',at]}];
  rows[at]=Object.assign(clone(stage.config),P.unlocks(stage),{prefab:'Generated/Stages/'+stage.id});
  const documents=Object.assign({},baseline.documents);
  documents[stage.variant]={data:Object.assign(Object.create(null),base,{LevelCfg:rows})};
  const actual=JSONDoc.diff(original,rows[at]).map(c=>['LevelCfg',at].concat(c.path)),
   overlap=(a,b)=>a.slice(0,Math.min(a.length,b.length)).every((v,i)=>String(v)===String(b[i]));
  issues.push(...schema.validate(documents,changes).filter(i=>i.severity==='error'&&(!baseline.signatures.has(signature(i))||i.doc===stage.variant&&actual.some(p=>overlap(p,i.path)))).map(i=>i.message));
  return Array.from(new Set(issues));
 }
 assetTable(){return this.index().library.reduce((r,a)=>(r[a.id]=a,r),{});}
 unitRadius(id){const cfg=this.index().documents.A.SoldierCfg[id];if(!cfg||!cfg.prefab)throw Error('Choose a unit.');const info=require('../lib/map-assets').model(L.read(this.root,'assets/KinghtFallEnemy/'+cfg.prefab+'.prefab')),center=info.byId[info.root].position;let radius=8;for(const shape of info.colliders.filter(c=>c.active&&!c.sensor))for(const p of shape.points)radius=Math.max(radius,Math.hypot(p.x-center.x,p.y-center.y));return {radius:Math.ceil((radius+2)/4)*4};}
 expect(version){if(this.busy)throw Error('A save is in progress. Your draft is retained.');if(version!==this.version)throw Error('Another panel changed the shared draft. Refresh and try again.');}
 change(request){this.expect(request.version);const doc=this.doc(request.key),value=clone(request.value);if(value.id!==doc.data.id)throw Error('Identifiers cannot be changed');if(equal(value,doc.data))return this.snapshot(request.key);if(request.key.startsWith('map:')&&!M.hasGlobalBlockers(value))value.blockerMask=clone(M.mapBlockerRegions(doc.data));this.undo.push({key:doc.key,edits:History.diff(doc.data,value)});this.redo=this.redo.filter(item=>item.key!==doc.key);doc.data=value;this.version++;this.persist();return this.snapshot(doc.key);}
 history(request,redo){this.expect(request.version);const from=redo?this.redo:this.undo,to=redo?this.undo:this.redo;let at=from.length-1;while(at>=0&&from[at].key!==request.key)at--;if(at<0)return this.snapshot(request.key);const change=from.splice(at,1)[0];const doc=this.doc(request.key),value=clone(doc.data);History.apply(value,change.edits,redo);doc.data=value;to.push(change);this.version++;this.persist();return this.snapshot(request.key);}
 refresh(request){this.expect(request.version);L.invalidateScripts(this.root);const removed=new Set();for(const key of Object.keys(this.docs))if(equal(this.docs[key].data,this.docs[key].original)){delete this.docs[key];removed.add(key);}this.undo=this.undo.filter(e=>!removed.has(e.key));this.redo=this.redo.filter(e=>!removed.has(e.key));this.indexData=null;this.palette=null;this.sources={};this.version++;return this.snapshot(request.key);}
 discard(request){this.expect(request.version);const doc=this.doc(request.key);if(doc.original===null){const references=Object.values(this.docs).filter(d=>d.key.startsWith('stage:')&&d.data.mapId===doc.data.id).map(d=>d.key.slice(6));if(references.length)throw Error('This new map is used by stage drafts '+references.join(', ')+'. Choose another map for those stages before discarding it.');delete this.docs[doc.key];this.index().maps=this.index().maps.filter(m=>m.id!==doc.data.id);this.undo=this.undo.filter(x=>x.key!==doc.key);this.redo=this.redo.filter(x=>x.key!==doc.key);this.version++;this.persist();return this.snapshot('map:'+this.index().maps[0].id);}doc.data=clone(doc.original);this.undo=this.undo.filter(x=>x.key!==doc.key);this.redo=this.redo.filter(x=>x.key!==doc.key);this.version++;this.persist();return this.snapshot(doc.key);}
 create(request){this.expect(request.version);const mapId=id('map'),data=request.copy?clone(this.loadMap(request.copy).data):M.createMap(mapId,request.name,request.biome);data.id=mapId;data.blockerMask=clone(M.mapBlockerRegions(data));if(request.copy){delete data.legacy;if(request.biome)data.biome=request.biome;}data.name=request.name||'New map';data.images=this.images;this.docs['map:'+mapId]={key:'map:'+mapId,file:'authoring/worlds/maps/'+mapId+'.json',original:null,data,revision:null};if(!this.index().maps.some(m=>m.id===mapId))this.index().maps.push({id:mapId,name:data.name,biome:data.biome,images:{}});this.version++;this.persist();return this.snapshot('map:'+mapId);}
 affected(mapId){const rows=[];for(const v of ['A','B','D'])for(const s of L.read(this.root,L.configFile(v)).LevelCfg)if((s.EnvironmentMapId||s.prefab)===mapId)rows.push(v+'-'+s.Level);return rows;}
 recoveries(){const folder=path.join(this.artifacts,'saves'),result=[];if(!fs.existsSync(folder))return result;for(const id of fs.readdirSync(folder)){const file=path.join(folder,id,'journal.json');if(!fs.existsSync(file))continue;let journal;try{journal=JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){result.push({id,status:'invalid',files:0});continue;}if(!validJournal(journal)){result.push({id,status:'invalid',files:0});continue;}if(['committed','rolled-back'].includes(journal.status))continue;result.push({id,status:journal.status,files:journal.files.length});}return result.sort((a,b)=>a.id.localeCompare(b.id));}
 recoverTransaction(request){const pending=this.recoveries(),item=pending[0];if(!item)return this.snapshot(request.key);const folder=path.join(this.artifacts,'saves',item.id),file=path.join(folder,'journal.json');let journal;try{journal=JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){throw Error('Invalid recovery journal. Project files were not changed; inspect the preserved backup at '+file);}if(!validJournal(journal))throw Error('Invalid recovery journal. Project files were not changed; inspect the preserved backup at '+file);for(const entry of journal.files){const current=fingerprint(safe(this.root,entry.file));if(current!==entry.before&&current!==entry.after)throw Error('Concurrent change prevents automatic recovery: '+entry.file+'. Backups are preserved in '+folder);if(entry.before!==null&&fingerprint(path.join(folder,entry.file))!==entry.before)throw Error('Recovery backup is missing or changed: '+entry.file);}for(const entry of journal.files){const target=safe(this.root,entry.file),current=fingerprint(target);if(current===entry.before)continue;if(current!==entry.after)throw Error('Concurrent change during recovery: '+entry.file);if(entry.before===null)fs.unlinkSync(target);else{const temp=target+'.hkd-recover-'+process.pid;try{fs.writeFileSync(temp,fs.readFileSync(path.join(folder,entry.file)),{flag:'wx'});fs.renameSync(temp,target);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}}journal.status='rolled-back';atomicWrite(file,bytes(journal));const removed=new Set();for(const key of Object.keys(this.docs))if(equal(this.docs[key].data,this.docs[key].original)){delete this.docs[key];removed.add(key);}this.undo=this.undo.filter(e=>!removed.has(e.key));this.redo=this.redo.filter(e=>!removed.has(e.key));this.indexData=null;this.palette=null;this.sources={};this.version++;return Object.assign(this.snapshot(request.key),{result:{recovered:true,files:journal.files.map(e=>e.file),backup:folder}});}
 persist(){
  const drafts=Object.values(this.docs).filter(d=>!equal(d.data,d.original)),before=fingerprint(this.recovery);
  if(this.recoveryRevision!==undefined&&before!==this.recoveryRevision)throw Error('The external recovery copy changed in another editor. Your in-memory draft is retained. Review '+this.recovery+' before continuing.');
  if(this.hadRecovery&&before!==null){
   const content=fs.readFileSync(this.recovery),backup=safe(this.artifacts,'draft-history/'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+id('unrestored')+'.json');
   atomicWrite(backup,content);
   if(fingerprint(backup)!==before||fingerprint(this.recovery)!==before)throw Error('Recovery changed while preserving its backup. Your in-memory draft is retained.');
   this.recoveryBackup=backup;
  }
  if(drafts.length){
   const content=bytes({version:1,project:this.root,docs:drafts,stagedAssets:this.index().library.filter(a=>a.stagedFile)});
   if(fingerprint(this.recovery)!==before)throw Error('The external recovery copy changed while saving the draft. Your in-memory draft is retained.');
   atomicWrite(this.recovery,content);
  }else if(before!==null)fs.unlinkSync(this.recovery);
  this.recoveryRevision=fingerprint(this.recovery);this.hadRecovery=false;
 }
 recover(request){
  this.expect(request.version);
  if(this.recoveries().length)return this.recoverTransaction(request);
  const content=fs.readFileSync(this.recovery),revision=L.hash(content),recovery=JSON.parse(content.toString('utf8').replace(/^\uFEFF/,''));
  if(!recovery||recovery.project!==this.root)throw Error('Recovery belongs to another project');
  if(!Array.isArray(recovery.docs)||recovery.stagedAssets!==undefined&&!Array.isArray(recovery.stagedAssets)||(recovery.stagedAssets||[]).some(a=>!a||typeof a.id!=='string'||!a.id||typeof a.file!=='string'||!a.file||typeof a.stagedFile!=='string'||!a.stagedFile))throw Error('Invalid draft recovery. Keep the external recovery file for inspection.');
  const additions=[],keys=new Set();
  for(const saved of recovery.docs){
   if(!saved||typeof saved.key!=='string'||keys.has(saved.key)||!saved.data)throw Error('Invalid draft recovery. Keep the external recovery file for inspection.');
   keys.add(saved.key);let current;
   const match=/^map:([A-Za-z0-9_-]+)$/.exec(saved.key),stage=/^stage:([ABD]-\d+)$/.exec(saved.key),
    file=match?'authoring/worlds/maps/'+match[1]+'.json':stage?'authoring/worlds/stages/'+stage[1]+'.json':saved.key===Library.KEY?Library.FILE:null,
    identifier=match?match[1]:stage?stage[1]:'groups';
   if(!file||saved.file!==file||saved.data.id!==identifier)throw Error('Invalid document identifier in draft recovery.');
   if(match&&saved.revision===null&&!this.index().maps.some(m=>m.id===saved.data.id)){
    current={original:null,revision:null};additions.push({id:saved.data.id,name:saved.data.name,biome:saved.data.biome,path:null,images:{}});
   }else current=this.doc(saved.key);
   if(current.revision!==saved.revision||!equal(current.original,saved.original))throw Error('Source changed since recovery. Keep the recovery file and resolve the source changes first.');
   if(current.data&&!equal(current.data,current.original)&&!equal(current.data,saved.data))throw Error('A current draft differs from recovery for '+saved.key+'. Save or discard that draft before recovering; both copies are retained.');
  }
  if(fingerprint(this.recovery)!==revision)throw Error('The external recovery copy changed during recovery. Refresh and try again.');
  for(const map of additions)this.index().maps.push(map);
  for(const asset of recovery.stagedAssets||[]){
   this.stagedAssets.set(asset.id,asset);if(!this.index().library.some(a=>a.id===asset.id))this.index().library.push(asset);
  }
  for(const saved of recovery.docs)this.docs[saved.key]=clone(saved);
  this.undo=this.undo.filter(e=>!keys.has(e.key));this.redo=this.redo.filter(e=>!keys.has(e.key));
  this.hadRecovery=false;this.recoveryRevision=revision;this.version++;return this.snapshot(request.key);
 }
 buildingCatalog(){
  this.index();if(this.palette)return this.palette;
  // Legacy map slots are placement examples, not separate upgrade levels.
  // Keep one complete authored family per type so placement retains all of its
  // gameplay references; the first-level model is a read-only preview concern.
  const names={1:'Main Hall',2:'Archer Tower',3:'Barracks',4:'House',5:'Mill',6:'Wall / Gate'},items=new Map();
  for(const map of this.indexData.maps.filter(m=>m.path)){
   const stage=L.adaptStage(this.root,'A',1,Object.assign({},this.indexData.documents.A.LevelCfg[0],{prefab:map.id}));
   for(const building of stage.buildings)if(names[building.kind]&&!items.has(building.kind))items.set(building.kind,Object.assign(clone(building),{catalogId:map.id+'-'+building.id,name:names[building.kind]}));
   if(items.size===Object.keys(names).length)break;
  }
  this.palette=Array.from(items.values()).sort((a,b)=>a.kind-b.kind);return this.palette;
 }
 buildingPlacements(){return require('./building-palette').describe(this);}
 importImage(request){this.expect(request.version);const file=path.resolve(request.file);if(!/\.(png|jpe?g)$/i.test(file))throw Error('Choose PNG or JPEG');const buffer=fs.readFileSync(file);if(buffer.length>40*1024*1024)throw Error('Choose an image smaller than 40 MB');const hash=L.hash(buffer),assetId='custom-'+hash.slice(0,24),ext=/\.png$/i.test(file)?'.png':'.jpg';const asset={id:assetId,name:path.basename(file,path.extname(file)),category:'custom',biomes:M.BIOMES.slice(),file:'authoring/worlds/library/images/'+assetId+ext,width:request.width,height:request.height,anchor:{x:.5,y:0},depth:'world',sha256:hash,url:url.pathToFileURL(file).href,stagedFile:file};if(!Number.isInteger(asset.width)||!Number.isInteger(asset.height)||asset.width<1||asset.height<1||asset.width>16384||asset.height>16384)throw Error('Invalid image dimensions');if(asset.width*asset.height>16*1024*1024)throw Error('Resize this image to 16 megapixels or less (for example 4096 x 4096) before importing it.');const existing=this.index().library.find(a=>a.id===assetId);if(!existing){this.stagedAssets.set(assetId,asset);this.index().library.push(asset);}this.version++;return {version:this.version,asset:existing||asset};}
 source(prefab){if(!this.sources[prefab])this.sources[prefab]=L.inspect(this.root,prefab).data;return this.sources[prefab];}
 autoBlockers(request){return require('./auto-blockers').apply(this,request);}
 autoBlockerPreview(request){return require('./auto-blockers').preview(this,request);}
 favorite(request){return Library.favorite(this,request);}
 libraryAction(request){return Library.action(this,request);}
 group(request){return Library.get(this,request);}
 placeGroup(request){return Library.place(this,request);}
 saveLibrary(request){return Library.save(this,request);}
 async save(request){if(request.key===Library.KEY)return Library.save(this,request);this.expect(request.version);if(this.recoveries().length)throw Error('Recover the interrupted save before saving another draft.');const doc=this.doc(request.key);if(equal(doc.data,doc.original))return Object.assign(this.snapshot(doc.key),{result:{saved:false,files:[]}});const mapDoc=request.key.startsWith('map:')?doc:this.loadMap(doc.data.mapId),isMap=request.key.startsWith('map:');if(!isMap&&!equal(mapDoc.data,mapDoc.original))throw Error('Save the shared map draft first, then save this stage.');const map=mapDoc.data,validationRevisions={};let validation=null;
 if(!isMap){
  const documents={};
  for(const variant of ['A','B','D']){
   const file=L.configFile(variant),content=fs.readFileSync(safe(this.root,file));
   documents[variant]=JSON.parse(content.toString('utf8').replace(/^\uFEFF/,''));validationRevisions[file]=L.hash(content);
  }
  const file='assets/resources/localization/catalog.json',catalogContent=fs.readFileSync(safe(this.root,file));
  validationRevisions[file]=L.hash(catalogContent);validation={index:Object.assign({},this.index(),{documents}),catalogContent};
 }
 const issues=isMap?M.validateMap(map,this.assetTable()):this.stageIssues(doc.data,map,validation);if(issues.length)throw Error(issues.join('\n'));
 const affected=isMap?this.affected(map.id):[doc.data.id];for(const stageId of affected){const staged=this.docs['stage:'+stageId];if(isMap&&staged&&!equal(staged.data,staged.original))throw Error('Stage '+stageId+' has an unsaved draft. Save or discard it before updating its shared map.');}
 const originals=Object.assign({},validationRevisions),capture=file=>{if(!Object.prototype.hasOwnProperty.call(originals,file))originals[file]=fingerprint(safe(this.root,file));};capture(doc.file);capture(mapDoc.file);for(const d of [doc,mapDoc]){if(fingerprint(safe(this.root,d.file))!==d.revision)throw Error('Authoring source changed on disk. Draft retained.');}for(const d of [doc,mapDoc])for(const file of Object.keys(d.dependencies||{})){if(fingerprint(safe(this.root,file))!==d.dependencies[file])throw Error('Source prefab changed since this draft was opened. Draft retained.');capture(file);}for(const v of ['A','B','D'])capture(L.configFile(v));capture('authoring/worlds/library/manifest.json');const generated=tree(path.join(this.root,'assets/KinghtFallIconMap/Generated'));for(const file of Object.keys(generated))originals[path.relative(this.root,file).split(path.sep).join('/')]=generated[file];if(map.legacy)capture('assets/KinghtFallIconMap/'+map.legacy.prefab+'.prefab');
 const stagePlans=Object.create(null),sourcePlans=Object.create(null);
 // Snapshot every linked layout and unembedded source before asynchronous baking.
 for(const stageId of affected){
  const stageFile='authoring/worlds/stages/'+stageId+'.json';capture(stageFile);
  const stage=!isMap?clone(doc.data):fs.existsSync(safe(this.root,stageFile))?L.read(this.root,stageFile):null;
  if(!stage)continue;
  const sources=stage.templates||{},embedded=new Set(Object.keys(sources));
  for(const b of stage.buildings.concat(stage.specials))if(!embedded.has(b.template.prefab)){
   const prefab=b.template.prefab,file='assets/KinghtFallIconMap/'+prefab+'.prefab';
   if(!sourcePlans[prefab]){
    capture(file);sourcePlans[prefab]=L.inspect(this.root,prefab);
    if(sourcePlans[prefab].revision!==originals[file])throw Error('Building source changed while preparing this save. Draft retained.');
   }
   if(b.template.revision&&sourcePlans[prefab].revision!==b.template.revision)throw Error('Building source changed since this layout was opened. Draft retained.');
   if(!sources[prefab])sources[prefab]=clone(sourcePlans[prefab].data);
  }
  stage.templates=sources;stagePlans[stageId]=stage;
 }
 const previousSize=mapDoc.original&&mapDoc.original.size;
 if(isMap&&previousSize&&(map.size.width<previousSize.width||map.size.height<previousSize.height)){
  const legacyConfigs=Object.create(null);
  for(const stageId of affected){
   let stage=stagePlans[stageId];
   if(!stage){
    const parts=stageId.split('-'),variant=parts[0],level=Number(parts[1]);
    if(!legacyConfigs[variant])legacyConfigs[variant]=L.read(this.root,L.configFile(variant));
    const config=legacyConfigs[variant].LevelCfg.find(s=>s.Level===level);
    if(!config)throw Error('Stage '+stageId+' was removed. Refresh before saving.');
    stage=L.adaptStage(this.root,variant,level,config);
   }
   const placements=stage.buildings.concat(stage.specials,stage.spawns).filter(p=>p.enabled!==false).concat([stage.hero]);
   if(placements.some(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(Math.abs(p.x)>map.size.width/2||Math.abs(p.y)>map.size.height/2)))throw Error('Stage '+stageId+' has enabled placements outside the resized map. Keep a larger map or move those stage placements before shrinking it. Your draft is retained.');
  }
 }
 if(fingerprint(safe(this.root,doc.file))!==doc.revision)throw Error('Authoring source changed on disk. Draft retained.');
 this.busy=true;try{const baked=await B.bake(this.root,map,this.index().library,{artifacts:this.artifacts,render:this.options.render});const writes=baked.writes.slice();const serialized=clone(map);delete serialized.images;writes.push({file:mapDoc.file,bytes:bytes(serialized)});
 const manifest=L.read(this.root,'authoring/worlds/library/manifest.json'),used=new Set();for(const l of map.layers)for(const o of l.objects)if(o.assetId)used.add(o.assetId);for(const layer of M.groundLayers(map)){if(layer.baseAsset)used.add(layer.baseAsset);for(const s of layer.strokes||[])for(const id of require('./terrain').strokeAssets(s))used.add(id);for(const o of layer.images||[])used.add(o.assetId);}for(const tile of map.ground.foundation.tiles||[])used.add(tile.assetId);for(const a of this.index().library.filter(a=>a.stagedFile&&used.has(a.id))){const imported=fs.readFileSync(a.stagedFile);if(L.hash(imported)!==a.sha256)throw Error('Imported source changed. Import it again.');capture(a.file);writes.push({file:a.file,bytes:imported});const record=clone(a);delete record.url;delete record.stagedFile;if(!manifest.assets.some(x=>x.id===a.id))manifest.assets.push(record);}const manifestText=fs.readFileSync(safe(this.root,'authoring/worlds/library/manifest.json'),'utf8');writes.push({file:'authoring/worlds/library/manifest.json',bytes:Buffer.from(JSONDoc.patch(manifestText,JSON.parse(manifestText.replace(/^\uFEFF/,'')),manifest))});
 if(isMap&&map.legacy){const file='assets/KinghtFallIconMap/'+map.legacy.prefab+'.prefab',original=L.read(this.root,file);writes.push({file,bytes:bytes(P.replaceEnvironment(this.root,original,map,baked))});}
 const configs={};for(const v of ['A','B','D']){const file=L.configFile(v),text=fs.readFileSync(safe(this.root,file),'utf8');configs[v]={file,text,before:JSON.parse(text.replace(/^\uFEFF/,''))};configs[v].after=clone(configs[v].before);}
 for(const stageId of affected){const stage=stagePlans[stageId],stageFile='authoring/worlds/stages/'+stageId+'.json';if(!stage){const parts=stageId.split('-'),cfg=configs[parts[0]],legacy=cfg.after.LevelCfg.find(s=>s.Level===Number(parts[1]));if(legacy){legacy.EnvironmentMapId=map.id;legacy.EnvironmentBiome=map.biome;}continue;}const cfg=configs[stage.variant],at=cfg.after.LevelCfg.findIndex(s=>s.Level===stage.level);if(at<0)throw Error('Stage was removed');if(!isMap&&L.hash(JSON.stringify(cfg.before.LevelCfg[at]))!==stage.sourceRevision)throw Error('Stage changed on disk. Refresh before saving.');const sources=stage.templates;const file='assets/KinghtFallIconMap/Generated/Stages/'+stage.id+'.prefab',runtime=clone(isMap?cfg.before.LevelCfg[at]:stage.config);if(map.id.startsWith('map-'))runtime.Map='Generated/Maps/'+map.id+'/thumbnail';Object.assign(runtime,P.unlocks(stage),{EnvironmentMapId:map.id,EnvironmentBiome:map.biome,StageLayoutId:stage.id,prefab:'Generated/Stages/'+stage.id});cfg.after.LevelCfg[at]=runtime;stage.config=runtime;stage.sourceRevision=L.hash(JSON.stringify(runtime));writes.push({file,bytes:bytes(P.compact(P.compose(this.root,map,stage,baked,sources)))},{file:stageFile,bytes:bytes(stage)});const metaFile=file+'.meta';capture(metaFile);if(!fs.existsSync(safe(this.root,metaFile)))writes.push({file:metaFile,bytes:bytes({ver:'1.2.9',uuid:B.uuid('stage:'+stage.id),importer:'prefab',optimizationPolicy:'AUTO',asyncLoadAssets:false,readonly:false,subMetas:{}})});}
 for(const v of Object.keys(configs)){const c=configs[v];if(!equal(c.before,c.after))writes.push({file:c.file,bytes:Buffer.from(JSONDoc.patch(c.text,c.before,c.after))});}
 // Sources observed before asynchronous baking must still match, including new files.
 const currentTree=tree(path.join(this.root,'assets/KinghtFallIconMap/Generated'));if(!equal(currentTree,generated))throw Error('Generated assets changed during baking. Draft retained; retry after reviewing the change.');const unique=new Map();for(const w of writes.slice())if(w.file.startsWith('assets/KinghtFallIconMap/Generated/')){let folder=path.posix.dirname(w.file);while(folder.startsWith('assets/KinghtFallIconMap/Generated')){const metaFile=folder+'.meta';if(!fs.existsSync(safe(this.root,metaFile)))writes.push({file:metaFile,bytes:bytes({ver:'1.1.3',uuid:B.uuid('folder:'+folder),importer:'folder',isBundle:false,bundleName:'',priority:1,compressionType:{},optimizeHotUpdate:{},inlineSpriteFrames:{},isRemoteBundle:{},subMetas:{}})});folder=path.posix.dirname(folder);}}writes.forEach(w=>unique.set(w.file,w));for(const w of unique.values()){if(!Object.prototype.hasOwnProperty.call(originals,w.file))originals[w.file]=null;}
 const result=this.commit(Array.from(unique.values()),originals),reloaded=new Set([doc.key]);for(const key of Object.keys(this.docs)){const d=this.docs[key];if(d===doc||d===mapDoc||isMap&&key.startsWith('stage:')&&affected.includes(key.slice(6))){if(key.startsWith('stage:')){reloaded.add(key);if(fs.existsSync(safe(this.root,d.file)))d.data=L.read(this.root,d.file);else if(isMap){const current=L.read(this.root,L.configFile(d.data.variant)).LevelCfg.find(s=>s.Level===d.data.level);d.data.config=clone(current);d.data.sourceRevision=L.hash(JSON.stringify(current));for(const b of d.data.buildings.concat(d.data.specials))b.template.revision=fingerprint(safe(this.root,'assets/KinghtFallIconMap/'+b.template.prefab+'.prefab'));}}d.original=clone(d.data);d.revision=fingerprint(safe(this.root,d.file));}}for(const d of Object.values(this.docs))if(equal(d.data,d.original))for(const file of Object.keys(d.dependencies||{}))d.dependencies[file]=fingerprint(safe(this.root,file));this.sources={};this.undo=this.undo.filter(c=>!reloaded.has(c.key));this.redo=this.redo.filter(c=>!reloaded.has(c.key));this.version++;this.indexData=null;this.palette=null;this.persist();return Object.assign(this.snapshot(doc.key),{busy:false,result:Object.assign(result,{affected})});
 }finally{this.busy=false;}}
 commit(writes,originals){for(const file of Object.keys(originals))if(fingerprint(safe(this.root,file))!==originals[file])throw Error('Concurrent change in '+file+'. Draft retained.');const changed=writes.filter(w=>fingerprint(safe(this.root,w.file))!==L.hash(w.bytes));if(!changed.length)return {saved:false,files:[]};const dir=path.join(this.artifacts,'saves',new Date().toISOString().replace(/[:.]/g,'-')+'-'+id('save'));fs.mkdirSync(dir,{recursive:true});const journal={status:'prepared',files:[]};for(const w of changed){const target=safe(this.root,w.file),before=fs.existsSync(target)?fs.readFileSync(target):null,backup=path.join(dir,w.file);if(before){fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,before);}journal.files.push({file:w.file,before:before?L.hash(before):null,after:L.hash(w.bytes),created:!before});}const journalFile=path.join(dir,'journal.json');atomicWrite(journalFile,bytes(journal));const applied=[];try{for(const w of changed){const target=safe(this.root,w.file);if(fingerprint(target)!==originals[w.file])throw Error('Concurrent change in '+w.file);fs.mkdirSync(path.dirname(target),{recursive:true});const temp=target+'.hkd-save-'+process.pid;try{fs.writeFileSync(temp,w.bytes);fs.renameSync(temp,target);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}applied.push(w);}journal.status='committed';atomicWrite(journalFile,bytes(journal));return {saved:true,files:changed.map(w=>w.file),backup:dir};}catch(error){for(const w of applied.reverse()){const target=safe(this.root,w.file);if(fingerprint(target)!==L.hash(w.bytes)){journal.status='recovery-required';continue;}const backup=path.join(dir,w.file);if(fs.existsSync(backup))atomicWrite(target,fs.readFileSync(backup));else fs.unlinkSync(target);}if(journal.status!=='recovery-required')journal.status='rolled-back';atomicWrite(journalFile,bytes(journal));throw Error(error.message+' Backup journal: '+journalFile);}}
}
module.exports={Service,safe,tree,fingerprint};
