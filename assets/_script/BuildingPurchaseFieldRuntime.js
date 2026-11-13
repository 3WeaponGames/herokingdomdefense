"use strict";
var Settings=require("BuildingPurchaseField");
function variant(owner,state) {
  if(owner.wallFacing||owner.placementVariant)return owner.wallFacing||owner.placementVariant;
  if(state)return state.variant;
  if(owner.buildCfg.enumValue!==6)return "default";
  var Facing=require("GateFacing"),main=owner.ndAniMain.node,local=function (x,y) {return owner.node.convertToNodeSpaceAR(world(main,x,y));},a=local(0,0),b=local(1,0),c=local(0,1),mirrored=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)<0,faces=mirrored?["NW","SE"]:["NE","SW"],inside=owner.node.convertToNodeSpaceAR(world(owner.ndLockList[0],0,0));
  function score(face){var n=Facing.normal(face);return inside.x*n.x+inside.y/n.y;}
  return score(faces[0])<=score(faces[1])?faces[0]:faces[1];
}
function world(node,x,y) {return node.convertToWorldSpaceAR(cc.v2(x,y));}
function pose(node) {return {node:node,position:cc.v2(node.x,node.y),angle:node.angle,scaleX:node.scaleX,scaleY:node.scaleY};}
function restore(state) {state.poses.forEach(function (p) {p.node.setPosition(p.position);p.node.angle=p.angle;p.node.scaleX=p.scaleX;p.node.scaleY=p.scaleY;});state.triggers.forEach(function (p) {p.collider.points=p.points.map(function (v) {return cc.v2(v.x,v.y);});});}
function geometry(owner,state,reference){
 var field=owner.ndLockList[0],frame=owner.node.parent,at=function(node){var p=world(node,0,0);return frame?frame.convertToNodeSpaceAR(p):p;},o=at(owner.node),p=at(field),offset=state?state.offset:owner.purchaseOffset||{x:0,y:0},factor=Math.abs(owner.node.scaleX)||1,distance=reference?reference.distance*factor:Math.hypot(p.x-o.x-offset.x,p.y-o.y-offset.y)||80;
 function vector(x,y){if(!frame)return{x:x,y:y};var a=frame.convertToWorldSpaceAR(cc.v2(0,0)),b=frame.convertToWorldSpaceAR(cc.v2(x,y));return{x:b.x-a.x,y:b.y-a.y};}
 var a=vector(factor,0),b=vector(0,factor);return{matrix:[a.x,a.y,b.x,b.y],centers:{southeast:vector(Math.SQRT1_2*distance,-Math.SQRT1_2*distance),southwest:vector(-Math.SQRT1_2*distance,-Math.SQRT1_2*distance)}};
}
function apply(owner) {
  if(!owner||!owner.ndLockList||!owner.ndLockList.length)return;
  var state=owner._purchaseFieldRuntime,rows=owner.buildCfg&&owner.buildCfg.levelList||[],row=owner.buildInfo&&owner.buildInfo.cfg||rows.find(function (row) {return owner.buildCfg.InitialChoices&&row.index===owner.buildCfg.InitialChoices[0];})||rows[0],selected=variant(owner,state);
  if(state)restore(state);
  var reference=Settings.reference(owner.buildCfg,row,selected),value=!owner.purchaseOverride&&Settings.resolve(owner.buildCfg,row,selected,geometry(owner,state,reference));
  if(!value){if(state){restore(state);owner.purchaseSide=state.side;owner.purchaseOffset=state.offset;delete owner._purchaseFieldRuntime;}return;}
  if(!state){
    var poses=[],triggers=[],groups=[];
    owner.ndLockList.forEach(function (field) {var parent=field.parent;if(!parent||parent===owner.node||parent.children.some(function (n) {return owner.ndLockList.indexOf(n)<0;}))throw Error("A ground pad needs a separate parent.");if(groups.indexOf(parent)<0){groups.push(parent);poses.push(pose(parent));}poses.push(pose(field));var c=field.getComponent(cc.PolygonCollider);if(c)triggers.push({collider:c,points:c.points.map(function (p) {return{x:p.x,y:p.y};})});});
    state=owner._purchaseFieldRuntime={poses:poses,triggers:triggers,groups:groups,side:owner.purchaseSide,offset:owner.purchaseOffset||{x:0,y:0},variant:selected};
  }
  restore(state);
  var frame=owner.node.parent,position=function (node,x,y) {var p=world(node,x,y);return frame?frame.convertToNodeSpaceAR(p):p;},toWorld=function (p) {return frame?frame.convertToWorldSpaceAR(cc.v2(p.x,p.y)):p;},origin=position(owner.node,0,0),direction=value.southwest?-1:1,placementScale=Math.abs(owner.node.scaleX)||1,padScale=owner.buildInfo&&owner.buildInfo.cfg?1:require("BuildingWorldScale").value(row);
  state.groups.forEach(function (parent) {
    var fields=owner.ndLockList.filter(function (n) {return n.parent===parent;}),first=fields[0],p=position(first,0,0),sxPoint=position(first,1,0),syPoint=position(first,0,1),sx=Math.hypot(sxPoint.x-p.x,sxPoint.y-p.y),sy=Math.hypot(syPoint.x-p.x,syPoint.y-p.y),distance=reference?reference.distance*placementScale:Math.hypot(p.x-origin.x-state.offset.x,p.y-origin.y-state.offset.y)||80;
    var sizes=fields.map(function (field) {var o=position(field,0,0),x=position(field,1,0),y=position(field,0,1);return {x:Math.hypot(x.x-o.x,x.y-o.y)/sx,y:Math.hypot(y.x-o.x,y.y-o.y)/sy};});
    var center={x:origin.x+(direction*Math.SQRT1_2*distance+value.x*placementScale)*padScale,y:origin.y+(-Math.SQRT1_2*distance+value.y*placementScale)*padScale},convert=function (p) {var q=toWorld(p);return parent.parent?parent.parent.convertToNodeSpaceAR(cc.v2(q.x,q.y)):q;},local=convert(center);
    parent.setPosition(local);var a=convert({x:center.x+direction*sx,y:center.y}),b=convert({x:center.x,y:center.y+sy}),dx=a.x-local.x,dy=a.y-local.y,ex=b.x-local.x,ey=b.y-local.y;
    parent.angle=Math.atan2(dy,dx)*180/Math.PI;parent.scaleX=Math.hypot(dx,dy);parent.scaleY=(dx*ey-dy*ex)/parent.scaleX;
    fields.forEach(function (field,i) {field.setPosition(0,0);field.angle=0;field.scaleX=sizes[i].x;field.scaleY=sizes[i].y;});
  });
  owner.purchaseSide=value.southwest?"flip":"default";owner.purchaseOffset=cc.v2(value.x*placementScale,value.y*placementScale);
}
exports.apply=apply;
