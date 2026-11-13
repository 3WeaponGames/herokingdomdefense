'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('path'),fs=require('fs'),temporary=require('./owned-temp');
const GateSource=require('../worlds/gate-facing'),Facing=require('../../../assets/_script/GateFacing'),Preview=require('../worlds/building-preview'),Navigation=require('../worlds/navigation'),P=require('../worlds/prefab'),L=require('../worlds/legacy'),M=require('../worlds/model'),Maps=require('../lib/map-assets');
const Adjustments=require('../../../assets/_script/WallAdjustments');
const root=path.resolve(__dirname,'../../..'),faces=['NE','NW','SE','SW'];
// These geometry assertions target both original Map01 wall assemblies, even
// when campaign Stage 1 has been saved to a different generated prefab.
function fixture(slot){const source=L.inspect(root,'Map01'),config=L.read(root,L.configFile('A')),stage=L.adaptStage(root,'A',1,Object.assign(M.clone(config.LevelCfg[0]),{prefab:'Map01'})),building=stage.buildings.find(b=>b.id===(slot||19));assert.equal(building&&building.kind,6,'The fixture must select a wall from the same prefab as its source');building.enabled=true;building.unlock=1;stage.buildings=[building];stage.specials=[];return {source,config,stage,building,service:{root,source:()=>source.data,index:()=>({documents:{A:config}})}};}
function near(a,b,label){if(Array.isArray(a)){assert.equal(a.length,b.length,label);a.forEach((v,i)=>near(v,b[i],label));return;}if(a&&typeof a==='object'){near(a.x,b.x,label);near(a.y,b.y,label);return;}assert(Math.abs(a-b)<1e-7,(label||'coordinates')+': '+a+' vs '+b);}
function step(info,controller){const id=controller.ndLockList[0].__id__,node=info.byId[id],trigger=node.components.find(c=>c.value.__type__==='cc.PolygonCollider').value,a=node.source._trs.array;return trigger.points.map(p=>Maps.point(node.world,{x:p.x/a[7],y:p.y/a[8]}));}
// CCNode._initProperties calls _fromEuler after copying serialized _trs, and
// updateLocalMatrix2D uses _eulerAngles. Missing Euler metadata means zero.
function cocosInit(data){const result=M.clone(data);for(const node of result)if(node&&node.__type__==='cc.Node'&&node._trs){const a=node._trs.array,half=(node._eulerAngles&&node._eulerAngles.z||0)*Math.PI/360;a[3]=a[4]=0;a[5]=Math.sin(half);a[6]=Math.cos(half);}return result;}

test('current gates keep source identity and changed facing projects an idempotent source with an interior construction step',()=>{
 for(const slot of [17,19]){const f=fixture(slot),before=JSON.stringify(f.source.data);assert.equal(GateSource.project(f.source.data,f.building),f.source.data);
  for(const face of faces){const b=Object.assign({},f.building,{wallFacing:face}),source=GateSource.project(f.source.data,b),info=Maps.model(source),owner=info.byId[b.template.node],controller=source[owner.ownerComponent],main=info.byId[source[controller.ndAniMain.__id__].node.__id__];
   if(face===f.building.wallFacing)assert.equal(source,f.source.data);else assert.notEqual(source,f.source.data);assert.equal(GateSource.project(source,b),source);assert.equal(controller.wallFacing,face);
   assert.equal(main.world[0]*main.world[3]-main.world[1]*main.world[2]<0,Facing.mirrorX(face));
   const plate=info.byId[controller.ndLockList[0].__id__],normal=Facing.normal(face),k=Math.abs(normal.y/normal.x),dx=plate.position.x-owner.position.x,dy=plate.position.y-owner.position.y;assert(dx*normal.x+dy*normal.y/(k*k)<0,'hero stands inside, opposite '+face+' outward opening');
  }
  assert.equal(JSON.stringify(f.source.data),before,'preview projection must not change source templates');
 }
});

