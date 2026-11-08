'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {Service,fingerprint}=require('../worlds/service'),M=require('../worlds/model'),L=require('../worlds/legacy'),Maps=require('../lib/map-assets'),temporary=require('./owned-temp');
const clone=M.clone;

function stagedImageFixture(){
 const f=fixture(),s=f.service,key='map:map-test',snap=s.snapshot(key),upload=path.join(f.artifacts,'source.png'),original=Buffer.from('verified imported artwork');
 fs.writeFileSync(upload,original);const asset=s.importImage({version:s.version,file:upload,width:16,height:16}).asset;return Object.assign(f,{key,snap,upload,original,asset});
}
function changeUploadAfterRead(upload,changed){
 const read=fs.readFileSync;let mutated=false;
 fs.readFileSync=function(file){const content=read.apply(this,arguments);if(String(file)===upload&&!mutated){mutated=true;fs.writeFileSync(upload,changed);}return content;};
 return ()=>{fs.readFileSync=read;assert(mutated,'the source changed immediately after its verified read');};
}
test('world persistence: map import copies exactly the source buffer whose manifest hash was verified',async()=>{
 const f=stagedImageFixture(),s=f.service,baker=require('../worlds/baker'),bake=baker.bake,value=M.placeGroundImage(f.snap.value,'roads',f.asset,{x:0,y:0}).map;
 s.change({key:f.key,version:s.version,value});const restore=changeUploadAfterRead(f.upload,Buffer.from('new external artwork'));
 try{baker.bake=async()=>({writes:[],ground:[],assets:{}});await s.save({key:f.key,version:s.version});}finally{baker.bake=bake;restore();}
 const file=path.join(f.root,f.asset.file),manifest=L.read(f.root,'authoring/worlds/library/manifest.json').assets.find(a=>a.id===f.asset.id);assert(fs.readFileSync(file).equals(f.original));assert.equal(L.hash(fs.readFileSync(file)),manifest.sha256);assert.notEqual(L.hash(fs.readFileSync(f.upload)),manifest.sha256);
});
test('world persistence: group-library import also copies its single verified source buffer',async()=>{
 const f=stagedImageFixture(),s=f.service,placed=M.place(f.snap.value,'grass-detail',f.asset,{x:0,y:0},1,1,0);s.change({key:f.key,version:s.version,value:placed.map});s.libraryAction({key:f.key,version:s.version,action:'capture',ids:[placed.object.id],name:'Imported group'});
 const restore=changeUploadAfterRead(f.upload,Buffer.from('new external group artwork'));try{await s.saveLibrary({key:f.key,version:s.version});}finally{restore();}
 const file=path.join(f.root,f.asset.file),manifest=L.read(f.root,'authoring/worlds/library/manifest.json').assets.find(a=>a.id===f.asset.id);assert(fs.readFileSync(file).equals(f.original));assert.equal(L.hash(fs.readFileSync(file)),manifest.sha256);assert.notEqual(L.hash(fs.readFileSync(f.upload)),manifest.sha256);
});


