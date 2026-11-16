'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),Paint=require('../worlds/paint');

// The previous shelf layout is the compatibility and memory ceiling.
function shelf(items){const pages=[],assets={};let page;for(const item of items){const frames=[],anchor=item.anchor||{x:.5,y:0},scaleX=(item.worldWidth===undefined?item.width:item.worldWidth)/item.width,scaleY=(item.worldHeight===undefined?item.height:item.worldHeight)/item.height;for(let sy=0;sy<item.height;sy+=2044)for(let sx=0;sx<item.width;sx+=2044){const w=Math.min(2044,item.width-sx),h=Math.min(2044,item.height-sy);if(!page){page={name:'objects-'+pages.length,x:2,y:2,row:0,width:1,height:1};pages.push(page);}if(page.x+w+2>2048){page.x=2;page.y+=page.row;page.row=0;}if(page.y+h+2>2048){page={name:'objects-'+pages.length,x:2,y:2,row:0,width:1,height:1};pages.push(page);}page.width=Math.max(page.width,page.x+w+2);page.height=Math.max(page.height,page.y+h+2);frames.push({name:item.id+'-'+sx+'-'+sy,atlas:page.name,trimX:page.x,trimY:page.y,width:w,height:h,sx,sy,x:(sx-anchor.x*item.width)*scaleX,y:((1-anchor.y)*item.height-sy-h)*scaleY,...(scaleX!==1||scaleY!==1?{worldWidth:w*scaleX,worldHeight:h*scaleY}:{})});page.x+=w+4;page.row=Math.max(page.row,h+4);}assets[item.id]={frames};}return {pages:pages.map(p=>({name:p.name,width:Math.min(2048,p.width),height:Math.min(2048,p.height)})),assets};}
const pixels=plan=>plan.pages.reduce((n,p)=>n+p.width*p.height,0);
function validate(plan){const all=Object.values(plan.assets).flatMap(a=>a.frames);for(const [index,page] of plan.pages.entries()){assert.equal(page.name,'objects-'+index);assert.ok(page.width<=2048&&page.height<=2048);const frames=all.filter(f=>f.atlas===page.name);for(const f of frames){assert.ok(f.trimX>=2&&f.trimY>=2);assert.ok(f.trimX+f.width+2<=page.width);assert.ok(f.trimY+f.height+2<=page.height);}for(let i=0;i<frames.length;i++)for(let j=i+1;j<frames.length;j++){const a=frames[i],b=frames[j];assert.ok(a.trimX+a.width+4<=b.trimX||b.trimX+b.width+4<=a.trimX||a.trimY+a.height+4<=b.trimY||b.trimY+b.height+4<=a.trimY,'frames retain four clear pixels between them');}}}
function sourceFrames(plan){return Object.fromEntries(Object.entries(plan.assets).map(([id,a])=>[id,a.frames.map(({atlas,trimX,trimY,...source})=>source)]));}

test('world atlas packing: mixed upright shapes share one page without changing source frames',()=>{
 const items=[{id:'tall',width:900,height:1600},{id:'short',width:900,height:400},{id:'medium',width:900,height:1200}],old=shelf(items),packed=Paint.atlasPlan(items);
 assert.equal(old.pages.length,2);assert.equal(packed.pages.length,1);assert.deepEqual(sourceFrames(packed),sourceFrames(old));validate(packed);
});

test('world atlas packing: equal page counts can reduce texture memory and preserve simple layouts',()=>{
 const items=[{id:'wide',width:900,height:500},{id:'thin',width:200,height:1400},{id:'tall',width:700,height:1300}],old=shelf(items),packed=Paint.atlasPlan(items);
 assert.equal(packed.pages.length,old.pages.length);assert.ok(pixels(packed)<pixels(old));validate(packed);
 for(const simple of [[],[{id:'tree',width:80,height:120}],[{id:'a',width:40,height:60},{id:'b',width:40,height:60}]])assert.deepEqual(Paint.atlasPlan(simple),shelf(simple));
});

test('world atlas packing: oversized native and legacy terrain retain exact tiling, UVs and world offsets',()=>{
 const items=[{id:'legacy-cliff',width:2172,height:724,anchor:{x:.31,y:.17}},{id:'native-hill',width:4100,height:2300,worldWidth:1845,worldHeight:1035,anchor:{x:.5,y:0}},{id:'masked-edge',width:837,height:1880,anchor:{x:0,y:1}}],old=shelf(items),packed=Paint.atlasPlan(items);
 assert.deepEqual(sourceFrames(packed),sourceFrames(old));assert.equal(packed.assets['native-hill'].frames.length,6);assert.equal(packed.assets['legacy-cliff'].frames[1].sx,2044);assert.equal(packed.assets['legacy-cliff'].frames[1].width,128);validate(packed);
 assert.ok(packed.pages.length<old.pages.length||packed.pages.length===old.pages.length&&pixels(packed)<=pixels(old));
});

test('world atlas packing: deterministic placement and padding hold over varied reusable assets',()=>{
 let seed=1701;const next=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
 for(let batch=0;batch<16;batch++){const items=Array.from({length:8+batch},(_,i)=>({id:'asset-'+i,width:8+next()%2100,height:8+next()%2100,anchor:{x:.5,y:0}})),input=JSON.stringify(items),old=shelf(items),packed=Paint.atlasPlan(items);validate(packed);assert.equal(JSON.stringify(items),input,'the authoring records are untouched');assert.deepEqual(Paint.atlasPlan(items),packed);assert.deepEqual(sourceFrames(packed),sourceFrames(old));assert.ok(packed.pages.length<old.pages.length||packed.pages.length===old.pages.length&&pixels(packed)<=pixels(old));}
});

test('world atlas packing: standalone browser bake uses the same planner without module dependencies',()=>{
 const context={WorldRoads:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../worlds/paint'),'utf8'),context);
 const items=[{id:'large',width:900,height:1600},{id:'small',width:900,height:400},{id:'medium',width:900,height:1200}];assert.equal(JSON.stringify(context.WorldPaint.atlasPlan(items)),JSON.stringify(Paint.atlasPlan(items)));
});
