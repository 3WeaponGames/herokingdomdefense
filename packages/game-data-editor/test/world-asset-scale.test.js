'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../worlds/model');

test('assets with different image densities place at the same calibrated world size',()=>{
 const map=M.createMap('density','Density','forest'),layer=map.layers[0].id;
 const low={id:'low',name:'Low density',width:100,height:80,defaultScale:1},high={id:'high',name:'High density',width:200,height:160,defaultScale:.5};
 const a=M.place(map,layer,low,{x:0,y:0},1,1,0).object,b=M.place(map,layer,high,{x:0,y:0},1,1,0).object;
 assert.equal(low.width*a.scale,high.width*b.scale);assert.equal(low.height*a.scale,high.height*b.scale);
 assert.equal(b.scale,.5);assert.equal(map.layers[0].objects.length,0);
});

test('random placement scale remains a multiplier of an asset’s calibrated size',()=>{
 const map=M.createMap('random-density','Random density','forest'),asset={id:'stone',name:'Stone',defaultScale:.4};
 const placed=M.place(map,map.layers[0].id,asset,{x:13,y:-21},1,2,.5).object;
 assert(Math.abs(placed.scale-.6)<1e-12);assert.equal(placed.x,13);assert.equal(placed.y,-21);
});

test('legacy assets retain their exact placement scale and saved objects do not auto-rescale',()=>{
 const map=M.createMap('legacy-density','Legacy density','forest'),asset={id:'old',name:'Old stone'},before=JSON.stringify(map);
 const result=M.place(map,map.layers[0].id,asset,{x:0,y:0},1,2,.25);
 assert.equal(result.object.scale,1.25);asset.defaultScale=.5;
 assert.equal(result.object.scale,1.25);assert.equal(JSON.stringify(map),before);
});

test('invalid asset calibrations fail without changing the map or consuming random samples',()=>{
 const map=M.createMap('invalid-density','Invalid density','forest'),before=JSON.stringify(map);
 for(const defaultScale of [0,-1,NaN,Infinity,'1',null])assert.throws(()=>M.place(map,map.layers[0].id,{id:'bad',defaultScale},{x:0,y:0},1,1,.5),/world scale/);
 assert.equal(JSON.stringify(map),before);
});

test('stock native sizing places at scale one and preserves previously saved geometry',()=>{
 const Selection=require('../worlds/selection'),map=M.createMap('native','Native','forest'),asset={id:'tree',name:'Tree',width:203,height:121,nativeScale:.45};
 const old={id:'saved',assetId:asset.id,x:0,y:0,scale:.7,angle:0},before=JSON.stringify(old);
 const placed=M.place(map,map.layers[0].id,asset,{x:0,y:0},1,1,0).object;
 assert.equal(placed.scale,1);assert.equal(placed.nativeSize,true);
 assert.deepEqual(M.assetSize(asset,placed),{width:91.35000000000001,height:54.45});
 assert.deepEqual(M.assetSize(asset,old),{width:203,height:121});assert.equal(JSON.stringify(old),before);
 const bounds=Selection.objectPoints(placed,map.layers[0],{tree:asset});
 assert(Math.abs(Math.max(...bounds.map(p=>p.x))-Math.min(...bounds.map(p=>p.x))-203*.45)<1e-10);
 const ground=M.placeGroundImage(map,'roads',asset,{x:0,y:0}).object;
 assert.equal(ground.scale,1);assert.equal(ground.nativeSize,true);assert.deepEqual(M.assetSize(asset,ground),M.assetSize(asset,placed));
});

test('custom terrain retains its existing default scale and source dimensions',()=>{
 const map=M.createMap('custom','Custom','forest'),asset={id:'lake',name:'Lake',width:1500,height:1049,defaultScale:.5};
 const placed=M.place(map,map.layers[0].id,asset,{x:0,y:0},1,1,0).object;
 assert.equal(placed.scale,.5);assert(!Object.hasOwn(placed,'nativeSize'));assert.deepEqual(M.assetSize(asset,placed),{width:1500,height:1049});
});

test('new terrain strokes use native texture sizing without altering existing strokes',()=>{
 const map=M.createMap('roads','Roads','forest'),old={size:80,assetId:'road',edgeAssetId:'edge',textureScale:1,edgeScale:1,points:[{x:0,y:0}]};
 map.ground.roads.strokes.push(M.clone(old));const before=JSON.stringify(map),next=M.stroke(map,'roads',Object.assign({},old,{nativeSize:true}));
 assert.equal(next.ground.roads.strokes[1].nativeSize,true);assert.deepEqual(next.ground.roads.strokes[0],old);assert.equal(JSON.stringify(map),before);
 assert.deepEqual(M.stroke(map,'roads',old).ground.roads.strokes[1],old,'scripted strokes without the new setting retain their exact behavior');
});

test('all stock Environment assets including RoadUp have the new native size; custom art is excluded',()=>{
 const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'../../..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'authoring/worlds/library/manifest.json'),'utf8'));
 const stock=manifest.assets.filter(a=>/^environment-[12]$/.test(a.source&&a.source.pack));assert(stock.length>=257);
 for(const asset of stock){assert.equal(asset.nativeScale,.45,asset.name);const bytes=fs.readFileSync(path.join(root,asset.file));assert.equal(bytes.readUInt32BE(16),asset.width);assert.equal(bytes.readUInt32BE(20),asset.height);}
 assert(stock.filter(a=>/^Road up /i.test(a.terrainName||a.name)).length>=7);
 for(const asset of manifest.assets.filter(a=>!stock.includes(a)))assert.equal(asset.nativeScale,undefined,asset.name);
});
