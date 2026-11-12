'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const Order=require('../worlds/layer-order'),M=require('../worlds/model'),Selection=require('../worlds/selection'),History=require('../worlds/history'),P=require('../worlds/prefab'),Maps=require('../lib/map-assets');
const clone=M.clone,root=path.resolve(__dirname,'../../..'),identity=()=>({x:0,y:0,scale:1,angle:0});
const object=(id,extra)=>Object.assign({id,name:id,assetId:'stone',x:13,y:-7,scale:1,angle:0},extra);
const layer=(id,objects,extra)=>Object.assign({id,name:id,depth:'auto',transform:identity(),objects:objects||[],blockers:[]},extra);
const ids=list=>list.map(value=>value.id),near=(a,b)=>assert(Math.abs(a-b)<1e-7,a+' != '+b);
const asset={id:'stone',width:60,height:90,anchor:{x:.35,y:.15}},assets={stone:asset};
function sample(){const map=M.createMap('order','Order','forest');map.layers=[layer('back',[object('a'),object('b')]),layer('middle',[object('c')]),layer('front',[object('d')])];map.Future={keep:['untouched']};return map;}
function points(map,id){const found=Selection.entry(map,id);return Selection.objectPoints(found.object,found.layer,assets);}
function samePoints(a,b){assert.equal(a.length,b.length);for(let i=0;i<a.length;i++){near(a[i].x,b[i].x);near(a[i].y,b[i].y);}}
function frozen(value){if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;}
function unchangedOnThrow(map,request,pattern){const before=JSON.stringify(map);assert.throws(()=>Order.moveObjects(map,request),pattern);assert.equal(JSON.stringify(map),before);}

test('layer order follows top-first Before/After while retaining bottom-first storage and unknown fields',()=>{
 const map=frozen(sample()),before=JSON.stringify(map),value=Order.moveLayer(map,{id:'back',targetId:'front',position:'before'});
 assert.deepEqual(ids(value.layers),['middle','front','back']);assert.equal(JSON.stringify(map),before);assert.deepEqual(value.Future,map.Future);assert.deepEqual(value.layers[2],map.layers[0]);
 assert.deepEqual(ids(Order.moveLayer(map,{id:'back',targetId:'front',position:'after'}).layers),['middle','back','front']);
 assert.equal(Order.moveLayer(map,{id:'middle',targetId:'front',position:'after'}),map);assert.equal(Order.moveLayer(map,{id:'back',targetId:'back',position:'before'}),map);
 assert(!Object.hasOwn(value,'blockerMask'),'Reordering groups does not migrate collider storage');
});

test('ground layer order protects the foundation and materializes a portable order only for a real change',()=>{
 const map=M.createMap('ground','Ground','snow');assert.equal(Order.moveLayer(map,{id:'roads',ground:true,targetId:'grass',position:'after'}),map);assert(!Object.hasOwn(map.ground,'order'));
 const value=Order.moveLayer(map,{id:'roads',ground:true,targetId:'grass',position:'before'});assert.deepEqual(value.ground.order,['foundation','grass','roads']);assert(!Object.hasOwn(map.ground,'order'));
 for(const request of [{id:'foundation',targetId:'roads'},{id:'roads',targetId:'foundation'}])assert.throws(()=>Order.moveLayer(map,{ground:true,position:'before',...request}),/foundation/);
 const stale=clone(map);stale.ground.foundation.id='renamed-foundation';assert.throws(()=>Order.moveLayer(stale,{ground:true,id:'roads',targetId:'grass',position:'before'}),/ID changed/);
 const custom=M.createGroundLayer(value,'Uploaded');assert.deepEqual(Order.moveLayer(custom,{ground:true,id:'grass',targetId:custom.ground.custom[0].id,position:'before'}).ground.order,['foundation','roads',custom.ground.custom[0].id,'grass']);
 assert.deepEqual(M.validateMap(custom,{}),[]);
});

