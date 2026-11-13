"use strict";
// Owned instance data only. No imported asset, scene file or player state changes.
var Kit=require("WallKit"),Adjustments=require("./WallAdjustments"),serial=0;
function live(value) {return !!value&&(!cc.isValid||cc.isValid(value,true));}
function liveComponent(component) {return live(component)&&live(component.node);}
function adjustmentTier(owner,index) {
  var row=typeof owner.getBranchCfg==="function"?owner.getBranchCfg(index):null;
  if(!row&&owner.buildCfg&&Array.isArray(owner.buildCfg.levelList))row=owner.buildCfg.levelList.find(function(value){return value.index===index;});
  if(!row&&index===undefined)row=owner.buildInfo&&owner.buildInfo.cfg;
  var tier=row&&row.level;return Number.isInteger(tier)&&tier>=1&&tier<=3?tier:1;
}
function endpoints(owner) {
  var main=owner.ndAniMain.node,points=[];
  (owner.ndAniOther||[]).forEach(function(s){
    var json=s.skeletonData&&s.skeletonData.skeletonJson;
    (json&&json.wallAnchors||[]).forEach(function(p){points.push(main.convertToNodeSpaceAR(s.node.convertToWorldSpaceAR(cc.v2(p.x,p.y))));});
  });return points;
}
function restoreFixtures(state) {
  (state.extraFixtures||[]).forEach(function(f){
    if(f.owner.colPoint&&f.uuid)delete f.owner.colPoint[f.uuid];
    if(!liveComponent(f.component))return;
    if(f.owner._stopColliderTween)f.owner._stopColliderTween(f.component);
    f.component.tag=0;f.component.enabled=false;if(f.component.destroy)f.component.destroy();
  });state.extraFixtures=[];
  (state.fixtures||[]).forEach(function(f){
    if(!liveComponent(f.component))return;
    f.component.tag=f.tag;f.component.points=f.points.map(function(p){return cc.v2(p.x,p.y);});f.component.enabled=f.enabled;
    if(f.owner.colPoint){if(f.cached)f.owner.colPoint[f.uuid]=f.cached;else delete f.owner.colPoint[f.uuid];}
    if(f.component.enabled&&f.component.node.activeInHierarchy!==false&&f.component.apply)f.component.apply();
  });state.fixtures=[];
  (state.triggers||[]).forEach(function(f){if(liveComponent(f.component))f.component.points=f.points.map(function(p){return cc.v2(p.x,p.y);});});state.triggers=[];
}
function savedTags(value) {
  if(!value)return [];var tags=JSON.parse(value);if(!Array.isArray(tags)||tags.some(function(row){return !Array.isArray(row)||row.some(function(tag){return !Number.isInteger(tag);});}))throw Error("Invalid saved wall collider tags.");return tags;
}
function updateFixtures(owner,state,layout) {
  restoreFixtures(state);
  var geometry=Kit.fixtures(layout),main=owner.ndAniMain.node,run=owner.wallRun?JSON.parse(owner.wallRun):null,tags=run&&run._fixtureTags||savedTags(owner.wallFixtureTags);
  function pointsFor(node,points,c){var offset=c.offset||{x:0,y:0};return points.map(function(p){var q=node.convertToNodeSpaceAR(main.convertToWorldSpaceAR(cc.v2(p.x,p.y)));return cc.v2(q.x-offset.x,q.y-offset.y);});}
  function update(node,polygons,group) {
    var originals=node.getComponents(cc.PhysicsPolygonCollider).filter(function(c){return !c._wallRunExtra;}),levels=new Map();
    originals.forEach(function(c,at){state.fixtures.push({component:c,owner:owner,uuid:c.uuid,cached:owner.colPoint&&owner.colPoint[c.uuid],tag:c.tag,points:c.points.map(function(p){return{x:p.x,y:p.y};}),enabled:c.enabled});var tag=tags[group]&&Number.isInteger(tags[group][at])?tags[group][at]:c.tag;if(!levels.has(tag))levels.set(tag,[]);levels.get(tag).push(c);});
    levels.forEach(function(list,tag){
      if(!(tag>0)||!polygons.length){list.forEach(function(c){c.enabled=false;c.tag=0;});return;}
      var prototype=list[0],enabled=prototype.enabled;
      for(var at=0;at<Math.max(list.length,polygons.length);at++){
        var c=list[at];
        if(!c){c=node.addComponent(cc.PhysicsPolygonCollider);c._wallRunExtra=true;c.enabled=false;state.extraFixtures.push({component:c,owner:owner,uuid:c.uuid});['density','sensor','friction','restitution'].forEach(function(key){if(prototype[key]!==undefined)c[key]=prototype[key];});var offset=prototype.offset||{x:0,y:0};c.offset=cc.v2(offset.x,offset.y);}
        if(at>=polygons.length){c.enabled=false;c.tag=0;continue;}
        c.tag=tag;c.points=pointsFor(node,polygons[at],c);if(owner.colPoint)owner.colPoint[c.uuid]=c.points.map(function(p){return cc.v2(p.x,p.y);});
        if(c._wallRunExtra)c.enabled=enabled;
        // Applying a disabled Creator collider can create a ghost Box2D fixture.
        if(c.enabled&&node.activeInHierarchy!==false&&c.apply)c.apply();
      }
    });
  }
  update(owner.node,geometry.root.length?[geometry.root]:[],0);
  (owner.ndAniOther||[]).forEach(function(s,i){var polygons=geometry.wingSegments&&geometry.wingSegments[i]||((geometry.wings[i]||[]).length?[geometry.wings[i]]:[]);update(s.node,polygons,i+1);});
  if(geometry.proximity&&geometry.proximity.length&&cc.PolygonCollider)owner.node.getComponents(cc.PolygonCollider).forEach(function(c){state.triggers.push({component:c,points:c.points.map(function(p){return{x:p.x,y:p.y};})});c.points=pointsFor(c.node,geometry.proximity,c);});
  owner._combatFootprints=null;
}
function dispose(owner) {
  var state=owner&&owner._wallRunRuntime;if(!state)return;
  if(owner._gateFacingRuntime)require("GateFacingRuntime").dispose(owner);
  restoreFixtures(state);
  (state.parts||[state]).forEach(function(part){
    if(liveComponent(part.component)&&part.component.skeletonData===part.clone)part.component.skeletonData=part.source;
    if(part.clone.decRef)part.clone.decRef();else if(part.clone.destroy)part.clone.destroy();
    if(part.source.decRef)part.source.decRef();
  });
  if(state.hadGateSetting)owner.wallHasGate=state.gateSetting;else delete owner.wallHasGate;
  delete owner._wallRunRuntime;
}
function frameToLocal(main,node) {
  function convert(x,y){return node.convertToNodeSpaceAR(main.convertToWorldSpaceAR(cc.v2(x,y)));}
  var origin=convert(0,0),x=convert(1,0),y=convert(0,1);
  return [x.x-origin.x,x.y-origin.y,y.x-origin.x,y.y-origin.y,origin.x,origin.y];
}
function mirrored(node) {
  var o=node.convertToWorldSpaceAR(cc.v2(0,0)),x=node.convertToWorldSpaceAR(cc.v2(1,0)),y=node.convertToWorldSpaceAR(cc.v2(0,1));
  return (x.x-o.x)*(y.y-o.y)-(x.y-o.y)*(y.x-o.x)<0;
}
function originalSource(prior,component) {
  var part=prior&&(prior.parts||[prior]).find(function(record){return record.component===component;});
  return part?part.source:component.skeletonData;
}
function makePart(component,source,json) {
  var clone=new sp.SkeletonData();clone.skeletonJson=json;clone.atlasText=source.atlasText;
  clone.textures=(source.textures||[]).slice();clone.textureNames=(source.textureNames||[]).slice();clone.scale=source.scale;
  clone.name=(source.name||"Wall")+" modular";clone._uuid=(source._uuid||"wall")+"@run:"+(++serial);
  try{if(clone.getRuntimeData&&!clone.getRuntimeData())throw Error("The modular wall could not be parsed.");}
  catch(error){if(clone.destroy)clone.destroy();throw error;}
  return {component:component,source:source,clone:clone};
}
function apply(owner,index) {
  if(!owner||!owner.ndAniMain||!owner.ndAniMain.skeletonData)return;
  var prior=owner._wallRunRuntime,source=prior?prior.source:owner.ndAniMain.skeletonData,json=source.skeletonJson;
  if(!json||!json.wallKit)return;
  var run=owner.wallRun?JSON.parse(owner.wallRun):null,layout=Kit.layout(run,endpoints(owner)),down=owner.ndAniDown,downSource=down&&down.skeletonData&&originalSource(prior,down);
  var paired=downSource&&downSource.skeletonJson&&downSource.skeletonJson.wallGate,transform=paired?frameToLocal(owner.ndAniMain.node,down.node):null,mirrorX=mirrored(owner.ndAniMain.node);
  var adjustmentData=Adjustments.getData(),tier=adjustmentTier(owner,index),keyParts=[layout,transform,mirrorX];
  // With no saved visual adjustments, retain the exact legacy instance key.
  // A tuned tier must own its draw-order clips because Spine shares timelines
  // across skins. Refitting that instance never edits the imported source.
  if(Adjustments.hasData(adjustmentData))keyParts.push(tier,owner.wallFacing||null,Adjustments.revision(adjustmentData));
  var key=JSON.stringify(keyParts);
  if(prior&&prior.key===key)return;
  var parts=[];
  try{
    parts.push(makePart(owner.ndAniMain,source,Kit.install(json,layout,undefined,{mirrorX:mirrorX,tier:tier,face:owner.wallFacing,adjustmentsData:adjustmentData})));
    if(paired)parts.push(makePart(down,downSource,(Kit.fitGatePart||Kit.fitOriginalGate)(downSource.skeletonJson,layout,{frameToLocal:transform})));
  }catch(error){parts.forEach(function(part){if(part.clone.destroy)part.clone.destroy();});throw error;}
  if(prior)dispose(owner);
  parts.forEach(function(part){if(part.source.addRef)part.source.addRef();if(part.clone.addRef)part.clone.addRef();part.component.skeletonData=part.clone;});
  var state={component:parts[0].component,source:parts[0].source,clone:parts[0].clone,key:key,parts:parts,fixtures:[],triggers:[],extraFixtures:[],hadGateSetting:Object.prototype.hasOwnProperty.call(owner,"wallHasGate"),gateSetting:owner.wallHasGate};owner._wallRunRuntime=state;owner.wallHasGate=layout.gate;
  try{updateFixtures(owner,state,layout);}catch(error){dispose(owner);throw error;}
}
exports.apply=apply;exports.dispose=dispose;
