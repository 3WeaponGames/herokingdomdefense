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
