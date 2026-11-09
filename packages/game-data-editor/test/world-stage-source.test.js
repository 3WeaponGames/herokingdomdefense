'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),M=require('../worlds/model'),L=require('../worlds/legacy'),Stage=require('../worlds/stage07'),temporary=require('./owned-temp');
const png=value=>'data:image/png;base64,'+Buffer.from(value).toString('base64');
function fixture(){
 const root=temporary('hkd-stage-source-'),artifacts=temporary('hkd-stage-artifacts-'),folder=path.join(root,'tools/maps/stage07');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'tree.png'),'tree-source');
 const recipe={width:200,height:300,images:{Tree:'tree.png'},owners:[{key:'north',id:11}],props:[{image:'Tree',region:'north',layer:'world',x:.7,y:.2,height:40}]};fs.writeFileSync(path.join(folder,'recipe.json'),JSON.stringify(recipe));
 const map=M.createLayer(M.createMap('Map07','Stage 7','fire'),'North');map.size={width:400,height:600};map.playable={width:300,height:500};map.legacyGround={roots:[],sprites:[]};const old={id:'old',name:'North',x:7,y:9,scale:1.5,angle:30,flipX:true,ground:{x:2,y:3},Future:{keep:true},legacy:{roots:[11],origin:{x:10,y:20},sprites:[]},polygons:[[{x:0,y:0},{x:20,y:0},{x:0,y:30}]]};map.layers[1].objects.push(old);map.layers[1].transform={x:12,y:13,scale:1.2,angle:10};
 const library=[{id:'tree',sha256:L.hash(Buffer.from('tree-source')),name:'Tree',width:10,height:20,anchor:{x:.5,y:0},depth:'world'}],doc={key:'map:Map07',data:map,original:M.clone(map)},service={root,artifacts,version:1,stagedAssets:new Map(),options:{render:async()=>({files:[...Array.from({length:4},(_,i)=>({role:'ground',tile:i+1,width:100,height:150,png:png('ground-'+i)})),{role:'obstacle',key:'north',owner:11,width:20,height:30,center:{x:18,y:31},ground:{x:16,y:26},png:png('cliff')}]})},doc:()=>doc,index:()=>({library}),expect(version){if(version!==this.version)throw Error('Another panel changed the shared draft.');},change(request){this.expect(request.version);doc.data=request.value;this.version++;return {value:M.clone(doc.data)};}};
 return {root,artifacts,folder,recipe,map,old,library,doc,service,request:{key:doc.key,version:1}};
}
const near=(a,b)=>assert(Math.hypot(a.x-b.x,a.y-b.y)<1e-7,JSON.stringify([a,b]));

