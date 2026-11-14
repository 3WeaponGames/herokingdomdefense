"use strict";
// Trace pixel boundaries, simplify their geometry, and rasterize them with the
// same coverage rules as manual polygon shadows. No canvas or engine is needed.
var Polygon=require("./BuildingShadow"),MAX_EDGES=32768,MAX_RINGS=256;
function area(ring){var n=0;for(var i=0,j=ring.length-1;i<ring.length;j=i++)n+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];return n/2;}
function contains(ring,x,y){var inside=false;for(var i=0,j=ring.length-1;i<ring.length;j=i++){var a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function trace(alpha,w,h){
 var stride=w+1,edges=new Map(),count=0,outers=[],holes=[],vertices=0;
 function solid(x,y){return x>=0&&x<w&&y>=0&&y<h&&alpha[y*w+x]>=16;}
 function add(x,y,d){if(++count>MAX_EDGES)throw Error("Shadow outline detail limit");var id=y*stride+x;edges.set(id,(edges.get(id)||0)|(1<<d));}
 for(var y=0;y<h;y++)for(var x=0;x<w;x++)if(solid(x,y)){if(!solid(x,y-1))add(x,y,0);if(!solid(x+1,y))add(x+1,y,1);if(!solid(x,y+1))add(x+1,y+1,2);if(!solid(x-1,y))add(x,y+1,3);}
 var deltas=[1,stride,-1,-stride],consumed=0;
 while(edges.size){
  if(outers.length+holes.length>=MAX_RINGS)throw Error("Shadow outline region limit");
  var start=edges.keys().next().value,first=0;while(!(edges.get(start)&(1<<first)))first++;
  var at=start,previous=first,steps=0,ring=[[start%stride,Math.floor(start/stride)]];
  for(;;){
   var direction=first;
   if(steps){var mask=edges.get(at)||0;if(at===start)mask|=1<<first;direction=-1;for(var turn=0;turn<4;turn++){var candidate=(previous+[1,0,3,2][turn])%4;if(mask&(1<<candidate)){direction=candidate;break;}}if(direction<0)throw Error("Open shadow contour");if(at===start&&direction===first)break;if(direction!==previous)ring.push([at%stride,Math.floor(at/stride)]);}
   var remaining=(edges.get(at)||0)&~(1<<direction);if(remaining)edges.set(at,remaining);else edges.delete(at);at+=deltas[direction];previous=direction;if(++consumed>count||++steps>count)throw Error("Repeated shadow edge");
  }
  while(ring.length>3){var a=ring[ring.length-1],b=ring[0],c=ring[1];if(a[0]===b[0]&&b[0]===c[0]||a[1]===b[1]&&b[1]===c[1])ring.shift();else break;}
  ring.push(ring[0].slice());vertices+=ring.length;if(vertices>8192)throw Error("Shadow outline vertex limit");
  var signed=area(ring);if(signed>0)outers.push({ring:ring,area:signed,holes:[]});else if(signed<0)holes.push(ring);
 }
 holes.forEach(function(hole){var a=hole[0],b=hole[1],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),x=(a[0]+b[0])/2+dy/length*.25,y=(a[1]+b[1])/2-dx/length*.25,owner=null;outers.forEach(function(outer){if((!owner||outer.area<owner.area)&&contains(outer.ring,x,y))owner=outer;});if(!owner)throw Error("Unmatched shadow opening");owner.holes.push(hole);});
 return outers.map(function(outer){return[outer.ring].concat(outer.holes);});
}
function simplifyLine(points,tolerance,budget){
 var keep=new Uint8Array(points.length),stack=[[0,points.length-1]],limit=tolerance*tolerance;keep[0]=keep[points.length-1]=1;
 while(stack.length){var span=stack.pop(),a=span[0],b=span[1],p=points[a],q=points[b],dx=q[0]-p[0],dy=q[1]-p[1],length=dx*dx+dy*dy,index=-1,best=limit;
  for(var i=a+1;i<b;i++){if(--budget.left<0)throw Error("Shadow simplification work limit");var v=points[i],t=length?Math.max(0,Math.min(1,((v[0]-p[0])*dx+(v[1]-p[1])*dy)/length)):0,d=Math.pow(v[0]-p[0]-dx*t,2)+Math.pow(v[1]-p[1]-dy*t,2);if(d>best){index=i;best=d;}}
  if(index>=0){keep[index]=1;stack.push([a,index],[index,b]);}
 }
 return points.filter(function(_p,i){return keep[i];});
}
function simple(ring){
 if(ring.length>256)return false;
 function cross(a,b,c){return(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
 for(var i=0;i<ring.length-1;i++)for(var j=i+2;j<ring.length-1;j++){if(i===0&&j===ring.length-2)continue;var a=ring[i],b=ring[i+1],c=ring[j],d=ring[j+1];if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return false;}
 return true;
}
function simplifyRing(ring,tolerance,budget){
 if(ring.length<=4)return ring;var far=1,best=0;
 for(var i=1;i<ring.length-1;i++){var d=Math.pow(ring[i][0]-ring[0][0],2)+Math.pow(ring[i][1]-ring[0][1],2);if(d>best){far=i;best=d;}}
 for(var attempt=0;attempt<4;attempt++){
  var a=simplifyLine(ring.slice(0,far+1),tolerance,budget),b=simplifyLine(ring.slice(far),tolerance,budget),next=a.slice(0,-1).concat(b),ratio=area(next)/area(ring);
  if(next.length>=4&&ratio>.4&&ratio<1.6&&simple(next))return next;tolerance/=2;
 }
 return ring;
}
function raster(source,amount){
 if(!(amount>0))return null;
 try{
  var w=source.pixelWidth,h=source.pixelHeight,regions=trace(source.alpha,w,h);if(!regions.length)return null;
  var minX=w,minY=h,maxX=0,maxY=0;regions.forEach(function(region){region[0].forEach(function(p){minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);});});
  var tolerance=amount*amount*Math.max(2,(source.detailScale||Math.min(maxX-minX,maxY-minY))*.12),budget={left:500000};
  var shapes=regions.map(function(region){var outer=simplifyRing(region[0],tolerance,budget),holes=region.slice(1).map(function(ring){return simplifyRing(ring,tolerance,budget);});if(holes.some(function(ring){return ring.some(function(p){return !contains(outer,p[0],p[1]);});})){outer=region[0];holes=region.slice(1);}return[outer].concat(holes).map(function(ring){return ring.map(function(p){return[p[0],h-p[1]];});});});
  var image=Polygon.raster(shapes,1,2048),coverage=new Uint8Array(w*h);if(!image)return null;
  var top=image.y+image.height;
  for(var y=0;y<h;y++){var row=y+top-h;if(row<0||row>=image.pixelHeight)continue;for(var x=Math.max(0,image.x);x<Math.min(w,image.x+image.pixelWidth);x++)coverage[y*w+x]=image.pixels[(row*image.pixelWidth+x-image.x)*4+3];}
  return{alpha:coverage,radius:Math.ceil(tolerance)+1};
 }catch(error){
  // Extremely fragmented masks retain their original shape within a bounded
  // tracing budget; ordinary silhouettes are simplified during stage loading.
  return null;
 }
}
exports.raster=raster;
