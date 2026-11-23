'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),url=require('url');
const M=require('../worlds/model'),L=require('../worlds/legacy'),Maps=require('../lib/map-assets'),{Service,fingerprint}=require('../worlds/service'),temporary=require('./owned-temp');
const root=path.resolve(__dirname,'../../..'),clone=M.clone;
const {renderTitles}=require('./stage-title-runtime-fixture');
function assertRuntimeTitles(level,catalog){
 const before=JSON.stringify(level);
 for(const code of ['en','zh']){const expected=require('../lib/schema').resolve(level.Name,catalog,code);assert.deepEqual(renderTitles(level,catalog,code),{lobby:expected,loading:expected,game:expected},'all three screens display the saved stage name in '+code);}
 assert.equal(JSON.stringify(level),before,'displaying a title leaves gameplay settings untouched');
}
let fixtureFiles,fixtureImages;
function fixture(){
 const directory=temporary('hkd-stage-title-project-'),artifacts=temporary('hkd-stage-title-artifacts-');
 if(!fixtureFiles){
  const files=new Set(['assets/resources/localization/catalog.json','authoring/worlds/library/manifest.json']);
  for(const id of Maps.IDS)files.add('assets/KinghtFallIconMap/'+id+'.prefab');
  for(const variant of ['A']){files.add(L.configFile(variant));for(const row of L.read(root,L.configFile(variant)).LevelCfg){files.add('assets/KinghtFallIconMap/'+row.prefab+'.prefab');if(row.StageThumbnail)files.add(require('../worlds/stage-thumbnails').filename(row.StageThumbnail));const layout='authoring/worlds/stages/'+variant+'-'+row.Level+'.json';if(fs.existsSync(path.join(root,layout))){files.add(layout);const map='authoring/worlds/maps/'+L.read(root,layout).mapId+'.json';if(fs.existsSync(path.join(root,map)))files.add(map);}}}
  fixtureFiles=Array.from(files).flatMap(file=>fs.existsSync(path.join(root,file+'.meta'))?[file,file+'.meta']:[file]);
  fixtureImages=Array.from(new Set(Object.values(L.index(root).images).map(image=>url.fileURLToPath(image.url))));
 }
 for(const file of fixtureFiles){const target=path.join(directory,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
 fs.mkdirSync(path.join(directory,'assets/_script'),{recursive:true});for(const name of fs.readdirSync(path.join(root,'assets/_script')).filter(name=>name.endsWith('.meta')))fs.copyFileSync(path.join(root,'assets/_script',name),path.join(directory,'assets/_script',name));
 for(const source of fixtureImages){const target=path.join(directory,path.relative(root,source));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source+'.meta',target+'.meta');fs.writeFileSync(target,Buffer.alloc(0));}
 const render=async({map})=>{const assets={};for(const layer of map.layers)for(const object of layer.objects)if(!object.legacy)assets[require('../worlds/paint').assetKey(object)]={frames:[]};return {files:[],ground:[],assets};};
 return {directory,artifacts,render,service:new Service(directory,{artifacts,render})};
}

test('stage title drafts update catalog labels and survive history, explicit Save, reopen and no-op Save',async()=>{
 const f=fixture(),s=f.service,key='stage:A-1',configFile=L.configFile('A'),initial=s.snapshot(key),before=L.read(f.directory,configFile),localization=path.join(f.directory,'assets/resources/localization/catalog.json'),localizationHash=fingerprint(localization),configHash=fingerprint(path.join(f.directory,configFile)),oldName=initial.value.config.Name,oldDisplay=require('../lib/schema').resolve(oldName,L.read(f.directory,'assets/resources/localization/catalog.json'),'en'),otherConfigHashes=['B','D'].map(variant=>[L.configFile(variant),fingerprint(path.join(f.directory,L.configFile(variant)))]);
 assert.equal(initial.dirty,false);assert.equal(oldName,before.LevelCfg[0].Name);assert.equal(initial.stageName,oldDisplay);
 assertRuntimeTitles(before.LevelCfg[0],L.read(f.directory,'assets/resources/localization/catalog.json'));
 const untouched=await s.save({key,version:s.version});assert.equal(untouched.result.saved,false);assert.deepEqual(untouched.result.files,[]);assert.equal(fingerprint(path.join(f.directory,configFile)),configHash);
 const next=clone(initial.value);next.config.Name='1. Lantern Crossing';const changed=s.change({key,version:s.version,value:next});
 assert.equal(changed.value.id,initial.value.id);assert.equal(changed.value.level,1);assert.equal(changed.value.config.Level,1);assert.equal(changed.stageName,'1. Lantern Crossing');assert.equal(changed.value.name,initial.value.name,'generic authored-layout label is separate from the runtime title');
 assert.equal(s.stageCatalog().find(row=>row.id==='A-1').name,'1. Lantern Crossing');assert.equal(s.catalog().stages.find(row=>row.id==='A-1').name,'1. Lantern Crossing');
 assert.equal(fingerprint(path.join(f.directory,configFile)),configHash,'draft title edit does not save gameplay data');assert.equal(fingerprint(localization),localizationHash);
 assertRuntimeTitles(L.read(f.directory,configFile).LevelCfg[0],L.read(f.directory,'assets/resources/localization/catalog.json'));
 s.history({key,version:s.version},false);assert.equal(s.snapshot(key).value.config.Name,oldName);assert.equal(s.snapshot(key).stageName,oldDisplay);assert.equal(s.stageCatalog().find(row=>row.id==='A-1').name,oldName);
 s.history({key,version:s.version},true);assert.equal(s.stageCatalog().find(row=>row.id==='A-1').name,'1. Lantern Crossing');
 const saved=await s.save({key,version:s.version});assert.equal(saved.result.saved,true);
 const after=L.read(f.directory,configFile),level=after.LevelCfg.find(row=>row.Level===1);assert.equal(level.Name,'1. Lantern Crossing');assert.equal(level.Level,1);assert.deepEqual(after.LevelCfg.slice(1),before.LevelCfg.slice(1));
 assertRuntimeTitles(level,L.read(f.directory,'assets/resources/localization/catalog.json'));
 for(const key of Object.keys(before).filter(key=>key!=='LevelCfg'))assert.deepEqual(after[key],before[key]);assert.equal(fingerprint(localization),localizationHash);for(const [file,hash]of otherConfigHashes)assert.equal(fingerprint(path.join(f.directory,file)),hash);
 for(const key of Object.keys(before.LevelCfg[0]).filter(key=>!['Name','prefab','EnvironmentMapId','EnvironmentBiome','StageLayoutId','Map'].includes(key)))assert.deepEqual(level[key],before.LevelCfg[0][key]);
 const fresh=new Service(f.directory,{artifacts:f.artifacts,render:f.render}),reopened=fresh.snapshot(key);assert.equal(reopened.value.config.Name,'1. Lantern Crossing');assert.equal(reopened.stageName,'1. Lantern Crossing');assert.equal(reopened.dirty,false);assert.equal(fresh.catalog().stages.find(row=>row.id==='A-1').name,'1. Lantern Crossing');
 assertRuntimeTitles(reopened.value.config,L.read(f.directory,'assets/resources/localization/catalog.json'));
 const hashes=Object.fromEntries(saved.result.files.map(file=>[file,fingerprint(path.join(f.directory,file))]));const noop=await fresh.save({key,version:fresh.version});assert.equal(noop.result.saved,false);assert.deepEqual(noop.result.files,[]);for(const [file,hash]of Object.entries(hashes))assert.equal(fingerprint(path.join(f.directory,file)),hash);
});

test('stage title editing cannot change the stage number, configuration or canonical identifier',()=>{
 const f=fixture(),s=f.service,key='stage:A-1',opened=s.snapshot(key),before=clone(opened.value),version=s.version,configHash=fingerprint(path.join(f.directory,L.configFile('A')));
 for(const mutate of [value=>value.id='A-2',value=>value.variant='B',value=>value.level=2,value=>value.config.Level=2]){const value=clone(before);value.config.Name='1. New title';mutate(value);assert.throws(()=>s.change({key,version:s.version,value}),/Identifiers cannot be changed/);assert.equal(s.version,version);assert.deepEqual(s.snapshot(key).value,before);}
 assert.equal(fingerprint(path.join(f.directory,L.configFile('A'))),configHash);assert.equal(fs.existsSync(s.recovery),false);
});
