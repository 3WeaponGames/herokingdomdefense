'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const Layers=require('../worlds/building-layers'),L=require('../worlds/legacy'),M=require('../worlds/model'),P=require('../worlds/prefab'),Maps=require('../lib/map-assets');
const root=path.resolve(__dirname,'../../..');
test('building layer choices use stable IDs and default above every object layer',()=>{
 const map={layers:[{id:'cliffs',name:'Cliffs'},{id:'trees',name:'Trees'}]};assert(Layers.rank(map)>Layers.rank(map,'trees'));assert.equal(Layers.rank(map,'ground'),0);assert.equal(Layers.rank(map,'cliffs'),2);assert.equal(Layers.rank(map,'trees'),4);assert.deepEqual(Layers.choices(map).map(choice=>choice.value),['top','ground','cliffs','trees']);map.layers.reverse();assert.equal(Layers.rank(map,'cliffs'),4);assert.equal(Layers.rank(map,'trees'),2);assert(Layers.choices(map,'removed').some(choice=>/Missing layer/.test(choice.label)));assert.equal(Layers.rank(map,'removed'),Layers.rank(map));
});
test('generated stages carry whole-building layer assignments while keeping authored identifiers, transforms and blockers',()=>{
 // This fixture composes Map01; saved production stages may use a generated prefab.
 const row=Object.assign({},L.read(root,L.configFile('A')).LevelCfg[0],{prefab:'Map01'}),stage=L.adaptStage(root,'A',1,row),map=M.createMap('layers','Layers','forest'),source=L.inspect(root,'Map01'),building=stage.buildings.find(b=>b.kind===6);building.enabled=true;stage.buildings=[building];stage.specials=[];map.layers.push({id:'trees',name:'Trees',depth:'auto',transform:{x:0,y:0,scale:1,angle:0},objects:[],blockers:[]});const before=JSON.stringify({map,stage,source:source.data});
 for(const after of ['top','ground','trees']){const copy=M.clone(stage);copy.buildings[0].renderAfter=after;const generated=P.compose(root,map,copy,{ground:[],assets:{}},{Map01:source.data}),info=Maps.model(generated),owner=info.owners.find(n=>n.kind==='building'),component=generated[owner.ownerComponent];assert.equal(component.renderAfter,after);assert.equal(component.renderLayerOrder,Layers.rank(map,after));assert.equal(component.ID,building.id);assert.equal(owner.position.x,building.x);assert.equal(owner.position.y,building.y);assert(info.colliders.length);}
 assert.equal(JSON.stringify({map,stage,source:source.data}),before);
});
