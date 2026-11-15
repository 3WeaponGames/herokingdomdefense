'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../worlds/model'),Data=require('../worlds/object-shadow-data'),P=require('../worlds/prefab'),L=require('../worlds/legacy'),B=require('../worlds/baker'),Maps=require('../lib/map-assets'),{Service,fingerprint}=require('../worlds/service'),temporary=require('./owned-temp');
const root=path.resolve(__dirname,'../../..'),asset={id:'tree',name:'Tree',depth:'world',width:32,height:64,anchor:{x:.5,y:0}};
function fixture(){let map=M.createMap('map-shadows','Map shadows','forest');map.layers[0].depth='world';map=M.place(map,map.layers[0].id,asset,{x:-50,y:0},1,1,0).map;map=M.place(map,map.layers[0].id,asset,{x:50,y:0},1,1,0).map;map.FutureMap={keep:17};map.layers[0].FutureLayer={keep:23};map.layers[0].objects[0].FutureObject={keep:31};return map;}
function set(map,enabled,object){return Data.assign(map,{layerId:map.layers[0].id,...(object?{objectId:map.layers[0].objects[0].id}:{}),enabled});}
function exported(map){const data=P.skeleton('Fixture',map);P.addEnvironment(root,data,map,{ground:[],assets:{tree:{frames:[{name:'tree',frameUuid:'test-tree-frame',x:-16,y:0,width:32,height:64}]}}});return P.compact(data);}
function shadowComponents(data){return data.filter(n=>n.__type__===L.script(root,'MapObjectShadow'));}

test('map shadows: layer inheritance casts once per object and restores dormant object choices',()=>{
 const initial=fixture(),before=JSON.stringify(initial);assert.equal(Data.casters(initial).length,0);
 const single=set(initial,true,true);assert.equal(Data.casters(single).length,1);assert.equal(Data.casters(single)[0].source,'object');
 const layer=set(single,true);assert.equal(Data.casters(layer).length,2);assert(Data.casters(layer).every(c=>c.source==='layer'));assert(layer.layers[0].objects[0].globalShadow);
 assert.throws(()=>set(layer,false,true),/controlled by its layer/);assert.equal(set(layer,true),layer,'no-op menu choices retain the same map');
 const restored=set(layer,false);assert.equal(Data.casters(restored).length,1);assert.equal(Data.casters(restored)[0].object.id,single.layers[0].objects[0].id);
 const placed=M.place(layer,layer.layers[0].id,asset,{x:70,y:-30},.8,1.2,.5).map;assert.equal(Data.casters(placed).length,3,'new objects inherit the layer');assert.equal(placed.layers[0].objects[2].globalShadow,undefined,'inheritance does not rewrite child flags');
 assert.equal(JSON.stringify(initial),before);assert.deepEqual(restored,single);assert.deepEqual(M.validateMap(layer,{tree:asset}),[]);
 assert.equal(set(restored,false,true).layers[0].objects[0].globalShadow,undefined);
});

test('map shadows: stale, locked and hidden targets fail without modifying unknown data',()=>{
 const map=fixture(),before=JSON.stringify(map);assert.throws(()=>Data.assign(map,{layerId:'removed',enabled:true}),/layer changed/);assert.throws(()=>Data.assign(map,{layerId:map.layers[0].id,objectId:'removed',enabled:true}),/moved or was removed/);assert.throws(()=>Data.assign(map,{layerId:map.layers[0].id,enabled:1}),/Choose whether/);
 for(const flag of ['locked','hidden']){const copy=M.clone(map);copy.layers[0][flag]=true;assert.throws(()=>set(copy,true));assert.equal(Data.casters(set(map,true)).length,2);if(flag==='hidden')assert.equal(Data.casters(copy).length,0);}
 assert.equal(JSON.stringify(map),before);const next=set(map,true,true);assert.deepEqual(next.FutureMap,map.FutureMap);assert.deepEqual(next.layers[0].FutureLayer,map.layers[0].FutureLayer);assert.deepEqual(next.layers[0].objects[0].FutureObject,map.layers[0].objects[0].FutureObject);
 next.layers[0].globalShadow='yes';assert(M.validateMap(next,{tree:asset}).some(s=>s.includes('shadow')));
});

