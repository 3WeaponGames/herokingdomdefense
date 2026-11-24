'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const M=require('../worlds/model'),L=require('../worlds/legacy'),P=require('../worlds/prefab'),{Service,fingerprint,tree}=require('../worlds/service'),Plan=require('../../../assets/_script/AuthoredSpawnPlan'),Maps=require('../lib/map-assets'),temp=require('./owned-temp');
const root=path.resolve(__dirname,'../../..'),clone=M.clone,emptyBake={ground:[],assets:{}};
test('world authoring: multi-frame atlases use a raw texture plus a portable Texture Packer plist',()=>{const B=require('../worlds/baker'),result=B.packageResult({id:'map-test'},{files:[{name:'objects-0',width:64,height:32,png:'data:image/png;base64,AA=='}],ground:[],assets:{stone:{frames:[{name:'stone-a',atlas:'objects-0',trimX:2,trimY:2,width:12,height:10,x:0,y:0},{name:'stone-b',atlas:'objects-0',trimX:18,trimY:2,width:12,height:10,x:0,y:0}]}}});const texture=JSON.parse(result.writes.find(w=>w.file.endsWith('.png.meta')).bytes),atlas=JSON.parse(result.writes.find(w=>w.file.endsWith('.plist.meta')).bytes),plist=result.writes.find(w=>w.file.endsWith('.plist')).bytes.toString();assert.equal(texture.type,'raw');assert.deepEqual(texture.subMetas,{});assert.equal(atlas.type,'Texture Packer');assert.equal(Object.keys(atlas.subMetas).length,2);assert.equal(atlas.rawTextureUuid,texture.uuid);assert(plist.includes('{{18,2},{12,10}}'));assert.equal(result.assets.stone.frames[1].frameUuid,atlas.subMetas['stone-b'].uuid);});
test('world authoring: route point names are Creator-safe and unambiguous',()=>{assert(!Plan.pointName('route/a','node/b').includes('/'));assert.notEqual(Plan.pointName('a--b','c'),Plan.pointName('a','b--c'));});
test('world authoring: an unavailable conditional override uses the spawn fallback',()=>{const nodes=[{id:'a',x:0,y:0},{id:'z',x:1,y:1,goal:true}],edges=[{id:'e',from:'a',to:'z',weight:1}],fallback={id:'fallback',entry:'a',spawnIds:[1],nodes,edges},conditional=Object.assign({},fallback,{id:'wall-path',requiresAnyBuilding:[8]});assert.equal(Plan.route([fallback,conditional],1,[],'wall-path',()=>0)[0].graphId,'fallback');assert.equal(Plan.route([fallback,conditional],1,[8],'wall-path',()=>0)[0].graphId,'wall-path');});
test('world authoring: read-only legacy adapters preserve every stage config and gameplay family',()=>{const index=L.index(root);assert.equal(index.library.length>=257,true);assert.equal(new Set(index.library.flatMap(a=>a.biomes)).size,8);index.library.forEach(a=>assert(fs.existsSync(require('url').fileURLToPath(a.url))));for(const map of index.maps){const source=L.inspect(root,map.id),adapted=L.adaptMap(root,map.id,map);assert.equal(JSON.stringify(source.data),JSON.stringify(adapted.legacyData));assert.deepEqual(M.validateMap(adapted,index.library.reduce((o,a)=>(o[a.id]=a,o),{})),[]);const result=P.replaceEnvironment(root,source.data,adapted,emptyBake),after=Maps.model(result);for(const b of source.info.owners.filter(n=>n.kind==='building'))assert.deepEqual(after.byId[b.id].position,b.position);assert.equal(after.routes.length,source.info.routes.length);assert.equal(after.owners.filter(n=>n.kind==='obstacle').length,source.info.owners.filter(n=>n.kind==='obstacle').length);const second=P.replaceEnvironment(root,result,adapted,emptyBake);assert.equal(second.length,result.length,'environment saves must recycle serialized slots');}for(const v of ['A'])for(const config of index.documents[v].LevelCfg){const stage=L.adaptStage(root,v,config.Level,config);assert.deepEqual(stage.config,config);assert.equal(stage.buildings.filter(b=>b.kind===1).length,1);assert(stage.spawns.every(s=>stage.graphs.some(g=>g.spawnIds.includes(s.id))));}});
test('world authoring: placement resolves random scale once; layer transfer preserves world transforms',()=>{let map=M.createMap('map','Map','lava');map=M.createLayer(map,'Cliff');map.layers[0].transform={x:20,y:40,scale:2,angle:30};map.layers[1].transform={x:-60,y:10,scale:.7,angle:-15};const placed=M.place(map,'grass-detail',{id:'stone',name:'Stone',depth:'world'},{x:130,y:50},1,2,.45);assert.equal(placed.object.scale,1.45);const before=M.toWorld(placed.map.layers[0].transform,placed.object);const moved=M.moveObjectToLayer(placed.map,placed.object.id,map.layers[1].id),o=moved.layers[1].objects[0],after=M.toWorld(moved.layers[1].transform,o);assert(Math.hypot(before.x-after.x,before.y-after.y)<1e-8);assert(Math.abs(o.scale*.7-placed.object.scale*2)<1e-8);assert.throws(()=>M.place(map,'grass-detail',{id:'x'},{x:0,y:0},2,1),/range/);assert(!M.removeLayer(map,'grass-detail').layers.some(l=>l.id==='grass-detail'));});
test('world authoring: blocker erase makes a navigable hole; merged polygons retain coverage and layer motion',()=>{const paint={size:100,shape:'square',op:'paint',points:[{x:0,y:0}]},erase={size:40,shape:'square',op:'erase',points:[{x:0,y:0}]},cells=M.blockerCells([paint,erase]);assert(!cells.has('0:0'));assert(cells.has('2:2'));const merged=M.mergeCells(cells),area=merged.reduce((a,p)=>a+(p[1].x-p[0].x)*(p[2].y-p[1].y),0);assert.equal(area,cells.size*400);let map=M.createLayer(M.createMap('m','M','forest'),'Cliff');map=M.stroke(map,map.layers[1].id,paint);map=M.stroke(map,map.layers[1].id,erase);const original=M.blockerPolygons(map);map.layers[1].transform.x=150;assert.equal(M.blockerPolygons(map)[0].points[0].x,original[0].points[0].x+150);});
test('world authoring: timed groups overlap, catch up with simulation time, and hold wave completion',()=>{const t=new Plan.Timeline([{spawnId:1,unitId:4,count:3,startSeconds:2,intervalSeconds:.5},{spawnId:2,unitId:5,count:1,startSeconds:10,intervalSeconds:1}]),out=[];t.advance(1,(...a)=>out.push(a));assert.equal(out.length,0);t.advance(1,(...a)=>out.push(a));assert.equal(out.length,1);t.advance(2,(...a)=>out.push(a));assert.equal(out.length,3);assert(t.pending());t.advance(6,(...a)=>out.push(a));assert.equal(out.length,4);assert(!t.pending());assert.equal(t.elapsed,10);const converted=M.legacyTimeline(['1#10,2;-1,3;11,1'],.5);assert.deepEqual(converted.map(e=>[e.unitId,e.count,e.startSeconds]),[[10,2,.5],[11,1,3]]);});
test('world authoring: weighted DAG forks, conditions, rejoin and goals resolve without enumerating full paths',()=>{const graph={id:'g',entry:'a',spawnIds:[1],nodes:[{id:'a',x:0,y:0},{id:'b',x:1,y:1},{id:'c',x:2,y:1},{id:'d',x:1,y:2,goal:true}],edges:[{id:'1',from:'a',to:'b',weight:1},{id:'2',from:'a',to:'c',weight:3,requiresAnyBuilding:[8]},{id:'3',from:'b',to:'d',weight:1},{id:'4',from:'c',to:'d',weight:1}]};assert.deepEqual(M.graphIssues(graph,new Set([1]),new Set([8])),[]);assert.deepEqual(Plan.route([graph],1,[],null,()=>.9).map(p=>p.nodeId),['a','b','d']);assert.deepEqual(Plan.route([graph],1,[8],null,()=>.9).map(p=>p.nodeId),['a','c','d']);const cyclic=clone(graph);cyclic.edges.push({id:'5',from:'d',to:'a',weight:1});assert(M.graphIssues(cyclic).some(i=>i.includes('loops')));const dead=clone(graph);dead.nodes.find(n=>n.id==='d').goal=false;assert(M.graphIssues(dead).some(i=>i.includes('goal')));});
test('world authoring: optional and duplicate offers share claim visibility',()=>{const offer=()=>({node:{active:true},init(v){this.level=v;},getInClick(){return true;}}),first=offer(),second=offer();assert.equal(Plan.offers(null,first),first);const group=Plan.offers(first,second);group.init(2);assert.equal(first.level,2);assert.equal(second.level,2);assert(group.getInClick({x:0,y:0},1));group.node.active=false;assert.equal(first.node.active,false);assert.equal(second.node.active,false);assert(!group.getInClick({},1));});
test('world authoring: custom ground layers retain images, transforms, masks and fixed foundation ordering',()=>{let map=M.createMap('ground','Ground','forest');map=M.createGroundLayer(map,'Blended river','foundation');const layer=map.ground.custom[0];assert.deepEqual(map.ground.order,['foundation',layer.id,'roads','grass']);const placed=M.placeGroundImage(map,layer.id,{id:'river',name:'River'},{x:40,y:-60});map=placed.map;const image=M.groundImage(map,placed.object.id).object;image.scale=2.5;image.angle=35;image.mask=[{size:40,hardness:.2,opacity:.5,op:'erase',points:[{x:0,y:0}]}];map=M.stroke(map,layer.id,{size:70,hardness:0,opacity:.5,op:'erase',points:[{x:5,y:6}]});assert.equal(M.groundLayer(map,layer.id).strokes[0].opacity,.5);assert.equal(M.groundImage(map,image.id).object.scale,2.5);assert.deepEqual(M.validateMap(map,{river:{id:'river'}}),[]);const removed=M.removeGroundLayer(map,layer.id);assert(!M.groundImage(removed,image.id));assert.throws(()=>M.removeGroundLayer(map,'foundation'),/permanent/);assert(M.groundImage(map,image.id));});
test('world authoring: timeline HUD queues show future units and remove consumed groups',()=>{const timeline=new Plan.Timeline([{spawnId:40,unitId:5,count:2,startSeconds:10,intervalSeconds:1},{spawnId:40,unitId:4,count:1,startSeconds:2,intervalSeconds:.5}]);assert.deepEqual(timeline.queue()[40],[{id:4,num:1},{id:5,num:2}]);timeline.advance(2,()=>{});assert.deepEqual(timeline.queue()[40],[{id:5,num:2}]);timeline.advance(20,()=>{});assert.deepEqual(timeline.queue(),{});});
test('world authoring: legacy conversion retains the effective last queue per spawn without changing saved strings',()=>{const rows=['5#10,9','1#11,2;-1,3;12,1','5#13,4'],before=JSON.stringify(rows),entries=M.legacyTimeline(rows,.5);assert.deepEqual(entries.map(e=>[e.spawnId,e.unitId,e.count,e.startSeconds]),[[1,11,2,.5],[1,12,1,3],[5,13,4,.5]]);assert.equal(JSON.stringify(rows),before);const cfg=L.read(root,L.configFile('A'));for(const stage of cfg.LevelCfg)for(const wave of stage.WaveCfg){const effective={};wave.RefreshSoldierKind.forEach(row=>effective[row.split('#')[0]]=row.split('#')[1].split(';').map(p=>p.split(',').map(Number)).filter(p=>p[0]!==-1));const actual={};M.legacyTimeline(wave.RefreshSoldierKind,.5).forEach(e=>(actual[e.spawnId]||(actual[e.spawnId]=[])).push([e.unitId,e.count]));for(const id of Object.keys(effective))assert.deepEqual(actual[id]||[],effective[id]);}});
let fixtureImageFiles;
function copyFixtureImageMetadata(directory){if(!fixtureImageFiles)fixtureImageFiles=Array.from(new Set(Object.values(L.index(root).images).map(image=>require('url').fileURLToPath(image.url))));for(const source of fixtureImageFiles){const target=path.join(directory,path.relative(root,source));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source+'.meta',target+'.meta');fs.writeFileSync(target,Buffer.alloc(0));}}
function fixtureStagePrefabs(){const files=new Set(Maps.IDS.map(id=>'assets/KinghtFallIconMap/'+id+'.prefab'));for(const variant of ['A'])for(const stage of L.read(root,L.configFile(variant)).LevelCfg){files.add('assets/KinghtFallIconMap/'+stage.prefab+'.prefab');if(stage.StageThumbnail)files.add(require('../worlds/stage-thumbnails').filename(stage.StageThumbnail));const layout='authoring/worlds/stages/'+variant+'-'+stage.Level+'.json';if(fs.existsSync(path.join(root,layout))){files.add(layout);const map='authoring/worlds/maps/'+L.read(root,layout).mapId+'.json';if(fs.existsSync(path.join(root,map)))files.add(map);}}return Array.from(files).flatMap(file=>fs.existsSync(path.join(root,file+'.meta'))?[file,file+'.meta']:[file]);}
function linkedLegacyStage(service){const row=service.stageCatalog().find(stage=>stage.id.startsWith('A-')&&stage.mapId==='Map01');assert(row,'fixture requires an authored stage linked to legacy Map01');return service.snapshot('stage:'+row.id);}
// Unit fixtures use metadata and placeholder bytes; native canvas QA uses real PNG/JPEG data.
async function fixtureBake({map}){const assets={};for(const layer of map.layers)for(const object of layer.objects)if(!object.legacy)assets[require('../worlds/paint').assetKey(object)]={frames:[]};return{files:[],ground:[],assets};}

