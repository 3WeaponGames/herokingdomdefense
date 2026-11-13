'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const Gate=require('../worlds/gate-facing'),Preview=require('../worlds/building-preview'),Navigation=require('../worlds/navigation'),P=require('../worlds/prefab'),L=require('../worlds/legacy'),M=require('../worlds/model'),Maps=require('../lib/map-assets'),temporary=require('./owned-temp');
const root=path.resolve(__dirname,'../../..');
function fixture(slot=19){const source=L.inspect(root,'Map01'),config=L.read(root,L.configFile('A')),stage=L.adaptStage(root,'A',1,Object.assign(M.clone(config.LevelCfg[0]),{prefab:'Map01'})),building=stage.buildings.find(b=>b.id===slot),index={documents:{A:config}};assert.equal(building&&building.kind,6,'The wall and geometry source must both use Map01');building.enabled=true;building.unlock=1;stage.buildings=[building];stage.specials=[];return{source,config,stage,building,service:{root,source:()=>source.data,index:()=>index}};}
function near(a,b,label){if(Array.isArray(a)){assert.equal(a.length,b.length,label);a.forEach((v,i)=>near(v,b[i],label));return;}if(a&&typeof a==='object'){near(a.x,b.x,label);near(a.y,b.y,label);return;}assert(Math.abs(a-b)<1e-7,(label||'coordinates')+': '+a+' vs '+b);}
function controller(data,building){const info=Maps.model(data),owner=info.byId[building.template.node];return{info,owner,component:owner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID)).value};}
function nodeId(data,ref){const v=ref&&data[ref.__id__];return v&&v.__type__==='cc.Node'?ref.__id__:v&&v.node&&v.node.__id__;}
function step(info,component){const n=info.byId[component.ndLockList[0].__id__],trigger=n.components.find(c=>c.value.__type__==='cc.PolygonCollider').value,a=n.source._trs.array;return trigger.points.map(p=>Maps.point(n.world,{x:p.x/a[7],y:p.y/a[8]}));}
function cocos(data){const copy=M.clone(data);for(const n of copy)if(n&&n.__type__==='cc.Node'&&n._trs){const half=(n._eulerAngles&&n._eulerAngles.z||0)*Math.PI/360,a=n._trs.array;a[3]=a[4]=0;a[5]=Math.sin(half);a[6]=Math.cos(half);}return copy;}

test('fine wall angles turn the actual wall, wings, body and gate proximity while every purchase field stays fixed',()=>{
 for(const slot of [17,19]){const f=fixture(slot),original=JSON.stringify(f.source.data);
 for(const face of [undefined,'SW','SE','NW','NE'])for(const angle of [-22.5,17]){
  const base=Object.assign({},f.building,face?{wallFacing:face}:{}),rotated=Object.assign({},base,{wallRotation:angle}),before=Gate.project(f.source.data,base),after=Gate.project(f.source.data,rotated),a=controller(before,base),b=controller(after,rotated),R=Gate.around(a.owner.position,angle),actual=Maps.model(cocos(after));
  assert.equal(Gate.project(after,rotated),after);assert.equal(b.component.wallRotation,angle);near(b.owner.world,a.owner.world,'controller and purchase pivot remain fixed');
  for(const ref of a.component.ndLockList){const id=nodeId(before,ref);near(b.info.byId[id].world,a.info.byId[id].world,'purchase plate transform');assert.deepEqual(after[id],before[id],'purchase plate serialized data');}
  near(step(b.info,b.component),step(a.info,a.component),'purchase trigger world polygon');
  const models=[a.component.ndAniMain,a.component.ndAniDown].concat(a.component.ndAniOther),controlled=new Set([a.owner.id]);
  for(const ref of models){const id=nodeId(before,ref);controlled.add(id);near(b.info.byId[id].world,Maps.multiply(R,a.info.byId[id].world),'wall model world pose');near(actual.byId[id].world,b.info.byId[id].world,'fine rotation survives Creator deserialization');}
  for(const collider of a.info.colliders.filter(c=>controlled.has(c.node)))near(b.info.colliders.find(c=>c.id===collider.id).points,collider.points.map(p=>Maps.point(R,p)),'built collision follows wall');
  const trigger=a.owner.components.find(c=>c.value.__type__==='cc.PolygonCollider'),next=b.owner.components.find(c=>c.id===trigger.id);
  near(next.value.points.map(p=>Maps.point(b.owner.world,p)),trigger.value.points.map(p=>Maps.point(R,Maps.point(a.owner.world,p))),'friendly gate detection follows its rotated passage');
 }
 assert.equal(JSON.stringify(f.source.data),original,'browsing rotations never edits source assets');
 }
});

