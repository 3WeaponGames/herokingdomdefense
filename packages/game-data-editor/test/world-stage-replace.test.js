'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const {Service,tree}=require('../worlds/service'),M=require('../worlds/model'),Replace=require('../worlds/stage-replace'),temporary=require('./owned-temp');
const clone=M.clone;
function fixture(){
 const root=temporary('hkd-stage-replace-'),artifacts=temporary('hkd-stage-replace-artifacts-'),s=new Service(root,{artifacts});
 const source={version:1,id:'A-19',variant:'A',level:19,name:'Stage nineteen',sourceRevision:'source',mapId:'SourceMap',basePrefab:'SourcePrefab',hero:{x:90,y:100,SourceHero:{keep:1}},nextSpawn:5,nextBuilding:8,nextSpecial:5,
  buildings:[{id:7,kind:2,name:'Source tower',enabled:true,unlock:2,x:10,y:20,template:{prefab:'Shared',node:1,roots:[1]},FutureBuilding:{keep:1}}],
  specials:[{id:'offer-4',name:'Source offer',x:30,y:40,template:{prefab:'Unembedded',node:2,roots:[2]},FutureOffer:{keep:2}}],
  spawns:[{id:4,name:'Source north',x:50,y:60,graphId:'route-4',enabled:false,FutureSpawn:{keep:3}}],
  graphs:[{id:'route-4',name:'Source route',entry:'start',spawnIds:[4],nodes:[{id:'start',x:50,y:60},{id:'goal',x:0,y:0,goal:true}],edges:[{id:'link',from:'start',to:'goal',weight:2}],FuturePath:{keep:4}}],
  templates:{Shared:[{source:true,unknown:{keep:5}}],UnusedSource:[{unused:true}]},
  config:{Level:19,Name:'[[loc:stage.19]]',EnvironmentMapId:'SourceMap',InGameCoefficient:4,HomeLevel1Unlock:[],HomeLevel2Unlock:[[2,7,'source-extra']],HomeLevel3Unlock:[],FutureConfig:{source:1},WaveCfg:[{Wave:1,id:19,RefreshSoldierKind:['4#1001,3;-1,2'],FutureWave:{legacy:true}},{Wave:2,id:19,SpawnTimeline:[{id:'batch',spawnId:4,unitId:1002,count:9,startSeconds:2.5,intervalSeconds:.4,routeGraphId:'route-4',FutureEntry:{keep:true}}],FutureWave:{timed:true}}]},
  SourceOnly:{keep:6},FutureStage:{source:7}};
 const destination=clone(source);Object.assign(destination,{id:'B-20',variant:'B',level:20,name:'Stage twenty',sourceRevision:'destination',mapId:'DestinationMap',basePrefab:'DestinationPrefab',hero:{x:-30,y:-40,DestinationHero:{keep:1}},nextSpawn:2,nextBuilding:3,nextSpecial:2,
  buildings:[{id:2,kind:3,name:'Destination barracks',template:{prefab:'Shared'}}],specials:[{id:'offer-1',name:'Destination offer',template:{prefab:'Old'}}],spawns:[{id:1,name:'Destination west',x:-50,y:-60}],graphs:[{id:'retained',spawnIds:[1],nodes:[],edges:[]}],templates:{Shared:[{destination:true}],Unembedded:[{stale:true}],Unrelated:[{keep:'destination'}]},DestinationOnly:{keep:8},FutureStage:{destination:9}});
 Object.assign(destination.config,{Level:20,Name:'[[loc:stage.20]]',EnvironmentMapId:'DestinationMap',InGameCoefficient:1,HomeLevel1Unlock:[[3,2,'destination-extra']],HomeLevel2Unlock:[],FutureConfig:{destination:1},WaveCfg:[{Wave:1,id:20,SpawnTimeline:[],DestinationWave:true}]});
 delete destination.SourceOnly;
 s.indexData={stages:[source,destination].map(row=>({id:row.id,variant:row.variant,level:row.level,mapId:row.mapId})),maps:[],library:[],documents:{}};
 for(const value of [source,destination]){const key='stage:'+value.id;s.docs[key]={key,file:'authoring/worlds/stages/'+value.id+'.json',data:clone(value),original:clone(value),revision:null};}
 // Isolate transfer/history from domain-validation/asset loading, which have
 // independent suites. Keep the real change, persist and history code paths.
 s.snapshot=key=>{const doc=s.doc(key);return {key,version:s.version,value:clone(doc.data),dirty:JSON.stringify(doc.data)!==JSON.stringify(doc.original),canUndo:s.undo.some(row=>row.key===key),canRedo:s.redo.some(row=>row.key===key)};};
 return {root,artifacts,s,source,destination};
}
function replace(f,scope){const sections=Array.isArray(scope)?scope:scope==='stage'?Replace.SECTIONS:[scope];return f.s.replaceStage({key:'stage:B-20',sourceKey:'stage:A-19',sections,version:f.s.version});}

