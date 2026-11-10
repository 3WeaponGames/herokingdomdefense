'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const Scrub=require('../worlds/wall-rotation-preview'),Preview=require('../worlds/building-preview'),Nav=require('../worlds/navigation'),P=require('../worlds/prefab'),L=require('../worlds/legacy'),M=require('../worlds/model'),Maps=require('../lib/map-assets');
const root=path.resolve(__dirname,'../../..');
function near(a,b,label){if(Array.isArray(a)){assert.equal(a.length,b.length,label);return a.forEach((v,i)=>near(v,b[i],label));}if(a&&typeof a==='object'){near(a.x,b.x,label);near(a.y,b.y,label);return;}assert(Math.abs(a-b)<1e-7,(label||'coordinates')+': '+a+' vs '+b);}
function fixture(slot){const source=M.clone(L.inspect(root,'Map01').data),config=L.read(root,L.configFile('A')),stage=L.adaptStage(root,'A',1),building=stage.buildings.find(b=>b.id===slot);building.enabled=true;building.unlock=1;stage.buildings=[building];stage.specials=[];const index={documents:{A:config}},service={root,source:()=>source,index:()=>index};return {source,config,stage,building,service};}

test('scrub preview rotates marked artwork and blockers without changing the purchase field or source records',()=>{
 const matrix=[1,0,0,1,20,40],fixed={matrix:matrix.slice()},moving={matrix:matrix.slice()},record={origin:{x:10,y:20},sprites:[fixed,moving],skeletons:[moving],blockers:[[{x:10,y:0}],[{x:3,y:4}]],openBlockers:[[{x:0,y:10}]],step:[{x:2,y:8}],rotationPreview:{angle:0,sprites:[false,true],skeletons:[true],blockers:[true,false],openBlockers:[true]}},original=JSON.stringify(record);
 const preview=Scrub.project(record,90);assert.equal(preview.sprites[0],fixed);assert.equal(preview.step,record.step);near(preview.sprites[1].matrix,[0,1,-1,0,-10,30]);near(preview.blockers[0],[{x:0,y:10}]);assert.equal(preview.blockers[1],record.blockers[1]);near(preview.openBlockers[0],[{x:-10,y:0}]);assert.equal(preview.rotationPreview.angle,90);assert.equal(JSON.stringify(record),original);assert.equal(Scrub.project(record,0),record);assert.equal(Scrub.project({step:[]},15).rotationPreview,undefined);
});

test('live fine-angle previews match authored wall geometry, colliders and fixed purchase fields for every facing and hall level',()=>{
 for(const slot of [17,19]){
  const f=fixture(slot),before=JSON.stringify(f.source);
  // A static owner box must stay fixed, while body/wing polygons rotate.
  P.component(f.source,f.building.template.node,{__type__:'cc.PhysicsBoxCollider',_enabled:true,_size:{width:16,height:12},_offset:{x:3,y:4}});
  const withBox=JSON.stringify(f.source);
  for(const face of ['NE','NW','SE','SW']){
   const base=M.clone(f.stage);Object.assign(base.buildings[0],{wallFacing:face,wallRotation:-7.5});const next=M.clone(base);next.buildings[0].wallRotation=13.5;
   const a=Preview.describe(f.service,base).buildings[slot].levels,b=Preview.describe(f.service,next).buildings[slot].levels;
   for(const hall of [1,2,3]){const actual=Scrub.project(a[hall],21),expected=b[hall];near(actual.step,expected.step,'fixed purchase field');near(actual.blockers,expected.blockers,'closed colliders');near(actual.openBlockers,expected.openBlockers,'open colliders');for(const key of ['sprites','skeletons']){assert.equal(actual[key].length,expected[key].length);actual[key].forEach((part,i)=>near(part.matrix,expected[key][i].matrix,key+' pose'));}assert.equal(actual.rotationPreview.angle,expected.rotationPreview.angle);assert(a[hall].rotationPreview.blockers.some(flag=>!flag),'static collider remains separate from rotating wall geometry');}
  }
  assert.equal(JSON.stringify(f.source),withBox);assert.notEqual(withBox,before,'only the test-owned source has an extra static box');
 }
});

test('disabled stage buildings remain in authoring data but are excluded from runtime nodes and hall unlocks',()=>{
 const f=fixture(19),map=M.createMap('availability','Availability','forest'),before=JSON.stringify(f.stage);f.building.enabled=false;
 const exported=P.compose(root,map,f.stage,{ground:[],assets:{}},{Map01:f.source}),model=Maps.model(exported);
 assert.equal(model.owners.filter(owner=>owner.kind==='building').length,0);assert(!Object.values(P.unlocks(f.stage)).some(rows=>rows.some(pair=>pair[1]===f.building.id)));assert.equal(f.stage.buildings.length,1);assert.equal(f.stage.buildings[0].enabled,false);
 f.building.enabled=true;const included=P.compose(root,map,f.stage,{ground:[],assets:{}},{Map01:f.source});assert(Maps.model(included).owners.some(owner=>owner.kind==='building'));assert.equal(JSON.stringify(f.stage),before);
});
