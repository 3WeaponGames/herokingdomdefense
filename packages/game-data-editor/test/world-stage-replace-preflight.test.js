'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Service,tree}=require('../worlds/service'),M=require('../worlds/model'),P=require('../worlds/prefab'),Replace=require('../worlds/stage-replace'),temporary=require('./owned-temp');
const clone=M.clone,key='stage:B-20',sourceKey='stage:A-19';
function fixture(){
 const root=temporary('hkd-stage-preflight-'),artifacts=temporary('hkd-stage-preflight-artifacts-'),s=new Service(root,{artifacts});
 const maps=['SourceMap','DestinationMap'].map(id=>M.createMap(id,id,'forest'));
 const source={version:1,id:'A-19',variant:'A',level:19,name:'Source',sourceRevision:'source',mapId:'SourceMap',hero:{x:0,y:-100},nextBuilding:2,nextSpecial:1,nextSpawn:2,
  buildings:[{id:1,kind:1,name:'Hall',enabled:true,unlock:1,x:0,y:0,scale:1,angle:0,template:{prefab:'Portable',node:1,roots:[1]}}],specials:[],
  spawns:[{id:1,name:'North',enabled:true,x:0,y:100,graphId:'route-1'}],
  graphs:[{id:'route-1',name:'Approach',spawnIds:[1],entry:'start',nodes:[{id:'start',x:0,y:100},{id:'goal',x:0,y:0,goal:true}],edges:[{id:'edge',from:'start',to:'goal',weight:1}]}],
  templates:{Portable:P.skeleton('Portable',maps[0])},config:{Level:19,Name:'Source',HomeLevel1Unlock:[],HomeLevel2Unlock:[],HomeLevel3Unlock:[],WaveCfg:[{id:19,Wave:1,SpawnTimeline:[{id:'group',spawnId:1,unitId:1,count:1,startSeconds:0,intervalSeconds:1}]}]}};
 const destination=clone(source);Object.assign(destination,{id:'B-20',variant:'B',level:20,name:'Destination',sourceRevision:'destination',mapId:'DestinationMap'});Object.assign(destination.config,{Level:20,Name:'Destination'});destination.config.WaveCfg[0].id=20;
 s.indexData={maps:maps.map(map=>({id:map.id,name:map.name,biome:map.biome})),stages:[source,destination].map(stage=>({id:stage.id,variant:stage.variant,level:stage.level,mapId:stage.mapId})),library:[],documents:{}};
 for(const variant of ['A','B','D']){
  const config=s.indexData.documents[variant]={BuildEnum:{}},file=path.join(root,'assets/KinghtFallConfig'+(variant==='A'?'':variant)+'/GameJsonCfg.json');
  // The real preview reads saved visual settings independently of the cached
  // authoring index. Supply minimal saved files before recording read-only state.
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(config));
 }
 for(const map of maps){const mapKey='map:'+map.id;s.docs[mapKey]={key:mapKey,file:'authoring/worlds/maps/'+map.id+'.json',data:clone(map),original:clone(map),revision:null};}
 for(const value of [source,destination]){const stageKey='stage:'+value.id;s.docs[stageKey]={key:stageKey,file:'authoring/worlds/stages/'+value.id+'.json',data:clone(value),original:clone(value),revision:null};}
 // Keep the real Service.snapshot and preview path. These domain readers expose
 // the original late failures without requiring global game/asset fixtures.
 s.stageIssues=(stage,map)=>{const issues=M.validateStage(stage,map);P.unlocks(stage);return issues;};
 s.snapshot(key);return {root,artifacts,s,source,destination};
}
function replace(f,sections){return f.s.replaceStage({key,sourceKey,sections,version:f.s.version});}
function stable(f){return {destination:JSON.stringify(f.s.doc(key).data),source:JSON.stringify(f.s.doc(sourceKey).data),version:f.s.version,undo:JSON.stringify(f.s.undo),redo:JSON.stringify(f.s.redo),recovery:fs.existsSync(f.s.recovery)?fs.readFileSync(f.s.recovery):null,files:tree(f.root)};}
function unchanged(f,before){assert.equal(JSON.stringify(f.s.doc(key).data),before.destination);assert.equal(JSON.stringify(f.s.doc(sourceKey).data),before.source);assert.equal(f.s.version,before.version);assert.equal(JSON.stringify(f.s.undo),before.undo);assert.equal(JSON.stringify(f.s.redo),before.redo);assert.deepEqual(fs.existsSync(f.s.recovery)?fs.readFileSync(f.s.recovery):null,before.recovery);assert.deepEqual(tree(f.root),before.files);}