for(const scope of Replace.SCOPES)test(scope+' replacement is one detached reversible destination draft and never changes the source or project files',()=>{
 const f=fixture(),files=tree(f.root),sourceBefore=clone(f.s.docs['stage:A-19']),snap=replace(f,scope),after=clone(snap.value);
 assert.equal(snap.key,'stage:B-20');assert.equal(snap.version,2);assert.equal(f.s.undo.length,1);assert.equal(f.s.undo[0].key,'stage:B-20');assert(snap.dirty&&snap.canUndo);assert(fs.existsSync(f.s.recovery));
 assert.deepEqual(f.s.docs['stage:A-19'],sourceBefore);assert.deepEqual(tree(f.root),files);assert.deepEqual(f.s.history({key:snap.key,version:f.s.version},false).value,f.destination);assert.deepEqual(f.s.history({key:snap.key,version:f.s.version},true).value,after);
 for(const key of ['id','variant','level','name','sourceRevision'])assert.deepEqual(after[key],f.destination[key]);for(const key of ['Level','Name'])assert.deepEqual(after.config[key],f.destination.config[key]);
 snap.value.buildings[0].name='Caller mutation';assert.notEqual(f.s.docs['stage:B-20'].data.buildings[0].name,'Caller mutation');assert.deepEqual(f.s.docs['stage:A-19'],sourceBefore);
});

test('whole replacement copies all ordered content and source map while preserving destination-only future metadata',()=>{
 const f=fixture(),value=replace(f,'stage').value;
 for(const key of ['mapId','basePrefab','buildings','specials','spawns','graphs','nextSpawn','nextBuilding','nextSpecial','SourceOnly'])assert.deepEqual(value[key],f.source[key],key);
 assert.deepEqual(value.FutureStage,{source:7,destination:9});assert.deepEqual(value.DestinationOnly,f.destination.DestinationOnly);assert.deepEqual(value.hero,{...f.source.hero,DestinationHero:{keep:1}});assert.deepEqual(value.config.FutureConfig,{source:1,destination:1});
 assert.equal(value.config.WaveCfg[0].id,20);assert.equal(value.config.WaveCfg[1].id,20);const expected=clone(f.source.config.WaveCfg);expected.forEach(w=>w.id=20);assert.deepEqual(value.config.WaveCfg,expected);
});

test('building replacement brings offers, exact unlock rows and only referenced template bindings',()=>{
 const f=fixture(),value=replace(f,'buildings').value,expected=clone(f.destination);
 for(const key of ['buildings','specials','nextBuilding','nextSpecial'])expected[key]=clone(f.source[key]);for(let level=1;level<=3;level++)expected.config['HomeLevel'+level+'Unlock']=clone(f.source.config['HomeLevel'+level+'Unlock']);
 expected.templates.Shared=clone(f.source.templates.Shared);delete expected.templates.Unembedded;assert.deepEqual(value,expected);assert(!Object.hasOwn(value.templates,'UnusedSource'));assert.deepEqual(value.templates.Unrelated,[{keep:'destination'}]);
});

