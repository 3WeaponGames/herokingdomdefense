'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../worlds/model'),P=require('../worlds/prefab'),L=require('../worlds/legacy'),Maps=require('../lib/map-assets'),{tree}=require('../worlds/service'),temporary=require('./owned-temp');
function fixture(){
 const root=temporary('hkd-stage-routes-'),write=(file,value)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(value));};
 write('assets/_script/AuthoredStagePaths.js.meta',{uuid:'11111111-1111-4111-a111-111111111111'});write('assets/_script/KinghtFallCommerce.js.meta',{uuid:'22222222-2222-4222-a222-222222222222'});
 const map=M.createMap('Map01','Map','forest'),graph={id:'custom/path',name:'My route',spawnIds:[1,4],entry:'start',nodes:[{id:'start',x:10,y:20,future:{keep:1}},{id:'goal',x:30,y:40,goal:true}],edges:[{id:'branch',from:'start',to:'goal',weight:7,future:{keep:2}}],future:{keep:[1,2]}},stage={id:'A-1',variant:'A',level:1,buildings:[],specials:[],hero:{x:0,y:0},spawns:[{id:1,name:'North lane',enabled:true,x:10,y:20,future:{keep:3}},{id:4,name:'Parked lane',enabled:false,x:50,y:60,future:{keep:4}}],graphs:[graph]};
 const data=P.compact(P.compose(root,map,stage,{ground:[],assets:{}},{})),file='assets/KinghtFallIconMap/Generated/Stages/A-1.prefab',config={Level:1,prefab:'Generated/Stages/A-1',EnvironmentMapId:'Map01',WaveCfg:[]};write(file,data);return{root,write,map,stage,data,file,config};
}
test('generated stage fallback restores authored routes and disabled lane metadata without writes',()=>{
 const f=fixture(),before=tree(f.root),stage=L.adaptStage(f.root,'A',1,f.config);
 assert.deepEqual(stage.graphs,f.stage.graphs);assert.deepEqual(stage.spawns,f.stage.spawns);assert.equal(stage.nextSpawn,5);assert.deepEqual(stage.hero,f.stage.hero);assert.equal(stage.mapId,'Map01');assert.deepEqual(tree(f.root),before);
 const holder=Maps.model(f.data).nodes.find(n=>n.name==='Authored routes'),metadata=holder.components.find(c=>c.value.__type__===L.script(f.root,'AuthoredStagePaths')).value;assert.equal(JSON.parse(metadata.spawns).length,2);
 // Disabled metadata does not create an active runtime spawn marker.
 assert.deepEqual(Maps.model(f.data).nodes.filter(n=>n.kind==='spawn').map(n=>n.lane),[1]);
});
test('fallback respects explicit native route and spawn moves while retaining authored branch/unknown fields',()=>{
 const f=fixture(),info=Maps.model(f.data),point=info.nodes.find(n=>n.name===require('../../../assets/_script/AuthoredSpawnPlan').pointName(f.stage.graphs[0].id,'start')),spawn=info.nodes.find(n=>n.kind==='spawn');f.data[point.id]._trs.array[0]+=12;f.data[spawn.id]._trs.array[1]+=13;f.write(f.file,f.data);const before=tree(f.root),stage=L.adaptStage(f.root,'A',1,f.config);
 assert.equal(stage.graphs[0].nodes[0].x,22);assert.equal(stage.spawns[0].y,33);assert.equal(stage.spawns[0].name,'North lane');assert.deepEqual(stage.graphs[0].edges,f.stage.graphs[0].edges);assert.deepEqual(stage.graphs[0].future,f.stage.graphs[0].future);assert.deepEqual(tree(f.root),before);
});
test('invalid authored JSON fails explicitly rather than silently replacing routes with empty legacy graphs',()=>{
 const f=fixture(),info=Maps.model(f.data),holder=info.nodes.find(n=>n.name==='Authored routes'),component=holder.components.find(c=>c.value.__type__===L.script(f.root,'AuthoredStagePaths'));f.data[component.id].graphs='{broken';f.write(f.file,f.data);const before=tree(f.root);
 assert.throws(()=>L.adaptStage(f.root,'A',1,f.config),/authored route metadata is invalid JSON/);assert.deepEqual(tree(f.root),before);
});
test('spawn circles and optional path widths survive prefab round trips without rewriting source positions or unknown fields',()=>{
 const f=fixture();f.stage.spawns[0].radius=82;f.stage.graphs[0].spread=45;
 const data=P.compact(P.compose(f.root,f.map,f.stage,{ground:[],assets:{}},{}));f.write(f.file,data);const before=tree(f.root),loaded=L.adaptStage(f.root,'A',1,f.config);
 assert.deepEqual(loaded.spawns,f.stage.spawns);assert.deepEqual(loaded.graphs,f.stage.graphs);assert.deepEqual(tree(f.root),before);
 const node=Maps.model(data).nodes.find(n=>n.kind==='spawn');assert.deepEqual(node.position,{x:10,y:20});
});

