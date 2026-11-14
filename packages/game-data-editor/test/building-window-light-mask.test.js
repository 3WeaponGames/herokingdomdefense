'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Mask=require('../../../assets/_script/WindowLightMask'),T=require('../../../assets/_script/BuildingNightlight');
const stroke=(extra={})=>({op:'erase',radius:8,opacity:.5,softness:0,points:[{x:.5,y:-.5}],...extra}),mask=(...strokes)=>({version:1,strokes}),at=(pixels,x,y)=>pixels[(35-y-.5)*70+(x+34.5)];
test('eraser changes only alpha, respects opacity, and never compounds overlapping samples within one stroke',()=>{
 const source=new Uint8Array(70*70*4);for(let i=0;i<source.length;i+=4)source.set([255,239,17,200],i);const before=source.slice(),one=Mask.pixels(source,mask(stroke())),many=Mask.pixels(source,mask(stroke({points:[{x:.5,y:-.5},{x:.5,y:-.5},{x:.5,y:-.5}]})));
 assert.equal(one[(35*70+35)*4+3],100);assert.deepEqual(one,many);assert.deepEqual(source,before);for(let i=0;i<one.length;i+=4)assert.deepEqual(one.slice(i,i+3),source.slice(i,i+3));assert.equal(one[3],200);
 const twice=Mask.pixels(source,mask(stroke(),stroke()));assert.equal(twice[(35*70+35)*4+3],50);
});
test('softness blends the brush edge; connected strokes have no gaps and Restore recovers only original light',()=>{
 const soft=Mask.raster(mask(stroke({softness:1,opacity:1})));assert.equal(at(soft,.5,-.5),0);assert(at(soft,4.5,-.5)>.1&&at(soft,4.5,-.5)<.9);assert.equal(at(soft,9.5,-.5),1);
 const line=stroke({radius:2,opacity:1,points:[{x:-20.5,y:-.5},{x:20.5,y:-.5}]}),erased=Mask.raster(mask(line));for(let x=-20.5;x<=20.5;x++)assert.equal(at(erased,x,-.5),0);
 const restored=Mask.raster(mask(line,{...line,op:'restore'}));assert(restored.every(a=>a===1));const partial=Mask.raster(mask(line,{...line,op:'restore',opacity:.4}));assert(Math.abs(at(partial,.5,-.5)-.4)<1e-7);
});
test('brush data validates finite bounded strokes and survives light transforms without editing its source coordinates',()=>{
 const erase=mask(stroke()),light={x:10,y:20,angle:37,flipX:true,scaleX:1.2,scaleY:.6,erase},row={Nightlight:{version:1,lights:{'light:1':light},emitters:[{id:'light:1'}]}};assert.deepEqual(T.issues(row.Nightlight),[]);const v=T.value(row,'light:1');assert.deepEqual(v.erase,erase);v.erase.strokes[0].points[0].x=99;assert.equal(erase.strokes[0].points[0].x,.5);
 for(const bad of [mask(stroke({opacity:2})),mask(stroke({radius:0})),mask(stroke({softness:NaN})),mask(stroke({points:[]})),mask(stroke({points:[{x:Infinity,y:0}]})),mask(...Array(129).fill(stroke()))]){assert(!Mask.valid(bad));assert(T.issues({...row.Nightlight,lights:{'light:1':{erase:bad}}}).length);}
});