test('spawn replacement includes the hero start but leaves all paths, waves, buildings and map untouched',()=>{
 const f=fixture(),value=replace(f,'spawns').value,expected=clone(f.destination);expected.spawns=clone(f.source.spawns);expected.hero={...f.source.hero,DestinationHero:{keep:1}};expected.nextSpawn=5;assert.deepEqual(value,expected);
});

test('path replacement imports graphs, retains required fallback for an unchecked enabled spawn, and updates only allocation bookkeeping',()=>{
 const f=fixture(),value=replace(f,'paths').value,expected=clone(f.destination);expected.graphs=clone(f.source.graphs).concat(clone(f.destination.graphs));expected.nextSpawn=5;assert.deepEqual(value,expected);
});

test('wave replacement preserves both legacy and timed authored schedules and only rehomes explicit owner IDs',()=>{
 const f=fixture();delete f.s.docs['stage:A-19'].data.config.WaveCfg[0].id;const source=clone(f.s.docs['stage:A-19'].data),value=replace(f,'waves').value,expected=clone(f.destination);expected.config.WaveCfg=clone(source.config.WaveCfg);expected.config.WaveCfg[1].id=20;assert.deepEqual(value,expected);assert(!Object.hasOwn(value.config.WaveCfg[0],'id'));assert.deepEqual(f.s.docs['stage:A-19'].data,source);
});

for(const scope of ['spawns','paths'])test(scope+' replacement prevents subsequent Add spawn from colliding with imported or retained route IDs',()=>{
 const f=fixture();if(scope==='spawns'){f.s.docs['stage:B-20'].data.graphs.push({id:'route-5',nodes:[],edges:[]},{id:'route-6',nodes:[],edges:[]});}else{f.s.docs['stage:A-19'].data.graphs.push({id:'route-2',nodes:[],edges:[]},{id:'route-3',nodes:[],edges:[]});}
 const before=replace(f,scope).value,next=M.newSpawn(before,{x:0,y:0}),last=next.spawns[next.spawns.length-1],route=next.graphs[next.graphs.length-1];assert.equal(next.spawns.filter(spawn=>spawn.id===last.id).length,1);assert.equal(next.graphs.filter(graph=>graph.id===route.id).length,1);assert.deepEqual(next.spawns.slice(0,-1),before.spawns);assert.deepEqual(next.graphs.slice(0,-1),before.graphs);
});

test('future spawn allocation also advances beyond non-adjacent retained route identifiers',()=>{
 const f=fixture();f.s.docs['stage:B-20'].data.graphs.push({id:'route-12',nodes:[],edges:[]});const value=replace(f,'spawns').value;assert.equal(value.nextSpawn,13);assert.deepEqual(value.graphs,f.s.docs['stage:B-20'].data.graphs);assert.equal(M.newSpawn(value,{x:0,y:0}).graphs.slice(-1)[0].id,'route-13');
});

test('replacement uses current unsaved source data and a repeated identical replacement is a no-op',()=>{
 const f=fixture();f.s.docs['stage:A-19'].data.config.WaveCfg[0].FutureWave.unsaved=99;const first=replace(f,'waves'),history=f.s.undo.length,bytes=fs.readFileSync(f.s.recovery),version=f.s.version;assert.equal(first.value.config.WaveCfg[0].FutureWave.unsaved,99);replace(f,'waves');assert.equal(f.s.version,version);assert.equal(f.s.undo.length,history);assert.deepEqual(fs.readFileSync(f.s.recovery),bytes);
});