test('fine-angle preview, open-gate navigation and exported native models/colliders stay aligned under placement transforms',()=>{
 const f=fixture(),original=JSON.stringify(f.stage);
 for(const face of ['SW','SE','NW','NE'])for(const angle of [-18,13.5]){
  const b=Object.assign(M.clone(f.building),{wallFacing:face,wallRotation:angle,id:42,x:317,y:-112,scale:1.4,angle:29}),stage=Object.assign({},f.stage,{buildings:[b]}),record=Preview.describe(f.service,stage).buildings[b.id].levels[1],exported=P.compose(root,M.createMap('wall-angle-test','Wall angle test','forest'),stage,{ground:[],assets:{}},{Map01:f.source.data}),info=Maps.model(cocos(exported)),owner=info.owners.find(n=>n.kind==='building'),c=exported[owner.ownerComponent],controlled=new Set([owner.id].concat((c.ndAniOther||[]).map(ref=>exported[ref.__id__].node.__id__))),tag=Navigation.colliderIndex(b,1,f.config);
  assert.equal(c.wallRotation,angle);const expected=record.blockers.map(shape=>shape.map(p=>M.toWorld(b,p)));
  near(info.colliders.filter(c=>controlled.has(c.node)&&c.type==='cc.PhysicsPolygonCollider'&&Number(c.source.tag)===tag&&!c.sensor).map(c=>c.points),expected,'exported wall collision');
  near(Navigation.buildingPolygons(f.service,stage,b,1,'closed',f.config,new Map()),expected,'closed gate navigation');
  near(step(info,c),record.step.map(p=>M.toWorld(b,p)),'unchanged purchase field retains runtime hero trigger');
  const refs=[c.ndAniDown,c.ndAniMain].concat(c.ndAniOther),placement=M.matrix(b),offset=[1,0,0,1,-record.origin.x,-record.origin.y];
  refs.forEach((ref,i)=>near(info.byId[exported[ref.__id__].node.__id__].world,Maps.multiply(placement,Maps.multiply(offset,record.skeletons[i].matrix)),'runtime wall model matches its preview'));
  assert.equal(record.openBlockers.length,2);near(Navigation.buildingPolygons(f.service,stage,b,1,'open',f.config,new Map()),record.openBlockers.map(shape=>shape.map(p=>M.toWorld(b,p))),'open ally passage retains rotated wings');
 }
 assert.equal(JSON.stringify(f.stage),original);
 const before=Preview.describe(f.service,f.stage);f.building.wallRotation=12;const after=Preview.describe(f.service,f.stage);assert.notEqual(after,before,'fine rotation invalidates the composition cache');near(after.buildings[f.building.id].levels[1].step,before.buildings[f.building.id].levels[1].step,'fine rotation does not change the plate preview');
});

test('rotation defaults are exact no-ops and invalid angles cannot silently alter wall templates',()=>{
 const f=fixture();assert.equal(Gate.project(f.source.data,f.building),f.source.data);assert.equal(Gate.project(f.source.data,Object.assign({},f.building,{wallRotation:0})),f.source.data);
 for(const value of ['15',NaN,Infinity,null])assert.throws(()=>Gate.project(f.source.data,Object.assign({},f.building,{wallRotation:value})),/finite angle/);
 const stage=M.clone(f.stage);for(const value of [0,13,-22.5]){stage.buildings[0].wallRotation=value;assert(!M.validateStage(stage).some(i=>/Wall rotation/.test(i)));}
 for(const value of ['15',NaN,Infinity,null]){stage.buildings[0].wallRotation=value;assert(M.validateStage(stage).some(i=>/Wall rotation/.test(i)));}
 delete stage.buildings[0].wallRotation;assert(!M.validateStage(stage).some(i=>/Wall rotation/.test(i)));
});

test('generated-prefab recovery retains wall-only angles and edits them as deltas without moving construction fields',()=>{
 const f=fixture(),directory=temporary('hkd-wall-angle-recovery-'),scripts=path.join(directory,'assets/_script');fs.mkdirSync(scripts,{recursive:true});
 for(const name of ['KinghtFallBuildMainFortress','KinghtFallBuildBartizan','KinghtFallBuildBarracks','KinghtFallBuildHome','KinghtFallBuildMill','KinghtFallBuildWall','KinghtFallCommerce'])fs.copyFileSync(path.join(root,'assets/_script',name+'.js.meta'),path.join(scripts,name+'.js.meta'));
 const b=Object.assign(M.clone(f.building),{wallFacing:'NW',wallRotation:16.5,x:170,y:-200,scale:.9,angle:113}),stage=Object.assign({},f.stage,{buildings:[b]}),exported=P.compose(root,M.createMap('recovery','Recovery','forest'),stage,{ground:[],assets:{}},{Map01:f.source.data}),folder=path.join(directory,'assets/KinghtFallIconMap');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'Recovered.prefab'),JSON.stringify(exported));
 const cfg=Object.assign(M.clone(f.config.LevelCfg[0]),{prefab:'Recovered',HomeLevel1Unlock:[[6,b.id]],HomeLevel2Unlock:[],HomeLevel3Unlock:[]}),recovered=L.adaptStage(directory,'A',1,cfg),wall=recovered.buildings[0];assert.equal(wall.wallRotation,16.5);assert.equal(Gate.project(exported,wall),exported);
 const next=Object.assign({},wall,{wallRotation:-7}),source=Gate.project(exported,next),before=controller(exported,wall),after=controller(source,next),R=Gate.around(before.owner.position,-23.5);
 near(step(after.info,after.component),step(before.info,before.component),'editing recovered fine angle leaves construction trigger fixed');
 const id=nodeId(exported,before.component.ndAniMain);near(after.info.byId[id].world,Maps.multiply(R,before.info.byId[id].world),'recovered fine angle applies only its delta');
 const reset=controller(Gate.project(exported,Object.assign({},wall,{wallRotation:0})),wall);assert.equal(reset.component.wallRotation,0);near(reset.info.byId[id].world,Maps.multiply(Gate.around(before.owner.position,-16.5),before.info.byId[id].world),'explicit zero resets a baked fine angle');near(step(reset.info,reset.component),step(before.info,before.component),'reset leaves the field fixed');
 const newFace=Object.assign({},wall,{wallFacing:'SE'}),zero=Gate.project(exported,Object.assign({},newFace,{wallRotation:0})),turned=Gate.project(exported,newFace),a=controller(zero,newFace),z=controller(turned,newFace);near(z.info.byId[id].world,Maps.multiply(Gate.around(a.owner.position,16.5),a.info.byId[id].world),'compass changes keep the authored fine-angle sign');
});