function resizeMap(s,width,height){const key='map:map-test',value=clone(s.snapshot(key).value);value.size={width,height};value.playable={width,height};return s.change({key,version:s.version,value});}
test('world persistence: map shrink rejects any enabled saved stage placement outside its new bounds before baking',async()=>{
 for(const type of ['hero','building','special','spawn']){
  const f=fixture(),s=f.service,linked=linkedStage(f,true),stage=linked.stage;
  if(type==='hero')stage.hero={x:700,y:0};
  if(type==='building'){stage.buildings[0].enabled=true;stage.buildings[0].x=700;}
  if(type==='special')stage.specials=[{id:'offer-1',kind:0,name:'Offer',enabled:true,x:700,y:0,scale:1,angle:0,template:clone(stage.buildings[0].template)}];
  if(type==='spawn')stage.spawns=[{id:1,name:'Spawn',enabled:true,x:700,y:0}];
  f.write('authoring/worlds/stages/A-1.json',stage);const before=fingerprint(path.join(f.root,'authoring/worlds/maps/map-test.json'));let renders=0;
  s.options.render=async()=>{renders++;return {files:[],ground:[],assets:{}};};resizeMap(s,800,1200);
  await assert.rejects(s.save({key:'map:map-test',version:s.version}),/Stage A-1 has enabled placements outside the resized map/);assert.equal(renders,0,type);assert.equal(fingerprint(path.join(f.root,'authoring/worlds/maps/map-test.json')),before);assert(s.snapshot('map:map-test').dirty);assert(!s.docs['stage:A-1'],'validation must not open stage drafts');
 }
});
test('world persistence: a valid map shrink ignores disabled placements and unrelated preexisting stage issues',async()=>{
 const f=fixture(),s=f.service,linked=linkedStage(f,true),stage=linked.stage;stage.hero={x:300,y:500};stage.buildings[0].x=900;stage.spawns=[{id:3,name:'Disabled spawn',enabled:false,x:900,y:0}];stage.graphs=[{id:'preexisting-empty-graph',entry:'missing',nodes:[],edges:[],spawnIds:[]}];
 f.write('authoring/worlds/stages/A-1.json',stage);resizeMap(s,800,1200);const result=await s.save({key:'map:map-test',version:s.version});
 assert(result.result.saved);assert.deepEqual(L.read(f.root,'authoring/worlds/stages/A-1.json').graphs,stage.graphs);assert.equal(L.read(f.root,'authoring/worlds/maps/map-test.json').size.width,800);
});
test('world persistence: ordinary map artwork edits do not impose new bounds validation on legacy stage content',async()=>{
 const f=fixture(),s=f.service,linked=linkedStage(f,true);linked.stage.hero={x:5000,y:0};f.write('authoring/worlds/stages/A-1.json',linked.stage);
 let renders=0;s.options.render=async()=>{renders++;return {files:[],ground:[],assets:{}};};rename(s,'map:map-test','Artwork rename');const result=await s.save({key:'map:map-test',version:s.version});
 assert(result.result.saved);assert.equal(renders,1);assert.equal(L.read(f.root,'authoring/worlds/stages/A-1.json').hero.x,5000);
});
test('world persistence: map shrink checks an untouched legacy stage without creating authoring stage drafts',async()=>{
 const f=fixture(),s=f.service,P=require('../worlds/prefab'),source=P.skeleton('Legacy source',M.createMap('source','Source','forest')),info=Maps.model(source);P.append(source,'ndStar',info.roots.ndPath,700,0);
 f.write('assets/KinghtFallIconMap/Map01.prefab',source);f.write('assets/_script/KinghtFallCommerce.js.meta',{uuid:'22222222-2222-4222-a222-222222222222'});f.write(L.configFile('A'),{LevelCfg:[{Level:1,prefab:'Map01',EnvironmentMapId:'map-test',WaveCfg:[]}],SoldierCfg:{},ParameterCfg:{}});
 let renders=0;s.options.render=async()=>{renders++;return {files:[],ground:[],assets:{}};};resizeMap(s,800,1200);
 await assert.rejects(s.save({key:'map:map-test',version:s.version}),/Stage A-1 has enabled placements outside the resized map/);assert.equal(renders,0);assert(!s.docs['stage:A-1']);assert(!fs.existsSync(path.join(f.root,'authoring/worlds/stages/A-1.json')));
});
test('world persistence: a new service and explicit world refresh invalidate pulled script UUID metadata',()=>{
 const f=fixture(),file='assets/_script/AuthoredStagePaths.js.meta',uuids=['11111111-1111-4111-a111-111111111111','22222222-2222-4222-a222-222222222222','33333333-3333-4333-a333-333333333333'];
 f.write(file,{uuid:uuids[0]});assert.equal(L.script(f.root,'AuthoredStagePaths'),L.compress(uuids[0]));f.write(file,{uuid:uuids[1]});const fresh=new Service(f.root,{artifacts:temporary('hkd-world-persistence-script-')});assert.equal(L.script(f.root,'AuthoredStagePaths'),L.compress(uuids[1]));
 f.write(file,{uuid:uuids[2]});fresh.refresh({key:'map:map-test',version:fresh.version});assert.equal(L.script(f.root,'AuthoredStagePaths'),L.compress(uuids[2]));
});