test('replacement rejects stale, busy, noncanonical, self-source, removed and unknown-scope requests without publishing changes',()=>{
 const f=fixture(),before=JSON.stringify(f.s.docs),files=tree(f.root),valid={key:'stage:B-20',sourceKey:'stage:A-19',sections:Replace.SECTIONS.slice(),version:1};
 for(const request of [{...valid,version:0},{...valid,key:'map:Map01'},{...valid,key:'stage:B-020'},{...valid,sourceKey:'stage:A-019'},{...valid,sourceKey:'stage:A-9007199254740992'},{...valid,sourceKey:'stage:B-20'},{...valid,sourceKey:'stage:A-100'},{...valid,sections:['everything']}, {...valid,sourceKey:null}, {...valid,sections:[]}, {...valid,sections:['waves','waves']}, {...valid,sections:null}, {...valid,sections:'stage'}, {...valid,sections:undefined}])assert.throws(()=>f.s.replaceStage(request));
 f.s.busy=true;assert.throws(()=>f.s.replaceStage(valid),/save is in progress/);f.s.busy=false;assert.equal(JSON.stringify(f.s.docs),before);assert.equal(f.s.version,1);assert.equal(f.s.undo.length,0);assert.equal(f.s.redo.length,0);assert.deepEqual(tree(f.root),files);assert.deepEqual(fs.readdirSync(f.artifacts),[]);
});

test('absent destination display identity fields remain absent after a whole-stage replacement',()=>{
 const f=fixture(),destination=f.s.docs['stage:B-20'].data;delete destination.name;delete destination.sourceRevision;delete destination.config.Name;const value=replace(f,'stage').value;assert(!Object.hasOwn(value,'name'));assert(!Object.hasOwn(value,'sourceRevision'));assert(!Object.hasOwn(value.config,'Name'));
});

test('malformed source section data is rejected before destination mutation, history or recovery writes',()=>{
 for(const [scope,mutate]of [['stage',s=>delete s.config],['stage',s=>s.config=[]],['buildings',s=>s.specials=null],['spawns',s=>s.hero=null],['paths',s=>s.graphs={}],['waves',s=>s.config.WaveCfg={}]]){const f=fixture();mutate(f.s.docs['stage:A-19'].data);const before=JSON.stringify(f.s.docs);assert.throws(()=>replace(f,scope),/source stage/);assert.equal(JSON.stringify(f.s.docs),before);assert.equal(f.s.version,1);assert.equal(f.s.undo.length,0);assert.deepEqual(fs.readdirSync(f.artifacts),[]);}
});

test('replace-stage IPC broadcasts one successful draft change and no failed submission, save or asset import',()=>{
 const f=fixture(),main=path.resolve(__dirname,'../main.js'),load=createRequire(main),broadcasts=[],module={exports:{}},files=tree(f.root);
 const Editor={Project:{path:f.root},Ipc:{sendToAll:(...args)=>broadcasts.push(args)},assetdb:{refresh(){assert.fail('Replace must not import or save project assets');}}};
 vm.runInNewContext(fs.readFileSync(main,'utf8'),{module,Editor,require:name=>name==='./worlds/service'?{Service:class{constructor(){return f.s;}}}:load(name),setTimeout,clearTimeout},{filename:main});
 function invoke(request){let replied=false,result;module.exports.messages['world-replace-stage']({reply:(error,value)=>{replied=true;result={error,value};}},request);assert(replied);return result;}
 const request={key:'stage:B-20',sourceKey:'stage:A-19',sections:['waves'],version:f.s.version},success=invoke(request);assert.ifError(success.error);assert.equal(success.value.key,request.key);assert.equal(success.value.version,2);assert.equal(broadcasts.length,1);assert.deepEqual(clone(broadcasts[0]),['game-data-editor:world-changed',{version:2}]);assert.deepEqual(tree(f.root),files);
 const before=clone(f.s.docs),failed=invoke(request);assert.match(failed.error,/Another panel/);assert.equal(broadcasts.length,1);assert.deepEqual(f.s.docs,before);assert.deepEqual(tree(f.root),files);
});

