'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('path'),fs=require('fs'),vm=require('vm');
const L=require('../worlds/legacy'),M=require('../worlds/model'),Maps=require('../lib/map-assets'),P=require('../worlds/prefab'),Purchase=require('../worlds/purchase-field'),Gate=require('../worlds/gate-facing');
const root=path.resolve(__dirname,'../../..'),clone=M.clone;
function fixture(mapId,kind){const config=L.read(root,L.configFile('A')).LevelCfg.find(c=>c.Level===(mapId==='Map01'?1:7)),stage=L.adaptStage(root,'A',config.Level,config),building=stage.buildings.find(b=>b.kind===(kind||2));assert(building,'configured stage must contain building kind '+(kind||2));const source=L.inspect(root,building.template.prefab);assert.equal(source.revision,building.template.revision,'fixture and building references must use the same configured source');return {source,stage,building};}
function controller(info,source,b){const owner=info.byId[b.template.node],record=owner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID));return {owner,record,locks:record.value.ndLockList.map(ref=>info.byId[ref.__id__])};}
function close(a,b){assert.equal(a.length,b.length);a.forEach((n,i)=>assert(Math.abs(n-b[i])<1e-7,n+' != '+b[i]));}
function step(info,node){const collider=node.components.find(c=>c.value.__type__==='cc.PolygonCollider').value,a=node.source._trs.array;return collider.points.map(p=>Maps.point(node.world,{x:p.x/a[7],y:p.y/a[8]}));}
function exported(f,b){const source=Purchase.project(Gate.project(f.source.data,b),b),info=Maps.model(source),map=M.createMap('test','Test','forest'),target=P.skeleton('Test',map),layers=Maps.model(target).roots,parents={};for(const id of b.template.roots)parents[id]=layers[info.byId[info.byId[id].parent].name]||layers.ndMain;const mapping=P.copyFamily(target,source,b.template.roots,parents,{x:b.x,y:b.y,origin:info.byId[b.template.node].position},b.scale,b.angle);Gate.finishExport(source,b,target,mapping);Purchase.finishExport(source,b,target,mapping);return {source,target,mapping};}
test('opening authored purchase layouts is an exact no-op, including mirrored barracks fields',()=>{
 for(const kind of [2,3]){const f=fixture('Map07',kind),before=JSON.stringify(f.source.data);assert.equal(Purchase.project(f.source.data,f.building),f.source.data);assert.equal(JSON.stringify(f.source.data),before);assert.equal(Purchase.valid('northwest'),false);assert.throws(()=>Purchase.project(f.source.data,{...f.building,purchaseSide:'northwest'}),/Choose Default/);}
});
test('SW and SE fields are grid-aligned at every tier without changing building models, fixtures or source data',()=>{
 for(const kind of [2,3])for(const purchaseSide of ['flip','default']){
  const f=fixture('Map07',kind),b={...clone(f.building),x:123,y:-245,angle:23,scale:1.4,purchaseSide,purchaseOffset:{x:0,y:0}},before=JSON.stringify(f.source.data),projected=Purchase.project(f.source.data,b),info=Maps.model(projected),actual=controller(info,projected,b),changed=new Set(actual.locks.flatMap(n=>[n.parent,n.id]));changed.add(actual.record.id);
  assert.equal(projected.length,f.source.data.length);for(let i=0;i<projected.length;i++)if(!changed.has(i))assert.deepEqual(projected[i],f.source.data[i],'unrelated source member '+i);
  const {target,mapping}=exported(f,b),output=Maps.model(target),outOwner=output.byId[mapping[actual.owner.id]],outController=outOwner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID));assert.equal(outController.value.purchaseSide,purchaseSide);
  for(const plate of actual.locks){const after=output.byId[mapping[plate.id]],dx=after.position.x-b.x,dy=after.position.y-b.y;assert(dx*(purchaseSide==='flip'?-1:1)>0);assert(dy<0);assert(Math.abs(Math.abs(dx)+dy)<1e-7);assert(after.world[0]*(purchaseSide==='flip'?-1:1)>0&&after.world[3]>0);close([after.world[1],after.world[2]],[0,0]);assert.equal(after.source._trs.array[7],1);assert.equal(after.source._trs.array[8],1);
   const expected=step(info,plate).map(p=>M.toWorld(b,{x:p.x-actual.owner.position.x,y:p.y-actual.owner.position.y})),got=step(output,after);got.forEach((p,i)=>close([p.x,p.y],[expected[i].x,expected[i].y]));
  }
  close(outOwner.position?[outOwner.position.x,outOwner.position.y]:[],[b.x,b.y]);assert.equal(JSON.stringify(f.source.data),before);assert.equal(Purchase.project(f.source.data,b),projected);
 }
});
test('runtime construction hit regions follow the field and remain stable during its upgrade pulse',()=>{
 const f=fixture('Map07',3),b={...clone(f.building),x:-120,y:333,angle:-37,scale:1.7,purchaseSide:'flip'},out=exported(f,b),info=Maps.model(out.target),owner=info.byId[out.mapping[b.template.node]],record=owner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID)),file=fs.readFileSync(path.join(root,'assets/_script/KinghtFallBuildBase.js'),'utf8'),start=file.indexOf('  _ctor.prototype.getLockPoint = function () {'),end=file.indexOf('  _ctor.prototype.startRoundGame',start),code=file.slice(start,end).replace('_ctor.prototype.getLockPoint =','module.exports ='),context={module:{exports:{}},console:{error:assert.fail},$z1KinghtFallEnum:{KinghtFallEnumBuildEnum:{None:0}},cc:{v2:(x,y)=>({x,y})}};vm.runInNewContext(code,context);
 const helperStart=file.indexOf('  _ctor.prototype.getPurchaseField = function () {'),helperEnd=file.indexOf('  _ctor.prototype.getColliderIndex',helperStart),helper={exports:{}};vm.runInNewContext(file.slice(helperStart,helperEnd).replace('_ctor.prototype.getPurchaseField =','module.exports ='),{module:helper});
 for(const ref of record.value.ndLockList){const plate=info.byId[ref.__id__],expected=step(info,plate),local=plate.source._trs.array,collider=plate.components.find(c=>c.value.__type__==='cc.PolygonCollider').value;for(const pulse of [.01,1,1.2]){const node={scaleX:local[7]*pulse,scaleY:local[8]*pulse,getComponent:()=>collider,convertToWorldSpaceAR:p=>Maps.point(Maps.multiply(plate.world,[pulse,0,0,pulse,0,0]),p)},actor={buildCfg:{enumValue:1},isDestroyed:false,canLock:true,buildInfo:{canUpgrade:true},ndLockList:[node],getLevel:()=>0,getPurchaseField:helper.exports},actual=context.module.exports.call(actor);actual.forEach((p,i)=>close([p.x,p.y],[expected[i].x,expected[i].y]));}}
});
test('recovered generated layouts keep their selected field without drift and reapply it after a gate-facing change',()=>{
 const f=fixture('Map01',6),b={...clone(f.building),purchaseSide:'default',purchaseOffset:{x:0,y:0},angle:0,wallFacing:'SW'},first=Purchase.project(Gate.project(f.source.data,b),b),recovered=clone(first);assert.equal(Purchase.project(recovered,b),recovered,'matching baked layouts stay untouched');
 const changed={...b,wallFacing:'NW'},next=Purchase.project(Gate.project(recovered,changed),changed),info=Maps.model(next),entry=controller(info,next,changed),plate=entry.locks[0];assert(plate.position.x-entry.owner.position.x>0);assert(plate.position.y-entry.owner.position.y<0);close([plate.world[1],plate.world[2]],[0,0]);assert(plate.world[0]>0&&plate.world[3]>0);
});