function fixture({legacyLink=false}={}){const directory=temp('hkd-world-project-'),artifacts=temp('hkd-world-artifacts-'),files=['assets/KinghtFallConfig/GameJsonCfg.json','assets/resources/localization/catalog.json','authoring/worlds/library/manifest.json'].concat(fixtureStagePrefabs());for(const file of files){fs.mkdirSync(path.dirname(path.join(directory,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(directory,file));}fs.mkdirSync(path.join(directory,'assets/_script'),{recursive:true});for(const name of fs.readdirSync(path.join(root,'assets/_script')).filter(n=>n.endsWith('.meta')))fs.copyFileSync(path.join(root,'assets/_script',name),path.join(directory,'assets/_script',name));copyFixtureImageMetadata(directory);
 if(legacyLink){
  const configFile=L.configFile('A'),config=L.read(directory,configFile),layoutFile='authoring/worlds/stages/A-17.json',layout=L.read(directory,layoutFile);
  config.LevelCfg.find(stage=>stage.Level===17).EnvironmentMapId='Map01';
  layout.mapId='Map01';layout.config.EnvironmentMapId='Map01';
  fs.writeFileSync(path.join(directory,configFile),JSON.stringify(config));
  fs.writeFileSync(path.join(directory,layoutFile),JSON.stringify(layout));
 }
 return {directory,artifacts,service:new Service(directory,{artifacts,render:fixtureBake})};}

test('the Silver offer schedule saves to the runtime prefab and reopens in the stage editor',async()=>{
 const f=fixture(),s=f.service,key='stage:A-1',file='assets/KinghtFallIconMap/Generated/Stages/A-1.prefab';
 const opened=s.snapshot(key),value=clone(opened.value),offers=value.specials.filter(offer=>offer.kind===0);
 assert.equal(offers.length,1);
 assert.equal(opened.dirty,false);
 const before=fingerprint(path.join(f.directory,file)),schedule={count:2,firstWave:4,interval:5};
 offers[0].silverSchedule=schedule;
 const draft=s.change({key,version:opened.version,value});
 assert.equal(draft.dirty,true);
 assert.equal(fingerprint(path.join(f.directory,file)),before);
 const saved=await s.save({key,version:draft.version});
 assert.equal(saved.result.saved,true);
 const fresh=new Service(f.directory,{artifacts:f.artifacts,render:fixtureBake}),restored=fresh.snapshot(key);
 assert.equal(restored.dirty,false);
 assert.deepEqual(restored.value.specials,value.specials);
 const scheduleFields=require('../../../assets/_script/SilverOfferSchedule');
 const componentId=L.script(f.directory,'KinghtFallCommerce');
 const points=L.read(f.directory,file).filter(component=>component&&component.__type__===componentId&&(component.ndType||0)===0);
 assert.equal(points.length,1);
 assert.deepEqual(scheduleFields.read(points[0]),schedule);
 const imported=L.adaptStage(f.directory,'A',1);
 assert.deepEqual(imported.specials.find(offer=>offer.kind===0).silverSchedule,schedule);
 const after=fingerprint(path.join(f.directory,file));
 const noop=await fresh.save({key,version:restored.version});
 assert.equal(noop.result.saved,false);
 assert.equal(fingerprint(path.join(f.directory,file)),after);
});

test('world authoring: river animation objects stay read-only until placement and survive draft history, Save and reopen',async()=>{
 const f=fixture();
 for(const file of ['assets/KinghtFallIconMap/Map01/Ani/Idle.anim','assets/KinghtFallIconMap/Map02/Ani/Idle1.anim']){const target=path.join(f.directory,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);fs.copyFileSync(path.join(root,file+'.meta'),target+'.meta');}
 const s=f.service,manifestFile=path.join(f.directory,'authoring/worlds/library/manifest.json'),manifestHash=fingerprint(manifestFile),configFile=path.join(f.directory,L.configFile('A')),configHash=fingerprint(configFile);
 const stock=s.index().library.filter(a=>a.animatedObject);assert.equal(stock.length,2);const opened=s.snapshot('map:Map01');assert(!opened.dirty);assert(!fs.existsSync(s.recovery));
 assert.equal((await s.save({key:opened.key,version:s.version})).result.saved,false);assert.equal(fingerprint(manifestFile),manifestHash);
 assert.throws(()=>require('../worlds/asset-management').inspect(s,{key:opened.key,version:s.version,assetId:stock[0].id}),/Built-in animation/);
 const created=s.create({version:s.version,name:'River test',biome:'forest'}),placed=M.place(created.value,created.value.layers[0].id,stock[0],{x:70,y:-80},1,1,0);placed.object.angle=25;placed.map.future={keep:true};
 s.change({key:created.key,version:s.version,value:placed.map});assert.equal(fingerprint(manifestFile),manifestHash);assert.equal(fingerprint(configFile),configHash);
 s.history({key:created.key,version:s.version},false);assert.equal(s.snapshot(created.key).value.layers[0].objects.length,0);
 s.history({key:created.key,version:s.version},true);assert.equal(s.snapshot(created.key).value.layers[0].objects[0].spriteAnimation.times.length,5);
 const saved=await s.save({key:created.key,version:s.version});assert(saved.result.saved);assert.equal(fingerprint(manifestFile),manifestHash);assert.equal(fingerprint(configFile),configHash);
 const fresh=new Service(f.directory,{artifacts:f.artifacts,render:fixtureBake}),reopened=fresh.snapshot(created.key),object=reopened.value.layers[0].objects[0];assert(!reopened.dirty);assert.equal(object.angle,25);assert.equal(object.animationPreset,stock[0].id);assert.deepEqual(reopened.value.future,{keep:true});assert.deepEqual(reopened.value.legacySources[object.legacy.sourceId],stock[0].animatedObject.source);
 const before=fingerprint(path.join(f.directory,'authoring/worlds/maps/'+reopened.value.id+'.json'));assert.equal((await fresh.save({key:created.key,version:fresh.version})).result.saved,false);assert.equal(fingerprint(path.join(f.directory,'authoring/worlds/maps/'+reopened.value.id+'.json')),before);
});

test('world authoring: stage card order and spawn timing round-trip through draft history, Save and reopen',async()=>{
 const Order=require('../worlds/stage-card-order'),Names=require('../worlds/stage-names'),Waves=require('../worlds/wave-editor'),f=fixture(),s=f.service;
 const configFile=path.join(f.directory,L.configFile('A')),configBefore=L.read(f.directory,L.configFile('A')),configHash=fingerprint(configFile),snap=s.snapshot('stage:A-2');
 assert(!snap.dirty);assert(snap.value.graphs.filter(graph=>graph.legacy).every(graph=>!/^Path\d+(?:_\d+)*$/.test(graph.name)));
 assert(snap.value.buildings.filter(building=>building.kind===2).every(building=>building.name.startsWith('Tower ')));
 const noop=await s.save({key:snap.key,version:s.version});assert.equal(noop.result.saved,false);assert.equal(fingerprint(configFile),configHash);assert(!fs.existsSync(s.recovery));
 const value=clone(snap.value),originalGraphs=clone(value.graphs),originalBuildingIds=value.buildings.map(building=>building.id);
 assert(Order.move(value.graphs,value.graphs.at(-1).id,value.graphs[0].id,false));
 assert(Order.move(value.buildings,value.buildings.at(-1).id,value.buildings[0].id,false));
 const interval=Number(configBefore.ParameterCfg['60018'].Value)||.5;
 const waveCards=wave=>Waves.unitGroups(Waves.entries(wave,interval),wave.editorUnitOrder).map(group=>group[0].id);
 const waveIndex=value.config.WaveCfg.findIndex(wave=>waveCards(wave).length>1);
 assert(waveIndex>=0,'The stage has a wave with multiple unit cards');
 const entry=Waves.entries(value.config.WaveCfg[waveIndex],interval)[0];
 Waves.setSpawnTiming(value,entry.spawnId,'startSeconds',2);
 Waves.setSpawnTiming(value,entry.spawnId,'intervalSeconds',1);
 Waves.applySpawnDefaults(value,entry.spawnId,interval);
 const timed=value.config.WaveCfg[waveIndex].SpawnTimeline.find(row=>row.id===entry.id);
 assert.deepEqual([timed.startSeconds,timed.intervalSeconds],[2,1]);
 const expectedWaves=clone(value.config.WaveCfg),cards=waveCards(expectedWaves[waveIndex]);
 const unitOrder=[cards.at(-1),...cards.slice(0,-1)];
 expectedWaves[waveIndex].editorUnitOrder=unitOrder;
 assert(Waves.moveGroup(value,waveIndex,cards.at(-1),cards[0],false,interval));
 assert.deepEqual(value.config.WaveCfg,expectedWaves);
 value.spawns[0].name='North entrance';Names.refreshPaths(value);
 const pathOrder=Order.ordered(value.graphs).map(graph=>graph.id),buildingOrder=Order.ordered(value.buildings).map(building=>building.id),spawnId=value.spawns[0].id;
 assert(value.graphs.filter(graph=>graph.nameFromSpawns&&graph.spawnIds.includes(spawnId)).every(graph=>graph.name.includes('North entrance')));
 for(const random of [0,.17,.5,.99])assert.deepEqual(Plan.route(value.graphs,spawnId,[],null,()=>random),Plan.route(originalGraphs,spawnId,[],null,()=>random));
 s.change({key:snap.key,version:s.version,value});s.history({key:snap.key,version:s.version},false);assert.deepEqual(s.snapshot(snap.key).value,snap.value);
 s.history({key:snap.key,version:s.version},true);
 const redone=s.snapshot(snap.key).value;
 assert.deepEqual(Order.ordered(redone.graphs).map(graph=>graph.id),pathOrder);
 assert.deepEqual(waveCards(redone.config.WaveCfg[waveIndex]),unitOrder);
 const saved=await s.save({key:snap.key,version:s.version});assert(saved.result.saved);
 const actual=L.read(f.directory,'authoring/worlds/stages/A-2.json');assert.deepEqual(actual.graphs.map(graph=>graph.id),originalGraphs.map(graph=>graph.id));assert.deepEqual(actual.buildings.map(building=>building.id),originalBuildingIds);
 assert.deepEqual(Order.ordered(actual.graphs).map(graph=>graph.id),pathOrder);assert.deepEqual(Order.ordered(actual.buildings).map(building=>building.id),buildingOrder);
 const fresh=new Service(f.directory,{artifacts:f.artifacts,render:fixtureBake}),opened=fresh.snapshot(snap.key);assert(!opened.dirty);
 assert.deepEqual(Order.ordered(opened.value.graphs).map(graph=>graph.id),pathOrder);assert.deepEqual(Order.ordered(opened.value.buildings).map(building=>building.id),buildingOrder);
 assert.deepEqual(opened.value.graphs.map(graph=>graph.name),actual.graphs.map(graph=>graph.name));
 assert.deepEqual(waveCards(opened.value.config.WaveCfg[waveIndex]),unitOrder);
 assert.deepEqual(opened.value.spawns.find(spawn=>spawn.id===entry.spawnId).defaultTiming,{startSeconds:2,intervalSeconds:1});
 const layout=path.join(f.directory,'authoring/worlds/stages/A-2.json'),layoutHash=fingerprint(layout),again=await fresh.save({key:snap.key,version:fresh.version});assert.equal(again.result.saved,false);assert.equal(fingerprint(layout),layoutHash);
 const configAfter=L.read(f.directory,L.configFile('A'));for(const key of Object.keys(configBefore).filter(key=>key!=='LevelCfg'))assert.deepEqual(configAfter[key],configBefore[key]);
 assert.deepEqual(configAfter.LevelCfg.find(stage=>stage.Level===value.level).WaveCfg,expectedWaves);
});

test('world authoring: global vector blocker holes survive explicit save, native prefab export, reopen and no-op Save',async()=>{const f=fixture(),s=f.service,snap=s.snapshot('map:Map01'),baseline=L.read(f.directory,L.configFile('A'));let map=M.createLayer(snap.value,'Editable cliff'),layer=map.layers[map.layers.length-1];layer.FutureField={keep:17};layer.transform={x:56,y:-32,scale:1.25,angle:27};layer.polygons=[[{x:-100,y:-60},{x:100,y:-60},{x:100,y:60},{x:-100,y:60}]];const center=M.toWorld(layer.transform,{x:0,y:0});map.blockerMask=[];map=M.polygonBlockers(map,layer.polygons[0].map(p=>M.toWorld(layer.transform,p)),'paint');map=M.stroke(map,M.MAP_BLOCKERS,{size:30,shape:'square',op:'erase',points:[center]});const expectedMask=clone(map.blockerMask),expected=clone(map.layers[map.layers.length-1]),source='assets/KinghtFallIconMap/Map01.prefab',before=fingerprint(path.join(f.directory,source));s.change({key:snap.key,version:s.version,value:map});assert.equal(fingerprint(path.join(f.directory,source)),before);await s.save({key:snap.key,version:s.version});const saved=L.read(f.directory,source),info=Maps.model(saved),owners=info.nodes.filter(n=>n.name==='Blocker '+M.MAP_BLOCKERS);assert(owners.length);const colliders=info.colliders.filter(c=>owners.some(owner=>c.node===owner.id));assert.equal(colliders.length,8);const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0))/2;assert(Math.abs(colliders.reduce((sum,c)=>sum+area(c.points),0)-(200*120*1.25*1.25-30*30))<.1,'global rotated outer mask retains exactly its square hole area');assert(!colliders.some(c=>M.pointInPolygon(center,c.points)));assert(colliders.some(c=>M.pointInPolygon(M.toWorld(layer.transform,{x:50,y:0}),c.points)));const cfg=L.read(f.directory,L.configFile('A'));for(const key of Object.keys(baseline).filter(k=>k!=='LevelCfg'))assert.deepEqual(cfg[key],baseline[key]);const fresh=new Service(f.directory,{artifacts:f.artifacts,render:async()=>({files:[],ground:[],assets:{}})}),opened=fresh.snapshot(snap.key),actual=opened.value.layers.find(l=>l.id===layer.id);assert.deepEqual(actual,expected);assert.deepEqual(opened.value.blockerMask,expectedMask);assert.deepEqual(opened.issues,[]);const hash=fingerprint(path.join(f.directory,source)),noop=await fresh.save({key:snap.key,version:fresh.version});assert(!noop.result.saved);assert.deepEqual(noop.result.files,[]);assert.equal(fingerprint(path.join(f.directory,source)),hash);});
test('world authoring: open and no-op save write nothing; scoped undo and save preserve unrelated config fields',async()=>{const f=fixture(),s=f.service,source='assets/KinghtFallConfig/GameJsonCfg.json',before=fingerprint(path.join(f.directory,source));const snap=s.snapshot('stage:A-1');assert(!snap.dirty);const noop=await s.save({key:snap.key,version:s.version});assert(!noop.result.saved);assert(!fs.existsSync(f.artifacts+'/drafts.json'));assert.equal(fingerprint(path.join(f.directory,source)),before);const value=clone(snap.value);value.hero.x+=20;value.config.CustomUnknown={preserved:true};s.change({key:snap.key,version:s.version,value});assert(fs.existsSync(f.artifacts+'/drafts.json'));s.history({key:snap.key,version:s.version},false);assert(!s.snapshot(snap.key).dirty);s.history({key:snap.key,version:s.version},true);const saved=await s.save({key:snap.key,version:s.version});assert(saved.result.saved);const cfg=L.read(f.directory,source),old=L.read(root,source);assert.deepEqual(cfg.LevelCfg[0].CustomUnknown,{preserved:true});assert.deepEqual(cfg.LevelCfg.slice(1),old.LevelCfg.slice(1));for(const key of Object.keys(old).filter(k=>k!=='LevelCfg'))assert.deepEqual(cfg[key],old[key]);assert.equal(cfg.LevelCfg[0].prefab,'Generated/Stages/A-1');const output=L.read(f.directory,'assets/KinghtFallIconMap/Generated/Stages/A-1.prefab'),model=Maps.model(output);assert.equal(model.owners.filter(n=>n.kind==='building').length,value.buildings.filter(b=>b.enabled!==false).length);assert(model.nodes.some(n=>n.name==='Authored routes'));assert(!s.snapshot(snap.key).dirty);const hash=fingerprint(path.join(f.directory,source));await s.save({key:snap.key,version:s.version});assert.equal(hash,fingerprint(path.join(f.directory,source)));});
test('a Units attack draft can save after Stages & Waves publishes a new wave count',async()=>{
 const f=fixture(),worlds=f.service,source=L.configFile('A'),filename=path.join(f.directory,source);
 const {Store}=require('../lib/store'),Schema=require('../lib/schema'),Waves=require('../worlds/wave-editor');
 const store=new Store(f.directory,{validators:[Schema.validate],backupRoot:path.join(f.artifacts,'unit-saves')});
 const snap=worlds.snapshot('stage:A-1'),value=clone(snap.value);
 const group=Waves.entries(value.config.WaveCfg[0],.5)[0],count=group.count+1;
 Waves.editGroup(value,0,group.id,{count},.5);
 worlds.change({key:snap.key,version:snap.version,value});
 const unitId=String(group.unitId),attack={delivery:'melee',pattern:'single',onHit:{lifeSteal:{percent:.2}}};
 const before=fs.readFileSync(filename);
 store.change({version:store.version,edits:[{doc:'A',path:['SoldierCfg',unitId,'UnitAttack'],value:attack}]});
 assert.deepEqual(fs.readFileSync(filename),before);
 const waveSave=await worlds.save({key:snap.key,version:worlds.version});
 assert(waveSave.result.files.includes(source));
 const afterWave=fs.readFileSync(filename),expected=JSON.parse(afterWave);
 assert.equal(expected.LevelCfg[0].WaveCfg[0].SpawnTimeline[0].count,count);
 expected.SoldierCfg[unitId].UnitAttack=attack;
 const unitSave=store.save({version:store.version});
 assert.equal(unitSave.result.saved,true);
 assert.deepEqual(fs.readFileSync(path.join(unitSave.result.backup,source)),afterWave);
 assert.deepEqual(L.read(f.directory,source),expected);
 assert.equal(store.snapshot().dirty,false);
});
test('world authoring: conflicting edits to the same source field fail without partial writes and retain the draft',async()=>{
 const f=fixture(),s=f.service,snap=s.snapshot('stage:A-1'),value=clone(snap.value);
 const layout=path.join(f.directory,'authoring/worlds/stages/A-1.json'),layoutBefore=fingerprint(layout);
 value.hero.x+=10;value.config.InGameCoefficient+=.2;
 s.change({key:snap.key,version:s.version,value});
 const file=path.join(f.directory,L.configFile('A')),cfg=JSON.parse(fs.readFileSync(file));
 cfg.LevelCfg[0].InGameCoefficient+=.1;fs.writeFileSync(file,JSON.stringify(cfg));
 const before=fingerprint(file);
 await assert.rejects(s.save({key:snap.key,version:s.version}),/changed on disk at InGameCoefficient/);
 assert.equal(fingerprint(file),before);
 assert.deepEqual(s.snapshot(snap.key).value,value);
 assert.equal(fingerprint(layout),layoutBefore,'a failed save must neither create nor change the authored layout');
});
test('world authoring: duplicate map save does not rewrite its source map; layer deletion is undoable',async()=>{const f=fixture(),s=f.service,source=path.join(f.directory,'assets/KinghtFallIconMap/Map01.prefab'),before=fingerprint(source);s.snapshot('map:Map01');const snap=s.create({version:s.version,copy:'Map01',name:'My forest'});assert(!snap.value.legacy);assert(snap.value.legacyData);const value=M.createLayer(snap.value,'Cliff');value.layers[value.layers.length-1].blockers=[{size:20,points:[{x:0,y:0}],op:'paint'}];s.change({key:snap.key,version:s.version,value});const layerId=value.layers[value.layers.length-1].id;s.change({key:snap.key,version:s.version,value:M.removeLayer(value,layerId)});s.history({key:snap.key,version:s.version},false);assert(s.snapshot(snap.key).value.layers.some(l=>l.id===layerId));await s.save({key:snap.key,version:s.version});assert.equal(fingerprint(source),before);});
test('world authoring: discarding a never-saved duplicate removes only its draft and library entry',()=>{const f=fixture(),s=f.service;s.snapshot('map:Map01');const created=s.create({version:s.version,copy:'Map01',name:'Discard me'}),result=s.discard({key:created.key,version:s.version});assert.equal(result.key,'map:Map01');assert(!result.dirty);assert(!s.catalog().maps.some(m=>m.id===created.value.id));assert(!fs.existsSync(path.join(f.directory,'authoring/worlds/maps',created.value.id+'.json')));});
test('world authoring: scoped undo stores small deltas and retains another document’s redo',()=>{const f=fixture(),s=f.service,map=s.snapshot('map:Map01'),stage=s.snapshot('stage:A-1'),m=clone(map.value),a=clone(stage.value);m.name='Edited';s.change({key:map.key,version:s.version,value:m});a.hero.x+=25;s.change({key:stage.key,version:s.version,value:a});s.history({key:stage.key,version:s.version},false);m.name='Edited again';s.change({key:map.key,version:s.version,value:m});assert(s.snapshot(stage.key).canRedo);s.history({key:stage.key,version:s.version},true);assert.equal(s.snapshot(stage.key).value.hero.x,a.hero.x);assert.equal(s.snapshot(map.key).value.name,'Edited again');assert(!M.hasGlobalBlockers(s.snapshot(map.key).value),'renaming retains the legacy collision data without creating a global mask');assert(JSON.stringify(s.undo).length<2048,'history stores small deltas without duplicating the immutable legacy prefab');assert.equal(s.undo.flatMap(item=>item.edits).filter(edit=>edit.path[0]==='blockerMask').length,0);});
test('world authoring: shared legacy biome saves update linked backdrops while retaining every wave and unlock',async()=>{const f=fixture({legacyLink:true});for(const variant of ['A']){const file=path.join(f.directory,L.configFile(variant)),config=L.read(f.directory,L.configFile(variant));for(const row of config.LevelCfg)delete row.EnvironmentBiomeOverride;fs.writeFileSync(file,JSON.stringify(config));}const s=f.service,stage=linkedLegacyStage(s),map=s.snapshot('map:Map01'),original=L.read(f.directory,L.configFile('A')),value=clone(map.value);value.biome='desert';s.change({key:map.key,version:s.version,value});await s.save({key:map.key,version:s.version});const cfg=L.read(f.directory,L.configFile('A'));for(let i=0;i<cfg.LevelCfg.length;i++){const before=original.LevelCfg[i],after=cfg.LevelCfg[i];if((before.EnvironmentMapId||before.prefab)!=='Map01'){assert.deepEqual(after,before);continue;}assert.equal(after.EnvironmentBiome,'desert');assert.equal(after.EnvironmentMapId,'Map01');for(const key of ['WaveCfg','HomeLevel1Unlock','HomeLevel2Unlock','HomeLevel3Unlock'])assert.deepEqual(after[key],before[key]);}assert.equal(s.snapshot(stage.key).value.config.EnvironmentBiome,'desert');const edit=clone(s.snapshot(stage.key).value);edit.hero.x+=20;s.change({key:stage.key,version:s.version,value:edit});await s.save({key:stage.key,version:s.version});assert(!s.snapshot(stage.key).dirty,'a clean linked stage must not conflict with our own map save');});
test('world authoring: explicit stage biomes survive map saves, stage saves and reopening',async()=>{
 const f=fixture({legacyLink:true}),s=f.service,key=linkedLegacyStage(s).key,stage=s.snapshot(key).value;
 stage.config.EnvironmentBiome='snow';stage.config.EnvironmentBiomeOverride=true;
 s.change({key,version:s.version,value:stage});await s.save({key,version:s.version});
 const map=s.snapshot('map:Map01').value;map.biome='desert';s.change({key:'map:Map01',version:s.version,value:map});await s.save({key:'map:Map01',version:s.version});
 const config=L.read(f.directory,L.configFile('A')).LevelCfg.find(row=>row.Level===stage.level);
 assert.equal(config.EnvironmentBiome,'snow');assert.equal(config.EnvironmentBiomeOverride,true);assert.deepEqual(config.WaveCfg,stage.config.WaveCfg);
 const edited=s.snapshot(key).value;edited.hero.x+=10;s.change({key,version:s.version,value:edited});await s.save({key,version:s.version});
 const fresh=new Service(f.directory,{artifacts:f.artifacts,render:fixtureBake}),reopened=fresh.snapshot(key);
 assert.equal(reopened.value.config.EnvironmentBiome,'snow');assert.equal(reopened.value.hero.x,edited.hero.x);
 const before=tree(f.directory);assert.equal((await fresh.save({key,version:fresh.version})).result.saved,false);assert.deepEqual(tree(f.directory),before);
});