test('Map and stage settings alone preserve every unchecked section and all wave/building unlock data',()=>{
 const f=fixture(),value=replace(f,['settings']).value,expected=clone(f.destination);Object.assign(expected,{mapId:f.source.mapId,basePrefab:f.source.basePrefab,SourceOnly:clone(f.source.SourceOnly),FutureStage:{destination:9,source:7}});Object.assign(expected.config,{EnvironmentMapId:f.source.config.EnvironmentMapId,InGameCoefficient:4,FutureConfig:{destination:1,source:1}});assert.deepEqual(value,expected);
});

test('all 31 checkbox combinations affect only selected sections and remain one undoable edit regardless of checkbox order',()=>{
 for(let mask=1;mask<1<<Replace.SECTIONS.length;mask++){
  const f=fixture(),selected=Replace.SECTIONS.filter((_,index)=>mask&(1<<index)),sourceBefore=clone(f.s.docs['stage:A-19']),snap=replace(f,selected),value=snap.value;
  for(const key of ['buildings','specials'])assert.deepEqual(value[key],(selected.includes('buildings')?f.source:f.destination)[key],selected+' '+key);
  assert.deepEqual(value.spawns,(selected.includes('spawns')?f.source:f.destination).spawns);const expectedGraphs=clone((selected.includes('paths')?f.source:f.destination).graphs);if(selected.includes('paths')&&!selected.includes('spawns'))expectedGraphs.push(...clone(f.destination.graphs));assert.deepEqual(value.graphs,expectedGraphs);
  if(!selected.includes('spawns'))assert.deepEqual(value.hero,f.destination.hero);else{assert.equal(value.hero.x,f.source.hero.x);assert.equal(value.hero.y,f.source.hero.y);assert.deepEqual(value.hero.DestinationHero,f.destination.hero.DestinationHero);}
  const expectedWaves=clone((selected.includes('waves')?f.source:f.destination).config.WaveCfg);if(selected.includes('waves'))expectedWaves.forEach(wave=>wave.id=20);assert.deepEqual(value.config.WaveCfg,expectedWaves);
  for(let level=1;level<=3;level++)assert.deepEqual(value.config['HomeLevel'+level+'Unlock'],(selected.includes('buildings')?f.source:f.destination).config['HomeLevel'+level+'Unlock']);
  assert.equal(value.mapId,(selected.includes('settings')?f.source:f.destination).mapId);assert.equal(value.config.InGameCoefficient,(selected.includes('settings')?f.source:f.destination).config.InGameCoefficient);
  if(!selected.includes('buildings')){assert.deepEqual(value.templates,f.destination.templates);assert.equal(value.nextBuilding,f.destination.nextBuilding);assert.equal(value.nextSpecial,f.destination.nextSpecial);}
  if(!selected.includes('spawns')&&!selected.includes('paths'))assert.equal(value.nextSpawn,f.destination.nextSpawn);
  for(const key of ['id','variant','level','name','sourceRevision'])assert.deepEqual(value[key],f.destination[key]);assert.equal(value.config.Level,20);assert.equal(value.config.Name,f.destination.config.Name);
  assert.deepEqual(value,Replace.plan(f.destination,f.source,selected.slice().reverse()).value,'selection order cannot alter the transfer');assert.equal(f.s.undo.length,1);assert.deepEqual(f.s.docs['stage:A-19'],sourceBefore);
  assert.deepEqual(f.s.history({key:snap.key,version:f.s.version},false).value,f.destination);assert.deepEqual(f.s.history({key:snap.key,version:f.s.version},true).value,value);
 }
});

