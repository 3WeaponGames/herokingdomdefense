"use strict";
// One world-space position drives each projectile's art and collision.
// Area skills share the equipped weapon's sampled release point as well.
function finite(value,fallback) { return typeof value==="number"&&isFinite(value)?value:(fallback||0); }
function add(point,offset) { return {x:point.x+finite(offset&&offset.x),y:point.y+finite(offset&&offset.y)}; }
function point(value) { return {x:value.x,y:value.y}; }
function scenePoint(x,y) { return typeof cc!=="undefined"&&cc.v2?cc.v2(x,y):{x:x,y:y}; }
function unit(value,fallback) { var x=finite(value&&value.x),y=finite(value&&value.y),length=Math.hypot(x,y);return length>1e-9?{x:x/length,y:y/length}:fallback?unit(fallback):{x:1,y:0}; }
// Reflect a left-facing effect horizontally instead of turning its artwork
// upside down. The same signed basis is used by native arrow collisions.
function facingTransform(direction,rotation,scaleX,scaleY){
  var d=unit(direction),left=d.x<0,angle=Math.atan2(d.y,d.x)*180/Math.PI;
  return{angle:angle+(left?-1:1)*finite(rotation),scaleX:finite(scaleX,1),scaleY:finite(scaleY,1)*(left?-1:1),mirrored:left};
}
function facingOffset(direction,offset){
  var basis=facingTransform(direction,0,1,1),angle=basis.angle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),x=finite(offset&&offset.x),y=finite(offset&&offset.y)*basis.scaleY;
  return{x:x*c-y*s,y:x*s+y*c};
}
function areaOrigin(style,origin,visual,direction){var offset={x:visual&&visual.offsetX,y:visual&&visual.offsetY};return add(origin,style==='vanguard'?facingOffset(direction,offset):offset);}
function areaDirection(direction,rotation){var d=unit(direction),angle=finite(rotation)*(d.x<0?-1:1)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);return{x:d.x*c-d.y*s,y:d.x*s+d.y*c};}
function shot(hero,target,direction,sample) {
  var aim=unit(target?{x:target.x-hero.x,y:target.y-hero.y}:direction),origin=point(hero);
  function sampled(d){var p=sample&&sample(d);return p&&typeof p.x==='number'&&typeof p.y==='number'&&isFinite(p.x)&&isFinite(p.y)?point(p):point(hero);}
  function result(p,d){return{origin:point(p),direction:unit(d,aim),target:target?point(target):null};}
  if(!target)return result(sampled(aim),aim);
  if(!sample)return result(origin,aim);
  // The release tip rotates about the hand. Solve that circle directly; a
  // fixed-point iteration oscillates when the target is close to the bow.
  // Both probes stay in the same facing hemisphere as the initial aim.
  var side=aim.x<0?-1:1,root=side<0?Math.PI:0,si=Math.sqrt(3)/2;
  function vector(a){return{x:Math.cos(a),y:Math.sin(a)};}
  var p0=sampled(vector(root)),plus=sampled(vector(root+Math.PI/3)),minus=sampled(vector(root-Math.PI/3));
  var center={x:plus.x+minus.x-p0.x,y:plus.y+minus.y-p0.y};
  var a={x:p0.x-center.x,y:p0.y-center.y},b={x:(plus.x-minus.x)/(2*si),y:(plus.y-minus.y)/(2*si)};
  var radius=Math.hypot(a.x,a.y),circleError=Math.hypot(b.x+a.y,b.y-a.x),dx=target.x-center.x,dy=target.y-center.y,r=Math.hypot(dx,dy);
  function contact(d){var p=sampled(d),x=target.x-p.x,y=target.y-p.y;return{origin:p,direction:d,cross:x*d.y-y*d.x,forward:x*d.x+y*d.y,length:Math.hypot(x,y)};}
  function valid(c){return c.forward>=-1e-7&&Math.abs(c.cross)<=Math.max(1e-6,c.length*1e-8);}
  if(isFinite(center.x+center.y+radius+r)&&circleError<=Math.max(1e-5,radius*1e-5)){
    // In the root-facing basis, a.y is the tip's lateral displacement.
    var lateral=side*a.y;
    if(r>=Math.abs(lateral)&&r>1e-9){var theta=Math.atan2(dy,dx)-Math.asin(Math.max(-1,Math.min(1,lateral/r))),candidate=contact(vector(theta));if(valid(candidate))return result(candidate.origin,candidate.direction);}
    // A target inside the weapon's reach cannot lie ahead of its outward tip.
    // Release at the grip instead of inventing an aim opposite to that pose.
    if(r<=radius+1e-6)return result(center,unit({x:dx,y:dy},aim));
  }
  // Unusual fitted nonuniform scales produce an ellipse. Bound the fallback:
  // eight angle brackets, then at most eighteen bisections of a forward root.
  var previous=contact(vector(-Math.PI)),best=previous;
  for(var i=1;i<=8;i++){
    var angle=-Math.PI+i*Math.PI/4,current=contact(vector(angle));
    if(current.forward>=0&&Math.abs(current.cross)<Math.abs(best.cross))best=current;
    if(valid(current))return result(current.origin,current.direction);
    if(previous.cross*current.cross<0&&(previous.forward>=0||current.forward>=0)){
      var lo=angle-Math.PI/4,hi=angle,left=previous,right=current;
      for(var n=0;n<18;n++){var mid=(lo+hi)/2,c=contact(vector(mid));if(valid(c))return result(c.origin,c.direction);if(left.cross*c.cross<=0){hi=mid;right=c;}else{lo=mid;left=c;}}
      if(Math.abs(left.cross)<Math.abs(right.cross))right=left;if(right.forward>=0&&Math.abs(right.cross)<=Math.max(1e-3,right.length*1e-5))return result(right.origin,right.direction);
    }
    previous=current;
  }
  return result(center,unit({x:dx,y:dy},aim));
}
function actorPoint(actor,main) {
  var ground=actor.node.getPosition(),bar=actor.ndHp||actor.ctrHp&&actor.ctrHp.node;
  if(bar&&typeof cc!=="undefined"&&cc.isValid&&!cc.isValid(bar,true))bar=null;
  if(!bar||!bar.convertToWorldSpaceAR||!actor.node.convertToWorldSpaceAR||!main||!main.convertToNodeSpaceAR)return point(ground);
  // Creator chooses Vec2 versus Vec3 by instance type. Plain {x,y} points
  // take the Vec3 overload with a missing z and turn real HP anchors into NaN.
  var a=actor.node.convertToWorldSpaceAR(scenePoint(0,0)),b=bar.convertToWorldSpaceAR(scenePoint(0,0));return main.convertToNodeSpaceAR(scenePoint(a.x+(b.x-a.x)*.55,a.y+(b.y-a.y)*.55));
}
function area(style,origin,visual,direction,radius) {
  visual=visual||{};var d=areaDirection(direction,visual.rotation),degrees=finite(visual.arcDegrees,style==='vanguard'?72:120);
  var reach=radius*finite(visual.scale,1);return {origin:areaOrigin(style,origin,visual,d),radius:reach,direction:d,halfAngle:degrees*Math.PI/360,startWidth:style==='vanguard'||style==='skirmisher'?Math.min(reach*2,Math.max(0,finite(visual.arcStartWidth,120))):0};
}
function containsArea(shape,target){
  var x=target.x-shape.origin.x,y=target.y-shape.origin.y,r=shape.radius,squared=x*x+y*y;if(squared>r*r+1e-7)return false;
  var d=unit(shape.direction),along=x*d.x+y*d.y,across=Math.abs(x*-d.y+y*d.x),half=finite(shape.halfAngle,Math.PI),width=Math.max(0,finite(shape.startWidth));
  if(width>0&&half<Math.PI/2){if(along< -1e-7)return false;var end=r*Math.cos(half);return along>=end||across<=Math.min(r,width/2)+(r*Math.sin(half)-Math.min(r,width/2))*along/end+1e-7;}
  return squared<=1e-14||along/Math.sqrt(squared)>=Math.cos(half)-1e-9;
}
// A hit scan uses one captured area for every candidate. Resolve its basis and
// curved rear edge once rather than normalizing and evaluating trigonometry for
// every enemy. Callers create a new query for each moving Vanguard strike.
function areaQuery(shape){
  var ox=shape.origin.x,oy=shape.origin.y,r=shape.radius,squaredRadius=r*r,d=unit(shape.direction),dx=d.x,dy=d.y;
  var half=finite(shape.halfAngle,Math.PI),width=Math.max(0,finite(shape.startWidth)),rear=width>0&&half<Math.PI/2;
  var cosine=Math.cos(half),end=r*cosine,start=Math.min(r,width/2),span=rear?r*Math.sin(half)-start:0;
  return function(target){
    var x=target.x-ox,y=target.y-oy,squared=x*x+y*y;if(squared>squaredRadius+1e-7)return false;
    var along=x*dx+y*dy;
    if(rear){if(along< -1e-7)return false;return along>=end||Math.abs(x*-dy+y*dx)<=start+span*along/end+1e-7;}
    return squared<=1e-14||along/Math.sqrt(squared)>=cosine-1e-9;
  };
}
function volleyArea(origin,direction,tuning,visual){
  tuning=tuning||{};visual=visual||{};
  return area('skirmisher',origin,{offsetX:visual.offsetX,offsetY:visual.offsetY,rotation:visual.rotation,arcDegrees:finite(visual.arcDegrees,16),arcStartWidth:visual.arcStartWidth,scale:1},direction,Math.max(0,finite(tuning.volleyRange,250)));
}
function arrow(radius) { radius=Math.max(1,finite(radius,28));return {tail:-radius*.85,base:radius*.4,tip:radius*.85,halfHeight:radius*.35,stroke:radius*.18}; }
var bones={skirmisher:'Rider/HandRight/Bow/Arrow',fighter:'Rider/HandRight/Sword',vanguard:'Rider/HandRight/Spear',mystic:'Rider/HandRight/Staff',bruiser:'Rider/HandRight/Axe',guardian:'Rider/HandRight/Blunt'};
exports.add=add;exports.point=point;exports.unit=unit;exports.shot=shot;exports.actorPoint=actorPoint;exports.area=area;exports.arrow=arrow;exports.bones=bones;
exports.visualPoint=point;exports.damagePoint=point;
exports.facingTransform=facingTransform;
exports.facingOffset=facingOffset;exports.areaOrigin=areaOrigin;exports.areaDirection=areaDirection;
exports.containsArea=containsArea;
exports.areaQuery=areaQuery;
exports.volleyArea=volleyArea;
