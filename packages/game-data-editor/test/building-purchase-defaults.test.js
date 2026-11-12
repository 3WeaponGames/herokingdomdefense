'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Settings=require('../../../assets/_script/BuildingPurchaseField'),{Service}=require('../worlds/service'),{Store}=require('../lib/store'),Purchase=require('../worlds/purchase-field'),Data=require('../buildings/purchase-data'),Preview=require('../worlds/building-preview'),Gate=require('../worlds/gate-facing'),Maps=require('../lib/map-assets'),Schema=require('../lib/schema'),L=require('../worlds/legacy');
const {Node,Vec2,PolygonCollider}=require('../../../tools/navigation/runtime-harness.cjs'),root=path.resolve(__dirname,'../../..'),clone=v=>JSON.parse(JSON.stringify(v));
function runtime(source,building,category,row){
 const info=Maps.model(source),nodes=new Map();
 for(const n of info.nodes)nodes.set(n.id,new Node(n.name));
 for(const n of info.nodes){const actual=nodes.get(n.id),parent=info.byId[n.parent],m=parent?Maps.multiply(Maps.inverse(parent.world),n.world):n.world;actual.x=m[4];actual.y=m[5];actual.scaleX=Math.hypot(m[0],m[1]);actual.scaleY=(m[0]*m[3]-m[1]*m[2])/actual.scaleX;actual.angle=Math.atan2(m[1],m[0])*180/Math.PI;if(parent)actual.setParent(nodes.get(parent.id));for(const c of n.components)if(c.value.__type__==='cc.PolygonCollider'){const collider=actual.addComponent(PolygonCollider);collider.points=c.value.points.map(p=>new Vec2(p.x,p.y));}}
 const owner=info.byId[building.template.node],component=owner.components.find(c=>c.value.ndAniMain).value,build={node:nodes.get(owner.id),ndAniMain:{node:nodes.get(source[component.ndAniMain.__id__].node.__id__)},ndLockList:component.ndLockList.map(ref=>nodes.get(ref.__id__)),purchaseSide:component.purchaseSide,purchaseOffset:component.purchaseOffset,purchaseOverride:component.purchaseOverride,buildCfg:category,buildInfo:{cfg:row},wallFacing:building.wallFacing||component.wallFacing};
 const unit={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingPurchaseFieldRuntime.js'),'utf8'),{exports:unit.exports,cc:{v2:(x,y)=>new Vec2(x,y),PolygonCollider},require:name=>name==='BuildingPurchaseField'?Settings:require('../../../assets/_script/'+name)});
 return {build,nodes,info,module:unit.exports};
}
function close(a,b){assert(Math.abs(a-b)<1e-7,a+' differs from '+b);}
function fixture(){const store=new Store(root),service=new Service(root,{previewConfig:()=>store.documents.A.data});return {store,service,config:store.documents.A.data};}

test('Southeast is the authoring default, wall facings are independent, and future placement variants use the same resolver',()=>{
 const category={enumValue:6,levelList:[{index:1,level:1,BranchBuild:[2,3]},{index:2,level:2},{index:3,level:2}]};
 assert.deepEqual(Settings.variants(category).map(p=>p.id),['NE','NW','SE','SW']);assert.equal(Settings.resolve(category,category.levelList[0],'NE'),null);
 category.levelList[0].PurchaseField={variants:{NE:{southwest:true,x:12,y:-5},SW:{southwest:false,x:-4,y:8}}};
 assert.deepEqual(Settings.resolve(category,category.levelList[1],'NE'),{southwest:true,x:12,y:-5});assert.deepEqual(Settings.resolve(category,category.levelList[2],'SW'),{southwest:false,x:-4,y:8});assert.deepEqual(Settings.resolve(category,category.levelList[1],'NW'),{southwest:false,x:0,y:0});
 category.levelList[1].PurchaseField={variants:{NE:{x:70}}};assert.deepEqual(Settings.resolve(category,category.levelList[1],'NE'),{southwest:true,x:70,y:-5});
 category.enumValue=2;category.PlacementVariants=[{id:'left',label:'Left'},{id:'right',label:'Right'}];assert.deepEqual(Settings.variants(category),category.PlacementVariants);assert(Settings.valid(category.levelList[0].PurchaseField));assert(!Settings.valid({x:Infinity}));assert(!Settings.valid({variants:{constructor:{x:0}}}));
});

test('browsing every wall pad variant and tier uses the real model and creates no drafts or scene writes',()=>{
 const f=fixture(),before=f.store.draftState(),source=JSON.stringify(f.service.source('Map01'));
 for(const variant of ['NE','NW','SE','SW'])for(const levelIndex of [0,1,2]){const data=Data.describe(f.service,{id:'6',levelIndex,variant});assert.deepEqual(data.settings,{southwest:false,x:0,y:0});assert.equal(data.variants.length,4);assert(data.records.southeast.skeletons.length);assert(data.records.southeast.step.length>=3);assert(data.records.southwest.purchaseField.center.x<0);assert(data.records.southeast.purchaseField.center.x>0);}
 assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.changes().length,0);assert.equal(JSON.stringify(f.service.source('Map01')),source);
});

