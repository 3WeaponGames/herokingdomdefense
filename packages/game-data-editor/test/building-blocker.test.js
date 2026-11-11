'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const {Service}=require('../worlds/service'),{Store}=require('../lib/store'),Data=require('../buildings/blocker-data'),Clip=require('../worlds/blockers'),Preview=require('../worlds/building-preview'),Nav=require('../worlds/navigation'),Maps=require('../lib/map-assets'),Gate=require('../worlds/gate-facing'),Kit=require('../../../assets/_script/WallKit'),Geometry=require('../../../assets/_script/BuildingBlocker');
const {Node,PhysicsPolygonCollider}=require('../../../tools/navigation/runtime-harness.cjs');
const root=path.resolve(__dirname,'../../..'),clone=v=>JSON.parse(JSON.stringify(v)),rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
function fixture(){const store=new Store(root),service=new Service(root,{previewConfig:()=>store.documents.A.data});return {store,service,config:store.documents.A.data};}
function node(matrix,name){const n=new Node(name);n.x=matrix[4];n.y=matrix[5];n.scaleX=Math.hypot(matrix[0],matrix[1]);n.scaleY=(matrix[0]*matrix[3]-matrix[1]*matrix[2])/n.scaleX;n.angle=Math.atan2(matrix[1],matrix[0])*180/Math.PI;return n;}
function runtime(service,stage,building,row){
 const source=Gate.project(service.source(building.template.prefab),building,root),info=Maps.model(source),owner=info.byId[building.template.node],controller=owner.components.find(c=>c.value.ndAniMain).value;
 const mainInfo=info.byId[source[controller.ndAniMain.__id__].node.__id__],main=node(mainInfo.world,'model'),ownerNode=node(owner.world,'owner');
 const result=Preview.describe(service,stage).buildings[building.id].levels[1],layout=result.skeletons.find(s=>s.json.wallKit).json.wallKit.layout;
 const other=(controller.ndAniOther||[]).map(ref=>node(info.byId[source[ref.__id__].node.__id__].world,'wing'));
 const build={node:ownerNode,ndAniMain:{node:main,skeletonData:{skeletonJson:{wallKit:{layout}}}},ndAniOther:other.map(node=>({node})),index:row.index,buildInfo:{cfg:row},getColliderIndex:()=>row.index,colPoint:{}};
 let serial=0;
 for(const n of [ownerNode,...other])for(const tag of [1,2,3]){const c=n.addComponent(PhysicsPolygonCollider);c.uuid='old-'+serial++;c.tag=tag;c.points=rect(-1,-1,2,2);build.colPoint[c.uuid]=c.points;}
 class Collider extends PhysicsPolygonCollider{constructor(){super();this.uuid='new-'+serial++;}destroy(){this.node.components=this.node.components.filter(c=>c!==this);}}
 // getComponents accepts the engine base type; new colliders use its subclass.
 const cc={PhysicsPolygonCollider:Collider,v2:(x,y)=>({x,y})};
 const originalAdd=Node.prototype.addComponent;for(const n of [ownerNode,...other])n.getComponents=()=>n.components.filter(c=>c instanceof PhysicsPolygonCollider);
 const unit={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingBlockerRuntime.js'),'utf8'),{module:unit,exports:unit.exports,cc,require:name=>{assert.equal(name,'BuildingBlocker');return Geometry;}});
 unit.exports.apply(build);return {build,module:unit.exports,nodes:[ownerNode,...other],originalAdd};
}
function rounded(polygons){return polygons.map(p=>p.map(p=>[+p.x.toFixed(5),+p.y.toFixed(5)]));}

test('corner connections anchor on the end pillar and gate blockers fit a different opening width',()=>{
 const plan=Kit.layout({nativeVersion:2,left:1,right:2,gate:true,start:'post',end:'corner'}),instances=Geometry.instances(plan);
 assert.deepEqual(instances.span.at(-1),[-1,0,0,1,plan.rightEnd.x,plan.rightEnd.y]);
 const wide=Kit.layout({nativeVersion:2,left:1,right:2,gate:true,start:'post',end:'post',nativeGateSpan:200}),m=Geometry.instances(wide,plan.nativeGateSpan).gate[0],center={x:(plan.left.x+plan.right.x)/2,y:(plan.left.y+plan.right.y)/2};
 const endpoints=Geometry.transform([[{x:plan.left.x-center.x,y:plan.left.y-center.y},{x:plan.right.x-center.x,y:plan.right.y-center.y}]],m)[0];
 for(const [i,key]of ['left','right'].entries()){assert(Math.abs(endpoints[i].x-wide[key].x)<1e-8);assert(Math.abs(endpoints[i].y-wide[key].y)<1e-8);}
});

test('blocker sections describe the actual selected building tier and full wall assembly without creating drafts',()=>{
 const f=fixture(),before=f.store.draftState(),source=JSON.stringify(f.service.source('Map01'));
 for(const [id,li]of[[1,2],[2,5],[3,0],[6,2]]){const data=Data.describe(f.service,{id:String(id),levelIndex:li});assert(data.record.sprites.length+data.record.skeletons.length);assert.deepEqual(Data.issues(data.value,id===6),[]);if(id===6){assert(data.record.skeletons.every(s=>s.skin==='cq-rts-3'));assert.equal(data.parts.find(p=>p.key==='pillar').instances.length,8);assert.equal(data.parts.find(p=>p.key==='gate').instances.length,1);}}
 assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.changes().length,0);assert.equal(JSON.stringify(f.service.source('Map01')),source);
});