test('stage20 can keep its exact waves while taking stage19 layout/settings, then independently take stage17 waves with two separate undos',()=>{
 const f=fixture(),stage17=clone(f.source);Object.assign(stage17,{id:'A-17',level:17,name:'Stage seventeen'});Object.assign(stage17.config,{Level:17,Name:'[[loc:stage.17]]',WaveCfg:[{Wave:1,id:17,SpawnTimeline:[{id:'seventeen',spawnId:4,unitId:1003,count:17,startSeconds:1.7,intervalSeconds:.17,routeGraphId:'route-4',FutureReward:{keep:'17'}}],WaveReward:['Gold#170']},{Wave:2,RefreshSoldierKind:['4#1002,2'],FutureWave:{noOwner:true}}]});
 const key='stage:A-17';f.s.docs[key]={key,file:'authoring/worlds/stages/A-17.json',data:clone(stage17),original:clone(stage17),revision:null};f.s.indexData.stages.push({id:stage17.id,variant:'A',level:17,mapId:stage17.mapId});
 const originalWaves=JSON.stringify(f.destination.config.WaveCfg),stage19Before=clone(f.s.docs['stage:A-19']),stage17Before=clone(f.s.docs[key]);
 const first=replace(f,['buildings','spawns','paths','settings']).value;assert.equal(JSON.stringify(first.config.WaveCfg),originalWaves);assert.equal(first.mapId,f.source.mapId);assert.deepEqual(first.buildings,f.source.buildings);assert.deepEqual(first.spawns,f.source.spawns);assert.deepEqual(first.graphs,f.source.graphs);assert.equal(first.config.Level,20);
 const second=f.s.replaceStage({key:'stage:B-20',sourceKey:key,sections:['waves'],version:f.s.version}).value,expected=clone(first);expected.config.WaveCfg=clone(stage17.config.WaveCfg);expected.config.WaveCfg[0].id=20;assert.deepEqual(second,expected);assert(!Object.hasOwn(second.config.WaveCfg[1],'id'));assert.equal(f.s.undo.length,2);
 const undoWaves=f.s.history({key:'stage:B-20',version:f.s.version},false).value;assert.deepEqual(undoWaves,first);assert.equal(JSON.stringify(undoWaves.config.WaveCfg),originalWaves);assert.deepEqual(f.s.history({key:'stage:B-20',version:f.s.version},false).value,f.destination);
 assert.deepEqual(f.s.docs['stage:A-19'],stage19Before);assert.deepEqual(f.s.docs[key],stage17Before);
});

function requiredFixture(){
 const f=fixture(),destination=f.s.docs['stage:B-20'].data;destination.spawns.push({id:13,name:'Keep original north',enabled:true,x:313,y:-413,graphId:'kept-route',FutureSpawn:{keep:true}},{id:14,name:'Keep original west',enabled:true,x:314,y:-414});
 destination.graphs=[{id:'kept-route',name:'Original fallback',spawnIds:[1,13,14],entry:'start',nodes:[{id:'start',x:300,y:-400},{id:'goal',x:0,y:0,goal:true}],edges:[{id:'e',from:'start',to:'goal',weight:1}],FutureRoute:{keep:true}},{id:'unused-conditional',name:'Not required',spawnIds:[13,14],entry:'start',nodes:[],edges:[],requiresAnyBuilding:[999]}];
 destination.config.WaveCfg=[{Wave:1,id:20,SpawnTimeline:[{id:'keep13',spawnId:13,unitId:1001,count:2,startSeconds:1,intervalSeconds:.5,routeGraphId:'kept-route',FutureWave:{keep:true}},{id:'keep14',spawnId:14,unitId:1002,count:3,startSeconds:2,intervalSeconds:.5}]}];f.destination=clone(destination);return f;
}

