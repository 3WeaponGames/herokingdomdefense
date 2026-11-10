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
