'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const {Service,tree}=require('../worlds/service'),M=require('../worlds/model'),P=require('../worlds/prefab'),L=require('../worlds/legacy'),temporary=require('./owned-temp');
const clone=M.clone;

function fixture(){
 const root=temporary('hkd-stage-clipboard-'),artifacts=temporary('hkd-stage-clipboard-artifacts-'),s=new Service(root,{artifacts}),maps=['Map01','Map02'].map(id=>M.createMap(id,id,'forest'));
 const write=(file,value)=>{const full=path.join(root,file);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,JSON.stringify(value));};
 const template=P.skeleton('Portable building',maps[0]),source={
  version:1,id:'A-1',variant:'A',level:1,name:'Source stage',sourceRevision:'source-revision',mapId:'Map01',hero:{x:11,y:22},nextSpawn:5,nextBuilding:9,
  config:{Level:1,Name:'Source title',EnvironmentMapId:'Map01',InGameCoefficient:3,FutureConfig:{shared:{source:true}},WaveCfg:[
   {Wave:1,StartSliver:21,RefreshSoldierKind:['1#90001,2;-1,3'],WaveReward:['Gold#100'],FutureWave:{keep:17}},
   {Wave:2,StartSliver:22,SpawnTimeline:[{id:'timed',spawnId:4,unitId:90002,count:5,startSeconds:7.5,intervalSeconds:.2}],FutureWave:{keep:18}}
  ]},
  buildings:[{id:7,kind:2,name:'Tower',enabled:false,unlock:2,x:33,y:44,scale:1,angle:0,template:{prefab:'Portable',node:1,roots:[1]},FutureBuilding:{keep:true}}],
  specials:[{id:'offer',kind:0,name:'Recruit',enabled:true,x:55,y:66,template:{prefab:'Portable',node:1,roots:[1]},FutureOffer:{health:123}}],
  spawns:[{id:4,name:'North',enabled:true,x:77,y:88,graphId:'route'}],
  graphs:[{id:'route',spawnIds:[4],entry:'entry',nodes:[{id:'entry',x:77,y:88},{id:'goal',x:11,y:22,goal:true}],edges:[{id:'edge',from:'entry',to:'goal',weight:2}],requiresAnyBuilding:[7],FutureGraph:{keep:true}}],
  templates:{Portable:template},FutureStage:{shared:{source:true}},SourceOnly:{list:[1,2,3]}
 },destination=clone(source);
 Object.assign(destination,{id:'B-2',variant:'B',level:2,name:'Destination stage',sourceRevision:'destination-revision',mapId:'Map02',hero:{x:-10,y:-20,FutureHero:{destination:true}},buildings:[],specials:[],spawns:[],graphs:[],nextSpawn:1,nextBuilding:1,FutureStage:{shared:{destination:true}},DestinationOnly:{keep:42}});
 Object.assign(destination.config,{Level:2,Name:'Destination title',EnvironmentMapId:'Map02',InGameCoefficient:1,FutureConfig:{shared:{destination:true}},WaveCfg:[{Wave:1,StartSliver:1,RefreshSoldierKind:[]}]});
 s.indexData={maps:maps.map(m=>({id:m.id,name:m.name,biome:m.biome})),stages:[source,destination].map(v=>({id:v.id,variant:v.variant,level:v.level,mapId:v.mapId})),library:[],documents:{}};
 for(const variant of ['A','B','D']){s.indexData.documents[variant]={LevelCfg:[source.config,destination.config],BuildEnum:{},SoldierCfg:{},ParameterCfg:{}};write(L.configFile(variant),s.indexData.documents[variant]);}
 for(const map of maps){const key='map:'+map.id,file='authoring/worlds/maps/'+map.id+'.json';write(file,map);s.docs[key]={key,file,data:clone(map),original:clone(map),revision:null};}
 for(const value of [source,destination]){const key='stage:'+value.id,file='authoring/worlds/stages/'+value.id+'.json';write(file,value);s.docs[key]={key,file,data:clone(value),original:clone(value),revision:null};}
 // Domain validation has its own suites. This fixture isolates state/identity,
 // complete ordered content, revision guards, undo and the actual IPC path.
 s.stageIssues=()=>[];
 return {root,artifacts,s,source,destination};
}
function frozen(value){if(value&&typeof value==='object'){assert(Object.isFrozen(value));for(const key of Object.keys(value))frozen(value[key]);}}