test('layer moves reject stale IDs, locks, hidden targets and invalid drop positions atomically',()=>{
 const map=sample(),before=JSON.stringify(map);
 for(const request of [{id:'gone',targetId:'front',position:'before'},{id:'back',targetId:'gone',position:'after'},{id:'back',targetId:'front',position:'inside'},{id:'back',targetId:'front',position:'before',ground:'yes'}])assert.throws(()=>Order.moveLayer(map,request));
 map.layers[0].locked=true;assert.throws(()=>Order.moveLayer(map,{id:'back',targetId:'front',position:'before'}),/unlock/);delete map.layers[0].locked;
 map.layers[2].hidden=true;assert.throws(()=>Order.moveLayer(map,{id:'back',targetId:'front',position:'before'}),/Show/);delete map.layers[2].hidden;assert.equal(JSON.stringify(map),before);
});

test('child Before/After and multi-selection preserve existing display order rather than request order',()=>{
 const map=sample();map.layers[0].objects=['a','b','c','d'].map(id=>object(id));map.layers[1].objects=[];map.layers[2].objects=[];
 const moved=Order.moveObjects(map,{ids:['b'],targetLayerId:'back',targetObjectId:'c',position:'before'});assert.deepEqual(ids(moved.layers[0].objects),['a','c','b','d']);
 assert.equal(Order.moveObjects(map,{ids:['b'],targetLayerId:'back',targetObjectId:'c',position:'after'}),map);
 const multiple=Order.moveObjects(map,{ids:['d','b'],targetLayerId:'back',position:'inside'});assert.deepEqual(ids(multiple.layers[0].objects),['a','c','b','d']);assert(!Object.hasOwn(multiple,'blockerMask'));
 assert.equal(Order.moveObjects(map,{ids:['a','c'],targetLayerId:'back',targetObjectId:'c',position:'before'}),map);
 assert.equal(Order.moveObjects(map,{ids:['d'],targetLayerId:'back',targetObjectId:null,position:'before'}),map);
});

test('multi-layer transfer is atomic and keeps all world corners, pivots, flip, masks and future fields',()=>{
 const map=sample();map.layers[0].transform={x:80,y:-40,scale:2.4,angle:37};map.layers[1].transform={x:-30,y:70,scale:.6,angle:-52};map.layers[2].transform={x:100,y:120,scale:1.7,angle:81};
 Object.assign(map.layers[0].objects[0],{angle:24,scale:.8,flipX:true,ground:{x:8,y:11},opacity:.45,mask:[{op:'erase',size:25,points:[{x:4,y:5}],hardness:.2,opacity:.6}],Future:{unknown:['preserved']}});
 map.layers[1].objects[0].angle=-14;const sourceIds=['a','c'],geometry=new Map(sourceIds.map(id=>[id,points(map,id)])),pivots=new Map(sourceIds.map(id=>[id,Selection.pivot(map,[id],assets)])),snapshot=JSON.stringify(map);
 const value=Order.moveObjects(frozen(map),{ids:['c','a'],targetLayerId:'front',targetObjectId:'d',position:'after'});
 assert.deepEqual(ids(value.layers[2].objects),['a','c','d']);assert.deepEqual(ids(value.layers[0].objects),['b']);assert.equal(value.layers[1].objects.length,0);assert.equal(JSON.stringify(map),snapshot);
 for(const id of sourceIds){samePoints(geometry.get(id),points(value,id));const after=Selection.pivot(value,[id],assets);near(after.x,pivots.get(id).x);near(after.y,pivots.get(id).y);}
 const a=Selection.entry(value,'a').object;for(const key of ['flipX','ground','opacity','mask','Future'])assert.deepEqual(a[key],map.layers[0].objects[0][key]);assert.notEqual(a.mask,map.layers[0].objects[0].mask);assert.notEqual(value.layers[2].objects[2],map.layers[2].objects[0]);
});