test('building X flip mirrors its art, physics, and purchase position while keeping the upgrade card readable',()=>{
 const f=fixture('Map07',3),b={...f.building,x:123,y:-245,angle:23,scale:1.4,purchaseSide:'flip',purchaseOffset:{x:8,y:12},purchaseOverride:true};
 const map=M.createMap('flip-test','Flip test','forest'),stage={...f.stage,buildings:[b],specials:[],spawns:[],graphs:[]};
 const build=building=>{
  const prefab=P.compose(root,map,{...stage,buildings:[building]},{ground:[],assets:{}},{[b.template.prefab]:f.source.data});
  const info=Maps.model(prefab),owner=info.owners.find(n=>prefab[n.ownerComponent].ID===b.id);
  const data=prefab[owner.ownerComponent],field=info.byId[data.ndLockList[0].__id__],card=field.children.map(id=>info.byId[id]).find(n=>n.name==='ndLock');
  return {prefab,info,owner,data,field,card};
 };
 const base=build(b),flipped=build({...b,flipX:true}),before=JSON.stringify(f.source.data);
 const mirror=p=>{const q=M.toLocal(b,p);return M.toWorld(b,{x:-q.x,y:q.y});};
 const compare=(a,c)=>{const q=mirror(a);close([c.x,c.y],[q.x,q.y]);};
 close([flipped.owner.position.x,flipped.owner.position.y],[b.x,b.y]);
 const left=base.owner.world,right=flipped.owner.world;
 compare({x:left[4]+left[0],y:left[5]+left[1]},{x:right[4]+right[0],y:right[5]+right[1]});
 compare(base.field.position,flipped.field.position);compare(base.card.position,flipped.card.position);
 close(base.card.world.slice(0,4),flipped.card.world.slice(0,4));
 step(base.info,base.field).forEach((point,i)=>compare(point,step(flipped.info,flipped.field)[i]));
 const fixtures=record=>record.info.colliders.filter(c=>c.node===record.owner.id&&c.type==='cc.PhysicsPolygonCollider');
 const a=fixtures(base),c=fixtures(flipped);assert(a.length>0);assert.equal(a.length,c.length);
 a.forEach((collider,i)=>collider.points.forEach((point,j)=>compare(point,c[i].points[j])));
 assert.equal(flipped.data.purchaseFlipAngle,b.angle);
 assert.equal(JSON.stringify(f.source.data),before);
});

