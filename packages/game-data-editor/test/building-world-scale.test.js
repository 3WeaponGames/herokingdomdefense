'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Scale=require('../../../assets/_script/BuildingWorldScale'),Data=require('../buildings/blocker-data'),ScaleData=require('../buildings/scale-data'),Preview=require('../worlds/building-preview'),Navigation=require('../worlds/navigation'),Maps=require('../lib/map-assets'),Gate=require('../worlds/gate-facing'),{Store}=require('../lib/store'),{Service}=require('../worlds/service');
const {Node,RigidBody,PhysicsPolygonCollider}=require('../../../tools/navigation/runtime-harness.cjs'),root=path.resolve(__dirname,'../../..'),clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`),round=p=>p.map(r=>r.map(q=>[+q.x.toFixed(5),+q.y.toFixed(5)]));
function fixture(){const store=new Store(root),service=new Service(root,{previewConfig:()=>store.documents.A.data});return{store,service};}
function runtime(){const context={exports:{},require:name=>require('../../../assets/_script/'+name),cc:{v2:(x,y)=>({x,y}),isValid:()=>true,RigidBody,PhysicsCollider:PhysicsPolygonCollider}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingWorldScale.js'),'utf8'),context);return context.exports;}
function fromMatrix(m,name){const n=new Node(name);n.x=m[4];n.y=m[5];n.angle=Math.atan2(m[1],m[0])*180/Math.PI;n.scaleX=Math.hypot(m[0],m[1]);n.scaleY=(m[0]*m[3]-m[1]*m[2])/n.scaleX;return n;}

test('world size changes complete model geometry independently of icon zoom, and keeps the hero pad size fixed',()=>{
 const source={origin:{x:40,y:50},sprites:[{matrix:[1,0,0,1,140,0]},{matrix:[1,0,0,1,40,50]}],skeletons:[{matrix:[-1,0,0,1,45,52]}],purchaseField:{center:{x:100,y:-50},sprites:[true,false]},step:[{x:90,y:-50},{x:100,y:-40},{x:110,y:-50}],blockers:[[{x:0,y:0},{x:20,y:0},{x:0,y:10}]],shadow:{matrix:[1,0,0,1,40,50]}},before=clone(source),r=Scale.record(source,.75);
 assert.deepEqual(r.sprites[0].matrix,[1,0,0,1,115,12.5]);assert.deepEqual(r.sprites[1].matrix,[.75,0,0,.75,40,50]);assert.deepEqual(r.skeletons[0].matrix,[-.75,0,0,.75,43.75,51.5]);assert.deepEqual(r.shadow.matrix,[.75,0,0,.75,40,50]);assert.deepEqual(r.step,[{x:65,y:-37.5},{x:75,y:-27.5},{x:85,y:-37.5}]);assert.deepEqual(r.blockers[0][1],{x:15,y:0});assert.deepEqual(source,before);assert.equal(Scale.value({Zoom:.2}),1);assert.equal(Scale.record(source,1),source);assert(!Scale.valid(0)&&!Scale.valid(NaN)&&!Scale.valid(11));
});

test('opening Scale uses authored hero transforms and current size without creating drafts or writing configuration',()=>{
 const f=fixture(),before=f.store.draftState(),file=path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),bytes=fs.readFileSync(file),d=ScaleData.describe(f.service,{id:'1',levelIndex:0});
 assert(d.hero.length>=7);assert(d.hero.every(l=>l.animation==='idle'&&Number.isFinite(l.scaleX)&&l.scaleX>0));assert.equal(d.worldScale,Scale.value(before.A.BuildEnum[1].levelList[0]));assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.changes().length,0);assert.equal(f.store.save({version:f.store.version}).result.noChanges,true);assert.deepEqual(fs.readFileSync(file),bytes);
 const gameSource=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab'),'utf8')),game=Maps.model(gameSource),control=gameSource.find(c=>c.ctrPlayAni&&c.ndAgg),animation=gameSource[control.ctrPlayAni.__id__],ground=game.byId[control.node.__id__],hero=game.byId[animation.node.__id__],pose=Maps.multiply(Maps.inverse(ground.world),hero.world),raw=require('../lib/unit-assets').describe(root,{type:'hero',noShared:true}).layers;
 near(d.hero[0].scaleX/raw[0].scaleX,Math.hypot(pose[0],pose[1]));assert(Math.abs(d.hero[0].scaleX/raw[0].scaleX-1)>.1,'Gameplay instance scale must not be lost to a fitted preview');
});

test('a selected tier scale updates stage models, shadows and blockers without rewriting masks, other tiers or icon sizing',()=>{
 const f=fixture(),building=f.service.buildingCatalog().find(b=>b.kind===2),stage={variant:'A',buildings:[Object.assign({},building,{x:0,y:0,scale:1,angle:0})]},pathTo=['BuildEnum','2','levelList',0],before=f.store.draftState(),first=Preview.describe(f.service,stage),base=Data.describe(f.service,{id:'2',levelIndex:0}),original=first.buildings[building.id].levels[1];
 f.store.change({version:f.store.version,edits:[{doc:'A',path:pathTo.concat('WorldScale'),value:.7}]});
 const next=Preview.describe(f.service,stage),record=next.buildings[building.id].levels[1],expected=Scale.record(original,.7);assert.notEqual(first.revision,next.revision);assert.deepEqual(record.skeletons,expected.skeletons);assert.deepEqual(round(record.blockers),round(expected.blockers));assert.deepEqual(record.step,expected.step);
 const after=Data.describe(f.service,{id:'2',levelIndex:0});assert.deepEqual(after.value,base.value,'Original model-space blocker mask stays unchanged');assert.deepEqual(after.parts[0].instances[0].slice(0,4),base.parts[0].instances[0].slice(0,4).map(n=>n*.7));const all=clone(before);all.A.BuildEnum[2].levelList[0].WorldScale=.7;assert.deepEqual(f.store.draftState(),all);f.store.undo({version:f.store.version});assert.deepEqual(f.store.draftState(),before);
});

test('runtime scaling includes separate plots and wing roots, preserves pad width and health bars, and restores before a new tier',()=>{
 const api=runtime(),map=new Node('map'),node=new Node('building',map,50,80),main={node},plot=new Node('plot',map,100,90),padParent=new Node('pad group',map,150,20),pad=new Node('pad',padParent),hp=new Node('hp',node,0,100),hpView=new Node('health',map),owner={node,ndAniMain:main,ndAniDown:{node:plot},ndAniOther:[],ndLockList:[pad],ndHp:hp,ctrHp:{node:hpView},buildInfo:{cfg:{WorldScale:.6}}};
 const live=node.addComponent(PhysicsPolygonCollider),off=node.addComponent(PhysicsPolygonCollider),body=node.addComponent(RigidBody);let activeCalls=0,offCalls=0,retired=0;live._inited=true;live.apply=()=>activeCalls++;off.enabled=false;off._inited=true;off.apply=()=>offCalls++;off._destroy=()=>{retired++;off._inited=false;};
 api.apply(owner);near(node.scaleX,.6);near(plot.scaleX,.6);near(plot.x,80);near(plot.y,86);near(padParent.x,110);near(padParent.y,44);near(padParent.scaleX,1);near(hpView.x,50);near(hpView.y,140);assert.equal(activeCalls,1);assert.equal(offCalls,0);assert.equal(retired,1,'Disabled fixtures are removed without reviving unused tiers');assert.equal(body.node,node);
 api.apply(owner);near(node.scaleX,.6);near(plot.x,80);near(padParent.scaleX,1);api.restore(owner);near(node.scaleX,1);near(plot.scaleX,1);near(plot.x,100);near(padParent.x,150);assert(!owner._buildingWorldScaleRuntime);owner.buildInfo.cfg={};api.apply(owner);assert(!owner._buildingWorldScaleRuntime,'Legacy tiers keep their original transforms');
 // Mill plots may be reparented by the depth renderer after construction.
 owner.buildInfo.cfg={WorldScale:1.4};api.apply(owner);const wrapper=new Node('wrapper',map,10,20),world=plot.convertToWorldSpaceAR({x:0,y:0});plot.setParent(wrapper);plot.setPosition(wrapper.convertToNodeSpaceAR(world));api.restore(owner);near(plot.convertToWorldSpaceAR({x:0,y:0}).x,100);near(plot.convertToWorldSpaceAR({x:0,y:0}).y,90);
});

test('native controller roots and stage collider previews agree for every building type and all wall facings',()=>{
 const f=fixture(),api=runtime();let cases=0;
 for(const kind of [1,2,3,4,5,6])for(const face of kind===6?['NE','NW','SE','SW']:['NE'])for(const factor of [.6,1.35])for(const offset of [{x:0,y:0},{x:35,y:-20}]){
  const template=f.service.buildingCatalog().find(b=>b.kind===kind),building=Object.assign(clone(template),{wallFacing:face,x:0,y:0,scale:1,angle:0}),stage={variant:'A',buildings:[building]},row=f.store.documents.A.data.BuildEnum[kind].levelList[0];row.WorldScale=factor;row.ModelOffset=offset;
  const source=Gate.project(f.service.source(building.template.prefab),building,root),info=Maps.model(source),nodes={};for(const n of info.nodes)nodes[n.id]=fromMatrix(Maps.transform(n.source),n.name);for(const n of info.nodes)if(nodes[n.parent])nodes[n.id].setParent(nodes[n.parent]);
  const o=info.byId[building.template.node],c=o.components.find(c=>c.value.ndAniMain).value,renderer=ref=>ref&&{node:nodes[source[ref.__id__].node.__id__]},owner={node:nodes[o.id],ndAniMain:renderer(c.ndAniMain),ndAniDown:renderer(c.ndAniDown),ndAniOther:(c.ndAniOther||[]).map(renderer),ndLockList:(c.ndLockList||[]).map(r=>nodes[r.__id__]),buildInfo:{cfg:row}};
  const baselineConfig=clone(f.store.documents.A.data);delete baselineConfig.BuildEnum[kind].levelList[0].WorldScale;delete baselineConfig.BuildEnum[kind].levelList[0].ModelOffset;const base=Navigation.buildingColliderData(f.service,stage,building,1,'closed',baselineConfig,new Map()),actual=Navigation.buildingColliderData(f.service,stage,building,1,'closed',f.store.documents.A.data,new Map());api.apply(owner);
  for(let i=0;i<base.colliders.length;i++)for(let j=0;j<base.colliders[i].points.length;j++){
   const old=base.colliders[i],p=Maps.point(Maps.inverse(info.byId[old.node].world),old.points[j]),world=nodes[old.node].convertToWorldSpaceAR(p),expected=actual.colliders[i].points[j];near(world.x,expected.x);near(world.y,expected.y);
  }
  api.restore(owner);cases++;
 }
 assert.equal(cases,36);
});
