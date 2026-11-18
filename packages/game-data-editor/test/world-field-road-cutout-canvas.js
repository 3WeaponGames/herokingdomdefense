'use strict';
// Native Canvas pixels, synthetic images, and in-memory drafts only.
const Paint=require('../worlds/paint'),M=require('../worlds/model'),Roads=require('../worlds/roads'),Renderer=require('../worlds/renderer'),Baker=require('../worlds/baker');
async function verify(){
 const checks=[],assert=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
 function tile(color,w=16,h=16){const c=Paint.canvas(w,h),g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,w,h);return c.toDataURL();}
 const library=[{id:'road',category:'roads',url:tile('#d23c28'),width:16,height:16},{id:'edge',category:'roads',url:tile('#1e46dc',64,12),width:64,height:12},{id:'field',category:'field',url:tile('#1eb446'),width:16,height:16},{id:'other',category:'custom',url:tile('#af4bb4'),width:16,height:16}];
 const images=await Paint.loadImages({images:Object.fromEntries(library.map(a=>[a.id,a]))});
 const road=(extra={})=>Object.assign({mode:'road',assetId:'road',edgeAssetId:'edge',edgeStyle:'textured',edgeSmoothing:.6,edgeWidthMode:'fixed',size:180,opacity:1,op:'paint',points:[{x:-140,y:0},{x:140,y:0}]},extra);
 const field=(extra={})=>Object.assign({assetId:'field',size:70,shape:'round',hardness:1,opacity:1,op:'paint',points:[{x:0,y:0}]},extra);
 function map(strokes){const value=M.createMap('field-cut','Field cut','forest');value.size=value.playable={width:400,height:400};value.layers=[];value.ground.roads.strokes=strokes;return value;}
 function render(value,options){const c=Paint.canvas(value.size.width,value.size.height),g=c.getContext('2d'),view=[1,0,0,-1,c.width/2,c.height/2];g.setTransform(...view);Paint.ground(g,value,images,view,null,options);return c;}
 function pixel(c,x,y){return Array.from(c.getContext('2d').getImageData(Math.round(c.width/2+x),Math.round(c.height/2-y),1,1).data);}
 const blue=p=>p[2]>180&&p[0]<70&&p[1]<100&&p[3]>240,green=p=>p[1]>150&&p[0]<70&&p[2]<100&&p[3]>240,red=p=>p[0]>180&&p[1]<100&&p[2]<100&&p[3]>240;
 const lipCount=(c,shape)=>{let n=0;for(let y=-50;y<=50;y++)for(let x=-50;x<=50;x++){const d=shape==='square'?Math.max(Math.abs(x),Math.abs(y)):Math.hypot(x,y);if(d>35&&d<48&&blue(pixel(c,x,y)))n++;}return n;};
 try{
  for(const shape of ['round','square']){const value=map([road(),field({shape})]),before=JSON.stringify(value),c=render(value);assert(green(pixel(c,0,0)),'opaque '+shape+' Field paint replaces the road center');assert(lipCount(c,shape)>40,'native Road up texture follows the new '+shape+' inner boundary');assert(blue(pixel(c,100,85))&&red(pixel(c,100,0)),'field '+shape+' cut retains the original outside edge and unaffected road material');assert(JSON.stringify(value)===before,'rendering '+shape+' cuts never migrates or mutates authored strokes');}
  const interrupted=render(map([road(),field({assetId:'other',size:15,points:[{x:170,y:130}]}),field()]));
  assert(lipCount(interrupted,'round')>40,'field cuts retrace earlier road batches across intervening ordinary paint');
  const separate=map([road()]);separate.ground.grass.strokes=[field()];const separateCanvas=render(separate);
  assert(green(pixel(separateCanvas,0,0))&&red(pixel(separateCanvas,40,0)),'Field paint on another ground layer covers pixels without carving the underlying road layer');
  const reclaim=render(map([road(),field(),road({size:30,points:[{x:-110,y:0},{x:110,y:0}]})]));
  assert(red(pixel(reclaim,0,0)),'later road paint reclaims an earlier field cut in chronological order');
  const recut=render(map([road(),field(),road({size:30,points:[{x:-110,y:0},{x:110,y:0}]}),field({size:14})]));
  assert(green(pixel(recut,0,0))&&red(pixel(recut,90,0)),'a subsequent field stroke cuts every prior road while leaving later-road material elsewhere intact');
  const half=render(map([road(),field({opacity:.5})])),p=pixel(half,0,0),expected=[120,120,55,255];
  assert(p.every((v,i)=>Math.abs(v-expected[i])<=1),'50 percent Field paint blends once with road pixels without a double cut or foundation bleed');
  assert(red(pixel(half,40,0)),'partial Field coverage does not invent an opaque inner road edge');
  const softStroke=field({hardness:.2}),soft=render(map([road(),softStroke])),plain=Paint.canvas(400,400),pg=plain.getContext('2d');pg.fillStyle='#d23c28';pg.fillRect(0,0,400,400);pg.setTransform(1,0,0,-1,200,200);Paint.brush(pg,softStroke,images);
  assert(pixel(soft,25,0).every((v,i)=>Math.abs(v-pixel(plain,25,0)[i])<=1),'soft Field falloff retains its single normal opacity blend');
  const hinted=render(map([road(),field({assetId:'other',roadCutout:true})]));assert(lipCount(hinted,'round')>40,'new explicit cutout hints work when a field asset has no category metadata');
  const value=map([road(),field()]),live=M.clone(value);live.ground.roads.strokes[1].preview=true;const cached=Renderer.create(),c=Paint.canvas(400,400),cg=c.getContext('2d');cg.setTransform(1,0,0,-1,200,200);cached.draw(cg,live,images,{target:'roads'});
  assert(lipCount(c,'round')>40,'transient Field preview already shows the rebuilt native edge');
  const committed=render(value),a=c.getContext('2d').getImageData(0,0,400,400).data,b=committed.getContext('2d').getImageData(0,0,400,400).data;
  assert(a.every((v,i)=>Math.abs(v-b[i])<=2),'cached live preview matches committed Field-cut rendering');
  const stats=cached.stats();cached.draw(cg,live,images,{target:'roads'});assert(cached.stats().builds===stats.builds,'idle redraw reuses the unchanged cutout raster');cached.clear();
  const noRole=map([road(),field({assetId:'other'})]),roleCache=Renderer.create(),roleCanvas=Paint.canvas(400,400),rc=roleCanvas.getContext('2d');rc.setTransform(1,0,0,-1,200,200);roleCache.draw(rc,noRole,images);const initial=roleCache.stats();images.other.terrainRole='field';roleCache.draw(rc,noRole,images);assert(roleCache.stats().builds>initial.builds&&lipCount(roleCanvas,'round')>40,'field-role metadata changes invalidate the cached preview');delete images.other.terrainRole;roleCache.clear();
  const mergeSource=map([road(),field()]),mergeBefore=JSON.stringify(mergeSource),merged=M.mergeGroundStrokes(mergeSource,'roads'),mergedPixels=render(merged),originalPixels=render(mergeSource);
  assert(merged.ground.roads.strokes.length===1&&mergedPixels.toDataURL()===originalPixels.toDataURL(),'merging road and Field recipes retains the exact carved edge pixels');
  assert(JSON.stringify(mergeSource)===mergeBefore,'merging keeps the original Field and Road records immutable');
  const reclaimed=M.stroke(merged,'roads',road({size:30,points:[{x:-110,y:0},{x:110,y:0}]})),nested=M.mergeGroundStrokes(reclaimed,'roads'),tinted=M.stroke(nested,'roads',field({opacity:.5}));
  assert(pixel(render(tinted),0,0).every((v,i)=>Math.abs(v-expected[i])<=1),'later road and partial Field paint retain chronological single-opacity behavior across nested merged groups');
  const liveMerged=M.stroke(M.mergeGroundStrokes(map([road(),field({assetId:'other',size:15,points:[{x:170,y:130}]})]),'roads'),'roads',field({preview:true})),mergedCache=Renderer.create(),mc=Paint.canvas(400,400),mg=mc.getContext('2d');mg.setTransform(1,0,0,-1,200,200);mergedCache.draw(mg,liveMerged,images,{target:'roads'});assert(lipCount(mc,'round')>40,'cached transient Field painting retraces roads nested inside merged paint groups');mergedCache.clear();
  const wide=map([road({points:[{x:-1080,y:0},{x:1080,y:0}]}),field({points:[{x:896,y:0}],shape:'square'}),field({points:[{x:-300,y:0}],opacity:.5})]);wide.size=wide.playable={width:2304,height:400};const before=JSON.stringify(wide),full=render(wide,{canonicalCoverage:true}),bakeMap=M.mergeGroundStrokes(wide,'roads'),bakeBefore=JSON.stringify(bakeMap),baked=await Paint.bake(Baker.spec('',bakeMap,library)),stitched=Paint.canvas(2304,400),sg=stitched.getContext('2d');
  for(const part of baked.ground){const source=baked.files.find(f=>f.name===part.name),im=new Image();await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=reject;im.src=source.png;});sg.drawImage(im,part.x+wide.size.width/2-part.width/2,wide.size.height/2-part.y-part.height/2);}
  const fp=full.getContext('2d').getImageData(0,0,2304,400).data,sp=sg.getImageData(0,0,2304,400).data;let bad=0,max=0;for(let i=0;i<fp.length;i++){const d=Math.abs(fp[i]-sp[i]);if(d>3)bad++;max=Math.max(max,d);}
  assert(baked.ground.length===2&&bad===0,'merged-recipe baked PNG tiles match the complete Field-cut render across the 2048 pixel seam');assert(JSON.stringify(wide)===before&&JSON.stringify(bakeMap)===bakeBefore,'baking keeps field strokes, merged groups, road settings and source data unchanged');assert(Roads.stats().bytes<=24*1024*1024,'Field cut contours retain the bounded road cache');
  return{checks,bakeComparison:{bad,max}};
 }finally{Paint.clearMasks();Roads.clear();}
}
module.exports={verify};
