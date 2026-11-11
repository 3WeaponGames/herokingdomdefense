'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const M=require('../worlds/model'),L=require('../worlds/legacy'),Maps=require('../lib/map-assets'),Gate=require('../worlds/gate-facing'),Run=require('../worlds/wall-run'),Preview=require('../worlds/building-preview'),Nav=require('../worlds/navigation'),P=require('../worlds/prefab');
const root=path.resolve(__dirname,'../../..');
const Kit=require('../../../assets/_script/WallKit'),Facing=require('../../../assets/_script/GateFacing'),Units=require('../lib/unit-assets');
function fixture(){const config=M.clone(L.read(root,L.configFile('A'))),source=L.inspect(root,'Map01'),stage=L.adaptStage(root,'A',1,{...config.LevelCfg[0],prefab:'Map01'});const wall=stage.buildings.find(b=>b.kind===6);stage.buildings=[wall];stage.specials=[];const index={documents:{A:config,B:{},D:{}}},service={root,index:()=>index,source:()=>source.data};return{config,source,stage,wall,service};}
function owner(source,wall){const info=Maps.model(source),node=info.byId[wall.template.node],controller=node.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID));return{info,node,controller};}

test('opening wall tools keeps legacy sources unchanged; custom runs project only detached fixtures',()=>{
 const f=fixture(),before=JSON.stringify(f.source.data),draft=JSON.stringify(f.stage);
 assert.equal(Run.project(f.source.data,f.wall),f.source.data);
 for(const gate of [true,false]){
  const b={...f.wall,wallFacing:'SW',wallRun:{left:3,right:6,gate,spacing:2,start:'post',end:'corner',FutureField:{keep:[1,2,3]}}},params=JSON.stringify(b),projected=Gate.project(f.source.data,b),v=owner(projected,b),c=v.controller.value;
  assert.notEqual(projected,f.source.data);assert.equal(JSON.stringify(f.source.data),before);assert.equal(JSON.stringify(f.stage),draft);assert.equal(JSON.stringify(b),params);
  assert.equal(c.wallHasGate,gate);assert.deepEqual(JSON.parse(c.wallRun).FutureField,{keep:[1,2,3]});assert.equal(JSON.parse(c.wallRun).left,3);
  const facingOnly=Gate.project(f.source.data,{...b,wallRun:undefined}),original=owner(facingOnly,f.wall).controller.value;
  for(const ref of original.ndLockList)assert.deepEqual(projected[ref.__id__],facingOnly[ref.__id__],'The purchase field remains fixed');
  const stage={...f.stage,buildings:[b]},closed=Nav.buildingPolygons(f.service,stage,{...b,x:0,y:0,angle:0,scale:1},1,'closed',f.config,new Map()),open=Nav.buildingPolygons(f.service,stage,{...b,x:0,y:0,angle:0,scale:1},1,'open',f.config,new Map());
  if(gate)assert.equal(closed.length,open.length+1,'Only the optional gate admits allies');else assert.deepEqual(closed,open,'Solid wall runs never become an ally passage');
 }
});

test('custom wall runs survive prefab composition and can re-enable a previously unused connector',()=>{
 const f=fixture(),b={...f.wall,wallFacing:'NW',wallRun:{left:2,right:5,gate:true,start:'post',end:'post',spacing:3}};
 const first=Gate.project(f.source.data,b),changed=Gate.project(first,{...b,wallRun:{...b.wallRun,end:'corner'}}),v=owner(changed,b),lastRef=v.controller.value.ndAniOther[3],lastNode=v.info.byId[changed[lastRef.__id__].node.__id__];
 assert(lastNode.components.some(c=>c.value.__type__==='cc.PhysicsPolygonCollider'&&c.value.tag===1),'Restore the authored collider tag when a corner is enabled');
 const stage={...f.stage,buildings:[b]},data=P.compose(root,M.createMap('wall-run','Wall run','forest'),stage,{ground:[],assets:{}},{Map01:f.source.data}),info=Maps.model(data),placed=info.owners.find(n=>n.kind==='building'),controller=data[placed.ownerComponent],run=JSON.parse(controller.wallRun);
 assert.equal(controller.ID,b.id);assert.equal(controller.wallFacing,'NW');assert.equal(run.left,2);assert.equal(run.right,5);assert.equal(run.spacing,3);assert(run._fixtureTags.length===5);
 assert.deepEqual(Run.readRun(controller),run,'Saved prefabs preserve the modular settings even without authoring JSON');
 const roots=info.colliders.filter(c=>c.node===placed.id&&c.source.tag===1);assert.equal(roots.length,1);assert(roots[0].points.length>=3);
});

