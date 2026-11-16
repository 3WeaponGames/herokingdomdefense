"use strict";
// Authored VFX contacts, shared by battle rules and the render-only editor.
// Times are gameplay seconds. Changing duration retimes the whole sequence,
// never the number of rendered frames or the hero's attack-speed multiplier.
var VOLLEYS=[0,.3,.8666666667];
var THRUSTS=[.4333333333,.5333333333,.5666666667,.6333333333,.8666666667];
var ArrowPaths=require('./HeroSkillArrowPaths');
function finite(v,f){return typeof v==="number"&&isFinite(v)?v:f;}
function count(v,f){return Math.max(1,Math.min(100,Math.floor(finite(v,f))));}
function skirmisherSchedule(t){
  t=t||{};var n=count(t.volleys,3),start=Math.max(0,finite(t.windup,2/3)),speed=Math.max(.01,finite(t.volleyPlayback,1)),result=[];
  for(var i=0;i<n;i++)result.push(Math.max(0,finite(t.contactDelay,0))+start+(i<VOLLEYS.length?VOLLEYS[i]:VOLLEYS[2]+(i-2)*.4333333333)/speed);
  return result;
}
function vanguardSchedule(t){
  t=t||{};var n=count(t.strikes,5),duration=Math.max(.001,finite(t.duration,4/3)),result=[];
  for(var i=0;i<n;i++)result.push(Math.max(0,finite(t.contactDelay,0))+(n===5?THRUSTS[i]*duration/(4/3):duration*(i+1)/n));
  return result;
}
function nextTime(active){return !active?Infinity:active.schedule&&active.emitted<active.schedule.length?active.schedule[active.emitted]:active.duration;}
function fan(direction,n,degrees){
  n=count(n,3);var d=direction||{x:1,y:0},a=Math.atan2(finite(d.y,0),finite(d.x,1)),span=Math.max(0,finite(degrees,12))*Math.PI/180,result=[];
  for(var i=0;i<n;i++){var angle=a+(n===1?0:(i/(n-1)-.5)*span);result.push({x:Math.cos(angle),y:Math.sin(angle)});}return result;
}
function mysticRadius(charges,t,heroWidth){
  t=t||{};var width=Math.max(1,finite(heroWidth,100)),base=Math.max(1,finite(t.splashRadius,width)),growth=Math.max(0,finite(t.splashRadiusPerCharge,width*.1));
  return base+Math.max(0,finite(charges,0))*growth;
}
function usesAuthoredArrows(v){return !!v&&v.castTrajectory==='skirmisher-atx117';}
function arrowSourceTime(elapsed,t,v){return (elapsed-Math.max(0,finite(t&&t.contactDelay,0))-Math.max(0,finite(v&&v.castDelay,0))-Math.max(0,finite(t&&t.windup,2/3)))*Math.max(.01,finite(t&&t.volleyPlayback,1))+2/3;}
function arrowGameTime(source,t,v){return Math.max(0,finite(t&&t.contactDelay,0))+Math.max(0,finite(v&&v.castDelay,0))+Math.max(0,finite(t&&t.windup,2/3))+(source-2/3)/Math.max(.01,finite(t&&t.volleyPlayback,1));}
function arrowEndTime(t,v){return arrowGameTime(ArrowPaths.duration,t,v);}
function arrowSegments(from,to,t,v,cast){
  if(!cast||!(to>=from))return [];
  v=v||{};t=t||{};var start=arrowSourceTime(from,t,v),end=arrowSourceTime(to,t,v),origin=cast.origin||{x:0,y:0},direction=cast.direction||{x:1,y:0},scale=Math.max(.001,finite(v.castScale,ArrowPaths.defaultScale)),sx=finite(v.castScaleX,1),sy=finite(v.castScaleY,1),angle=Math.atan2(direction.y,direction.x)+finite(v.castRotation,ArrowPaths.defaultRotation)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),out=[];
  function world(p){var x=p.x-ArrowPaths.sourceOrigin.x,y=p.y-ArrowPaths.sourceOrigin.y;return{x:origin.x+finite(v.castOffsetX,0)+scale*(x*sx*c-y*sy*s),y:origin.y+finite(v.castOffsetY,0)+scale*(x*sx*s+y*sy*c)};}
  function lerp(a,b,time){var f=b.t>a.t?Math.max(0,Math.min(1,(time-a.t)/(b.t-a.t))):0;return{x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f};}
  ArrowPaths.trajectories.forEach(function(path,index){
    if(end<path.release-1e-7||start>path.end+1e-7)return;
    var pts=path.points,lo=Math.max(start,pts[0].t),hi=Math.min(end,pts[pts.length-1].t);
    if(hi<lo-1e-7)return;
    // Include the visible spawn point without inventing a damaging path from
    // the bow through the asset's invisible preparation frames.
    if(start<path.release&&end>=path.release){var spawn=world(pts[0]);out.push({index:index,from:spawn,to:spawn,launch:spawn,radius:Math.max(1,finite(t.projectileWidth,28)),fromAt:path.release,at:path.release,travelled:0});}
    for(var i=1;i<pts.length;i++){
      var a=pts[i-1],b=pts[i];if(b.t<lo||a.t>hi)continue;
      var left=Math.max(lo,a.t),right=Math.min(hi,b.t);if(right<=left)continue;
      var p=world(lerp(a,b,left)),q=world(lerp(a,b,right)),first=world(pts[0]);
      out.push({index:index,from:p,to:q,launch:first,radius:Math.max(1,finite(t.projectileWidth,28)),fromAt:left,at:right,travelled:Math.hypot(q.x-first.x,q.y-first.y),travelledFrom:Math.hypot(p.x-first.x,p.y-first.y)});
    }
  });
  return out.sort(function(a,b){return a.at-b.at||a.index-b.index;});
}
// Resample living targets after a contact callback and query again from the
// returned source-time frontier. New positions cannot hit elapsed geometry.
function arrowEntry(point,a,b,radius){
  var x=point.x-a.x,y=point.y-a.y,epsilon=1e-9;if(x*x+y*y<=radius*radius+epsilon)return 0;
  var dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!(length>0))return null;
  var ux=dx/length,uy=dy/length,along=x*ux+y*uy,across=x*uy-y*ux,half=radius*radius-across*across;
  if(half < -epsilon)return null;var entry=along-Math.sqrt(half<=epsilon?0:half);
  return entry>=-epsilon&&entry<=length+epsilon?Math.max(0,Math.min(1,entry/length)):null;
}
function nextArrowContact(segments,targets,cursor,seen){
  cursor=finite(cursor,-Infinity);var best=null,epsilon=1e-9;
  (segments||[]).forEach(function(segment){
    if(segment.at<cursor)return;
    var left=Math.max(cursor,segment.fromAt),span=segment.at-segment.fromAt,fraction=span>0?Math.max(0,Math.min(1,(left-segment.fromAt)/span)):0;
    var from={x:segment.from.x+(segment.to.x-segment.from.x)*fraction,y:segment.from.y+(segment.to.y-segment.from.y)*fraction};
    (targets||[]).forEach(function(record,order){
      var point=record.point;if(!point||!isFinite(point.x)||!isFinite(point.y)||seen&&seen(segment.index,record))return;
      var entry=arrowEntry(point,from,segment.to,segment.radius);if(entry===null)return;
      var at=Math.max(cursor,left+(segment.at-left)*entry);
      if(best&&(at>best.at+epsilon||Math.abs(at-best.at)<=epsilon&&(segment.index>best.segment.index||segment.index===best.segment.index&&order>=best.order)))return;
      var contact={x:from.x+(segment.to.x-from.x)*entry,y:from.y+(segment.to.y-from.y)*entry},launch=segment.launch;
      var travelled=launch?Math.hypot(contact.x-launch.x,contact.y-launch.y):(segment.travelledFrom||0)+(segment.travelled-(segment.travelledFrom||0))*(fraction+(1-fraction)*entry);
      best={segment:segment,record:record,entry:entry,at:at,point:contact,travelled:travelled,order:order};
    });
  });return best;
}
exports.nextArrowContact=nextArrowContact;
exports.skirmisherSchedule=skirmisherSchedule;exports.vanguardSchedule=vanguardSchedule;exports.nextTime=nextTime;exports.fan=fan;exports.mysticRadius=mysticRadius;
exports.usesAuthoredArrows=usesAuthoredArrows;exports.arrowSourceTime=arrowSourceTime;exports.arrowGameTime=arrowGameTime;exports.arrowEndTime=arrowEndTime;exports.arrowSegments=arrowSegments;
