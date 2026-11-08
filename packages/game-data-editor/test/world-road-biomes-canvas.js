'use strict';
// Actual bundled terrain artwork, exercised in an isolated muted native Canvas.
// No editor service, player state, game scene, or project save is used.
const fs=require('fs'),path=require('path'),url=require('url'),Paint=require('../worlds/paint'),Roads=require('../worlds/roads'),Terrain=require('../worlds/terrain'),M=require('../worlds/model');
async function verify(){
 const checks=[],reports=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},root=path.resolve(__dirname,'../../..'),library=JSON.parse(fs.readFileSync(path.join(root,'authoring/worlds/library/manifest.json'),'utf8')).assets.map(a=>Object.assign({},a,{url:url.pathToFileURL(path.join(root,a.file)).href})),wanted=new Map(),pairs=[];
 for(const biome of M.BIOMES){const road=library.find(a=>a.category==='roads'&&/^Road (?!up )/i.test(a.name)&&a.biomes.includes(biome)),pair=Terrain.roadPair(road,library,biome),defaults=Terrain.roadDefaults(road,library,biome);assert(!!pair&&pair.surface.id===road.id&&pair.edge.biomes.includes(biome)&&pair.field.biomes.includes(biome),biome+': road, edge and field pair belong to the selected biome');assert(defaults&&defaults.edgeStyle==='textured'&&Number.isFinite(defaults.edgeScale)&&defaults.edgeScale>0&&defaults.width>0,biome+': authored defaults use a calibrated texture-preserving border');pairs.push({biome,pair,defaults});for(const a of [pair.surface,pair.edge,pair.field])wanted.set(a.id,a);}
 const images=await Paint.loadImages({images:Object.fromEntries(wanted)}),mean=a=>a.reduce((n,v)=>n+v,0)/a.length;
 function raw(record){const img=record.image,c=Paint.canvas(img.naturalWidth,img.naturalHeight),g=c.getContext('2d');g.drawImage(img,0,0);const value=g.getImageData(0,0,c.width,c.height);c.width=1;c.height=1;return value;}
 function crop(data){let left=data.width,right=-1,top=data.height,bottom=-1;for(let y=0;y<data.height;y++)for(let x=0;x<data.width;x++)if(data.data[(y*data.width+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}return {left,top,width:right-left+1,height:bottom-top+1};}
 for(const {biome,pair,defaults} of pairs){
  const prefix=biome+': ',asset=images[pair.edge.id],before=raw(asset),bounds=crop(before),fillRaw=raw(images[pair.surface.id]),fill=Array.from(fillRaw.data.slice(0,4)),width=defaults.width,half=width/2,depth=Math.min(bounds.height*defaults.edgeScale,width*.45),made=[];
  const base={mode:'road',assetId:pair.surface.id,edgeAssetId:pair.edge.id,edgeStyle:defaults.edgeStyle,edgeSmoothing:defaults.edgeSmoothing,edgeWidthMode:'fixed',edgeScale:defaults.edgeScale,textureScale:1,size:width,hardness:1,opacity:1,shape:'round',op:'paint'};if(defaults.edgeExterior)base.edgeExterior=defaults.edgeExterior;
  const stroke=(points,extra)=>Object.assign({},base,{points:points.map(p=>({x:p[0],y:p[1]}))},extra),straight=stroke([[-350,0],[350,0]]);
  function render(strokes,w=1100,h=720,dx=0,matrix){const c=Paint.canvas(w,h),g=c.getContext('2d');g.setTransform(1,0,0,-1,w/2+dx,h/2);if(matrix)g.transform.apply(g,matrix);Paint.strokes(g,strokes,images,{canonicalCoverage:true});made.push(c);return c;}
  const pixel=(c,x,y)=>Array.from(c.getContext('2d').getImageData(Math.round(c.width/2+x),Math.round(c.height/2-y),1,1).data),diff=p=>fill.slice(0,3).reduce((n,v,k)=>n+Math.abs(v-p[k]),0);
  try{
   const line=render([straight]),data=line.getContext('2d').getImageData(0,0,line.width,line.height).data;
   assert(diff(pixel(line,0,0))<=2&&pixel(line,0,0)[3]===255,prefix+'opaque road interior retains its own source material');
   // Pick the source colour row with most visible horizontal variation. This
   // also tests Lava's opaque multicolour rock/glow band, whose alpha is flat.
   let chosen={variance:-1};
   for(let y=0;y<bounds.height;y++)for(let channel=0;channel<3;channel++){const values=[];for(let x=0;x<bounds.width;x++){const at=((y+bounds.top)*before.width+x+bounds.left)*4,a=before.data[at+3]/255;values.push(before.data[at+channel]*a+fill[channel]*(1-a));}const average=mean(values),variance=values.reduce((n,v)=>n+(v-average)*(v-average),0)/values.length;if(variance>chosen.variance)chosen={variance,y,channel,values};}
   assert(chosen.variance>1,prefix+'source contains identifiable unaveraged Road up artwork');
   const nominal=(1400+Math.PI*width)/Math.max(1,Math.round((1400+Math.PI*width)/(bounds.width*defaults.edgeScale))),count=121,step=4,sourceRow=chosen.values;
   let best=-1;
   // Whole native image is read once. Compare fitted cyclic source repeats,
   // allowing a pixel of sampling phase and native bilinear interpolation.
   for(let shift=-1.5;shift<=1.51;shift+=.5){
    const row=Math.round(line.height/2-half+chosen.y/(bounds.height-1)*depth+shift),actual=[];for(let i=0;i<count;i++){const at=(row*line.width+Math.round(line.width/2-240+i*step))*4,a=data[at+3]/255;actual.push(data[at+chosen.channel]*a+fill[chosen.channel]*(1-a));}
    const ma=mean(actual),aa=actual.reduce((n,v)=>n+(v-ma)*(v-ma),0);if(aa<1)continue;
    for(let period=nominal-3;period<=nominal+3.01;period+=.5)for(let phase=0;phase<bounds.width;phase++)for(const direction of [-1,1]){
     let sb=0,sbb=0,sab=0;for(let i=0;i<count;i++){const u=((phase+direction*i*step/period*bounds.width)%bounds.width+bounds.width)%bounds.width,j=Math.floor(u),t=u-j,b=sourceRow[j]*(1-t)+sourceRow[(j+1)%bounds.width]*t;sb+=b;sbb+=b*b;sab+=(actual[i]-ma)*b;}
     const bb=sbb-sb*sb/count,value=bb>1e-6?sab/Math.sqrt(aa*bb):-1;if(value>best)best=value;
    }
   }
   assert(best>.90,prefix+'rendered edge colour follows the original source texture instead of a flattened border');
   const curved=render([stroke([[-280,-170],[-100,-170],[-30,-60],[0,60],[110,170],[280,170]])]);
   assert(diff(pixel(curved,0,60))<=2&&pixel(curved,0,60)[3]===255,prefix+'curved road remains continuous through its bends');
   const fork=[stroke([[-270,0],[270,0]]),stroke([[0,-220],[0,220]])],joined=render(fork,900,700);
   assert(diff(pixel(joined,0,0))<=2&&pixel(joined,0,0)[3]===255,prefix+'joined branches have no internal edge at the crossing');
   const loop=render([stroke([[-220,-210],[220,-210],[220,210],[-220,210],[-220,-210]])],900,800);
   assert(pixel(loop,0,0)[3]===0,prefix+'a road loop preserves its open island');
   const separated=render([stroke([[-270,-half-20],[270,-half-20]]),stroke([[-270,half+20],[270,half+20]])],900,900);
   assert(pixel(separated,0,0)[3]===0,prefix+'separate roads retain their gap');
   const erase={op:'erase',shape:'round',size:54,hardness:1,opacity:1,points:[{x:0,y:0}]},cut=render([straight,erase]);
   assert(pixel(cut,0,0)[3]===0,prefix+'hard erasing keeps the authored hole open');
   const partial=render([straight,Object.assign({},erase,{opacity:.5})]),pc=pixel(partial,0,0);
   assert(pc[3]>=126&&pc[3]<=129&&fill.slice(0,3).every((v,i)=>Math.abs(v-pc[i])<=2),prefix+'partial erasing preserves road opacity and source fill');
   function extent(c,roadWidth){const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,values=[];for(let x=-240;x<=240;x+=4){let last=0;for(let y=2;y<=Math.ceil(depth)+4;y++){const at=(Math.round(c.height/2-roadWidth/2+y)*c.width+Math.round(c.width/2+x))*4;if(fill.slice(0,3).reduce((n,v,k)=>n+Math.abs(v-d[at+k]),0)>8)last=y;}values.push(last);}return [Math.min(...values),Math.max(...values)];}
   const wide=render([Object.assign({},straight,{size:width*1.6})],1100,900),originalExtent=extent(line,width),wideExtent=extent(wide,width*1.6);
   assert(originalExtent.every((n,i)=>Math.abs(n-wideExtent[i])<=2),prefix+'changing road width keeps the Road up border depth fixed');
   const matrix=[Math.cos(.29)*.85,Math.sin(.29)*.85,-Math.sin(.29)*.85,Math.cos(.29)*.85,7,-11],full=render(fork,900,700,0,matrix),pieces=Paint.canvas(900,700),pg=pieces.getContext('2d');made.push(pieces);
   for(let x=0;x<900;x+=450)pg.drawImage(render(fork,450,700,225-x,matrix),x,0);
   const a=full.getContext('2d').getImageData(0,0,900,700).data,b=pg.getImageData(0,0,900,700).data;let bad=0,maxPremultiplied=0;
   for(let i=0;i<a.length;i+=4){if(Math.abs(a[i+3]-b[i+3])>2)bad++;for(let k=0;k<3;k++){const d=Math.abs(a[i+k]*a[i+3]-b[i+k]*b[i+3])/255;maxPremultiplied=Math.max(maxPremultiplied,d);if(d>2)bad++;}}
   assert(!bad,prefix+'rotated textured roads match across adjacent baked ground tiles');
   const after=raw(asset);assert(before.data.every((v,i)=>v===after.data[i])&&asset.image.src===wanted.get(pair.edge.id).url,prefix+'original Road up image pixels and source stay unchanged');
   assert(Roads.stats().bytes<=24*1024*1024,prefix+'authoring raster cache stays within its budget');
   reports.push({biome,surface:pair.surface.name,edge:pair.edge.name,field:pair.field.name,sourceCorrelation:best,sourceRow:chosen.y,sourceChannel:chosen.channel,sourceVariance:chosen.variance,width,edgeScale:defaults.edgeScale,edgeExterior:defaults.edgeExterior||'terrain',sourceEdgeHeight:bounds.height,originalExtent,wideExtent,maxPremultipliedTileDifference:maxPremultiplied});
  }finally{for(const c of made){c.width=1;c.height=1;}Roads.clear();}
 }
 return {checks,reports,ownedDocumentWrites:0};
}
module.exports={verify};