test('world authoring: interrupted saves restore exact backups only after explicit recovery',()=>{const f=fixture(),file=L.configFile('A'),absolute=path.join(f.directory,file),before=fs.readFileSync(absolute),after=Buffer.from(before.toString().replace('"Level": 1','"Level": 1, "PartialSave": true')),folder=path.join(f.artifacts,'saves','qa-interrupted');fs.mkdirSync(path.dirname(path.join(folder,file)),{recursive:true});fs.writeFileSync(path.join(folder,file),before);fs.writeFileSync(absolute,after);fs.writeFileSync(path.join(folder,'journal.json'),JSON.stringify({status:'prepared',files:[{file,before:L.hash(before),after:L.hash(after),created:false}]}));const s=new Service(f.directory,{artifacts:f.artifacts}),snapshot=s.snapshot('stage:A-1');assert.equal(s.recoveries().length,1);assert.equal(fingerprint(absolute),L.hash(after),'opening must not restore automatically');const recovered=s.recover({key:snapshot.key,version:s.version});assert(recovered.result.recovered);assert.equal(fingerprint(absolute),L.hash(before));assert.equal(s.recoveries().length,0);assert(!recovered.dirty);});

test('world authoring audit: locked or hidden layers protect painting, images and decoration placement',()=>{
 let map=M.createGroundLayer(M.createLayer(M.createMap('guarded','Guarded','forest'),'Trees'),'River','roads');
 map.layers[1].locked=true;map.ground.custom[0].locked=true;
 const asset={id:'a',name:'A'},stroke={size:40,points:[{x:0,y:0}],op:'erase'};
 assert.throws(()=>M.place(map,map.layers[1].id,asset,{x:0,y:0},1,1),/unlock/);
 assert.throws(()=>M.placeGroundImage(map,map.ground.custom[0].id,asset,{x:0,y:0}),/unlock/);
 assert.throws(()=>M.stroke(map,map.ground.custom[0].id,stroke),/unlock/);
 map.ground.custom[0].locked=false;map.ground.custom[0].hidden=true;assert.throws(()=>M.stroke(map,map.ground.custom[0].id,stroke),/Show/);
});
test('world authoring audit: bulk duplication includes every selected object and image with independent masks',()=>{
 let map=M.createGroundLayer(M.createLayer(M.createMap('copies','Copies','forest'),'Trees'),'River','roads'),ids=[];
 for(let i=0;i<2;i++){const placed=M.place(map,map.layers[1].id,{id:'a',name:'Tree'},{x:i*80,y:0},1,1);map=placed.map;ids.push(placed.object.id);}
 const placed=M.placeGroundImage(map,map.ground.custom[0].id,{id:'b',name:'River'},{x:0,y:0});map=placed.map;ids.push(placed.object.id);placed.object.mask=[{size:20,op:'erase',points:[{x:1,y:2}]}];
 const result=M.duplicateObjects(map,ids);assert.equal(result.ids.length,3);assert.equal(new Set(result.ids.concat(ids)).size,6);assert.equal(result.map.layers[1].objects.length,4);assert.equal(result.map.ground.custom[0].images.length,2);result.map.ground.custom[0].images[1].mask[0].points[0].x=90;assert.equal(map.ground.custom[0].images[0].mask[0].points[0].x,1);
});
test('world authoring audit: staged uploads survive refresh and do not duplicate the library',()=>{
 const f=fixture(),s=f.service,snap=s.snapshot('map:Map01'),source=s.index().library[0],file=path.join(root,source.file),first=s.importImage({version:s.version,file,width:source.width,height:source.height});
 const value=M.placeGroundImage(snap.value,'roads',first.asset,{x:0,y:0}).map;s.change({key:snap.key,version:s.version,value});s.refresh({key:snap.key,version:s.version});assert(s.assetTable()[first.asset.id]);
 const again=s.importImage({version:s.version,file,width:source.width,height:source.height});assert.equal(again.asset.id,first.asset.id);assert.equal(s.index().library.filter(a=>a.id===first.asset.id).length,1);assert.deepEqual(s.snapshot(snap.key).issues,[]);assert.throws(()=>s.importImage({version:s.version,file,width:16384,height:16384}),/16 megapixels/);
});
test('world authoring audit: stage save rejects a shared-map source changed after it was opened',async()=>{
 const f=fixture({legacyLink:true}),s=f.service;
 s.snapshot('map:Map01');const mapValue=clone(s.snapshot('map:Map01').value);mapValue.name='Saved map';s.change({key:'map:Map01',version:s.version,value:mapValue});await s.save({key:'map:Map01',version:s.version});
 const stage=linkedLegacyStage(s),value=clone(stage.value);value.hero.x+=20;s.change({key:stage.key,version:s.version,value});
 const mapFile=path.join(f.directory,'authoring/worlds/maps/Map01.json'),external=JSON.parse(fs.readFileSync(mapFile));external.name='Changed elsewhere';fs.writeFileSync(mapFile,JSON.stringify(external));const hash=fingerprint(mapFile);
 await assert.rejects(s.save({key:stage.key,version:s.version}),/Authoring source changed/);assert.equal(fingerprint(mapFile),hash);assert(s.snapshot(stage.key).dirty);
});
test('world authoring audit: a shared-map save preserves later stage settings and returns a non-busy snapshot',async()=>{
 const f=fixture({legacyLink:true}),s=f.service,stage=linkedLegacyStage(s),stageIndex=stage.value.level-1,value=clone(stage.value);value.hero.x+=10;s.change({key:stage.key,version:s.version,value});await s.save({key:stage.key,version:s.version});
 const file=path.join(f.directory,L.configFile('A')),cfg=JSON.parse(fs.readFileSync(file));cfg.LevelCfg[stageIndex].AuditUnknown={keep:'new external value'};cfg.LevelCfg[stageIndex].WaveCfg[0].StartSliver+=7;fs.writeFileSync(file,JSON.stringify(cfg));
 const map=s.snapshot('map:Map01'),next=clone(map.value);next.name='Shared rename';s.change({key:map.key,version:s.version,value:next});const saved=await s.save({key:map.key,version:s.version}),after=L.read(f.directory,L.configFile('A'));
 assert.deepEqual(after.LevelCfg[stageIndex].AuditUnknown,{keep:'new external value'});assert.equal(after.LevelCfg[stageIndex].WaveCfg[0].StartSliver,cfg.LevelCfg[stageIndex].WaveCfg[0].StartSliver);assert.equal(saved.busy,false);
});

