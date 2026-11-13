"use strict";
// World size is independent of upgrade-card zoom and texture resolution.
function valid(value) { return typeof value === "number" && isFinite(value) && value >= .05 && value <= 10; }
function value(row) { return row && valid(row.WorldScale) ? row.WorldScale : 1; }
function matrix(m, origin, factor, fixedSize) {
  return [m[0]*(fixedSize?1:factor),m[1]*(fixedSize?1:factor),m[2]*(fixedSize?1:factor),m[3]*(fixedSize?1:factor),origin.x+(m[4]-origin.x)*factor,origin.y+(m[5]-origin.y)*factor];
}
function polygons(list, origin, factor) {
  return list.map(function (ring) { return ring.map(function (p) { return {x:origin.x+(p.x-origin.x)*factor,y:origin.y+(p.y-origin.y)*factor}; }); });
}
function record(source, factor, scaleBlockers) {
  if(factor===1)return source;
  var result=Object.assign({},source),origin=source.origin||{x:0,y:0},pads=source.purchaseField;
  result.sprites=(source.sprites||[]).map(function(s,i){return Object.assign({},s,{matrix:matrix(s.matrix,origin,factor,!!(pads&&pads.sprites[i]))});});
  result.skeletons=(source.skeletons||[]).map(function(s){return Object.assign({},s,{matrix:matrix(s.matrix,origin,factor)});});
  if(source.shadow)result.shadow=Object.assign({},source.shadow,{matrix:matrix(source.shadow.matrix,origin,factor)});
  if(scaleBlockers!==false){if(source.blockers)result.blockers=polygons(source.blockers,{x:0,y:0},factor);if(source.openBlockers)result.openBlockers=polygons(source.openBlockers,{x:0,y:0},factor);}
  if(pads){
    result.purchaseField=Object.assign({},pads,{center:{x:pads.center.x*factor,y:pads.center.y*factor}});
    if(source.step)result.step=source.step.map(function(p){return{x:p.x+pads.center.x*(factor-1),y:p.y+pads.center.y*(factor-1)};});
  }
  return result;
}
function live(node) { return !!node && (!cc.isValid || cc.isValid(node,true)); }
function liveComponent(component) { return live(component)&&live(component.node); }
function childOf(node,parent) { for(var p=node;p;p=p.parent)if(p===parent)return true;return false; }
function relative(node,frame) {
  function p(x,y){return frame.convertToNodeSpaceAR(node.convertToWorldSpaceAR(cc.v2(x,y)));}
  var o=p(0,0),x=p(1,0),y=p(0,1);return[x.x-o.x,x.y-o.y,y.x-o.x,y.y-o.y,o.x,o.y];
}
function place(entry,owner,factor,offset) {
  if(!live(owner.node)||!live(entry.node)||!live(entry.node.parent))return;
  var m=entry.matrix,divisor=entry.pad?factor:1,dx=entry.pad?offset.x:0,dy=entry.pad?offset.y:0;
  function p(x,y){return entry.node.parent.convertToNodeSpaceAR(owner.node.convertToWorldSpaceAR(cc.v2(x,y)));}
  var o=p(m[4]-dx,m[5]-dy),x=p(m[4]-dx+m[0]/divisor,m[5]-dy+m[1]/divisor),y=p(m[4]-dx+m[2]/divisor,m[5]-dy+m[3]/divisor),a=x.x-o.x,b=x.y-o.y,c=y.x-o.x,d=y.y-o.y,sx=Math.hypot(a,b);
  entry.node.setPosition(o);entry.node.angle=Math.atan2(b,a)*180/Math.PI;entry.node.scaleX=sx;entry.node.scaleY=sx?(a*d-b*c)/sx:0;
}
function resize(owner,state,factor,offset) {
  offset=offset||{x:0,y:0};
  var roots=[owner.node].concat(state.parts.map(function(p){return p.node;})),bodies=[],colliders=[];
  roots.forEach(function(root){if(!live(root)||!root.getComponentsInChildren)return;root.getComponentsInChildren(cc.RigidBody).forEach(function(b){if(bodies.indexOf(b)<0)bodies.push(b);});});
  // Creator's scale listener recreates disabled colliders too. Defer those
  // calls, then refresh only live fixtures so unused tiers/open gates stay off.
  bodies.forEach(function(body){if(!liveComponent(body))return;body.getComponents(cc.PhysicsCollider).forEach(function(c){if(!liveComponent(c)||colliders.some(function(e){return e.collider===c;}))return;colliders.push({collider:c,own:Object.prototype.hasOwnProperty.call(c,"apply"),apply:c.apply});c.apply=function(){};});});
  try{
    owner.node.scaleX=state.scaleX*factor;owner.node.scaleY=state.scaleY*factor;
    var angle=(owner.node.angle||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
    owner.node.x=state.x+factor*(c*state.scaleX*offset.x-s*state.scaleY*offset.y);owner.node.y=state.y+factor*(s*state.scaleX*offset.x+c*state.scaleY*offset.y);
    state.parts.forEach(function(entry){place(entry,owner,factor,offset);});
  }finally{colliders.forEach(function(e){if(!liveComponent(e.collider))return;if(e.own)e.collider.apply=e.apply;else delete e.collider.apply;});}
  bodies.forEach(function(body){if(!liveComponent(body)||!body.node.activeInHierarchy)return;if(body.syncPosition)body.syncPosition();if(body.syncRotation)body.syncRotation();});
  colliders.forEach(function(e){
    var c=e.collider;
    if(!liveComponent(c))return;
    if(!c.enabled||c.enabledInHierarchy===false||!c.node.activeInHierarchy){if(c._inited&&c._destroy)c._destroy();}
    else if(c._inited)c.apply();
  });
  var hp=owner.ctrHp&&owner.ctrHp.node;
  if(live(hp)&&hp.parent&&live(owner.ndHp))hp.setPosition(hp.parent.convertToNodeSpaceAR(owner.ndHp.convertToWorldSpaceAR(cc.v2(0,0))));
  owner._combatFootprints=null;
}
function restore(owner) {
  var state=owner._buildingWorldScaleRuntime;if(!state)return;
  if(live(owner.node))resize(owner,state,1);
  delete owner._buildingWorldScaleRuntime;
}
function apply(owner) {
  var row=owner.buildInfo&&owner.buildInfo.cfg,factor=value(row),offset=row&&row.ModelOffset?require("BuildingModelOffset").value(row):{x:0,y:0};
  if(owner._buildingWorldScaleRuntime)restore(owner);
  if(!row||factor===1&&!offset.x&&!offset.y)return;
  var nodes=[owner.ndAniMain,owner.ndAniDown].concat(owner.ndAniOther||[]).filter(Boolean).map(function(r){return r.node;}),parts=[];
  nodes=nodes.filter(function(n,i){return nodes.indexOf(n)===i&&!childOf(n,owner.node)&&!nodes.some(function(other){return other!==n&&childOf(n,other);});});
  nodes.forEach(function(node){parts.push({node:node,matrix:relative(node,owner.node)});});
  var pads=[],fields=(owner.ndLockList||[]).filter(Boolean);fields.forEach(function(field){var parent=field.parent,dedicated=parent&&parent!==owner.node&&parent.children.every(function(n){return fields.indexOf(n)>=0;}),node=dedicated?parent:field;if(node!==owner.node&&pads.indexOf(node)<0)pads.push(node);});
  pads.forEach(function(node){parts.push({node:node,matrix:relative(node,owner.node),pad:true});});
  var state=owner._buildingWorldScaleRuntime={x:owner.node.x||0,y:owner.node.y||0,scaleX:owner.node.scaleX,scaleY:owner.node.scaleY,parts:parts,factor:factor};
  resize(owner,state,factor,offset);
}
exports.valid=valid;exports.value=value;exports.matrix=matrix;exports.polygons=polygons;exports.record=record;exports.apply=apply;exports.restore=restore;