test('map shadows: exports contain one controller per caster and leave gameplay components intact',()=>{
 const map=fixture();delete map.blockerMask;map.layers[0].objects[0].polygons=[[{x:0,y:0},{x:20,y:0},{x:10,y:20}]];
 const none=exported(map),single=exported(set(map,true,true)),both=exported(set(set(map,true,true),true));
 assert.equal(shadowComponents(none).length,0);assert.equal(shadowComponents(single).length,1);assert.equal(shadowComponents(both).length,2);
 const gameplay=data=>data.filter(n=>['cc.RigidBody','cc.PhysicsPolygonCollider',L.script(root,'KinghtFallBuildObstacle')].includes(n.__type__)).map(n=>Object.assign({},n,{node:data[n.node.__id__]._name}));assert.deepEqual(gameplay(single),gameplay(none));
 assert.equal(single.filter(n=>n.__type__==='cc.PhysicsPolygonCollider').length,1);assert.deepEqual(single.find(n=>n.__type__==='cc.PhysicsPolygonCollider').points,none.find(n=>n.__type__==='cc.PhysicsPolygonCollider').points);
 for(const c of shadowComponents(both)){assert.equal(c.sources.length,1);assert.equal(both[c.sources[0].__id__]._name,'Artwork');assert.equal(both[c.mapMain.__id__]._name,'ndMain');assert.equal(both[c.shadowParent.__id__]._name,'ndDown');assert.equal(c.groundOnly,false);}
});

test('map shadows: flat scenery stays on the ground without adding collisions',()=>{
 const map=fixture();map.layers[0].depth='ground';map.layers[0].objects[0].polygons=[[{x:0,y:0},{x:10,y:0},{x:0,y:10}]];
 assert(!exported(map).some(n=>n._name==='Tree'),'unchanged flat art remains in the ground bake');
 const data=exported(set(map,true)),components=shadowComponents(data);assert.equal(components.length,2);
 for(const c of components){assert(c.groundOnly);const owner=data[c.node.__id__];assert.equal(data[owner._parent.__id__]._name,'ndDown');const attached=owner._components.map(r=>data[r.__id__]);assert(!attached.some(n=>n.__type__===L.script(root,'KinghtFallBuildObstacle')||/^cc\.(Physics|RigidBody)/.test(n.__type__)));assert(attached.find(n=>n.__type__===L.script(root,'MapTerrainLayer')).groundOnly);}
});

test('map shadows: a legacy multi-root object exports one combined shadow even after importing an older controller',()=>{
 const map=fixture(),legacy=P.skeleton('Legacy',map),main=Maps.model(legacy).roots.ndMain,a=P.textureNode(legacy,main,'Left','frame-left',-20,0,20,50),b=P.textureNode(legacy,main,'Right','frame-right',20,0,20,40);
 P.component(legacy,a,{__type__:L.script(root,'MapObjectShadow'),shadowKey:'old-shadow'});map.legacyData=legacy;map.layers[0].objects=[{id:'legacy-group',name:'Pair',x:0,y:0,scale:1,angle:0,globalShadow:true,legacy:{roots:[a,b],origin:{x:0,y:0},sprites:[]}}];map.layers[0].globalShadow=true;
 const before=JSON.stringify(map),data=exported(map),components=shadowComponents(data);assert.equal(components.length,1);assert.equal(components[0].sources.length,2);assert.deepEqual(components[0].sources.map(r=>data[r.__id__]._name),['Left','Right']);assert.equal(JSON.stringify(map),before);
});

