'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Service,tree,fingerprint}=require('../worlds/service'),Maps=require('../worlds/map-management'),M=require('../worlds/model'),L=require('../worlds/legacy'),temporary=require('./owned-temp');
function fixture(){
 const root=temporary('hkd-map-delete-'),artifacts=temporary('hkd-map-delete-artifacts-'),service=new Service(root,{artifacts});
 const write=(file,value)=>{const f=path.join(root,file);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));return f;};
 const keep=M.createMap('Map01','Map01','forest'),map=M.createMap('map-extra','Extra map','desert'),key='map:map-extra';
 for(const m of [keep,map])write('authoring/worlds/maps/'+m.id+'.json',m);
 for(const v of ['A','B','D'])write(L.configFile(v),{LevelCfg:[],FutureField:{preserve:v}});
 const output='assets/KinghtFallIconMap/Generated/Maps/map-extra';
 write(output+'/objects-0.png',Buffer.from([0,1,128,255]));write(output+'/objects-0.png.meta',{uuid:'texture-extra',subMetas:{frame:{uuid:'frame-extra'}}});write(output+'.meta',{uuid:'folder-extra'});
 write('authoring/worlds/library/images/shared-environment.png','Shared tree');
 service.index=()=>({library:[],maps:fs.readdirSync(path.join(root,'authoring/worlds/maps')).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(root,'authoring/worlds/maps',f)))).concat(Object.values(service.docs).filter(d=>d.key.startsWith('map:')&&d.original===null).map(d=>d.data))});
 service.snapshot=key=>({key,version:service.version,busy:service.busy,value:service.index().maps.find(m=>'map:'+m.id===key)});
 const request=()=>({key,version:service.version}),confirmed=()=>({...request(),token:Maps.inspect(service,request()).token});
 return {root,artifacts,service,write,map,key,output,request,confirmed};
}
test('map deletion inspection and cancellation write nothing and leave drafts intact',()=>{
 const f=fixture(),before=tree(f.root),drafts=JSON.stringify(f.service.docs),plan=Maps.inspect(f.service,f.request());
 assert.equal(plan.map.name,'Extra map');assert.equal(plan.files.length,4);assert.deepEqual(plan.blocked,[]);assert(plan.token);assert.equal(f.service.version,1);assert.equal(JSON.stringify(f.service.docs),drafts);assert.deepEqual(tree(f.root),before);assert.deepEqual(fs.readdirSync(f.artifacts),[]);
});
test('deleting an unused map backs up exact files, prunes output and preserves shared art, other drafts and gameplay',()=>{
 const f=fixture(),before=tree(f.root),unrelated={key:'stage:A-9',data:{id:'A-9',mapId:'Map01',future:{keep:1}},original:null};f.service.docs[unrelated.key]=unrelated;
 f.service.docs[f.key]={key:f.key,data:{...f.map,name:'Dirty draft'},original:f.map,revision:fingerprint(path.join(f.root,'authoring/worlds/maps/map-extra.json'))};f.service.undo=[{key:f.key},{key:unrelated.key}];
 const plan=Maps.inspect(f.service,f.request());assert(plan.map.dirty);const result=Maps.remove(f.service,{...f.request(),token:plan.token});
 assert(result.result.mapDeleted);assert.equal(result.busy,false);assert.equal(result.key,'map:Map01');assert.equal(f.service.busy,false);assert.equal(f.service.docs[f.key],undefined);assert.equal(f.service.docs[unrelated.key],unrelated);assert.deepEqual(f.service.undo,[{key:unrelated.key}]);assert(!fs.existsSync(path.join(f.root,f.output)));assert(!fs.existsSync(path.join(f.root,'authoring/worlds/maps/map-extra.json')));
 for(const [absolute,hash]of Object.entries(before)){const file=path.relative(f.root,absolute).split(path.sep).join('/');if(plan.files.includes(file))assert.equal(fingerprint(path.join(result.result.backup,file)),hash);else assert.equal(fingerprint(absolute),hash);}
 assert.deepEqual(f.service.index().maps.map(m=>m.id),['Map01']);
});
test('every stage variant, saved layout, and unsaved stage reference blocks deletion without saving any draft',()=>{
 for(const source of ['A','B','D','layout','draft']){
  const f=fixture();if(['A','B','D'].includes(source))f.write(L.configFile(source),{LevelCfg:[{Level:5,EnvironmentMapId:f.map.id}]});
  if(source==='layout')f.write('authoring/worlds/stages/B-8.json',{id:'B-8',mapId:f.map.id,future:42});
  if(source==='draft')f.service.docs['stage:D-4']={key:'stage:D-4',original:{mapId:'Map01'},data:{mapId:f.map.id}};
  const before=tree(f.root),plan=Maps.inspect(f.service,f.request());assert(plan.stages.length);assert(plan.blocked.some(s=>s.includes('Used by stages')));assert.throws(()=>Maps.remove(f.service,{...f.request(),token:plan.token}),/Used by stages/);assert.deepEqual(tree(f.root),before);assert.equal(f.service.version,1);
 }
});
test('map, stage, generated art and shared version changes invalidate a deletion review',()=>{
 for(const source of ['map','stage','art','version']){
  const f=fixture(),q=f.confirmed();if(source==='map')f.write('authoring/worlds/maps/map-extra.json',{...f.map,name:'Concurrent edit'});if(source==='stage')f.write('authoring/worlds/stages/A-9.json',{id:'A-9',mapId:f.map.id});if(source==='art')f.write(f.output+'/objects-0.png','New pixels');if(source==='version')f.service.version++;
  const before=tree(f.root);assert.throws(()=>Maps.remove(f.service,q),/changed|Another panel/);assert.deepEqual(tree(f.root),before);assert.deepEqual(fs.readdirSync(f.artifacts),[]);
 }
});
test('direct generated sprite dependencies block deletion even without a stage mapId',()=>{
 const f=fixture();f.write('assets/Custom.prefab',[{__type__:'cc.Sprite',_spriteFrame:{__uuid__:'frame-extra'}}]);const plan=Maps.inspect(f.service,f.request());assert.deepEqual(plan.assetReferences,['assets/Custom.prefab']);assert.throws(()=>Maps.remove(f.service,{...f.request(),token:plan.token}),/Generated artwork/);
});
test('shared library source files inside a map export remain protected',()=>{
 const f=fixture();f.write('authoring/worlds/library/manifest.json',{assets:[{id:'shared',name:'Reused artwork',file:f.output+'/objects-0.png'}]});const before=tree(f.root),plan=Maps.inspect(f.service,f.request());assert(plan.blocked.some(s=>s.includes('Reused artwork')));assert.throws(()=>Maps.remove(f.service,{...f.request(),token:plan.token}),/Generated artwork/);assert.deepEqual(tree(f.root),before);
});
test('deleting a new unsaved map removes its recovery draft without creating a project save',()=>{
 const f=fixture(),saved='authoring/worlds/maps/map-extra.json';fs.unlinkSync(path.join(f.root,saved));for(const name of fs.readdirSync(path.join(f.root,f.output)))fs.unlinkSync(path.join(f.root,f.output,name));fs.rmdirSync(path.join(f.root,f.output));fs.unlinkSync(path.join(f.root,f.output+'.meta'));
 f.service.docs[f.key]={key:f.key,file:saved,data:f.map,original:null,revision:null};f.service.persist();const before=tree(f.root),result=Maps.remove(f.service,f.confirmed());assert(result.result.mapDeleted);assert.equal(result.result.saved,false);assert.equal(result.result.backup,undefined);assert.deepEqual(tree(f.root),before);assert(!fs.existsSync(f.service.recovery));
});
test('original source prefabs and the last remaining map cannot be deleted',()=>{
 const f=fixture(),q={key:'map:Map01',version:1},plan=Maps.inspect(f.service,q);assert(plan.blocked.some(s=>s.includes('Original maps')));assert.throws(()=>Maps.remove(f.service,{...q,token:plan.token}),/Original maps/);
 fs.unlinkSync(path.join(f.root,'authoring/worlds/maps/Map01.json'));assert.throws(()=>Maps.remove(f.service,f.confirmed()),/at least one map/);
});
test('archived source maps still load for stages and never replace a deleted map in the picker',()=>{
 const f=fixture(),source='authoring/worlds/maps/Map01.json',archived=JSON.parse(fs.readFileSync(path.join(f.root,source)));
 f.write(source,{...archived,archived:true});
 assert.deepEqual(f.service.mapCatalog().map(map=>map.id),[f.map.id]);
 f.service.indexData=f.service.index();
 assert.equal(f.service.loadMap('Map01').data.archived,true);
 assert.throws(()=>Maps.remove(f.service,f.confirmed()),/at least one map/);
 const replacement=M.createMap('map-kept','Playable map','forest');
 f.write('authoring/worlds/maps/'+replacement.id+'.json',replacement);
 assert.equal(Maps.remove(f.service,f.confirmed()).key,'map:'+replacement.id);
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,source))).id,'Map01');
});
test('invalid identifiers, stale loaded maps and interrupted saves retain all files',()=>{
 const f=fixture();assert.throws(()=>Maps.inspect(f.service,{key:'map:../Map01',version:1}),/Choose a map/);
 f.service.docs[f.key]={key:f.key,data:f.map,original:f.map,revision:'stale'};let q=f.confirmed();assert.throws(()=>Maps.remove(f.service,q),/changed on disk/);delete f.service.docs[f.key];
 q=f.confirmed();f.service.recoveries=()=>[{id:'interrupted'}];const before=tree(f.root);assert.throws(()=>Maps.remove(f.service,q),/interrupted save/);assert.deepEqual(tree(f.root),before);
});
