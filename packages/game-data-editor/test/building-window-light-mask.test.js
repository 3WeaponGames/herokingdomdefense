'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Mask=require('../../../assets/_script/WindowLightMask'),T=require('../../../assets/_script/BuildingNightlight');
const stroke=(extra={})=>({op:'erase',radius:8,opacity:.5,softness:0,points:[{x:.5,y:-.5}],...extra}),mask=(...strokes)=>({version:1,strokes}),at=(pixels,x,y)=>pixels[(35-y-.5)*70+(x+34.5)];
test('a brush erases a circle in the preview rather than inheriting the stretched light shape',()=>{
 const s=stroke({radius:10,opacity:1,flow:true,projection:{matrix:[.25,0,0,2],type:'full'},points:[{x:0,y:0,strength:1}]}),data=mask(s),alpha=Mask.raster(data);assert(Mask.valid(data));
 assert.equal(at(alpha,20.5,-.5),0,'a source point 20px away horizontally is only 5px away in the preview');assert.equal(at(alpha,.5,10.5),1,'a source point 10px away vertically is 21px away in the preview');
 for(let y=0;y<70;y++)for(let x=0;x<70;x++){const dx=(x+.5-35)*.25,dy=(35-y-.5)*2;assert.equal(alpha[y*70+x],Math.hypot(dx,dy)<10?0:1);}
});
test('continuous soft brush dabs accumulate and restore while incremental previews match a fresh bake exactly',()=>{
 const s=stroke({flow:true,softness:.8,projection:{matrix:[.8,.3,.2,-1.7],type:'dim'},points:[{x:0,y:0,strength:1}]}),data=mask(s),live=Mask.createRasterizer(116,116);assert(Mask.valid(data));let first=live.update(data).slice();
 for(let i=0;i<80;i++){s.points.push({x:Math.sin(i/10)*3,y:0,strength:.25});const actual=live.update(data),expected=Mask.raster(data,116,116);assert.deepEqual(actual,expected);}
 assert(live.update(data).some((a,i)=>a<first[i]));assert.equal(live.stats().rebuilds,1);assert.equal(live.stats().appends,80);
 const erased=live.update(data).slice();data.strokes.push({...s,op:'restore',points:[{x:0,y:0,strength:1}]});const restored=live.update(data);assert(restored.some((a,i)=>a>erased[i]));assert.deepEqual(restored,Mask.raster(data,116,116));assert.equal(live.stats().rebuilds,2);
 const copy=JSON.parse(JSON.stringify(data));assert.deepEqual(live.update(copy),Mask.raster(copy,116,116));assert.equal(live.stats().rebuilds,3);
});
test('a deformed light keeps the painted mask pinned to its original UVs after later movement and resizing',()=>{
 const W=require('../../../assets/_script/WindowLightWarp').forType('circle'),warp=W.controls();warp[1].x+=2;const nodes=W.addNode(warp,[],0,.5);nodes[0].y+=.3;const s=stroke({flow:true,projection:{matrix:[1.2,.3,-.2,.6],type:'circle',warp,warpNodes:nodes},points:[{x:-20,y:8,strength:.3}]}),erase=mask(s),row={Nightlight:{version:1,lights:{'light:1':{erase}},emitters:[{id:'light:1',type:'circle'}]}};
 assert.deepEqual(T.issues(row.Nightlight),[]);const before=Mask.raster(erase,79,79);Object.assign(row.Nightlight.lights['light:1'],{x:150,y:-200,angle:133,scaleX:.3,scaleY:3,flipX:true});assert.deepEqual(T.value(row,'light:1').erase,erase);assert.deepEqual(Mask.raster(T.value(row,'light:1').erase,79,79),before);
 for(const projection of [{matrix:[0,0,0,0]},{matrix:[1,0,0,Infinity]},{matrix:[1,0,0,1],type:'unknown'}])assert(!Mask.valid(mask({...s,projection})));
});
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