function timedSaveFixture(){
 const f=validationFixture(),P=require('../worlds/prefab'),source=P.skeleton('Portable main hall source',M.createMap('source','Source','forest'));
 f.write('assets/_script/AuthoredStagePaths.js.meta',{uuid:'11111111-1111-4111-a111-111111111111'});
 f.write('assets/KinghtFallIconMap/Map01.prefab',source);
 const cfg=L.read(f.root,L.configFile('A'));
 cfg.SoldierCfg={90001:{Name:'Unit',prefab:'Unit',AttackType:1,Health:100,AttackInterval:1,AttackDamage:1,AttackRange:1,SearchRange:1,Speed:1,DeathAni:1,Data:[]}};
 cfg.LevelCfg[0].WaveCfg=[{Wave:1,id:1,HealthCoefficient:1,AttackCoefficient:1,StartSliver:0,CommerceSliver:0,SpawnTimeline:[{spawnId:1,unitId:90001,count:1,startSeconds:0,intervalSeconds:0}],WaveReward:[]}];
 const stage=clone(f.stage);stage.config=clone(cfg.LevelCfg[0]);stage.buildings[0].template={prefab:'Map01',node:1,roots:[1],revision:fingerprint(path.join(f.root,'assets/KinghtFallIconMap/Map01.prefab'))};stage.templates={Map01:source};
 stage.spawns=[{id:1,name:'Spawn 1',x:0,y:200,enabled:true}];stage.graphs=[{id:'route',entry:'start',spawnIds:[1],nodes:[{id:'start',x:0,y:200},{id:'goal',x:0,y:0,goal:true}],edges:[{id:'edge',from:'start',to:'goal',weight:1}],requiresAnyBuilding:[]}];
 f.write(L.configFile('A'),cfg);f.write('authoring/worlds/stages/A-1.json',stage);
 // Reload the index after creating the authored stage and shared roster.
 f.service.indexData=null;f.service.snapshot('stage:A-1');
 return Object.assign(f,{stage});
}
function moveHero(s){const key='stage:A-1',value=clone(s.snapshot(key).value);value.hero.x+=15;return s.change({key,version:s.version,value});}
test('world persistence: stage save validates the current shared roster after another tool removes a timed unit',async()=>{
 const f=timedSaveFixture(),s=f.service,key='stage:A-1',stageFile=path.join(f.root,'authoring/worlds/stages/A-1.json'),before=fingerprint(stageFile);
 assert(s.index().documents.A.SoldierCfg[90001]);moveHero(s);const config=L.read(f.root,L.configFile('A'));delete config.SoldierCfg[90001];const configFile=f.write(L.configFile('A'),config),external=fingerprint(configFile);
 let renders=0;s.options.render=async()=>{renders++;return {files:[],ground:[],assets:{}};};
 await assert.rejects(s.save({key,version:s.version}),/Choose a spawnable unit/);assert.equal(renders,0);assert.equal(fingerprint(stageFile),before);assert.equal(fingerprint(configFile),external);assert(s.snapshot(key).dirty);
});
test('world persistence: fresh shared validation permits and preserves unrelated current config edits',async()=>{
 const f=timedSaveFixture(),s=f.service,key='stage:A-1';moveHero(s);
 const config=L.read(f.root,L.configFile('A'));config.LevelCfg[1].InGameCoefficient=7;config.LevelCfg[1].FutureUnrelated={keep:['new',17]};config.SoldierCfg[90001].Health=123;f.write(L.configFile('A'),config);
 const result=await s.save({key,version:s.version}),saved=L.read(f.root,L.configFile('A'));
 assert(result.result.saved);assert.deepEqual(saved.LevelCfg[1],config.LevelCfg[1]);assert.deepEqual(saved.SoldierCfg,config.SoldierCfg);assert.deepEqual(saved.FutureTable,config.FutureTable);assert.equal(s.snapshot(key).value.hero.x,15);assert(!s.snapshot(key).dirty);
});
test('world persistence: a localization dependency changed during stage baking rejects all project writes',async()=>{
 const f=timedSaveFixture(),s=f.service,key='stage:A-1',stageFile=path.join(f.root,'authoring/worlds/stages/A-1.json'),before=fingerprint(stageFile),cfgBefore=fingerprint(path.join(f.root,L.configFile('A')));
 moveHero(s);s.options.render=async()=>{const catalog=clone(f.catalog);delete catalog.entries['stage.title'];f.write('assets/resources/localization/catalog.json',catalog);return {files:[],ground:[],assets:{}};};
 await assert.rejects(s.save({key,version:s.version}),/Concurrent change in assets\/resources\/localization\/catalog.json/);
 assert.equal(fingerprint(stageFile),before);assert.equal(fingerprint(path.join(f.root,L.configFile('A'))),cfgBefore);assert(!L.read(f.root,'assets/resources/localization/catalog.json').entries['stage.title']);assert(s.snapshot(key).dirty);
});