test('all four faces keep preview models, navigation, exported fixtures and actual hero trigger geometry aligned under placement transforms',()=>{
 const f=fixture(),before=JSON.stringify({source:f.source.data,stage:f.stage});
 for(const face of faces){const b=Object.assign(M.clone(f.building),{wallFacing:face,id:42,x:317,y:-112,scale:1.4,angle:29}),stage=Object.assign({},f.stage,{buildings:[b]}),record=Preview.describe(f.service,stage).buildings[b.id].levels[1],exported=P.compose(root,M.createMap('gate-test','Gate test','forest'),stage,{ground:[],assets:{}},{Map01:f.source.data}),info=Maps.model(cocosInit(exported)),owner=info.owners.find(n=>n.kind==='building'),controller=exported[owner.ownerComponent],controlled=new Set([owner.id].concat((controller.ndAniOther||[]).map(r=>exported[r.__id__].node.__id__)));
  assert.equal(controller.wallFacing,face);assert.equal(controller.ID,42);
  const actual=info.colliders.filter(c=>controlled.has(c.node)&&c.type==='cc.PhysicsPolygonCollider'&&Number(c.source.tag)===1&&!c.sensor).map(c=>c.points),expected=record.blockers.map(shape=>shape.map(p=>M.toWorld(b,p)));
  near(actual,expected,'exported building blockers');near(Navigation.buildingPolygons(f.service,stage,b,1,'closed',f.config,new Map()),expected,'navigation blockers');
  near(step(info,controller),record.step.map(p=>M.toWorld(b,p)),'runtime hero build trigger');
  const refs=[controller.ndAniDown,controller.ndAniMain].concat(controller.ndAniOther),placement=M.matrix(b),offset=[1,0,0,1,-record.origin.x,-record.origin.y];
  refs.forEach((ref,i)=>near(info.byId[exported[ref.__id__].node.__id__].world,Maps.multiply(placement,Maps.multiply(offset,record.skeletons[i].matrix)),'exported upright model matrix'));
  assert.equal(record.openBlockers.length,2);near(Navigation.buildingPolygons(f.service,stage,b,1,'open',f.config,new Map()),record.openBlockers.map(shape=>shape.map(p=>M.toWorld(b,p))),'open ally passage retains wings');
 }
 assert.equal(JSON.stringify({source:f.source.data,stage:f.stage}),before);
});

test('generated and projected rotations keep Euler metadata aligned with quaternion transforms through Creator initialization',()=>{
 const f=fixture();for(const face of faces){const b=Object.assign({},f.building,{wallFacing:face}),source=GateSource.project(f.source.data,b),before=Maps.model(source),after=Maps.model(cocosInit(source));for(const id of b.template.roots)near(after.byId[id].world,before.byId[id].world,'projected root survives Creator initialization');}
 const map=M.createLayer(M.createMap('rotated-art','Rotated art','forest'),'Rotated decorations'),layer=map.layers[1];layer.transform={x:30,y:-15,scale:1.2,angle:17};layer.objects.push({id:'rotated',name:'Rotated prop',assetId:'prop',x:50,y:60,scale:.8,angle:37,flipX:true,depth:'world',ground:{x:0,y:0},polygons:[]});
 const source=P.skeleton('Rotated test',map);P.addEnvironment(root,source,map,{ground:[],assets:{prop:{frames:[{name:'prop',frameUuid:'00000000-0000-4000-a000-000000000000',x:0,y:0,width:10,height:20}]}}});const before=Maps.model(source),after=Maps.model(cocosInit(source)),owner=before.owners.find(n=>n.name==='Rotated prop');near(after.byId[owner.id].world,owner.world,'rotated scenery survives Creator initialization');assert.equal(source[owner.id]._eulerAngles.z,54);
});

