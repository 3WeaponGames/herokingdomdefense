'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const M=require('../worlds/model'),L=require('../worlds/legacy'),Maps=require('../lib/map-assets'),Gate=require('../worlds/gate-facing'),Run=require('../worlds/wall-run'),Preview=require('../worlds/building-preview'),Nav=require('../worlds/navigation'),P=require('../worlds/prefab');
const root=path.resolve(__dirname,'../../..');
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
 assert(main);assert.equal(main.json.wallKit.layout.leftCount,4);assert.equal(main.json.wallKit.layout.rightCount,7);
 assert.equal(record.skeletons.length,6);assert.equal(JSON.stringify({stage:f.stage,source:f.source.data,config:f.config}),before,'Browsing does not save, seed or repair data');
 f.wall.wallRun={...f.wall.wallRun,right:9,gate:false};const next=Preview.describe(f.service,f.stage),r=next.buildings[f.wall.id].levels[1],m=r.skeletons.find(s=>s.json.wallKit);
 assert.notEqual(next,first);assert.equal(m.json.wallKit.layout.rightCount,9);assert.equal(m.json.wallKit.layout.gate,false);assert.deepEqual(r.blockers,r.openBlockers);
 for(const skin of m.json.skins.filter(s=>s.name.startsWith('cq-rts-')))assert(!Object.keys(skin.attachments).some(s=>s.startsWith('rts_wall_leaf')));
});
