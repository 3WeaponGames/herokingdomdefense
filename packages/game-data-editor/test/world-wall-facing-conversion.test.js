'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Migration=require('../../../tools/maps/convert-wall-facings.cjs'),Gate=require('../worlds/gate-facing'),Facing=require('../../../assets/_script/GateFacing'),L=require('../worlds/legacy'),Maps=require('../lib/map-assets'),JSONDoc=require('../lib/json-document'),temporary=require('./owned-temp');
const root=path.resolve(__dirname,'../../..'),clone=value=>JSON.parse(JSON.stringify(value));
function legacy(){const data=clone(L.inspect(root,'Map01').data),type=L.script(root,'KinghtFallBuildWall');for(const component of data)if(component&&component.__type__===type)delete component.wallFacing;return data;}
function wall(data,id){const info=Maps.model(data),owner=info.owners.find(node=>node.kind==='building'&&node.slot===id);return {id,kind:6,template:{prefab:'Map01',node:owner.id,roots:L.family(data,info,owner)}};}
function write(directory,file,value){const target=path.join(directory,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');return fs.readFileSync(target);}
function fixture(){const directory=temporary('hkd-wall-migration-'),artifacts=temporary('hkd-wall-backup-'),data=legacy(),bytes=write(directory,'assets/KinghtFallIconMap/Map01.prefab',data),revision=L.hash(bytes),buildings=[wall(data,17),wall(data,19)];
 write(directory,'assets/_script/KinghtFallBuildWall.js.meta',fs.readFileSync(path.join(root,'assets/_script/KinghtFallBuildWall.js.meta'),'utf8'));
 write(directory,'assets/KinghtFallIconMap/Generated/Stages/A-7.prefab',data);
 buildings.forEach(building=>{building.template.revision=revision;building.FutureField={keep:[1,2,3]};});
 write(directory,'authoring/worlds/stages/A-1.json',{id:'A-1',buildings,templates:{Map01:clone(data)},spawns:[{id:18,x:123,y:456}],graphs:[{id:'route',nodes:[{x:2,y:3}]}],config:{WaveCfg:[{FutureWave:{keep:true}}]},FutureStage:'untouched'});
 write(directory,'authoring/worlds/maps/Map01.json',{legacy:{prefab:'Map01',revision},legacyData:clone(data),layers:[{FutureObject:{keep:42}}],historical:{revision:'already-stale'},FutureMap:'untouched'});
 write(directory,'authoring/worlds/library/manifest.json',{version:1,assets:[],FutureLibrary:'untouched'});return {directory,artifacts,revision,data};}

test('facing inference covers all compass directions using closed model mirroring and the inside purchase field without modifying source geometry',()=>{
 for(const [id,expected,opposite]of [[17,'NW','SE'],[19,'NE','SW']]){
  const data=legacy(),building=wall(data,id),before=JSON.stringify(data);assert.equal(Gate.facing(data,building),expected);assert.equal(JSON.stringify(data),before);
  const info=Maps.model(data),owner=info.byId[building.template.node],controller=data[owner.ownerComponent],plate=info.byId[controller.ndLockList[0].__id__],node=data[plate.id],a=node._trs.array,target=Maps.point(Maps.inverse(info.byId[plate.parent].world),{x:2*owner.position.x-plate.position.x,y:2*owner.position.y-plate.position.y});a[0]=target.x;a[1]=target.y;
  assert.equal(Gate.facing(data,building),opposite,'opposite construction side selects '+opposite);assert.equal(Facing.mirrorX(expected),Facing.mirrorX(opposite));
  controller.wallFacing=expected;assert.equal(Gate.facing(data,building),expected,'stored runtime facing takes precedence');assert.equal(Gate.facing(data,Object.assign({},building,{wallFacing:opposite})),opposite,'explicit draft facing takes precedence');
 }
});

test('explicit migration updates prefab, embedded template and authored walls atomically, preserves everything else, and is repeatable without writes',()=>{
 const f=fixture(),before=new Map(),planned=Migration.plan(f.directory);assert.equal(planned.writes.length,4);assert.equal(planned.converted.length,14);
 for(const file of Object.keys(planned.originals))before.set(file,fs.readFileSync(path.join(f.directory,file)));
 for(const [file,bytes]of before)assert(fs.readFileSync(path.join(f.directory,file)).equals(bytes),'dry-run leaves '+file+' untouched');
 for(const entry of planned.writes){const edits=JSONDoc.diff(JSON.parse(before.get(entry.file)),JSON.parse(entry.bytes));assert(edits.length);assert(edits.every(edit=>['wallFacing','revision'].includes(edit.path.at(-1))),'migration changes metadata only');}
 const saved=Migration.run(f.directory,{write:true,artifacts:f.artifacts});assert(saved.written);assert.equal(saved.convertedWalls,14);assert(saved.backup.startsWith(f.artifacts+path.sep));
 for(const entry of planned.writes){assert(fs.readFileSync(path.join(f.directory,entry.file)).equals(entry.bytes));assert(fs.readFileSync(path.join(saved.backup,entry.file)).equals(before.get(entry.file)),'complete original backed up');}
 const stage=L.read(f.directory,'authoring/worlds/stages/A-1.json'),map=L.read(f.directory,'authoring/worlds/maps/Map01.json'),source=L.read(f.directory,'assets/KinghtFallIconMap/Map01.prefab'),revision=L.hash(fs.readFileSync(path.join(f.directory,'assets/KinghtFallIconMap/Map01.prefab')));
 assert.deepEqual(stage.buildings.map(building=>building.wallFacing),['NW','NE']);assert(stage.buildings.every(building=>building.template.revision===revision));assert.equal(map.legacy.revision,revision);assert.equal(map.historical.revision,'already-stale');
 for(const building of stage.buildings){assert.equal(Gate.project(source,building),source,'tagged closed geometry is already correct');assert.equal(Gate.project(stage.templates.Map01,building),stage.templates.Map01,'embedded template cannot reintroduce legacy geometry');}
 assert.equal(Migration.plan(f.directory).writes.length,0);const second=Migration.run(f.directory,{write:true,artifacts:f.artifacts});assert.equal(second.written,false);assert.deepEqual(second.changedFiles,[]);
 assert(fs.readFileSync(path.join(f.directory,'authoring/worlds/library/manifest.json')).equals(before.get('authoring/worlds/library/manifest.json')));
});

test('wall migration refuses concurrent source edits and creates no partial result',()=>{
 const f=fixture(),planned=Migration.plan(f.directory),file='authoring/worlds/stages/A-1.json',bytes=fs.readFileSync(path.join(f.directory,file));write(f.directory,file,bytes.toString()+'\n');
 const service=new(require('../worlds/service').Service)(f.directory,{artifacts:f.artifacts});assert.throws(()=>service.commit(planned.writes,planned.originals),/Concurrent change/);
 for(const entry of planned.writes.filter(entry=>entry.file!==file))assert.equal(L.hash(fs.readFileSync(path.join(f.directory,entry.file))),planned.originals[entry.file],'concurrent failure changes no other file');
});
