"use strict";
// Owned instance data only. No imported asset, scene file or player state changes.
var Kit=require("WallKit"),serial=0;
function endpoints(owner) {
  var main=owner.ndAniMain.node,points=[];
  (owner.ndAniOther||[]).forEach(function(s){
    var json=s.skeletonData&&s.skeletonData.skeletonJson;
    (json&&json.wallAnchors||[]).forEach(function(p){points.push(main.convertToNodeSpaceAR(s.node.convertToWorldSpaceAR(cc.v2(p.x,p.y))));});
  });return points;
}
function restoreFixtures(state) {
  (state.fixtures||[]).forEach(function(f){f.component.tag=f.tag;f.component.points=f.points.map(function(p){return cc.v2(p.x,p.y);});f.component.enabled=f.enabled;if(f.owner.colPoint){if(f.cached)f.owner.colPoint[f.component.uuid]=f.cached;else delete f.owner.colPoint[f.component.uuid];}if(f.component.apply)f.component.apply();});
  state.fixtures=[];
}
function updateFixtures(owner,state,layout) {
  restoreFixtures(state);
  if(!owner.wallRun)return;
  var geometry=Kit.fixtures(layout),main=owner.ndAniMain.node;
  var run=JSON.parse(owner.wallRun),tags=run._fixtureTags||[];
  function update(node,points,group) {
    node.getComponents(cc.PhysicsPolygonCollider).forEach(function(c,at){
      state.fixtures.push({component:c,owner:owner,cached:owner.colPoint&&owner.colPoint[c.uuid],tag:c.tag,points:c.points.map(function(p){return{x:p.x,y:p.y};}),enabled:c.enabled});
      if(!points.length){c.enabled=false;c.tag=0;return;}
      if(tags[group]&&Number.isInteger(tags[group][at]))c.tag=tags[group][at];
      var offset=c.offset||{x:0,y:0};
      c.points=points.map(function(p){var q=node.convertToNodeSpaceAR(main.convertToWorldSpaceAR(cc.v2(p.x,p.y)));return cc.v2(q.x-offset.x,q.y-offset.y);});
      if(owner.colPoint)owner.colPoint[c.uuid]=c.points.map(function(p){return cc.v2(p.x,p.y);});
      if(c.apply)c.apply();
    });
  }
  update(owner.node,geometry.root,0);
  (owner.ndAniOther||[]).forEach(function(s,i){update(s.node,geometry.wings[i]||[],i+1);});
  owner._combatFootprints=null;
}
function dispose(owner) {
  var state=owner&&owner._wallRunRuntime;if(!state)return;
  if(owner._gateFacingRuntime)require("GateFacingRuntime").dispose(owner);
  restoreFixtures(state);
  if(state.component.skeletonData===state.clone)state.component.skeletonData=state.source;
  if(state.clone.decRef)state.clone.decRef();else if(state.clone.destroy)state.clone.destroy();
  if(state.source.decRef)state.source.decRef();
  delete owner._wallRunRuntime;
}
function apply(owner) {
  if(!owner||!owner.ndAniMain||!owner.ndAniMain.skeletonData)return;
  var prior=owner._wallRunRuntime,source=prior?prior.source:owner.ndAniMain.skeletonData,json=source.skeletonJson;
  if(!json||!json.wallKit)return;
  var run=owner.wallRun?JSON.parse(owner.wallRun):null,layout=Kit.layout(run,endpoints(owner)),key=JSON.stringify(layout);
  owner.wallHasGate=layout.gate;
  if(prior&&prior.key===key)return;
  if(prior)dispose(owner);
  var clone=new sp.SkeletonData();clone.skeletonJson=Kit.install(json,layout);clone.atlasText=source.atlasText;
  clone.textures=(source.textures||[]).slice();clone.textureNames=(source.textureNames||[]).slice();clone.scale=source.scale;
  clone.name=(source.name||"Wall")+" modular";clone._uuid=(source._uuid||"wall")+"@run:"+(++serial);
  if(clone.getRuntimeData&&!clone.getRuntimeData()){if(clone.destroy)clone.destroy();throw Error("The modular wall could not be parsed.");}
  if(source.addRef)source.addRef();if(clone.addRef)clone.addRef();
  var state={component:owner.ndAniMain,source:source,clone:clone,key:key,fixtures:[]};owner._wallRunRuntime=state;
  owner.ndAniMain.skeletonData=clone;updateFixtures(owner,state,layout);
}
exports.apply=apply;exports.dispose=dispose;