function validationFixture(){
 const f=fixture(),config={Level:1,prefab:'Map01',EnvironmentMapId:'map-test',Name:'[[loc:stage.title]]',InGameCoefficient:1,GoldSupplyCoefficient:1,ConversionCoefficient:1,EquipLevelCap:1,WaveCfg:[],HomeLevel1Unlock:[],HomeLevel2Unlock:[],HomeLevel3Unlock:[],FutureStage:{values:[1,{keep:true}]}},
  catalog={version:1,languages:[{code:'en',nameKey:'language.en'}],defaultLanguage:'en',entries:{'language.en':{en:'English'},'stage.title':{en:'Stage'}}};
 for(const v of ['A','B','D']){const second=clone(config);second.Level=2;f.write(L.configFile(v),{LevelCfg:[config,second],SoldierCfg:{},ParameterCfg:{},FutureTable:{nested:{keep:v}}});}
 f.write('assets/resources/localization/catalog.json',catalog);
 const stage={version:1,id:'A-1',variant:'A',level:1,mapId:'map-test',config:clone(config),hero:{x:0,y:0},buildings:[{id:1,kind:1,name:'Main hall',x:0,y:0,enabled:true,unlock:1}],specials:[],spawns:[],graphs:[],FutureAuthoring:{keep:true}};
 return Object.assign(f,{stage,catalog,map:f.service.snapshot('map:map-test').value});
}
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const key of Object.keys(value))freeze(value[key]);Object.freeze(value);}return value;}
test('world persistence: stage validation caches only its baseline and shares immutable untouched tables',()=>{
 const f=validationFixture(),s=f.service,schema=require('../lib/schema'),validate=schema.validate,index=s.index(),before=JSON.stringify(index.documents),stage=freeze(f.stage),calls=[];
 freeze(index.documents);
 try{
  schema.validate=function(documents,changes){calls.push({documents,changes});return validate(documents,changes);};
  const first=s.stageIssues(stage,f.map);assert.equal(calls.length,2);const cache=s.stageValidation;freeze(cache.documents);
  const draft=clone(stage);draft.config.InGameCoefficient=-1;const issues=s.stageIssues(freeze(draft),f.map);
  assert.equal(calls.length,3,'each warm draft still receives one complete actual validation');assert(issues.includes('Number must be zero or greater.'));
  const actual=calls[2].documents;assert.equal(actual.B.data,index.documents.B);assert.equal(actual.D.data,index.documents.D);assert.equal(actual.A.data.SoldierCfg,index.documents.A.SoldierCfg);assert.equal(actual.A.data.FutureTable,index.documents.A.FutureTable);
  assert.notEqual(actual.A.data,index.documents.A);assert.notEqual(actual.A.data.LevelCfg,index.documents.A.LevelCfg);assert.equal(actual.A.data.LevelCfg[1],index.documents.A.LevelCfg[1]);
  assert.equal(s.stageValidation,cache);assert.equal(JSON.stringify(index.documents),before);assert.deepEqual(stage.config.FutureStage,{values:[1,{keep:true}]});
  const other=clone(stage);other.id='B-1';other.variant='B';const warm=s.stageIssues(other,f.map);assert.equal(calls.length,4);assert.equal(s.stageValidation,cache,'one baseline is reused across stage variants');
  const fresh=new Service(f.root,{artifacts:temporary('hkd-world-persistence-validation-')});assert.deepEqual(fresh.stageIssues(other,f.map),warm);assert.equal(calls.length,6);assert.deepEqual(first,warm);
 }finally{schema.validate=validate;}
});
test('world persistence: stage validation invalidates its single cache on catalog bytes and index refresh',()=>{
 const f=validationFixture(),s=f.service,schema=require('../lib/schema'),validate=schema.validate;let count=0;
 try{
  schema.validate=function(documents,changes){count++;return validate(documents,changes);};
  const draft=clone(f.stage);draft.config.Name='[[loc:added.title]]';assert(s.stageIssues(draft,f.map).includes('Missing translation: added.title'));assert.equal(count,2);const initial=s.stageValidation;
  s.stageIssues(draft,f.map);assert.equal(count,3);assert.equal(s.stageValidation,initial);
  const catalog=clone(f.catalog);catalog.entries['added.title']={en:'Added'};delete catalog.entries['stage.title'];f.write('assets/resources/localization/catalog.json',catalog);
  assert(!s.stageIssues(draft,f.map).some(i=>i.includes('Missing translation: added.title')));assert.equal(count,5);assert.notEqual(s.stageValidation,initial);const current=s.stageValidation;
  f.write('assets/resources/localization/catalog.json',catalog);s.stageIssues(draft,f.map);assert.equal(count,6);assert.equal(s.stageValidation,current,'unchanged bytes do not rebuild baseline');
  const negative=clone(f.stage);negative.config.InGameCoefficient=-1;assert(s.stageIssues(negative,f.map).includes('Number must be zero or greater.'));assert.equal(count,7);
  const cfg=L.read(f.root,L.configFile('A'));cfg.LevelCfg[0].InGameCoefficient=-1;f.write(L.configFile('A'),cfg);s.refresh({key:'map:map-test',version:s.version});assert.equal(s.stageValidation,null);
  assert(!s.stageIssues(negative,f.map).includes('Number must be zero or greater.'),'an unchanged baseline issue remains advisory after refresh');assert.equal(count,9);assert.notEqual(s.stageValidation,current);
 }finally{schema.validate=validate;}
});
test('world persistence: cached stage validation never hides an unknown newly authored field error',()=>{
 const f=validationFixture(),s=f.service;s.stageIssues(f.stage,f.map);const draft=clone(f.stage);draft.config.FutureStage.values.push('[[loc:missing.future.token]]');
 const warm=s.stageIssues(draft,f.map),fresh=new Service(f.root,{artifacts:temporary('hkd-world-persistence-validation-')});
 assert(warm.includes('Missing translation: missing.future.token'));assert.deepEqual(warm,fresh.stageIssues(draft,f.map));assert.deepEqual(f.stage.config.FutureStage,{values:[1,{keep:true}]});assert(!fs.existsSync(s.recovery));
});


test('world persistence: every building sharing an unembedded prefab must agree with its source revision',async()=>{
 const f=fixture(),s=f.service,linked=linkedStage(f),other=clone(linked.stage.buildings[0]);other.id=3;other.template.revision='0'.repeat(64);linked.stage.buildings.push(other);f.write('authoring/worlds/stages/A-1.json',linked.stage);
 let renders=0;s.options.render=async()=>{renders++;return {files:[],ground:[],assets:{}};};rename(s,'map:map-test','Retained draft');
 await assert.rejects(s.save({key:'map:map-test',version:s.version}),/Building source changed since this layout was opened/);assert.equal(renders,0);assert(s.snapshot('map:map-test').dirty);
});


