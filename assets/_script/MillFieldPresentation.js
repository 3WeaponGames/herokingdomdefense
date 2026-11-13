"use strict";

function worldPoint(source, bone, x, y) {
  return source.node.convertToWorldSpaceAR(cc.v2(bone.worldX + bone.a*x + bone.b*y, bone.worldY + bone.c*x + bone.d*y));
}
function color(hex) {
  return [0,2,4,6].map(function (at) { return parseInt(hex.substr(at,2),16)/255; });
}
// Use the crop's authored destroy color keys rather than a separate invented
// timing. Live create/upgrade/night animations remain on the original rig.
function deathKeys(source, slot) {
  var json=source.skeletonData && source.skeletonData.skeletonJson;
  var timeline=json && json.animations.destroy.slots[slot.data.name];
  return timeline && timeline.color || [{color:"a7a7a7f0",curve:"stepped"},{time:.1667,color:"ffffff00"}];
}
function deathDuration(field) {
  var keys=field.deathKeys;
  for(var i=0;i<keys.length;i++)if(color(keys[i].color)[3]===0)return keys[i].time||0;
  return .1667;
}
function deathColor(field, time) {
  var keys=field.deathKeys, key=keys[0], next=null;
  for(var i=1;i<keys.length;i++){if((keys[i].time||0)>time){next=keys[i];break;}key=keys[i];}
  var value=color(key.color);
  if(next && key.curve!=="stepped") {
    var progress=(time-(key.time||0))/((next.time||0)-(key.time||0)), end=color(next.color);
    value=value.map(function(v,index){return v+(end[index]-v)*progress;});
  }
  return value;
}
function health(runtime, field) {
  var template=runtime.owner.ctrHp;
  if(!field.health && template && cc.isValid(template.node,true) && cc.instantiate) {
    var node=cc.instantiate(template.node);node.name="Crop health";node.setParent(runtime.game.ndUI);
    node.setScale(template.node.scaleX*.65,template.node.scaleY*.65);
    field.health=node.getComponent(template.constructor);
    if(!field.health){node.destroy();return;}
    field.health.actor=null;
    field.health.setType(1);
  }
  if(!field.health)return;
  var attachment=field.attachment;
  var world=worldPoint(runtime.owner.ndAniDown,field.slot.bone,attachment.x,attachment.y-155);
  field.health.node.setPosition(runtime.game.ndUI.convertToNodeSpaceAR(world));
  field.health.setHp(field.hp,field.hpMax);
  if(!runtime.fighting || !runtime.owner.getIsWork())field.health.node.active=false;
}
function sync(runtime,field) {
  if(field.hp<=0) {
    var age=field.deathTime===undefined?deathDuration(field):field.deathTime;
    var ruined=age>=deathDuration(field);
    field.slot.setAttachment(ruined?field.ruinsAttachment:field.attachment);
    var c=ruined?[1,1,1,1]:deathColor(field,age);
    field.slot.color.set(c[0],c[1],c[2],c[3]);
    if(field.addon)field.addon.color.a=0;
  } else if(field.addon) field.addon.color.a=field.slot.getAttachment()?field.slot.color.a:0;
  health(runtime,field);
}
function destroy(runtime,field) {
  // The standard mill destroy clip includes the game's existing smoke frames.
  // A short-lived render-only copy plays just that slot at this crop. It shares
  // the original SkeletonData and never clones gameplay/colliders or textures.
  var source=runtime.owner.ndAniMain;
  if(typeof sp==="undefined" || !source || !source.skeletonData || !source._skeleton)return;
  var original=source._skeleton.findSlot("Smoke_04_00034");if(!original)return;
  var node=new cc.Node("Crop destruction smoke");node.setParent(source.node.parent);
  node.setPosition(source.node.position);node.setScale(source.node.scaleX,source.node.scaleY);node.angle=source.node.angle;
  node.group=source.node.group;node._depthGroundVisual=true;
  var visual=node.addComponent(sp.Skeleton);visual.skeletonData=source.skeletonData;
  visual.premultipliedAlpha=source.premultipliedAlpha;visual.setSkin(source._skeleton.skin.name);visual.setToSetupPose();
  var slot=visual.findSlot("Smoke_04_00034");visual._skeleton.updateWorldTransform();
  var desired=worldPoint(runtime.owner.ndAniDown,field.slot.bone,field.attachment.x,field.attachment.y-45);
  var actual=node.convertToWorldSpaceAR(cc.v2(slot.bone.worldX,slot.bone.worldY));
  desired=node.parent.convertToNodeSpaceAR(desired);actual=node.parent.convertToNodeSpaceAR(actual);
  node.x+=desired.x-actual.x;node.y+=desired.y-actual.y;
  visual.setSlotsRange(slot.data.index,slot.data.index);visual.timeScale=source.timeScale;
  visual.setAnimation(0,"destroy",false);
  runtime.effects.push({node:node,age:0,duration:1.3,native:true});
}
function clear(field) {
  if(field.health){field.health.node.active=false;field.health.node.destroy();field.health=null;}
}
exports.worldPoint=worldPoint;
exports.deathKeys=deathKeys;
exports.deathDuration=deathDuration;
exports.sync=sync;
exports.destroy=destroy;
exports.clear=clear;