test('whole-stage copy is a detached frozen snapshot with no version, history, recovery or project writes',()=>{
 const {root,artifacts,s,source}=fixture(),files=tree(root),before=JSON.stringify(s.docs),version=s.version;
 assert.equal(s.snapshot('stage:A-1').stageClipboard,null);
 const snap=s.copyStage({key:'stage:A-1',version}),clipboard=s.stageClipboard;
 assert.equal(s.version,version);assert.equal(s.undo.length,0);assert.equal(s.redo.length,0);assert.deepEqual(tree(root),files);assert.deepEqual(fs.readdirSync(artifacts),[]);assert(!fs.existsSync(s.recovery));
 assert.deepEqual(snap.stageClipboard,{key:'stage:A-1',id:'A-1',variant:'A',level:1,name:'Source stage'});frozen(clipboard);assert.deepEqual(clipboard.value,source);
 snap.stageClipboard.name='Caller mutation';snap.value.graphs[0].nodes[0].x=999;
 assert.equal(s.stageClipboard.metadata.name,'Source stage');assert.equal(s.stageClipboard.value.graphs[0].nodes[0].x,77);
 assert.deepEqual(s.snapshot('stage:B-2').stageClipboard,clipboard.metadata);assert.deepEqual(s.snapshot('map:Map02').stageClipboard,clipboard.metadata);
 assert.equal(JSON.stringify(Object.fromEntries(Object.entries(s.docs).filter(([key])=>key!=='library:groups'))),before);
 assert.deepEqual(tree(root),files);assert.deepEqual(fs.readdirSync(artifacts),[]);
});

test('whole-stage paste copies map/layout/specials/routes/all waves while preserving destination identity and unknown fields in one undo',()=>{
 const {root,s,source,destination}=fixture(),files=tree(root);s.copyStage({key:'stage:A-1',version:s.version});
 const sourceEdit=clone(s.docs['stage:A-1'].data);sourceEdit.config.WaveCfg[0].StartSliver=999;sourceEdit.graphs[0].nodes[0].x=999;s.change({key:'stage:A-1',version:s.version,value:sourceEdit});
 const count=s.undo.length,version=s.version,snap=s.pasteStage({key:'stage:B-2',version}),pasted=clone(snap.value);
 assert.equal(s.version,version+1);assert.equal(s.undo.length,count+1);assert(snap.dirty);assert(snap.canUndo);assert.deepEqual(tree(root),files,'Paste must remain a draft until Save');assert(fs.existsSync(s.recovery));
 for(const key of ['id','variant','level','name','sourceRevision'])assert.deepEqual(pasted[key],destination[key],key);
 for(const key of ['Level','Name'])assert.deepEqual(pasted.config[key],destination.config[key]);
 for(const key of ['mapId','buildings','specials','spawns','graphs','nextSpawn','nextBuilding','SourceOnly'])assert.deepEqual(pasted[key],source[key],key);
 assert.equal(pasted.hero.x,source.hero.x);assert.equal(pasted.hero.y,source.hero.y);assert.deepEqual(pasted.hero.FutureHero,{destination:true});
 assert.deepEqual(pasted.config.WaveCfg,source.config.WaveCfg);assert.equal(pasted.config.InGameCoefficient,3);assert.equal(pasted.config.EnvironmentMapId,'Map01');
 assert.deepEqual(pasted.FutureStage,{shared:{source:true,destination:true}});assert.deepEqual(pasted.config.FutureConfig,{shared:{source:true,destination:true}});assert.deepEqual(pasted.DestinationOnly,{keep:42});
 assert.deepEqual(pasted.templates,source.templates);assert.notEqual(s.docs['stage:B-2'].data.templates.Portable,s.stageClipboard.value.templates.Portable);
 assert.equal(s.docs['stage:A-1'].data.config.WaveCfg[0].StartSliver,999);assert.equal(s.stageClipboard.value.config.WaveCfg[0].StartSliver,21);
 const undone=s.history({key:'stage:B-2',version:s.version},false);assert.deepEqual(undone.value,destination);assert(!undone.dirty);assert(undone.canRedo);
 assert.deepEqual(s.history({key:'stage:B-2',version:s.version},true).value,pasted);
 snap.value.config.WaveCfg[0].StartSliver=-1;assert.equal(s.docs['stage:B-2'].data.config.WaveCfg[0].StartSliver,21);assert.equal(s.stageClipboard.value.config.WaveCfg[0].StartSliver,21);
 assert.deepEqual(tree(root),files);
});

test('clipboard rejects stale/busy/non-stage requests and empty paste without changing drafts or files',()=>{
 const {root,artifacts,s}=fixture(),files=tree(root),version=s.version;
 assert.throws(()=>s.pasteStage({key:'stage:B-2',version}),/Copy a stage/);
 assert.throws(()=>s.copyStage({key:'map:Map01',version}),/Choose a stage/);
 assert.throws(()=>s.pasteStage({key:'map:Map01',version}),/Choose a destination stage/);
 assert.throws(()=>s.copyStage({key:'stage:A-1',version:version-1}),/Another panel/);
 s.copyStage({key:'stage:A-1',version});const clipboard=s.stageClipboard;
 assert.throws(()=>s.pasteStage({key:'stage:B-2',version:version-1}),/Another panel/);
 s.busy=true;assert.throws(()=>s.copyStage({key:'stage:A-1',version}),/save is in progress/);assert.throws(()=>s.pasteStage({key:'stage:B-2',version}),/save is in progress/);s.busy=false;
 assert.equal(s.version,version);assert.equal(s.undo.length,0);assert.equal(s.stageClipboard,clipboard);assert.deepEqual(tree(root),files);assert.deepEqual(fs.readdirSync(artifacts),[]);
});