test('native pad transforms and standing triggers match editor projection for every building, wall facing, tier and side',()=>{
 const f=fixture();let count=0;
 for(const template of f.service.buildingCatalog())for(const variant of template.kind===6?['NE','NW','SE','SW']:['default'])for(const southwest of [false,true]){
  const category=clone(f.config.BuildEnum[template.kind]);
  for(const row of category.levelList.slice(0,3)){
   const b=Object.assign(clone(template),{previewBranch:row.index,purchaseOverride:false});delete b.purchaseSide;delete b.purchaseOffset;if(template.kind===6)b.wallFacing=variant;
   row.PurchaseField={variants:{[variant]:{southwest,x:17.25,y:-9.5}}};
   const config={BuildEnum:{[template.kind]:category}},raw=Gate.project(f.service.source(b.template.prefab),b,root),configured=Purchase.withDefaults(b,config,1,raw),projected=Maps.model(Purchase.project(raw,configured)),r=runtime(raw,b,category,row);r.module.apply(r.build);
   for(const field of r.build.ndLockList){const expected=projected.nodes.find(n=>n.id===Array.from(r.nodes).find(([_id,node])=>node===field)[0]);const actual=field.convertToWorldSpaceAR(new Vec2());close(actual.x,expected.position.x);close(actual.y,expected.position.y);const collider=field.getComponent(PolygonCollider),serialized=expected.components.find(c=>c.value.__type__==='cc.PolygonCollider');if(collider&&serialized){const a=expected.source._trs.array;for(let i=0;i<collider.points.length;i++){const p=collider.points[i],real=field.convertToWorldSpaceAR(new Vec2(p.x/field.scaleX,p.y/field.scaleY)),q=Maps.point(expected.world,{x:serialized.value.points[i].x/a[7],y:serialized.value.points[i].y/a[8]});close(real.x,q.x);close(real.y,q.y);}}}
   const first=clone(r.build.ndLockList[0].getPosition());r.module.apply(r.build);close(r.build.ndLockList[0].x,first.x);close(r.build.ndLockList[0].y,first.y);count++;
  }
 }
 assert(count>=48);
});

test('saved pad defaults update the stage preview while explicit stage overrides and popup icon offsets remain intact',()=>{
 const f=fixture(),b=clone(f.service.buildingCatalog().find(b=>b.kind===2)),stage={variant:'A',buildings:[b]},before=clone(f.config.BuildEnum[2].levelList[0]),old=Preview.describe(f.service,stage).buildings[b.id].levels[1].purchaseField.center;
 f.store.change({version:f.store.version,edits:[{doc:'A',path:['BuildEnum','2','levelList',0,'PurchaseField'],value:{southwest:true,x:35,y:7}}]});
 const result=Preview.describe(f.service,stage).buildings[b.id].levels[1];assert(result.purchaseField.center.x<old.x);assert.deepEqual(f.config.BuildEnum[2].levelList[0].Excursion,before.Excursion);assert.equal(f.config.BuildEnum[2].levelList[0].Zoom,before.Zoom);
 stage.buildings[0].purchaseOverride=true;stage.buildings[0].purchaseSide='default';stage.buildings[0].purchaseOffset={x:90,y:0};assert(Preview.describe(f.service,stage).buildings[b.id].levels[1].purchaseField.center.x>0);
 const snap=f.store.snapshot();assert(!snap.issues.some(i=>i.severity==='error'&&i.path.join('.').includes('PurchaseField')));
});