test('legacy road extraction is explicit, pixel-exact and retains cleaned field pixels outside authored road coverage',()=>{
 const current=Uint8ClampedArray.from([30,40,50,255,70,80,90,255,10,20,30,255,110,120,130,255]),before=Array.from(current),pristine=Uint8ClampedArray.from([1,2,3,255,4,5,6,255,7,8,9,255,10,11,12,255]),mask=Uint8ClampedArray.from([0,0,0,0,0,0,0,89,0,0,0,1,0,0,0,0]);
 const result=Stage.separateRoadPixels(current,pristine,mask,2,2);
 assert.equal(result.pixels,2);assert.deepEqual(Array.from(current),before);
 for(let pixel=0;pixel<4;pixel++){
  const at=pixel*4,covered=mask[at+3]>0;
  assert.deepEqual(Array.from(result.foundation.slice(at,at+4)),Array.from((covered?pristine:current).slice(at,at+4)));
  assert.deepEqual(Array.from(result.roads.slice(at,at+4)),covered?Array.from(current.slice(at,at+4)):[0,0,0,0]);
  assert.deepEqual(Array.from((covered?result.roads:result.foundation).slice(at,at+4)),before.slice(at,at+4));
 }
 for(const size of [[0,2],[1.5,2],[3,2]])assert.throws(()=>Stage.separateRoadPixels(current,pristine,mask,...size),/equally sized/);
});
test('identical recovered pixels with different ground anchors keep independent asset metadata',async()=>{
 const f=fixture(),second=M.clone(f.old);second.id='second';second.legacy.roots=[12];f.map.layers[1].objects.push(second);f.doc.original=M.clone(f.map);
 f.recipe.owners.push({key:'other',id:12});fs.writeFileSync(path.join(f.folder,'recipe.json'),JSON.stringify(f.recipe));
 const render=f.service.options.render;f.service.options.render=async spec=>{const result=await render(spec);result.files.push({role:'obstacle',key:'other',owner:12,width:20,height:30,center:{x:18,y:31},ground:{x:18,y:30},png:png('cliff')});return result;};
 const result=await Stage.recover(f.service,f.request),objects=result.value.layers[1].objects.filter(o=>o.id==='old'||o.id==='second');
 assert.notEqual(objects[0].assetId,objects[1].assetId);
 const a=f.service.stagedAssets.get(objects[0].assetId),b=f.service.stagedAssets.get(objects[1].assetId);assert.equal(a.sha256,b.sha256);assert.notDeepEqual(a.anchor,b.anchor);
});
test('source recovery retains staged artwork, resized canvas alignment and transformed cliff placements',async()=>{
 const f=fixture(),before=JSON.stringify(f.map),result=await Stage.recover(f.service,f.request),map=result.value,object=map.layers[1].objects.find(o=>o.id==='old');
 assert.equal(JSON.stringify(f.map),before);assert(map.sourcePiecesRecovered);assert.equal(map.legacyGround,null);assert.equal(map.ground.foundation.tiles.length,4);assert.equal(map.ground.foundation.tiles[0].x,-50);assert.equal(map.ground.foundation.tiles[0].y,75);
 assert(f.service.stagedAssets.size===5);for(const asset of f.service.stagedAssets.values()){assert(fs.existsSync(asset.stagedFile));assert(f.library.some(a=>a.id===asset.id));}
 assert(!object.legacy);assert.deepEqual(object.Future,{keep:true});assert.equal(object.scale,f.old.scale);assert.equal(object.angle,f.old.angle);assert.equal(object.flipX,f.old.flipX);
 const transform=(o,p)=>M.toWorld(o,{x:o.flipX?-p.x:p.x,y:p.y});
 near(transform(object,object.polygons[0][1]),transform(f.old,f.old.polygons[0][1]));
 near(transform(object,object.ground),transform(f.old,f.old.ground));
 const prop=map.layers[1].objects.find(o=>o.assetId==='tree');near(prop,transform(f.old,{x:40-10,y:90-20}));assert.equal(prop.scale,3);assert.equal(prop.flipX,true);assert.equal(prop.angle,30);
});
test('source recovery failure does not publish partial palette entries or edit the draft',async()=>{
 const f=fixture();f.library.length=0;const before=JSON.stringify(f.doc.data);
 await assert.rejects(Stage.recover(f.service,f.request),/maintained palette/);
 assert.equal(JSON.stringify(f.doc.data),before);assert.equal(f.library.length,0);assert.equal(f.service.stagedAssets.size,0);assert(!fs.existsSync(path.join(f.artifacts,'source-pieces')));
});

test('explicit source recovery places baked roads in the editable Roads pass below its existing erase strokes',async()=>{
 const f=fixture(),erase={op:'erase',size:40,hardness:.4,opacity:.5,points:[{x:3,y:8}]};
 f.map.ground.roads={strokes:[erase],FutureRoadField:{keep:true}};f.doc.original=M.clone(f.map);
 f.map.ground.order=['foundation','grass'];f.doc.original=M.clone(f.map);
 const render=f.service.options.render;f.service.options.render=async spec=>{
  assert.equal(spec.separateRoads,true);const result=await render(spec);
  for(let i=0;i<4;i++)result.files.push({role:'roads',tile:i+1,width:100,height:150,png:png('roads-'+i)});
  return result;
 };
 const result=await Stage.recover(f.service,f.request),roads=result.value.ground.roads;
 assert.equal(roads.images.length,4);assert.deepEqual(roads.strokes,[erase]);assert.deepEqual(roads.FutureRoadField,{keep:true});
 assert.deepEqual(result.value.ground.order,['foundation','roads','grass']);assert.equal(result.value.ground.foundation.tiles.length,4);
 assert(roads.images.every(o=>!result.value.ground.foundation.tiles.some(t=>t.assetId===o.assetId)));
 assert.deepEqual(roads.images.map(o=>[o.x,o.y]),[[-50,75],[50,75],[-50,-75],[50,-75]]);
 assert.equal(f.service.stagedAssets.size,9);
});
test('source recovery rejects changed source images or concurrent panel edits before applying anything',async()=>{
 for(const reason of ['source','version']){
  const f=fixture(),render=f.service.options.render,before=JSON.stringify(f.doc.data);
  f.service.options.render=async spec=>{const result=await render(spec);if(reason==='source')fs.writeFileSync(path.join(f.folder,'tree.png'),'changed');else f.service.version++;return result;};
  await assert.rejects(Stage.recover(f.service,f.request),reason==='source'?/source artwork changed/:/Another panel/);
  assert.equal(JSON.stringify(f.doc.data),before);assert.equal(f.service.stagedAssets.size,0);assert.equal(f.library.length,1);
 }
});

