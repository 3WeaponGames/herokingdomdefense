'use strict';
// Real Canvas regressions for opt-in road smoothing. Source maps and game state
// are never loaded or saved; native verification owns the muted test window.
const Paint=require('../worlds/paint'),Roads=require('../worlds/roads'),fs=require('fs'),path=require('path');
async function verify(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},project=path.resolve(__dirname,'../../..'),manifest=JSON.parse(fs.readFileSync(path.join(project,'authoring/worlds/library/manifest.json'),'utf8'));
 const sources={};for(const name of ['Road Fire','Road up Fire','Field Fire']){const a=manifest.assets.find(a=>a.name===name);sources[name]={url:require('url').pathToFileURL(path.join(project,a.file)).href};}
 const images=await Paint.loadImages({images:sources}),sourceIdentity=images['Road up Fire'].image.src,base={mode:'road',assetId:'Road Fire',edgeAssetId:'Road up Fire',size:180,shape:'round',opacity:1,hardness:1,textureScale:1,edgeScale:1,edgeWidthMode:'fixed',op:'paint'};
 function s(points,extra){return Object.assign({},base,{points:points.map(p=>({x:p[0],y:p[1]}))},extra);}
 function render(strokes,w=640,h=520,offset={x:0,y:0},matrix){const c=Paint.canvas(w,h),g=c.getContext('2d');g.setTransform(1,0,0,-1,w/2+offset.x,h/2+offset.y);if(matrix)g.transform.apply(g,matrix);Paint.strokes(g,strokes,images,{canonicalCoverage:true});return c;}
 function pixel(c,x,y){return Array.from(c.getContext('2d').getImageData(Math.round(c.width/2+x),Math.round(c.height/2-y),1,1).data);}
 const fill=Paint.canvas(1,1),fg=fill.getContext('2d');fg.drawImage(images['Road Fire'].image,0,0,1,1);const road=fg.getImageData(0,0,1,1).data;
 const distance=p=>Math.abs(p[0]-road[0])+Math.abs(p[1]-road[1])+Math.abs(p[2]-road[2]);
 const straight=s([[-220,0],[220,0]]),raw=render([straight]),zero=render([Object.assign({},straight,{edgeSmoothing:0})]);
 assert(raw.toDataURL()===zero.toDataURL(),'absent and zero smoothing retain identical authored road pixels');
 function outline(c,x,half){for(let y=half;y>=0;y--)if(distance(pixel(c,x,y))<4)return y;return 0;}
 function roughness(c,half){let total=0,previous=null;for(let x=-180;x<=180;x++){const y=outline(c,x,half);if(previous!==null)total+=Math.abs(y-previous);previous=y;}return total;}
 const gentle=render([Object.assign({},straight,{edgeSmoothing:.75})]),smooth=render([Object.assign({},straight,{edgeSmoothing:1})]),rawRough=roughness(raw,90),gentleRough=roughness(gentle,90),smoothRough=roughness(smooth,90);
 assert(rawRough>10&&gentleRough<rawRough*.35,'actual Road up Fire scallops become a smooth continuous edge');
 assert(smoothRough<=gentleRough+2,'maximum smoothing removes remaining high-frequency edge variation');
 assert(distance(pixel(smooth,0,0))===0&&pixel(smooth,0,0)[3]===255,'smoothing retains the opaque original road surface color');
 assert(images['Road up Fire'].image.src===sourceIdentity,'road smoothing leaves the original source image unchanged');
 const fork=[s([[-180,0],[180,0]],{size:100,edgeSmoothing:.75}),s([[0,0],[0,160]],{size:100,edgeSmoothing:.75})],before=render(fork.map(v=>Object.assign({},v,{edgeSmoothing:0}))),joined=render(fork);
 assert(pixel(before,54,54)[3]===0&&pixel(joined,54,54)[3]>240,'joined roads round the merged outer fork throat with matching coverage');
 assert(distance(pixel(joined,0,0))===0,'joined roads have no edge drawn across the intersection');
 const loop=[s([[-150,-140],[150,-140],[150,140],[-150,140],[-150,-140]],{size:70,edgeSmoothing:1})],looped=render(loop);let clear=true;
 for(let y=-70;y<=70;y+=10)for(let x=-80;x<=80;x+=10)if(pixel(looped,x,y)[3]!==0)clear=false;
 assert(clear,'smoothing keeps a closed road island open');
 const separated=render([s([[-220,-55],[220,-55]],{size:70,edgeSmoothing:1}),s([[-220,55],[220,55]],{size:70,edgeSmoothing:1})]);
 assert([-150,-75,0,75,150].every(x=>pixel(separated,x,0)[3]===0),'nearby disconnected roads do not bridge their navigable gap');
 const erase={op:'erase',size:42,shape:'round',hardness:1,opacity:1,points:[{x:0,y:0}]},holed=render([Object.assign({},straight,{edgeSmoothing:1}),erase]);
 assert(pixel(holed,0,0)[3]===0&&pixel(holed,10,0)[3]===0,'hard erasing retains an open authored hole in a smoothed road');
 const cut=render([Object.assign({},straight,{edgeSmoothing:1}),Object.assign({},erase,{size:14,points:[{x:0,y:-150},{x:0,y:150}]})]);
 assert([-60,-30,0,30,60].every(y=>pixel(cut,0,y)[3]===0),'smoothing does not close a narrow erased passage across a road');
 const soft=render([Object.assign({},straight,{edgeSmoothing:1}),Object.assign({},erase,{opacity:.5})]);
 assert(pixel(soft,0,0)[3]>=126&&pixel(soft,0,0)[3]<=129,'partial erasing retains its authored opacity');
 const sameLayer=Paint.canvas(640,520),g=sameLayer.getContext('2d');g.fillStyle='#447755';g.fillRect(0,0,640,520);g.setTransform(1,0,0,-1,320,260);Paint.strokes(g,[Object.assign({},straight,{edgeSmoothing:1,opacity:.5}),Object.assign({},erase,{opacity:.5})],images);
 assert(pixel(sameLayer,0,0)[3]>=126&&pixel(sameLayer,0,0)[3]<=129,'soft erasing remains chronological over existing same-layer artwork');
 const narrow=render([s([[-220,0],[220,0]],{size:120,edgeSmoothing:1})]),wide=render([s([[-220,0],[220,0]],{size:240,edgeSmoothing:1})]);
 let edgeSame=true;for(let d=2;d<=40;d++){const a=pixel(narrow,0,60-d),b=pixel(wide,0,120-d);for(let k=0;k<4;k++)if(Math.abs(a[k]-b[k])>2)edgeSame=false;}
 assert(edgeSame,'different road widths retain the same fixed Road up border depth');
 const largeEdge=render([s([[-220,0],[220,0]],{size:240,edgeSmoothing:1,edgeScale:2})]);
 assert(distance(pixel(wide,0,70))<4&&distance(pixel(largeEdge,0,70))>15,'edge scale remains separately adjustable from road thickness');
 const thinAppend=render([s([[-220,0],[220,0]],{size:180,edgeSmoothing:1}),s([[-220,170],[220,170]],{size:8,edgeSmoothing:1})]);
 assert([55,60,65,70,75,80,85].every(y=>JSON.stringify(pixel(thinAppend,0,y))===JSON.stringify(pixel(smooth,0,y))),'a distant thin road does not alter an existing wider smooth border');
 const thinElsewhere=s([[280,-180],[280,-120]],{size:5,edgeSmoothing:.75}),forkWithThin=render(fork.concat(thinElsewhere));let unchanged=true;for(let y=10;y<=100;y++)for(let x=10;x<=100;x++)if(JSON.stringify(pixel(joined,x,y))!==JSON.stringify(pixel(forkWithThin,x,y)))unchanged=false;assert(unchanged,'a distant5pxroad retains every existing wide fork fillet');const thinConnected=s([[-100,0],[-100,-180]],{size:5,edgeSmoothing:.75}),connected=render(fork.concat(thinConnected));assert([54,55,56].every(p=>pixel(connected,p,p)[3]===pixel(joined,p,p)[3]),'a connected thin fork does not shrink the wider junction rounding');
 const liveBuilds=Roads.stats().builds;render([Object.assign({},straight,{edgeSmoothing:1,preview:true})]);
 assert(Roads.stats().builds===liveBuilds,'live smoothed-road previews retain the fast path without building contours');
 const angle=.41,scale=.85,matrix=[Math.cos(angle)*scale,Math.sin(angle)*scale,-Math.sin(angle)*scale,Math.cos(angle)*scale,14,-9],full=render(fork,640,520,{x:0,y:0},matrix),pieces=Paint.canvas(640,520),pg=pieces.getContext('2d');
 for(let x=0;x<640;x+=320){const part=render(fork,320,520,{x:160-x,y:0},matrix);pg.drawImage(part,x,0);}
 const a=full.getContext('2d').getImageData(0,0,640,520).data,b=pg.getImageData(0,0,640,520).data;let bad=0,maxDifference=0,maxPremultipliedDifference=0;for(let i=0;i<a.length;i+=4){const alpha=Math.abs(a[i+3]-b[i+3]);maxDifference=Math.max(maxDifference,alpha);if(alpha>2)bad++;for(let k=0;k<3;k++){const d=Math.abs(a[i+k]*a[i+3]-b[i+k]*b[i+3])/255;maxPremultipliedDifference=Math.max(maxPremultipliedDifference,d);if(d>2)bad++;}}
 assert(bad===0,'rotated and scaled smooth road coverage matches across baked tile boundaries');
 const transformed={x:matrix[0]*54+matrix[2]*54+matrix[4],y:matrix[1]*54+matrix[3]*54+matrix[5]};
 assert(pixel(full,transformed.x,transformed.y)[3]>220,'rounded fork coverage follows its layer rotation and scale');
 const line=s([[-8000,0],[8000,0]],{size:5,edgeSmoothing:1});assert(pixel(render([line]),0,0)[3]===255,'large-map narrow roads retain exact opaque native coverage');
 assert(Roads.stats().bytes<=24*1024*1024,'smooth road raster caches remain within the authoring budget');
 return {checks,roughness:{raw:rawRough,smoothing75:gentleRough,smoothing100:smoothRough},tileDifference:{bad,maxDifference,maxPremultipliedDifference},cache:Roads.stats()};
}
module.exports={verify};
