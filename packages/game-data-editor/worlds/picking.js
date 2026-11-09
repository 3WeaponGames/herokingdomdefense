'use strict';
// Source-alpha picking is authoring-only. Sample a point or a thin strip rather
// than retaining full RGBA copies of every map image.
const M=require('./model'),Paint=require('./paint');
const CHUNK=2048,EPS=1e-9;
function dimensions(image){
 if(!image||image.tagName==='IMG'&&(!image.complete||!image.naturalWidth))return null;
 const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
 return Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0?{width,height}:null;
}
function inverse(matrix,p){
 if(!Array.isArray(matrix)||matrix.length<6||matrix.some(n=>!Number.isFinite(n)))return null;
 const det=matrix[0]*matrix[3]-matrix[1]*matrix[2];if(Math.abs(det)<1e-12)return null;
 const x=p.x-matrix[4],y=p.y-matrix[5];
 return {x:(matrix[3]*x-matrix[2]*y)/det,y:(-matrix[1]*x+matrix[0]*y)/det};
}
function local(object,layer,p){
 const value=M.toLocal(object,M.toLocal(layer.transform,p));if(object.flipX)value.x=-value.x;return value;
}
function clip(a,b,rect){
 let first=0,last=1;const dx=b.x-a.x,dy=b.y-a.y;
 const bounds=[[-dx,a.x-rect.x],[dx,rect.x+rect.width-a.x],[-dy,a.y-rect.y],[dy,rect.y+rect.height-a.y]];
 for(const [p,q]of bounds){if(!p){if(q<0)return null;continue;}const t=q/p;if(p<0)first=Math.max(first,t);else last=Math.min(last,t);if(first>last)return null;}
 return [{x:a.x+dx*first,y:a.y+dy*first},{x:a.x+dx*last,y:a.y+dy*last}];
}
function create(){
 let pointCanvas=null,stripCanvas=null,alphaBytes=0,readbacks=0;const cache=new Map();
 function clear(){if(pointCanvas)pointCanvas.width=pointCanvas.height=1;if(stripCanvas)stripCanvas.width=stripCanvas.height=1;pointCanvas=stripCanvas=null;cache.clear();alphaBytes=0;}

 function alpha(image){
  const size=dimensions(image);if(!size||size.width*size.height>1024*1024)return null;
  const version=image.src||'',existing=cache.get(image);
  if(existing&&existing.version===version&&existing.width===size.width&&existing.height===size.height){cache.delete(image);cache.set(image,existing);return existing;}
  if(existing){alphaBytes-=existing.data.length;cache.delete(image);}
  const c=Paint.canvas(size.width,size.height);
  let pixels;
  try{const g=c.getContext('2d');g.drawImage(image,0,0);pixels=g.getImageData(0,0,size.width,size.height).data;readbacks++;}
  catch(_){return null;}
  finally{c.width=c.height=1;}
  const data=new Uint8Array(size.width*size.height);for(let i=0;i<data.length;i++)data[i]=pixels[i*4+3];
  while(cache.size&&(alphaBytes+data.length>8*1024*1024||cache.size>=64)){const first=cache.keys().next().value;alphaBytes-=cache.get(first).data.length;cache.delete(first);}
  const value={version,width:size.width,height:size.height,data};cache.set(image,value);alphaBytes+=data.length;return value;
 }
 function opaque(value,x,y){return x>=0&&x<value.width&&y>=0&&y<value.height&&value.data[y*value.width+x]>0;}
 function trace(value,a,b){
  let x=Math.floor(a.x),y=Math.floor(a.y);const endX=Math.floor(b.x),endY=Math.floor(b.y),dx=b.x-a.x,dy=b.y-a.y,stepX=Math.sign(dx),stepY=Math.sign(dy),deltaX=stepX?1/Math.abs(dx):Infinity,deltaY=stepY?1/Math.abs(dy):Infinity;
  let nextX=stepX?((stepX>0?x+1:x)-a.x)/dx:Infinity,nextY=stepY?((stepY>0?y+1:y)-a.y)/dy:Infinity;
  const limit=Math.abs(endX-x)+Math.abs(endY-y)+3;
  for(let n=0;n<limit;n++){
   if(opaque(value,x,y))return true;if(x===endX&&y===endY)return false;
   if(nextX<nextY){x+=stepX;nextX+=deltaX;}
   else if(nextY<nextX){y+=stepY;nextY+=deltaY;}
   else{if(opaque(value,x+stepX,y)||opaque(value,x,y+stepY))return true;x+=stepX;y+=stepY;nextX+=deltaX;nextY+=deltaY;}
  }
  return false;
 }

 function sample(image,rect,a,b){
  const clipped=clip(a,b,rect);if(!clipped)return false;[a,b]=clipped.map(p=>({x:Math.max(rect.x,Math.min(rect.x+rect.width-EPS,p.x)),y:Math.max(rect.y,Math.min(rect.y+rect.height-EPS,p.y))}));
  const cached=alpha(image);if(cached)return trace(cached,a,b);
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  try{
   if(length<EPS){
    if(!pointCanvas)pointCanvas=Paint.canvas(1,1);
    const g=pointCanvas.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,1,1);
    g.drawImage(image,Math.floor(a.x),Math.floor(a.y),1,1,0,0,1,1);
    readbacks++;return g.getImageData(0,0,1,1).data[3]>0;
   }
   if(!stripCanvas)stripCanvas=Paint.canvas(1,CHUNK+1);
   const g=stripCanvas.getContext('2d'),ux=dx/length,uy=dy/length,steps=Math.max(1,Math.ceil(length*2));
   // Two samples per source pixel cover thin features on a fast pointer sweep.
   // Chunking bounds scratch/readback memory even for very large source images.
   for(let first=0;first<=steps;first+=CHUNK){
    const count=Math.min(CHUNK,steps-first)+1,start=length*first/steps,x=a.x+ux*start,y=a.y+uy*start,scale=steps/length;
    g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,1,CHUNK+1);
    g.setTransform(-uy,ux*scale,ux,uy*scale,.5+uy*x-ux*y,.5-(ux*x+uy*y)*scale);
    g.drawImage(image,rect.x,rect.y,rect.width,rect.height,rect.x,rect.y,rect.width,rect.height);
    readbacks++;const pixels=g.getImageData(0,0,1,count).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i])return true;
   }
  }catch(_){/* Missing, tainted or retired artwork remains accessible in Layers. */}
  return false;
 }
 function hit(object,layer,point,assets,images){return segment(object,layer,point,point,assets,images);}
 function segment(object,layer,from,to,assets,images){
  if(!object||!layer||layer.hidden||layer.locked||object.opacity===0)return false;
  let a,b;try{a=local(object,layer,from);b=local(object,layer,to);}catch(_){return false;}
  if(object.legacy){
   const origin=object.legacy.origin||{x:0,y:0},worldA={x:a.x+origin.x,y:a.y+origin.y},worldB={x:b.x+origin.x,y:b.y+origin.y};
   for(const sprite of object.legacy.sprites||[]){
    if(sprite.active===false||sprite.color&&sprite.color.a===0)continue;
    const source=images[sprite.frame],size=dimensions(source&&source.image);if(!size||!sprite.width||!sprite.height)continue;
    const p=inverse(sprite.matrix,worldA),q=inverse(sprite.matrix,worldB);if(!p||!q)continue;
    const anchor=sprite.anchor||{x:.5,y:0},rect={x:source.x||0,y:source.y||0,width:source.width||size.width,height:source.height||size.height};
    const convert=v=>({x:rect.x+(v.x/sprite.width+anchor.x)*rect.width,y:rect.y+(1-anchor.y-v.y/sprite.height)*rect.height});
    if(sample(source.image,rect,convert(p),convert(q)))return true;
   }
   return false;
  }
  const asset=assets[object.assetId],original=images[object.assetId];if(!asset||!dimensions(original&&original.image))return false;
  const width=original.width||asset.width,height=original.height||asset.height,anchor=original.anchor||asset.anchor||{x:.5,y:0};
  if(!(width>0)||!(height>0)||!clip(a,b,{x:-anchor.x*width,y:-anchor.y*height,width,height}))return false;
  const source=Paint.objectImage(object,images),size=dimensions(source&&source.image);if(!size)return false;
  const convert=p=>({x:(p.x/width+anchor.x)*size.width,y:(1-anchor.y-p.y/height)*size.height});
  return sample(source.image,{x:0,y:0,width:size.width,height:size.height},convert(a),convert(b));
 }
 return {hit,segment,clear,stats:()=>({alphaBytes,alphaEntries:cache.size,readbacks})};
}
module.exports={create};