test('selected source containers and records reject malformed data before partial or full publication',()=>{
 const malformed=[
  ['buildings',s=>s.buildings=null],['buildings',s=>s.buildings=[null]],['buildings',s=>s.specials=null],['buildings',s=>s.specials=[null]],
  ['spawns',s=>s.spawns=null],['spawns',s=>s.spawns=[null]],['spawns',s=>s.hero=null],['spawns',s=>s.hero=[]],
  ['paths',s=>s.graphs=null],['paths',s=>s.graphs=[null]],['paths',s=>s.graphs[0].nodes=null],['paths',s=>s.graphs[0].nodes=[null]],['paths',s=>s.graphs[0].edges=null],['paths',s=>s.graphs[0].edges=[null]],['paths',s=>s.graphs[0].spawnIds=null],
  ['waves',s=>s.config.WaveCfg=null],['waves',s=>s.config.WaveCfg={}],['settings',s=>s.config=null],['settings',s=>s.config=[]]
 ];
 for(const [section,mutate]of malformed)for(const selected of [[section],Replace.SECTIONS]){const f=fixture();mutate(f.s.doc(sourceKey).data);const before=stable(f);assert.throws(()=>replace(f,selected),/source stage/);unchanged(f,before);}
});

test('preview-reader exceptions are raised before destination, history and existing recovery bytes change',()=>{
 for(const template of [null,undefined]){
  const f=fixture(),initial=clone(f.s.doc(key).data),edited=clone(initial);edited.FutureDestinationEdit={keep:true};f.s.change({key,version:f.s.version,value:edited});
  if(template===undefined)delete f.s.doc(sourceKey).data.buildings[0].template;else f.s.doc(sourceKey).data.buildings[0].template=template;
  const before=stable(f);assert.throws(()=>replace(f,Replace.SECTIONS),/prefab/);unchanged(f,before);assert.deepEqual(f.s.history({key,version:f.s.version},false).value,initial);
 }
});

test('a throwing validation reader rejects a detached preview without changing an existing draft',()=>{
 const f=fixture(),initial=clone(f.s.doc(key).data),edited=clone(initial);edited.FutureDestinationEdit='keep';f.s.change({key,version:f.s.version,value:edited});
 const read=f.s.stageIssues;f.s.stageIssues=(stage,map)=>{if(stage.config.Level===20&&stage.mapId==='SourceMap')throw Error('Cannot inspect source settings.');return read(stage,map);};
 const before=stable(f);assert.throws(()=>replace(f,Replace.SECTIONS),/Cannot inspect source settings/);unchanged(f,before);
});

test('detached real snapshots are read-only and unchanged replacements create no history or recovery writes',()=>{
 const f=fixture(),before=stable(f),preview=clone(f.s.doc(key).data);preview.hero.x=123;const snapshot=f.s.snapshot(key,preview);
 assert.equal(snapshot.value.hero.x,123);assert(snapshot.dirty);snapshot.value.hero.x=999;assert.equal(preview.hero.x,123);unchanged(f,before);
 // Malformed, inspectable waves stay editable; this transfer does not normalize
 // their data or turn validation diagnostics into a repair operation.
 f.s.doc(sourceKey).data.config.WaveCfg=[null];const first=replace(f,['waves']);assert.deepEqual(first.value.config.WaveCfg,[null]);assert(first.issues.includes('Every wave must be an object.'));
 const after=stable(f);replace(f,['waves']);unchanged(f,after);
});