test('polygon union, hole erasing and clear update the shared stage draft without changing map blockers or saved files',()=>{
 const f=fixture(),building=f.service.buildingCatalog().find(b=>b.kind===2),row=f.config.BuildEnum[2].levelList[0],stage={variant:'A',buildings:[Object.assign({},building,{x:0,y:0,scale:1,angle:0})]},file=path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),before=fs.readFileSync(file),original=f.service.snapshot('map:Map01').value;
 const first=Preview.describe(f.service,stage),mask=Clip.combineMask(Clip.polygonBrush(rect(-70,-40,140,80)),Clip.polygonBrush(rect(-10,-10,20,20)),'erase'),blocker={version:1,body:{mask,polygons:Clip.collisionPolygons(mask)}};
 f.store.change({version:f.store.version,edits:[{doc:'A',path:['BuildEnum','2','levelList',0,'Blocker'],value:blocker}]});
 const next=Preview.describe(f.service,stage);assert.notEqual(next.revision,first.revision);assert.equal(f.service.version,1,'World version need not change for a shared building draft');assert.deepEqual(Data.issues(blocker,false),[]);assert.deepEqual(next.buildings[building.id].levels[1].blockers,blocker.body.polygons);
 const invalid=clone(blocker);invalid.body.polygons=[];assert(Data.issues(invalid,false).length);
 f.store.change({version:f.store.version,edits:[{doc:'A',path:['BuildEnum','2','levelList',0,'Blocker'],value:{version:1,body:{mask:[],polygons:[]}}}]});
 assert.deepEqual(Preview.describe(f.service,stage).buildings[building.id].levels[1].blockers,[]);
 assert.deepEqual(f.service.snapshot('map:Map01').value,original);assert.deepEqual(fs.readFileSync(file),before);
 f.store.undo({version:f.store.version});assert.deepEqual(Preview.describe(f.service,stage).buildings[building.id].levels[1].blockers,blocker.body.polygons);
});

test('every gate facing and artwork tier repeats the pillar blocker on new joins and matches native fixed/leaf fixtures',()=>{
 const f=fixture(),template=f.service.buildingCatalog().find(b=>b.kind===6),base=Data.describe(f.service,{id:'6',levelIndex:0}).value;
 base.pillar=Data.shape([rect(-24,-17,48,34)]);
 for(const face of ['NE','NW','SE','SW'])for(const level of [1,2,3]){
  const row=f.config.BuildEnum[6].levelList[level-1];row.Blocker=clone(base);
  const building=Object.assign(clone(template),{previewBranch:row.index,wallFacing:face,x:0,y:0,scale:1,angle:0,wallRun:{nativeVersion:2,left:4,right:3,gate:true,start:'post',end:'post',routes:{left:[{u:0,v:0},{u:-2,v:0},{u:-2,v:2}],right:[{u:0,v:0},{u:3,v:0}]}}}),stage={variant:'A',buildings:[building]};
  const runtimeValue=runtime(f.service,stage,building,row),build=runtimeValue.build;
  const actual=runtimeValue.nodes.flatMap(n=>n.components.filter(c=>c._buildingBlocker).map(c=>c.points.map(p=>n.convertToWorldSpaceAR(p))));
  const projected=Nav.buildingColliderData(f.service,stage,building,1,'closed',f.config,new Map());
  assert.deepEqual(rounded(actual),rounded(projected.colliders.map(c=>c.points)),face+' tier '+level+' editor/native parity');
  const open=Nav.buildingColliderData(f.service,stage,building,1,'open',f.config,new Map());assert.equal(open.colliders.length,actual.length-base.gate.polygons.length,'Only leaf barrier admits allies');
  assert.equal(build._buildingBlockerRuntime.extra.length,1+9+7,'New bent-run points reuse the same pillar shape');
  assert(build._buildingBlockerRuntime.original.every(c=>c.component.tag===0),'Legacy solids cannot overlap or revive');
  assert(build._buildingBlockerRuntime.extra.every(c=>c.enabled),'Upgrade animation paths receive active new native fixtures');
  const gate=runtimeValue.nodes[0].components.filter(c=>c._buildingBlocker);assert.equal(gate.length,1);assert(runtimeValue.nodes[1].components.filter(c=>c._buildingBlocker).length>1,'Fixed connections are on the wing body');
  runtimeValue.module.dispose(build);assert(runtimeValue.nodes.every(n=>n.components.every(c=>!c._buildingBlocker)));assert(runtimeValue.nodes.flatMap(n=>n.components).every(c=>c.tag>0));
 }
});