test('disabled building records and their path conditions survive export and recovery without runtime nodes',()=>{
 const f=fixture(),building={id:13,name:'Parked house',kind:4,x:50,y:70,scale:1,angle:0,unlock:1,enabled:false,template:{prefab:'Map01',node:42,roots:[42]},future:{keep:[1,2]}},before=M.clone(building);
 f.stage.buildings=[building];f.stage.config=M.clone(f.config);f.stage.config.HomeLevel1Unlock=[[4,13]];f.stage.graphs[0].requiresAnyBuilding=[13];
 const exported=P.compact(P.compose(f.root,f.map,f.stage,{ground:[],assets:{}},{}));f.write(f.file,exported);const bytes=tree(f.root),loaded=L.adaptStage(f.root,'A',1,f.config);
 assert.deepEqual(loaded.buildings,[before]);assert.deepEqual(loaded.graphs,f.stage.graphs);assert.equal(loaded.nextBuilding,14);assert.equal(loaded.buildings[0].enabled,false);
 assert.equal(Maps.model(exported).owners.filter(n=>n.kind==='building').length,0);assert(!Object.values(P.unlocks(f.stage)).some(rows=>rows.some(pair=>pair[1]===13)));
 assert.deepEqual(tree(f.root),bytes,'Inspecting/recovering performs no writes');
 const roundtrip=P.compact(P.compose(f.root,f.map,loaded,{ground:[],assets:{}},{}));f.write(f.file,roundtrip);assert.deepEqual(L.adaptStage(f.root,'A',1,f.config).buildings,[before]);assert.deepEqual(building,before);
});

test('an actual native building wins over stale disabled metadata with the same ID',()=>{
 const f=fixture(),names=['KinghtFallBuildMainFortress','KinghtFallBuildBartizan','KinghtFallBuildBarracks','KinghtFallBuildHome','KinghtFallBuildMill','KinghtFallBuildWall'];
 for(const name of names){const file='assets/_script/'+name+'.js.meta';f.write(file,JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../..',file),'utf8')));}
 f.stage.buildings=[{id:13,name:'Old disabled house',kind:4,x:0,y:0,enabled:false,future:{keep:1}}];
 const data=P.compact(P.compose(f.root,f.map,f.stage,{ground:[],assets:{}},{})),main=Maps.model(data).roots.ndMain,id=P.append(data,'Native house',main,77,88);
 P.component(data,id,{__type__:L.script(f.root,'KinghtFallBuildHome'),ID:13,ndAniMain:{__id__:id}});f.write(f.file,data);f.config.HomeLevel1Unlock=[[4,13]];
 const before=tree(f.root),loaded=L.adaptStage(f.root,'A',1,f.config);assert.equal(loaded.buildings.length,1);assert.equal(loaded.buildings[0].enabled,true);assert.equal(loaded.buildings[0].x,77);assert.equal(loaded.buildings[0].y,88);assert.equal(loaded.buildings[0].future,undefined);assert.deepEqual(tree(f.root),before);
});

test('invalid disabled building metadata fails explicitly without normalizing or writing its source',()=>{
 for(const value of ['{broken','null','{}','[{"id":13,"kind":4,"enabled":true}]','[{"id":0,"kind":4,"enabled":false}]','[{"id":13,"kind":4,"enabled":false},{"id":13,"kind":4,"enabled":false}]']){
  const f=fixture(),holder=Maps.model(f.data).nodes.find(n=>n.name==='Authored routes'),component=holder.components.find(c=>c.value.__type__===L.script(f.root,'AuthoredStagePaths')).value;component.disabledBuildings=value;f.write(f.file,f.data);const before=tree(f.root);
  assert.throws(()=>L.adaptStage(f.root,'A',1,f.config),/authored route metadata|disabled building metadata/);assert.deepEqual(tree(f.root),before);
 }
});

test('parked all-zero legacy route conditions survive prefab round trips byte-for-byte',()=>{
 const f=fixture(),parked=M.clone(f.stage.graphs[0]);Object.assign(parked,{id:'parked',legacy:true,requiresAnyBuilding:Array(10).fill(0),future:{keep:[1,2]}});f.stage.graphs.push(parked);
 const data=P.compact(P.compose(f.root,f.map,f.stage,{ground:[],assets:{}},{}));f.write(f.file,data);const before=tree(f.root),loaded=L.adaptStage(f.root,'A',1,f.config);
 assert.deepEqual(loaded.graphs,f.stage.graphs);assert.equal(M.legacyUnavailable(loaded.graphs[1]),true);assert.deepEqual(tree(f.root),before);
 const again=P.compact(P.compose(f.root,f.map,loaded,{ground:[],assets:{}},{}));assert.deepEqual(again,data);
});
