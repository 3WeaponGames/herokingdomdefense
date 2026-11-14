'use strict';
const Warp=require('../../../assets/_script/WindowLightWarp'),Mask=require('../../../assets/_script/WindowLightMask'),Paint=require('../worlds/paint');
const images=new WeakMap();
// Sample the same UV mesh as the runtime into one small canvas. Adjacent
// triangles share pixels, avoiding Canvas clip seams across the yellow source.
function image(source,warp,nodes,erase){
 let cache=images.get(source);if(!cache){const width=source.naturalWidth||source.width,height=source.naturalHeight||source.height,c=Paint.canvas(width,height),g=c.getContext('2d');g.drawImage(source,0,0);cache={width,height,pixels:g.getImageData(0,0,width,height).data,frames:new Map()};images.set(source,cache);}
 const key=JSON.stringify([warp||null,nodes||[],erase||null]);if(cache.frames.has(key))return cache.frames.get(key);
 const pixels=erase?Mask.pixels(cache.pixels,erase,cache.width,cache.height):cache.pixels;
 const mesh=Warp.mesh(warp,nodes),b=mesh.bounds,unit=Math.max(.5,(b.maxX-b.minX)/510,(b.maxY-b.minY)/510),x=b.minX-unit,y=b.minY-unit,w=Math.ceil((b.maxX-b.minX)/unit)+2,h=Math.ceil((b.maxY-b.minY)/unit)+2,c=Paint.canvas(w,h),g=c.getContext('2d'),out=g.createImageData(w,h),points=mesh.points.map(p=>({x:(p.x-x)/unit,y:(y+h*unit-p.y)/unit}));
 function sample(u,v,at){
  const sx=Math.max(0,Math.min(cache.width-1,u*cache.width-.5)),sy=Math.max(0,Math.min(cache.height-1,v*cache.height-.5)),x0=Math.floor(sx),y0=Math.floor(sy),dx=sx-x0,dy=sy-y0;let a=0,r=0,gg=0,blue=0;
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){const weight=(xx?dx:1-dx)*(yy?dy:1-dy),index=(Math.min(cache.height-1,y0+yy)*cache.width+Math.min(cache.width-1,x0+xx))*4,alpha=pixels[index+3]*weight;a+=alpha;r+=pixels[index]*alpha;gg+=pixels[index+1]*alpha;blue+=pixels[index+2]*alpha;}
  if(a>0){out.data[at]=r/a;out.data[at+1]=gg/a;out.data[at+2]=blue/a;out.data[at+3]=a;}
 }
 for(let i=0;i<mesh.triangles.length;i+=3){
  const ids=mesh.triangles.slice(i,i+3),[a,b,c]=ids.map(i=>points[i]),[ta,tb,tc]=ids.map(i=>mesh.uvs[i]),det=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(det)<1e-10)continue;
  const left=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))),right=Math.min(w-1,Math.ceil(Math.max(a.x,b.x,c.x))),top=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))),bottom=Math.min(h-1,Math.ceil(Math.max(a.y,b.y,c.y)));
  for(let yy=top;yy<=bottom;yy++)for(let xx=left;xx<=right;xx++){const px=xx+.5,py=yy+.5,aa=((b.y-c.y)*(px-c.x)+(c.x-b.x)*(py-c.y))/det,bb=((c.y-a.y)*(px-c.x)+(a.x-c.x)*(py-c.y))/det,cc=1-aa-bb;if(aa<-.000001||bb<-.000001||cc<-.000001)continue;sample(aa*ta.u+bb*tb.u+cc*tc.u,aa*ta.v+bb*tb.v+cc*tc.v,(yy*w+xx)*4);}
 }
 g.putImageData(out,0,0);const result={canvas:c,x,y,width:w*unit,height:h*unit};cache.frames.set(key,result);while(cache.frames.size>8){const first=cache.frames.keys().next().value,old=cache.frames.get(first);old.canvas.width=old.canvas.height=1;cache.frames.delete(first);}return result;
}
function draw(ctx,sprite,assets){const source=assets[sprite.frame];if(!source||!source.image)return;const frame=image(source.image,sprite.warp,sprite.warpNodes,sprite.erase);ctx.save();Paint.apply(ctx,sprite.matrix);ctx.globalAlpha=(sprite.color?.a??255)/255;ctx.translate(frame.x,frame.y+frame.height);ctx.scale(frame.width/frame.canvas.width,-frame.height/frame.canvas.height);ctx.drawImage(frame.canvas,0,0);ctx.restore();}
module.exports={image,draw};
