'use strict';
// Native Canvas checks use synthetic source images and in-memory drafts only.
const Paint=require('../worlds/paint'),Roads=require('../worlds/roads');
async function verify(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 function img(c){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve({image:i,width:c.width,height:c.height});i.onerror=reject;i.src=c.toDataURL();});}
 const tile=Paint.canvas(16,16),f=tile.getContext('2d');f.fillStyle='#e84130';f.fillRect(0,0,16,16);
 const lip=Paint.canvas(32,8),e=lip.getContext('2d');e.fillStyle='#325ac5';e.fillRect(0,0,32,4);for(let x=0;x<32;x++)e.fillRect(x,4,1,2+Math.round(Math.sin(x/32*Math.PI*2)));
 const images={road:await img(tile),edge:await img(lip)},base={mode:'road',assetId:'road',edgeAssetId:'edge',size:64,shape:'round',opacity:1,hardness:1,textureScale:1,edgeScale:1,op:'paint'};
 const stroke=points=>Object.assign({},base,{points:points.map(p=>({x:p[0],y:p[1]}))}),curved=stroke([[-150,-90],[-80,-90],[-20,-45],[10,20],[75,80],[150,80]]);
 function render(strokes,w=400,h=320,dx=0,dy=0){const c=Paint.canvas(w,h),g=c.getContext('2d');g.setTransform(1,0,0,-1,w/2+dx,h/2+dy);Paint.strokes(g,strokes,images,{canonicalCoverage:true});return c;}
 function pixel(c,x,y){return Array.from(c.getContext('2d').getImageData(Math.round(c.width/2+x),Math.round(c.height/2-y),1,1).data);}
 const c=render([curved]),inside=pixel(c,10,20),outside=pixel(c,180,-80),edge=pixel(c,-100,-62),verticalLip=pixel(c,41,20);
 assert(inside[0]>200&&inside[1]<100&&inside[3]===255,'curved road retains its repeated interior texture');
 assert(outside[3]===0,'curved road leaves terrain outside its coverage untouched');
 assert(edge[2]>150&&edge[0]<100,'Road up artwork creates the horizontal terrain edge');
 assert(Array.from({length:45},(_,i)=>pixel(c,30+i,20)).some(p=>p[2]>150&&p[0]<100),'terrain edge rotates around the road bend');
 const cross=render([stroke([[-150,0],[150,0]]),stroke([[0,-120],[0,120]])]);
 assert(pixel(cross,0,0)[0]>200&&pixel(cross,0,0)[2]<100,'joining road strokes merge without border lines across the intersection');
 const loop=render([stroke([[-90,-70],[90,-70],[90,70],[-90,70],[-90,-70]])]);
 assert(pixel(loop,0,0)[3]===0&&pixel(loop,90,0)[0]>200,'closed curved roads retain their transparent interior island');
 const cut=Object.assign({},base,{mode:undefined,assetId:null,op:'erase',size:28,points:[{x:0,y:0}]}),erased=render([stroke([[-150,0],[150,0]]),cut]);
 assert(pixel(erased,0,0)[3]===0,'road eraser removes coverage and creates a real opening');
 assert(Array.from({length:9},(_,i)=>pixel(erased,13+i,0)).some(p=>p[2]>150&&p[0]<100),'road outline follows a newly erased opening');
 const soft=render([stroke([[-150,0],[150,0]]),Object.assign({},cut,{opacity:.5,size:32})]);
 assert(pixel(soft,0,0)[3]>=120&&pixel(soft,0,0)[3]<=135,'partial-opacity eraser retains a partially transparent road');
 const semi=Object.assign({},base,{opacity:.5,points:[{x:-100,y:0},{x:100,y:0}]}),overlap=render([semi,Object.assign({},semi,{points:[{x:0,y:-80},{x:0,y:80}]})]);
 assert(pixel(overlap,0,0)[3]>=126&&pixel(overlap,0,0)[3]<=129,'road overlap applies material opacity once rather than accumulating dark seams');
 const old={assetId:'road',size:42,hardness:.3,opacity:.7,textureScale:1,shape:'round',op:'paint',points:[{x:-50,y:-30},{x:60,y:70}]},a=render([old]),b=Paint.canvas(400,320),bg=b.getContext('2d');bg.setTransform(1,0,0,-1,200,160);Paint.brush(bg,old,images);
 assert(a.toDataURL()===b.toDataURL(),'legacy ordinary ground brush pixels remain identical');
 const full=render([curved],400,320),pieces=Paint.canvas(400,320),pg=pieces.getContext('2d');
 for(let x=0;x<400;x+=200){const chunk=Paint.canvas(200,320),g=chunk.getContext('2d');g.setTransform(1,0,0,-1,200-x,160);Paint.strokes(g,[curved],images,{canonicalCoverage:true});pg.drawImage(chunk,x,0);}
 const fp=full.getContext('2d').getImageData(0,0,400,320).data,pp=pg.getImageData(0,0,400,320).data;let mismatched=0,max=0;
 for(let i=0;i<fp.length;i++){const difference=Math.abs(fp[i]-pp[i]);if(difference>3)mismatched++;max=Math.max(max,difference);}
 assert(mismatched===0,'adjacent baked tiles have identical road pixels through their shared boundary');
 const before=Roads.stats();render([curved]);const after=Roads.stats();assert(before.builds===after.builds&&after.bytes<=24*1024*1024,'unchanged roads reuse a bounded contour cache');
 const narrow=render([Object.assign({},curved,{size:12,edgeScale:8})]);assert(pixel(narrow,-100,-90)[0]>200,'large edge scale is capped so narrow roads keep a visible interior');

 const baseCanvas=Paint.canvas(400,320),baseContext=baseCanvas.getContext('2d');baseContext.fillStyle='#32aa55';baseContext.fillRect(0,0,400,320);baseContext.setTransform(1,0,0,-1,200,160);Paint.strokes(baseContext,[semi,Object.assign({},cut,{opacity:.5,size:32})],images);
 const mixed=pixel(baseCanvas,0,0);assert(mixed[3]>=126&&mixed[3]<=129,'soft eraser affects a road and existing same-layer artwork in chronological order');
 assert(pixel(soft,0,0)[0]>200&&pixel(soft,0,0)[2]<100,'partially erased road retains its interior material without a false hole border');
 const wide=stroke([[-150,0],[150,0]]),thin=Object.assign({},wide,{size:8,points:[{x:-150,y:100},{x:150,y:100}]}),onlyWide=render([wide]),withThin=render([wide,thin]);
 assert([25,27,29,30,31].every(y=>JSON.stringify(pixel(onlyWide,0,y))===JSON.stringify(pixel(withThin,0,y))),'adding a narrow road does not resize another road border');
 const veryLong=render([Object.assign({},wide,{size:5,points:[{x:-8000,y:0},{x:8000,y:0}]})]);const longCenter=pixel(veryLong,0,0);
 assert(longCenter[0]>200&&longCenter[2]<100&&longCenter[3]===255,'raster limits preserve hard coverage and visible fill on very long thin roads');
 const liveBefore=Roads.stats().builds,live=render([Object.assign({},curved,{preview:true})]),liveAfter=Roads.stats().builds;
 assert(pixel(live,10,20)[0]>200&&liveBefore===liveAfter,'live road preview follows the native path without tracing or allocating a contour cache');
 const matched=Paint.canvas(400,320),mg=matched.getContext('2d');mg.fillStyle='#325ac5';mg.fillRect(0,0,400,320);mg.setTransform(1,0,0,-1,200,160);Paint.strokes(mg,[wide],images);
 assert([30,31].every(y=>{const p=pixel(matched,0,y);return Math.abs(p[0]-50)<=2&&Math.abs(p[1]-90)<=2&&Math.abs(p[2]-197)<=2;}),'matching terrain has no ghost outline at the original outer coverage edge');

 const fs=require('fs'),path=require('path'),project=path.resolve(__dirname,'../../..'),manifest=JSON.parse(fs.readFileSync(path.join(project,'authoring/worlds/library/manifest.json'),'utf8')),sources={};
 for(const name of ['Road Fire','Road up Fire','Field Fire']){const source=manifest.assets.find(a=>a.name===name);sources[name]={url:require('url').pathToFileURL(path.join(project,source.file)).href};}
 const actual=await Paint.loadImages({images:sources}),art=Paint.canvas(600,800),ag=art.getContext('2d');ag.fillStyle=ag.createPattern(actual['Field Fire'].image,'repeat');ag.fillRect(0,0,600,800);ag.setTransform(1,0,0,-1,300,400);
 const real=Object.assign({},base,{assetId:'Road Fire',edgeAssetId:'Road up Fire',size:100,points:[{x:-200,y:-260},{x:20,y:-50},{x:-120,y:200},{x:150,y:290}]}),branch=Object.assign({},real,{points:[{x:-200,y:-260},{x:200,y:-260}]}),opening=Object.assign({},cut,{shape:'square',size:48,points:[{x:20,y:-50}]});
 Paint.strokes(ag,[real,branch,opening],actual);const expected=ag.getImageData(0,0,1,1).data,angle=Math.atan2(90,270);let outerDifference=0;
 for(let i=0;i<101;i++){const a=angle-Math.PI/2+i/100*Math.PI,p=pixel(art,150+Math.cos(a)*48,290+Math.sin(a)*48);for(let k=0;k<3;k++)outerDifference=Math.max(outerDifference,Math.abs(p[k]-expected[k]));}
 assert(outerDifference<=3,'actual Fire artwork fills connected border quads without cap spikes or transparent wedges');
 return {checks,pixelComparison:{mismatched,max},actualFireCapMaxDifference:outerDifference,cache:Roads.stats()};


}
module.exports={verify};
