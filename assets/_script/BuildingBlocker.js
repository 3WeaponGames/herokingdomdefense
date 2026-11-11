"use strict";
// Model-space geometry shared by authoring previews and native physics.
var Kit = require("./WallKit");
function transform(polygons, matrix) {
  return polygons.map(function (polygon) { return polygon.map(function (p) {
    return {x:matrix[0]*p.x+matrix[2]*p.y+matrix[4],y:matrix[1]*p.x+matrix[3]*p.y+matrix[5]};
  }); });
}
function instances(layout,referenceSpan) {
  var center={x:(layout.left.x+layout.right.x)/2,y:(layout.left.y+layout.right.y)/2};
  var stretch=referenceSpan>0?layout.nativeGateSpan/referenceSpan:1,k=Kit.axis.slope,denominator=1+k*k;
  var result={gate:layout.gate?[[(stretch+k*k)/denominator,k*(1-stretch)/denominator,k*(1-stretch)/denominator,(1+stretch*k*k)/denominator,center.x,center.y]]:[],pillar:[],span:[]};
  Kit.posts(layout).forEach(function (p) {result.pillar.push([1,0,0,1,p.x,p.y]);});
  [layout.leftPoints,layout.rightPoints].forEach(function (points) {
    for(var i=1;i<points.length;i++) {
      var a=points[i-1],b=points[i],front=a.y<b.y?a:b,back=front===a?b:a;
      result.span.push([back.x<front.x?1:-1,0,0,1,front.x,front.y]);
    }
  });
  if(layout.end==="corner")result.span.push([-1,0,0,1,layout.rightEnd.x,layout.rightEnd.y]);
  return result;
}
function wallDefaults(layout) {
  var center={x:(layout.left.x+layout.right.x)/2,y:(layout.left.y+layout.right.y)/2};
  var unit=Math.hypot(45,30),x=45/unit*18,y=-30/unit*18;
  return {
    gate:layout.gate?[Kit.footprint({x:layout.left.x-center.x,y:layout.left.y-center.y},{x:layout.right.x-center.x,y:layout.right.y-center.y},28)]:[],
    pillar:[Kit.footprint({x:-x,y:-y},{x:x,y:y},28)],
    span:[Kit.footprint({x:-45,y:30},{x:0,y:0},28)]
  };
}
function wall(blocker,layout) {
  var copies=instances(layout,blocker.gateSpan),result={gate:[],fixed:[]};
  Object.keys(copies).forEach(function (key) {
    var shape=blocker[key]&&blocker[key].polygons||[];
    copies[key].forEach(function (matrix) {result[key==="gate"?"gate":"fixed"].push.apply(result[key==="gate"?"gate":"fixed"],transform(shape,matrix));});
  });return result;
}
exports.transform=transform;exports.instances=instances;exports.wallDefaults=wallDefaults;exports.wall=wall;