test('world persistence: malformed staged recovery assets cannot leave partially restored map entries',()=>{
 const f=fixture(),s=f.service,value=M.createMap('map-recovered','Recovered','forest'),recovery={version:1,project:f.root,docs:[{key:'map:map-recovered',file:'authoring/worlds/maps/map-recovered.json',original:null,revision:null,data:value}],stagedAssets:[null]};
 fs.writeFileSync(s.recovery,JSON.stringify(recovery));assert.throws(()=>s.recover({key:'map:map-test',version:s.version}),/Invalid draft recovery/);assert(!s.index().maps.some(m=>m.id===value.id));assert(!s.docs['map:map-recovered']);
});
test('world persistence: recovery documents cannot change their authoring target paths',()=>{
 const f=fixture(),s=f.service,value=M.createMap('map-recovered','Recovered','forest'),recovery={version:1,project:f.root,docs:[{key:'map:map-recovered',file:'authoring/worlds/maps/unrelated.json',original:null,revision:null,data:value}]};
 fs.writeFileSync(s.recovery,JSON.stringify(recovery));assert.throws(()=>s.recover({key:'map:map-test',version:s.version}),/Invalid document identifier/);assert(!s.index().maps.some(m=>m.id===value.id));assert(!s.docs['map:map-recovered']);
});
test('world persistence: corrupt transaction journals remain visible and prevent writes without crashing inspection',async()=>{
 for(const content of ['{}','{"status":"prepared",','{"status":"prepared","files":[null]}']){
  const f=fixture(),s=f.service,key='map:map-test';rename(s,key,'Retained draft');const folder=path.join(f.artifacts,'saves','incomplete'),file=path.join(folder,'journal.json');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(file,content);
  const source=path.join(f.root,'authoring/worlds/maps/map-test.json'),before=fingerprint(source),rows=s.recoveries();assert.equal(rows.length,1);assert.equal(rows[0].status,'invalid');
  await assert.rejects(s.save({key,version:s.version}),/Recover the interrupted save/);assert.throws(()=>s.recover({key,version:s.version}),/Invalid recovery journal/);assert.equal(fingerprint(source),before);assert.equal(fs.readFileSync(file,'utf8'),content);assert(s.snapshot(key).dirty);
 }
});