test('recovered road tiles stay below existing uploaded Roads images without reversing either order',async()=>{
 const f=fixture(),uploads=[{id:'user-road-a',assetId:'a',x:10,y:20,scale:2,angle:30,mask:[{op:'erase',size:4,points:[{x:1,y:2}]}],Future:{keep:17}},{id:'user-road-b',assetId:'b',x:30,y:40,scale:1,angle:0}];
 f.map.ground.roads.images=M.clone(uploads);f.doc.original=M.clone(f.map);const render=f.service.options.render;
 f.service.options.render=async spec=>{const result=await render(spec);for(let i=0;i<4;i++)result.files.push({role:'roads',tile:i+1,width:100,height:150,png:png('roads-'+i)});return result;};
 const images=(await Stage.recover(f.service,f.request)).value.ground.roads.images;
 assert.deepEqual(images.slice(4),uploads);assert.deepEqual(f.map.ground.roads.images,uploads);
 assert.deepEqual(images.slice(0,4).map(o=>o.name),['Stage 7 roads 1','Stage 7 roads 2','Stage 7 roads 3','Stage 7 roads 4']);
 assert.deepEqual(images.slice(0,4).map(o=>[o.x,o.y]),[[-50,75],[50,75],[-50,-75],[50,-75]]);
});

test('recovered road tiles preserve foundation world transforms inside a different translated rotated scaled Roads pass',async()=>{
 const f=fixture(),foundation={x:-40,y:70,scale:.8,angle:-15},roads={x:100,y:200,scale:1.5,angle:20};
 f.map.ground.foundation.transform=M.clone(foundation);f.map.ground.roads.transform=M.clone(roads);f.doc.original=M.clone(f.map);
 const render=f.service.options.render;f.service.options.render=async spec=>{const result=await render(spec);for(let i=0;i<4;i++)result.files.push({role:'roads',tile:i+1,width:100,height:150,png:png('roads-'+i)});return result;};
 const result=(await Stage.recover(f.service,f.request)).value;
 assert.deepEqual(result.ground.foundation.transform,foundation);assert.deepEqual(result.ground.roads.transform,roads);
 for(let i=0;i<4;i++){
  const base=result.ground.foundation.tiles[i],road=result.ground.roads.images[i];near(M.toWorld(foundation,base),M.toWorld(roads,road));
  for(const offset of [{x:0,y:0},{x:37,y:-21},{x:-50,y:75}])near(M.toWorld(foundation,M.toWorld(base,offset)),M.toWorld(roads,M.toWorld(road,offset)));
 }
});

test('source recovery rejects unsupported layer compositing before rendering without changing saved settings or drafts',async()=>{
 for(const name of ['foundation','roads'])for(const settings of [{hidden:true},{opacity:0},{opacity:.5},{blend:'multiply'}]){
  const f=fixture();Object.assign(f.map.ground[name],settings);f.doc.original=M.clone(f.map);const before=JSON.stringify(f.map);let renders=0;f.service.options.render=async()=>{renders++;throw Error('unexpected render');};
  await assert.rejects(Stage.recover(f.service,f.request),/100% opacity and Normal blend/);assert.equal(renders,0);assert.equal(JSON.stringify(f.map),before);assert.equal(f.service.stagedAssets.size,0);assert.equal(f.library.length,1);
 }
});

test('explicit source recovery creates an ordinary ground-detail layer if the former pinned layer was deleted',async()=>{
 const f=fixture();f.doc.data=M.removeLayer(f.map,'grass-detail');f.doc.original=M.clone(f.doc.data);f.recipe.props.push({image:'Tree',layer:'ground',x:.3,y:.7,height:10});fs.writeFileSync(path.join(f.folder,'recipe.json'),JSON.stringify(f.recipe));const before=JSON.stringify(f.doc.data);
 const result=await Stage.recover(f.service,f.request),layer=result.value.layers.find(l=>l.name==='Ground detail');assert(layer);assert.equal(layer.depth,'ground');assert(!layer.pinned);assert.equal(layer.objects.length,1);assert.equal(layer.objects[0].assetId,'tree');assert.equal(layer.objects[0].scale,.5);near(layer.objects[0],{x:-40,y:-60});assert(!JSON.parse(before).layers.some(l=>l.id==='grass-detail'));assert(!result.value.layers.some(l=>l.id==='grass-detail'));assert.deepEqual(M.removeLayer(result.value,layer.id).layers.map(l=>l.id),f.doc.original.layers.map(l=>l.id));
});
