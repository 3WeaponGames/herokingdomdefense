"use strict";
// Brush strokes live in the original sprite's UV space. Moving or distorting
// a light carries its edits with it; the shared source image is never changed.
var SIZE=70,MAX_STROKES=128,MAX_POINTS=4096,projections=new WeakMap(),apertureMasks=new WeakMap();
function hasMask(mask) {
 return !!mask && (Array.isArray(mask.strokes)&&mask.strokes.length>0 || Array.isArray(mask.apertures)&&mask.apertures.length>0);
}
function validApertures(rings) {
 if(rings===undefined)return true;
 if(!Array.isArray(rings)||!rings.length||rings.length>24)return false;
 var count=0;
 return rings.every(function(ring){
  return Array.isArray(ring)&&ring.length>=3&&(count+=ring.length)<=512&&ring.every(function(p){
   return Array.isArray(p)&&p.length===2&&p.every(function(v){return typeof v==="number"&&isFinite(v)&&Math.abs(v)<=SIZE/2;});
  });
 });
}
function projectionValid(p){return !!p&&Array.isArray(p.matrix)&&p.matrix.length===4&&p.matrix.every(function(v){return typeof v==="number"&&isFinite(v)&&Math.abs(v)<=10000;})&&Math.abs(p.matrix[0]*p.matrix[3]-p.matrix[1]*p.matrix[2])>1e-10&&require("./BuildingLightTypes").valid(p.type)&&require("./WindowLightWarp").forType(p.type).valid(p.warp,p.warpNodes);}
function valid(mask){
 if(mask===undefined)return true;
 if(!mask||mask.version!==1||!Array.isArray(mask.strokes)||mask.strokes.length>MAX_STROKES||!validApertures(mask.apertures))return false;
 var count=0;return mask.strokes.every(function(s){return s&&(s.op==="erase"||s.op==="restore")&&[s.radius,s.opacity,s.softness].every(function(n){return typeof n==="number"&&isFinite(n);})&&s.radius>=.25&&s.radius<=50&&s.opacity>=0&&s.opacity<=1&&s.softness>=0&&s.softness<=1&&(s.flow===undefined||s.flow===false||s.flow===true&&projectionValid(s.projection))&&(!s.projection||s.flow===true)&&Array.isArray(s.points)&&s.points.length>0&&(count+=s.points.length)<=MAX_POINTS&&s.points.every(function(p){var limit=s.flow?1e7:280;return p&&typeof p.x==="number"&&typeof p.y==="number"&&isFinite(p.x+p.y)&&Math.abs(p.x)<=limit&&Math.abs(p.y)<=limit&&(p.strength===undefined||typeof p.strength==="number"&&isFinite(p.strength)&&p.strength>=0&&p.strength<=1);});});
}
// Freeze the light's pose when painting. Distance is measured after that pose,
// giving a circular brush even on a stretched or distorted light. The resulting
// alpha remains attached to the original UVs when the light is edited later.
function coordinates(projection,width,height){
 var cache=projections.get(projection);if(!cache){cache=new Map();projections.set(projection,cache);}var key=width+"x"+height,saved=cache.get(key);if(saved)return saved;
 var map=require("./WindowLightWarp").forType(projection.type).mapper(projection.warp,projection.warpNodes),m=projection.matrix;saved=new Float64Array(width*height*2);
 for(var y=0;y<height;y++)for(var x=0;x<width;x++){var p=map({x:(x+.5-width/2)/width*SIZE,y:(height/2-y-.5)/height*SIZE}),i=(y*width+x)*2;saved[i]=m[0]*p.x+m[2]*p.y;saved[i+1]=m[1]*p.x+m[3]*p.y;}
 cache.set(key,saved);return saved;
}
function dabs(values,s,start,width,height){
 var positions=coordinates(s.projection,width,height),inner=s.radius*(1-s.softness),rr=s.radius*s.radius;
 for(var k=start;k<s.points.length;k++){var p=s.points[k],opacity=s.opacity*(p.strength===undefined?1:p.strength);if(!opacity)continue;
  for(var i=0;i<values.length;i++){var dx=positions[i*2]-p.x,dy=positions[i*2+1]-p.y,squared=dx*dx+dy*dy;if(squared>=rr)continue;var distance=Math.sqrt(squared),t=distance<=inner?1:(s.radius-distance)/(s.radius-inner),amount=t*t*(3-2*t)*opacity;values[i]=s.op==="restore"?values[i]+(1-values[i])*amount:values[i]*(1-amount);}
 }
}
function distance(p,a,b){var x=b.x-a.x,y=b.y-a.y,length=x*x+y*y,t=length?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/length)):0;return Math.hypot(p.x-a.x-x*t,p.y-a.y-y*t);}
function rasterStrokes(mask,width,height){
 width=width||SIZE;height=height||SIZE;var values=new Float32Array(width*height);values.fill(1);
 if(!mask||!mask.strokes.length)return values;
 mask.strokes.forEach(function(s){
  if(s.flow){dabs(values,s,0,width,height);return;}
  var coverage=new Float32Array(width*height),points=s.points,inner=s.radius*(1-s.softness);
  for(var i=0;i<Math.max(1,points.length-1);i++){
   var a=points[i],b=points[Math.min(points.length-1,i+1)],left=Math.max(0,Math.floor((Math.min(a.x,b.x)-s.radius)/SIZE*width+width/2)),right=Math.min(width-1,Math.ceil((Math.max(a.x,b.x)+s.radius)/SIZE*width+width/2)),top=Math.max(0,Math.floor(height/2-(Math.max(a.y,b.y)+s.radius)/SIZE*height)),bottom=Math.min(height-1,Math.ceil(height/2-(Math.min(a.y,b.y)-s.radius)/SIZE*height));
   for(var y=top;y<=bottom;y++)for(var x=left;x<=right;x++){var d=distance({x:(x+.5-width/2)/width*SIZE,y:(height/2-y-.5)/height*SIZE},a,b);if(d>=s.radius)continue;var t=d<=inner?1:(s.radius-d)/(s.radius-inner),amount=t*t*(3-2*t),index=y*width+x;if(amount>coverage[index])coverage[index]=amount;}
  }
  for(var j=0;j<values.length;j++){var a=coverage[j]*s.opacity;values[j]=s.op==="restore"?values[j]+(1-values[j])*a:values[j]*(1-a);}
 });return values;
}
// Apertures are rings in the same original sprite coordinates as brush edits.
// Even-odd fill keeps mullions and other obstructions dark. Restore can recover
// brushed pixels within the opening without reintroducing light on its frame.
function apertureCoverage(rings,width,height){
 var cache=apertureMasks.get(rings);
 if(!cache){cache=new Map();apertureMasks.set(rings,cache);}
 var key=width+"x"+height,covered=cache.get(key);
 if(covered)return covered;
 covered=new Uint8Array(width*height);
 for(var y=0;y<height;y++){
  var py=(height/2-y-.5)*SIZE/height,crossings=[];
  rings.forEach(function(ring){
   for(var i=0,j=ring.length-1;i<ring.length;j=i++){
    var a=ring[j],b=ring[i];
    if((a[1]>py)!==(b[1]>py))crossings.push(a[0]+(b[0]-a[0])*(py-a[1])/(b[1]-a[1]));
   }
  });
  crossings.sort(function(a,b){return a-b;});
  for(var i=0;i+1<crossings.length;i+=2){
   var start=Math.max(0,Math.ceil((crossings[i]/SIZE+.5)*width-.5));
   var end=Math.min(width,Math.ceil((crossings[i+1]/SIZE+.5)*width-.5));
   if(start<end)covered.fill(1,y*width+start,y*width+end);
  }
 }
 cache.set(key,covered);return covered;
}
function clip(values,mask,width,height){
 if(!mask||!mask.apertures||!mask.apertures.length)return values;
 var coverage=apertureCoverage(mask.apertures,width,height),result=new Float32Array(values.length);
 for(var i=0;i<result.length;i++)if(coverage[i])result[i]=values[i];
 return result;
}
function raster(mask,width,height){
 width=width||SIZE;height=height||SIZE;
 return clip(rasterStrokes(mask,width,height),mask,width,height);
}
// The live editor appends dabs to one stroke. Reusing its alpha avoids replaying
// every earlier brush sample on each pointer event; undo/replacement rebuilds.
function createRasterizer(width,height){
 width=width||SIZE;height=height||SIZE;
 var previous,last,count=0,point,total=0,values,rebuilds=0,appends=0;
 return{update:function(mask){var strokes=mask&&mask.strokes||[],stroke=strokes[strokes.length-1];
  if(values&&mask===previous&&strokes.length===total&&stroke===last&&stroke&&stroke.flow&&stroke.points.length>=count&&stroke.points[count-1]===point){dabs(values,stroke,count,width,height);appends+=stroke.points.length-count;}
  else{values=rasterStrokes(mask,width,height);rebuilds++;}
  previous=mask;last=stroke;count=stroke?stroke.points.length:0;point=stroke&&stroke.points[count-1];total=strokes.length;return clip(values,mask,width,height);
 },stats:function(){return{rebuilds:rebuilds,appends:appends};}};
}
function pixels(source,mask,width,height,live){var result=new Uint8Array(source),alpha=live?live.update(mask):raster(mask,width,height);for(var i=0;i<alpha.length;i++)result[i*4+3]=Math.round(source[i*4+3]*alpha[i]);return result;}
exports.valid=valid;exports.hasMask=hasMask;exports.raster=raster;exports.pixels=pixels;exports.maxStrokes=MAX_STROKES;exports.maxPoints=MAX_POINTS;
exports.createRasterizer=createRasterizer;
