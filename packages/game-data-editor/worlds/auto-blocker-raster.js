(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./paint'),require('./alpha-contours'),require('./vendor/polygon-clipping'));else root.AutoBlockerRaster=factory(root.WorldPaint,root.AlphaContours,root.polygonClipping);}(this,function(Paint,Contours,Clip){
'use strict';
const MAX_SOURCE_PIXELS=16*1024*1024,MAX_TOTAL_PIXELS=128*1024*1024,MAX_VERTICES=200000,MAX_OBJECTS=10000;
const vertices=mask=>mask.reduce((n,region)=>n+region.reduce((m,ring)=>m+Math.max(0,ring.length-1),0),0),holes=mask=>mask.reduce((n,r)=>n+r.length-1,0);
function area(ring){let n=0;for(let i=1;i<ring.length;i++)n+=ring[i-1][0]*ring[i][1]-ring[i][0]*ring[i-1][1];return n/2;}
function simplifyLine(points,tolerance){
 if(points.length<=2)return points.slice();const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]],limit=tolerance*tolerance;
 while(stack.length){const pair=stack.pop(),a=points[pair[0]],b=points[pair[1]],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;let far=-1,best=limit;for(let i=pair[0]+1;i<pair[1];i++){const p=points[i],t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0,d=(p[0]-a[0]-dx*t)**2+(p[1]-a[1]-dy*t)**2;if(d>best){best=d;far=i;}}if(far>=0){keep.add(far);stack.push([pair[0],far],[far,pair[1]]);}}
 return Array.from(keep).sort((a,b)=>a-b).map(i=>points[i]);
}
function precisionTolerance(width,height,precision){if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Outline images need positive finite dimensions.');if(!Number.isInteger(precision)||precision<0||precision>100)throw Error('Outline precision must be an integer from 0 to 100.');return precision===100?0:Math.max(width,height)*.08*((100-precision)/100)**3;}
function simplifyRing(ring,tolerance){
 if(!tolerance||ring.length<=8)return ring;let far=1,best=-1;for(let i=1;i<ring.length-1;i++){const d=(ring[i][0]-ring[0][0])**2+(ring[i][1]-ring[0][1])**2;if(d>best){best=d;far=i;}}
 for(let attempt=0;attempt<12;attempt++){const a=simplifyLine(ring.slice(0,far+1),tolerance),b=simplifyLine(ring.slice(far),tolerance),next=a.slice(0,-1).concat(b);if(next.length>=4&&area(next)*area(ring)>0)return next;tolerance/=2;}
 return ring;
}
function simpleRegion(ring,tolerance){
 for(let attempt=0;attempt<12;attempt++){const candidate=simplifyRing(ring,tolerance);try{const result=Clip.union([[candidate]]);if(result.length===1&&result[0].length===1)return result;}catch(_){}tolerance/=2;}
 return [[ring]];
}
function simplify(mask,tolerance,stats){
 if(!tolerance||!mask.length)return mask;const holeCutoff=4*Math.min(tolerance,8)**2,islandCutoff=Math.min(tolerance,4)**2,pieces=[];let filteredHoles=0,filteredIslands=0;
 for(const region of mask){
  const solidArea=Math.max(0,Math.abs(area(region[0]))-region.slice(1).reduce((n,ring)=>n+Math.abs(area(ring)),0));
  if(solidArea<islandCutoff){filteredIslands++;continue;}
  const outer=simpleRegion(region[0],tolerance),retained=[],exactHoles=[];let removed=0;
  for(const ring of region.slice(1)){if(Math.abs(area(ring))<holeCutoff){removed++;continue;}retained.push(simpleRegion(ring,tolerance));exactHoles.push([[ring]]);}
  try{let result=outer;for(let i=0;i<retained.length;i+=16)result=Clip.difference(result,...retained.slice(i,i+16));pieces.push(result);filteredHoles+=removed;}
  catch(_){try{let result=outer;for(let i=0;i<exactHoles.length;i+=16)result=Clip.difference(result,...exactHoles.slice(i,i+16));pieces.push(result);filteredHoles+=removed;}catch(_){pieces.push([region]);}}
 }
 // Tiny features are intentionally omitted only below exact precision. Large
 // openings are subtracted independently, never a reason to restore a noisy
 // outer border to its exact pixel staircase.
 const result=combine(pieces);if(stats){stats.filteredHoles=filteredHoles;stats.filteredIslands=filteredIslands;}return result;
}
function point(matrix,p){return [matrix[0]*p[0]+matrix[2]*p[1]+matrix[4],matrix[1]*p[0]+matrix[3]*p[1]+matrix[5]];}
function placement(p,object,layer){if(object.flipX)p=[-p[0],p[1]];return point(Paint.matrix(layer.transform||{}),point(Paint.matrix(object),p));}
function transform(mask,convert){return mask.map(region=>region.map(ring=>ring.map(convert)));}
function combine(shapes){let mask=[];for(let i=0;i<shapes.length;i+=16){const batch=shapes.slice(i,i+16).filter(p=>p.length);if(batch.length)mask=Clip.union(mask,...batch);}return mask;}
function dimensions(width,height){width=Math.round(width);height=Math.round(height);if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>MAX_SOURCE_PIXELS)throw Error('An image is too large to trace safely. Use source images up to 16 megapixels.');return {width,height};}
function imageBudget(records,decoded){
 const sources=new Map();
 for(const id of Object.keys(records||{})){
  const source=records[id],frame=dimensions(source.width,source.height),image=source.image;
  // Legacy records describe an atlas frame. Count its actual source texture
  // once, rather than charging the full atlas for each frame using that URL.
  const width=decoded?image&&image.naturalWidth:source.textureWidth>0?source.textureWidth:(source.x||0)+frame.width,height=decoded?image&&image.naturalHeight:source.textureHeight>0?source.textureHeight:(source.y||0)+frame.height;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(width*height))throw Error('Source images need valid pixel dimensions.');
  const key=source.url||id,previous=sources.get(key)||{width:0,height:0};
  sources.set(key,{width:Math.max(previous.width,width),height:Math.max(previous.height,height)});
 }
 let total=0;for(const source of sources.values()){total+=source.width*source.height;if(total>MAX_TOTAL_PIXELS)throw Error('This selection contains too much image data. Generate blockers for fewer layers at a time.');}
}
function raster(source,opacity,frame){
 const size=dimensions(source.width,source.height),c=Paint.canvas(size.width,size.height),g=c.getContext('2d');g.globalAlpha=opacity;
 if(frame)g.drawImage(source.image,source.x||0,source.y||0,size.width,size.height,0,0,size.width,size.height);else g.drawImage(source.image,0,0,size.width,size.height);
 try{return {pixels:g.getImageData(0,0,size.width,size.height),width:size.width,height:size.height};}finally{c.width=c.height=1;}
}
async function render(spec){
 if(!spec||!Array.isArray(spec.layers)||!['paint','erase'].includes(spec.op))throw Error('Invalid automatic blocker request.');
 const precision=spec.precision===undefined?(spec.detail===undefined?0:{precise:100,balanced:80,light:60}[spec.detail]):spec.precision;precisionTolerance(1,1,precision);
 imageBudget(spec.images,false);
 const began=typeof performance==='object'?performance.now():Date.now(),images=await Paint.loadImages({images:spec.images}),cache=new Map(),shapes=[],stats={op:spec.op,precision,layers:spec.layers.length,objects:0,images:0,verticesBefore:0,verticesAfter:0,filteredHoles:0,filteredIslands:0,sourcePixels:0};
 for(const id of Object.keys(images))if(!images[id].anchor)images[id].anchor={x:.5,y:0};
 let totalVertices=0,totalObjects=0,lastYield=began;
 async function contour(key,source,opacity,frame){
  if(cache.has(key))return cache.get(key);const size=dimensions(source.width,source.height);stats.sourcePixels+=size.width*size.height;if(stats.sourcePixels>MAX_TOTAL_PIXELS)throw Error('This selection contains too much image data. Generate blockers for fewer layers at a time.');
  const data=raster(source,opacity,frame),exact=Contours.trace({data:data.pixels.data,width:data.width,height:data.height,threshold:1,maxPixels:MAX_SOURCE_PIXELS,maxEdges:1000000,maxContours:50000}),filtered={},mask=simplify(exact,precisionTolerance(size.width,size.height,precision),filtered);stats.images++;const value={mask,before:vertices(exact),after:vertices(mask),filteredHoles:filtered.filteredHoles||0,filteredIslands:filtered.filteredIslands||0};cache.set(key,value);return value;
 }
 try{
  imageBudget(images,true);
  for(const layer of spec.layers){for(const object of layer.objects||[]){
   if(++totalObjects>MAX_OBJECTS)throw Error('Select fewer than 10,000 scenery placements per automatic blocker operation.');let visible=false;
   if(object.legacy){
    for(const sprite of object.legacy.sprites||[]){if(sprite.active===false)continue;const opacity=(sprite.color&&sprite.color.a!==undefined?sprite.color.a:255)/255;if(!(opacity>0))continue;const source=images[sprite.frame];if(!source)throw Error('Missing source artwork for '+(object.name||object.id)+'.');
     const traced=await contour('frame:'+sprite.frame+':'+opacity,source,opacity,true),mask=traced.mask,anchor=sprite.anchor||{x:.5,y:0},origin=object.legacy.origin||{x:0,y:0};
     stats.verticesBefore+=traced.before;stats.verticesAfter+=traced.after;stats.filteredHoles+=traced.filteredHoles;stats.filteredIslands+=traced.filteredIslands;if(mask.length){shapes.push(transform(mask,p=>{const local=[(p[0]/source.width-anchor.x)*sprite.width,(1-p[1]/source.height-anchor.y)*sprite.height],q=point(sprite.matrix,local);return placement([q[0]-origin.x,q[1]-origin.y],object,layer);}));visible=true;totalVertices+=vertices(mask);}
    }
   }else if(object.opacity===undefined||object.opacity>0){
    const source=Paint.objectImage(object,images);if(!source)throw Error('Missing source artwork for '+(object.name||object.id)+'.');const opacity=object.opacity===undefined?1:object.opacity,traced=await contour('image:'+object.assetId+':'+opacity+':'+JSON.stringify(object.mask||[]),source,opacity,false),mask=traced.mask,anchor=source.anchor||{x:.5,y:0};
    stats.verticesBefore+=traced.before;stats.verticesAfter+=traced.after;stats.filteredHoles+=traced.filteredHoles;stats.filteredIslands+=traced.filteredIslands;if(mask.length){shapes.push(transform(mask,p=>placement([p[0]-anchor.x*source.width,(1-anchor.y)*source.height-p[1]],object,layer)));visible=true;totalVertices+=vertices(mask);}
   }
   if(visible)stats.objects++;if(totalVertices>MAX_VERTICES)throw Error('These outlines contain more than 200,000 vertices. Lower outline precision, or generate fewer layers at a time.');
   // Cached placements can be cheap. Yield by elapsed work, rather than pay a
   // full platform timer tick for every object, while retaining cancellation.
   const now=typeof performance==='object'?performance.now():Date.now();
   if(now-lastYield>=8){await new Promise(resolve=>setTimeout(resolve,0));lastYield=typeof performance==='object'?performance.now():Date.now();}
  }}
  const generated=combine(shapes),base=spec.mask||[],mask=generated.length?(spec.op==='erase'?Clip.difference(base,generated):Clip.union(base,generated)):base;
  if(vertices(mask)>MAX_VERTICES)throw Error('The resulting map collision is too complex. Lower outline precision or generate fewer layers.');
  stats.regions=generated.length;stats.holes=holes(generated);stats.resultVertices=vertices(mask);stats.generationMs=(typeof performance==='object'?performance.now():Date.now())-began;
  return {mask,stats};
 }finally{Paint.clearMasks();cache.clear();}
}
return {render,precisionTolerance,simplify,simplifyRing,vertices,limits:{sourcePixels:MAX_SOURCE_PIXELS,totalPixels:MAX_TOTAL_PIXELS,vertices:MAX_VERTICES,objects:MAX_OBJECTS}};
}));