test('unchanged waves retain only their required original entrances and narrow fallback/override routes, with a placement warning after map changes',()=>{
 const f=requiredFixture(),sourceBefore=clone(f.s.docs['stage:A-19']),originalWaves=JSON.stringify(f.destination.config.WaveCfg),snap=replace(f,['buildings','spawns','paths','settings']),value=snap.value,info=snap.result.replacementInfo;
 assert.equal(JSON.stringify(value.config.WaveCfg),originalWaves);assert.equal(value.mapId,'SourceMap');assert.deepEqual(value.spawns.slice(0,1),f.source.spawns);assert.deepEqual(value.spawns.slice(1),f.destination.spawns.filter(spawn=>[13,14].includes(spawn.id)));assert.equal(value.nextSpawn,15);
 assert.deepEqual(value.graphs.filter(graph=>graph.id!=='kept-route'),f.source.graphs);const kept=value.graphs.find(graph=>graph.id==='kept-route'),expected=clone(f.destination.graphs[0]);expected.spawnIds=[13,14];assert.deepEqual(kept,expected);assert(!value.graphs.some(graph=>graph.id==='unused-conditional'));
 assert.deepEqual(info.retainedSpawnIds,[13,14]);assert.deepEqual(info.retainedGraphIds,['kept-route']);assert.equal(info.placementWarnings.length,1);assert.match(info.placementWarnings[0],/original positions and routes/);assert.match(info.placementWarnings[0],/map changed.*blocked by scenery/i);
 assert.deepEqual(f.s.docs['stage:A-19'],sourceBefore);assert.equal(f.s.undo.length,1);assert.deepEqual(f.s.history({key:snap.key,version:f.s.version},false).value,f.destination);assert.deepEqual(f.s.history({key:snap.key,version:f.s.version},true).value,value);
});

test('disabled incoming lanes keep the original required enabled entrance and original route associations',()=>{
 const f=requiredFixture(),source=f.s.docs['stage:A-19'].data;source.spawns.push({id:13,name:'Disabled different entrance',enabled:false,x:999,y:999});source.graphs[0].spawnIds.push(13);const value=replace(f,['spawns','paths']).value;
 assert.deepEqual(value.spawns.find(spawn=>spawn.id===13),f.destination.spawns.find(spawn=>spawn.id===13));assert(!value.graphs.find(graph=>graph.id==='route-4').spawnIds.includes(13));assert(value.graphs.find(graph=>graph.id==='kept-route').spawnIds.includes(13));assert.equal(JSON.stringify(value.config.WaveCfg),JSON.stringify(f.destination.config.WaveCfg));
});

test('paths-only replacement retains missing required bindings without changing any spawn, and rejects ambiguous route-ID collisions atomically',()=>{
 const f=requiredFixture(),snap=replace(f,['paths']);assert.deepEqual(snap.value.spawns,f.destination.spawns);assert.deepEqual(snap.result.replacementInfo.retainedSpawnIds,[]);assert.deepEqual(snap.result.replacementInfo.retainedGraphIds,['kept-route']);assert.deepEqual(snap.value.graphs.find(graph=>graph.id==='kept-route').spawnIds,[1,13,14]);
 const conflict=requiredFixture();conflict.s.docs['stage:A-19'].data.graphs.push({id:'kept-route',name:'Different source route',spawnIds:[4],entry:'different',nodes:[],edges:[]});const before=clone(conflict.s.docs);assert.throws(()=>replace(conflict,['spawns','paths']),/same route ID for different content/);assert.deepEqual(conflict.s.docs,before);assert.equal(conflict.s.undo.length,0);assert.equal(conflict.s.version,1);assert(!fs.existsSync(conflict.s.recovery));
});

test('equivalent route geometry can gain only the required missing lane association without changing other source associations',()=>{
 const f=requiredFixture(),graph=clone(f.destination.graphs[0]);graph.spawnIds=[4];f.s.docs['stage:A-19'].data.graphs=[graph];const value=replace(f,['paths']).value,kept=value.graphs.find(graph=>graph.id==='kept-route');assert.equal(value.graphs.filter(graph=>graph.id==='kept-route').length,1);assert.deepEqual(kept.spawnIds,[4,1,13,14]);assert.equal(JSON.stringify(value.config.WaveCfg),JSON.stringify(f.destination.config.WaveCfg));
});

