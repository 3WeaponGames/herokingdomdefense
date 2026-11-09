'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../worlds/model'),History=require('../worlds/history');
const clone=M.clone;
function map(){const m=M.createMap('layers','Layers','forest');m.blockerMask=[[[[20,20],[40,20],[40,40],[20,40],[20,20]]]];return m;}

test('every object layer, including the legacy pinned Grass detail and the final layer, can be deleted and recreated',()=>{
 const original=map(),before=clone(original);original.layers[0].FutureField={keep:true};
 const empty=M.removeLayer(original,'grass-detail');assert.deepEqual(empty.layers,[]);assert.deepEqual(empty.blockerMask,before.blockerMask);assert.equal(original.layers.length,1);
 assert.deepEqual(M.validateMap(empty,{}),[]);const added=M.createLayer(empty,'New objects');assert.equal(added.layers.length,1);assert.equal(added.layers[0].name,'New objects');
 const placed=M.place(added,added.layers[0].id,{id:'tree',name:'Tree'},{x:4,y:8},1,1,0);assert.equal(placed.object.x,4);assert.deepEqual(M.validateMap(placed.map,{tree:{}}),[]);
});

test('deleting Roads or Surface grass removes only that pass and its known artwork while retaining portable storage metadata',()=>{
 for(const id of ['roads','grass']){
  const original=map(),layer=original.ground[id];Object.assign(layer,{FutureField:{keep:17},name:'Authored '+id,baseAsset:'field',images:[{id:'image',assetId:'field'}],tiles:[{assetId:'tile'}],strokes:[{assetId:'field',size:10,points:[{x:0,y:0}]}]});
  const before=clone(original),removed=M.removeGroundLayer(original,id);assert.deepEqual(original,before);assert(!M.groundLayers(removed).some(l=>l.id===id));assert.throws(()=>M.groundLayer(removed,id),/Choose a ground layer/);
  assert.deepEqual(removed.ground[id].FutureField,{keep:17});assert.equal(removed.ground[id].name,'Authored '+id);assert.deepEqual(removed.ground[id].strokes,[]);assert.deepEqual(removed.ground[id].images,[]);assert.deepEqual(removed.ground[id].tiles,[]);assert.equal(removed.ground[id].baseAsset,null);
  assert.deepEqual(removed.blockerMask,before.blockerMask);assert.deepEqual(M.validateMap(removed,{}),[]);
 }
});

test('the hidden internal foundation remains valid after all visible ground layers are removed, and new layers work',()=>{
 let empty=M.removeGroundLayer(M.removeGroundLayer(map(),'roads'),'grass');assert.deepEqual(empty.ground.order,['foundation']);assert.deepEqual(M.groundLayers(empty).map(l=>l.id),['foundation']);assert.deepEqual(M.validateMap(empty,{}),[]);
 assert.throws(()=>M.removeGroundLayer(empty,'foundation'),/permanent/);const foundation=clone(empty.ground.foundation);
 empty=M.createGroundLayer(empty,'Fresh ground');const id=empty.ground.custom[0].id;assert.deepEqual(empty.ground.order,['foundation',id]);
 const painted=M.stroke(empty,id,{size:40,shape:'round',op:'paint',assetId:'field',points:[{x:0,y:0}]});assert.equal(M.groundLayer(painted,id).strokes.length,1);assert.deepEqual(painted.ground.foundation,foundation);assert.deepEqual(M.validateMap(painted,{field:{}}),[]);
 assert.throws(()=>M.stroke(empty,'roads',{size:40,op:'paint',points:[{x:0,y:0}]}),/Choose a ground layer/);
});

test('layer deletion retains unrelated data and Undo and Redo restore exact content, masks, identifiers and ordering',()=>{
 let original=M.createGroundLayer(map(),'River','roads');original.FutureField={keep:'map'};const id=original.ground.custom[0].id;
 original.ground.custom[0].FutureField={keep:'layer'};original.layers[0].objects=[{id:'unchanged',name:'Stone',assetId:'stone',x:0,y:0,scale:1,angle:0,mask:[{size:5,op:'erase',points:[{x:0,y:0}]}]}];
 const removed=M.removeGroundLayer(M.removeLayer(original,'grass-detail'),id),edits=History.diff(original,removed),undo=clone(removed);History.apply(undo,edits,false);assert.deepEqual(undo,original);History.apply(undo,edits,true);assert.deepEqual(undo,removed);assert.deepEqual(removed.FutureField,original.FutureField);assert.deepEqual(removed.blockerMask,original.blockerMask);
});

test('locked layers remain protected until unlocked, while hidden layers can be intentionally deleted',()=>{
 const original=map();original.layers[0].locked=true;original.ground.roads.locked=true;assert.throws(()=>M.removeLayer(original,'grass-detail'),/Unlock/);assert.throws(()=>M.removeGroundLayer(original,'roads'),/Unlock/);
 original.layers[0].locked=false;original.layers[0].hidden=true;assert.deepEqual(M.removeLayer(original,'grass-detail').layers,[]);original.ground.roads.locked=false;original.ground.roads.hidden=true;assert(!M.groundLayers(M.removeGroundLayer(original,'roads')).some(l=>l.id==='roads'));
});

test('ground validation accepts removed optional passes and keeps foundation below all surviving passes',()=>{
 const m=map();for(const order of [['foundation'],['foundation','roads'],['foundation','grass'],['foundation','grass','roads']]){m.ground.order=order;assert.deepEqual(M.validateMap(m,{}),[]);}
 for(const order of [['roads','foundation'],['grass'],['foundation','missing']]){m.ground.order=order;assert(M.validateMap(m,{}).includes('Keep the internal foundation below ground layers.'));}
});