test('world authoring audit: original image sources survive a saved legacy map and a fresh service',async()=>{
 const f=fixture(),s=f.service,snap=s.snapshot('map:Map01'),value=clone(snap.value),frames=value.legacyGround.sprites.map(sprite=>sprite.frame);value.name='Saved source references';s.change({key:snap.key,version:s.version,value});await s.save({key:snap.key,version:s.version});
 const fresh=new Service(f.directory,{artifacts:f.artifacts,render:async()=>({files:[],ground:[],assets:{}})}),reopened=fresh.snapshot(snap.key),B=require('../worlds/baker'),spec=B.spec(f.directory,reopened.value,fresh.index().library);
 assert(frames.every(id=>spec.images[id]),'legacy source frames remain available after the runtime floor is replaced');const broken=clone(reopened.value);broken.images={};assert.throws(()=>B.spec(f.directory,broken,fresh.index().library),/Missing source image/);
});

test('world authoring audit: painting history grows with changed strokes instead of copying all previous paint',()=>{
 const H=require('../worlds/history'),history=[];let value={strokes:[],unknown:{keep:true}};
 for(let i=0;i<100;i++){const next=clone(value);next.strokes.push({size:80,points:Array.from({length:30},(_,n)=>({x:i,y:n})),op:'paint'});history.push(H.diff(value,next));value=next;}
 assert(JSON.stringify(history).length<100000,'append history must retain just each new stroke');
 for(let i=history.length-1;i>=0;i--)H.apply(value,history[i],false);assert.deepEqual(value,{strokes:[],unknown:{keep:true}});
 for(const edits of history)H.apply(value,edits,true);assert.equal(value.strokes.length,100);assert.equal(value.strokes[99].points[0].x,99);
 const next=clone(value);next.strokes.splice(40,10);const remove=H.diff(value,next);H.apply(value,remove,true);assert.equal(value.strokes.length,90);H.apply(value,remove,false);assert.equal(value.strokes.length,100);assert(value.unknown.keep);
});

