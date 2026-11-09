'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../worlds/model'),{Service}=require('../worlds/service');
function service(map){const s=Object.create(Service.prototype);s.docs={map:{key:'map:'+map.id,data:M.clone(map),original:M.clone(map)}};s.version=1;s.busy=false;s.undo=[];s.redo=[];s.doc=()=>s.docs.map;s.persist=()=>{};s.snapshot=()=>({key:s.docs.map.key,version:s.version,value:M.clone(s.docs.map.data)});return s;}
function sample(){const map=M.createLayer(M.createMap('fixed','Fixed','forest'),'Cliffs');map.layers[1].objects=[{id:'cliff',assetId:'cliff',name:'Cliff',x:20,y:30,scale:1,angle:0,polygons:[[{x:0,y:0},{x:100,y:0},{x:0,y:100}]]}];return map;}
test('a legacy map remains unchanged when read, then its first actual edit freezes one global collision mask',()=>{
 const map=sample(),s=service(map),before=M.clone(s.doc().data),regions=M.mapBlockerRegions(before);assert(!M.hasGlobalBlockers(s.snapshot().value));assert.equal(s.undo.length,0);
 const next=M.clone(before);next.layers[1].transform.x=200;s.change({key:'map:fixed',version:s.version,value:next});assert.deepEqual(s.doc().data.blockerMask,regions);assert.deepEqual(M.mapBlockerRegions(s.doc().data),regions);assert.deepEqual(s.doc().data.layers[1].objects[0].polygons,before.layers[1].objects[0].polygons);
 const moved=M.clone(s.doc().data);moved.layers[1].objects=[];moved.layers[1].hidden=true;s.change({key:'map:fixed',version:s.version,value:moved});assert.deepEqual(M.mapBlockerRegions(s.doc().data),regions);assert.equal(s.undo.length,2);
});
test('same-value edits do not migrate or write blockers; explicit blocker edits and undo retain their intended masks',()=>{
 const map=sample(),s=service(map);s.change({key:'map:fixed',version:s.version,value:M.clone(map)});assert.equal(s.version,1);assert.equal(s.undo.length,0);assert(!M.hasGlobalBlockers(s.doc().data));
 const changed=M.clone(map);changed.blockerMask=[];s.change({key:'map:fixed',version:s.version,value:changed});assert.deepEqual(s.doc().data.blockerMask,[]);s.history({key:'map:fixed',version:s.version},false);assert(!M.hasGlobalBlockers(s.doc().data));assert.deepEqual(s.doc().data,map);
});
test('ground fills and image masks validate their world footprint on small layers without relaxing legacy grid blocker limits',()=>{
 let map=M.createMap('scale','Scale','forest');map.ground.roads.transform={x:0,y:0,scale:.1,angle:0};
 map=M.stroke(map,'roads',{size:6056,shape:'square',hardness:1,opacity:1,assetId:'field',op:'paint',points:[{x:0,y:0}]});assert.equal(map.ground.roads.strokes[0].size,60560);assert.deepEqual(M.validateMap(map,{field:{}}),[]);
 map.layers[0].transform.scale=.01;map.layers[0].objects=[{id:'tiny',assetId:'field',name:'Tiny',x:0,y:0,scale:.1,mask:[{size:120000,op:'erase',points:[{x:0,y:0}]}]}];assert.deepEqual(M.validateMap(map,{field:{}}),[]);
 map.ground.roads.strokes[0].size=400000;assert(M.validateMap(map,{field:{}}).includes('Invalid brush stroke.'));map.ground.roads.strokes=[];map.layers[0].blockers=[{size:40000,points:[{x:0,y:0}]}];assert(M.validateMap(map,{field:{}}).includes('Invalid brush stroke.'));
});


test('new and duplicated maps start with a single independent world-space blocker mask',()=>{
 const source=sample(),original=M.clone(source),regions=M.mapBlockerRegions(source),s=Object.create(Service.prototype),index={maps:[]};
 Object.assign(s,{docs:{},version:1,busy:false,images:{},index:()=>index,loadMap:()=>({data:source}),persist:()=>{},snapshot:key=>({key,version:s.version,value:M.clone(s.docs[key].data)})});
 const fresh=s.create({version:s.version,name:'Empty',biome:'snow'});assert.deepEqual(fresh.value.blockerMask,[]);assert.deepEqual(source,original);
 const copy=s.create({version:s.version,copy:source.id,name:'Copy'});assert.deepEqual(copy.value.blockerMask,regions);assert.notEqual(copy.value.id,source.id);assert.deepEqual(source,original);
 copy.value.layers[1].transform.angle=90;copy.value.layers[1].objects=[];assert.deepEqual(M.mapBlockerRegions(copy.value),regions);assert.notStrictEqual(copy.value.blockerMask,source.blockerMask);
});

test('an omitted global mask in a legacy-format edit cannot reattach blockers to artwork',()=>{
 const map=sample(),s=service(map),next=M.clone(map);next.name='First edit';s.change({key:'map:fixed',version:s.version,value:next});const fixed=M.clone(s.doc().data.blockerMask);
 const stale=M.clone(map);stale.name='Second edit';stale.layers[1].transform.x=300;s.change({key:'map:fixed',version:s.version,value:stale});assert.deepEqual(s.doc().data.blockerMask,fixed);assert.deepEqual(M.mapBlockerRegions(s.doc().data),fixed);
});
