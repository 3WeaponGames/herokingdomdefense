'use strict';
// Native Canvas checks for texture-preserving road borders. All documents are
// in-memory; the owned muted renderer must be closed by its caller.
const Paint=require('../worlds/paint'),Roads=require('../worlds/roads'),fs=require('fs'),path=require('path');
async function verify(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},project=path.resolve(__dirname,'../../..'),manifest=JSON.parse(fs.readFileSync(path.join(project,'authoring/worlds/library/manifest.json'),'utf8')),sources={};
 for(const name of ['Road Fire','Road up Fire','Field Fire']){const a=manifest.assets.find(a=>a.name===name);sources[name]=Object.assign({},a,{url:require('url').pathToFileURL(path.join(project,a.file)).href});}
 const images=await Paint.loadImages({images:sources}),base={mode:'road',assetId:'Road Fire',edgeAssetId:'Road up Fire',edgeStyle:'textured',edgeSmoothing:.6,edgeWidthMode:'fixed',edgeScale:1,textureScale:1,size:180,shape:'round',hardness:1,opacity:1,op:'paint'};
 const s=(points,extra)=>Object.assign({},base,{points:points.map(p=>({x:p[0],y:p[1]}))},extra);
 function render(strokes,w=1100,h=440,offset={x:0,y:0},matrix){const c=Paint.canvas(w,h),g=c.getContext('2d');g.setTransform(1,0,0,-1,w/2+offset.x,h/2+offset.y);if(matrix)g.transform.apply(g,matrix);Paint.strokes(g,strokes,images,{canonicalCoverage:true});return c;}
 const pixel=(c,x,y)=>Array.from(c.getContext('2d').getImageData(Math.round(c.width/2+x),Math.round(c.height/2-y),1,1).data);
 const fillCanvas=Paint.canvas(1,1),fg=fillCanvas.getContext('2d');fg.drawImage(images['Road Fire'].image,0,0,1,1);const fill=Array.from(fg.getImageData(0,0,1,1).data),difference=p=>fill.slice(0,3).reduce((n,v,k)=>n+Math.abs(v-p[k]),0);
 const edge=images['Road up Fire'].image,source=Paint.canvas(edge.naturalWidth,edge.naturalHeight),eg=source.getContext('2d');eg.drawImage(edge,0,0);const rgba=eg.getImageData(0,0,source.width,source.height).data,reference=[];
 for(let x=1;x<source.width-1;x++){let last=0;for(let y=1;y<source.height-1;y++)if(rgba[(y*source.width+x)*4+3]>=128)last=y-1;reference.push(last);}
 function profile(c,half=90){const out=[],data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let x=-300;x<=300;x+=2){let last=0;for(let d=3;d<=54;d++){const at=(Math.round(c.height/2-half+d)*c.width+Math.round(c.width/2+x))*4;if(fill.slice(0,3).reduce((n,v,k)=>n+Math.abs(v-data[at+k]),0)>8)last=d;}out.push(last);}return out;}
 const mean=a=>a.reduce((n,v)=>n+v,0)/a.length,sd=a=>Math.sqrt(a.reduce((n,v)=>n+Math.pow(v-mean(a),2),0)/a.length),range=a=>Math.max(...a)-Math.min(...a);
 function correlation(a,b){const ma=mean(a),mb=mean(b);let aa=0,bb=0,ab=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;aa+=x*x;bb+=y*y;ab+=x*y;}return ab/Math.sqrt(aa*bb);}
 const straight=s([[-400,0],[400,0]]),textured=render([straight]),actual=profile(textured);
 let best={correlation:-1};for(let period=230;period<=260;period+=.5)for(let phase=0;phase<reference.length;phase++)for(const direction of [1,-1]){
  const projected=actual.map((_,i)=>{const u=((phase+direction*i*2/period*reference.length)%reference.length+reference.length)%reference.length,j=Math.floor(u),t=u-j;return reference[j]*(1-t)+reference[(j+1)%reference.length]*t;}),value=correlation(actual,projected);if(value>best.correlation)best={correlation:value,period,phase,direction};
 }
 assert(best.correlation>.95,'rendered Road up scallops correlate with the original source profile over whole repeats');
 assert(range(actual)>=10&&sd(actual)>sd(reference)*.8,'textured roads retain the original edge variation rather than averaging it away');
 const maximum=render([Object.assign({},straight,{edgeSmoothing:1})]);assert(range(profile(maximum))>=10&&sd(profile(maximum))>sd(reference)*.8,'maximum bend smoothing retains the original source texture variation');
 const clean=render([Object.assign({},straight,{edgeStyle:'clean'})]),implicit=Object.assign({},straight);delete implicit.edgeStyle;
 assert(sd(profile(clean))<1,'Clean remains an explicit separately smooth border style');
 const previous=render([implicit]),ca=clean.getContext('2d').getImageData(0,0,1100,440).data,pa=previous.getContext('2d').getImageData(0,0,1100,440).data;let cleanDifference=0,cleanPixels=0;for(let i=0;i<ca.length;i++){const d=Math.abs(ca[i]-pa[i]);cleanDifference=Math.max(cleanDifference,d);if(d)cleanPixels++;}assert(cleanDifference===0,'previous authored clean roads retain their original pixels without an edgeStyle field');
 const sourceAfter=Paint.canvas(edge.naturalWidth,edge.naturalHeight),sourceContext=sourceAfter.getContext('2d');sourceContext.drawImage(edge,0,0);const afterRGBA=sourceContext.getImageData(0,0,sourceAfter.width,sourceAfter.height).data;assert(rgba.every((v,i)=>v===afterRGBA[i])&&images['Road up Fire'].image.src===sources['Road up Fire'].url,'texture refinement does not alter the original image pixels or source');
 const oldClean=s([[-220,0],[220,0]],{edgeSmoothing:.6});delete oldClean.edgeStyle;const newClean=s([[0,-160],[0,160]],{edgeStyle:'clean',edgeSmoothing:.6}),mixedClean=render([oldClean,newClean],640,520);assert(difference(pixel(mixedClean,75,0))===0,'new Clean roads join implicit legacy Clean roads without an internal border');
 const zero=render([Object.assign({},straight,{edgeSmoothing:0})]);assert(sd(profile(zero))>2.5,'zero bend smoothing still uses the real Road up texture');
 let capMinimum=Infinity,capMaximum=-Infinity;for(let i=0;i<=80;i++){const a=-Math.PI/2+i/80*Math.PI;let last=0;for(let d=2;d<=60;d++){const p=pixel(textured,400+Math.cos(a)*(90-d),Math.sin(a)*(90-d));if(difference(p)>8)last=d;}capMinimum=Math.min(capMinimum,last);capMaximum=Math.max(capMaximum,last);}
 assert(capMinimum>=25&&capMaximum<=45,'rounded cap detail stays within the source edge height without amplified miter spikes');
 assert(difference(pixel(textured,0,0))===0&&pixel(textured,0,0)[3]===255,'the opaque road interior keeps its original material color');
 const fork=[s([[-180,0],[180,0]],{size:100}),s([[0,0],[0,160]],{size:100})],joined=render(fork,640,520);
 assert(difference(pixel(joined,0,0))===0,'joined textured roads have no transverse border through the intersection');
 assert(pixel(joined,54,54)[3]>220,'textured road joins share the rounded native coverage mask');
 const loop=render([s([[-160,-100],[160,-100],[160,100],[-160,100],[-160,-100]],{size:100})],640,520);
 assert(pixel(loop,0,0)[3]===0,'a textured road loop preserves its transparent island');
 const separated=render([s([[-220,-110],[220,-110]]),s([[-220,110],[220,110]])],640,520);
 assert(pixel(separated,0,0)[3]===0,'nearby textured roads do not bridge a disconnected gap');
 const erase={op:'erase',shape:'round',size:42,hardness:1,opacity:1,points:[{x:0,y:0}]},cut=render([straight,erase]);
 assert(pixel(cut,0,0)[3]===0,'hard erasing keeps its authored opening in the textured road');
 const partial=render([straight,Object.assign({},erase,{opacity:.5})]);
 assert(pixel(partial,0,0)[3]>=126&&pixel(partial,0,0)[3]<=129&&difference(pixel(partial,0,0))<3,'partial erasing preserves opacity and material without inventing an edge in a faint hole');
 const sameLayer=Paint.canvas(1100,440),bg=sameLayer.getContext('2d');bg.fillStyle='#998844';bg.fillRect(0,0,sameLayer.width,sameLayer.height);bg.setTransform(1,0,0,-1,550,220);Paint.strokes(bg,[Object.assign({},straight,{opacity:.5}),Object.assign({},erase,{opacity:.5})],images);
 assert(pixel(sameLayer,0,0)[3]>=126&&pixel(sameLayer,0,0)[3]<=129,'soft erasing remains chronological over earlier same-layer artwork');
 const wide=render([Object.assign({},straight,{size:240})],1100,440),wideProfile=profile(wide,120);
 assert(Math.abs(Math.min(...wideProfile)-Math.min(...actual))<=1&&Math.abs(Math.max(...wideProfile)-Math.max(...actual))<=1,'different road widths preserve the same Road up border depth');
 const mixed=render([straight,s([[-400,170],[400,170]],{size:5})],1100,440);
 assert([-300,-200,0,200,300].every(x=>[50,60,70,80].every(y=>JSON.stringify(pixel(mixed,x,y))===JSON.stringify(pixel(textured,x,y)))),'a distant thin road does not resize or alter a wider textured border');
 const build=Roads.stats().builds;render([Object.assign({},straight,{preview:true})]);assert(Roads.stats().builds===build,'textured live previews retain the fast path without contour work');
 const angle=.41,scale=.85,matrix=[Math.cos(angle)*scale,Math.sin(angle)*scale,-Math.sin(angle)*scale,Math.cos(angle)*scale,14,-9],full=render(fork,640,520,{x:0,y:0},matrix),pieces=Paint.canvas(640,520),pg=pieces.getContext('2d');
 for(let x=0;x<640;x+=320)pg.drawImage(render(fork,320,520,{x:160-x,y:0},matrix),x,0);
 const a=full.getContext('2d').getImageData(0,0,640,520).data,b=pg.getImageData(0,0,640,520).data;let bad=0,maxPremultiplied=0;for(let i=0;i<a.length;i+=4){if(Math.abs(a[i+3]-b[i+3])>2)bad++;for(let k=0;k<3;k++){const d=Math.abs(a[i+k]*a[i+3]-b[i+k]*b[i+3])/255;maxPremultiplied=Math.max(maxPremultiplied,d);if(d>2)bad++;}}
 assert(!bad,'rotated and scaled textured roads remain consistent across baked tile boundaries');
 assert(pixel(render([s([[-8000,0],[8000,0]],{size:5})]),0,0)[3]===255,'long thin textured roads preserve opaque native coverage');
 assert(Roads.stats().bytes<=24*1024*1024,'textured road caching stays within the authoring memory budget');
 return {checks,sourceProfile:{correlation:best.correlation,sourceRange:range(reference),renderedRange:range(actual),sourceDeviation:sd(reference),renderedDeviation:sd(actual),capMinimum,capMaximum},tileDifference:{bad,maxPremultiplied},cache:Roads.stats()};
}
module.exports={verify};