test('explicit compass faces invalidate preview composition and retain each face saved placements',()=>{
 const f=fixture(),index=f.service.index();f.service.index=()=>index;
 f.building.wallFacing='SW';const sw=Preview.describe(f.service,f.stage),base=sw.buildings[f.building.id].levels[1];f.building.wallFacing='NE';const ne=Preview.describe(f.service,f.stage),reversed=ne.buildings[f.building.id].levels[1];
 assert.notEqual(ne,sw);assert.deepEqual(base.blockers,reversed.blockers);
 for(let i=0;i<base.skeletons.length;i++){assert.equal(base.skeletons[i].source,reversed.skeletons[i].source);if(i<2){assert.notEqual(base.skeletons[i].revision,reversed.skeletons[i].revision);const raw=Facing.mirrorJson(Adjustments.restore(base.skeletons[i].json)),expected=raw.wallKit?Adjustments.apply(raw,raw.wallKit.layout,{tier:1,face:'NE',data:reversed.wallAdjustmentData}):raw;assert.deepEqual(reversed.skeletons[i].json,expected);}else{assert.equal(base.skeletons[i].revision,reversed.skeletons[i].revision);assert.deepEqual(base.skeletons[i].json,reversed.skeletons[i].json);}}
});

test('wall-facing metadata validates explicit compass choices without adding a default to legacy records',()=>{
 const f=fixture();delete f.building.wallFacing;const original=JSON.stringify(f.stage);for(const face of faces){f.building.wallFacing=face;assert(!M.validateStage(f.stage).some(i=>/Wall facing/.test(i)));}
 for(const value of ['north','',null,4]){f.building.wallFacing=value;assert(M.validateStage(f.stage).some(i=>/Wall facing/.test(i)));}
 delete f.building.wallFacing;assert.equal(JSON.stringify(f.stage),original);assert(!M.validateStage(f.stage).some(i=>/Wall facing/.test(i)));
 const data=M.clone(f.source.data),before=JSON.stringify(data);GateSource.finishExport(f.source.data,f.building,data,{});assert.equal(JSON.stringify(data),before,'legacy export has no optional-facing adjustments');
});

test('recovery from exported prefabs retains explicit compass faces and baked geometry without adding legacy defaults',()=>{
 const f=fixture(),directory=temporary('hkd-gate-recovery-'),scripts=path.join(directory,'assets/_script');fs.mkdirSync(scripts,{recursive:true});
 for(const name of ['KinghtFallBuildMainFortress','KinghtFallBuildBartizan','KinghtFallBuildBarracks','KinghtFallBuildHome','KinghtFallBuildMill','KinghtFallBuildWall','KinghtFallCommerce'])fs.copyFileSync(path.join(root,'assets/_script',name+'.js.meta'),path.join(scripts,name+'.js.meta'));
 for(const face of faces){const b=Object.assign(M.clone(f.building),{wallFacing:face,x:170,y:-200,scale:.9,angle:113}),stage=Object.assign({},f.stage,{buildings:[b]}),exported=P.compose(root,M.createMap('recovery','Recovery','forest'),stage,{ground:[],assets:{}},{Map01:f.source.data}),file='Recovered-'+face,folder=path.join(directory,'assets/KinghtFallIconMap');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,file+'.prefab'),JSON.stringify(exported));
  const config=Object.assign(M.clone(f.config.LevelCfg[0]),{prefab:file,HomeLevel1Unlock:[[6,b.id]],HomeLevel2Unlock:[],HomeLevel3Unlock:[]}),recovered=L.adaptStage(directory,'A',1,config),building=recovered.buildings[0];assert.equal(building.wallFacing,face);assert.equal(building.id,b.id);
  assert.equal(GateSource.project(exported,building),exported,'generated source geometry is already projected, including its placement rotation');
  const service={root,source:()=>exported,index:f.service.index},record=Preview.describe(service,recovered).buildings[building.id].levels[1];assert(record.skeletons.length);assert.equal(record.skeletons[0].revision.endsWith(':reverse-gate'),Facing.reverse(face));
 }
 const source=L.inspect(root,'Map01'),before=JSON.stringify(source.data),adapted=L.adaptStage(root,'A',1);assert(adapted.buildings.filter(b=>b.kind===6).every(b=>Facing.valid(b.wallFacing)),'opening migrated sources retains their explicit compass faces');assert.equal(JSON.stringify(source.data),before,'opening sources never writes or reseeds their metadata');
});