function linkedStage(f,embedded){
 const P=require('../worlds/prefab'),source=P.skeleton('Original building source',M.createMap('source','Source','forest')),sourceFile=f.write('assets/KinghtFallIconMap/Map01.prefab',source);
 f.write('assets/_script/AuthoredStagePaths.js.meta',{uuid:'11111111-1111-4111-a111-111111111111'});
 const cfg={Level:1,prefab:'Generated/Stages/A-1',EnvironmentMapId:'map-test',WaveCfg:[],FutureConfig:{keep:1}},building={id:2,kind:2,name:'Disabled source reference',enabled:false,unlock:1,x:0,y:0,scale:1,angle:0,template:{prefab:'Map01',node:1,roots:[1],revision:fingerprint(sourceFile)}},stage={version:1,id:'A-1',variant:'A',level:1,mapId:'map-test',name:'Stage 1',config:cfg,hero:{x:0,y:0},buildings:[building],specials:[],spawns:[],graphs:[],FutureStage:{keep:2}};
 if(embedded)stage.templates={Map01:clone(source)};
 f.write(L.configFile('A'),{LevelCfg:[cfg],SoldierCfg:{},ParameterCfg:{}});const stageFile=f.write('authoring/worlds/stages/A-1.json',stage);return {source,sourceFile,stage,stageFile};
}
test('world persistence: map save rejects a linked legacy building source changed during asynchronous baking',async()=>{
 const f=fixture(),s=f.service,linked=linkedStage(f),key='map:map-test',mapFile=path.join(f.root,'authoring/worlds/maps/map-test.json'),before=fingerprint(mapFile),stageBefore=fingerprint(linked.stageFile);
 s.options.render=async()=>{const changed=clone(linked.source);changed[1]._name='External changed source';f.write('assets/KinghtFallIconMap/Map01.prefab',changed);return {files:[],ground:[],assets:{}};};
 rename(s,key,'Retained map draft');await assert.rejects(s.save({key,version:s.version}),/Concurrent change in assets\/KinghtFallIconMap\/Map01.prefab/);
 assert.equal(fingerprint(mapFile),before);assert.equal(fingerprint(linked.stageFile),stageBefore);assert.equal(L.read(f.root,'assets/KinghtFallIconMap/Map01.prefab')[1]._name,'External changed source');assert(s.snapshot(key).dirty);
});
test('world persistence: map save rejects a linked stage changed during asynchronous baking',async()=>{
 const f=fixture(),s=f.service,linked=linkedStage(f,true),key='map:map-test',before=fingerprint(path.join(f.root,'authoring/worlds/maps/map-test.json'));
 s.options.render=async()=>{const changed=clone(linked.stage);changed.FutureStage.keep=99;f.write('authoring/worlds/stages/A-1.json',changed);return {files:[],ground:[],assets:{}};};
 rename(s,key,'Retained map draft');await assert.rejects(s.save({key,version:s.version}),/Concurrent change in authoring\/worlds\/stages\/A-1.json/);
 assert.equal(fingerprint(path.join(f.root,'authoring/worlds/maps/map-test.json')),before);assert.equal(L.read(f.root,'authoring/worlds/stages/A-1.json').FutureStage.keep,99);assert(s.snapshot(key).dirty);
});
test('world persistence: optional-template layouts verify authored source revisions before baking',async()=>{
 const f=fixture(),s=f.service,linked=linkedStage(f),changed=clone(linked.source);changed[1]._name='Replaced source';f.write('assets/KinghtFallIconMap/Map01.prefab',changed);
 let renders=0;s.options.render=async()=>{renders++;return {files:[],ground:[],assets:{}};};rename(s,'map:map-test','Draft');
 await assert.rejects(s.save({key:'map:map-test',version:s.version}),/Building source changed since this layout was opened/);assert.equal(renders,0);assert(s.snapshot('map:map-test').dirty);
});
test('world persistence: save snapshots current source instead of reusing an older navigation cache',async()=>{
 const f=fixture(),s=f.service,linked=linkedStage(f);assert.equal(s.source('Map01')[1]._name,'Original building source');
 const changed=clone(linked.source);changed[1]._name='Current building source';f.write('assets/KinghtFallIconMap/Map01.prefab',changed);linked.stage.buildings[0].template.revision=fingerprint(linked.sourceFile);f.write('authoring/worlds/stages/A-1.json',linked.stage);
 rename(s,'map:map-test','Saved current source');await s.save({key:'map:map-test',version:s.version});
 const saved=L.read(f.root,'authoring/worlds/stages/A-1.json');assert.equal(saved.templates.Map01[1]._name,'Current building source');assert.deepEqual(saved.FutureStage,{keep:2});assert.deepEqual(saved.config.FutureConfig,{keep:1});
});
test('world persistence: embedded portable source snapshots stay independent of later source prefab changes',async()=>{
 const f=fixture(),s=f.service,linked=linkedStage(f,true),changed=clone(linked.source);changed[1]._name='Independent later source';f.write('assets/KinghtFallIconMap/Map01.prefab',changed);
 rename(s,'map:map-test','Preserved snapshot');await s.save({key:'map:map-test',version:s.version});const saved=L.read(f.root,'authoring/worlds/stages/A-1.json');
 assert.equal(saved.templates.Map01[1]._name,'Original building source');assert.equal(L.read(f.root,'assets/KinghtFallIconMap/Map01.prefab')[1]._name,'Independent later source');assert.deepEqual(saved.FutureStage,{keep:2});
});