test('ground images use the same pose/order rules without moving brush strokes or blocker state',()=>{
 let map=M.createMap('ground','Ground','forest');map=M.createGroundLayer(map,'Images');const id=map.ground.custom[0].id;
 map.ground.roads.transform={x:60,y:10,scale:.5,angle:20};map.ground.custom[0].transform={x:-30,y:50,scale:2,angle:-40};
 map.ground.roads.images=[object('image-a',{flipX:true,angle:15,mask:[{op:'erase',size:30,points:[{x:1,y:2}]}]}),object('image-b')];map.ground.custom[0].images=[object('image-c')];map.ground.roads.strokes=[{size:40,points:[{x:1,y:2}],op:'paint'}];
 const before=JSON.stringify(map),geometry=points(map,'image-a'),value=Order.moveObjects(map,{ground:true,ids:['image-a'],targetLayerId:id,targetObjectId:'image-c',position:'before'});
 assert.deepEqual(ids(value.ground.custom[0].images),['image-c','image-a']);samePoints(geometry,points(value,'image-a'));assert.deepEqual(value.ground.roads.strokes,map.ground.roads.strokes);assert(!Object.hasOwn(value,'blockerMask'));assert.equal(JSON.stringify(map),before);assert.deepEqual(M.validateMap(value,assets),[]);
 assert.throws(()=>Order.moveObjects(value,{ground:true,ids:['image-a'],targetLayerId:'foundation'}),/foundation/);
 map.ground.foundation.images=[object('foundation-image')];assert.throws(()=>Order.moveObjects(map,{ground:true,ids:['foundation-image'],targetLayerId:id}),/foundation/);
});

test('invalid or cross-tab child requests cannot partially transfer any selected image',()=>{
 const map=sample();map.ground.roads.images=[object('ground-image')];
 const requests=[{ids:[]},{ids:['a','a']},{ids:['a','gone']},{ids:['ground-image']},{ids:['a'],targetObjectId:'c'},{ids:['a'],targetLayerId:'gone'},{ids:['a'],position:'invalid'},{ids:['a'],ground:true,targetLayerId:'roads'}];
 for(const q of requests)unchangedOnThrow(map,{targetLayerId:'front',position:'before',...q});
 map.layers[1].locked=true;unchangedOnThrow(map,{ids:['a','c'],targetLayerId:'front'},/unlock/);delete map.layers[1].locked;
 map.layers[2].hidden=true;unchangedOnThrow(map,{ids:['a'],targetLayerId:'front'},/Show/);delete map.layers[2].hidden;
 map.layers[0].objects[0].locked=true;unchangedOnThrow(map,{ids:['a'],targetLayerId:'front'},/unlock/);delete map.layers[0].objects[0].locked;
 map.layers[2].objects[0].hidden=true;unchangedOnThrow(map,{ids:['a'],targetLayerId:'front',targetObjectId:'d',position:'after'},/unlock/);delete map.layers[2].objects[0].hidden;
 map.layers[2].transform.scale=0;unchangedOnThrow(map,{ids:['a','c'],targetLayerId:'front'},/positive/);
});

test('ambiguous IDs and nonfinite transforms fail without silently normalizing legacy data',()=>{
 const map=sample();map.ground.roads.images=[object('a')];unchangedOnThrow(map,{ids:['a'],targetLayerId:'front'},/unique/);delete map.ground.roads.images;
 map.layers[1].transform.angle=NaN;assert.throws(()=>Order.moveObjects(map,{ids:['a','c'],targetLayerId:'front'}),/finite/);delete map.layers[1].transform.angle;
 map.layers[0].transform.scale=Number.MAX_VALUE;map.layers[0].objects[0].x=Number.MAX_VALUE;unchangedOnThrow(map,{ids:['a'],targetLayerId:'front'},/finite/);
});