test('world authoring audit: draft preview waits for the lobby and bypasses onboarding without saving progression',async()=>{
 const vm=require('vm'),Runtime=require('../worlds/preview-runtime'),saved={GroupId:1,stepId:0,tips:[]},guide={data:saved,endId:4,getGroupId(){return this.data.GroupId;},getGuideEnd(){return false;},getGuideTips(){return false;}},data={data:{},getLevelCfgById:()=>({})};let home=null,opened=false,closed=0;
 const ui={isopening:true,getUIById:id=>id===3?home:null,closeById(){closed++;},openUIOfCallback(id,none,callback){assert.equal(id,2);assert(home&&!this.isopening);opened=true;callback();}};
 function Game(){}Game.prototype.loadPrefab=function(){};
 const modules={KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>data}},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getGuideData:()=>guide})}},ServerDataMgr:{ServerdataMgr:{curServer:null,getNeedSaveServer:()=>false}},UIMgr:{UIMgr:{getInstance:()=>ui}},Config:{UIID:{UIGuide:4,UINONE:0}},TestMode:{TestMode:{getInstance:()=>({setEnabled(){}})}},KinghtFallConfig:{KinghtFallBundelName:{Enemy:'enemy'},KinghtFallUIID:{UIHome:3,UIGame:2}},KinghtFallUIGame:{default:Game}};
 const cc={assetManager:{loadBundle(name,callback){callback(null,{});}}},context={window:{cc,__quick_compile_project__:{require:name=>modules[name]}},setTimeout,requestAnimationFrame:callback=>setImmediate(callback)},spec={config:{Level:1},sharedConfig:{},neededPrefabs:[],textures:[],sourcePrefabs:[]};
 const timer=setTimeout(()=>{home={node:{active:true}};ui.isopening=false;},10);
 try{const result=await vm.runInNewContext(Runtime.source(spec),context);assert(result.started);assert(opened);assert(closed>0);assert.equal(home.node.active,false);assert.equal(guide.getGroupId(),4);assert.deepEqual(saved,{GroupId:1,stepId:0,tips:[]});modules.ServerDataMgr.ServerdataMgr.curServer=true;await assert.rejects(vm.runInNewContext(Runtime.source(spec),context),/local ephemeral player/);}finally{clearTimeout(timer);}
});