test('stage preview fits the same long diagonal assembly and invalidates cached shapes without editing drafts',()=>{
 const f=fixture();f.wall.wallRun={left:4,right:7,gate:true,start:'post',end:'post',spacing:2};
 const before=JSON.stringify({stage:f.stage,source:f.source.data,config:f.config}),first=Preview.describe(f.service,f.stage),record=first.buildings[f.wall.id].levels[1],main=record.skeletons.find(s=>s.json.wallKit);
 assert(main);assert.equal(main.json.wallKit.layout.leftCount,Kit.layout(f.wall.wallRun).leftCount);assert.equal(main.json.wallKit.layout.rightCount,Kit.layout(f.wall.wallRun).rightCount);
 assert.equal(record.skeletons.length,6);assert.equal(JSON.stringify({stage:f.stage,source:f.source.data,config:f.config}),before,'Browsing does not save, seed or repair data');
 f.wall.wallRun={...f.wall.wallRun,right:9,gate:false};const next=Preview.describe(f.service,f.stage),r=next.buildings[f.wall.id].levels[1],m=r.skeletons.find(s=>s.json.wallKit);
 assert.notEqual(next,first);assert.equal(m.json.wallKit.layout.rightCount,Kit.layout(f.wall.wallRun).rightCount);assert.equal(m.json.wallKit.layout.gate,false);assert.deepEqual(r.blockers,r.openBlockers);
 for(const skin of m.json.skins.filter(s=>s.name.startsWith('cq-rts-')))assert(!Object.keys(skin.attachments).some(s=>s.startsWith('rts_wall_leaf')));
});

function localNode(source,ref){const v=source[ref.__id__];return v.__type__==='cc.Node'?ref.__id__:v.node.__id__;}
function skeletonJson(source,ref){const c=source[ref.__id__],file=Units.index(root).uuids[c._N$skeletonData.__uuid__];return JSON.parse(fs.readFileSync(file,'utf8'));}
function nativePlan(source,wall,run){const v=owner(source,wall),c=v.controller.value,main=v.info.byId[localNode(source,c.ndAniMain)],inverse=Maps.inverse(main.world),points=[];for(const ref of c.ndAniOther){const node=v.info.byId[localNode(source,ref)];for(const p of skeletonJson(source,ref).wallAnchors||[])points.push(Maps.point(inverse,Maps.point(node.world,p)));}return{...v,main,plan:Kit.layout(run,points)};}
function near(a,b){assert.equal(a.length,b.length);a.forEach((p,i)=>{assert(Math.abs(p.x-b[i].x)<1e-7);assert(Math.abs(p.y-b[i].y)<1e-7);});}
function bentRun(){return Object.assign(Kit.nativeRun({left:2,right:2,gate:true,start:'post',end:'post'}),{left:4,right:2,routes:{left:[{u:0,v:0},{u:-2,v:0},{u:-2,v:2}],right:[{u:0,v:0},{u:2,v:0}]}});}

test('legacy default native geometry aligns preview navigation and proximity on every compass face without migrating serialized fields',()=>{
 const f=fixture(),original=JSON.stringify(f.source.data),draft=JSON.stringify(f.stage);
 for(const face of ['NW','NE','SW','SE']){
  const wall={...f.wall,wallFacing:face},projected=Gate.project(f.source.data,wall,root),v=nativePlan(projected,wall),g=Kit.fixtures(v.plan),controller=v.controller.value;
  assert.notStrictEqual(projected,f.source.data);assert.equal(controller.wallRun,owner(f.source.data,f.wall).controller.value.wallRun);assert.equal(controller.wallHasGate,owner(f.source.data,f.wall).controller.value.wallHasGate);
  for(const [node,polygons] of [[v.node,[g.root]],...controller.ndAniOther.map((ref,i)=>[v.info.byId[localNode(projected,ref)],g.wingSegments[i]])]){
   for(const tier of [1,2,3]){const parts=node.components.filter(c=>c.value.__type__==='cc.PhysicsPolygonCollider'&&c.value.tag===tier);assert.equal(parts.length,polygons.length);parts.forEach((part,i)=>{const collider=v.info.colliders.find(c=>c.id===part.id);near(collider.points,polygons[i].map(p=>Maps.point(v.main.world,p)));});}
  }
  const trigger=v.node.components.find(c=>c.value.__type__==='cc.PolygonCollider');near(trigger.value.points.map(p=>Maps.point(v.node.world,p)),g.proximity.map(p=>Maps.point(v.main.world,p)));
  for(const hall of [1,2,3]){const closed=Nav.buildingPolygons(f.service,f.stage,wall,hall,'closed',f.config,new Map()),open=Nav.buildingPolygons(f.service,f.stage,wall,hall,'open',f.config,new Map());assert.equal(closed.length,open.length+1);assert(open.length>=2,'Both fixed portal posts stay in the navigation map');}
 }
 assert.equal(JSON.stringify(f.source.data),original);assert.equal(JSON.stringify(f.stage),draft);
});