test('existing global blockers remain exact, including explicit empty overrides; same-layer no-ops do not seed masks',()=>{
 for(const mask of [[],[[[[1,2],[7,2],[7,8],[1,2]]]]]){const map=sample();map.blockerMask=mask;map.layers[0].objects[0].polygons=[[{x:0,y:0},{x:4,y:0},{x:0,y:4}]];const value=Order.moveObjects(map,{ids:['a'],targetLayerId:'front'});assert.deepEqual(value.blockerMask,mask);assert.deepEqual(value.layers[0].blockers,map.layers[0].blockers);assert.deepEqual(Selection.entry(value,'a').object.polygons,map.layers[0].objects[0].polygons);}
 const map=sample();assert.equal(Order.moveObjects(map,{ids:['b'],targetLayerId:'back'}),map);assert(!Object.hasOwn(map,'blockerMask'));
});

test('legacy collider geometry and sprite transforms survive a transformed group move and runtime export',()=>{
 const map=M.createMap('legacy-order','Legacy order','forest');map.layers=[layer('source'),layer('target')];map.layers[0].transform={x:40,y:-20,scale:1.4,angle:35};map.layers[1].transform={x:-50,y:80,scale:.8,angle:-25};
 const source=P.skeleton('Original',map),main=Maps.model(source).roots.ndMain,n=P.append(source,'Legacy rock',main,20,30,40,50),shape=[{x:0,y:0},{x:25,y:0},{x:0,y:30}];P.component(source,n,{__type__:'18fdaVPwQRBIrhl5kY8QMeg',ndMove:[]});P.component(source,n,{__type__:'cc.RigidBody',_type:0});P.component(source,n,{__type__:'cc.PhysicsPolygonCollider',points:shape});
 map.legacyData=source;map.layers[0].objects=[object('legacy',{x:70,y:40,angle:17,scale:1.2,flipX:true,polygons:[shape],legacy:{roots:[n],origin:{x:20,y:30},sprites:[{frame:'source',matrix:[1,0,0,1,20,30],width:40,height:50,anchor:{x:.5,y:.5}}]}})];
 const beforeMask=M.mapBlockerRegions(map),corners=points(map,'legacy'),value=Order.moveObjects(map,{ids:['legacy'],targetLayerId:'target'});assert.deepEqual(value.blockerMask,beforeMask);samePoints(corners,points(value,'legacy'));assert(!Object.hasOwn(map,'blockerMask'));assert.deepEqual(value.layers[1].objects[0].legacy,map.layers[0].objects[0].legacy);
 const exported=P.addEnvironment(root,P.skeleton('Exported',value),value,{ground:[],assets:{}}),colliders=Maps.model(exported).colliders;assert.equal(colliders.length,M.blockerPolygons(value).length);assert(colliders.every(c=>Maps.model(exported).byId[c.node].name.startsWith('Blocker ')),'Runtime removes native legacy colliders and emits only the fixed world mask');
 const movedAgain=clone(value);movedAgain.layers[1].transform.x+=300;assert.deepEqual(M.mapBlockerRegions(movedAgain),beforeMask,'Global blockers no longer follow group transforms');
});

test('one history operation undoes/redoes ownership, order, poses and legacy blocker snapshot; JSON stays portable',()=>{
 const map=sample();map.layers[0].objects[0].polygons=[[{x:0,y:0},{x:20,y:0},{x:0,y:20}]];map.layers[0].transform={x:10,y:20,scale:1.4,angle:25};const value=Order.moveObjects(map,{ids:['c','a'],targetLayerId:'front',position:'inside'}),edits=History.diff(map,value),undo=clone(value);assert(edits.length);History.apply(undo,edits,false);assert.deepEqual(undo,map);History.apply(undo,edits,true);assert.deepEqual(undo,value);
 const saved=JSON.parse(JSON.stringify(value));assert.deepEqual(saved,value);assert.deepEqual(M.validateMap(saved,assets),[]);assert.deepEqual(ids(saved.layers[2].objects),['d','a','c']);assert.deepEqual(saved.Future,map.Future);
 assert.equal(M.moveObjectToLayer(map,'b','back'),map,'The existing inspector transfer delegates to the same no-op behavior');const direct=M.moveObjectToLayer(map,'a','front');samePoints(points(map,'a'),points(direct,'a'));assert.deepEqual(direct.blockerMask,M.mapBlockerRegions(map));
});
