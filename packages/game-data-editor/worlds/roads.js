(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./alpha-contours'));else root.WorldRoads=factory(root.AlphaContours);}(this,function(Contours){
'use strict';
// Authoring-only terrain ribbons. Trace the complete layer-space coverage once,
// then bake the same bounded raster across all output tiles and preview views.
var cache=new Map(),bytes=0,builds=0,sourceIds=new WeakMap(),sourceSerial=0,borders=new WeakMap(),MAX_BYTES=24*1024*1024,MAX_EDGE=2048;
function canvas(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function ready(record){var i=record&&record.image;return i&&(!i.tagName||i.tagName!=='IMG'||i.complete&&i.naturalWidth);}
function identity(image){if(!image)return null;if(!sourceIds.has(image))sourceIds.set(image,++sourceSerial);return [sourceIds.get(image),image.src||''];}
function assets(stroke){return [stroke.assetId,stroke.mode==='road'&&stroke.edgeAssetId].filter(Boolean);}
function material(stroke){return JSON.stringify([stroke.assetId,stroke.edgeAssetId,stroke.nativeSize===true,stroke.textureScale||1,stroke.edgeScale||1,stroke.opacity===undefined?1:stroke.opacity,smoothing(stroke),stroke.edgeWidthMode||'legacy',stroke.edgeStyle==='textured'?'textured':smoothing(stroke)?'clean':'legacy',stroke.edgeExterior||'legacy']);}
function dist2(p,a,b){var dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;return Math.pow(p[0]-a[0]-t*dx,2)+Math.pow(p[1]-a[1]-t*dy,2);}
function simplifyOpen(points,tolerance){if(points.length<3)return points;var keep=new Uint8Array(points.length),stack=[[0,points.length-1]];keep[0]=keep[points.length-1]=1;while(stack.length){var range=stack.pop(),from=range[0],to=range[1],best=tolerance*tolerance,at=-1;for(var i=from+1;i<to;i++){var d=dist2(points[i],points[from],points[to]);if(d>best){best=d;at=i;}}if(at>=0){keep[at]=1;stack.push([from,at],[at,to]);}}return points.filter(function(_,i){return keep[i];});}
function simplifyRing(ring,tolerance){if(ring.length<6)return ring;var p=ring.slice(0,-1),far=1,best=0;for(var i=1;i<p.length;i++){var d=Math.hypot(p[i][0]-p[0][0],p[i][1]-p[0][1]);if(d>best){best=d;far=i;}}var a=simplifyOpen(p.slice(0,far+1),tolerance),b=simplifyOpen(p.slice(far).concat([p[0]]),tolerance),out=a.slice(0,-1).concat(b);return out.length>=4?out:ring;}
function borderPixels(img){
 var found=borders.get(img);if(found)return found;var w=img.naturalWidth||img.width,h=img.naturalHeight||img.height,c=canvas(w,h),g=c.getContext('2d');g.drawImage(img,0,0);var rgba=g.getImageData(0,0,w,h).data,left=w,right=-1,top=h,bottom=-1;
 // Unity exports a transparent perimeter around these repeatable edge sprites.
 for(var y=0;y<h;y++)for(var x=0;x<w;x++)if(rgba[(y*w+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<left)return {data:new Uint8ClampedArray(4),width:1,height:1};
 if(left||top||right<w-1||bottom<h-1){var crop=g.getImageData(left,top,right-left+1,bottom-top+1);rgba=crop.data;w=crop.width;h=crop.height;}
 found={data:rgba,width:w,height:h};borders.set(img,found);return found;
}

function smoothing(stroke){return Math.max(0,Math.min(1,Number(stroke.edgeSmoothing)||0));}
function smoothBorder(texture,amount){
 if(!amount)return texture;
 var variants=texture.smoothed||(texture.smoothed=new Map()),key=Math.round(amount*1000),found=variants.get(key);if(found){variants.delete(key);variants.set(key,found);return found;}
 var w=texture.width,h=texture.height,src=texture.data,profile=new Float64Array(w),mean=0;
 for(var x=0;x<w;x++){var edge=0;for(var y=0;y<h;y++)if(src[(y*w+x)*4+3]>=128)edge=y;profile[x]=edge;mean+=edge;}mean/=w;
 var radius=Math.max(1,Math.round(w*(.02+.06*amount))),ease=1-Math.pow(1-amount,2),data=new Uint8ClampedArray(src.length);
 // Warp the original crisp lip onto a low-frequency cyclic edge. This reduces
 // scallops without a broad RGBA blur, and retains the source's colors and rim.
 for(var x=0;x<w;x++){var sum=0,weight=0;for(var k=-radius;k<=radius;k++){var v=.5+.5*Math.cos(k/radius*Math.PI);sum+=profile[(x+k+w)%w]*v;weight+=v;}
  var target=profile[x]*(1-ease)+(mean+(sum/weight-mean)*(1-ease))*ease,delta=target-profile[x];
  for(var y=0;y<h;y++){var sy=y-delta;if(sy>h-1)continue;sy=Math.max(0,sy);var y0=Math.floor(sy),y1=Math.min(h-1,y0+1),t=sy-y0,a=(y0*w+x)*4,b=(y1*w+x)*4,at=(y*w+x)*4,aa=src[a+3]*(1-t)+src[b+3]*t;data[at+3]=aa;
   if(aa)for(var c=0;c<3;c++)data[at+c]=(src[a+c]*src[a+3]*(1-t)+src[b+c]*src[b+3]*t)/aa;
  }
 }
 var average=new Float64Array(h*4);for(var y=0;y<h;y++){var aa=0;for(var x=0;x<w;x++){var at=(y*w+x)*4,a=data[at+3];aa+=a;for(var c=0;c<3;c++)average[y*4+c]+=data[at+c]*a;}average[y*4+3]=aa/w;if(aa)for(var c=0;c<3;c++)average[y*4+c]/=aa;}for(var y=0;y<h;y++)for(var x=0;x<w;x++){var at=(y*w+x)*4,oldAlpha=data[at+3],meanAlpha=average[y*4+3],alpha=oldAlpha*(1-ease)+meanAlpha*ease;for(var c=0;c<3;c++)data[at+c]=alpha?(data[at+c]*oldAlpha*(1-ease)+average[y*4+c]*meanAlpha*ease)/alpha:0;data[at+3]=alpha;}found={data:data,width:w,height:h};variants.set(key,found);while(variants.size>4)variants.delete(variants.keys().next().value);return found;
}
function roundOuter(ring,amount,depth,allRings,alpha,w,h,eraseLines){
 var p=ring.slice(0,-1),n=p.length;if(!amount||n<4)return {ring:ring,patches:[]};
 var lengths=[],distance=[0],total=0;for(var i=0;i<n;i++){var b=p[(i+1)%n],a=p[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);lengths.push(len);total+=len;distance.push(total);}
 if(!total)return {ring:ring,patches:[]};
 function wrap(v){return (v%total+total)%total;}
 function at(s){s=wrap(s);var i=0;while(i<n-1&&distance[i+1]<s)i++;var t=lengths[i]?(s-distance[i])/lengths[i]:0,a=p[i],b=p[(i+1)%n];return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}
 function arc(a,b){var d=Math.abs(wrap(a)-wrap(b));return Math.min(d,total-d);}
 var candidates=[];
 for(var i=0;i<n;i++){
  var a=p[(i+n-1)%n],b=p[i],c=p[(i+1)%n],l1=lengths[(i+n-1)%n],l2=lengths[i];if(!l1||!l2)continue;
  var ux=(b[0]-a[0])/l1,uy=(b[1]-a[1])/l1,vx=(c[0]-b[0])/l2,vy=(c[1]-b[1])/l2,cross=ux*vy-uy*vx,turn=Math.atan2(-cross,ux*vx+uy*vy);
  if(cross>=-.14||turn<=.14)continue;
  var cornerDepth=typeof depth==='function'?depth(b):depth,d=Math.min(cornerDepth*amount*1.75,total*.035),requested=d;if(d<2)continue;
  // Do not round toward a second boundary, an island, or an authored erase.
  for(var other of allRings)for(var j=0;j<other.length-1;j++){if(other===ring&&arc(distance[i],(distance[j]+distance[j+1])/2)<requested*2.5)continue;d=Math.min(d,Math.sqrt(dist2(b,other[j],other[j+1]))*.35);}
  if(d<2||eraseLines.some(function(e){return dist2(b,e.a,e.b)<=Math.pow(e.radius+d*2,2);}))continue;
  var okay=false,curve,start,end,steps;
  for(var attempt=0;attempt<5&&d>=2;attempt++){
   start=at(distance[i]-d);end=at(distance[i]+d);steps=Math.max(4,Math.ceil(d/Math.max(1.5,cornerDepth*.12)));curve=[];
   okay=true;for(var k=0;k<=steps;k++){var t=k/steps,u=1-t,q=[u*u*start[0]+2*u*t*b[0]+t*t*end[0],u*u*start[1]+2*u*t*b[1]+t*t*end[1]];curve.push(q);
    if(k>1&&k<steps-1){var x=Math.floor(q[0]),y=Math.floor(q[1]);if(x>=0&&x<w&&y>=0&&y<h&&alpha[(y*w+x)*4+3]>127){okay=false;break;}}
   }
   if(okay)break;d*=.6;
  }
  if(okay&&d>=2)candidates.push({s:distance[i],d:d,curve:curve,turn:turn,corner:b});
 }
 candidates.sort(function(a,b){return b.turn-a.turn;});var chosen=[];for(var c of candidates)if(!chosen.some(function(q){return arc(c.s,q.s)<c.d+q.d+1;}))chosen.push(c);
 if(!chosen.length)return {ring:ring,patches:[]};
 // Start outside every replacement interval so a wrap-around fillet stays one
 // continuous contour. Non-overlapping intervals preserve ring topology.
 var startS=wrap(chosen[0].s+chosen[0].d+.5),events=chosen.map(function(c){var center=c.s;while(center-c.d<startS)center+=total;return {c:c,start:center-c.d,end:center+c.d};}).sort(function(a,b){return a.start-b.start;}),out=[at(startS)],patches=[],cursor=startS;
 // Copy ranges explicitly rather than resampling the untouched artwork.
 function range(from,to){var list=[];for(var j=0;j<n;j++){var s=distance[j];while(s<=from+1e-7)s+=total;if(s<to-1e-7)list.push({s:s,p:p[j]});}list.sort(function(a,b){return a.s-b.s;});for(var v of list)out.push(v.p);}
 for(var e of events){if(e.end>startS+total+1e-7)continue;range(cursor,e.start);out.push(e.c.curve[0]);var patch=[e.c.curve[0]],original=[];
  for(var j=0;j<n;j++){var s=distance[j];while(s<=e.start+1e-7)s+=total;if(s<e.end-1e-7)original.push({s:s,p:p[j]});}original.sort(function(a,b){return a.s-b.s;});for(var v of original)patch.push(v.p);
  patch.push(e.c.curve[e.c.curve.length-1]);for(var j=e.c.curve.length-2;j>=0;j--)patch.push(e.c.curve[j]);patches.push(patch);
  for(var j=1;j<e.c.curve.length;j++)out.push(e.c.curve[j]);cursor=e.end;
 }
 range(cursor,startS+total);out.push(out[0]);return {ring:out,patches:patches};
}
function patchCoverage(ctx,result){
 if(!result.patches||!result.patches.length)return;ctx.fillStyle='#fff';ctx.beginPath();
 for(var patch of result.patches){for(var i=0;i<patch.length;i++)i?ctx.lineTo(patch[i][0],patch[i][1]):ctx.moveTo(patch[i][0],patch[i][1]);ctx.closePath();}ctx.fill();
}


function blend(out,at,texture,u,v){
 var w=texture.width,h=texture.height,x=(u%w+w)%w,y=Math.max(0,Math.min(h-1,v)),x0=Math.floor(x),x1=(x0+1)%w,y0=Math.floor(y),y1=Math.min(h-1,y0+1),fx=x-x0,fy=y-y0,data=texture.data;
 var aa=(y0*w+x0)*4,bb=(y0*w+x1)*4,cc=(y1*w+x0)*4,dd=(y1*w+x1)*4,wa=(1-fx)*(1-fy),wb=fx*(1-fy),wc=(1-fx)*fy,wd=fx*fy;
 var alpha=(data[aa+3]*wa+data[bb+3]*wb+data[cc+3]*wc+data[dd+3]*wd)/255;if(!alpha)return;
 // Work in premultiplied alpha, including transparent scallop pixels, so edge
 // filtering cannot introduce dark fringes.
 for(var k=0;k<3;k++){var premul=(data[aa+k]*data[aa+3]*wa+data[bb+k]*data[bb+3]*wb+data[cc+k]*data[cc+3]*wc+data[dd+k]*data[dd+3]*wd)/255;out[at+k]=premul+out[at+k]*(1-alpha);}
}
function ribbon(out,w,h,ring,texture,repeat,depthAt,maxDepth){
 var points=ring.slice(0,-1),n=points.length;if(n<3)return;var normals=[],distance=[0],total=0;
 // AlphaContours keeps the solid pixels to the right in raster coordinates.
 for(var i=0;i<n;i++){var a=points[(i+n-1)%n],b=points[i],c=points[(i+1)%n],l1=Math.hypot(b[0]-a[0],b[1]-a[1]),l2=Math.hypot(c[0]-b[0],c[1]-b[1]);if(!l1||!l2)return;var n1=[-(b[1]-a[1])/l1,(b[0]-a[0])/l1],n2=[-(c[1]-b[1])/l2,(c[0]-b[0])/l2],nx=n1[0]+n2[0],ny=n1[1]+n2[1],length=Math.hypot(nx,ny);if(length<.01){nx=n2[0];ny=n2[1];length=1;}nx/=length;ny/=length;var miter=Math.min(2,1/Math.max(.5,nx*n2[0]+ny*n2[1]));var depth=depthAt(b);normals.push([nx*depth*miter,ny*depth*miter,depth]);total+=l2;distance.push(total);}
 repeat=total/Math.max(1,Math.round(total/repeat));var cursor=0,segment=0,step=Math.max(2,Math.min(10,maxDepth/2)),margin=2;
 function sample(at){while(segment<n-1&&distance[segment+1]<at-1e-8)segment++;var j=(segment+1)%n,len=distance[segment+1]-distance[segment],t=len?(at-distance[segment])/len:0,a=points[segment],b=points[j],u=normals[segment],v=normals[j],x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,nx=u[0]+(v[0]-u[0])*t,ny=u[1]+(v[1]-u[1])*t,depth=u[2]+(v[2]-u[2])*t;return [[x-nx*margin/depth,y-ny*margin/depth],[x+nx,y+ny],depth];}
 while(cursor<total-1e-7){var end=Math.min(total,cursor+step,distance[segment+1]);if(end-cursor<1e-7){segment=Math.min(n-1,segment+1);continue;}var a=sample(cursor),b=sample(end);if((a[2]+b[2])/2<1){cursor=end;continue;}var quad=[a[0],b[0],b[1],a[1]],xs=quad.map(function(p){return p[0];}),ys=quad.map(function(p){return p[1];}),left=Math.max(0,Math.floor(Math.min.apply(null,xs))),right=Math.min(w-1,Math.ceil(Math.max.apply(null,xs))),top=Math.max(0,Math.floor(Math.min.apply(null,ys))),bottom=Math.min(h-1,Math.ceil(Math.max.apply(null,ys)));
 function bary(x,y,p,q,r){var ax=q[0]-p[0],ay=q[1]-p[1],bx=r[0]-p[0],by=r[1]-p[1],det=ax*by-ay*bx;if(Math.abs(det)<1e-8)return null;var dx=x-p[0],dy=y-p[1],u=(dx*by-dy*bx)/det,v=(ax*dy-ay*dx)/det;return u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7?[u,v]:null;}
 for(var y=top;y<=bottom;y++)for(var x=left;x<=right;x++){var uv=bary(x+.5,y+.5,quad[0],quad[1],quad[2]),u,v;if(uv){u=uv[0]+uv[1];v=uv[1];}else{uv=bary(x+.5,y+.5,quad[0],quad[2],quad[3]);if(!uv)continue;u=uv[0];v=uv[0]+uv[1];}blend(out,(y*w+x)*4,texture,(cursor+u*(end-cursor))/repeat*texture.width,v*texture.height);}

 cursor=end;
 }
}


// Cutout strips have an outer rock silhouette. Its transparent top reveals
// underlying terrain, while transparent pixels after the solid rim keep the
// road interior underneath. Other edge strips retain their original compositing.
function exteriorBlend(out,at,texture,u,v){
 var w=texture.width,h=texture.height,data=texture.data,x=(u%w+w)%w,y=Math.max(0,Math.min(h-1,v)),x0=Math.floor(x),x1=(x0+1)%w,y0=Math.floor(y),y1=Math.min(h-1,y0+1),fx=x-x0,fy=y-y0,first=texture.firstOpaque;
 if(!first){first=texture.firstOpaque=new Uint16Array(w);for(var cx=0;cx<w;cx++){first[cx]=h;for(var cy=0;cy<h;cy++)if(data[(cy*w+cx)*4+3]>=254){first[cx]=cy;break;}}}
 var outer=y<=Math.max(first[x0],first[x1])+1;
 if(!outer){blend(out,at,texture,u,v);return;}
 var aa=(y0*w+x0)*4,bb=(y0*w+x1)*4,cc=(y1*w+x0)*4,dd=(y1*w+x1)*4,wa=(1-fx)*(1-fy),wb=fx*(1-fy),wc=(1-fx)*fy,wd=fx*fy,A=data[aa+3]*wa+data[bb+3]*wb+data[cc+3]*wc+data[dd+3]*wd;
 for(var k=0;k<3;k++)out[at+k]=A?(data[aa+k]*data[aa+3]*wa+data[bb+k]*data[bb+3]*wb+data[cc+k]*data[cc+3]*wc+data[dd+k]*data[dd+3]*wd)/A:0;
 out[at+3]=A;
}

function smoothBand(out,w,h,paths,texture,edgeScale,depthAt,alpha,cutout){
 var segments=[],best=new Float32Array(w*h),labels=new Uint32Array(w*h);best.fill(Infinity);
 for(var region of paths)for(var ring of region){
  var total=0,distance=[0];for(var i=0;i<ring.length-1;i++){total+=Math.hypot(ring[i+1][0]-ring[i][0],ring[i+1][1]-ring[i][1]);distance.push(total);}
  var repeat=total/Math.max(1,Math.round(total/Math.max(1,texture.width*edgeScale)));
  for(var i=0;i<ring.length-1;i++){var a=ring[i],b=ring[i+1],dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;if(!length2)continue;var da=depthAt(a),db=depthAt(b),depth=Math.max(da,db);if(depth<.01)continue;
   var seg={a:a,b:b,dx:dx,dy:dy,length2:length2,length:Math.sqrt(length2),start:distance[i],repeat:repeat,da:da,db:db},id=segments.push(seg),margin=depth+2,minX=Math.max(0,Math.floor(Math.min(a[0],b[0])-margin)),maxX=Math.min(w-1,Math.ceil(Math.max(a[0],b[0])+margin)),minY=Math.max(0,Math.floor(Math.min(a[1],b[1])-margin)),maxY=Math.min(h-1,Math.ceil(Math.max(a[1],b[1])+margin));
   // One nearest-boundary distance supplies each pixel's edge color. It cannot
   // fold or form miter wedges at tight turns, fork cusps or rounded end caps.
   for(var y=minY;y<=maxY;y++)for(var x=minX;x<=maxX;x++){var px=x+.5-a[0],py=y+.5-a[1],t=Math.max(0,Math.min(1,(px*dx+py*dy)/length2)),ex=px-t*dx,ey=py-t*dy,d2=ex*ex+ey*ey,at=y*w+x;if(d2<best[at]&&d2<=margin*margin){best[at]=d2;labels[at]=id;}}
  }
 }
 for(var y=0;y<h;y++)for(var x=0;x<w;x++){var at=y*w+x,id=labels[at];if(!id)continue;var s=segments[id-1],t=Math.max(0,Math.min(1,((x+.5-s.a[0])*s.dx+(y+.5-s.a[1])*s.dy)/s.length2)),depth=s.da+(s.db-s.da)*t,d=Math.sqrt(best[at]);if(d>depth+1)continue;var v=alpha[at*4+3]?d/depth:0;if(v>1)continue;if(cutout)exteriorBlend(out,at*4,texture,(s.start+t*s.length)/s.repeat*texture.width,v*(texture.height-1));else blend(out,at*4,texture,(s.start+t*s.length)/s.repeat*texture.width,v*(texture.height-1));}
}


function raster(strokes,images,brush){
 var first=strokes[0],fill=images[first.assetId],border=images[first.edgeAssetId],key=JSON.stringify([strokes,identity(fill.image),identity(border&&border.image),fill.nativeScale,border&&border.nativeScale]),found=cache.get(key);if(found){cache.delete(key);cache.set(key,found);return found;}
 var left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity,minWidth=Infinity;
 for(var s of strokes){if(s.op==='erase')continue;var radius=s.size/2;minWidth=Math.min(minWidth,s.size);for(var p of s.points){left=Math.min(left,p.x-radius);right=Math.max(right,p.x+radius);bottom=Math.min(bottom,p.y-radius);top=Math.max(top,p.y+radius);}}
 if(!Number.isFinite(left))return null;left=Math.floor(left-3);right=Math.ceil(right+3);bottom=Math.floor(bottom-3);top=Math.ceil(top+3);
 var scale=Math.min(1,MAX_EDGE/Math.max(right-left,top-bottom)),w=Math.max(1,Math.ceil((right-left)*scale)),h=Math.max(1,Math.ceil((top-bottom)*scale)),alpha=new Uint8ClampedArray(w*h*4);
 for(var stroke of strokes){if(stroke.op==='erase'){var temp=canvas(w,h),tg=temp.getContext('2d');tg.putImageData(new ImageData(alpha,w,h),0,0);tg.setTransform(scale,0,0,-scale,-left*scale,top*scale);brush(tg,stroke,{});alpha=tg.getImageData(0,0,w,h).data;continue;}var ps=simplifyOpen(stroke.points.map(function(p){return [(p.x-left)*scale,(top-p.y)*scale];}),.3),radius=stroke.size*scale/2,r2=radius*radius;for(var j=0;j<Math.max(1,ps.length-1);j++){var a=ps[j],b=ps[Math.min(j+1,ps.length-1)],lx=Math.max(0,Math.floor(Math.min(a[0],b[0])-radius)),rx=Math.min(w-1,Math.ceil(Math.max(a[0],b[0])+radius)),ty=Math.max(0,Math.floor(Math.min(a[1],b[1])-radius)),by=Math.min(h-1,Math.ceil(Math.max(a[1],b[1])+radius));for(var y=ty;y<=by;y++)for(var x=lx;x<=rx;x++)if(dist2([x+.5,y+.5],a,b)<=r2)alpha[(y*w+x)*4+3]=255;}}
 var regions=Contours.trace({data:alpha,width:w,height:h,threshold:1}),result=canvas(w,h),r=result.getContext('2d'),tiling=(first.textureScale||1)*(first.nativeSize===true&&fill.nativeScale||1),texture=borderPixels(fill.image),pixels=new ImageData(w,h),flat=true,source=texture.data;
 for(var i=4;i<source.length;i+=4)if(source[i]!==source[0]||source[i+1]!==source[1]||source[i+2]!==source[2]||source[i+3]!==source[3]){flat=false;break;}
 for(var y=0;y<h;y++)for(var x=0;x<w;x++){var at=(y*w+x)*4;if(flat){pixels.data[at]=source[0];pixels.data[at+1]=source[1];pixels.data[at+2]=source[2];}else{var u=Math.floor(((left+(x+.5)/scale)/tiling%texture.width+texture.width)%texture.width),v=Math.floor(((-top+(y+.5)/scale)/tiling%texture.height+texture.height)%texture.height),sp=(v*texture.width+u)*4;pixels.data[at]=source[sp];pixels.data[at+1]=source[sp+1];pixels.data[at+2]=source[sp+2];}pixels.data[at+3]=255;}
  if(ready(border)){var amount=smoothing(first),textured=first.edgeStyle==='textured',tex=textured?borderPixels(border.image):smoothBorder(borderPixels(border.image),amount),edgeScale=(first.edgeScale||1)*(first.nativeSize===true&&border.nativeScale||1),maxDepth=tex.height*edgeScale*scale,repeat=Math.max(1,tex.width*edgeScale*scale),center=[];for(var s of strokes)if(s.op!=='erase'){var ps=s.points;for(var j=0;j<Math.max(1,ps.length-1);j++){var a=ps[j],b=ps[Math.min(j+1,ps.length-1)];center.push({a:[(a.x-left)*scale,(top-a.y)*scale],b:[(b.x-left)*scale,(top-b.y)*scale],width:s.size*scale});}}function depthAt(p){var width=0,nearest=Infinity,nearestWidth=minWidth*scale;for(var line of center){var d=dist2(p,line.a,line.b),radius=line.width/2;if(d<=Math.pow(radius+2,2))width=Math.max(width,line.width);if(d<nearest){nearest=d;nearestWidth=line.width;}}var local=width||nearestWidth;return local<4?.001:Math.max(.25,Math.min(maxDepth,local*(first.edgeWidthMode==='fixed'?.45:.25)));}var paths=regions.map(function(region){return region.map(function(ring){return simplifyRing(ring,.8);});}),allRings=[].concat.apply([],paths),eraseLines=[];for(var s of strokes)if(s.op==='erase')for(var j=0;j<Math.max(1,s.points.length-1);j++){var a=s.points[j],b=s.points[Math.min(j+1,s.points.length-1)];eraseLines.push({a:[(a.x-left)*scale,(top-a.y)*scale],b:[(b.x-left)*scale,(top-b.y)*scale],radius:s.size*scale/2});}var patches=[];for(var region of paths)for(var i=0;i<region.length;i++){var ring=region[i];if(amount&&i===0){var rounded=roundOuter(ring,amount,depthAt,allRings,alpha,w,h,eraseLines);ring=region[i]=rounded.ring;for(var patch of rounded.patches)patches.push(patch.map(function(p){return [left+p[0]/scale,top-p[1]/scale];}));}if(!amount&&!textured)ribbon(pixels.data,w,h,ring,tex,repeat,depthAt,maxDepth);}if(amount||textured){var shape=canvas(w,h),sg=shape.getContext('2d');sg.putImageData(new ImageData(alpha,w,h),0,0);sg.setTransform(scale,0,0,-scale,-left*scale,top*scale);patchCoverage(sg,{patches:patches});alpha=sg.getImageData(0,0,w,h).data;smoothBand(pixels.data,w,h,paths,tex,edgeScale*scale,depthAt,alpha,textured&&first.edgeExterior==='cutout');}}
 r.setTransform(1,0,0,1,0,0);r.putImageData(pixels,0,0);
 found={canvas:result,left:left,right:right,top:top,bottom:bottom,scale:scale,patches:patches||[],bytes:w*h*4+(patches||[]).reduce(function(n,p){return n+p.length*16;},0)};builds++;while(bytes+found.bytes>MAX_BYTES&&cache.size){var oldest=cache.keys().next().value;bytes-=cache.get(oldest).bytes;cache.delete(oldest);}if(found.bytes<=MAX_BYTES){cache.set(key,found);bytes+=found.bytes;}return found;
}
function coverage(ctx,strokes,brush){for(var s of strokes){if(s.op==='erase'){brush(ctx,s,{});continue;}ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineWidth=s.size;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();for(var i=0;i<s.points.length;i++){var p=s.points[i];i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}if(s.points.length===1){var p=s.points[0];ctx.arc(p.x,p.y,s.size/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();}}
// Draw coverage on a stable layer-space grid: native vector clipping otherwise
// changes antialiasing at bake tile edges. Opaque grayscale + lighten merges
// overlapping gutters by maximum coverage; applying alpha once avoids dark joins.
// Only visible 512px tiles and one viewport-sized scratch surface are allocated.
function coverageTiles(ctx,strokes,brush,result,patches){
 var t=ctx.getTransform(),det=t.a*t.d-t.b*t.c;if(!det)return;
 var scale=Math.max(Math.hypot(t.a,t.b),Math.hypot(t.c,t.d)),resolution=Math.pow(2,Math.ceil(Math.log(scale)/Math.LN2)),edge=512,pad=4;
 var bounds=[[0,0],[ctx.canvas.width,0],[0,ctx.canvas.height],[ctx.canvas.width,ctx.canvas.height]].map(function(p){return [(t.d*(p[0]-t.e)-t.c*(p[1]-t.f))/det,(-t.b*(p[0]-t.e)+t.a*(p[1]-t.f))/det];});
 var lx=Math.max(result.left,Math.min.apply(null,bounds.map(function(p){return p[0];}))),rx=Math.min(result.right,Math.max.apply(null,bounds.map(function(p){return p[0];}))),by=Math.max(result.bottom,Math.min.apply(null,bounds.map(function(p){return p[1];}))),ty=Math.min(result.top,Math.max.apply(null,bounds.map(function(p){return p[1];})));
 if(rx<=lx||ty<=by)return;
 var output=canvas(ctx.canvas.width,ctx.canvas.height),out=output.getContext('2d'),tile=canvas(edge+pad*2,edge+pad*2),g=tile.getContext('2d');
 out.fillStyle='#000';out.fillRect(0,0,output.width,output.height);out.setTransform(t.a,t.b,t.c,t.d,t.e,t.f);out.globalCompositeOperation='lighten';
 for(var y=Math.floor((by*resolution-pad)/edge);y<Math.ceil((ty*resolution+pad)/edge);y++)for(var x=Math.floor((lx*resolution-pad)/edge);x<Math.ceil((rx*resolution+pad)/edge);x++){
  g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-over';g.fillStyle='#000';g.fillRect(0,0,tile.width,tile.height);g.setTransform(resolution,0,0,-resolution,pad-x*edge,pad+(y+1)*edge);
  coverage(g,strokes,brush);if(patches)patchCoverage(g,result);
  g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='destination-over';g.fillStyle='#000';g.fillRect(0,0,tile.width,tile.height);
  out.save();out.translate((x*edge-pad)/resolution,((y+1)*edge+pad)/resolution);out.scale(1/resolution,-1/resolution);out.drawImage(tile,0,0);out.restore();
 }
 var pixels=out.getImageData(0,0,output.width,output.height);for(var i=0;i<pixels.data.length;i+=4){pixels.data[i+3]=pixels.data[i];pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;}out.putImageData(pixels,0,0);
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(output,0,0);ctx.restore();tile.width=tile.height=output.width=output.height=1;
}
function renderBatch(ctx,strokes,images,brush,options){
 if(!ready(images[strokes[0].assetId]))return;var result=raster(strokes,images,brush);if(!result)return;
 function drawMask(context,records,patches){if(options&&options.canonicalCoverage)return coverageTiles(context,records,brush,result,patches);coverage(context,records,brush);if(patches)patchCoverage(context,result);}
 var t=ctx.getTransform(),corners=[[result.left,result.top],[result.right,result.top],[result.left,result.bottom],[result.right,result.bottom]].map(function(p){return [t.a*p[0]+t.c*p[1]+t.e,t.b*p[0]+t.d*p[1]+t.f];}),left=Math.max(0,Math.floor(Math.min.apply(null,corners.map(function(p){return p[0];})))-1),right=Math.min(ctx.canvas.width,Math.ceil(Math.max.apply(null,corners.map(function(p){return p[0];})))+1),top=Math.max(0,Math.floor(Math.min.apply(null,corners.map(function(p){return p[1];})))-1),bottom=Math.min(ctx.canvas.height,Math.ceil(Math.max.apply(null,corners.map(function(p){return p[1];})))+1);if(right<=left||bottom<=top)return;
 var painted=canvas(right-left,bottom-top),mask=canvas(right-left,bottom-top),p=painted.getContext('2d'),m=mask.getContext('2d');
 if(strokes.some(function(s){return s.op==='erase';})){p.drawImage(ctx.canvas,left,top,painted.width,painted.height,0,0,painted.width,painted.height);for(var s of strokes){if(s.op==='erase'){p.setTransform(t.a,t.b,t.c,t.d,t.e-left,t.f-top);brush(p,s,{});continue;}var color=canvas(painted.width,painted.height),cg=color.getContext('2d');cg.setTransform(t.a,t.b,t.c,t.d,t.e-left,t.f-top);cg.translate(result.left,result.top);cg.scale(1/result.scale,-1/result.scale);cg.drawImage(result.canvas,0,0);m.setTransform(1,0,0,1,0,0);m.clearRect(0,0,mask.width,mask.height);m.setTransform(t.a,t.b,t.c,t.d,t.e-left,t.f-top);drawMask(m,[s],false);cg.setTransform(1,0,0,1,0,0);cg.globalCompositeOperation='destination-in';cg.drawImage(mask,0,0);p.setTransform(1,0,0,1,0,0);p.globalAlpha=s.opacity===undefined?1:s.opacity;p.drawImage(color,0,0);p.globalAlpha=1;}if(result.patches.length){var color=canvas(painted.width,painted.height),cg=color.getContext('2d');cg.setTransform(t.a,t.b,t.c,t.d,t.e-left,t.f-top);cg.translate(result.left,result.top);cg.scale(1/result.scale,-1/result.scale);cg.drawImage(result.canvas,0,0);m.setTransform(1,0,0,1,0,0);m.clearRect(0,0,mask.width,mask.height);m.setTransform(t.a,t.b,t.c,t.d,t.e-left,t.f-top);drawMask(m,[],true);m.globalCompositeOperation='destination-out';drawMask(m,strokes,false);m.globalCompositeOperation='source-over';cg.setTransform(1,0,0,1,0,0);cg.globalCompositeOperation='destination-in';cg.drawImage(mask,0,0);p.setTransform(1,0,0,1,0,0);p.globalAlpha=strokes[0].opacity===undefined?1:strokes[0].opacity;p.drawImage(color,0,0);p.globalAlpha=1;}ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(left,top,painted.width,painted.height);ctx.drawImage(painted,left,top);ctx.restore();return;}
 p.setTransform(t.a,t.b,t.c,t.d,t.e-left,t.f-top);p.translate(result.left,result.top);p.scale(1/result.scale,-1/result.scale);p.drawImage(result.canvas,0,0);m.setTransform(t.a,t.b,t.c,t.d,t.e-left,t.f-top);drawMask(m,strokes,true);p.setTransform(1,0,0,1,0,0);p.globalCompositeOperation='destination-in';p.drawImage(mask,0,0);ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=strokes[0].opacity===undefined?1:strokes[0].opacity;ctx.drawImage(painted,left,top);ctx.restore();
}
function live(ctx,s,images){var source=images[s.assetId];if(!ready(source))return;var tiling=s.textureScale||1;ctx.save();ctx.scale(tiling,-tiling);ctx.globalAlpha=s.opacity===undefined?1:s.opacity;ctx.fillStyle=ctx.strokeStyle=ctx.createPattern(source.image,'repeat');ctx.lineWidth=s.size/tiling;ctx.lineCap=ctx.lineJoin='round';ctx.beginPath();for(var i=0;i<s.points.length;i++){var p=s.points[i];i?ctx.lineTo(p.x/tiling,-p.y/tiling):ctx.moveTo(p.x/tiling,-p.y/tiling);}if(s.points.length===1){var p=s.points[0];ctx.arc(p.x/tiling,-p.y/tiling,s.size/tiling/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();ctx.restore();}
function render(ctx,strokes,images,brush,options){var batch=[],key=null;function flush(){if(batch.length)renderBatch(ctx,batch,images,brush,options);batch=[];key=null;}for(var stroke of strokes){if(stroke.preview){flush();if(stroke.mode==='road'&&stroke.op!=='erase')live(ctx,stroke,images);else brush(ctx,stroke,images);continue;}if(stroke.mode==='road'&&stroke.op!=='erase'){var next=material(stroke);if(key!==null&&key!==next)flush();batch.push(stroke);key=next;}else if(stroke.op==='erase'&&batch.length){batch.push(stroke);}else{flush();brush(ctx,stroke,images);}}flush();}
function clear(){cache.clear();bytes=0;borders=new WeakMap();sourceIds=new WeakMap();sourceSerial=0;}
return {render:render,assets:assets,clear:clear,stats:function(){return {builds:builds,bytes:bytes,entries:cache.size,fillets:Array.from(cache.values()).reduce(function(n,r){return n+r.patches.length;},0)};},simplifyRing:simplifyRing};
}));