test('spawns-only retention leaves unchecked graphs byte-for-byte intact, and never invents a missing or originally disabled lane',()=>{
 const f=requiredFixture();f.s.docs['stage:B-20'].data.spawns.push({id:99,name:'Originally disabled',enabled:false,x:0,y:0});f.s.docs['stage:B-20'].data.config.WaveCfg[0].SpawnTimeline.push({id:'bad99',spawnId:99},{id:'bad100',spawnId:100});const before=clone(f.s.docs['stage:B-20'].data),snap=replace(f,['spawns']);assert.equal(JSON.stringify(snap.value.graphs),JSON.stringify(before.graphs));assert.deepEqual(snap.result.replacementInfo.retainedSpawnIds,[13,14]);assert(!snap.value.spawns.some(spawn=>spawn.id===99||spawn.id===100));assert.equal(JSON.stringify(snap.value.config.WaveCfg),JSON.stringify(before.config.WaveCfg));
});

test('map-only changes warn about unchecked geometry, all-five replacement needs no retention warning, and legacy schedules are inspected without conversion',()=>{
 const f=requiredFixture(),settings=replace(f,['settings']);assert(settings.result.replacementInfo.placementWarnings.some(warning=>/existing spawn points and paths were kept/.test(warning)));assert.deepEqual(settings.value.spawns,f.destination.spawns);assert.deepEqual(settings.value.graphs,f.destination.graphs);
 const whole=replace(f,Replace.SECTIONS);assert.deepEqual(whole.result.replacementInfo,{retainedSpawnIds:[],retainedGraphIds:[],placementWarnings:[]});
 const legacy=requiredFixture(),destination=legacy.s.docs['stage:B-20'].data;destination.config.WaveCfg=[{Wave:1,id:20,RefreshSoldierKind:['13#1001,2;-1,5','14#1002,3']}];const raw=JSON.stringify(destination.config.WaveCfg),snap=replace(legacy,['spawns','paths']);assert.equal(JSON.stringify(snap.value.config.WaveCfg),raw);assert(!Object.hasOwn(snap.value.config.WaveCfg[0],'SpawnTimeline'));assert.deepEqual(snap.result.replacementInfo.retainedSpawnIds,[13,14]);
});

for(const selected of [['paths'],['paths','waves']])test(selected.join('+')+' preserves an unchecked enabled lane’s fallback even when that lane is unused by every wave',()=>{
 const f=fixture(),target=f.s.docs['stage:B-20'].data,source=f.s.docs['stage:A-19'].data;
 target.spawns.push({id:12,name:'Unused enabled lane',x:120,y:-120,enabled:true});target.graphs=[{id:'old-shared',name:'Original fallback',spawnIds:[1,12],entry:'entry',nodes:[{id:'entry',x:0,y:100},{id:'goal',x:0,y:0,goal:true}],edges:[{id:'e',from:'entry',to:'goal',weight:1}]}];
 target.config.WaveCfg=[{Wave:1,id:20,SpawnTimeline:[{id:'only1',spawnId:1,unitId:1001,count:2,startSeconds:0,intervalSeconds:1}]}];source.graphs=[{id:'new-source',name:'New path',spawnIds:[1],entry:'entry',nodes:[{id:'entry',x:10,y:110},{id:'goal',x:0,y:0,goal:true}],edges:[{id:'e',from:'entry',to:'goal',weight:1}]}];source.config.WaveCfg=[{Wave:1,id:19,SpawnTimeline:[{id:'source1',spawnId:1,unitId:1001,count:3,startSeconds:0,intervalSeconds:1}]}];
 const spawns=JSON.stringify(target.spawns),waves=JSON.stringify(target.config.WaveCfg),original=clone(target),snap=replace(f,selected);assert.equal(JSON.stringify(snap.value.spawns),spawns);assert.deepEqual(snap.value.graphs.find(graph=>graph.id==='new-source'),source.graphs[0]);assert.deepEqual(snap.value.graphs.find(graph=>graph.id==='old-shared').spawnIds,[12]);assert.deepEqual(snap.result.replacementInfo.retainedSpawnIds,[]);assert.deepEqual(snap.result.replacementInfo.retainedGraphIds,['old-shared']);if(!selected.includes('waves'))assert.equal(JSON.stringify(snap.value.config.WaveCfg),waves);assert.deepEqual(f.s.history({key:snap.key,version:f.s.version},false).value,original);
});