test('tier purchase defaults retain the flipped placement and upright card after repeated application',()=>{
 const f=fixture('Map07',3),b={...f.building,x:123,y:-245,angle:23,scale:1.4,purchaseOverride:false};
 const config=L.read(root,L.configFile('A')),category=config.BuildEnum[3],map=M.createMap('flip-runtime','Flip runtime','forest');
 const {environment,Node}=require('../../../tools/navigation/runtime-harness.cjs'),e=environment();
 const runtime={},code=fs.readFileSync(path.join(root,'assets/_script/BuildingPurchaseFieldRuntime.js'),'utf8');
 vm.runInNewContext(code,{exports:runtime,cc:e.cc,require:name=>require(path.join(root,'assets/_script',name))});
 function runtimeOwner(flipX){
  const prefab=P.compose(root,map,{...f.stage,buildings:[{...b,flipX}],specials:[],spawns:[],graphs:[]},{ground:[],assets:{}},{[b.template.prefab]:f.source.data});
  const info=Maps.model(prefab),owner=info.owners.find(n=>prefab[n.ownerComponent].ID===b.id),data=prefab[owner.ownerComponent],nodes=new Map();
  function instantiate(id){
   if(nodes.has(id))return nodes.get(id);
   const desc=info.byId[id],t=desc.source._trs.array,parent=desc.parent===null||desc.parent===undefined?null:instantiate(desc.parent);
   const node=new Node(desc.name,parent,t[0],t[1]);node.angle=2*Math.atan2(t[5],t[6])*180/Math.PI;node.scaleX=t[7];node.scaleY=t[8];
   nodes.set(id,node);return node;
  }
  const node=instantiate(owner.id),ndLockList=data.ndLockList.map(ref=>instantiate(ref.__id__));
  const cardId=info.byId[data.ndLockList[0].__id__].children.find(id=>info.byId[id].name==='ndLock');
  const card=instantiate(cardId);
  return {node,ndLockList,card,buildCfg:category,buildInfo:{cfg:null},purchaseSide:data.purchaseSide,purchaseOffset:data.purchaseOffset,placementVariant:data.placementVariant,purchaseFlipAngle:data.purchaseFlipAngle};
 }
 const base=runtimeOwner(false),mirror=runtimeOwner(true),position=(n,x=0,y=0)=>n.convertToWorldSpaceAR(e.cc.v2(x,y)),basis=n=>{const o=position(n),x=position(n,1,0),y=position(n,0,1);return [x.x-o.x,x.y-o.y,y.x-o.x,y.y-o.y];},normal=basis(mirror.card);
 function compare(a,c){const q=M.toLocal(b,a),p=M.toWorld(b,{x:-q.x,y:q.y});close([c.x,c.y],[p.x,p.y]);}
 for(const row of [...category.levelList.slice(0,4),category.levelList[1],category.levelList[0]]) {
  for(const owner of [base,mirror]){owner.buildInfo.cfg=row;runtime.apply(owner);runtime.applyUnbuilt(owner);}
  compare(position(base.ndLockList[0]),position(mirror.ndLockList[0]));
  compare(position(base.card),position(mirror.card));
  close(basis(mirror.card),normal);
 }
});
