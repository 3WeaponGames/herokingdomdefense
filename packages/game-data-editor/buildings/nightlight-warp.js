'use strict';
const Warp=require('../../../assets/_script/WindowLightWarp'),Mask=require('../../../assets/_script/WindowLightMask'),Paint=require('../worlds/paint');
const images=new WeakMap();
// Keep the geometry's UV lookup while painting; only alpha and sampled pixels
// change. This avoids rebuilding hundreds of triangles for every brush dab.
function geometry(cache,warp,nodes,type){
 const key=JSON.stringify([warp||null,nodes||[],type||'full']);if(cache.geometry.has(key))return cache.geometry.get(key);
 const mesh=Warp.forType(type).mesh(warp,nodes),b=mesh.bounds,unit=Math.max(.5,(b.maxX-b.minX)/510,(b.maxY-b.minY)/510),x=b.minX-unit,y=b.minY-unit,w=Math.ceil((b.maxX-b.minX)/unit)+2,h=Math.ceil((b.maxY-b.minY)/unit)+2,uv=new Float32Array(w*h*2),points=mesh.points.map(p=>({x:(p.x-x)/unit,y:(y+h*unit-p.y)/unit}));uv.fill(NaN);
 for(let i=0;i<mesh.triangles.length;i+=3){
  const ids=mesh.triangles.slice(i,i+3),[a,b,c]=ids.map(i=>points[i]),[ta,tb,tc]=ids.map(i=>mesh.uvs[i]),det=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(det)<1e-10)continue;
  const left=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))),right=Math.min(w-1,Math.ceil(Math.max(a.x,b.x,c.x))),top=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))),bottom=Math.min(h-1,Math.ceil(Math.max(a.y,b.y,c.y)));
  for(let yy=top;yy<=bottom;yy++)for(let xx=left;xx<=right;xx++){const px=xx+.5,py=yy+.5,aa=((b.y-c.y)*(px-c.x)+(c.x-b.x)*(py-c.y))/det,bb=((c.y-a.y)*(px-c.x)+(a.x-c.x)*(py-c.y))/det,cc=1-aa-bb;if(aa<-.000001||bb<-.000001||cc<-.000001)continue;const at=(yy*w+xx)*2;uv[at]=aa*ta.u+bb*tb.u+cc*tc.u;uv[at+1]=aa*ta.v+bb*tb.v+cc*tc.v;}
 }
 const result={key,x,y,w,h,width:w*unit,height:h*unit,uv};cache.geometry.set(key,result);while(cache.geometry.size>8)cache.geometry.delete(cache.geometry.keys().next().value);return result;
}
function image(source,warp,nodes,erase,type){
 let cache=images.get(source);if(!cache){const width=source.naturalWidth||source.width,height=source.naturalHeight||source.height,c=Paint.canvas(width,height),g=c.getContext('2d');g.drawImage(source,0,0);cache={width,height,pixels:g.getImageData(0,0,width,height).data,frames:new Map(),geometry:new Map(),masks:new WeakMap()};c.width=c.height=1;images.set(source,cache);}
 let maskState;if(erase){maskState=cache.masks.get(erase);if(!maskState){maskState={rasterizer:Mask.createRasterizer(cache.width,cache.height)};cache.masks.set(erase,maskState);}}
 const shape=geometry(cache,warp,nodes,type),stroke=erase?.strokes.at(-1),flow=!!stroke?.flow,previous=maskState?.live;
 if(flow&&previous?.mask===erase&&previous.shape===shape&&previous.stroke===stroke&&previous.count===stroke.points.length&&previous.point===stroke.points.at(-1))return previous.result;
 const key=flow?null:shape.key+JSON.stringify(erase||null);if(key&&cache.frames.has(key))return cache.frames.get(key);
 const pixels=erase?Mask.pixels(cache.pixels,erase,cache.width,cache.height,maskState.rasterizer):cache.pixels,c=flow&&previous?.shape===shape?previous.result.canvas:Paint.canvas(shape.w,shape.h),g=c.getContext('2d'),out=g.createImageData(shape.w,shape.h);
 for(let i=0;i<shape.w*shape.h;i++){
  const u=shape.uv[i*2],v=shape.uv[i*2+1];if(!Number.isFinite(u+v))continue;const sx=Math.max(0,Math.min(cache.width-1,u*cache.width-.5)),sy=Math.max(0,Math.min(cache.height-1,v*cache.height-.5)),x0=Math.floor(sx),y0=Math.floor(sy),dx=sx-x0,dy=sy-y0;let a=0,r=0,green=0,blue=0;
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){const weight=(xx?dx:1-dx)*(yy?dy:1-dy),index=(Math.min(cache.height-1,y0+yy)*cache.width+Math.min(cache.width-1,x0+xx))*4,alpha=pixels[index+3]*weight;a+=alpha;r+=pixels[index]*alpha;green+=pixels[index+1]*alpha;blue+=pixels[index+2]*alpha;}
  if(a>0){const at=i*4;out.data[at]=r/a;out.data[at+1]=green/a;out.data[at+2]=blue/a;out.data[at+3]=a;}
 }
 g.putImageData(out,0,0);const result={canvas:c,x:shape.x,y:shape.y,width:shape.width,height:shape.height};
 if(flow){if(previous&&previous.result.canvas!==c)previous.result.canvas.width=previous.result.canvas.height=1;maskState.live={mask:erase,shape,stroke,count:stroke.points.length,point:stroke.points.at(-1),result};}
 else{cache.frames.set(key,result);while(cache.frames.size>8){const first=cache.frames.keys().next().value,old=cache.frames.get(first);old.canvas.width=old.canvas.height=1;cache.frames.delete(first);}}return result;
}
function draw(ctx,sprite,assets){const source=assets[sprite.frame];if(!source||!source.image)return;const frame=image(source.image,sprite.warp,sprite.warpNodes,sprite.erase,sprite.lightType);ctx.save();Paint.apply(ctx,sprite.matrix);ctx.globalAlpha=(sprite.color?.a??255)/255;ctx.translate(frame.x,frame.y+frame.height);ctx.scale(frame.width/frame.canvas.width,-frame.height/frame.canvas.height);ctx.drawImage(frame.canvas,0,0);ctx.restore();}
module.exports={image,draw};
