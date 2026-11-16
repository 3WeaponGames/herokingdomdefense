"use strict";
// One world-space position drives each projectile's art and collision.
// Area skills share the equipped weapon's sampled release point as well.
function finite(value,fallback) { return typeof value==="number"&&isFinite(value)?value:(fallback||0); }
function add(point,offset) { return {x:point.x+finite(offset&&offset.x),y:point.y+finite(offset&&offset.y)}; }
function point(value) { return {x:value.x,y:value.y}; }
function scenePoint(x,y) { return typeof cc!=="undefined"&&cc.v2?cc.v2(x,y):{x:x,y:y}; }
function unit(value,fallback) { var x=finite(value&&value.x),y=finite(value&&value.y),length=Math.hypot(x,y);return length>1e-9?{x:x/length,y:y/length}:fallback?unit(fallback):{x:1,y:0}; }
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
  visual=visual||{};var angle=finite(visual.rotation)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),d=unit(direction),degrees=finite(visual.arcDegrees,style==='vanguard'?72:120);
  return {origin:add(origin,{x:visual.offsetX,y:visual.offsetY}),radius:radius*finite(visual.scale,1),direction:{x:d.x*c-d.y*s,y:d.x*s+d.y*c},halfAngle:degrees*Math.PI/360};
}
function arrow(radius) { radius=Math.max(1,finite(radius,28));return {tail:-radius*.85,base:radius*.4,tip:radius*.85,halfHeight:radius*.35,stroke:radius*.18}; }
var bones={skirmisher:'Rider/HandRight/Bow/Arrow',fighter:'Rider/HandRight/Sword',vanguard:'Rider/HandRight/Spear',mystic:'Rider/HandRight/Staff',bruiser:'Rider/HandRight/Axe',guardian:'Rider/HandRight/Blunt'};
exports.add=add;exports.point=point;exports.unit=unit;exports.shot=shot;exports.actorPoint=actorPoint;exports.area=area;exports.arrow=arrow;exports.bones=bones;
exports.visualPoint=point;exports.damagePoint=point;