test('map shadows: isolated browser bake loads the exact ground projector only when needed',()=>{
 const plain=fixture(),original=B.rendererSource({map:plain}),enabled=set(plain,true),source=B.rendererSource({map:enabled});assert(!original.includes('WorldDropShadow'));
 const context={Uint8Array,Uint8ClampedArray,Float32Array,console};context.window=context;vm.runInNewContext(source,context);
 assert(context.WorldObjectShadows&&context.WorldPaint&&context.MapObjectShadowPolicy);const expected=require('../../../assets/_script/BuildingDropShadow').settings({angle:-52,length:1.2});assert.deepEqual(JSON.parse(JSON.stringify(context.WorldDropShadow.settings({angle:-52,length:1.2}))),expected);assert.equal(context.WorldDropShadow.settings({projection:'silhouette'}).projection,'ground');
 const input={alpha:new Uint8Array([255,255,255,255]),pixelWidth:2,pixelHeight:2,x:-5,y:0,width:10,height:20},settings={straighten:.57,angle:-74};const a=context.WorldDropShadow.raster(input,settings),b=require('../../../assets/_script/BuildingDropShadow').raster(input,settings);assert.deepEqual(Array.from(a.pixels),Array.from(b.pixels));assert.equal(a.width,b.width);assert.equal(a.x,b.x);
});

test('map shadows: save, reopen, undo and no-op save preserve flags, unknown fields and existing global numbers',async()=>{
 const directory=temporary('hkd-map-shadow-project-'),artifacts=temporary('hkd-map-shadow-artifacts-'),write=(file,value)=>{const target=path.join(directory,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,typeof value==='string'?value:JSON.stringify(value));};
 for(const variant of ['A','B','D'])write(L.configFile(variant),{BuildEnum:{},SoldierCfg:{},LevelCfg:[],ParameterCfg:{60018:{Value:.5}},GameTools:{buildingShadows:{global:{angle:-63,length:1.21,flatten:.72,FutureSun:17}}}});
 for(const id of require('../lib/map-catalog').IDS)write('assets/KinghtFallIconMap/'+id+'.prefab',[]);write('authoring/worlds/library/manifest.json',{version:1,assets:[Object.assign({},asset,{file:'tree.png'})]});write('assets/resources/localization/catalog.json',{entries:{}});write('tree.png','fixture');write('authoring/worlds/maps/map-shadows.json',fixture());
 let calls=0,preset;const options={artifacts,render:async spec=>{calls++;preset=spec.shadowSettings;return{files:[],ground:[],assets:{}};}},service=new Service(directory,options),key='map:map-shadows',file=path.join(directory,'authoring/worlds/maps/map-shadows.json'),before=fingerprint(file),cfg=fingerprint(path.join(directory,L.configFile('A'))),snap=service.snapshot(key);
 assert.equal(snap.globalShadowSettings.angle,-63);assert(!snap.dirty);assert.equal(calls,0);assert.equal(fingerprint(file),before);assert.equal((await service.save({key,version:service.version})).result.saved,false);assert.equal(calls,0);
 const next=set(set(snap.value,true,true),true);service.change({key,version:service.version,value:next});service.history({key,version:service.version},false);assert(!service.snapshot(key).dirty);service.history({key,version:service.version},true);assert.equal(fingerprint(file),before,'editing only records a draft');await service.save({key,version:service.version});assert.equal(calls,1);assert.equal(preset.angle,-63);assert.equal(preset.length,1.21);assert.equal(fingerprint(path.join(directory,L.configFile('A'))),cfg);
 const reopened=new Service(directory,options),value=reopened.snapshot(key).value;assert.deepEqual(value.layers,next.layers);assert.deepEqual(value.FutureMap,next.FutureMap);const saved=fingerprint(file);assert.equal((await reopened.save({key,version:reopened.version})).result.saved,false);assert.equal(fingerprint(file),saved);assert.equal(calls,1);
});
