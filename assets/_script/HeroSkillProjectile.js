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
  // The aimed weapon tip moves around the hand. Resolve the aim from that
  // release point, rather than drawing a parallel ray from the hero's feet.
  for(var i=0;i<16;i++){
    origin=sample?sample(aim):point(hero);if(!origin)origin=point(hero);
    if(!target)break;
    var next=unit({x:target.x-origin.x,y:target.y-origin.y},aim),delta=Math.hypot(next.x-aim.x,next.y-aim.y);aim=next;if(delta<1e-7)break;
  }
  if(target)aim=unit({x:target.x-origin.x,y:target.y-origin.y},aim);
  return {origin:point(origin),direction:aim,target:target?point(target):null};
}
function actorPoint(actor,main) {
  var ground=actor.node.getPosition(),bar=actor.ndHp||actor.ctrHp&&actor.ctrHp.node;
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