test('explicit cross-stage paste rehomes existing wave owner IDs and preserves every other wave field',()=>{
 const {s,source,destination}=fixture();for(const key of ['stage:A-1','stage:B-2'])for(const wave of s.docs[key].data.config.WaveCfg)wave.id=s.docs[key].data.config.Level;
 const expected=clone(s.docs['stage:A-1'].data.config.WaveCfg);expected.forEach(w=>w.id=destination.config.Level);
 s.copyStage({key:'stage:A-1',version:s.version});const pasted=s.pasteStage({key:'stage:B-2',version:s.version});
 assert.deepEqual(pasted.value.config.WaveCfg,expected);assert(s.stageClipboard.value.config.WaveCfg.every(w=>w.id===source.config.Level));
 s.history({key:'stage:B-2',version:s.version},false);assert(s.docs['stage:B-2'].data.config.WaveCfg.every(w=>w.id===destination.config.Level));
 s.history({key:'stage:B-2',version:s.version},true);assert.deepEqual(s.docs['stage:B-2'].data.config.WaveCfg,expected);
});

test('stage draft changes reject owner identity edits before publishing history or recovery',()=>{
 const {s,root,artifacts}=fixture(),before=JSON.stringify(s.docs),files=tree(root),version=s.version;
 for(const mutate of [v=>v.variant='D',v=>v.level=17,v=>v.config.Level=17]){const value=clone(s.docs['stage:A-1'].data);mutate(value);assert.throws(()=>s.change({key:'stage:A-1',version,value}),/Identifiers cannot be changed/);}
 assert.equal(JSON.stringify(s.docs),before);assert.equal(s.version,version);assert.equal(s.undo.length,0);assert.equal(s.redo.length,0);assert.deepEqual(tree(root),files);assert.deepEqual(fs.readdirSync(artifacts),[]);
});

test('pasting an unchanged stage is a no-op and missing destination identity fields stay absent',()=>{
 const {root,artifacts,s}=fixture(),files=tree(root),version=s.version;s.copyStage({key:'stage:A-1',version});
 assert(!s.pasteStage({key:'stage:A-1',version}).dirty);assert.equal(s.version,version);assert.equal(s.undo.length,0);assert.deepEqual(fs.readdirSync(artifacts),[]);
 delete s.docs['stage:B-2'].data.name;delete s.docs['stage:B-2'].data.sourceRevision;delete s.docs['stage:B-2'].data.config.Name;
 const snap=s.pasteStage({key:'stage:B-2',version});assert(!Object.hasOwn(snap.value,'name'));assert(!Object.hasOwn(snap.value,'sourceRevision'));assert(!Object.hasOwn(snap.value.config,'Name'));assert.deepEqual(tree(root),files);
});

test('clipboard IPC returns fresh snapshots, broadcasts only Paste and never saves/imports project files',()=>{
 const {root,s}=fixture(),main=path.resolve(__dirname,'../main.js'),load=createRequire(main),broadcasts=[],module={exports:{}},files=tree(root);
 const Editor={Project:{path:root},Ipc:{sendToAll:(...args)=>broadcasts.push(args)},assetdb:{refresh(){assert.fail('Draft copy/paste must not import project files');}}};
 vm.runInNewContext(fs.readFileSync(main,'utf8'),{module,Editor,require:name=>name==='./worlds/service'?{Service:class{constructor(){return s;}}}:load(name),setTimeout,clearTimeout},{filename:main});
 const invoke=(action,request)=>{let reply;module.exports.messages[action]({reply:(error,value)=>{assert.ifError(error);reply=value;}},request);assert(reply);return reply;};
 const copied=invoke('world-copy-stage',{key:'stage:A-1',version:s.version});assert(copied.stageClipboard);assert.equal(copied.version,1);assert.equal(broadcasts.length,0);assert(!fs.existsSync(s.recovery));
 const pasted=invoke('world-paste-stage',{key:'stage:B-2',version:s.version});assert.equal(pasted.value.mapId,'Map01');assert.equal(pasted.version,2);assert.equal(broadcasts.length,1);assert.equal(broadcasts[0][0],'game-data-editor:world-changed');assert.equal(broadcasts[0][1].version,2);assert.deepEqual(tree(root),files);
});
