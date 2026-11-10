"use strict";
// Instance-owned fixtures: imported prefabs and shared model assets stay intact.
var Geometry=require("BuildingBlocker");
function nodes(owner) {return [owner.node].concat((owner.ndAniOther||[]).map(function (s) {return s.node;}));}
function dispose(owner) {
  var state=owner._buildingBlockerRuntime;if(!state)return;
  state.extra.forEach(function (c) {
    if(owner._stopColliderTween)owner._stopColliderTween(c);
    c.enabled=false;c.tag=0;delete owner.colPoint[c.uuid];if(c.destroy)c.destroy();
  });
  state.original.forEach(function (c) {c.component.tag=c.tag;});
  delete owner._buildingBlockerRuntime;owner._combatFootprints=null;
}
function apply(owner) {
  var cfg=owner.buildInfo&&owner.buildInfo.cfg,blocker=cfg&&cfg.Blocker,prior=owner._buildingBlockerRuntime;
  if(!blocker) {if(prior)dispose(owner);return;}
  var main=owner.ndAniMain,layout=main&&main.skeletonData&&main.skeletonData.skeletonJson.wallKit&&main.skeletonData.skeletonJson.wallKit.layout;
  var signature=JSON.stringify([owner.index,blocker,layout]);
  if(prior&&prior.signature===signature)return;
  if(prior)dispose(owner);
  var state=owner._buildingBlockerRuntime={signature:signature,original:[],extra:[]},tag=owner.getColliderIndex(),parts=nodes(owner),prototype;
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
      owner.colPoint[c.uuid]=c.points.map(function (p) {return cc.v2(p.x,p.y);});state.extra.push(c);
    });
  }
  if(blocker.body)install(owner.node,blocker.body.polygons||[],owner.node);
  else if(layout) {
    var shapes=Geometry.wall(blocker,layout);
    install(owner.node,shapes.gate,main.node);
    // Fixed connections must use a wing body: only leaf contacts admit allies.
    if(parts[1])install(parts[1],shapes.fixed,main.node);
  }
  owner._combatFootprints=null;
}
exports.apply=apply;exports.dispose=dispose;
