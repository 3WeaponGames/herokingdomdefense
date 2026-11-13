"use strict";
// Instance-owned fixtures: imported prefabs and shared model assets stay intact.
var Geometry=require("BuildingBlocker");
function live(component) {return !!component&&(!cc.isValid||cc.isValid(component,true))&&!!component.node&&(!cc.isValid||cc.isValid(component.node,true));}
function nodes(owner) {return [owner.node].concat((owner.ndAniOther||[]).map(function (s) {return s.node;}));}
function enable(owner,colliders) {
  colliders.forEach(function (c) {if(live(c))c.enabled=owner.index>0&&!owner.isDestroyed&&c.tag===owner.getColliderIndex();});
}
function dispose(owner) {
  var state=owner._buildingBlockerRuntime;if(!state)return;
  state.extra.forEach(function (c) {
    if(owner.colPoint&&state.extraIds)delete owner.colPoint[state.extraIds.get(c)];
    if(!live(c))return;
    if(owner._stopColliderTween)owner._stopColliderTween(c);
    c.enabled=false;c.tag=0;if(c.destroy)c.destroy();
  });
  state.original.forEach(function (c) {if(live(c.component))c.component.tag=c.tag;});
  delete owner._buildingBlockerRuntime;owner._combatFootprints=null;
}
function apply(owner) {
  var cfg=owner.buildInfo&&owner.buildInfo.cfg,blocker=cfg&&cfg.Blocker,prior=owner._buildingBlockerRuntime;
  if(!blocker) {
    if(prior){dispose(owner);nodes(owner).forEach(function (node) {enable(owner,node.getComponents(cc.PhysicsPolygonCollider));});}
    return;
  }
  var main=owner.ndAniMain,layout=main&&main.skeletonData&&main.skeletonData.skeletonJson.wallKit&&main.skeletonData.skeletonJson.wallKit.layout;
  var signature=JSON.stringify([owner.index,blocker,layout]);
  if(prior&&prior.signature===signature){enable(owner,prior.extra);return;}
  if(prior)dispose(owner);
  var state=owner._buildingBlockerRuntime={signature:signature,original:[],extra:[],extraIds:new Map()},tag=owner.getColliderIndex(),parts=nodes(owner),prototype;
  parts.forEach(function (node) {node.getComponents(cc.PhysicsPolygonCollider).forEach(function (c) {
    if(c.tag!==tag||c._buildingBlocker)return;
    if(!prototype)prototype=c;
    if(owner._stopColliderTween)owner._stopColliderTween(c);
    state.original.push({component:c,tag:c.tag});c.enabled=false;c.tag=0;
  });});
  function install(node,polygons,frame) {
    polygons.forEach(function (polygon) {
      var c=node.addComponent(cc.PhysicsPolygonCollider);c.enabled=false;c._buildingBlocker=true;c.tag=tag;
      ['density','friction','restitution'].forEach(function (key) {if(prototype&&prototype[key]!==undefined)c[key]=prototype[key];});c.sensor=false;
      c.offset=cc.v2(0,0);
      c.points=polygon.map(function (p) {return frame===node?cc.v2(p.x,p.y):node.convertToNodeSpaceAR(frame.convertToWorldSpaceAR(cc.v2(p.x,p.y)));});
      owner.colPoint[c.uuid]=c.points.map(function (p) {return cc.v2(p.x,p.y);});state.extra.push(c);state.extraIds.set(c,c.uuid);
    });
  }
  if(blocker.body)install(owner.node,blocker.body.polygons||[],owner.node);
  else if(layout) {
    var shapes=Geometry.wall(blocker,layout);
    install(owner.node,shapes.gate,main.node);
    // Fixed connections must use a wing body: only leaf contacts admit allies.
    if(parts[1])install(parts[1],shapes.fixed,main.node);
  }
  enable(owner,state.extra);
  owner._combatFootprints=null;
}
exports.apply=apply;exports.dispose=dispose;