test('world authoring: removing every visible layer saves and reopens without recreating layers or changing global blockers',async()=>{
 const f=fixture(),s=f.service,snap=s.snapshot('map:Map01'),regions=M.mapBlockerRegions(snap.value),config=L.read(f.directory,L.configFile('A'));
 let value=clone(snap.value);for(const layer of value.layers.slice())value=M.removeLayer(value,layer.id);value=M.removeGroundLayer(M.removeGroundLayer(value,'roads'),'grass');
 s.change({key:snap.key,version:s.version,value});assert.deepEqual(s.snapshot(snap.key).value.blockerMask,regions);const saved=await s.save({key:snap.key,version:s.version});assert(saved.result.saved);
 const fresh=new Service(f.directory,{artifacts:f.artifacts,render:async()=>({files:[],ground:[],assets:{}})}),reopened=fresh.snapshot(snap.key);assert.deepEqual(reopened.value.layers,[]);assert.deepEqual(reopened.value.ground.order,['foundation']);assert.deepEqual(reopened.value.blockerMask,regions);assert.deepEqual(reopened.issues,[]);const actualConfig=L.read(f.directory,L.configFile('A'));actualConfig.LevelCfg.forEach((level,i)=>{for(const key of ['EnvironmentMapId','EnvironmentBiome'])if(config.LevelCfg[i][key]===undefined)delete level[key];});assert.deepEqual(actualConfig,config);
 const before=fingerprint(path.join(f.directory,'assets/KinghtFallIconMap/Map01.prefab')),noop=await fresh.save({key:snap.key,version:fresh.version});assert(!noop.result.saved);assert.deepEqual(noop.result.files,[]);assert.equal(fingerprint(path.join(f.directory,'assets/KinghtFallIconMap/Map01.prefab')),before);
 const added=M.createGroundLayer(M.createLayer(reopened.value,'Fresh objects'),'Fresh ground');fresh.change({key:snap.key,version:fresh.version,value:added});assert.deepEqual(fresh.snapshot(snap.key).issues,[]);assert.equal(fresh.snapshot(snap.key).value.layers.length,1);assert.equal(fresh.snapshot(snap.key).value.ground.custom.length,1);
});