function fixture(){
 const root=temporary('hkd-world-persistence-'),artifacts=temporary('hkd-world-persistence-artifacts-');
 function write(file,value){const full=path.join(root,file);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));return full;}
 for(const v of ['A','B','D'])write(L.configFile(v),{LevelCfg:[],SoldierCfg:{},ParameterCfg:{}});
 for(const id of Maps.IDS)write('assets/KinghtFallIconMap/'+id+'.prefab',[]);
 write('authoring/worlds/library/manifest.json',{version:1,assets:[]});
 for(const id of ['map-test','map-other'])write('authoring/worlds/maps/'+id+'.json',M.createMap(id,id,'forest'));
 const service=new Service(root,{artifacts,render:async()=>({files:[],ground:[],assets:{}})});
 return {root,artifacts,write,service};
}
function rename(s,key,name){const value=clone(s.snapshot(key).value);value.name=name;return s.change({key,version:s.version,value});}
test('world persistence: refresh invalidates reloaded history while retaining another dirty document history',()=>{
 const f=fixture(),s=f.service,key='map:map-test';rename(s,key,'Old edit');s.history({key,version:s.version},false);rename(s,'map:map-other','Independent draft');
 const external=M.createMap('map-test','External current','forest');f.write('authoring/worlds/maps/map-test.json',external);
 const snap=s.refresh({key,version:s.version});assert.equal(snap.value.name,'External current');assert(!snap.canUndo&&!snap.canRedo);assert(s.snapshot('map:map-other').canUndo);assert(s.snapshot('map:map-other').dirty);
 s.history({key,version:s.version},true);assert.equal(s.snapshot(key).value.name,'External current');
});
test('world persistence: new maps stay unique and discoverable through refresh and another map save',async()=>{
 const f=fixture(),s=f.service,created=s.create({version:s.version,name:'Unsaved'});
 assert.equal(s.index().maps.filter(m=>m.id===created.value.id).length,1);
 s.refresh({key:created.key,version:s.version});assert.equal(s.index().maps.filter(m=>m.id===created.value.id).length,1);assert(s.snapshot(created.key).dirty);
 rename(s,'map:map-test','Saved other');await s.save({key:'map:map-test',version:s.version});
 assert.equal(s.index().maps.filter(m=>m.id===created.value.id).length,1);assert(s.snapshot(created.key).dirty);assert(!fs.existsSync(path.join(f.root,'authoring/worlds/maps',created.value.id+'.json')));
});
test('world persistence: discarding a new map cannot orphan a stage draft',()=>{
 const f=fixture(),s=f.service,created=s.create({version:s.version,name:'Stage draft map'});
 s.docs['stage:A-1']={key:'stage:A-1',original:{mapId:'map-test'},data:{mapId:created.value.id}};
 const version=s.version;assert.throws(()=>s.discard({key:created.key,version}),/stage drafts A-1/);assert.equal(s.version,version);assert(s.docs[created.key]);assert(s.index().maps.some(m=>m.id===created.value.id));
});
test('world persistence: a conflicting recovery is validated before adding any recovered maps or assets',()=>{
 const f=fixture(),s=f.service,existing=s.loadMap('map-test'),bad=clone(existing.original);bad.name='Conflicting baseline';
 const value=M.createMap('map-recovered','Recovered','forest'),recovery={version:1,project:f.root,docs:[{key:'map:map-recovered',file:'authoring/worlds/maps/map-recovered.json',original:null,revision:null,data:value},{key:existing.key,file:existing.file,original:bad,revision:existing.revision,data:existing.data}],stagedAssets:[{id:'not-added',file:'authoring/worlds/library/images/not-added.png',stagedFile:path.join(f.artifacts,'not-added.png')}]};
 fs.writeFileSync(s.recovery,JSON.stringify(recovery));const version=s.version;
 assert.throws(()=>s.recover({key:existing.key,version}),/Source changed since recovery/);assert.equal(s.version,version);assert(!s.index().maps.some(m=>m.id===value.id));assert(!s.docs['map:map-recovered']);assert(!s.stagedAssets.has('not-added'));
 assert.throws(()=>s.recover({key:existing.key,version}),/Source changed since recovery/);
});
test('world persistence: recovery preserves a differing current draft and resets only recovered history',()=>{
 const f=fixture(),s=f.service,key='map:map-test';rename(s,key,'Crash draft');const old=fs.readFileSync(s.recovery);rename(s,key,'Current draft');fs.writeFileSync(s.recovery,old);
 const version=s.version;assert.throws(()=>s.recover({key,version}),/current draft differs/);assert.equal(s.snapshot(key).value.name,'Current draft');assert.equal(s.version,version);
});
test('world persistence: explicit crash recovery restores drafts without saving project files',()=>{
 const f=fixture(),s=f.service,key='map:map-test',source=path.join(f.root,'authoring/worlds/maps/map-test.json'),before=fingerprint(source);
 rename(s,key,'Recover me');const fresh=new Service(f.root,{artifacts:f.artifacts});assert(fresh.hadRecovery);assert(!fresh.snapshot(key).dirty);
 const snap=fresh.recover({key,version:fresh.version});assert.equal(snap.value.name,'Recover me');assert(snap.dirty);assert(!snap.canUndo&&!snap.canRedo);assert(!fresh.hadRecovery);assert.equal(fingerprint(source),before);
});
test('world persistence: fresh editing archives unresolved crash bytes before replacing the active recovery',()=>{
 const f=fixture(),s=f.service,key='map:map-test';rename(s,key,'Unrestored old draft');const old=fs.readFileSync(s.recovery),fresh=new Service(f.root,{artifacts:f.artifacts});
 const snap=rename(fresh,key,'New session edit'),backup=snap.recoveryBackup;assert(backup);assert(fs.readFileSync(backup).equals(old));assert(path.relative(f.artifacts,backup).startsWith('draft-history'+path.sep));assert(!path.relative(f.root,backup).startsWith('authoring'));assert(!fresh.hadRecovery);assert.equal(JSON.parse(fs.readFileSync(fresh.recovery)).docs[0].data.name,'New session edit');
 fresh.history({key,version:fresh.version},false);assert(!fs.existsSync(fresh.recovery));assert(fs.readFileSync(backup).equals(old));
});
test('world persistence: a failed recovery archive leaves the only crash copy intact',()=>{
 const f=fixture(),s=f.service,key='map:map-test';rename(s,key,'Old crash copy');const old=fs.readFileSync(s.recovery),fresh=new Service(f.root,{artifacts:f.artifacts}),write=fs.writeFileSync;
 try{fs.writeFileSync=function(file){if(String(file).includes(path.sep+'draft-history'+path.sep))throw Error('archive write failed');return write.apply(this,arguments);};assert.throws(()=>rename(fresh,key,'Retained in memory'),/archive write failed/);}finally{fs.writeFileSync=write;}
 assert(fs.readFileSync(fresh.recovery).equals(old));assert(fresh.hadRecovery);assert.equal(fresh.snapshot(key).value.name,'Retained in memory');
});
test('world persistence: a failed atomic draft replacement preserves the previous complete copy',()=>{
 const f=fixture(),s=f.service,key='map:map-test';rename(s,key,'Complete copy');const old=fs.readFileSync(s.recovery),move=fs.renameSync;
 try{fs.renameSync=function(from,to){if(to===s.recovery)throw Error('draft rename failed');return move.apply(this,arguments);};assert.throws(()=>rename(s,key,'Retained newer draft'),/draft rename failed/);}finally{fs.renameSync=move;}
 assert(fs.readFileSync(s.recovery).equals(old));assert.equal(s.snapshot(key).value.name,'Retained newer draft');assert(!fs.readdirSync(f.artifacts).some(name=>name.includes('.hkd-write-')));
});
test('world persistence: concurrent recovery writes are detected without replacing the external copy',()=>{
 const f=fixture(),s=f.service,key='map:map-test';rename(s,key,'First session');const other=Buffer.from('{"external":"new recovery"}');fs.writeFileSync(s.recovery,other);
 assert.throws(()=>rename(s,key,'Retained local draft'),/recovery copy changed/);assert(fs.readFileSync(s.recovery).equals(other));assert.equal(s.snapshot(key).value.name,'Retained local draft');
});
test('world persistence: map save accepts a BOM manifest and preserves untouched manifest bytes',async()=>{
 const f=fixture(),s=f.service,key='map:map-test',text='\uFEFF{\r\n  "version": 1,\r\n  "assets": [],\r\n  "FutureField": {"keep": 1}\r\n}\r\n',file=f.write('authoring/worlds/library/manifest.json',text);
 rename(s,key,'BOM-safe save');const saved=await s.save({key,version:s.version});assert(saved.result.saved);assert.equal(fs.readFileSync(file,'utf8'),text);const again=await s.save({key,version:s.version});assert(!again.result.saved);assert.equal(fs.readFileSync(file,'utf8'),text);
});
test('world persistence: shared-map saves clear history belonging to clean reloaded stage baselines',async()=>{
 const f=fixture(),s=f.service,key='stage:A-1',cfg={Level:1,prefab:'Generated/Stages/A-1',EnvironmentMapId:'map-test',WaveCfg:[]};
 f.write(L.configFile('A'),{LevelCfg:[cfg],SoldierCfg:{},ParameterCfg:{}});f.write('assets/_script/AuthoredStagePaths.js.meta',{uuid:'11111111-1111-4111-a111-111111111111'});
 f.write('authoring/worlds/stages/A-1.json',{version:1,id:'A-1',variant:'A',level:1,mapId:'map-test',name:'Stage 1',config:cfg,hero:{x:0,y:0},buildings:[],specials:[],spawns:[],graphs:[],templates:{}});
 s.stageIssues=()=>[];let stage=s.snapshot(key),value=clone(stage.value);value.hero.x=20;s.change({key,version:s.version,value});s.history({key,version:s.version},false);assert(s.snapshot(key).canRedo);
 rename(s,'map:map-test','Shared rename');await s.save({key:'map:map-test',version:s.version});stage=s.snapshot(key);assert(!stage.canUndo&&!stage.canRedo);assert.equal(stage.value.hero.x,0);assert(!stage.dirty);
});
test('world persistence: rollback writes remain atomic and an interrupted rollback is explicitly recoverable',()=>{
 const f=fixture(),s=f.service,a='authoring/a.txt',b='authoring/b.txt',aFile=f.write(a,'old-a'),bFile=f.write(b,'old-b'),originals={[a]:fingerprint(aFile),[b]:fingerprint(bFile)},move=fs.renameSync,write=fs.writeFileSync;
 try{
  fs.renameSync=function(from,to){if(to===bFile)throw Error('second commit failed');return move.apply(this,arguments);};
  fs.writeFileSync=function(file,content){if(String(file).startsWith(aFile+'.hkd-write-')){write.call(this,file,Buffer.from('partial'),{flag:'wx'});throw Error('rollback interrupted');}return write.apply(this,arguments);};
  assert.throws(()=>s.commit([{file:a,bytes:Buffer.from('new-a')},{file:b,bytes:Buffer.from('new-b')}],originals),/rollback interrupted/);
 }finally{fs.renameSync=move;fs.writeFileSync=write;}
 assert.equal(fs.readFileSync(aFile,'utf8'),'new-a');assert.equal(fs.readFileSync(bFile,'utf8'),'old-b');assert.equal(s.recoveries().length,1);
 const restored=s.recover({key:'map:map-test',version:s.version});assert(restored.result.recovered);assert.equal(fs.readFileSync(aFile,'utf8'),'old-a');assert.equal(fs.readFileSync(bFile,'utf8'),'old-b');assert.equal(s.recoveries().length,0);
});
