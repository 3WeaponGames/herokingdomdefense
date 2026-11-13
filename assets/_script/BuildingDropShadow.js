"use strict";
// Portable alpha-only drop shadows shared by the editor and Cocos runtime.
var DEFAULTS={angle:135,distance:20,spread:10,size:12,opacity:.28};
var RANGES={angle:[-180,180],distance:[0,500],spread:[0,100],size:[0,128],opacity:[0,1]};
function valid(value){return !!value&&Object.keys(RANGES).every(function(k){var n=value[k],r=RANGES[k];return typeof n==="number"&&isFinite(n)&&n>=r[0]&&n<=r[1];});}
function settings(value){var result={};Object.keys(DEFAULTS).forEach(function(k){result[k]=value&&typeof value[k]==="number"&&isFinite(value[k])?Math.max(RANGES[k][0],Math.min(RANGES[k][1],value[k])):DEFAULTS[k];});return result;}
function mode(row){var m=row&&row.DropShadow&&row.DropShadow.mode;return ["global","tier","individual","none"].indexOf(m)>=0?m:"global";}
function group(category,row){
 var rows=category&&category.levelList||[],choices=category&&category.InitialChoices||[rows[0]&&rows[0].index];
 function reaches(id,seen){if(id===row.index)return true;if(seen.indexOf(id)>=0)return false;seen.push(id);var r=rows.find(function(v){return v.index===id;});return !!r&&(r.BranchBuild||[]).some(function(n){return reaches(n,seen);});}
 var root=rows.find(function(r){return choices.indexOf(r.index)>=0&&reaches(r.index,[]);})||rows[0];return String(category&&category.enumValue||row&&row.ID)+":"+(root?root.index:row.index);
}
function resolve(category,row,overrides){
 var m=mode(row),table=overrides&&overrides.buildingShadows||{},key=group(category,row),saved=m==="global"?table.global:m==="tier"?table.tiers&&table.tiers[key]:row&&row.DropShadow&&row.DropShadow.settings;
 return{mode:m,source:row&&row.DropShadow&&row.DropShadow.source||"texture",group:key,settings:settings(saved||table.global),active:m!=="none"&&!(row&&row.DropShadow&&row.DropShadow.source==="polygon")&&valid(saved),saved:valid(saved)};
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
function raster(source,value){
 var p=settings(value),w=source&&source.pixelWidth,h=source&&source.pixelHeight;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>1024||h>1024||!source.alpha||source.alpha.length!==w*h)throw Error("Invalid building shadow silhouette.");
 var ux=source.width/w,uy=source.height/h;if(!(ux>0&&uy>0&&isFinite(ux+uy)))throw Error("Invalid building shadow dimensions.");
 var unit=Math.max(ux,uy),dilate=Math.ceil(p.size*p.spread/100/unit),blur=Math.ceil(p.size*(1-p.spread/100)/unit/2),pad=dilate+blur*3+2,ow=w+pad*2,oh=h+pad*2;
 if(ow>2048||oh>2048)throw Error("The shadow exceeds the texture budget. Increase the silhouette scale.");
 var a=new Uint8Array(ow*oh);for(var y=0;y<h;y++)a.set(source.alpha.subarray(y*w,(y+1)*w),(y+pad)*ow+pad);
 if(dilate){a=filter(a,ow,oh,dilate,true,true);a=filter(a,ow,oh,dilate,false,true);}
 if(blur)for(var pass=0;pass<3;pass++){a=filter(a,ow,oh,blur,true,false);a=filter(a,ow,oh,blur,false,false);}
 var pixels=new Uint8Array(ow*oh*4);for(var i=0;i<a.length;i++)pixels[i*4+3]=Math.round(a[i]*p.opacity);
 var angle=p.angle*Math.PI/180;return{pixels:pixels,pixelWidth:ow,pixelHeight:oh,x:source.x-pad*ux-Math.cos(angle)*p.distance,y:source.y-pad*uy-Math.sin(angle)*p.distance,width:ow*ux,height:oh*uy};
}
exports.defaults=DEFAULTS;exports.ranges=RANGES;exports.valid=valid;exports.settings=settings;exports.mode=mode;exports.group=group;exports.resolve=resolve;exports.transition=transition;exports.raster=raster;