test('map movement and scale do not alter authored pad offsets, and a missing saved setting preserves legacy poses',()=>{
 const f=fixture(),b=clone(f.service.buildingCatalog().find(b=>b.kind===2)),category=clone(f.config.BuildEnum[2]),row=category.levelList[0],raw=f.service.source(b.template.prefab),r=runtime(raw,b,category,row),before=r.build.ndLockList.map(n=>n.convertToWorldSpaceAR(new Vec2()));
 r.module.apply(r.build);r.build.ndLockList.forEach((n,i)=>{const p=n.convertToWorldSpaceAR(new Vec2());close(p.x,before[i].x);close(p.y,before[i].y);});assert(!r.build._purchaseFieldRuntime);
 row.PurchaseField={southwest:true,x:24,y:-8};const projected=Maps.model(Purchase.project(raw,Purchase.withDefaults(b,{BuildEnum:{2:category}},1,raw))),fieldId=Array.from(r.nodes).find(([_id,n])=>n===r.build.ndLockList[0])[0],parentId=r.info.byId[r.info.byId[b.template.node].parent].id,expected=Maps.point(Maps.inverse(r.info.byId[parentId].world),projected.byId[fieldId].position),parent=r.build.node.parent;
 let mapRoot=parent;const ancestors=[];for(let n=r.build.ndLockList[0];n;n=n.parent)ancestors.push(n);while(mapRoot&&!ancestors.includes(mapRoot))mapRoot=mapRoot.parent;mapRoot.x+=123;mapRoot.y-=87;mapRoot.scaleX*=.7;mapRoot.scaleY*=.7;mapRoot.angle+=23;r.module.apply(r.build);
 const actual=parent.convertToNodeSpaceAR(r.build.ndLockList[0].convertToWorldSpaceAR(new Vec2()));close(actual.x,expected.x);close(actual.y,expected.y);
 delete row.PurchaseField;r.module.apply(r.build);assert(!r.build._purchaseFieldRuntime);const restored=r.build.ndLockList[0].convertToWorldSpaceAR(new Vec2()),originalInParent=Maps.point(Maps.inverse(r.info.byId[parentId].world),before[0]),restoredLocal=parent.convertToNodeSpaceAR(restored);close(restoredLocal.x,originalInParent.x);close(restoredLocal.y,originalInParent.y);
});

test('pad preview offsets and standing triggers match saved defaults after world resizing in every facing',()=>{
 const f=fixture(),WorldScale=fs.readFileSync(path.join(root,'assets/_script/BuildingWorldScale.js'),'utf8'),{RigidBody,PhysicsPolygonCollider}=require('../../../tools/navigation/runtime-harness.cjs');let count=0;
 for(const kind of [1,2,3,4,5,6])for(const variant of kind===6?['NE','NW','SE','SW']:['default'])for(const factor of [.6,1.35])for(const southwest of [false,true]){
  const template=f.service.buildingCatalog().find(b=>b.kind===kind),category=f.config.BuildEnum[kind],row=category.levelList[0];row.WorldScale=factor;row.PurchaseField={variants:{[variant]:{southwest,x:17.25,y:-9.5}}};
  const b=Object.assign(clone(template),{previewBranch:row.index,purchaseOverride:false});delete b.purchaseSide;delete b.purchaseOffset;if(kind===6)b.wallFacing=variant;
  const data=Data.describe(f.service,{id:String(kind),levelIndex:0,variant}),delta=Maps.point(data.offsetMatrix,{x:17.25,y:-9.5}),preview=data.records[southwest?'southwest':'southeast'],saved=Preview.describe(f.service,{variant:'A',buildings:[b]}).buildings[b.id].levels[1];
  preview.step.forEach((p,i)=>{close(p.x+delta.x,saved.step[i].x);close(p.y+delta.y,saved.step[i].y);});const moved=Maps.point(Maps.inverse(data.offsetMatrix),delta);close(moved.x,17.25);close(moved.y,-9.5);
  const raw=Gate.project(f.service.source(b.template.prefab),b,root),r=runtime(raw,b,category,row),scale={exports:{}};r.module.apply(r.build);vm.runInNewContext(WorldScale,{exports:scale.exports,cc:{v2:(x,y)=>new Vec2(x,y),RigidBody,PhysicsCollider:PhysicsPolygonCollider,isValid:()=>true}});scale.exports.apply(r.build);
  const field=r.build.ndLockList[0],actual=field.convertToWorldSpaceAR(new Vec2()),expected=saved.purchaseField.center;close(actual.x-r.info.byId[b.template.node].position.x,expected.x);close(actual.y-r.info.byId[b.template.node].position.y,expected.y);count++;
 }
 assert.equal(count,36);
});