test('bent wall projections clone convex colliders by tier, preserve unknown fields and never multiply on re-projection',()=>{
 const f=fixture(),raw=M.clone(f.source.data),rawOwner=owner(raw,f.wall),left=rawOwner.info.byId[localNode(raw,rawOwner.controller.value.ndAniOther[0])];for(const item of left.components.filter(c=>c.value.__type__==='cc.PhysicsPolygonCollider')){raw[item.id].FuturePhysics={keep:[1,2]};raw[item.id].friction=.63;raw[item.id]._id='authored-'+item.id;raw[item.id].offset={__type__:'cc.Vec2',x:7,y:-3};}
 const before=JSON.stringify(raw),run=bentRun(),wall={...f.wall,wallRun:run},params=JSON.stringify(wall),projected=Gate.project(raw,wall,root),v=nativePlan(projected,wall,run),g=Kit.fixtures(v.plan),n=v.info.byId[localNode(projected,v.controller.value.ndAniOther[0])],colliders=n.components.filter(c=>c.value.__type__==='cc.PhysicsPolygonCollider');
 assert.equal(colliders.length,6);assert.equal(projected.length,raw.length+3);assert.equal(JSON.stringify(raw),before);assert.equal(JSON.stringify(wall),params);assert.equal(JSON.parse(v.controller.value.wallRun)._fixtureTags[1].length,6);
 for(const tier of [1,2,3]){const items=colliders.filter(c=>c.value.tag===tier);assert.equal(items.length,2);items.forEach((item,i)=>{assert.deepEqual(item.value.FuturePhysics,{keep:[1,2]});assert.equal(item.value.friction,.63);assert.deepEqual(item.value.offset,{__type__:'cc.Vec2',x:7,y:-3});near(v.info.colliders.find(c=>c.id===item.id).points,g.wingSegments[0][i].map(p=>Maps.point(v.main.world,p)));});assert.equal(items[1].value._id,'','Cloned fixtures receive a new engine identity');}
 const repeated=Gate.project(projected,wall,root);assert.equal(repeated.length,projected.length);assert.equal(owner(repeated,wall).node.components.length,v.node.components.length);
 const shorter={...wall,wallRun:{...run,left:0,routes:{left:[{u:0,v:0}],right:run.routes.right}}},shrunk=Gate.project(projected,shorter,root),expanded=Gate.project(shrunk,wall,root),next=owner(expanded,wall),nextLeft=next.info.byId[localNode(expanded,next.controller.value.ndAniOther[0])];
 assert.equal(expanded.length,projected.length);for(const tier of [1,2,3])assert.equal(nextLeft.components.filter(c=>c.value.__type__==='cc.PhysicsPolygonCollider'&&c.value.tag===tier).length,2,'Saved authored tags restore reused fixtures');
 const stage={...f.stage,buildings:[wall]},closed=Nav.buildingPolygons({...f.service,source:()=>raw},stage,wall,1,'closed',f.config,new Map()),open=Nav.buildingPolygons({...f.service,source:()=>raw},stage,wall,1,'open',f.config,new Map());assert.equal(closed.length,4);assert.equal(open.length,3,'Opening keeps every bent wall stretch solid');
});

test('paired preview fitting keeps raw sources, matched gate parts and stable revisions across repeated edits',()=>{
 const f=fixture(),c=owner(f.source.data,f.wall).controller.value,rawMain=skeletonJson(f.source.data,c.ndAniMain),rawDown=skeletonJson(f.source.data,c.ndAniDown),bytes=JSON.stringify([rawMain,rawDown]),run=bentRun();
 for(const face of ['NW','NE','SW','SE']){
  const sx=Facing.mirrorX(face)?-1:1,mainMatrix=[sx,0,0,1,50,100],downMatrix=[sx,0,0,1,50.477,100],record={skeletons:[{json:rawDown,matrix:downMatrix,revision:'right'},{json:rawMain,matrix:mainMatrix,revision:'main'}]},component={wallRun:JSON.stringify(run)};
  Run.fitRecord(record,component,face);const main=record.skeletons[1],down=record.skeletons[0],plan=Kit.layout(run),transform=Maps.multiply(Maps.inverse(downMatrix),mainMatrix);let expectedMain=Kit.install(rawMain,plan,undefined,{mirrorX:sx<0}),expectedDown=Kit.fitGatePart(rawDown,plan,{frameToLocal:transform});if(Facing.reverse(face)){expectedMain=Facing.mirrorJson(expectedMain);expectedDown=Facing.mirrorJson(expectedDown);}
  assert.deepEqual(main.json,expectedMain);assert.deepEqual(down.json,expectedDown);assert.strictEqual(main._wallSourceJson,rawMain);assert.strictEqual(down._wallSourceJson,rawDown);
  assert.equal(main.json.wallDoor.version,2,'Main model owns the matched PNG gate');
  assert.deepEqual(down.json.skins.find(s=>s.name===Kit.skins[1]).attachments,{},'Paired model cannot render duplicate old gate leaves');
  const stable=JSON.stringify(record);Run.fitRecord(record,component,face);assert.equal(JSON.stringify(record),stable,'Fitting an already-fitted descriptor never compounds mirroring or geometry');
  component.wallRun=JSON.stringify({...run,right:3,routes:{...run.routes,right:[{u:0,v:0},{u:3,v:0}]}});Run.fitRecord(record,component,face);for(const part of record.skeletons)assert.equal(part.revision.split(':wall-run:').length,2,'Revisions stay bounded during popup drags');
 }
 assert.equal(JSON.stringify([rawMain,rawDown]),bytes);
});