test('world authoring: barracks spawn overrides save per instance, reopen, reset and reject concurrent saves',async()=>{
 const f=fixture(),s=f.service,key='stage:A-1',snap=s.snapshot(key),original=clone(snap.value),building=snap.value.buildings.find(b=>b.kind===3),other=snap.value.buildings.find(b=>b.kind===3&&b.id!==building.id),point={x:157.25,y:-93.5,future:{keep:17}},configBefore=L.read(f.directory,L.configFile('A'));
 const source='assets/KinghtFallIconMap/'+snap.value.basePrefab+'.prefab',sourceHash=fingerprint(path.join(f.directory,source)),noop=await s.save({key,version:s.version});assert.equal(noop.result.saved,false);assert.equal(fingerprint(path.join(f.directory,source)),sourceHash);
 const next=clone(s.snapshot(key).value);next.buildings.find(b=>b.id===building.id).spawnPosition=point;next.buildings.find(b=>b.id===building.id).futureBuilding={keep:true};s.change({key,version:s.version,value:next});assert.equal(fingerprint(path.join(f.directory,source)),sourceHash,'Editing the marker cannot publish a prefab');assert.deepEqual(L.read(f.directory,L.configFile('A')),configBefore);
 s.history({key,version:s.version},false);assert.deepEqual(s.snapshot(key).value.buildings.find(b=>b.id===building.id).spawnPosition,building.spawnPosition);s.history({key,version:s.version},true);assert.deepEqual(s.snapshot(key).value.buildings.find(b=>b.id===building.id).spawnPosition,point);
 assert.throws(()=>s.change({key,version:snap.version,value:original}),/Another panel/);assert.deepEqual(s.snapshot(key).value.buildings.find(b=>b.id===building.id).spawnPosition,point);
 const saved=await s.save({key,version:s.version});assert(saved.result.saved);assert(saved.result.files.includes('authoring/worlds/stages/A-1.json'));assert.deepEqual(L.read(f.directory,L.configFile('A')).BuildEnum,configBefore.BuildEnum,'A stage override must not alter shared building defaults');
 const generated=L.read(f.directory,'assets/KinghtFallIconMap/Generated/Stages/A-1.prefab'),component=generated.find(c=>c&&c.ndBotnNodeList&&c.ID===building.id);assert.deepEqual(component.squadSpawnPosition,Object.assign({},point,{__type__:'cc.Vec2'}));if(other)assert.deepEqual(generated.find(c=>c&&c.ndBotnNodeList&&c.ID===other.id).squadSpawnPosition,other.spawnPosition===undefined?null:Object.assign({},other.spawnPosition,{__type__:'cc.Vec2'}));
 const fresh=new Service(f.directory,{artifacts:f.artifacts,render:fixtureBake}),opened=fresh.snapshot(key),actual=opened.value.buildings.find(b=>b.id===building.id);assert.deepEqual(actual.spawnPosition,point);assert.deepEqual(actual.futureBuilding,{keep:true});if(other)assert.deepEqual(opened.value.buildings.find(b=>b.id===other.id).spawnPosition,other.spawnPosition);
 const hashes=['authoring/worlds/stages/A-1.json','assets/KinghtFallIconMap/Generated/Stages/A-1.prefab',L.configFile('A')].map(file=>[file,fingerprint(path.join(f.directory,file))]);const secondNoop=await fresh.save({key,version:fresh.version});assert.equal(secondNoop.result.saved,false);assert.deepEqual(secondNoop.result.files,[]);for(const[file,hash]of hashes)assert.equal(fingerprint(path.join(f.directory,file)),hash);
 const reset=clone(opened.value);delete reset.buildings.find(b=>b.id===building.id).spawnPosition;fresh.change({key,version:fresh.version,value:reset});await fresh.save({key,version:fresh.version});assert.equal(L.read(f.directory,'assets/KinghtFallIconMap/Generated/Stages/A-1.prefab').find(c=>c&&c.ndBotnNodeList&&c.ID===building.id).squadSpawnPosition,null);
 const reopened=new Service(f.directory,{artifacts:f.artifacts,render:fixtureBake}),resetSnap=reopened.snapshot(key);assert.equal(resetSnap.value.buildings.find(b=>b.id===building.id).spawnPosition,undefined);const pending=clone(resetSnap.value);pending.buildings.find(b=>b.id===building.id).spawnPosition={x:22,y:-33};reopened.change({key,version:reopened.version,value:pending});
 const stagePath=path.join(f.directory,'authoring/worlds/stages/A-1.json'),external=fs.readFileSync(stagePath).toString()+'\n';fs.writeFileSync(stagePath,external);await assert.rejects(reopened.save({key,version:reopened.version}),/changed on disk|Concurrent/);assert.equal(fs.readFileSync(stagePath,'utf8'),external);assert.deepEqual(reopened.snapshot(key).value.buildings.find(b=>b.id===building.id).spawnPosition,{x:22,y:-33});
});
