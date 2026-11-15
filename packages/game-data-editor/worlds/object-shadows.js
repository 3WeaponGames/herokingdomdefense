(function(root,factory){if(typeof module==='object')module.exports=factory(require('./paint'),require('../../../assets/_script/BuildingDropShadow'),require('../../../assets/_script/MapObjectShadowPolicy'));else root.WorldObjectShadows=factory(root.WorldPaint,root.WorldDropShadow,root.MapObjectShadowPolicy);}(this,function(Paint,FX,Policy){
'use strict';
function point(m,p){return{x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]};}
function multiply(a,b){return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function bounds(layer,o,images){
 var m=multiply(Paint.matrix(layer.transform),Paint.matrix(o)),points=[],parts=[],origin=point(m,{x:0,y:0});if(o.flipX){m[0]*=-1;m[1]*=-1;}
 function add(matrix,width,height,anchor,frame,opacity){anchor=anchor||{x:.5,y:0};parts.push({matrix:matrix,width:width,height:height,anchor:anchor,frame:frame,opacity:opacity});for(var x of [-anchor.x*width,(1-anchor.x)*width])for(var y of [-anchor.y*height,(1-anchor.y)*height])points.push(point(matrix,{x:x,y:y}));}
 if(o.legacy){var offset=o.legacy.origin||{x:0,y:0};for(var s of o.legacy.sprites||[]){if(s.active===false)continue;var source=images[s.frame];if(!ready(source))return null;add(multiply(m,multiply([1,0,0,1,-offset.x,-offset.y],s.matrix)),s.width,s.height,s.anchor,s.frame,s.color&&s.color.a);}}
 else{var source=Paint.objectImage(o,images);if(!ready(source))return null;add(m,source.width,source.height,source.anchor,o.assetId,o.opacity);}
 if(!points.length)return null;var scale=Math.hypot(parts[0].matrix[0],parts[0].matrix[1]);if(!(scale>0))return null;
 // Translation and uniform size share a texture; rotation, flips and masks do not.
 var shape=parts.map(function(p){var matrix=p.matrix.slice();matrix[4]-=origin.x;matrix[5]-=origin.y;return[p.frame,matrix.map(v=>Math.round(v/scale*1000)/1000),p.width,p.height,p.anchor,p.opacity];});
 return{minX:Math.min.apply(null,points.map(p=>p.x)),maxX:Math.max.apply(null,points.map(p=>p.x)),minY:Math.min.apply(null,points.map(p=>p.y)),maxY:Math.max.apply(null,points.map(p=>p.y)),origin:origin,scale:scale,shape:shape};
}
function ready(source){return !!(source&&source.image&&source.image.complete!==false&&(source.image.naturalWidth||source.image.width));}
function create(options){
 var budget=options&&options.bytes||16*1024*1024,cache=new Map(),imageIds=new WeakMap(),serial=0,bytes=0,builds=0;
 function clear(){for(var e of cache.values())e.canvas.width=e.canvas.height=1;cache.clear();bytes=0;imageIds=new WeakMap();}
 function resourceKey(o,images){var ids=o.legacy?(o.legacy.sprites||[]).filter(s=>s.active!==false).map(s=>s.frame):[o.assetId];return ids.map(id=>{var s=images[id],image=s&&s.image;if(image&&!imageIds.has(image))imageIds.set(image,++serial);return[id,image&&imageIds.get(image),s&&s.width,s&&s.height,s&&s.x,s&&s.y,s&&s.anchor];});}
 function obtain(layer,o,images,settings,b){
  var key=JSON.stringify([b.shape,o.mask,resourceKey(o,images),settings]),e=cache.get(key);if(e){cache.delete(key);cache.set(key,e);return e;}
  var width=b.maxX-b.minX,height=b.maxY-b.minY,nw=width/b.scale,nh=height/b.scale;if(!(nw>0&&nh>0))return null;var factor=Math.min(1,256/nw,256/nh),w=Math.max(1,Math.ceil(nw*factor)),h=Math.max(1,Math.ceil(nh*factor)),c=Paint.canvas(w,h),g=c.getContext('2d');g.setTransform(w/width,0,0,-h/height,-b.minX*w/width,b.maxY*h/height);Paint.object(g,o,layer,images);var rgba=g.getImageData(0,0,w,h).data,alpha=new Uint8Array(w*h);for(var i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];c.width=c.height=1;
  var image=FX.raster({alpha:alpha,pixelWidth:w,pixelHeight:h,x:(b.minX-b.origin.x)/b.scale,y:(b.minY-b.origin.y)/b.scale,width:nw,height:nh},settings),canvas=Paint.canvas(image.pixelWidth,image.pixelHeight),ctx=canvas.getContext('2d'),pixels=ctx.createImageData(canvas.width,canvas.height);pixels.data.set(image.pixels);ctx.putImageData(pixels,0,0);e={canvas:canvas,image:image,bytes:image.pixels.length};delete image.pixels;cache.set(key,e);bytes+=e.bytes;builds++;
  while(bytes>budget&&cache.size>1){var first=cache.keys().next().value,old=cache.get(first);cache.delete(first);bytes-=old.bytes;old.canvas.width=old.canvas.height=1;}return e;
 }
 function draw(ctx,map,images,settings){
  settings=FX.settings(settings);var ground=[];
  for(var layer of map.layers||[]){if(layer.hidden)continue;for(var o of layer.objects||[]){if(!Policy.enabled(layer,o))continue;var b=bounds(layer,o,images);if(!b)continue;var e=obtain(layer,o,images,settings,b);if(e){var d=e.image,scale=b.scale;ctx.save();ctx.translate(b.origin.x+d.x*scale,b.origin.y+(d.y+d.height)*scale);ctx.scale(d.width*scale/e.canvas.width,-d.height*scale/e.canvas.height);ctx.drawImage(e.canvas,0,0);ctx.restore();}if(!o.legacy&&o.buildingOverlap!=='front'&&(layer.depth==='ground'||o.depth==='ground'))ground.push({layer:layer,o:o});}}
  // Opted-in flat artwork stays above its own shadow. Unassigned terrain keeps
  // its original ground bake, and no collision/depth settings are rewritten.
  for(var item of ground)Paint.object(ctx,item.o,item.layer,images);
 }
 return{draw:draw,clear:clear,destroy:clear,stats:()=>({bytes:bytes,builds:builds,entries:cache.size})};
}
return{create:create,bounds:bounds};
}));
