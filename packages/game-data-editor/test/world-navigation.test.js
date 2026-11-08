'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('path'),fs=require('fs'),Module=require('module');
const M=require('../worlds/model'),L=require('../worlds/legacy'),P=require('../worlds/prefab'),Maps=require('../lib/map-assets'),Nav=require('../worlds/navigation'),Grid=require('../../../assets/_script/NavigationGrid').NavigationGrid;
const root=path.resolve(__dirname,'../../..'),rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
function fixture(points){
 const map=M.createMap('navigation-audit','Navigation audit','forest');map.size=map.playable={width:400,height:400};map.blockerMask=[];
 const stage={id:'audit',variant:'A',mapId:map.id,buildings:[],spawns:[{id:1,x:points[0].x,y:points[0].y,enabled:true}],graphs:[{id:'route',spawnIds:[1],entry:'n0',nodes:points.map((p,i)=>Object.assign({id:'n'+i,goal:i===points.length-1},p)),edges:points.slice(1).map((p,i)=>({from:'n'+i,to:'n'+(i+1),weight:1}))}]};
 return {map,stage,service:{root,doc:()=>({data:stage}),loadMap:()=>({data:map})},request:{key:'stage:audit',spawnId:1,radius:2,hall:3,gate:'closed'}};
}
function capturePreview(service,request){
 const filename=path.resolve(__dirname,'../worlds/navigation.js'),unit=new Module(filename,module);unit.filename=filename;unit.paths=module.paths;let captured,modelCalls=0;
 unit.require=name=>name===path.join(root,'assets/_script/NavigationGrid')?{NavigationGrid:class{constructor(polygons,bounds,cell){captured={polygons,bounds,cell};}findPath(start,end){return {points:[start,end],reached:true};}}}:name==='../lib/map-assets'?Object.assign({},Maps,{model(source){modelCalls++;return Maps.model(source);}}):require(require.resolve(name,{paths:[path.dirname(filename)]}));
 unit._compile(fs.readFileSync(filename,'utf8'),filename);return {result:unit.exports.preview(service,request),captured,modelCalls};
}
test('navigation reports a nearby unreachable goal as a frontier instead of relying on a distance threshold',()=>{
 const f=fixture([{x:-100,y:0},{x:15,y:0}]);f.map.blockerMask=[[[[-5,-200],[5,-200],[5,200],[-5,200],[-5,-200]]]];
 const before=JSON.stringify({map:f.map,stage:f.stage}),result=Nav.preview(f.service,f.request);
 assert(result.frontier);assert.match(result.message,/frontier/);assert(result.points.at(-1).x<0);assert.equal(JSON.stringify({map:f.map,stage:f.stage}),before);
});
test('navigation continues from the actual projected waypoint without jumping through blockers',()=>{
 const f=fixture([{x:-100,y:0},{x:0,y:0},{x:50,y:0}]);f.map.blockerMask=[[[[-5,-200],[5,-200],[5,200],[-5,200],[-5,-200]]]];
 const result=Nav.preview(f.service,f.request),grid=new Grid(M.blockerPolygons(f.map).map(p=>p.points),{minX:-200,minY:-200,maxX:200,maxY:200},20);
 assert(result.frontier);for(let i=1;i<result.points.length;i++)assert(grid.segmentClear(result.points[i-1],result.points[i],2),'a calculated preview edge crossed a blocker');
});
test('safe projected nodes remain valid and subsequent detours use their reached endpoint',()=>{
 const f=fixture([{x:-100,y:0},{x:0,y:0},{x:100,y:0}]);f.map.blockerMask=[[[[-5,-30],[5,-30],[5,30],[-5,30],[-5,-30]]]];
 const result=Nav.preview(f.service,f.request),grid=new Grid(M.blockerPolygons(f.map).map(p=>p.points),{minX:-200,minY:-200,maxX:200,maxY:200},20);
 assert(!result.frontier);assert.deepEqual(result.points.at(-1),{x:100,y:0});for(let i=1;i<result.points.length;i++)assert(grid.segmentClear(result.points[i-1],result.points[i],2));
 assert(result.points.every((p,i)=>!i||p.x!==result.points[i-1].x||p.y!==result.points[i-1].y),'no redundant coincident points');
});
test('preview respects an explicit zero radius, disabled spawns, and finite preview inputs',()=>{
 const f=fixture([{x:-100,y:0},{x:100,y:0}]);f.map.size=f.map.playable={width:400,height:10};
 const zero=Nav.preview(f.service,Object.assign({},f.request,{radius:0}));assert(!zero.frontier);assert(Nav.preview(f.service,Object.assign({},f.request,{radius:18})).frontier);
 for(const change of [{hall:0},{hall:4},{hall:NaN},{radius:-1},{radius:NaN},{gate:'missing'}])assert.throws(()=>Nav.preview(f.service,Object.assign({},f.request,change)));
 f.stage.spawns[0].enabled=false;assert.throws(()=>Nav.preview(f.service,f.request),/enabled spawn/);
});
test('built-level preview chooses source tags instead of serialized enabled state and retains static child collision',()=>{
 const f=fixture([{x:-100,y:-100},{x:100,y:-100}]),source=P.skeleton('Template',f.map),info=Maps.model(source),owner=P.append(source,'Hall',info.roots.ndMain,0,0),child=P.append(source,'Static addition',owner,20,0);
 P.component(source,owner,{__type__:'Building',ID:1,ndAniMain:{__id__:child},ndAniOther:[]});
 P.component(source,owner,{__type__:'cc.PhysicsPolygonCollider',tag:1,_enabled:false,points:rect(-10,-10,20,20)});
 P.component(source,owner,{__type__:'cc.PhysicsPolygonCollider',tag:3,_enabled:true,points:rect(-30,-30,60,60)});
 P.component(source,child,{__type__:'cc.PhysicsPolygonCollider',points:rect(-2,-2,4,4)});
 f.stage.buildings=[{id:1,kind:1,unlock:1,x:0,y:0,scale:1,angle:0,template:{prefab:'test',node:owner,roots:[owner]}}];f.stage.templates={test:source};
 const first=capturePreview(f.service,Object.assign({},f.request,{hall:1})).captured.polygons,third=capturePreview(f.service,f.request).captured.polygons;
 assert.equal(first.length,2);assert.equal(third.length,2);assert.deepEqual(first[0],rect(-10,-10,20,20));assert.deepEqual(third[0],rect(-30,-30,60,60));assert.deepEqual(first[1],rect(18,-2,4,4));
});
test('initial branch ColliderIndex is honored for built scenery previews without changing authored sources',()=>{
 const f=fixture([{x:-100,y:-100},{x:100,y:-100}]),source=P.skeleton('Template',f.map),info=Maps.model(source),owner=P.append(source,'Barracks',info.roots.ndMain,0,0),art=P.append(source,'Artwork',owner,0,0);
 P.component(source,owner,{__type__:'Building',ID:2,ndAniMain:{__id__:art},ndAniOther:[]});
 for(const tag of [1,2])P.component(source,owner,{__type__:'cc.PhysicsPolygonCollider',tag,_enabled:tag===1,points:rect(-tag*10,-tag*10,tag*20,tag*20)});
 f.stage.buildings=[{id:2,kind:3,unlock:1,x:0,y:0,scale:1,angle:0,template:{prefab:'test',node:owner,roots:[owner]}}];f.stage.templates={test:source};f.service.index=()=>({documents:{A:{BuildEnum:{3:{InitialChoices:[3],levelList:[{level:1},{level:2},{level:1,ColliderIndex:2}]}}}}});
 const before=JSON.stringify(f.stage),result=capturePreview(f.service,f.request);
 assert.equal(result.captured.polygons.length,1);assert.deepEqual(result.captured.polygons[0],rect(-20,-20,40,40));assert.equal(JSON.stringify(f.stage),before);
});
test('static boxes and circles retain enabled state when their owner level changes or its gate opens',()=>{
 const f=fixture([{x:-100,y:-100},{x:100,y:-100}]),source=P.skeleton('Template',f.map),info=Maps.model(source),owner=P.append(source,'Gate',info.roots.ndMain,0,0),art=P.append(source,'Artwork',owner,0,0);
 P.component(source,owner,{__type__:'Building',ID:2,ndAniMain:{__id__:art},ndAniOther:[]});
 P.component(source,owner,{__type__:'cc.PhysicsPolygonCollider',tag:1,_enabled:false,points:rect(-10,-10,20,20)});
 P.component(source,owner,{__type__:'cc.PhysicsBoxCollider',_size:{width:8,height:8}});
 P.component(source,owner,{__type__:'cc.PhysicsCircleCollider',_radius:5});
 P.component(source,owner,{__type__:'cc.PhysicsBoxCollider',_enabled:false,_size:{width:16,height:16}});
 f.stage.buildings=[{id:2,kind:6,unlock:1,x:0,y:0,scale:1,angle:0,template:{prefab:'test',node:owner,roots:[owner]}}];f.stage.templates={test:source};
 const closed=capturePreview(f.service,f.request).captured.polygons,open=capturePreview(f.service,Object.assign({},f.request,{gate:'open'})).captured.polygons;
 assert.equal(closed.length,3);assert.equal(open.length,2);assert.deepEqual(open,closed.slice(1));
});
test('real Map01 gate previews retain wings when open and select a single collider level',()=>{
 const f=fixture([{x:-1000,y:-1000},{x:-900,y:-1000}]),source=L.inspect(root,'Map01'),layout=L.adaptStage(root,'A',1),gate=layout.buildings.find(b=>b.kind===6);gate.enabled=true;gate.unlock=1;f.stage.buildings=[gate];f.stage.templates={Map01:source.data};
 const closed=capturePreview(f.service,f.request).captured.polygons,open=capturePreview(f.service,Object.assign({},f.request,{gate:'open'})).captured.polygons;
 assert.equal(closed.length,5);assert.equal(open.length,4);
 const ownerPoints=source.info.colliders.find(c=>c.node===gate.template.node&&c.source.tag===1).points;
 assert(closed.some(p=>JSON.stringify(p)===JSON.stringify(ownerPoints)));assert(!open.some(p=>JSON.stringify(p)===JSON.stringify(ownerPoints)));
});
test('real Map03 main hall is present even though all source-level colliders are serialized disabled',()=>{
 const f=fixture([{x:-1000,y:-1000},{x:-900,y:-1000}]),source=L.inspect(root,'Map03'),layout=L.adaptStage(root,'A',1),hall=layout.buildings.find(b=>b.kind===1);
 hall.template={prefab:'Map03',node:source.info.owners.find(n=>n.slot===1).id,roots:[source.info.owners.find(n=>n.slot===1).id]};hall.x=source.info.byId[hall.template.node].position.x;hall.y=source.info.byId[hall.template.node].position.y;
 f.stage.buildings=[hall];f.stage.templates={Map03:source.data};
 for(const level of [1,2,3]){const result=capturePreview(f.service,Object.assign({},f.request,{hall:level})).captured.polygons;assert.equal(result.length,1);assert.deepEqual(result[0],source.info.colliders.find(c=>c.node===hall.template.node&&c.source.tag===level).points);}
});
test('one preview models each shared source once, while the next preview sees source edits',()=>{
 const f=fixture([{x:-1000,y:-1000},{x:-900,y:-1000}]),source=L.inspect(root,'Map01'),layout=L.adaptStage(root,'A',1);
 f.stage.buildings=layout.buildings.filter(b=>b.enabled!==false);f.stage.templates={Map01:source.data};
 const first=capturePreview(f.service,f.request);assert.equal(first.modelCalls,1);assert(first.captured.polygons.length>1);
 const tower=f.stage.buildings.find(b=>b.kind===2),collider=source.info.colliders.find(c=>c.node===tower.template.node&&c.source.tag===1);collider.source.points[0].x+=20;
 const second=capturePreview(f.service,f.request);assert.equal(second.modelCalls,1);assert.notDeepEqual(second.captured.polygons,first.captured.polygons);
});