test('stage preview exposes both fitted native gate halves and raw popup sources at every hall level',()=>{
 const f=fixture();f.wall.wallFacing='NW';f.wall.wallRun=bentRun();const before=JSON.stringify([f.stage,f.source.data]),result=Preview.describe(f.service,f.stage);assert.deepEqual(result.errors,[]);
 for(const hall of [1,2,3]){const record=result.buildings[f.wall.id].levels[hall],parts=record.skeletons.filter(s=>s.json.wallKit||s.json.wallGate);assert.equal(parts.length,2);for(const part of parts){assert(part._wallSourceJson);assert(part._wallSourceJson!==part.json);assert(part._wallSourceRevision);assert.equal(part.skin,f.config.BuildEnum[6].levelList[0].Skin);for(const tier of Kit.skins)assert(part.json.skins.some(s=>s.name===tier));}assert.equal(record.blockers.length,record.openBlockers.length+1);}
 assert.equal(JSON.stringify([f.stage,f.source.data]),before);
});


test('default exported prefabs recover original tier tags before later corner and bent-run edits without seeding wallRun',()=>{
 const f=fixture(),temporary=require('./owned-temp'),directory=temporary('hkd-native-wall-recovery-'),scripts=path.join(directory,'assets/_script');fs.mkdirSync(scripts,{recursive:true});for(const name of ['KinghtFallBuildMainFortress','KinghtFallBuildBartizan','KinghtFallBuildBarracks','KinghtFallBuildHome','KinghtFallBuildMill','KinghtFallBuildWall','KinghtFallCommerce'])fs.copyFileSync(path.join(root,'assets/_script',name+'.js.meta'),path.join(scripts,name+'.js.meta'));
 const exported=P.compose(root,M.createMap('native-recovery','Native recovery','forest'),f.stage,{ground:[],assets:{}},{Map01:f.source.data}),info=Maps.model(exported),placed=info.owners.find(n=>n.kind==='building'),c=exported[placed.ownerComponent];assert.equal(c.wallRun,owner(f.source.data,f.wall).controller.value.wallRun);assert(c.wallFixtureTags);assert.deepEqual(JSON.parse(c.wallFixtureTags),[0,1,2,3,4].map(()=>[1,2,3]));
 const folder=path.join(directory,'assets/KinghtFallIconMap');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'Recovered.prefab'),JSON.stringify(exported));const config={...f.config.LevelCfg[0],prefab:'Recovered',HomeLevel1Unlock:[[6,f.wall.id]],HomeLevel2Unlock:[],HomeLevel3Unlock:[]},recovered=L.adaptStage(directory,'A',1,config),raw=L.inspect(directory,'Recovered').data,wall={...recovered.buildings[0],wallRun:{...bentRun(),end:'corner'}},before=JSON.stringify(raw),projected=Run.project(raw,wall),v=owner(projected,wall);
 const corner=v.info.byId[localNode(projected,v.controller.value.ndAniOther[3])];for(const tier of [1,2,3])assert.equal(corner.components.filter(c=>c.value.__type__==='cc.PhysicsPolygonCollider'&&c.value.tag===tier).length,1,'Re-enable the original tier tags from a default export');
 const left=v.info.byId[localNode(projected,v.controller.value.ndAniOther[0])];for(const tier of [1,2,3])assert.equal(left.components.filter(c=>c.value.__type__==='cc.PhysicsPolygonCollider'&&c.value.tag===tier).length,2);assert.equal(JSON.stringify(raw),before);assert.equal(recovered.buildings[0].wallRun,undefined);
});

test('invalid internal fixture-tag metadata fails detached projection without repairing the source',()=>{
 const f=fixture(),raw=M.clone(f.source.data),v=owner(raw,f.wall);raw[v.controller.id].wallFixtureTags='[null]';const bytes=JSON.stringify(raw);assert.throws(()=>Run.project(raw,{...f.wall,wallRun:bentRun()}),/Invalid saved wall collider tags/);assert.equal(JSON.stringify(raw),bytes);
});