test('custom gate blockers reactivate after rebuilding and upgrading back to a legacy tier restores native solids',()=>{
 const f=fixture(),template=f.service.buildingCatalog().find(b=>b.kind===6),row=f.config.BuildEnum[6].levelList[1];row.Blocker=Data.describe(f.service,{id:'6',levelIndex:1}).value;
 const building=Object.assign(clone(template),{previewBranch:2,x:0,y:0,scale:1,angle:0}),stage={variant:'A',buildings:[building]},r=runtime(f.service,stage,building,row),build=r.build;build.getColliderIndex=()=>build.index;
 build.isDestroyed=true;r.module.apply(build);assert(build._buildingBlockerRuntime.extra.every(c=>!c.enabled));
 build.isDestroyed=false;r.module.apply(build);assert(build._buildingBlockerRuntime.extra.every(c=>c.enabled),'Rebuild must restore the leaf even though the tier is unchanged');
 build.index=3;build.buildInfo.cfg=f.config.BuildEnum[6].levelList[2];r.module.apply(build);assert(!build._buildingBlockerRuntime);
 for(const node of r.nodes)assert.deepEqual(node.components.filter(c=>c.enabled).map(c=>c.tag),[3],'A destination without an override restores its original collider');
});

test('edited masks with holes and repeated wall connections compile through native Creator partitioning and Box2D',t=>{
 const engine=process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine',file=path.join(engine,'cocos2d/core/physics/collider/CCPhysicsPolygonCollider.js');
 if(!fs.existsSync(file)){t.skip('Creator engine not installed');return;}
 const box=require(path.join(engine,'external/box2d/box2d.js'));
 class Vec2{constructor(x=0,y=0){this.x=x;this.y=y;}equals(p){return this.x===p.x&&this.y===p.y;}}
 const cc={v2:(x,y)=>new Vec2(x,y),Class:d=>d._createShape,PhysicsCollider(){},Collider:{Polygon:{}}},separator={exports:{}},builder={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(engine,'cocos2d/core/physics/CCPolygonSeparator.js'),'utf8'),{module:separator,cc});
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:builder,cc,CC_EDITOR:false,b2:{PolygonShape:box.b2PolygonShape,Vec2:box.b2Vec2,maxPolygonVertices:8},require:name=>name==='../CCPhysicsTypes'?{PTM_RATIO:32}:separator.exports});
 const mask=Clip.combineMask(Clip.polygonBrush(rect(-70,-50,140,100)),Clip.polygonBrush(rect(-12,-12,24,24)),'erase');
 const layout=Kit.layout({nativeVersion:2,left:3,right:2,gate:true,start:'post',end:'post'}),blocker=Object.fromEntries(Object.entries(Geometry.wallDefaults(layout)).map(([key,p])=>[key,Data.shape(p)])),shapes=Geometry.wall(blocker,layout),polygons=Clip.collisionPolygons(mask).concat(shapes.gate,shapes.fixed);
 for(const x of [-1,1])for(const y of [-1,1]){
  const world=new box.b2World(new box.b2Vec2(0,0)),body=world.CreateBody(new box.b2BodyDef());let fixtures=0;
  for(const p of polygons){const c={points:p.map(p=>new Vec2(p.x*x,p.y*y)),offset:new Vec2()};for(const shape of builder.exports.call(c,{x:1,y:1})){const d=new box.b2FixtureDef();d.shape=shape;body.CreateFixture(d);fixtures++;}}
  world.Step(1/60,8,3);assert(fixtures>=polygons.length,'All transformed collision regions produce native fixtures');
 }
});
