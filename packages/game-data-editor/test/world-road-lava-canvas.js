'use strict';
// Native Canvas regressions for Lava's outer rock silhouette. No project data is saved.
const Paint=require('../worlds/paint'),Roads=require('../worlds/roads'),fs=require('fs'),path=require('path');
async function verify(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},root=path.resolve(__dirname,'../../..'),manifest=require('../../../authoring/worlds/library/manifest.json'),sources={};
 for(const name of ['Road Lava','Road up Lava']){const a=manifest.assets.find(a=>a.name===name);sources[name]={url:require('url').pathToFileURL(path.join(root,a.file)).href};}
 const images=await Paint.loadImages({images:sources}),edge=images['Road up Lava'].image,copy=Paint.canvas(edge.naturalWidth,edge.naturalHeight),sourceCtx=copy.getContext('2d');sourceCtx.drawImage(edge,0,0);const original=sourceCtx.getImageData(0,0,copy.width,copy.height).data;
 const base={mode:'road',assetId:'Road Lava',edgeAssetId:'Road up Lava',edgeStyle:'textured',edgeWidthMode:'fixed',edgeExterior:'cutout',edgeSmoothing:.6,edgeScale:1,textureScale:1,size:320,shape:'round',hardness:1,opacity:1,op:'paint'};
 const stroke=(points,extra)=>Object.assign({},base,{points:points.map(p=>({x:p[0],y:p[1]}))},extra),straight=stroke([[-350,0],[350,0]]);
 function render(strokes,w=1000,h=600,offset={x:0,y:0},matrix,bg){const c=Paint.canvas(w,h),g=c.getContext('2d');if(bg)g.drawImage(bg,0,0,w,h);g.setTransform(1,0,0,-1,w/2+offset.x,h/2+offset.y);if(matrix)g.transform.apply(g,matrix);Paint.strokes(g,strokes,images,{canonicalCoverage:true});return c;}
 const pixel=(c,x,y)=>Array.from(c.getContext('2d').getImageData(Math.round(c.width/2+x),Math.round(c.height/2-y),1,1).data),near=(a,b,t=2)=>a.slice(0,3).every((v,i)=>Math.abs(v-b[i])<=t);
 const cutout=render([straight]),old=Object.assign({},straight);delete old.edgeExterior;const legacy=render([old]),cd=cutout.getContext('2d').getImageData(0,0,1000,600).data,ld=legacy.getContext('2d').getImageData(0,0,1000,600).data;let removed=0,partial=0;
 for(let y=135;y<180;y++)for(let x=240;x<760;x++){const at=(y*1000+x)*4;if(cd[at+3]===0&&ld[at+3]===255&&near(Array.from(ld.slice(at,at+4)),[243,142,92]))removed++;if(cd[at+3]>0&&cd[at+3]<255)partial++;}
 assert(removed>100,'Lava outer transparency removes the orange road-fill halo');
 assert(partial>10,'Lava rock silhouette keeps antialiased source alpha');
 assert(near(pixel(cutout,0,0),[243,142,92])&&pixel(cutout,0,0)[3]===255,'Lava road interior remains its original opaque surface color');
 let rock=0,glow=0;for(let i=0;i<cd.length;i+=4){if(cd[i+3]===255&&near(Array.from(cd.slice(i,i+4)),[139,86,61]))rock++;if(cd[i+3]===255&&near(Array.from(cd.slice(i,i+4)),[245,215,110]))glow++;}
 assert(rock>1000&&glow>1000,'Lava keeps the raw brown rock and yellow glow bands');
 sourceCtx.clearRect(0,0,copy.width,copy.height);sourceCtx.drawImage(edge,0,0);const afterSource=sourceCtx.getImageData(0,0,copy.width,copy.height).data;assert(original.every((v,i)=>v===afterSource[i]),'Lava source RGBA pixels are never rewritten');
 const background=Paint.canvas(1000,600),bg=background.getContext('2d');bg.fillStyle='#2255aa';bg.fillRect(0,0,1000,600);bg.fillStyle='#75c233';bg.fillRect(500,0,500,600);
 const composite=render([straight],1000,600,{x:0,y:0},null,background),compositeData=composite.getContext('2d').getImageData(0,0,1000,600).data,bgData=bg.getImageData(0,0,1000,600).data;let revealed=0;
 for(let i=0;i<cd.length;i+=4)if(cd[i+3]===0&&ld[i+3]===255){if(compositeData[i]===bgData[i]&&compositeData[i+1]===bgData[i+1]&&compositeData[i+2]===bgData[i+2])revealed++;}
 assert(revealed>1000,'outer Lava transparency reveals arbitrary underlying images instead of a hardcoded field color');
 const opacity=render([Object.assign({},straight,{opacity:.5})]);assert(pixel(opacity,0,0)[3]===128,'road opacity applies once to the Lava interior');
 const erase={op:'erase',size:60,shape:'round',hardness:1,opacity:1,points:[{x:0,y:0}]},erased=render([straight,erase]);assert(pixel(erased,0,0)[3]===0,'hard erasing remains an open hole through a Lava road');
 const semi=render([Object.assign({},straight,{opacity:.5}),Object.assign({},erase,{opacity:.5})]);assert(pixel(semi,0,0)[3]>=63&&pixel(semi,0,0)[3]<=65,'partial erasing preserves authored Lava opacity');
 const sameLayer=render([Object.assign({},straight,{opacity:.5}),Object.assign({},erase,{opacity:.5})],1000,600,{x:0,y:0},null,background);assert(pixel(sameLayer,0,0)[3]>=126&&pixel(sameLayer,0,0)[3]<=129,'partial erasing remains chronological over same-layer background artwork');
 const fork=[stroke([[-250,0],[250,0]]),stroke([[0,0],[0,210]])],joined=render(fork);assert(near(pixel(joined,0,0),[243,142,92])&&pixel(joined,0,0)[3]===255,'joined Lava roads have no rock or glow stripe across their intersection');
 const loop=render([stroke([[-230,-180],[230,-180],[230,180],[-230,180],[-230,-180]],{size:180})],1000,700);assert(pixel(loop,0,0)[3]===0,'closed Lava roads retain their central island');
 const isolated=render([stroke([[-300,-180],[300,-180]],{size:180}),stroke([[-300,180],[300,180]],{size:180})],1000,700);assert(pixel(isolated,0,0)[3]===0,'nearby Lava roads do not bridge the gap between them');
 const a=.37,s=.8,matrix=[Math.cos(a)*s,Math.sin(a)*s,-Math.sin(a)*s,Math.cos(a)*s,12,-8],full=render(fork,800,700,{x:0,y:0},matrix),parts=Paint.canvas(800,700),pg=parts.getContext('2d');for(let x=0;x<800;x+=400)pg.drawImage(render(fork,400,700,{x:200-x,y:0},matrix),x,0);
 const fd=full.getContext('2d').getImageData(0,0,800,700).data,pd=pg.getImageData(0,0,800,700).data;let bad=0,max=0;for(let i=0;i<fd.length;i+=4){if(Math.abs(fd[i+3]-pd[i+3])>2)bad++;for(let k=0;k<3;k++){const d=Math.abs(fd[i+k]*fd[i+3]-pd[i+k]*pd[i+3])/255;max=Math.max(max,d);if(d>2)bad++;}}
 assert(!bad,'rotated and scaled Lava cutout coverage stays seamless across baked tiles');
 const baseline=render([old]),bd=baseline.getContext('2d').getImageData(0,0,1000,600).data;let legacyBad=0,legacyMax=0;for(let i=0;i<ld.length;i+=4){if(Math.abs(ld[i+3]-bd[i+3])>2)legacyBad++;for(let k=0;k<3;k++){const d=Math.abs(ld[i+k]*ld[i+3]-bd[i+k]*bd[i+3])/255;legacyMax=Math.max(legacyMax,d);if(d>2)legacyBad++;}}assert(!legacyBad,'legacy Lava rendering remains unchanged without the explicit exterior mode');
 assert(Roads.stats().bytes<=24*1024*1024,'Lava cutout rasters respect the authoring cache budget');
 return {checks,haloPixelsRemoved:removed,underlyingImagePixelsRevealed:revealed,tileDifference:{bad,max},legacyDifference:{bad:legacyBad,max:legacyMax},cache:Roads.stats()};
}
module.exports={verify};
