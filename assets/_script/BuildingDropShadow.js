"use strict";
// Portable alpha-only drop shadows shared by the editor and Cocos runtime.
// Ground projection is the only generated shadow shape. These are the user's
// recovered global values; missing settings must never select another shape.
var GROUND=Object.freeze({length:.89,flatten:.82,groundDepth:0,base:0,taper:.17,fade:0});
var EDGE=Object.freeze({straighten:.57}),DEFAULTS=Object.freeze(Object.assign({projection:"ground",angle:-74,spread:100,size:0,opacity:.203},GROUND,EDGE));
var RANGES={angle:[-180,180],spread:[0,100],size:[0,128],opacity:[0,1]};
var GROUND_RANGES={length:[.05,3],flatten:[.05,1.5],groundDepth:[0,.5],base:[0,.5],taper:[-.5,.8],fade:[0,1]};
var EDGE_RANGES={straighten:[0,1]},ALL_RANGES=Object.assign({},RANGES,GROUND_RANGES,EDGE_RANGES);
function inRange(n,r){return typeof n==="number"&&isFinite(n)&&n>=r[0]&&n<=r[1];}
function valid(value){return !!value&&Object.keys(RANGES).every(function(k){return inRange(value[k],RANGES[k]);})&&(value.projection===undefined||value.projection==="ground")&&Object.keys(Object.assign({},GROUND_RANGES,EDGE_RANGES)).every(function(k){return value[k]===undefined||inRange(value[k],ALL_RANGES[k]);});}
function settings(value){var result={projection:"ground"};Object.keys(ALL_RANGES).forEach(function(k){var r=ALL_RANGES[k];result[k]=value&&typeof value[k]==="number"&&isFinite(value[k])?Math.max(r[0],Math.min(r[1],value[k])):DEFAULTS[k];});return result;}
function mode(row){var m=row&&row.DropShadow&&row.DropShadow.mode;return ["global","tier","individual","none"].indexOf(m)>=0?m:"global";}
function group(category,row){
 var rows=category&&category.levelList||[],choices=category&&category.InitialChoices||[rows[0]&&rows[0].index];
 function reaches(id,seen){if(id===row.index)return true;if(seen.indexOf(id)>=0)return false;seen.push(id);var r=rows.find(function(v){return v.index===id;});return !!r&&(r.BranchBuild||[]).some(function(n){return reaches(n,seen);});}
 var root=rows.find(function(r){return choices.indexOf(r.index)>=0&&reaches(r.index,[]);})||rows[0];return String(category&&category.enumValue||row&&row.ID)+":"+(root?root.index:row.index);
}
function resolve(category,row,overrides){
 var m=mode(row),table=overrides&&overrides.buildingShadows||{},key=group(category,row),saved=m==="global"?table.global:m==="tier"?table.tiers&&table.tiers[key]:row&&row.DropShadow&&row.DropShadow.settings;
 // A previously authored polygon remains a polygon when its old save has no
 // source tag. Generated/default shadows still always use ground projection.
 var source=row&&row.DropShadow&&row.DropShadow.source||(row&&row.Shadow?"polygon":"texture");
 return{mode:m,source:source,group:key,settings:settings(saved||table.global),active:m!=="none"&&source!=="polygon",saved:valid(saved)};
}
function transition(category,row,overrides,next){
 var current=resolve(category,row,overrides),table=overrides&&overrides.buildingShadows||{},preset=next==="global"?table.global:next==="tier"?table.tiers&&table.tiers[current.group]:null;
 return settings(valid(preset)?preset:current.mode==="none"&&row.DropShadow&&valid(row.DropShadow.settings)?row.DropShadow.settings:current.settings);
}
// Sliding extrema and three box passes give bounded O(width*height) work.
function filter(input,w,h,r,horizontal,max){
 if(!r)return input;var output=new Uint8Array(w*h),length=horizontal?w:h,lines=horizontal?h:w;
 for(var line=0;line<lines;line++){
  var queue=new Int32Array(length+2*r+1),head=0,tail=0,sum=0,read=function(i){return i<0||i>=length?0:input[horizontal?line*w+i:i*w+line];};
  if(max){for(var x=-r;x<length+r;x++){var n=read(x);while(tail>head&&read(queue[tail-1])<=n)tail--;queue[tail++]=x;while(tail>head&&queue[head]<x-2*r)head++;var at=x-r;if(at>=0&&at<length)output[horizontal?line*w+at:at*w+line]=read(queue[head]);}}
  else{for(var i=-r;i<=r;i++)sum+=read(i);for(var at=0;at<length;at++){output[horizontal?line*w+at:at*w+line]=Math.round(sum/(2*r+1));sum+=read(at+r+1)-read(at-r);}}
 }return output;
}
function validateSource(source,options){
 var w=source&&source.pixelWidth,h=source&&source.pixelHeight;
 var limit=options&&options.maxSourceEdge===2048?2048:1024;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>limit||h>limit||!source.alpha||source.alpha.length!==w*h)throw Error("Invalid building shadow silhouette.");
 var ux=source.width/w,uy=source.height/h;if(!(ux>0&&uy>0&&isFinite(ux+uy)&&isFinite(source.x)&&isFinite(source.y)))throw Error("Invalid building shadow dimensions.");
}
// Estimate a shallow ground footprint from each column's lowest opaque pixel.
// Height above that footprint casts along one sun vector. Roofs therefore lie
// on the floor instead of leaving an upright duplicate behind the building.
function project(source,p,options){
 var w=source.pixelWidth,h=source.pixelHeight,ux=source.width/w,uy=source.height/h,top=new Int32Array(w),bottom=new Int32Array(w),lo=h,hi=-1,left=w,right=-1;
 for(var x=0;x<w;x++){top[x]=-1;bottom[x]=-1;for(var y=0;y<h;y++)if(source.alpha[y*w+x]>8){if(top[x]<0)top[x]=y;bottom[x]=y;}if(top[x]>=0){lo=Math.min(lo,top[x]);hi=Math.max(hi,bottom[x]);left=Math.min(left,x);right=Math.max(right,x);}}
 if(hi<0)return{alpha:new Uint8Array(1),pixelWidth:1,pixelHeight:1,x:source.x,y:source.y,width:ux,height:uy};
 var height=(hi-lo+1)*uy;if(source.groundedColumns){height=uy;for(var x=left;x<=right;x++)if(top[x]>=0)height=Math.max(height,(bottom[x]-top[x]+1)*uy);}
 var base=source.y+(h-hi-1)*uy+height*p.base,center=source.x+(left+right+1)*ux/2,feet=new Float64Array(w),contacts=source.contacts||[],columns=new Array(w),angle=p.angle*Math.PI/180,dx=-Math.cos(angle)*p.length,dy=-Math.sin(angle)*p.length*p.flatten;
 if(contacts.length)for(var x=left;x<=right;x++){var px=source.x+(x+.5)*ux,py=source.y+(h-bottom[x]-1)*uy,best=Infinity;contacts.forEach(function(contact){var distance=Math.abs(px-contact.x)+.1*Math.abs(py-contact.y);if(distance<best){best=distance;columns[x]=contact;}});}
 // Modular walls have many ground contacts at different isometric heights.
 // Their upper posts must never be clamped onto the lowest post's floor.
 function foot(i){var y=source.y+(h-bottom[i]-1)*uy,c=columns[i];return bottom[i]<0?base:c?c.y+c.height*p.base:source.groundedColumns?y+height*p.base:Math.max(base,Math.min(base+height*p.groundDepth,y));}
 for(var x=left;x<=right;x++){var sum=0,count=0;for(var j=Math.max(left,x-2);j<=Math.min(right,x+2);j++)if(bottom[j]>=0){sum+=foot(j);count++;}feet[x]=count?Math.min(foot(x),sum/count):base;}
 function point(x,y,f,index){var c=columns[index],z=Math.max(0,y-f),t=z/(c?c.height:height),pivot=c?c.x:source.groundedColumns?x:center;return{x:pivot+(x-pivot)*(1-p.taper*t)+dx*z,y:f+dy*z,t:t};}
 var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(var x=left;x<=right;x++)if(top[x]>=0){var f=feet[x],low=Math.max(f,source.y+(h-bottom[x]-1)*uy),high=Math.max(low,source.y+(h-top[x])*uy);for(var sx=0;sx<2;sx++)for(var sy=0;sy<2;sy++){var v=point(source.x+(x+sx)*ux,sy?high:low,f,x);minX=Math.min(minX,v.x);maxX=Math.max(maxX,v.x);minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);}}
 // Downsample extreme projections before allocating; softness gets its own pad.
 var limit=options&&options.maxProjectionEdge===2048?2044:1020,unit=Math.max(ux,uy,(maxX-minX)/limit,(maxY-minY)/limit),pw=Math.max(1,Math.ceil((maxX-minX)/unit)+2),ph=Math.max(1,Math.ceil((maxY-minY)/unit)+2),alpha=new Uint8Array(pw*ph);minX-=unit;minY-=unit;
 function span(x,y0,y1,amount){
  var f=feet[x],a=point(source.x+x*ux,y0,f,x),b=point(source.x+(x+1)*ux,y0,f,x),c=point(source.x+x*ux,y1,f,x),d=point(source.x+(x+1)*ux,y1,f,x),low=Math.min(a.y,c.y),high=Math.max(a.y,c.y),ystart=Math.max(0,Math.floor((low-minY)/unit)),yend=Math.min(ph-1,Math.floor((high-minY)/unit));
  for(var row=ystart;row<=yend;row++){
   var q=Math.abs(c.y-a.y)>1e-9?Math.max(0,Math.min(1,(minY+(row+.5)*unit-a.y)/(c.y-a.y))):.5,l=a.x+(c.x-a.x)*q,r=b.x+(d.x-b.x)*q;
   if(Math.abs(c.y-a.y)<=1e-9){l=Math.min(a.x,b.x,c.x,d.x);r=Math.max(a.x,b.x,c.x,d.x);}
   var start=Math.max(0,Math.floor((Math.min(l,r)-minX)/unit)),end=Math.min(pw-1,Math.floor((Math.max(l,r)-minX)/unit));
   for(var col=start;col<=end;col++){
    var t=a.t+(c.t-a.t)*q;if(Math.abs(c.y-a.y)<=1e-9&&Math.abs(c.x-a.x)>1e-9)t=a.t+(c.t-a.t)*Math.max(0,Math.min(1,(minX+(col+.5)*unit-(a.x+b.x)/2)/((c.x+d.x-a.x-b.x)/2)));
    var at=(ph-1-row)*pw+col,n=Math.round(amount*(1-p.fade*Math.min(1,t)));if(n>alpha[at])alpha[at]=n;
   }
  }
 }
 // Equal-alpha runs make solid pillars cheap, while retaining transparent gaps.
 for(var x=left;x<=right;x++)if(top[x]>=0){var start=top[x],amount=source.alpha[start*w+x];for(var y=start+1;y<=bottom[x]+1;y++){var next=y<=bottom[x]?source.alpha[y*w+x]:-1;if(next===amount)continue;if(amount>0){var low=Math.max(feet[x],source.y+(h-y)*uy),high=source.y+(h-start)*uy;if(high>low)span(x,low,high,amount);}start=y;amount=next;}}
 return{alpha:alpha,pixelWidth:pw,pixelHeight:ph,x:minX,y:minY,width:pw*unit,height:ph*unit,detailScale:contacts.length?Math.max.apply(null,contacts.map(function(c){return c.height;}))/unit:source.groundedColumns?height/unit:undefined};
}
// Project independently grounded pieces, then take their alpha union. Applying
// opacity/softness once keeps overlapping leaf/post shadows equally dark.
function projectLayers(layers,p,options){
 var parts=layers.map(function(layer){validateSource(layer,options);return project(layer,p,options);}),minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,unit=0,detail=0;
 parts.forEach(function(part){minX=Math.min(minX,part.x);minY=Math.min(minY,part.y);maxX=Math.max(maxX,part.x+part.width);maxY=Math.max(maxY,part.y+part.height);unit=Math.max(unit,part.width/part.pixelWidth,part.height/part.pixelHeight);detail=Math.max(detail,(part.detailScale||0)*part.width/part.pixelWidth);});
 var limit=options&&options.maxProjectionEdge===2048?2048:1024;unit=Math.max(unit,(maxX-minX)/limit,(maxY-minY)/limit);
 var w=Math.max(1,Math.ceil((maxX-minX)/unit)),h=Math.max(1,Math.ceil((maxY-minY)/unit)),alpha=new Uint8Array(w*h);
 parts.forEach(function(part){
  var ux=part.width/part.pixelWidth,uy=part.height/part.pixelHeight,x0=Math.max(0,Math.floor((part.x-minX)/unit)),x1=Math.min(w,Math.ceil((part.x+part.width-minX)/unit)),y0=Math.max(0,Math.floor((part.y-minY)/unit)),y1=Math.min(h,Math.ceil((part.y+part.height-minY)/unit));
  for(var y=y0;y<y1;y++)for(var x=x0;x<x1;x++){var sx=Math.floor((minX+(x+.5)*unit-part.x)/ux),sy=Math.floor((minY+(y+.5)*unit-part.y)/uy);if(sx<0||sx>=part.pixelWidth||sy<0||sy>=part.pixelHeight)continue;var at=(h-1-y)*w+x,n=part.alpha[(part.pixelHeight-1-sy)*part.pixelWidth+sx];if(n>alpha[at])alpha[at]=n;}
 });
 return{alpha:alpha,pixelWidth:w,pixelHeight:h,x:minX,y:minY,width:w*unit,height:h*unit,detailScale:detail?detail/unit:undefined};
}
function raster(source,value,options){
 validateSource(source,options);var p=settings(value);if(options&&options.sizeScale>0&&isFinite(options.sizeScale))p.size*=options.sizeScale;source=source.layers&&source.layers.length?projectLayers(source.layers,p,options):project(source,p,options);
 var w=source.pixelWidth,h=source.pixelHeight,ux=source.width/w,uy=source.height/h;
 // Map scenery can be thousands of units wide. A constant physical detail
 // limit stops edge straightening from cutting huge corners off a large cliff.
 if(options&&options.outlineWorldLimit>0)source=Object.assign({},source,{detailScale:Math.min(source.detailScale||Math.min(w,h),options.outlineWorldLimit/Math.max(ux,uy))});
 if(p.straighten>0){var outline=require("./ShadowOutline").raster(source,p.straighten);if(outline){var shaded=filter(source.alpha,w,h,outline.radius,true,true);shaded=filter(shaded,w,h,outline.radius,false,true);var clean=new Uint8Array(w*h);for(var i=0;i<clean.length;i++)clean[i]=Math.round(shaded[i]*outline.alpha[i]/255);source=Object.assign({},source,{alpha:clean});}}
 var unit=Math.max(ux,uy),dilate=Math.ceil(p.size*p.spread/100/unit),blur=Math.ceil(p.size*(1-p.spread/100)/unit/2),pad=dilate+blur*3+2,ow=w+pad*2,oh=h+pad*2;
 var limit=options&&options.maxTextureEdge===4096?4096:2048;if(ow>limit||oh>limit)throw Error("The shadow exceeds the texture budget. Increase the silhouette scale.");
 var a=new Uint8Array(ow*oh);for(var y=0;y<h;y++)a.set(source.alpha.subarray(y*w,(y+1)*w),(y+pad)*ow+pad);
 if(dilate){a=filter(a,ow,oh,dilate,true,true);a=filter(a,ow,oh,dilate,false,true);}
 if(blur)for(var pass=0;pass<3;pass++){a=filter(a,ow,oh,blur,true,false);a=filter(a,ow,oh,blur,false,false);}
 var pixels=new Uint8Array(ow*oh*4);for(var i=0;i<a.length;i++)pixels[i*4+3]=Math.round(a[i]*p.opacity);
 return{pixels:pixels,pixelWidth:ow,pixelHeight:oh,x:source.x-pad*ux,y:source.y-pad*uy,width:ow*ux,height:oh*uy};
}
exports.defaults=DEFAULTS;exports.ranges=RANGES;exports.groundDefaults=GROUND;exports.groundRanges=GROUND_RANGES;exports.valid=valid;exports.settings=settings;exports.mode=mode;exports.group=group;exports.resolve=resolve;exports.transition=transition;exports.raster=raster;
exports.edgeDefaults=EDGE;exports.edgeRanges=EDGE_RANGES;
