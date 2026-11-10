"use strict";

// Registered 2D door images. Opening changes the displayed sprite at time zero;
// no mesh deformation, projection, tween or scale animation is generated here.
var PREFIX="rts_wall_leaf_", SLOT=PREFIX+"pair", SKINS=["cq-rts-1","cq-rts-2","cq-rts-3"], STATES=["closed","inward","outward"], K=2/3;
var GENERATED=[];
["inward","outward"].forEach(function(direction){["open","shut"].forEach(function(action){GENERATED.push(action+"_"+direction,action+"_"+direction+"_night");});});
GENERATED.push("Fade_in_open_inward","Fade_in_open_outward");
function clone(value){return JSON.parse(JSON.stringify(value));}
function finite(value){return typeof value==="number"&&isFinite(value);}
function option(value,fallback){return value===undefined?fallback:value;}
function named(state){return "rts_door_"+state;}
function mapped(tier,image,point){return {x:tier.anchor.x+(tier.flipX?-1:1)*(point.x-image.anchorX)*tier.scale,y:tier.anchor.y+(image.anchorY-point.y)*tier.scale};}
function resolve(layout,metadata){
  var doors=metadata&&metadata.doors;
  if(!doors||doors.version!==2||!Array.isArray(doors.tiers)||doors.tiers.length!==3)throw Error("Three registered 2D door tiers are required.");
  if(!layout||!layout.left||!layout.right||![layout.left.x,layout.left.y,layout.right.x,layout.right.y].every(finite))throw Error("Registered doors need finite wall anchors.");
  var center={x:(layout.left.x+layout.right.x)/2,y:(layout.left.y+layout.right.y)/2};
  return doors.tiers.map(function(spec,index){
    if(!spec||!spec.states)throw Error("Closed, inward and outward sprites are required for every door tier.");
    var states={};
    STATES.forEach(function(key){
      var image=spec.states[key];
      if(!image||typeof image.path!=="string"||!image.path||![image.width,image.height,image.anchorX,image.anchorY].every(finite)||image.width<=0||image.height<=0||image.anchorX<0||image.anchorX>image.width||image.anchorY<0||image.anchorY>image.height)throw Error("A door sprite needs valid dimensions and its registered anchor: tier "+(index+1)+" "+key);
      states[key]=clone(image);
    });
    var reference=states.closed;
    STATES.forEach(function(key){var image=states[key];if(["width","height","anchorX","anchorY"].some(function(field){return image[field]!==reference[field];}))throw Error("All door states must retain one common crop and registration; do not trim or recenter states independently.");});
    var scale=spec.scale,plane=option(spec.planeOffset,10),offsetX=option(spec.offsetX,0),offsetY=option(spec.offsetY,0),inset=option(spec.postInset,6);
    if(![scale,plane,offsetX,offsetY,inset].every(finite)||scale<=0||inset<0)throw Error("A door tier needs one positive uniform sprite scale and valid hinge offsets.");
    var flipX=option(spec.flipX,true);if(typeof flipX!=="boolean")throw Error("Door sprite mirroring must be explicit.");
    var tier={level:index+1,states:states,scale:scale,flipX:flipX,anchor:{x:center.x+plane+offsetX,y:center.y+K*plane+offsetY},planeOffset:plane,offsetX:offsetX,offsetY:offsetY,postInset:inset};
    if(spec.hinges){
      if(!spec.hinges.left||!spec.hinges.right||![spec.hinges.left.x,spec.hinges.left.y,spec.hinges.right.x,spec.hinges.right.y].every(finite))throw Error("A registered door needs finite hinge positions.");
      tier.hinges=clone(spec.hinges);
      var expected={left:{x:layout.left.x+plane+inset+offsetX,y:layout.left.y+K*plane-K*inset+offsetY},right:{x:layout.right.x+plane-inset+offsetX,y:layout.right.y+K*plane+K*inset+offsetY}};
      ["left","right"].forEach(function(side){var point=mapped(tier,reference,spec.hinges[side]),target=expected[flipX?(side==="left"?"right":"left"):side];if(Math.abs(point.x-target.x)>.01||Math.abs(point.y-target.y)>.01)throw Error("This opening does not fit the registered door sprite without stretching. Use its native gate span.");});
      STATES.forEach(function(key){var image=states[key];if(image.hinges&&JSON.stringify(image.hinges)!==JSON.stringify(spec.hinges))throw Error("Door states must retain identical hinge registration.");});
    }
    if(spec.doorHeight!==undefined&&(!finite(spec.doorHeight)||spec.doorHeight<=0||spec.heightMax!==undefined&&(!finite(spec.heightMax)||spec.heightMax<=0||spec.doorHeight*scale>spec.heightMax+.01)))throw Error("Door artwork must remain below its wall pillar caps at the approved uniform scale.");
    return tier;
  });
}
function region(tier,key){
  var image=tier.states[key],sign=tier.flipX?-1:1;
  return {path:image.path,x:2*(tier.anchor.x+sign*(image.width/2-image.anchorX)*tier.scale),y:2*(tier.anchor.y+(image.anchorY-image.height/2)*tier.scale),width:image.width*tier.scale*2,height:image.height*tier.scale*2,scaleX:sign};
}
function clear(json){
  json.slots=json.slots.filter(function(slot){return slot.name.indexOf(PREFIX)!==0;});
  json.skins.forEach(function(skin){Object.keys(skin.attachments||{}).forEach(function(slot){if(slot.indexOf(PREFIX)===0)delete skin.attachments[slot];});});
  Object.keys(json.animations).forEach(function(key){
    if(GENERATED.indexOf(key)>=0){delete json.animations[key];return;}
    var clip=json.animations[key];
    if(clip.slots)Object.keys(clip.slots).forEach(function(slot){if(slot.indexOf(PREFIX)===0)delete clip.slots[slot];});
    if(clip.deform)Object.keys(clip.deform).forEach(function(skin){Object.keys(clip.deform[skin]).forEach(function(slot){if(slot.indexOf(PREFIX)===0)delete clip.deform[skin][slot];});});
  });
}
function target(key,reverse){
  if(key.indexOf("open")!==0&&key.indexOf("Fade_in_open_")!==0)return "closed";
  var inward=key.indexOf("inward")>=0;
  if(reverse)inward=!inward;
  return inward?"inward":"outward";
}
function tracks(json){
  var state=json.wallDoor;if(!state||!state.gate)return json;
  GENERATED.forEach(function(key){var base=key.indexOf("Fade_in_open_")===0?"Fade_in":key.indexOf("shut")===0?"shut":"open";if(key.indexOf("night")>=0)base+="_night";json.animations[key]=clone(json.animations[base]||{});});
  Object.keys(json.animations).forEach(function(key){
    var clip=json.animations[key],slots=clip.slots||(clip.slots={}),night=key.indexOf("night")>=0;
    var track={color:[{color:night?"a7a7a7ff":"ffffffff"}],attachment:[{time:0,name:named(target(key,state.reverse))}]};
    if(key==="Fade_in"||key.indexOf("Fade_in_open_")===0){track.color=[{color:"ffffffff",curve:.25,c3:.75},{time:.5,color:"a7a7a7ff"}];if(key==="Fade_in")delete track.attachment;}
    if(key==="destroy")track.attachment.push({time:.1667,name:null});
    slots[SLOT]=track;
  });
  return json;
}
function install(json,layout,metadata,options){
  if(!json||!Array.isArray(json.slots)||!Array.isArray(json.skins)||!json.animations||!Array.isArray(json.bones)||!json.bones.some(function(b){return b.name==="rts_wall_frame";}))throw Error("A detached Spine skeleton with the wall frame is required.");
  if(!layout||typeof layout.gate!=="boolean")throw Error("A valid wall layout is required for door sprites.");
  var enabled=layout.gate,tiers=enabled?resolve(layout,metadata):[];
  clear(json);json.wallDoor={version:2,gate:enabled,reverse:false,mirrorX:!!(options&&options.mirrorX),tiers:tiers};
  if(!enabled)return json;
  var at=json.slots.findIndex(function(slot){return slot.name.indexOf("rts_wall_part_")===0;});if(at<0)at=json.slots.length;
  // Regular wall posts mask the hinge joints; this slot adds no support posts.
  json.slots.splice(at,0,{name:SLOT,bone:"rts_wall_frame",attachment:named("closed")});
  tiers.forEach(function(tier,index){
    var skin=json.skins.find(function(s){return s.name===SKINS[index];});
    if(!skin){skin={name:SKINS[index],attachments:{}};json.skins.push(skin);}
    skin.attachments[SLOT]={};STATES.forEach(function(key){skin.attachments[SLOT][named(key)]=region(tier,key);});
  });
  return tracks(json);
}
function reverse(json){
  if(!json||!json.wallDoor)return json;
  var result=clone(json);result.wallDoor.reverse=!result.wallDoor.reverse;return tracks(result);
}
exports.install=install;exports.reverse=reverse;exports.resolve=resolve;exports.region=region;exports.mapPoint=mapped;exports.target=target;exports.generatedAnimations=GENERATED;exports.skins=SKINS;exports.slot=SLOT;exports.states=STATES;
