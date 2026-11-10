'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../worlds/model'),Shadow=require('../worlds/shadow-paint'),History=require('../worlds/history');
test('a first shadow stroke creates its own reversible draft layer; opening and previewing never edits source data',()=>{
 const map=M.createMap('paint','Paint','forest'),before=M.clone(map),prepared=Shadow.prepare(map);assert.deepEqual(map,before);assert(!Shadow.existing(map));assert(Shadow.existing(prepared.map));
 const painted=Shadow.stroke(map,{assetId:'shadow-brush',op:'paint',size:120,hardness:.5,opacity:.8,points:[{x:1,y:2},{x:50,y:2}]}).map,layer=Shadow.existing(painted);
 assert.equal(layer.strokes.length,1);assert.equal(layer.blend,'source-over');assert.deepEqual(painted.ground.foundation,before.ground.foundation);assert.deepEqual(M.blockerPolygons(painted),[]);
 const erased=Shadow.stroke(painted,{op:'erase',size:30,hardness:1,opacity:1,points:[{x:1,y:2}]}).map;assert.equal(Shadow.existing(erased).strokes.length,2);assert.equal(erased.ground.custom.length,1);
 const edits=History.diff(map,erased),copy=M.clone(erased);History.apply(copy,edits,false);assert.deepEqual(copy,before);History.apply(copy,edits,true);assert.deepEqual(copy,erased);
});
test('painting and erasing target a selected duplicate shadow layer without changing the original',()=>{
 const first=Shadow.stroke(M.createMap('copies','Copies','forest'),{assetId:'shadow-brush',op:'paint',size:120,hardness:1,opacity:1,points:[{x:0,y:0}]}),originalId=first.id;
 const map=M.createGroundLayer(first.map,'Painted shadows copy',originalId),duplicate=map.ground.custom[map.ground.custom.length-1],duplicateId=duplicate.id;
 Object.assign(duplicate,M.clone(M.groundLayer(map,originalId)),{id:duplicateId,name:'Painted shadows copy'});const before=M.clone(map),original=M.clone(M.groundLayer(map,originalId));
 assert.equal(Shadow.existing(map,duplicateId).id,duplicateId);assert.equal(Shadow.prepare(map,duplicateId).id,duplicateId);
 const painted=Shadow.stroke(map,{assetId:'shadow-brush',op:'paint',size:80,hardness:.6,opacity:.4,points:[{x:90,y:20}]},duplicateId),erased=Shadow.stroke(painted.map,{op:'erase',size:30,hardness:1,opacity:1,points:[{x:90,y:20}]},duplicateId);
 assert.equal(painted.id,duplicateId);assert.equal(erased.id,duplicateId);assert.equal(M.groundLayer(erased.map,duplicateId).strokes.length,3);assert.equal(M.groundLayer(erased.map,duplicateId).strokes[2].op,'erase');assert.deepEqual(M.groundLayer(erased.map,originalId),original);assert.deepEqual(map,before);
 const edits=History.diff(map,erased.map),copy=M.clone(erased.map);History.apply(copy,edits,false);assert.deepEqual(copy,before);History.apply(copy,edits,true);assert.deepEqual(copy,erased.map);
});
test('a deleted shadow layer can be recreated when only the internal foundation remains',()=>{
 let map=M.createMap('empty','Empty','forest');map=M.removeGroundLayer(M.removeGroundLayer(map,'roads'),'grass');const first=Shadow.stroke(map,{assetId:'shadow-brush',op:'paint',size:70,points:[{x:0,y:0}]}),deletedId=first.id;
 map=M.removeGroundLayer(first.map,deletedId);const before=M.clone(map);assert.deepEqual(M.groundLayers(map).map(l=>l.id),['foundation']);assert.equal(Shadow.existing(map,deletedId),undefined);
 const preview=Shadow.prepare(map,deletedId);assert.notEqual(preview.id,deletedId);assert.deepEqual(map,before);
 const recreated=Shadow.stroke(map,{assetId:'shadow-brush',op:'paint',size:100,hardness:.7,opacity:.8,points:[{x:-40,y:30}]},deletedId);
 assert.notEqual(recreated.id,deletedId);assert.equal(recreated.map.ground.custom.length,1);assert.equal(Shadow.existing(recreated.map).strokes.length,1);assert.deepEqual(recreated.map.ground.foundation,before.ground.foundation);assert.deepEqual(map,before);
 const edits=History.diff(map,recreated.map),copy=M.clone(recreated.map);History.apply(copy,edits,false);assert.deepEqual(copy,before);History.apply(copy,edits,true);assert.deepEqual(copy,recreated.map);
});
